"""Read-only upload health and inventory. Never authorizes or performs deletion."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any, TypedDict

if TYPE_CHECKING:
    from collections.abc import Iterator, Mapping, Sequence

ROOT = Path(__file__).resolve().parent.parent
PAGE_SIZE = 100
STALE_RUN_MINUTES = 120
STUCK_RUN_MINUTES = 2
Record = dict[str, Any]


class HealthAssessment(TypedDict):
    """Latest cleanup state and aggregate counters."""

    state: str
    ageMinutes: float
    issues: list[str]
    metrics: Record


class InventoryReport(TypedDict):
    """Private review candidates without file names or content."""

    createdAt: str
    deletionAuthorized: bool
    buckets: dict[str, dict[str, int]]
    review: list[Record]


def query(
    method: str, attribute: str | None = None, values: Sequence[str | int] | None = None
) -> str:
    """Encode a CLI query using Appwrite query syntax."""
    return json.dumps(
        {
            "method": method,
            **({"attribute": attribute} if attribute else {}),
            **({"values": values} if values is not None else {}),
        }
    )


def api(*args: str) -> Record:
    """Run a read-only Appwrite CLI command and decode its response."""
    executable = shutil.which("appwrite")
    if executable is None:
        message = "Appwrite CLI non disponibile nel PATH."
        raise RuntimeError(message)
    # Commands and flags are constructed here; no shell or user command is accepted.
    result = subprocess.run(  # noqa: S603
        [executable, *args, "--raw"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=45,
        check=False,
    )
    if result.returncode:
        message = (
            f"Appwrite: lettura {args[0]}/{args[1]} non riuscita; "
            "verificare accesso e configurazione."
        )
        raise RuntimeError(message)
    return json.loads(result.stdout)


def resources() -> tuple[dict[str, str], dict[str, Record]]:
    """Resolve local resource IDs after verifying the selected remote project."""
    config = json.loads((ROOT / "appwrite.config.json").read_text())
    if api("project", "get")["$id"] != config["projectId"]:
        message = "Il progetto remoto non corrisponde alla configurazione locale."
        raise RuntimeError(message)
    tables = json.loads((ROOT / "appwrite/tables.local.json").read_text())
    functions = json.loads((ROOT / "appwrite/functions.local.json").read_text())
    env = next(f["vars"] for f in functions if f["name"] == "Clean up chat attachments")
    return env, {t["$id"]: t for t in tables}


def rows(env: Mapping[str, str], table: str, fields: Sequence[str]) -> Iterator[Record]:
    """Iterate projected rows of one table."""
    return pages(
        [
            "tablesdb",
            "list-rows",
            "--database-id",
            env["APPWRITE_DATABASE_ID"],
            "--table-id",
            table,
        ],
        "rows",
        fields,
    )


def pages(
    args: Sequence[str], key: str, fields: Sequence[str] | None = None
) -> Iterator[Record]:
    """Read cursor pages and reject pagination that stops advancing."""
    cursor = None
    seen: set[str] = set()
    while True:
        command = [
            *args,
            "--queries",
            query("limit", values=[PAGE_SIZE]),
            "--queries",
            query("orderAsc", "$id"),
        ]
        if fields:
            command += ["--queries", query("select", values=fields)]
        if cursor:
            command += ["--queries", query("cursorAfter", values=[cursor])]
        page = api(*command)[key]
        yield from page
        if len(page) < PAGE_SIZE:
            break
        cursor = page[-1]["$id"]
        if cursor in seen:
            message = "Paginazione senza avanzamento: inventario incompleto."
            raise RuntimeError(message)
        seen.add(cursor)


def assess_health(
    row: Mapping[str, str], now: datetime | None = None
) -> HealthAssessment:
    """Flag failed, overdue or missing cleanup executions."""
    now = now or datetime.now(UTC)
    started = datetime.fromisoformat(row["startedAt"])
    age_minutes = (now - started).total_seconds() / 60
    summary = json.loads(row["summary"])
    reasons = []
    if age_minutes > STALE_RUN_MINUTES:
        reasons.append("nessuna esecuzione recente da oltre due ore")
    if row["state"] in ("attention", "error"):
        reasons.append("arretrato, scadenza raggiunta o errori nell'ultima esecuzione")
    if row["state"] == "running" and age_minutes > STUCK_RUN_MINUTES:
        reasons.append("esecuzione non completata entro il timeout previsto")
    if row["state"] not in ("running", "healthy", "attention", "error"):
        reasons.append("stato non riconosciuto")
    return {
        "state": row["state"],
        "ageMinutes": round(age_minutes, 1),
        "issues": reasons,
        "metrics": summary,
    }


def health(env: Mapping[str, str]) -> int:
    """Print the latest health assessment and return its monitoring exit code."""
    result = api(
        "tablesdb",
        "list-rows",
        "--database-id",
        env["APPWRITE_DATABASE_ID"],
        "--table-id",
        env["APPWRITE_CLEANUP_HEALTH_TABLE_ID"],
        "--queries",
        query("limit", values=[1]),
        "--queries",
        query("orderDesc", "$createdAt"),
    )
    if not result["rows"]:
        message = (
            "Nessuna esecuzione monitorata: "
            "verificare schema, variabili e deploy della pulizia."
        )
        raise RuntimeError(message)
    assessment = assess_health(result["rows"][0])
    print(json.dumps(assessment, indent=2, ensure_ascii=False))
    return 1 if assessment["issues"] else 0


def referenced_files(env: Mapping[str, str]) -> dict[str, set[str]]:
    """Collect the current message and profile file references."""
    chat = {
        r["attachmentFileId"]
        for r in rows(
            env, env["APPWRITE_MESSAGES_TABLE_ID"], ["$id", "attachmentFileId"]
        )
        if r.get("attachmentFileId")
    }
    photos: set[str] = set()
    for row in rows(
        env, env["APPWRITE_PROFILES_TABLE_ID"], ["$id", "avatarFileId", "photoFileIds"]
    ):
        if row.get("avatarFileId"):
            photos.add(row["avatarFileId"])
        gallery = row.get("photoFileIds") or []
        if not isinstance(gallery, list):
            message = "Riferimenti foto non validi: inventario incompleto."
            raise TypeError(message)
        photos.update(gallery)
    return {"chat": chat, "profile": photos}


def inventory(env: Mapping[str, str]) -> InventoryReport:
    """Classify files while preserving references observed in either snapshot."""
    references = referenced_files(env)
    reservations = {
        r["fileId"]
        for r in rows(
            env,
            env["APPWRITE_ATTACHMENT_OPERATIONS_TABLE_ID"],
            ["$id", "kind", "fileId"],
        )
        if r.get("kind") == "reserved"
    }
    buckets = {
        "chat": env["APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID"],
        "profile": env["APPWRITE_AVATARS_BUCKET_ID"],
    }
    files = {
        kind: list(pages(["storage", "list-files", "--bucket-id", bucket], "files"))
        for kind, bucket in buckets.items()
    }
    second = referenced_files(env)
    report: InventoryReport = {
        "createdAt": datetime.now(UTC).isoformat(),
        "deletionAuthorized": False,
        "buckets": {},
        "review": [],
    }
    for kind, entries in files.items():
        counts = {"referenced": 0, "managedUnreferenced": 0, "legacyUnreferenced": 0}
        refs = references[kind] | second[kind]
        for file in entries:
            file_id = file["$id"]
            classification = (
                "referenced"
                if file_id in refs
                else "managedUnreferenced"
                if file_id in reservations
                else "legacyUnreferenced"
            )
            counts[classification] += 1
            if classification != "referenced":
                report["review"].append(
                    {
                        "bucket": kind,
                        "fileId": file_id,
                        "classification": classification,
                        "createdAt": file.get("$createdAt"),
                        "bytes": file.get("sizeOriginal"),
                    }
                )
        report["buckets"][kind] = counts
    return report


def main() -> int:
    """Dispatch the read-only health or inventory command."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["health", "inventory"])
    parser.add_argument(
        "--output", type=Path, help="Salvare l'inventario in un file locale privato"
    )
    args = parser.parse_args()
    env, _ = resources()
    if args.action == "health":
        return health(env)
    report = inventory(env)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w") as output:
            json.dump(report, output, indent=2)
        print(json.dumps(report["buckets"], indent=2))
        print(
            f"Inventario privato: {args.output}. "
            "Nessuna cancellazione autorizzata o eseguita."
        )
    else:
        print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (
        RuntimeError,
        KeyError,
        ValueError,
        TypeError,
        OSError,
        subprocess.TimeoutExpired,
    ) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(2) from None
