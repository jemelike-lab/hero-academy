// Thin client over the existing Vercel API routes. Contracts are unchanged
// from the legacy app (see api/class-time/*.js headers).
import { CHILD_ID } from './child';

export type BoardTool = 'writeWord' | 'writeLetter' | 'drawEquation' | 'showVisual' | 'clearBoard';
export interface BoardAction { tool: BoardTool; args: Record<string, string> }
export interface RemediationStep { say: string; board: BoardAction | null }
export interface Question {
  topic: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  hint: string;
  remediation: { intro: string; steps: RemediationStep[]; outro: string };
  image_subject?: string | null;
  description?: string | null;
}
export interface CourseTopic { id: string; title: string; focus: string; tools: string[] }
export interface Course {
  order: number;
  subject: string;
  subject_label: string;
  board_mode: string;
  why_chosen: string;
  target_minutes: number;
  topics: CourseTopic[];
}
export interface DayPlan { date: string; theme: string; courses: Course[]; source: string }
export interface CourseProgress {
  course_order: number;
  subject: string;
  started_at: string | null;
  completed_at: string | null;
  topics_covered: string[];
}

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json() as Promise<T>;
}

export async function fetchDayPlan(date: string): Promise<DayPlan> {
  const data = await getJSON<{ plan: DayPlan }>(`/api/class-time/lesson-plan-day?date=${date}&child_id=${CHILD_ID}`);
  return data.plan;
}

export async function fetchCourseProgress(date: string): Promise<CourseProgress[]> {
  const data = await getJSON<{ progress?: CourseProgress[] } | CourseProgress[]>(
    `/api/class-time/course-progress?date=${date}&child_id=${CHILD_ID}`,
  );
  return Array.isArray(data) ? data : data.progress || [];
}

export async function fetchQuestions(date: string, courseOrder: number): Promise<{ subject: string; questions: Question[] }> {
  const data = await getJSON<{ ok: boolean; subject: string; questions: Question[] }>(
    `/api/class-time/questions?date=${date}&child_id=${CHILD_ID}&course_order=${courseOrder}`,
  );
  return { subject: data.subject, questions: data.questions || [] };
}

export async function recordCourse(date: string, courseOrder: number, subject: string, topicsCovered: string[]) {
  const body = JSON.stringify({ child_id: CHILD_ID, date, course_order: courseOrder, subject, topics_covered: topicsCovered });
  const r = await fetch('/api/class-time/record-course', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
  if (!r.ok) throw new Error(`record-course → ${r.status}`);
}

export async function lookupImage(subject: string): Promise<{ image_url: string | null; caption?: string; attribution?: string }> {
  const r = await fetch('/api/class-time/lookup-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject }) });
  if (!r.ok) return { image_url: null };
  return r.json();
}

export function recordEvent(eventType: string, payload: Record<string, unknown> = {}) {
  try {
    const body = JSON.stringify({ child_id: CHILD_ID, event_type: eventType, payload });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/record-event', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/record-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
    }
  } catch { /* telemetry is best-effort */ }
}
