"""Regression checks for read-only upload maintenance."""

import importlib.util
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "maintenance", Path(__file__).with_name("upload-maintenance.py")
)
if spec is None or spec.loader is None:
    message = "Cannot load the upload maintenance module"
    raise ImportError(message)
maintenance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(maintenance)


class MaintenanceTests(unittest.TestCase):
    """Exercise stale runs and conservative inventory behavior."""

    def test_missing_hourly_runs_are_detected_even_after_healthy_result(self) -> None:
        """Detect missed schedules even after a successful execution."""
        now = datetime.now(UTC)
        result = maintenance.assess_health(
            {
                "startedAt": (now - timedelta(hours=3)).isoformat(),
                "state": "healthy",
                "summary": "{}",
            },
            now,
        )
        self.assertTrue(result["issues"])

    def test_stuck_running_and_backlog_are_reported(self) -> None:
        """Flag stuck runs and explicit failure or backlog states."""
        now = datetime.now(UTC)
        for state in ("running", "attention", "error"):
            result = maintenance.assess_health(
                {
                    "startedAt": (now - timedelta(minutes=3)).isoformat(),
                    "state": state,
                    "summary": "{}",
                },
                now,
            )
            self.assertTrue(result["issues"])

    def test_recent_success_is_healthy(self) -> None:
        """Accept a recent successful cleanup."""
        now = datetime.now(UTC)
        self.assertFalse(
            maintenance.assess_health(
                {
                    "startedAt": now.isoformat(),
                    "state": "healthy",
                    "summary": '{"checked":2}',
                },
                now,
            )["issues"]
        )

    def test_inventory_preserves_references_seen_in_either_snapshot(self) -> None:
        """Retain either snapshot and omit private file names."""
        snapshots = [
            {"chat": {"used"}, "profile": set()},
            {"chat": set(), "profile": set()},
        ]
        env = {
            "APPWRITE_ATTACHMENT_OPERATIONS_TABLE_ID": "ledger",
            "APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID": "chat",
            "APPWRITE_AVATARS_BUCKET_ID": "photos",
        }
        entries = [
            {"$id": file_id, "name": "private name", "sizeOriginal": 3}
            for file_id in ["used", "managed", "legacy"]
        ]
        with (
            patch.object(maintenance, "referenced_files", side_effect=snapshots),
            patch.object(
                maintenance,
                "rows",
                return_value=[{"kind": "reserved", "fileId": "managed"}],
            ),
            patch.object(maintenance, "pages", side_effect=[entries, []]),
        ):
            result = maintenance.inventory(env)
        self.assertFalse(result["deletionAuthorized"])
        self.assertEqual(
            result["buckets"]["chat"],
            {"referenced": 1, "managedUnreferenced": 1, "legacyUnreferenced": 1},
        )
        self.assertEqual({r["fileId"] for r in result["review"]}, {"managed", "legacy"})
        self.assertNotIn("private name", str(result))

    def test_failed_second_snapshot_never_produces_a_partial_inventory(self) -> None:
        """Abort the inventory if the reference refresh fails."""
        env = {
            "APPWRITE_ATTACHMENT_OPERATIONS_TABLE_ID": "ledger",
            "APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID": "chat",
            "APPWRITE_AVATARS_BUCKET_ID": "photos",
        }
        with (
            patch.object(
                maintenance,
                "referenced_files",
                side_effect=[
                    {"chat": set(), "profile": set()},
                    RuntimeError("offline"),
                ],
            ),
            patch.object(maintenance, "rows", return_value=[]),
            patch.object(maintenance, "pages", return_value=[]),
            self.assertRaises(RuntimeError),
        ):
            maintenance.inventory(env)


if __name__ == "__main__":
    unittest.main()
