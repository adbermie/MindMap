import { formatDistanceToNow } from "date-fns";
import { Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import type { Entry } from "../types";

export function EntryCard({ entry }: { entry: Entry }) {
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () => api.deleteEntry(entry.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entries"] }),
  });

  const ts = formatDistanceToNow(new Date(entry.created_at), { addSuffix: true });

  return (
    <article className="group rounded-xl border border-ink-200 bg-white px-5 py-4 transition hover:border-ink-900/20 dark:border-ink-900 dark:bg-ink-900/40 dark:hover:border-ink-100/20">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-ink-900/40 dark:text-ink-100/40">
        <span>{ts}</span>
        <div className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] uppercase tracking-wider dark:bg-ink-900">
            {entry.status}
          </span>
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
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-900 dark:text-ink-100">
        {entry.raw_text}
      </p>
      {entry.ironed_prose && (
        <div className="mt-3 border-l-2 border-ink-200 pl-3 text-sm text-ink-900/70 dark:border-ink-900 dark:text-ink-100/70">
          {entry.ironed_prose}
        </div>
      )}
    </article>
  );
}
