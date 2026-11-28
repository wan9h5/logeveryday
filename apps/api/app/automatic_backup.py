import asyncio
import logging
import os
from datetime import date, datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile

from sqlalchemy import select

from .backup import USER_ID, export_backup
from .db import SessionLocal
from .insights import JOURNAL_ZONE
from .models import User

logger = logging.getLogger(__name__)
PREFIX = "logeveryday-auto-"


def completed_file(path: Path) -> bool:
    try:
        return path.is_file() and path.stat().st_size > 0
    except FileNotFoundError:
        return False


def write_daily_backup(directory: Path, day: date) -> Path | None:
    destination = directory / f"{PREFIX}{day.isoformat()}.json"
    if completed_file(destination):
        return None

    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary: Path | None = None
    try:
        with SessionLocal() as db:
            # Workers sharing the MySQL account and directory publish at most one file per day.
            db.execute(select(User.id).where(User.id == USER_ID).with_for_update()).scalar_one()
            if completed_file(destination):
                return None
            contents = export_backup(db).model_dump_json(indent=2)
            with NamedTemporaryFile(mode="w", encoding="utf-8", prefix=".pending-", dir=directory, delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(contents)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, destination)
        return destination
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


class AutomaticBackup:
    def __init__(self, directory: Path, enabled: bool):
        self.directory = directory.resolve()
        self.enabled = enabled
        self.failed = False

    async def run(self) -> None:
        while True:
            try:
                await asyncio.to_thread(write_daily_backup, self.directory, datetime.now(JOURNAL_ZONE).date())
                self.failed = False
            except Exception as error:
                if not self.failed:
                    # Avoid logging backup contents or SQL parameter values.
                    logger.warning("Automatic journal backup failed (%s). Will retry.", type(error).__name__)
                self.failed = True
            await asyncio.sleep(60)

    def status(self) -> dict:
        latest = None
        failed = self.failed
        try:
            files = (path for path in self.directory.glob(f"{PREFIX}????-??-??.json") if completed_file(path))
            path = max(files, default=None)
            if path is not None:
                latest = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
        except OSError:
            failed = True
        return {
            "enabled": self.enabled,
            "directory": str(self.directory),
            "last_success_at": latest,
            "failed": failed,
        }
