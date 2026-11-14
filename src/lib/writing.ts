// v315 Writing Time client: dictation + Friday spelling test.
import { CHILD_ID } from './child';

export type WritingKind = 'dictation' | 'spelling';
export interface DictationItem { index: number; text: string }
export interface SpellingItem { index: number; word: string; sentence: string; from_lessons?: boolean }
export interface WritingSet {
  id: string; kind: WritingKind; set_date: string; week_start: string; source: string;
  items: Array<DictationItem | SpellingItem>;
}
export interface WritingAttempt {
  id: string; item_index: number; prompt_text: string; spoken_text: string; drawing_png: string; replays: number;
  started_at: string | null; submitted_at: string; parent_mark: 'right' | 'wrong' | null; parent_note: string | null; marked_by: string | null;
}
export interface WritingDaySet extends WritingSet { week_words: string[]; attempts: WritingAttempt[] }
export interface WritingDaySummary {
  set_date: string;
  kinds: Partial<Record<WritingKind, { items: number; written: number; right: number; wrong: number; last_at: string }>>;
}

const BASE = '/api/class-time/writing';

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json())?.error || ''; } catch { /* noop */ }
    throw new Error(`writing → ${r.status}${detail ? ` ${detail}` : ''}`);
  }
  return r.json() as Promise<T>;
}

export async function fetchWritingSet(kind: WritingKind, date: string): Promise<{ set: WritingSet; done: number[] }> {
  return json(await fetch(`${BASE}?action=set&kind=${kind}&date=${date}&child_id=${CHILD_ID}`, { cache: 'no-store' }));
}

export async function saveWritingAttempt(a: { set_id: string; item_index: number; drawing_png: string; spoken_text: string; replays: number; started_at: string }) {
  return json<{ ok: boolean; id: string }>(await fetch(`${BASE}?action=attempt`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a),
  }));
}

export async function fetchWritingDays(limit = 30): Promise<WritingDaySummary[]> {
  const d = await json<{ days: WritingDaySummary[] }>(await fetch(`${BASE}?action=days&limit=${limit}&child_id=${CHILD_ID}`, { cache: 'no-store' }));
  return d.days || [];
}

export async function fetchWritingDay(date: string): Promise<WritingDaySet[]> {
  const d = await json<{ sets: WritingDaySet[] }>(await fetch(`${BASE}?action=day&date=${date}&child_id=${CHILD_ID}`, { cache: 'no-store' }));
  return d.sets || [];
}

export async function markWriting(attemptId: string, patch: { mark?: 'right' | 'wrong' | null; note?: string | null; by?: string }) {
  return json<{ ok: boolean }>(await fetch(`${BASE}?action=mark`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attempt_id: attemptId, ...patch }),
  }));
}

export function isFriday(d = new Date()) { return d.getDay() === 5; }
