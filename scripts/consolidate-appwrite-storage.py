"""Copy and verify Appwrite files through the CLI without deleting resources."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING, Any, Never

if TYPE_CHECKING:
    from collections.abc import Sequence

ROOT = Path(__file__).resolve().parent.parent
PAGE_SIZE = 100
Record = dict[str, Any]


def _abort(message: str) -> Never:
    raise RuntimeError(message)


def api(*args: str) -> Record:
    """Execute a constructed Appwrite command without exposing response errors."""
    executable = shutil.which("appwrite")
    if executable is None:
        _abort("Appwrite CLI non disponibile nel PATH")
    # The executable is resolved above; arguments never pass through a shell.
    result = subprocess.run(  # noqa: S603
        [executable, *args, "--raw"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    if result.returncode:
        _abort(f"Appwrite {args[0]}/{args[1]} non riuscito")
    return json.loads(result.stdout) if result.stdout.strip() else {}


def files(bucket: str) -> list[Record]:
    """Collect every storage page, rejecting a stalled cursor."""
    result = []
    cursor = None
    while True:
        args = [
            "storage",
            "list-files",
            "--bucket-id",
            bucket,
            "--limit",
            str(PAGE_SIZE),
        ]
        if cursor:
            args += ["--cursor-after", cursor]
        page = api(*args)["files"]
        result.extend(page)
        if len(page) < PAGE_SIZE:
            return result
        next_cursor = page[-1]["$id"]
        if next_cursor == cursor:
            _abort("Paginazione Storage bloccata")
        cursor = next_cursor


def metadata_equal(first: Record, second: Record) -> bool:
    """Compare content metadata and the complete per-file permission set."""
    keys = ("$id", "name", "mimeType", "sizeOriginal")
    return all(first.get(key) == second.get(key) for key in keys) and sorted(
        first.get("$permissions", [])
    ) == sorted(second.get("$permissions", []))


def digest(path: Path) -> str:
    """Calculate a streaming SHA-256 checksum."""
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def download(bucket: str, file: Record, directory: Path) -> Path:
    """Download one file into a private directory after validating its basename."""
    name = file["name"]
    if (
        not name
        or name in (".", "..")
        or any(char in name for char in ("/", "\\", "\x00"))
    ):
        _abort("Nome file non sicuro per il backup; intervento manuale necessario")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    destination = directory / name
    api(
        "storage",
        "get-file-download",
        "--bucket-id",
        bucket,
        "--file-id",
        file["$id"],
        "--destination",
        str(destination),
    )
    if destination.stat().st_size != file["sizeOriginal"]:
        _abort("Dimensione del download non corrispondente")
    return destination


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm-project", required=True)
    parser.add_argument("--source-bucket", required=True)
    parser.add_argument("--target-bucket", required=True)
    parser.add_argument("--mode", choices=("plan", "copy", "verify"), default="plan")
    parser.add_argument("--backup", type=Path, default=ROOT / "tmp/appwrite-free-plan")
    return parser.parse_args()


def _buckets(args: argparse.Namespace) -> tuple[Record, Record]:
    config = json.loads((ROOT / "appwrite.config.json").read_text())
    if (
        args.confirm_project != config["projectId"]
        or api("project", "get")["$id"] != args.confirm_project
    ):
        _abort("Il progetto confermato non corrisponde al progetto locale e remoto")
    if args.source_bucket == args.target_bucket:
        _abort("I bucket sorgente e destinazione devono essere distinti")
    source = api("storage", "get-bucket", "--bucket-id", args.source_bucket)
    target = api("storage", "get-bucket", "--bucket-id", args.target_bucket)
    if not source["fileSecurity"] or not target["fileSecurity"]:
        _abort("Entrambi i bucket devono usare i permessi per file")
    if sorted(target["$permissions"]) != ['create("users")']:
        _abort("Permessi del bucket destinazione non sicuri")
    return source, target


def _validate_files(source: Sequence[Record], target: dict[str, Record]) -> None:
    for file in source:
        if file.get("chunksTotal") != file.get("chunksUploaded"):
            _abort(
                "Upload incompleto nella sorgente; "
                "sospendere gli upload prima della migrazione"
            )
        if file["$id"] in target and not metadata_equal(file, target[file["$id"]]):
            _abort("Collisione tra gli ID dei file; nessuna sovrascrittura consentita")


def _inventory(
    args: argparse.Namespace,
    source: Record,
    target: Record,
    source_files: Sequence[Record],
    target_files: dict[str, Record],
) -> None:
    args.backup.mkdir(parents=True, exist_ok=True, mode=0o700)
    args.backup.chmod(0o700)
    inventory = args.backup / "storage-before.json"
    if inventory.exists():
        saved = json.loads(inventory.read_text())
        if (saved["projectId"], saved["source"]["$id"], saved["target"]["$id"]) != (
            args.confirm_project,
            args.source_bucket,
            args.target_bucket,
        ):
            _abort("La cartella backup appartiene a una migrazione diversa")
        return
    with inventory.open("x") as output:
        json.dump(
            {
                "projectId": args.confirm_project,
                "source": source,
                "target": target,
                "sourceFiles": source_files,
                "targetFiles": list(target_files.values()),
            },
            output,
            indent=2,
        )
    inventory.chmod(0o600)


def _prepare_target(bucket: str) -> None:
    # Extend the existing avatar bucket, preserving per-file access control.
    manifest = json.loads((ROOT / "appwrite/buckets.json").read_text())[0]
    flags = [
        "storage",
        "update-bucket",
        "--bucket-id",
        bucket,
        "--name",
        manifest["name"],
        "--maximum-file-size",
        str(manifest["maximumFileSize"]),
        "--file-security=true",
        "--encryption=true",
        "--antivirus=true",
        "--compression",
        "none",
    ]
    for extension in manifest["allowedFileExtensions"]:
        flags += ["--allowed-file-extensions", extension]
    api(*flags)


def create_copy(bucket: str, file: Record, original: Path) -> None:
    """Create a destination file with explicit source permissions only."""
    permissions = file.get("$permissions", [])
    if not permissions:
        # Never inherit the CLI user's permissions when the source ACL is empty.
        _abort("File senza ACL: copia manuale con permessi vuoti richiesta")
    flags = [
        "storage",
        "create-file",
        "--bucket-id",
        bucket,
        "--file-id",
        file["$id"],
        "--file",
        str(original),
    ]
    for permission in permissions:
        flags += ["--permissions", permission]
    api(*flags)


def _copy_and_verify(
    args: argparse.Namespace,
    source: Sequence[Record],
    target: dict[str, Record],
) -> dict[str, str]:
    checksums = {}
    for index, file in enumerate(source):
        original = download(
            args.source_bucket,
            file,
            args.backup / "source" / file["$id"],
        )
        if file["$id"] not in target:
            create_copy(args.target_bucket, file, original)
        copied = api(
            "storage",
            "get-file",
            "--bucket-id",
            args.target_bucket,
            "--file-id",
            file["$id"],
        )
        if not metadata_equal(file, copied) or copied.get("chunksTotal") != copied.get(
            "chunksUploaded"
        ):
            _abort("Metadati o permessi della copia non corrispondenti")
        destination = download(
            args.target_bucket,
            copied,
            args.backup / "target" / file["$id"],
        )
        checksums[file["$id"]] = digest(original)
        if checksums[file["$id"]] != digest(destination):
            _abort("Il contenuto copiato non corrisponde alla sorgente")
        print(f"Verificati {index + 1}/{len(source)} file")
    return checksums


def main() -> None:
    """Plan, copy or verify a confirmed migration; never delete source resources."""
    args = _arguments()
    source_bucket, target_bucket = _buckets(args)
    source = files(args.source_bucket)
    target = {file["$id"]: file for file in files(args.target_bucket)}
    _validate_files(source, target)
    print(
        json.dumps(
            {
                "mode": args.mode,
                "sourceFiles": len(source),
                "targetFiles": len(target),
                "sourceBytes": sum(file["sizeOriginal"] for file in source),
            }
        )
    )
    if args.mode == "plan":
        return
    if args.mode == "verify" and any(file["$id"] not in target for file in source):
        _abort("File mancanti nella destinazione")
    _inventory(args, source_bucket, target_bucket, source, target)
    if args.mode == "copy":
        _prepare_target(args.target_bucket)
    checksums = _copy_and_verify(args, source, target)
    latest = {file["$id"]: file for file in files(args.source_bucket)}
    if len(latest) != len(source) or any(
        not metadata_equal(file, latest.get(file["$id"], {})) for file in source
    ):
        _abort("La sorgente è cambiata durante la copia; ripetere la verifica")
    report = args.backup / "storage-verified.json"
    report.write_text(
        json.dumps(
            {
                "projectId": args.confirm_project,
                "sourceBucket": args.source_bucket,
                "targetBucket": args.target_bucket,
                "sha256": checksums,
            },
            indent=2,
        )
        + "\n"
    )
    report.chmod(0o600)
    print("Copia verificata. Nessun file o bucket eliminato.")


if __name__ == "__main__":
    main()
