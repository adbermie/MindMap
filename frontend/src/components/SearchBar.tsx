import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api } from "../api";

interface SearchBarProps {
  onPick: (entryId: number) => void;
}

export function SearchBar({ onPick }: SearchBarProps) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const results = useQuery({
    queryKey: ["search", q],
    queryFn: () => api.search(q),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const hits = results.data ?? [];

  return (
    <div ref={ref} className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-900/40 dark:text-ink-100/40" />
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search…"
        className="w-44 rounded-full border border-ink-200 bg-white py-1 pl-8 pr-3 text-xs text-ink-900 placeholder:text-ink-900/40 focus:border-ink-900/30 focus:outline-none focus:ring-0 dark:border-ink-900 dark:bg-ink-900/40 dark:text-ink-100 dark:placeholder:text-ink-100/40 dark:focus:border-ink-100/30"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute right-0 top-full z-20 mt-1 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lg dark:border-ink-900 dark:bg-ink-950">
          {results.isLoading && (
            <p className="px-3 py-2 text-xs text-ink-900/40 dark:text-ink-100/40">
              Searching…
            </p>
          )}
          {!results.isLoading && hits.length === 0 && (
            <p className="px-3 py-2 text-xs text-ink-900/40 dark:text-ink-100/40">
              No matches
            </p>
          )}
          {hits.map((h) => (
            <button
              key={h.id}
              onClick={() => {
                onPick(h.id);
                setOpen(false);
                setQ("");
              }}
              className="block w-full border-b border-ink-100 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-ink-50 dark:border-ink-900 dark:hover:bg-ink-900/40"
            >
              <div className="font-medium text-ink-900/70 dark:text-ink-100/70">
                Entry #{h.id}
              </div>
              <div
                className="mt-0.5 text-ink-900/60 [&_mark]:bg-yellow-200 [&_mark]:dark:bg-yellow-700/50 [&_mark]:rounded [&_mark]:px-0.5"
                dangerouslySetInnerHTML={{ __html: h.snippet }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
