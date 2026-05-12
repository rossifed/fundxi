"""Driving adapter: the streaming FastAPI application.

Runs as its own process (separate from the BFF):
    uv run uvicorn src.streaming.workers.app:app --port 8002
"""
