"""FastAPI application entry point.

Run locally:
    uv run fastapi dev app/main.py
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    cognition,
    health,
    live,
    members,
    mood,
    summary,
    tiredness,
)
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        summary="EEG mood tracking & tiredness detection over the AWEAR API",
        version="0.1.0",
    )

    # The Expo app calls this API from a different origin (web preview and
    # native), so cross-origin requests must be allowed.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(members.router)
    app.include_router(mood.router)
    app.include_router(tiredness.router)
    app.include_router(cognition.router)
    app.include_router(live.router)
    app.include_router(summary.router)

    return app


app = create_app()
