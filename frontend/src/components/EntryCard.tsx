import { formatDistanceToNow } from "date-fns";
import {
  CircleCheck,
  CircleHelp,
  Download,
  Link2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import { cn } from "../lib/utils";
import type { Entry } from "../types";

function TagChip({ name }: { name: string }) {
  return (
    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-900/70 dark:bg-ink-900 dark:text-ink-100/70">
      #{name}
    </span>
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
          {entry.ironed_prose && (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-900 dark:text-ink-100">
              {entry.ironed_prose}
            </p>
          )}
          <details className="mt-2 text-xs text-ink-900/40 dark:text-ink-100/40">
            <summary className="cursor-pointer hover:text-ink-900/70 dark:hover:text-ink-100/70">
              raw
            </summary>
            <p className="mt-2 whitespace-pre-wrap rounded-md bg-ink-50 px-3 py-2 text-[13px] text-ink-900/70 dark:bg-ink-950/60 dark:text-ink-100/70">
              {entry.raw_text}
            </p>
          </details>

          {entry.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {entry.tags.map((t) => (
                <TagChip key={t.id} name={t.name} />
              ))}
            </div>
          )}

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
