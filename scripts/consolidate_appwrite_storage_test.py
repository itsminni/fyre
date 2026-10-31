"""Verify migration guards without touching Appwrite."""

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location(
    "storage_migration", Path(__file__).with_name("consolidate-appwrite-storage.py")
)
if SPEC is None or SPEC.loader is None:
    message = "Cannot load the storage migration module"
    raise ImportError(message)
migration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(migration)


class StorageMigrationTests(unittest.TestCase):
    """Exercise conservative storage migration guards without a live backend."""

    def test_metadata_comparison_preserves_permissions(self) -> None:
        """Metadata comparison preserves permissions."""
        file = {
            "$id": "file",
            "name": "photo.jpg",
            "mimeType": "image/jpeg",
            "sizeOriginal": 10,
            "$permissions": ['read("user:owner")'],
        }
        self.assertTrue(migration.metadata_equal(file, dict(file)))
        self.assertFalse(
            migration.metadata_equal(file, {**file, "$permissions": ['read("any")']})
        )
        self.assertFalse(migration.metadata_equal(file, {**file, "sizeOriginal": 11}))

    def test_plan_and_verify_never_mutate_buckets(self) -> None:
        """Plan and verify never mutate buckets."""
        for mode in ("plan", "verify"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / "appwrite.config.json").write_text(
                    json.dumps({"projectId": "project"})
                )
                calls = []

                def api(
                    *args: str, calls: list[tuple[str, ...]] = calls
                ) -> dict[str, Any]:
                    calls.append(args)
                    if args[:2] == ("project", "get"):
                        return {"$id": "project"}
                    return {"fileSecurity": True, "$permissions": ['create("users")']}

                args = [
                    "migration",
                    "--confirm-project",
                    "project",
                    "--source-bucket",
                    "chat",
                    "--target-bucket",
                    "avatars",
                    "--mode",
                    mode,
                    "--backup",
                    str(root / "backup"),
                ]
                with (
                    patch.object(migration, "ROOT", root),
                    patch.object(migration, "api", api),
                    patch.object(migration, "files", return_value=[]),
                    patch.object(sys, "argv", args),
                ):
                    migration.main()
                self.assertFalse(
                    any(
                        "update-bucket" in call or "create-file" in call
                        for call in calls
                    )
                )

    def test_download_rejects_path_traversal_before_calling_cli(self) -> None:
        """Download rejects path traversal before calling cli."""
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(migration, "api") as api,
        ):
            for name in ("../secret", "/private/file", "..", "a\\b"):
                with self.assertRaises(RuntimeError):
                    migration.download(
                        "bucket", {"name": name}, Path(directory) / "unused"
                    )
            api.assert_not_called()

    def test_pagination_does_not_stop_at_first_hundred_files(self) -> None:
        """Pagination does not stop at first hundred files."""
        first = [{"$id": str(index)} for index in range(100)]
        with patch.object(
            migration,
            "api",
            side_effect=[{"files": first}, {"files": [{"$id": "last"}]}],
        ) as api:
            self.assertEqual(len(migration.files("bucket")), 101)
            self.assertIn("--cursor-after", api.call_args.args)

    def test_cli_errors_do_not_expose_private_response_bodies(self) -> None:
        """Report command failure without filenames or tokens from CLI output."""
        response = Mock(returncode=1, stdout="private filename", stderr="secret token")
        with (
            patch.object(migration.shutil, "which", return_value="/tools/appwrite"),
            patch.object(migration.subprocess, "run", return_value=response) as run,
            self.assertRaises(RuntimeError) as caught,
        ):
            migration.api("storage", "list-files", "--bucket-id", "bucket")
        self.assertNotIn("private filename", str(caught.exception))
        self.assertNotIn("secret token", str(caught.exception))
        self.assertEqual(run.call_args.args[0][0], "/tools/appwrite")
        self.assertFalse(run.call_args.kwargs["check"])

    def test_empty_acl_never_creates_a_file_with_inherited_permissions(self) -> None:
        """Keep an empty source ACL from inheriting CLI account access."""
        with patch.object(migration, "api") as api, self.assertRaises(RuntimeError):
            migration.create_copy(
                "bucket", {"$id": "file", "$permissions": []}, Path("file")
            )
        api.assert_not_called()


if __name__ == "__main__":
    unittest.main()
