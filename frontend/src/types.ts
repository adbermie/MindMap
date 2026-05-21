export type EntrySource = "text" | "voice";
export type EntryStatus = "raw" | "processed" | "archived";
export type TaskStatus = "open" | "done" | "dropped";
export type PriorityHint = "low" | "med" | "high";

export interface Tag {
  id: number;
  name: string;
  color: string | null;
}

export interface TagWithCount extends Tag {
  entry_count: number;
}

export interface SearchHit {
  id: number;
  snippet: string;
  rank: number;
}

export interface Task {
  id: number;
  entry_id: number;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority_hint: PriorityHint | null;
  due_hint: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Question {
  id: number;
  entry_id: number;
  text: string;
  dismissed_at: string | null;
}

export interface EntryLink {
  dst_entry_id: number;
  reason: string | null;
  weight: number;
}

export interface Entry {
  id: number;
  created_at: string;
  updated_at: string;
  raw_text: string;
  source: EntrySource;
  processed_at: string | null;
  ironed_prose: string | null;
  status: EntryStatus;
  tags: Tag[];
  tasks: Task[];
  questions: Question[];
  links_out: EntryLink[];
}
