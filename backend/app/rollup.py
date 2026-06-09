from __future__ import annotations

from typing import Any

from .config import settings
from .ironer import _get_client


_ROLLUP_SYSTEM_PROMPT = """You maintain a long-running conversation's memory for
MindMap, a single user's personal thinking tool.

At the end of a day you are given the existing HANDOVER (the running memory of
the conversation so far — may be empty on the first rollup) and the NEW MESSAGES
exchanged since the last handover. Produce, via the write_rollup tool:

- handover: the updated running memory. PRESERVE all prior chronological context
  from the existing handover verbatim or near-verbatim, then APPEND the new
  developments as a new dated section. Never discard or compress earlier
  sections — this document is meant to GROW so the conversation can always be
  resumed with its full history intact. Be detailed and concrete: decisions
  made, the user's reasoning and constraints, open threads, and what to pick up
  next. This is read by an AI to resume the conversation faithfully, so optimize
  for continuation fidelity over brevity.

- summary: a concise, human-facing summary of the whole conversation to this
  point — what's been discussed and where it stands. A few sentences to a short
  paragraph. This is shown to the user in place of the raw transcript.

- title: a short, specific title for the conversation (max ~6 words)."""


_ROLLUP_TOOL: dict[str, Any] = {
    "name": "write_rollup",
    "description": "Write the updated conversation handover, human summary, and title.",
    "input_schema": {
        "type": "object",
        "properties": {
            "handover": {
                "type": "string",
                "description": "The full updated running memory, growing and chronological.",
            },
            "summary": {
                "type": "string",
                "description": "Concise human-facing summary of the whole conversation so far.",
            },
            "title": {
                "type": "string",
                "description": "Short, specific conversation title (~6 words max).",
            },
        },
        "required": ["handover", "summary", "title"],
    },
}


def _format_new_messages(messages: list[dict[str, str]]) -> str:
    lines = []
    for m in messages:
        who = "User" if m["role"] == "user" else "Assistant"
        lines.append(f"{who}: {m['content'].strip()}")
    return "\n\n".join(lines)


def generate_rollup(
    prior_handover: str | None,
    new_messages: list[dict[str, str]],
    focus_question: str | None = None,
) -> dict[str, str]:
    """Run the rollup model and return {handover, summary, title}."""
    client = _get_client()

    parts: list[str] = []
    if focus_question:
        parts.append(f"This conversation is about the open question: {focus_question.strip()}")
    parts.append("EXISTING HANDOVER:\n" + (prior_handover.strip() if prior_handover else "(none yet — this is the first rollup)"))
    parts.append("NEW MESSAGES SINCE LAST HANDOVER:\n" + _format_new_messages(new_messages))
    user_block = "\n\n".join(parts)

    response = client.messages.create(
        model=settings.anthropic_rollup_model,
        max_tokens=8192,
        system=_ROLLUP_SYSTEM_PROMPT,
        tools=[_ROLLUP_TOOL],
        tool_choice={"type": "tool", "name": "write_rollup", "disable_parallel_tool_use": True},
        messages=[{"role": "user", "content": user_block}],
    )

    for block in response.content:
        if block.type == "tool_use" and block.name == "write_rollup":
            data = dict(block.input)
            return {
                "handover": (data.get("handover") or "").strip(),
                "summary": (data.get("summary") or "").strip(),
                "title": (data.get("title") or "").strip(),
            }
    raise RuntimeError("Rollup model did not return a write_rollup tool call.")
