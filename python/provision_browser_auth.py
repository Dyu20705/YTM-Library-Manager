"""Owner-only local provisioning. Never invoke from an agent, CI or recorded terminal."""
import contextlib
import getpass
import io
import os
from pathlib import Path
import stat
import subprocess
import sys
import warnings


def validate_destination(destination):
    target = Path(destination)
    if not target.is_absolute() or not target.parent.is_dir():
        raise ValueError('Private absolute destination required')
    repo = Path(__file__).resolve().parents[1]
    if target.is_relative_to(repo) or target.exists():
        raise ValueError('Destination must be new and outside checkout')
    for ancestor in (target.parent, *target.parent.parents):
        info = ancestor.lstat()
        if ancestor.is_symlink() or getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0):
            raise ValueError('Linked storage is forbidden')
    if os.name != 'nt':
        info = target.parent.stat()
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise ValueError('Private owner-only directory required')
    else:
        # Metadata only; reject broad Allow ACLs before collecting input or writing a file.
        script = """
$ErrorActionPreference = 'Stop'
try {
 $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 $acl = Get-Acl -LiteralPath $env:YTM_PROVISION_DIRECTORY
 if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid) { exit 1 }
 foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
  if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($sid, 'S-1-5-18')) { exit 1 }
 }
 exit 0
} catch { exit 1 }
"""
        env = {**os.environ, 'YTM_PROVISION_DIRECTORY': str(target.parent)}
        result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script],
                                env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        if result.returncode != 0:
            raise ValueError('Private owner-only directory ACL required')
    return target


def provision(destination, headers_raw):
    target = validate_destination(destination)
    from ytmusicapi import setup
    # Avoid dependency console entrypoint and any dependency print/traceback.
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        result = setup(filepath=None, headers_raw=headers_raw)
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write(result)
    except BaseException:
        target.unlink(missing_ok=True)
        raise
    # Do not return auth JSON to sys.exit, console or callers.


def main():
    try:
        if not sys.stdin.isatty() or not sys.stdout.isatty() or not sys.stderr.isatty():
            raise ValueError('Private interactive terminal required')
        target = validate_destination(os.environ.get('YTM_AUTH_FILE', ''))
        print('Owner-only input: enter one header line at a time; blank line finishes. Input is hidden.')
        lines = []
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)  # Never fall back to echoed input.
            while True:
                line = getpass.getpass('Header (hidden): ')
                if not line:
                    break
                lines.append(line)
        provision(target, '\n'.join(lines))
        print('Credential file created. Review file permissions locally; do not share it.')
        return 0
    except (Exception, KeyboardInterrupt):
        print('Credential provisioning stopped; review private storage and input locally.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
