import { CornerDownLeft, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment, useEffect, useRef, useState } from "react";

import { api } from "../api";
import type { ChatMessage } from "../types";

interface ChatViewProps {
  onFocusEntry: (entryId: number) => void;
}

const CITATION_RE = /\[#(\d+)\]/g;

// Render message text, turning [#id] citations into clickable chips.
function MessageBody({
  content,
  onFocusEntry,
}: {
  content: string;
  onFocusEntry: (id: number) => void;
}) {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  CITATION_RE.lastIndex = 0;
  while ((m = CITATION_RE.exec(content)) !== null) {
    if (m.index > last) parts.push(content.slice(last, m.index));
    const id = Number(m[1]);
    parts.push(
      <button
        key={`${m.index}-${id}`}
        onClick={() => onFocusEntry(id)}
        className="mx-0.5 rounded bg-ink-100 px-1 py-0.5 text-[0.7rem] font-medium text-ink-900/70 transition hover:bg-amber-200 dark:bg-ink-800 dark:text-ink-100/70 dark:hover:bg-amber-700/50"
        title={`Jump to entry #${id}`}
      >
        #{id}
      </button>,
    );
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  );
}

export function ChatView({ onFocusEntry }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setError(null);
    setInput("");
    // Append the user turn plus an empty assistant turn we stream into.
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      await api.chat(history, {
        onToken: (t) =>
          setMessages((prev) => {
            const next = [...prev];
            const idx = next.length - 1;
            next[idx] = { ...next[idx], content: next[idx].content + t };
            return next;
          }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed");
      // Drop the empty/partial assistant turn on hard failure.
      setMessages((prev) => {
        const next = [...prev];
        if (next.length && next[next.length - 1].content === "") next.pop();
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.length === 0 && !streaming && (
        <p className="px-1 text-sm text-ink-900/40 dark:text-ink-100/40">
          Ask anything about your entries — “what have I been worried about
          lately?”, “what did I decide about backups?”. Answers cite the entries
          they draw from.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={
              msg.role === "user"
                ? "self-end max-w-[85%] rounded-2xl rounded-br-sm bg-ink-900 px-4 py-2 text-sm text-ink-50 dark:bg-ink-100 dark:text-ink-900"
                : "self-start max-w-[90%] text-sm leading-relaxed text-ink-900/90 dark:text-ink-100/90"
            }
          >
            {msg.role === "assistant" && msg.content === "" && streaming ? (
              <Loader2 className="h-4 w-4 animate-spin text-ink-900/40 dark:text-ink-100/40" />
            ) : (
              <MessageBody content={msg.content} onFocusEntry={onFocusEntry} />
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="px-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="sticky bottom-4 mt-2">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder="Ask your entries…"
            disabled={streaming}
            className="w-full resize-none rounded-2xl border border-ink-200 bg-white px-4 py-3 pr-12 text-sm text-ink-900 placeholder:text-ink-900/40 focus:border-ink-900/30 focus:outline-none focus:ring-0 disabled:opacity-60 dark:border-ink-900 dark:bg-ink-900/40 dark:text-ink-100 dark:placeholder:text-ink-100/40 dark:focus:border-ink-100/30"
          />
          <button
            onClick={() => void send()}
            disabled={streaming || !input.trim()}
            className="absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-ink-900 text-ink-50 transition hover:opacity-90 disabled:opacity-30 dark:bg-ink-100 dark:text-ink-900"
            title="Send (⌘/Ctrl+Enter)"
          >
            {streaming ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CornerDownLeft className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
