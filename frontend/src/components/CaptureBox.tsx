import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mic, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api } from "../api";
import { cn } from "../lib/utils";

export function CaptureBox() {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (raw_text: string) => api.createEntry(raw_text, "text"),
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      textareaRef.current?.focus();
    },
  });

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-grow textarea.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 360)}px`;
  }, [text]);

  function submit() {
    const value = text.trim();
    if (!value || create.isPending) return;
    create.mutate(value);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="rounded-2xl border border-ink-200 bg-white shadow-sm transition focus-within:border-ink-900/30 focus-within:shadow-md dark:border-ink-900 dark:bg-ink-900/40 dark:focus-within:border-ink-100/30">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        placeholder="What's on your mind? Just start typing — get it all out."
        className="w-full resize-none bg-transparent px-5 py-4 text-base leading-relaxed text-ink-900 placeholder:text-ink-900/40 focus:outline-none dark:text-ink-100 dark:placeholder:text-ink-100/40"
      />
      <div className="flex items-center justify-between gap-2 border-t border-ink-100 px-3 py-2 dark:border-ink-900">
        <button
          type="button"
          disabled
          title="Voice capture coming Weekend 3"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-ink-900/40 dark:text-ink-100/40"
        >
          <Mic className="h-3.5 w-3.5" />
          Voice (soon)
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-900/40 dark:text-ink-100/40">
            {create.isPending ? "Saving…" : "⌘/Ctrl + Enter"}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || create.isPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3.5 py-1.5 text-xs font-medium text-ink-50 transition dark:bg-ink-100 dark:text-ink-950",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            )}
          >
            <Send className="h-3.5 w-3.5" />
            Save
          </button>
        </div>
      </div>
      {create.isError && (
        <div className="border-t border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {(create.error as Error).message}
        </div>
      )}
    </div>
  );
}
