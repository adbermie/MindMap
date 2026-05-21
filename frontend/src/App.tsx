import { Brain } from "lucide-react";
import { useState } from "react";

import { CaptureBox } from "./components/CaptureBox";
import { SearchBar } from "./components/SearchBar";
import { TasksView } from "./components/TasksView";
import { ThemeToggle } from "./components/ThemeToggle";
import { Timeline } from "./components/Timeline";
import { cn } from "./lib/utils";

type View = "feed" | "tasks";

export default function App() {
  const [view, setView] = useState<View>("feed");

  function focusEntry(entryId: number) {
    setView("feed");
    // Wait for the feed to render, then scroll the entry into view.
    setTimeout(() => {
      const el = document.getElementById(`entry-${entryId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-amber-400");
        setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 1800);
      }
    }, 50);
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-ink-200 bg-ink-50/80 backdrop-blur dark:border-ink-900 dark:bg-ink-950/80">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Brain className="h-4 w-4" />
              MindMap
            </div>
            <nav className="inline-flex rounded-full bg-ink-100 p-0.5 text-xs dark:bg-ink-900">
              {(["feed", "tasks"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-full px-3 py-1 capitalize transition",
                    view === v
                      ? "bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-ink-100"
                      : "text-ink-900/60 hover:text-ink-900 dark:text-ink-100/60 dark:hover:text-ink-100",
                  )}
                >
                  {v}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <SearchBar onPick={focusEntry} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        {view === "feed" ? (
          <>
            <section className="mb-8">
              <CaptureBox />
            </section>
            <section>
              <h2 className="mb-3 px-1 text-xs uppercase tracking-wider text-ink-900/40 dark:text-ink-100/40">
                Recent
              </h2>
              <Timeline />
            </section>
          </>
        ) : (
          <section>
            <h2 className="mb-3 px-1 text-xs uppercase tracking-wider text-ink-900/40 dark:text-ink-100/40">
              Tasks
            </h2>
            <TasksView />
          </section>
        )}
      </main>
    </div>
  );
}
