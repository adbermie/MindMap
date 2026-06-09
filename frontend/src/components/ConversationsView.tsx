import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronLeft,
  CornerDownLeft,
  Loader2,
  MessageCircleQuestion,
  MessageSquare,
  Plus,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { api } from "../api";
import { cn } from "../lib/utils";
import type { ConversationMessageRow } from "../types";

export interface ChatSeed {
  question: string;
  entryId: number;
  key: number; // bumped on every click so re-clicking re-opens
}

type LiveMessage = { role: "user" | "assistant"; content: string };

// Turn [#id] citations into markdown links → clickable chips (see renderer).
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
              <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
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

function MessageBubble({
  msg,
  streaming,
  onFocusEntry,
}: {
  msg: LiveMessage;
  streaming: boolean;
  onFocusEntry: (id: number) => void;
}): ReactNode {
  if (msg.role === "user") {
    return (
      <div className="self-end max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-ink-900 px-4 py-2 text-sm text-ink-50 dark:bg-ink-100 dark:text-ink-900">
        {msg.content}
      </div>
    );
  }
  return (
    <div className="self-start max-w-[90%]">
      {msg.content === "" && streaming ? (
        <Loader2 className="h-4 w-4 animate-spin text-ink-900/40 dark:text-ink-100/40" />
      ) : (
        <AnswerMarkdown content={msg.content} onFocusEntry={onFocusEntry} />
      )}
    </div>
  );
}

// ---- sidebar ----------------------------------------------------------------

function Sidebar({
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: api.listConversations,
  });
  const items = data ?? [];

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={onNew}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-900 transition hover:border-ink-900/30 dark:border-ink-900 dark:bg-ink-900/40 dark:text-ink-100 dark:hover:border-ink-100/30"
      >
        <Plus className="h-4 w-4" />
        New chat
      </button>
      {isLoading && (
        <p className="px-2 py-1 text-xs text-ink-900/40 dark:text-ink-100/40">Loading…</p>
      )}
      {!isLoading && items.length === 0 && (
        <p className="px-2 py-1 text-xs text-ink-900/40 dark:text-ink-100/40">
          No conversations yet.
        </p>
      )}
      <div className="flex flex-col gap-1">
        {items.map((c) => (
          <div
            key={c.id}
            className={cn(
              "group/conv flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition",
              c.id === activeId
                ? "bg-ink-100 dark:bg-ink-800"
                : "hover:bg-ink-50 dark:hover:bg-ink-900/50",
            )}
          >
            <button onClick={() => onSelect(c.id)} className="flex min-w-0 flex-1 items-start gap-2">
              {c.kind === "question" ? (
                <MessageCircleQuestion className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              ) : (
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink-900/40 dark:text-ink-100/40" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-ink-900 dark:text-ink-100">
                  {c.title}
                </span>
                <span className="block text-[10px] text-ink-900/40 dark:text-ink-100/40">
                  {formatDistanceToNow(new Date(c.last_activity_at), { addSuffix: true })}
                </span>
              </span>
            </button>
            <button
              onClick={() => {
                if (confirm("Delete this conversation?")) onDelete(c.id);
              }}
              className="rounded p-1 text-ink-900/30 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover/conv:opacity-100 dark:text-ink-100/30 dark:hover:bg-red-950/40"
              aria-label="Delete conversation"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- thread -----------------------------------------------------------------

function ConversationThread({
  conversationId,
  initialSend,
  onFocusEntry,
  onChanged,
  onInitialSendConsumed,
  onBack,
}: {
  conversationId: number;
  initialSend: string | null;
  onFocusEntry: (id: number) => void;
  onChanged: () => void;
  onInitialSendConsumed: () => void;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => api.getConversation(conversationId),
    staleTime: Infinity,
  });
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<ConversationMessageRow[] | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const seededRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    setError(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    setStreaming(true);
    try {
      await api.sendConversationMessage(conversationId, text, {
        onToken: (t) =>
          setMessages((prev) => {
            const next = [...prev];
            const i = next.length - 1;
            next[i] = { ...next[i], content: next[i].content + t };
            return next;
          }),
      });
      onChanged();
      // Refresh title/summary on the thread (e.g. auto-title after 1st message).
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
      setMessages((prev) => {
        const next = [...prev];
        if (next.length && next[next.length - 1].content === "") next.pop();
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }

  // Seed live messages from the loaded conversation, then auto-send a seeded
  // question (for question threads opened from the feed).
  useEffect(() => {
    if (!data || seededRef.current) return;
    seededRef.current = true;
    setMessages(data.messages.map((m) => ({ role: m.role, content: m.content })));
    if (initialSend && data.messages.length === 0) {
      void send(initialSend);
      onInitialSendConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function toggleTranscript() {
    if (!showTranscript && transcript === null) {
      try {
        setTranscript(await api.getTranscript(conversationId));
      } catch {
        setTranscript([]);
      }
    }
    setShowTranscript((s) => !s);
  }

  if (isLoading || !data) {
    return <p className="px-1 text-sm text-ink-900/40 dark:text-ink-100/40">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="rounded-lg p-1 text-ink-900/50 hover:bg-ink-100 md:hidden dark:text-ink-100/50 dark:hover:bg-ink-800"
          aria-label="Back to conversations"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="flex items-center gap-2 text-sm font-medium text-ink-900 dark:text-ink-100">
          {data.kind === "question" && (
            <MessageCircleQuestion className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          )}
          {data.title}
        </h3>
      </div>

      {data.summary && (
        <div className="rounded-xl border border-ink-200 bg-ink-50/60 px-4 py-3 dark:border-ink-900 dark:bg-ink-950/40">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-900/40 dark:text-ink-100/40">
            Summary so far
          </div>
          <AnswerMarkdown content={data.summary} onFocusEntry={onFocusEntry} />
          {(data.archived_count > 0 || data.transcript_pruned) && (
            <button
              onClick={toggleTranscript}
              className="mt-2 text-[11px] text-ink-900/50 underline underline-offset-2 hover:text-ink-900 dark:text-ink-100/50 dark:hover:text-ink-100"
            >
              {showTranscript
                ? "Hide earlier transcript"
                : data.transcript_pruned
                  ? "Earlier transcript was pruned"
                  : `View earlier transcript (${data.archived_count})`}
            </button>
          )}
        </div>
      )}

      {showTranscript && transcript && transcript.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-ink-200 px-4 py-3 dark:border-ink-900">
          {transcript
            .filter((m) => !messages.some((lm) => lm.content === m.content && lm.role === m.role))
            .map((m) => (
              <MessageBubble
                key={m.id}
                msg={{ role: m.role, content: m.content }}
                streaming={false}
                onFocusEntry={onFocusEntry}
              />
            ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} streaming={streaming} onFocusEntry={onFocusEntry} />
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-1 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="sticky bottom-4 mt-2">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                const text = input.trim();
                if (text && !streaming) {
                  setInput("");
                  void send(text);
                }
              }
            }}
            rows={2}
            placeholder={
              data.kind === "question"
                ? "Reply…  (Enter to send, Shift+Enter for newline)"
                : "Ask your entries…  (Enter to send, Shift+Enter for newline)"
            }
            disabled={streaming}
            className="w-full resize-none rounded-2xl border border-ink-200 bg-white px-4 py-3 pr-12 text-sm text-ink-900 placeholder:text-ink-900/40 focus:border-ink-900/30 focus:outline-none focus:ring-0 disabled:opacity-60 dark:border-ink-900 dark:bg-ink-900/40 dark:text-ink-100 dark:placeholder:text-ink-100/40 dark:focus:border-ink-100/30"
          />
          <button
            onClick={() => {
              const text = input.trim();
              if (text && !streaming) {
                setInput("");
                void send(text);
              }
            }}
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

// ---- container --------------------------------------------------------------

export function ConversationsView({
  onFocusEntry,
  seed,
  onSeedConsumed,
}: {
  onFocusEntry: (entryId: number) => void;
  seed: ChatSeed | null;
  onSeedConsumed: () => void;
}) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [initialSend, setInitialSend] = useState<string | null>(null);

  // A question was clicked in the feed → create a question thread and open it.
  useEffect(() => {
    if (!seed) return;
    let cancelled = false;
    (async () => {
      const conv = await api.createConversation({
        kind: "question",
        focus_question: seed.question,
        seed_entry_id: seed.entryId,
      });
      if (cancelled) return;
      qc.invalidateQueries({ queryKey: ["conversations"] });
      setActiveId(conv.id);
      setInitialSend(seed.question);
      onSeedConsumed();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.key]);

  async function newChat() {
    const conv = await api.createConversation({ kind: "search" });
    qc.invalidateQueries({ queryKey: ["conversations"] });
    setInitialSend(null);
    setActiveId(conv.id);
  }

  async function del(id: number) {
    await api.deleteConversation(id);
    qc.invalidateQueries({ queryKey: ["conversations"] });
    if (activeId === id) setActiveId(null);
  }

  return (
    <div className="flex gap-5">
      <div
        className={cn(
          "w-full shrink-0 md:w-60",
          activeId !== null ? "hidden md:block" : "block",
        )}
      >
        <Sidebar
          activeId={activeId}
          onSelect={(id) => {
            setInitialSend(null);
            setActiveId(id);
          }}
          onNew={newChat}
          onDelete={del}
        />
      </div>
      <div className={cn("min-w-0 flex-1", activeId === null ? "hidden md:block" : "block")}>
        {activeId !== null ? (
          <ConversationThread
            key={activeId}
            conversationId={activeId}
            initialSend={initialSend}
            onFocusEntry={onFocusEntry}
            onChanged={() => qc.invalidateQueries({ queryKey: ["conversations"] })}
            onInitialSendConsumed={() => setInitialSend(null)}
            onBack={() => setActiveId(null)}
          />
        ) : (
          <div className="hidden h-full items-center justify-center rounded-xl border border-dashed border-ink-200 py-20 text-sm text-ink-900/40 md:flex dark:border-ink-900 dark:text-ink-100/40">
            Select a conversation, or start a new one.
          </div>
        )}
      </div>
    </div>
  );
}
