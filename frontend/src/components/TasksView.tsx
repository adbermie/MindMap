import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckSquare, Square, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { api } from "../api";
import { cn } from "../lib/utils";
import type { Task, TaskStatus } from "../types";

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
  { value: "dropped", label: "Dropped" },
];

export function TasksView() {
  const [status, setStatus] = useState<TaskStatus>("open");
  const [tag, setTag] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const tasksQ = useQuery({
    queryKey: ["tasks", status, tag],
    queryFn: () => api.listTasks({ status, tag: tag ?? undefined }),
  });
  const tagsQ = useQuery({
    queryKey: ["tags"],
    queryFn: api.listTags,
  });

  const toggle = useMutation({
    mutationFn: (t: Task) =>
      api.updateTask(t.id, {
        status: t.status === "done" ? "open" : "done",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
  });

  const drop = useMutation({
    mutationFn: (t: Task) => api.updateTask(t.id, { status: "dropped" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
  });

  const usedTags = (tagsQ.data ?? []).filter((t) => t.entry_count > 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
        <div className="inline-flex rounded-full bg-ink-100 p-0.5 dark:bg-ink-900">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={cn(
                "rounded-full px-3 py-1 transition",
                status === s.value
                  ? "bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-ink-100"
                  : "text-ink-900/60 hover:text-ink-900 dark:text-ink-100/60 dark:hover:text-ink-100",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {usedTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setTag(null)}
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px]",
                tag === null
                  ? "bg-ink-900 text-ink-50 dark:bg-ink-100 dark:text-ink-950"
                  : "bg-ink-100 text-ink-900/70 hover:bg-ink-200 dark:bg-ink-900 dark:text-ink-100/70 dark:hover:bg-ink-800",
              )}
            >
              all
            </button>
            {usedTags.map((t) => (
              <button
                key={t.id}
                onClick={() => setTag(tag === t.name ? null : t.name)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px]",
                  tag === t.name
                    ? "bg-ink-900 text-ink-50 dark:bg-ink-100 dark:text-ink-950"
                    : "bg-ink-100 text-ink-900/70 hover:bg-ink-200 dark:bg-ink-900 dark:text-ink-100/70 dark:hover:bg-ink-800",
                )}
              >
                #{t.name}
                <span className="ml-1 opacity-50">{t.entry_count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {tasksQ.isLoading && (
        <p className="px-1 text-sm text-ink-900/40 dark:text-ink-100/40">
          Loading…
        </p>
      )}
      {tasksQ.error && (
        <p className="px-1 text-sm text-red-600 dark:text-red-400">
          Failed to load tasks: {(tasksQ.error as Error).message}
        </p>
      )}
      {tasksQ.data && tasksQ.data.length === 0 && (
        <div className="rounded-xl border border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-900/50 dark:border-ink-900 dark:text-ink-100/50">
          No {status} tasks{tag ? ` tagged #${tag}` : ""}.
        </div>
      )}

      <ul className="flex flex-col divide-y divide-ink-100 rounded-xl border border-ink-200 bg-white dark:divide-ink-900 dark:border-ink-900 dark:bg-ink-900/40">
        {(tasksQ.data ?? []).map((t) => {
          const Checkbox = t.status === "done" ? CheckSquare : Square;
          const created = formatDistanceToNow(new Date(t.created_at), {
            addSuffix: true,
          });
          return (
            <li
              key={t.id}
              className="group flex items-center gap-3 px-4 py-2.5 text-sm"
            >
              <button
                onClick={() => toggle.mutate(t)}
                disabled={toggle.isPending}
                className="text-ink-900/40 transition hover:text-ink-900 disabled:opacity-40 dark:text-ink-100/40 dark:hover:text-ink-100"
                aria-label={
                  t.status === "done" ? "Mark task open" : "Mark task done"
                }
              >
                <Checkbox className="h-4 w-4" />
              </button>
              <span
                className={cn(
                  "flex-1",
                  t.status === "done"
                    ? "text-ink-900/40 line-through dark:text-ink-100/40"
                    : "text-ink-900 dark:text-ink-100",
                )}
              >
                {t.title}
                {(t.due_hint || t.priority_hint) && (
                  <span className="ml-2 text-[11px] text-ink-900/50 dark:text-ink-100/50">
                    {[t.priority_hint && t.priority_hint !== "med" ? t.priority_hint : null, t.due_hint]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </span>
              <span className="hidden text-[11px] text-ink-900/40 sm:inline dark:text-ink-100/40">
                #{t.entry_id} · {created}
              </span>
              {t.status !== "dropped" && (
                <button
                  onClick={() => drop.mutate(t)}
                  className="rounded p-1 text-ink-900/30 opacity-0 transition group-hover:opacity-100 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-100/30 dark:hover:bg-ink-900 dark:hover:text-ink-100"
                  title="Drop task"
                  aria-label="Drop task"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
