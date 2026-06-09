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

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type ConversationKind = "search" | "question";

export interface ConversationListItem {
  id: number;
  kind: ConversationKind;
  title: string;
  last_activity_at: string;
  has_summary: boolean;
}

export interface ConversationMessageRow {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface Conversation {
  id: number;
  kind: ConversationKind;
  title: string;
  focus_question: string | null;
  seed_entry_id: number | null;
  created_at: string;
  last_activity_at: string;
  summary: string | null;
  last_rollup_at: string | null;
  transcript_pruned: boolean;
  messages: ConversationMessageRow[];
  archived_count: number;
}

export type GraphNodeType = "entry" | "tag";

export interface GraphNode {
  id: string; // "e:<entry_id>" or "t:<name>"
  type: GraphNodeType;
  label: string;
  entry_id: number | null;
  primary_tag: string | null;
  tags: string[];
  status: string | null;
  created_at: string | null;
  count: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "tag" | "link";
  reason: string | null;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
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
