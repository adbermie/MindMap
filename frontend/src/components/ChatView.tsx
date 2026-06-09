import { CornerDownLeft, Loader2, MessageCircleQuestion, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { api } from "../api";
import type { ChatMessage } from "../types";

export interface ChatSeed {
  question: string;
  entryId: number;
  key: number; // bumped on every click so re-clicking the same question re-opens
}

interface ChatViewProps {
  onFocusEntry: (entryId: number) => void;
  seed: ChatSeed | null;
  onSeedConsumed?: () => void;
}

type Mode = "search" | "question";

// Turn [#id] citations into markdown links so they render inside the prose
// flow; the custom `a` renderer below turns entry: links into clickable chips.
function withCitationLinks(content: string): string {
  return content.replace(/\[#(\d+)\]/g, "[#$1](entry:$1)");
}

function AnswerMarkdown({
  content,
  onFocusEntry,
}: {
  content: string;
  onFocusEntry: (id: number) => void;
}) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-ink-900/90 dark:text-ink-100/90 [&_code]:rounded [&_code]:bg-ink-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] dark:[&_code]:bg-ink-800 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
      <Markdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => url}
        components={{
          a({ href, children }) {
            const m = /^entry:(\d+)$/.exec(href ?? "");
            if (m) {
              const id = Number(m[1]);
              return (
                <button
                  onClick={() => onFocusEntry(id)}
                  className="mx-0.5 inline-flex items-center rounded bg-amber-100 px-1 align-baseline text-[0.78em] font-medium text-amber-900 transition hover:bg-amber-200 dark:bg-amber-400/20 dark:text-amber-200 dark:hover:bg-amber-400/35"
                  title={`Jump to entry #${id}`}
                >
                  #{id}
                </button>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {withCitationLinks(content)}
      </Markdown>
    </div>
  );
}

export function ChatView({ onFocusEntry, seed, onSeedConsumed }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("search");
  const [focusQuestion, setFocusQuestion] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function send(
    text: string,
    o: { mode: Mode; focusQuestion: string | null; base: ChatMessage[] },
  ) {
    if (!text.trim() || streaming) return;
    setError(null);
    const history: ChatMessage[] = [...o.base, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      await api.chat(
        history,
        {
          onToken: (t) =>
            setMessages((prev) => {
              const next = [...prev];
              const idx = next.length - 1;
              next[idx] = { ...next[idx], content: next[idx].content + t };
              return next;
            }),
        },
        { mode: o.mode, focusQuestion: o.focusQuestion ?? undefined },
      );
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

  // A question was clicked in the feed → open a fresh question-mode discussion.
  // Consume the seed so re-opening the Chat tab later doesn't replay it.
  useEffect(() => {
    if (!seed) return;
    setMode("question");
    setFocusQuestion(seed.question);
    setMessages([]);
    void send(seed.question, {
      mode: "question",
      focusQuestion: seed.question,
      base: [],
    });
    onSeedConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.key]);

  function submitInput() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    void send(text, { mode, focusQuestion, base: messages });
  }

  function clearQuestion() {
    setMode("search");
    setFocusQuestion(null);
    setMessages([]);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {mode === "question" && focusQuestion && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-400/30 dark:bg-amber-400/10">
          <div className="flex items-start gap-2">
            <MessageCircleQuestion className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700 dark:text-amber-300" />
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                {focusQuestion}
              </p>
              <p className="text-[11px] text-amber-800/70 dark:text-amber-200/60">
                Thinking partner · reading your whole notebook
              </p>
            </div>
          </div>
          <button
            onClick={clearQuestion}
            className="rounded-full p-1 text-amber-800/50 transition hover:bg-amber-100 hover:text-amber-900 dark:text-amber-200/50 dark:hover:bg-amber-400/20 dark:hover:text-amber-100"
            title="Close discussion"
            aria-label="Close discussion"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {messages.length === 0 && !streaming && mode === "search" && (
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
                ? "self-end max-w-[85%] rounded-2xl rounded-br-sm bg-ink-900 px-4 py-2 text-sm whitespace-pre-wrap text-ink-50 dark:bg-ink-100 dark:text-ink-900"
                : "self-start max-w-[90%]"
            }
          >
            {msg.role === "assistant" ? (
              msg.content === "" && streaming ? (
                <Loader2 className="h-4 w-4 animate-spin text-ink-900/40 dark:text-ink-100/40" />
              ) : (
                <AnswerMarkdown content={msg.content} onFocusEntry={onFocusEntry} />
              )
            ) : (
              msg.content
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
              // Enter submits; Shift+Enter (or Ctrl/Cmd+Enter) inserts a newline.
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                submitInput();
              }
            }}
            rows={2}
            placeholder={
              mode === "question"
                ? "Reply…  (Enter to send, Shift+Enter for newline)"
                : "Ask your entries…  (Enter to send, Shift+Enter for newline)"
            }
            disabled={streaming}
            className="w-full resize-none rounded-2xl border border-ink-200 bg-white px-4 py-3 pr-12 text-sm text-ink-900 placeholder:text-ink-900/40 focus:border-ink-900/30 focus:outline-none focus:ring-0 disabled:opacity-60 dark:border-ink-900 dark:bg-ink-900/40 dark:text-ink-100 dark:placeholder:text-ink-100/40 dark:focus:border-ink-100/30"
          />
          <button
            onClick={submitInput}
            disabled={streaming || !input.trim()}
            className="absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-ink-900 text-ink-50 transition hover:opacity-90 disabled:opacity-30 dark:bg-ink-100 dark:text-ink-900"
            title="Send (Enter)"
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
