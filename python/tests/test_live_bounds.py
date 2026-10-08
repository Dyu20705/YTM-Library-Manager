import importlib.util
import contextlib
import io
from pathlib import Path
import unittest
from unittest.mock import patch
import requests

spec = importlib.util.spec_from_file_location('qualification', Path(__file__).parents[1] / 'live_qualification.py')
live = importlib.util.module_from_spec(spec)
spec.loader.exec_module(live)


def response(status=200, content_type='application/json', body=b'{}'):
    value = requests.Response()
    value.status_code = status
    value.headers['content-type'] = content_type
    value._content = body
    return value


def read_request():
    return requests.Request('POST', 'https://music.youtube.com/youtubei/v1/browse').prepare()


class BoundsTests(unittest.TestCase):
    def test_budget_shared_across_all_calls_and_never_retried(self):
        with live.BoundedSession(2, 10) as session, patch('requests.Session.send', return_value=response()) as send:
            session.send(read_request())
            session.send(read_request())
            with self.assertRaises(live.QualificationStopped): session.send(read_request())
            self.assertEqual(send.call_count, 2)
            self.assertEqual(session.request_count, 2)

    def test_mutation_and_foreign_host_are_blocked_before_dispatch(self):
        for url in ['https://music.youtube.com/youtubei/v1/like/like', 'https://attacker.example/', 'http://music.youtube.com/']:
            with live.BoundedSession(20, 10) as session, patch('requests.Session.send') as send:
                request = requests.Request('POST', url).prepare()
                with self.assertRaises(live.QualificationStopped): session.send(request)
                send.assert_not_called()

    def test_errors_and_challenges_latch_stop_without_retry(self):
        for value in [response(401), response(403), response(429), response(302), response(200, 'text/html'), response(body=b'{"error": {}}')]:
            # Any nonempty error object is an error; even an empty error key is suspicious.
            with live.BoundedSession(20, 10) as session, patch('requests.Session.send', return_value=value) as send:
                with self.assertRaises(live.QualificationStopped): session.send(read_request())
                with self.assertRaises(live.QualificationStopped): session.send(read_request())
                self.assertEqual(send.call_count, 1)

    def test_total_deadline_enforced_before_and_after_dispatch(self):
        now = [0]
        session = live.BoundedSession(20, 1, clock=lambda: now[0])
        now[0] = 2
        with patch('requests.Session.send') as send:
            with self.assertRaises(live.QualificationStopped): session.send(read_request())
            send.assert_not_called()
        session.close()

    def test_small_explicit_scope_is_required_before_client_creation(self):
        for plan in [{}, {'playlists': [], 'maxRequests': 999, 'maxItems': 100, 'deadlineSeconds': 180}]:
            with self.assertRaises(ValueError): live.validate_plan(plan)

    def test_worker_main_suppresses_dependency_console_and_exception_secrets(self):
        def fake_qualify(*args):
            print('synthetic-secret')
            print('synthetic-secret', file=__import__('sys').stderr)
            raise ValueError('synthetic-secret')
        with patch('sys.stdin', io.StringIO('{"authFile":"synthetic-path", "plan":{}}')), patch.object(live, 'qualify', fake_qualify), contextlib.redirect_stdout(io.StringIO()) as output, contextlib.redirect_stderr(io.StringIO()) as errors:
            self.assertEqual(live.main(), 1)
        self.assertNotIn('synthetic-secret', output.getvalue() + errors.getvalue())
        self.assertIn('STOPPED', output.getvalue())

    def test_redirects_and_tls_relaxation_are_never_allowed(self):
        with live.BoundedSession(20, 10) as session, patch('requests.Session.send') as send:
            with self.assertRaises(live.QualificationStopped): session.send(read_request(), verify=False)
            send.assert_not_called()


if __name__ == '__main__': unittest.main()
