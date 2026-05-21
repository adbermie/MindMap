from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import engine, init_db
from .fts import install_fts
from .routers import entries, graph, search, tags, tasks, transcribe


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.database_url.startswith("sqlite:///"):
        db_path = Path(settings.database_url.replace("sqlite:///", "", 1))
        db_path.parent.mkdir(parents=True, exist_ok=True)
    init_db()
    install_fts(engine)
    yield


app = FastAPI(title="MindMap API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(entries.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(tags.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(graph.router, prefix="/api")
app.include_router(transcribe.router, prefix="/api")


@app.get("/api/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
