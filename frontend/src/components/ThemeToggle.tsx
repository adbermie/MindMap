import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "../hooks/useTheme";
import { cn } from "../lib/utils";

const options: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "system", icon: Monitor, label: "System" },
  { value: "dark", icon: Moon, label: "Dark" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-ink-200 bg-ink-50 p-0.5 dark:border-ink-900 dark:bg-ink-900/60">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            "rounded-full p-1.5 text-ink-900/60 transition dark:text-ink-100/60",
            theme === value &&
              "bg-white text-ink-900 shadow-sm dark:bg-ink-950 dark:text-ink-100",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
