import contextlib
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('provision', Path(__file__).parents[1] / 'provision_browser_auth.py')
provision = importlib.util.module_from_spec(spec)
spec.loader.exec_module(provision)


class ProvisioningTests(unittest.TestCase):
    def test_synthetic_auth_is_not_returned_or_printed_and_does_not_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            os.chmod(directory, 0o700)
            if os.name == 'nt':
                script = "$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value; icacls.exe $env:YTM_TEST_DIRECTORY /setowner ('*' + $sid) | Out-Null; if ($LASTEXITCODE -ne 0) { exit 1 }; icacls.exe $env:YTM_TEST_DIRECTORY /inheritance:r /grant:r ('*' + $sid + ':(OI)(CI)F') | Out-Null; exit $LASTEXITCODE"
                subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script],
                               env={**os.environ, 'YTM_TEST_DIRECTORY': directory}, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            target = Path(directory) / 'browser.json'
            output, errors = io.StringIO(), io.StringIO()
            def fake_setup(**kwargs):
                self.assertIsNone(kwargs['filepath'])
                print('synthetic-secret')
                print('synthetic-secret', file=__import__('sys').stderr)
                return '{"cookie":"synthetic-secret"}'
            with patch('ytmusicapi.setup', fake_setup), contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
                self.assertIsNone(provision.provision(target, 'cookie: synthetic-secret'))
            self.assertNotIn('synthetic-secret', output.getvalue() + errors.getvalue())
            self.assertTrue(target.is_file())
            if os.name != 'nt': self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(ValueError): provision.provision(target, 'ignored')

    def test_noninteractive_entrypoint_does_not_collect_auth(self):
        with patch('sys.stdin.isatty', return_value=False), patch('getpass.getpass') as prompt, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(provision.main(), 1)
            prompt.assert_not_called()

    def test_error_output_does_not_include_dependency_exception(self):
        with patch('sys.stdin.isatty', return_value=True), patch('sys.stdout.isatty', return_value=True), patch('sys.stderr.isatty', return_value=True), patch.object(provision, 'validate_destination', side_effect=ValueError('synthetic-secret')), contextlib.redirect_stderr(io.StringIO()) as output:
            self.assertEqual(provision.main(), 1)
            self.assertNotIn('synthetic-secret', output.getvalue())
