import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect } from "react";

import { api } from "../api";
import { EntryCard } from "./EntryCard";

interface EntryDrawerProps {
  entryId: number | null;
  onClose: () => void;
}

export function EntryDrawer({ entryId, onClose }: EntryDrawerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["entries", "single", entryId],
    queryFn: () => api.getEntry(entryId as number),
    enabled: entryId !== null,
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (entryId !== null) {
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
  }, [entryId, onClose]);

  if (entryId === null) return null;

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button
        onClick={onClose}
        aria-label="Close entry"
        className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm"
      />
      <div className="relative z-10 flex h-full w-full max-w-lg flex-col bg-ink-50 shadow-xl dark:bg-ink-950">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-900">
          <span className="text-xs uppercase tracking-wider text-ink-900/40 dark:text-ink-100/40">
            Entry #{entryId}
          </span>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-ink-900/40 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-100/40 dark:hover:bg-ink-900 dark:hover:text-ink-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <p className="text-sm text-ink-900/40 dark:text-ink-100/40">
              Loading…
            </p>
          )}
          {data && <EntryCard entry={data} />}
        </div>
      </div>
    </div>
  );
}
