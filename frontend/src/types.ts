export type EntrySource = "text" | "voice";
export type EntryStatus = "raw" | "processed" | "archived";

export interface Entry {
  id: number;
  created_at: string;
  updated_at: string;
  raw_text: string;
  source: EntrySource;
  processed_at: string | null;
  ironed_prose: string | null;
  status: EntryStatus;
}
