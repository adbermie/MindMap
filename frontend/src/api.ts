import type {
  Entry,
  EntrySource,
  SearchHit,
  TagWithCount,
  Task,
  TaskStatus,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

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
};
