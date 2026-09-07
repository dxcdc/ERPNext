import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "extractor"))
from core_orders import CoreOrdersError
from sync_core_pending import sync_core_pending


class CorePendingSyncTests(unittest.TestCase):
    @patch("sync_core_pending.CoreOrdersClient")
    @patch("sync_core_pending.Common")
    def test_failed_collection_never_calls_write_endpoint(self, common, client):
        api = common.return_value
        api.erp_request.return_value = Mock(status_code=200, json=Mock(return_value={"data": {}}))
        client.return_value.fetch_snapshot.side_effect = CoreOrdersError("partial page")
        with self.assertRaises(CoreOrdersError):
            sync_core_pending()
        self.assertEqual(api.erp_request.call_count, 1)
        self.assertEqual(api.erp_request.call_args.args[0], "GET")

    @patch("sync_core_pending.CoreOrdersClient")
    @patch("sync_core_pending.Common")
    def test_unchanged_snapshot_does_not_advance_freshness(self, common, client):
        api = common.return_value
        api.erp_request.return_value = Mock(status_code=200, json=Mock(return_value={"data": {"core_snapshot": "old"}}))
        client.return_value.fetch_snapshot.return_value = {"not_modified": True}
        sync_core_pending()
        self.assertEqual(api.erp_request.call_count, 1)
        client.return_value.fetch_snapshot.assert_called_once_with(known_snapshot="old")

    @patch("sync_core_pending.CoreOrdersClient")
    @patch("sync_core_pending.Common")
    def test_complete_snapshot_is_applied_in_one_request(self, common, client):
        api = common.return_value
        api.erp_request.side_effect = [
            Mock(status_code=200, json=Mock(return_value={"data": {}})),
            Mock(status_code=200, json=Mock(return_value={"message": {"status": "applied", "snapshot": "new", "updated": 1}})),
        ]
        client.return_value.fetch_snapshot.return_value = {"snapshot": "new", "not_modified": False}
        sync_core_pending()
        self.assertEqual(api.erp_request.call_count, 2)
        self.assertEqual(api.erp_request.call_args.args[0], "POST")
        self.assertIn("apply_snapshot", api.erp_request.call_args.args[1])
