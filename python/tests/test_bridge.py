import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("bridge", pathlib.Path(__file__).parents[1] / "ytm_bridge.py")
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class BridgeSnapshotTests(unittest.TestCase):
    def test_uses_public_unlimited_snapshot_api(self):
        class Client:
            def get_playlist(self, playlist_id, limit):
                self.received = (playlist_id, limit)
                return {"tracks": list(range(501)), "trackCount": 501}
        client = Client()
        result = bridge.get_playlist_with_pagination(client, "PL", limit=100)
        self.assertEqual(client.received, ("PL", None))
        self.assertEqual(len(result["tracks"]), 501)
        self.assertEqual(result["expectedItemCount"], 501)
        self.assertIsNone(result["nextCursor"])

    def test_rejects_a_truncated_snapshot(self):
        class Client:
            def get_playlist(self, *_args, **_kwargs):
                return {"tracks": [1], "trackCount": 501}
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            bridge.get_playlist_with_pagination(Client(), "PL")

    def test_missing_configured_auth_cannot_fall_back_to_anonymous(self):
        with self.assertRaises(FileNotFoundError):
            bridge.get_ytmusic_client("/missing-private-auth.json")


if __name__ == "__main__":
    unittest.main()
