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
    if auth_file:
        if not os.path.isfile(auth_file):
            raise FileNotFoundError("Configured authentication file is unavailable")
        return YTMusic(auth_file)
    return YTMusic()

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

def get_playlist_with_pagination(yt, playlist_id: str, limit=None, cursor=None) -> Dict[str, Any]:
    # The pinned public API follows all continuations when limit=None. Do not
    # use private renderer paths or treat a truncated first page as a snapshot.
    if cursor is not None:
        raise ValueError("This bridge returns a complete snapshot; cursors are unsupported")
    playlist = yt.get_playlist(playlist_id, limit=None)
    tracks = playlist["tracks"]
    count = playlist.get("trackCount")
    if isinstance(count, int) and len(tracks) != count:
        raise ValueError("Incomplete or changing playlist snapshot; retry sync")
    return {"tracks": tracks, "nextCursor": None, "expectedItemCount": count if isinstance(count, int) else None}

def execute_command(cmd: str, args: Dict[str, Any], auth_file: str | None = None) -> Dict[str, Any]:
    if cmd == "ping":
        import ytmusicapi
        return {"status": "ok", "version": getattr(ytmusicapi, "__version__", "1.12.2")}

    yt = get_ytmusic_client(auth_file)

    if cmd == "get_library_playlists":
        playlists = yt.get_library_playlists(limit=args.get("limit"))
        return {"status": "success", "data": playlists}

    elif cmd == "get_playlist":
        playlist_id = args["playlistId"]
        limit = args.get("limit")
        cursor = args.get("cursor")
        data = get_playlist_with_pagination(yt, playlist_id, limit=limit, cursor=cursor)
        return {"status": "success", "data": data}

    elif cmd == "get_library_songs":
        limit = args.get("limit")
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
    # Requests (including feedback tokens and auth paths) never travel in argv.
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
        code, _, retry_after = normalize_exception(e)
        err_payload = {
            "status": "error",
            "code": code,
            "message": "Remote request failed",
            "type": type(e).__name__
        }
        if retry_after is not None:
            err_payload["retryAfterSeconds"] = retry_after
        print(json.dumps(err_payload))
        sys.exit(1)

if __name__ == "__main__":
    main()
