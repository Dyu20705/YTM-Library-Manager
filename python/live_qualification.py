"""Bounded owner-local reads in ONE process/session; no full sync or mutation API."""
import json
import contextlib
import os
import sys
import time
from urllib.parse import urlsplit
import requests
from requests.adapters import HTTPAdapter


class QualificationStopped(Exception):
    pass


class BoundedSession(requests.Session):
    def __init__(self, max_requests, deadline_seconds, clock=time.monotonic):
        super().__init__()
        self.clock = clock
        self.deadline = clock() + deadline_seconds
        self.max_requests = max_requests
        self.request_count = 0
        self.stopped = False
        # No urllib3 retries, including connection failures and status retries.
        self.mount('https://', HTTPAdapter(max_retries=0))

    def request(self, method, url, **kwargs):
        kwargs['allow_redirects'] = False
        return super().request(method, url, **kwargs)

    def send(self, request, **kwargs):
        url = urlsplit(request.url)
        allowed = (url.scheme == 'https' and url.hostname == 'music.youtube.com' and
                   url.port in (None, 443) and not url.username and not url.password and
                   ((request.method == 'GET' and url.path == '/') or
                    (request.method == 'POST' and url.path == '/youtubei/v1/browse')))
        remaining = self.deadline - self.clock()
        if self.stopped or not allowed or self.request_count >= self.max_requests or remaining <= 0:
            self.stopped = True
            raise QualificationStopped('Remote read budget or scope exhausted')
        verification = kwargs.get('verify', True)
        if not (verification is True or (isinstance(verification, str) and verification)):
            self.stopped = True
            raise QualificationStopped('TLS verification required')
        self.request_count += 1
        kwargs['timeout'] = min(10, remaining)
        kwargs['allow_redirects'] = False
        kwargs['stream'] = False
        try:
            response = super().send(request, **kwargs)
            if self.clock() >= self.deadline or response.status_code != 200:
                raise QualificationStopped('Remote status, redirect, or deadline requires stop')
            content_type = response.headers.get('content-type', '').lower()
            if request.method == 'POST':
                if 'application/json' not in content_type:
                    raise QualificationStopped('Authentication challenge or unexpected response')
                data = response.json()
                if not isinstance(data, dict) or 'error' in data or 'onResponseReceivedActions' in data:
                    raise QualificationStopped('Remote error or challenge')
            return response
        except Exception:
            self.stopped = True
            raise QualificationStopped('Remote qualification stopped') from None


def validate_plan(plan):
    playlists = plan.get('playlists')
    if not isinstance(playlists, list) or not 1 <= len(playlists) <= 3:
        raise ValueError('Select one to three existing playlists')
    for name, ceiling in [('maxRequests', 20), ('maxItems', 100), ('deadlineSeconds', 180)]:
        if type(plan.get(name)) is not int or not 1 <= plan[name] <= ceiling:
            raise ValueError('Explicit bounded limits required')
    ids = set()
    for item in playlists:
        if not isinstance(item.get('id'), str) or not item['id'] or item['id'] == 'LM' or item['id'] in ids:
            raise ValueError('Invalid selected playlist scope')
        ids.add(item['id'])
        if type(item.get('expectedCount')) is not int or not 0 <= item['expectedCount'] <= plan['maxItems']:
            raise ValueError('Independent expected count required')
    for name in ['libraryCount', 'likesCount']:
        if type(plan.get(name)) is not int or not 0 <= plan[name] <= plan['maxItems']:
            raise ValueError('Independent membership counts required')
    return plan


def qualify(auth_file, plan):
    from ytmusicapi import YTMusic
    plan = validate_plan(plan)
    with BoundedSession(plan['maxRequests'], plan['deadlineSeconds']) as session:
        client = YTMusic(auth_file, requests_session=session)
        counts = []
        for item in [*plan['playlists'], {'id': 'LM', 'expectedCount': plan['likesCount']}]:
            snapshot = client.get_playlist(item['id'], limit=plan['maxItems'] + 1)
            tracks = snapshot['tracks']
            if len(tracks) > plan['maxItems'] or len(tracks) != item['expectedCount'] or snapshot.get('trackCount') != item['expectedCount']:
                raise QualificationStopped('Selected snapshot count mismatch')
            if any(not track.get('videoId') for track in tracks):
                raise QualificationStopped('Unsupported track')
            if item['id'] != 'LM':
                occurrences = [track.get('setVideoId') for track in tracks]
                if not all(occurrences) or len(set(occurrences)) != len(occurrences):
                    raise QualificationStopped('Occurrence identity mismatch')
                counts.append(len(tracks))
        # validate_responses can retry; keep it off for this no-retry bounded sample.
        songs = client.get_library_songs(limit=plan['maxItems'] + 1, validate_responses=False)
        if len(songs) > plan['maxItems'] or len(songs) != plan['libraryCount']:
            raise QualificationStopped('Library sample count mismatch')
        return {'check': 'bounded-live-read', 'status': 'READ_COUNTS_MATCH', 'requests': session.request_count,
                'playlistCounts': counts, 'librarySongs': len(songs), 'likedSongs': plan['likesCount'],
                'membershipPromoted': False, 'identityVerified': False, 'orderVerified': False, 'mutationsRun': 0}


def main():
    try:
        request = json.load(sys.stdin)
        with open(os.devnull, 'w') as quiet, contextlib.redirect_stdout(quiet), contextlib.redirect_stderr(quiet):
            result = qualify(request['authFile'], request['plan'])
        print(json.dumps(result))
        return 0
    except (Exception, KeyboardInterrupt):
        print(json.dumps({'check': 'bounded-live-read', 'status': 'STOPPED', 'mutationsRun': 0}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
