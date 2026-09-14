#!/usr/bin/env python3
"""
Python bridge for ytmusicapi integration (Gate-01 candidate: 1.12.2).
Accepts JSON commands via stdin or CLI arguments and outputs sanitized JSON to stdout.
"""

import sys
import json
import os
from typing import Any, Dict, Optional, Tuple

def get_ytmusic_client(auth_file: str | None = None):
    from ytmusicapi import YTMusic
    if auth_file and os.path.exists(auth_file):
        return YTMusic(auth_file)
    return YTMusic()

def safe_get_continuation_token(items: list) -> Optional[str]:
    if not items:
        return None
    try:
        from ytmusicapi.continuations import get_continuation_token
        return get_continuation_token(items)
    except Exception:
        return None

def normalize_exception(e: Exception) -> Tuple[str, str, Optional[int]]:
    """
    Classify exception into (RemoteErrorCode, message, retryAfterSeconds).
    """
    import requests
    from ytmusicapi.exceptions import YTMusicServerError

    msg = str(e)
    lower_msg = msg.lower()

    if "429" in msg or "rate" in lower_msg or "quota" in lower_msg:
        return "RATE_LIMITED", msg, 30

    if "401" in msg or "unauthorized" in lower_msg or "login" in lower_msg or "cookie" in lower_msg:
        return "AUTH_EXPIRED", msg, None

    if "403" in msg or "forbidden" in lower_msg or "permission" in lower_msg:
        return "PERMISSION_DENIED", msg, None

    if isinstance(e, (requests.exceptions.ConnectionError, requests.exceptions.Timeout)):
        return "NETWORK_UNAVAILABLE", msg, None

    if isinstance(e, YTMusicServerError) or "500" in msg or "502" in msg or "503" in msg:
        return "REMOTE_UNAVAILABLE", msg, None

    return "INVALID_REQUEST", msg, None

def get_playlist_with_pagination(yt, playlist_id: str, limit: Optional[int] = 100, cursor: Optional[str] = None) -> Dict[str, Any]:
    from ytmusicapi.navigation import nav
    from ytmusicapi.mixins.playlists import TWO_COLUMN_RENDERER, SECTION, CONTENT
    from ytmusicapi.parsers.playlists import parse_playlist_items
    from ytmusicapi.continuations import CONTINUATION_ITEMS

    if cursor:
        response = yt._send_request("browse", {"continuation": cursor})
        continuation_items = nav(response, CONTINUATION_ITEMS, True) or []
        tracks = parse_playlist_items(continuation_items) if continuation_items else []
        next_cursor = safe_get_continuation_token(continuation_items)
        return {"tracks": tracks, "nextCursor": next_cursor}

    # First page without cursor
    browseId = "VL" + playlist_id if not playlist_id.startswith("VL") else playlist_id
    endpoint = "browse"
    response = yt._send_request(endpoint, {"browseId": browseId})

    section_list = nav(response, [*TWO_COLUMN_RENDERER, "secondaryContents", *SECTION], True)
    if not section_list:
        pl = yt.get_playlist(playlist_id, limit=limit)
        return {"tracks": pl.get("tracks", []), "nextCursor": None}

    content_data = nav(section_list, [*CONTENT, "musicPlaylistShelfRenderer"], True)
    if not content_data or "contents" not in content_data:
        return {"tracks": [], "nextCursor": None}

    contents = content_data["contents"]
    tracks = parse_playlist_items(contents)
    next_cursor = safe_get_continuation_token(contents)

    # If caller specified a limit greater than first page and continuation exists, follow it
    if limit is not None and len(tracks) < limit and next_cursor:
        while next_cursor and len(tracks) < limit:
            cont_res = yt._send_request("browse", {"continuation": next_cursor})
            cont_items = nav(cont_res, CONTINUATION_ITEMS, True) or []
            if not cont_items:
                next_cursor = None
                break
            batch = parse_playlist_items(cont_items)
            if not batch:
                next_cursor = None
                break
            tracks.extend(batch)
            next_cursor = safe_get_continuation_token(cont_items)

    return {"tracks": tracks, "nextCursor": next_cursor}

def execute_command(cmd: str, args: Dict[str, Any], auth_file: str | None = None) -> Dict[str, Any]:
    if cmd == "ping":
        import ytmusicapi
        return {"status": "ok", "version": getattr(ytmusicapi, "__version__", "1.12.2")}

    yt = get_ytmusic_client(auth_file)

    if cmd == "get_library_playlists":
        playlists = yt.get_library_playlists(limit=args.get("limit", 100))
        return {"status": "success", "data": playlists}

    elif cmd == "get_playlist":
        playlist_id = args["playlistId"]
        limit = args.get("limit", 100)
        cursor = args.get("cursor")
        data = get_playlist_with_pagination(yt, playlist_id, limit=limit, cursor=cursor)
        return {"status": "success", "data": data}

    elif cmd == "get_library_songs":
        limit = args.get("limit", 100)
        songs = yt.get_library_songs(limit=limit)
        return {"status": "success", "data": songs}

    elif cmd == "resolve_feedback_tokens":
        video_id = args["videoId"]
        watch_res = yt.get_watch_playlist(videoId=video_id, limit=1)
        tracks = watch_res.get("tracks", []) or []
        tokens = None
        for t in tracks:
            if t.get("videoId") == video_id and t.get("feedbackTokens"):
                tokens = t["feedbackTokens"]
                break
        if not tokens and tracks and tracks[0].get("feedbackTokens"):
            tokens = tracks[0]["feedbackTokens"]
        return {"status": "success", "data": tokens}

    elif cmd == "add_playlist_items":
        playlist_id = args["playlistId"]
        video_ids = args["videoIds"]
        res = yt.add_playlist_items(playlist_id, video_ids, duplicates=args.get("duplicates", False))
        return {"status": "success", "data": res}

    elif cmd == "remove_playlist_items":
        playlist_id = args["playlistId"]
        items = args["items"]  # list of dicts with videoId and setVideoId
        res = yt.remove_playlist_items(playlist_id, items)
        return {"status": "success", "data": res}

    elif cmd == "move_playlist_item":
        playlist_id = args["playlistId"]
        item_remote_id = args["itemRemoteId"]
        successor_remote_id = args.get("successorRemoteId")
        if successor_remote_id:
            move_param = (item_remote_id, successor_remote_id)
        else:
            move_param = item_remote_id
        res = yt.edit_playlist(playlist_id, moveItem=move_param)
        return {"status": "success", "data": res}

    elif cmd == "rate_song":
        video_id = args["videoId"]
        rating = args["rating"]  # LIKE, DISLIKE, INDIFFERENT
        res = yt.rate_song(video_id, rating)
        return {"status": "success", "data": res}

    elif cmd == "edit_song_library_status":
        feedback_tokens = args.get("feedbackTokens", [])
        res = yt.edit_song_library_status(feedback_tokens)
        return {"status": "success", "data": res}

    else:
        return {"status": "error", "code": "INVALID_REQUEST", "message": f"Unknown command: {cmd}"}

def main():
    if len(sys.argv) > 1:
        req_str = sys.argv[1]
    else:
        req_str = sys.stdin.read()

    if not req_str.strip():
        print(json.dumps({"status": "error", "code": "INVALID_REQUEST", "message": "Empty request"}))
        sys.exit(1)

    try:
        req = json.loads(req_str)
        cmd = req.get("command")
        args = req.get("args", {})
        auth_file = req.get("authFile")
        result = execute_command(cmd, args, auth_file)
        if result.get("status") == "error":
            print(json.dumps(result))
            sys.exit(1)
        print(json.dumps(result))
    except Exception as e:
        code, msg, retry_after = normalize_exception(e)
        err_payload = {
            "status": "error",
            "code": code,
            "message": msg,
            "type": type(e).__name__
        }
        if retry_after is not None:
            err_payload["retryAfterSeconds"] = retry_after
        print(json.dumps(err_payload))
        sys.exit(1)

if __name__ == "__main__":
    main()
