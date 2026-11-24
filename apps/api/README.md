# API

FastAPI service for documents, blocks, structured records and insights.

Run from this directory:

```bash
uvicorn app.main:app --reload
```

The configured database is read from `apps/api/.env`. Run `python scripts/init_db.py` once if you want to create the tables before starting the API; the API startup also performs the same development initialization automatically.

Interactive API docs are available at `/docs`. The current MVP uses a development-only `demo-user`; authentication and user isolation are next-phase work.
