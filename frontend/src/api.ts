import type {
  ChatMessage,
  Entry,
  EntrySource,
  GraphPayload,
  SearchHit,
  TagWithCount,
  Task,
  TaskStatus,
} from "./types";

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

interface ChatHandlers {
  onContext?: (entryIds: number[]) => void;
  onToken: (text: string) => void;
  signal?: AbortSignal;
}

interface ChatOptions {
  mode?: "search" | "question";
  focusQuestion?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listEntries: (limit = 50, beforeId?: number) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (beforeId !== undefined) params.set("before_id", String(beforeId));
    return request<Entry[]>(`/entries?${params.toString()}`);
  },
  createEntry: (raw_text: string, source: EntrySource = "text") =>
    request<Entry>(`/entries`, {
      method: "POST",
      body: JSON.stringify({ raw_text, source }),
    }),
  updateEntry: (
    id: number,
    patch: Partial<Pick<Entry, "raw_text" | "ironed_prose" | "status">>,
  ) =>
    request<Entry>(`/entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteEntry: (id: number) =>
    request<void>(`/entries/${id}`, { method: "DELETE" }),
  processEntry: (id: number) =>
    request<Entry>(`/entries/${id}/process`, { method: "POST" }),
  reprocessEntry: (id: number, instruction?: string) =>
    request<Entry>(`/entries/${id}/reprocess`, {
      method: "POST",
      body: JSON.stringify({ instruction: instruction ?? null }),
    }),
  exportEntryMarkdownUrl: (id: number) => `${API_BASE}/entries/${id}/export.md`,
  listTags: () => request<TagWithCount[]>(`/tags`),
  listTasks: (opts: { status?: TaskStatus; tag?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.tag) params.set("tag", opts.tag);
    const qs = params.toString();
    return request<Task[]>(`/tasks${qs ? `?${qs}` : ""}`);
  },
  updateTask: (id: number, patch: Partial<Task>) =>
    request<Task>(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  search: (q: string) =>
    request<SearchHit[]>(`/search?q=${encodeURIComponent(q)}`),
  attachTag: (entryId: number, name: string) =>
    request<Entry>(`/entries/${entryId}/tags`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  detachTag: (entryId: number, name: string) =>
    request<Entry>(`/entries/${entryId}/tags/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),
  getEntry: (id: number) => request<Entry>(`/entries/${id}`),
  getGraph: () => request<GraphPayload>(`/graph`),
  transcribe: async (audio: Blob): Promise<{ text: string; language: string | null }> => {
    const fd = new FormData();
    const ext = audio.type.includes("webm")
      ? "webm"
      : audio.type.includes("ogg")
        ? "ogg"
        : audio.type.includes("mp4") || audio.type.includes("m4a")
          ? "m4a"
          : "wav";
    fd.append("audio", audio, `clip.${ext}`);
    const res = await fetch(`${API_BASE}/transcribe`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
    return res.json();
  },
  // Streamed chat over the user's entries. Resolves when the stream ends;
  // tokens arrive via handlers.onToken as they're generated.
  chat: async (
    messages: ChatMessage[],
    handlers: ChatHandlers,
    opts: ChatOptions = {},
  ): Promise<void> => {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        mode: opts.mode ?? "search",
        focus_question: opts.focusQuestion ?? null,
      }),
      signal: handlers.signal,
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const evt = JSON.parse(line.slice(5).trim());
        if (evt.type === "context") handlers.onContext?.(evt.entry_ids);
        else if (evt.type === "token") handlers.onToken(evt.text);
        else if (evt.type === "error") throw new Error(evt.detail);
      }
    }
  },
};
