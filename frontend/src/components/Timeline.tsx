import { useQuery } from "@tanstack/react-query";

import { api } from "../api";
import { EntryCard } from "./EntryCard";

export function Timeline() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["entries"],
    queryFn: () => api.listEntries(100),
  });

  if (isLoading) {
    return <p className="px-1 text-sm text-ink-900/40 dark:text-ink-100/40">Loading…</p>;
  }

  if (error) {
    return (
      <p className="px-1 text-sm text-red-600 dark:text-red-400">
        Failed to load entries: {(error as Error).message}
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-900/50 dark:border-ink-900 dark:text-ink-100/50">
        No entries yet. Dump something above.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {data.map((e) => (
        <EntryCard key={e.id} entry={e} />
      ))}
    </div>
  );
}
