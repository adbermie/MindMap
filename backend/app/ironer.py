from __future__ import annotations

from typing import Any

from anthropic import Anthropic

from .config import settings


# A deliberately long, frozen system prompt so it can sit in the prompt cache.
# Sonnet 4.6's minimum cacheable prefix is 2048 tokens — this is well under
# that today, but the cache_control marker is harmless and lets the cache kick
# in once we grow the prompt or attach more cacheable context.
_SYSTEM_PROMPT = """You are MindMap's thought-ironing assistant.

MindMap is a single-user thought-unloader: the user dumps a raw stream of
consciousness (voice or text) into an entry box. You receive that raw text and
return a structured, navigable version of the same thought.

Your job — five outputs, returned via the iron_out tool:

1. prose — the same thought, ironed flat. Preserve the user's voice, fix the
   structure, drop ums/uhs/restarts/digressions that go nowhere. Don't invent
   facts the user didn't write. Don't editorialize. Don't sanitize — if they
   sound annoyed, the ironed version sounds annoyed too. Aim for clean prose
   the user could read back in a week and recognize as their own thinking.

2. tags — 1 to 5 short, lowercase, hyphen-separated topic tags. Examples:
   "career", "side-projects", "react", "money", "relationship-stuff". These
   are how entries cluster in the navigable graph. Reuse existing tags from
   the recent-entries context if they fit; only invent a new one if nothing
   in the recent set captures the topic.

3. tasks — concrete actionable items the user explicitly wants to do. Be
   strict: "I should email Alex" is a task; "I'm worried about Alex" is not.
   Each task: a short imperative title, optional priority_hint (low/med/high)
   and due_hint (a free-text phrase like "this week", "before Tuesday",
   "eventually" — leave blank if absent). Do not invent tasks.

4. questions — things the user explicitly wonders about, leaves unresolved,
   or wants to think about more. Short, in the user's voice ("why am I
   procrastinating on the rewrite?"). Not rhetorical asides.

5. links — references to past entries in the provided recent-entries context
   that this new entry meaningfully relates to. For each link, give the
   entry_id from the context and a one-line reason. Be conservative: only
   link when the connection is real (same topic, follow-up, contradiction,
   or direct reference). Two or three links is plenty; zero is fine.

Tone: terse, observational, no preamble, no follow-up questions. You're a
quiet editor, not a coach."""


_IRON_TOOL: dict[str, Any] = {
    "name": "iron_out",
    "description": "Return the ironed-out, structured version of this thought entry.",
    "input_schema": {
        "type": "object",
        "properties": {
            "prose": {
                "type": "string",
                "description": "The entry ironed into coherent prose.",
            },
            "tags": {
                "type": "array",
                "items": {"type": "string"},
                "description": "1-5 lowercase, hyphen-separated topic tags.",
            },
            "tasks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "priority_hint": {
                            "type": "string",
                            "enum": ["low", "med", "high"],
                        },
                        "due_hint": {"type": "string"},
                    },
                    "required": ["title"],
                },
            },
            "questions": {
                "type": "array",
                "items": {"type": "string"},
            },
            "links": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "entry_id": {"type": "integer"},
                        "reason": {"type": "string"},
                    },
                    "required": ["entry_id"],
                },
            },
        },
        "required": ["prose", "tags", "tasks", "questions", "links"],
    },
}


def _format_recent_context(recent: list[dict[str, Any]]) -> str:
    if not recent:
        return "Recent entries (none yet)."
    lines = ["Recent entries (most-recent first) — entry_id [tags]: summary"]
    for e in recent:
        tags = ", ".join(e.get("tags") or []) or "-"
        summary = (e.get("summary") or "").strip().replace("\n", " ")
        if len(summary) > 240:
            summary = summary[:237] + "..."
        lines.append(f"#{e['id']} [{tags}]: {summary}")
    return "\n".join(lines)


_client: Anthropic | None = None


def _get_client() -> Anthropic:
    global _client
    if _client is None:
        if not settings.anthropic_api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set. Add it to .env before calling /process."
            )
        _client = Anthropic(api_key=settings.anthropic_api_key)
    return _client


def iron_entry(
    raw_text: str,
    recent: list[dict[str, Any]],
    instruction: str | None = None,
) -> dict[str, Any]:
    """Run Claude on `raw_text` and return the iron_out tool input as a dict.

    `recent` should be a list of {id, summary, tags} dicts for cross-linking
    context. `instruction` is an optional steering note from the user (used by
    the /reprocess endpoint).
    """
    client = _get_client()
    user_block = f"Raw entry to iron out:\n\n{raw_text.strip()}"
    if instruction:
        user_block += f"\n\nAdditional instruction from the user: {instruction.strip()}"

    response = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=4096,
        system=[
            {
                "type": "text",
                "text": _SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            },
            {"type": "text", "text": _format_recent_context(recent)},
        ],
        tools=[_IRON_TOOL],
        tool_choice={"type": "tool", "name": "iron_out", "disable_parallel_tool_use": True},
        messages=[{"role": "user", "content": user_block}],
    )

    for block in response.content:
        if block.type == "tool_use" and block.name == "iron_out":
            return dict(block.input)
    raise RuntimeError("Claude did not return an iron_out tool call.")
