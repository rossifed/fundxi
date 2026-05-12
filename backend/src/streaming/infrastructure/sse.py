"""SSE wire-format helpers.

DDD role: tiny infrastructure utility. Server-Sent Events frames are
``event: <name>\\ndata: <payload>\\n\\n``; comments (used for
keep-alives) are lines starting with ``:``.
"""


def sse_event(*, event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


def sse_comment(text: str) -> str:
    return f": {text}\n\n"
