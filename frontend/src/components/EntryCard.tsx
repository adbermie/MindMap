import { formatDistanceToNow } from "date-fns";
import {
  CircleCheck,
  CircleHelp,
  Download,
  Link2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api } from "../api";
import { cn } from "../lib/utils";
import type { Entry } from "../types";

function EditableTags({ entry }: { entry: Entry }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["entries"] });

  const attach = useMutation({
    mutationFn: (name: string) => api.attachTag(entry.id, name),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      setAdding(false);
      setDraft("");
    },
  });
  const detach = useMutation({
    mutationFn: (name: string) => api.detachTag(entry.id, name),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  function commitAdd() {
    const cleaned = draft.trim().toLowerCase().replace(/\s+/g, "-");
    if (!cleaned) {
      setAdding(false);
      setDraft("");
      return;
    }
    if (entry.tags.some((t) => t.name === cleaned)) {
      setAdding(false);
      setDraft("");
      return;
    }
    attach.mutate(cleaned);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {entry.tags.map((t) => (
        <span
          key={t.id}
          className="group/tag inline-flex items-center gap-0.5 rounded-full bg-ink-100 pl-2 pr-1 py-0.5 text-[11px] text-ink-900/70 dark:bg-ink-900 dark:text-ink-100/70"
        >
          #{t.name}
          <button
            onClick={() => detach.mutate(t.name)}
            disabled={detach.isPending}
            className="ml-0.5 rounded-full p-0.5 text-ink-900/30 opacity-0 transition group-hover/tag:opacity-100 hover:bg-ink-200 hover:text-ink-900 disabled:opacity-40 dark:text-ink-100/30 dark:hover:bg-ink-800 dark:hover:text-ink-100"
            aria-label={`Remove tag ${t.name}`}
            title={`Remove #${t.name}`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitAdd}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitAdd();
            } else if (e.key === "Escape") {
              setAdding(false);
              setDraft("");
            }
          }}
          placeholder="tag-name"
          className="w-24 rounded-full bg-ink-50 px-2 py-0.5 text-[11px] text-ink-900 outline-none ring-1 ring-ink-200 focus:ring-ink-900/30 dark:bg-ink-950 dark:text-ink-100 dark:ring-ink-800 dark:focus:ring-ink-100/30"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          disabled={attach.isPending}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-ink-200 px-1.5 py-0.5 text-[11px] text-ink-900/40 opacity-0 transition hover:border-ink-900/30 hover:text-ink-900/70 disabled:opacity-40 group-hover:opacity-100 dark:border-ink-800 dark:text-ink-100/40 dark:hover:border-ink-100/30 dark:hover:text-ink-100/70"
          aria-label="Add tag"
          title="Add tag"
        >
          <Plus className="h-2.5 w-2.5" />
          tag
        </button>
      )}
    </div>
  );
}

function EditableProse({ entry }: { entry: Entry }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.ironed_prose ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const save = useMutation({
    mutationFn: (ironed_prose: string) =>
      api.updateEntry(entry.id, { ironed_prose }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      setEditing(false);
    },
  });

  useEffect(() => {
    if (editing) {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }
    }
  }, [editing]);

  useEffect(() => {
    setDraft(entry.ironed_prose ?? "");
  }, [entry.ironed_prose]);

  if (!editing) {
    return (
      <p
        onClick={() => setEditing(true)}
        className="cursor-text whitespace-pre-wrap rounded text-[15px] leading-relaxed text-ink-900 hover:bg-ink-50/60 dark:text-ink-100 dark:hover:bg-ink-950/40"
        title="Click to edit"
      >
        {entry.ironed_prose}
      </p>
    );
  }
  return (
    <textarea
      ref={textareaRef}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const el = e.target as HTMLTextAreaElement;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }}
      onBlur={() => {
        if (draft !== (entry.ironed_prose ?? "")) save.mutate(draft);
        else setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setDraft(entry.ironed_prose ?? "");
          setEditing(false);
        } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          if (draft !== (entry.ironed_prose ?? "")) save.mutate(draft);
          else setEditing(false);
        }
      }}
      className="w-full resize-none rounded bg-ink-50 px-2 py-1 text-[15px] leading-relaxed text-ink-900 outline-none ring-1 ring-ink-200 focus:ring-ink-900/30 dark:bg-ink-950 dark:text-ink-100 dark:ring-ink-800 dark:focus:ring-ink-100/30"
    />
  );
}

export function EntryCard({ entry }: { entry: Entry }) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["entries"] });

  const remove = useMutation({
    mutationFn: () => api.deleteEntry(entry.id),
    onSuccess: invalidate,
  });
  const process = useMutation({
    mutationFn: () => api.processEntry(entry.id),
    onSuccess: invalidate,
  });
  const reprocess = useMutation({
    mutationFn: () => api.reprocessEntry(entry.id),
    onSuccess: invalidate,
  });

  const ts = formatDistanceToNow(new Date(entry.created_at), {
    addSuffix: true,
  });
  const ironOutError = (process.error ?? reprocess.error) as Error | undefined;

  return (
    <article
      id={`entry-${entry.id}`}
      className="group rounded-xl border border-ink-200 bg-white px-5 py-4 transition hover:border-ink-900/20 dark:border-ink-900 dark:bg-ink-900/40 dark:hover:border-ink-100/20"
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-ink-900/40 dark:text-ink-100/40">
        <span>{ts}</span>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] uppercase tracking-wider dark:bg-ink-900">
            {entry.status}
          </span>
          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            {entry.status === "processed" && (
              <>
                <a
                  href={api.exportEntryMarkdownUrl(entry.id)}
                  download={`entry-${entry.id}.md`}
                  className="rounded-full p-1 text-ink-900/40 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-100/40 dark:hover:bg-ink-900 dark:hover:text-ink-100"
                  aria-label="Export as Markdown"
                  title="Export as Markdown"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
                <button
                  onClick={() => reprocess.mutate()}
                  disabled={reprocess.isPending}
                  className="rounded-full p-1 text-ink-900/40 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-40 dark:text-ink-100/40 dark:hover:bg-ink-900 dark:hover:text-ink-100"
                  aria-label="Re-iron entry"
                  title="Re-iron this entry"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <button
              onClick={() => {
                if (confirm("Delete this entry?")) remove.mutate();
              }}
              className="rounded-full p-1 text-ink-900/40 hover:bg-red-50 hover:text-red-600 dark:text-ink-100/40 dark:hover:bg-red-950/40"
              aria-label="Delete entry"
              title="Delete entry"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {entry.status === "raw" ? (
        <>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-900 dark:text-ink-100">
            {entry.raw_text}
          </p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-900/40 dark:text-ink-100/40">
              {process.isPending ? "Claude is ironing this out…" : "Raw thought"}
            </span>
            <button
              onClick={() => process.mutate()}
              disabled={process.isPending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3 py-1 text-[11px] font-medium text-ink-50 transition dark:bg-ink-100 dark:text-ink-950",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              <Sparkles className="h-3 w-3" />
              {process.isPending ? "Ironing…" : "Iron out"}
            </button>
          </div>
        </>
      ) : (
        <>
          {entry.ironed_prose && <EditableProse entry={entry} />}
          <details className="mt-2 text-xs text-ink-900/40 dark:text-ink-100/40">
            <summary className="cursor-pointer hover:text-ink-900/70 dark:hover:text-ink-100/70">
              raw
            </summary>
            <p className="mt-2 whitespace-pre-wrap rounded-md bg-ink-50 px-3 py-2 text-[13px] text-ink-900/70 dark:bg-ink-950/60 dark:text-ink-100/70">
              {entry.raw_text}
            </p>
          </details>

          <EditableTags entry={entry} />

          {entry.tasks.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {entry.tasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start gap-2 text-ink-900 dark:text-ink-100"
                >
                  <CircleCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink-900/40 dark:text-ink-100/40" />
                  <span className="flex-1">
                    {t.title}
                    {t.due_hint && (
                      <span className="ml-2 text-[11px] text-ink-900/50 dark:text-ink-100/50">
                        · {t.due_hint}
                      </span>
                    )}
                    {t.priority_hint && t.priority_hint !== "med" && (
                      <span className="ml-2 text-[11px] text-ink-900/50 dark:text-ink-100/50">
                        · {t.priority_hint}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {entry.questions.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5 text-sm text-ink-900/80 dark:text-ink-100/80">
              {entry.questions.map((q) => (
                <li key={q.id} className="flex items-start gap-2">
                  <CircleHelp className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink-900/40 dark:text-ink-100/40" />
                  <span className="flex-1 italic">{q.text}</span>
                </li>
              ))}
            </ul>
          )}

          {entry.links_out.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-900/60 dark:text-ink-100/60">
              <Link2 className="h-3 w-3" />
              {entry.links_out.map((l) => (
                <span
                  key={l.dst_entry_id}
                  className="rounded-full bg-ink-50 px-2 py-0.5 dark:bg-ink-950/60"
                  title={l.reason ?? undefined}
                >
                  → #{l.dst_entry_id}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {ironOutError && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {ironOutError.message}
        </div>
      )}
    </article>
  );
}
