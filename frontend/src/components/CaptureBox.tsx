import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mic, MicOff, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api } from "../api";
import { cn } from "../lib/utils";

type RecordState = "idle" | "recording" | "transcribing" | "error";

export function CaptureBox() {
  const [text, setText] = useState("");
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [recordError, setRecordError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
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

  async function startRecording() {
    setRecordError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        if (blob.size === 0) {
          setRecordState("idle");
          return;
        }
        setRecordState("transcribing");
        try {
          const { text: transcribed } = await api.transcribe(blob);
          if (transcribed) {
            setText((prev) => (prev ? `${prev.trimEnd()} ${transcribed}` : transcribed));
          }
          setRecordState("idle");
          textareaRef.current?.focus();
        } catch (err) {
          setRecordError(err instanceof Error ? err.message : String(err));
          setRecordState("error");
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecordState("recording");
    } catch (err) {
      setRecordError(
        err instanceof Error ? err.message : "Could not access microphone",
      );
      setRecordState("error");
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
  }

  function toggleRecording() {
    if (recordState === "recording") stopRecording();
    else if (recordState === "idle" || recordState === "error") startRecording();
  }

  const micLabel =
    recordState === "recording"
      ? "Stop recording"
      : recordState === "transcribing"
        ? "Transcribing…"
        : "Record voice";

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
          onClick={toggleRecording}
          disabled={recordState === "transcribing"}
          title={micLabel}
          aria-label={micLabel}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition",
            recordState === "recording"
              ? "bg-red-500 text-white"
              : "text-ink-900/60 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-100/60 dark:hover:bg-ink-900 dark:hover:text-ink-100",
            recordState === "transcribing" && "opacity-50 cursor-not-allowed",
          )}
        >
          {recordState === "recording" ? (
            <>
              <MicOff className="h-3.5 w-3.5" />
              Stop
            </>
          ) : (
            <>
              <Mic className="h-3.5 w-3.5" />
              {recordState === "transcribing" ? "Transcribing…" : "Voice"}
            </>
          )}
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
      {recordError && (
        <div className="border-t border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {recordError}
        </div>
      )}
      {create.isError && (
        <div className="border-t border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {(create.error as Error).message}
        </div>
      )}
    </div>
  );
}
