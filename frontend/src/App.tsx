import { Brain } from "lucide-react";

import { CaptureBox } from "./components/CaptureBox";
import { Timeline } from "./components/Timeline";
import { ThemeToggle } from "./components/ThemeToggle";

export default function App() {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-ink-200 bg-ink-50/80 backdrop-blur dark:border-ink-900 dark:bg-ink-950/80">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Brain className="h-4 w-4" />
            MindMap
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        <section className="mb-8">
          <CaptureBox />
        </section>

        <section>
          <h2 className="mb-3 px-1 text-xs uppercase tracking-wider text-ink-900/40 dark:text-ink-100/40">
            Recent
          </h2>
          <Timeline />
        </section>
      </main>
    </div>
  );
}
