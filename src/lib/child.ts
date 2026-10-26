// Single-child deployment. Same constants the legacy pages use.
export const CHILD_ID = '2e0e51c5-f120-4152-8aa1-041eeecc8165';
export const KID_NAME = 'Nigel';

export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isGameDay(d = new Date()): boolean {
  return d.getDay() === 2 || d.getDay() === 4; // Tue / Thu
}
