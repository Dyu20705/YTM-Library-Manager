#!/usr/bin/env python3
"""
Python bridge for ytmusicapi integration (Gate-01 candidate: 1.12.2).
Accepts JSON commands via stdin or CLI arguments and outputs sanitized JSON to stdout.
"""

import sys
import json
import os
from typing import Any, Dict

def get_ytmusic_client(auth_file: str | None = None):
    from ytmusicapi import YTMusic
    if auth_file and os.path.exists(auth_file):
        return YTMusic(auth_file)
    return YTMusic()

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
        playlist = yt.get_playlist(playlist_id, limit=limit)
        return {"status": "success", "data": playlist}

    elif cmd == "get_library_songs":
        limit = args.get("limit", 100)
        songs = yt.get_library_songs(limit=limit)
        return {"status": "success", "data": songs}

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
        return {"status": "error", "message": f"Unknown command: {cmd}"}

def main():
    if len(sys.argv) > 1:
        req_str = sys.argv[1]
    else:
        req_str = sys.stdin.read()

    if not req_str.strip():
        print(json.dumps({"status": "error", "message": "Empty request"}))
        sys.exit(1)

    try:
        req = json.loads(req_str)
        cmd = req.get("command")
        args = req.get("args", {})
        auth_file = req.get("authFile")
        result = execute_command(cmd, args, auth_file)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e), "type": type(e).__name__}))
        sys.exit(1)

if __name__ == "__main__":
    main()
