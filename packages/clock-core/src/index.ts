export interface ClockPreset {
  id: string;
  name: string;
  durationSeconds: number;
}

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done';

export interface TimerSnapshot {
  status: TimerStatus;
  durationSeconds: number;
  remainingMs: number;
  deadlineMs: number | null;
  warned: boolean;
  completed: boolean;
}

export const DEFAULT_PRESETS: ClockPreset[] = [
  { id: 'break', name: '休息時間', durationSeconds: 5 * 60 },
  { id: 'opening', name: '開場致詞', durationSeconds: 3 * 60 },
  { id: 'speech', name: '主題分享', durationSeconds: 20 * 60 }
];

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function formatCountdown(totalSeconds: number): string {
  const n = Math.max(0, Math.ceil(totalSeconds));
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

export function formatLocalClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

export function newTimer(durationSeconds: number): TimerSnapshot {
  const secs = clampNumber(durationSeconds, 1, 24 * 60 * 60);
  return {
    status: 'idle',
    durationSeconds: secs,
    remainingMs: secs * 1000,
    deadlineMs: null,
    warned: false,
    completed: false
  };
}

export function startTimer(timer: TimerSnapshot, nowMs: number): TimerSnapshot {
  if (timer.status === 'done') timer = newTimer(timer.durationSeconds);
  return { ...timer, status: 'running', deadlineMs: nowMs + timer.remainingMs };
}

export function pauseTimer(timer: TimerSnapshot, nowMs: number): TimerSnapshot {
  if (timer.status !== 'running' || timer.deadlineMs === null) return timer;
  return {
    ...timer,
    status: 'paused',
    remainingMs: Math.max(0, timer.deadlineMs - nowMs),
    deadlineMs: null
  };
}

export function tickTimer(timer: TimerSnapshot, nowMs: number, alertSeconds: number): {
  timer: TimerSnapshot;
  alert: boolean;
  finished: boolean;
} {
  if (timer.status !== 'running' || timer.deadlineMs === null) {
    return { timer, alert: false, finished: false };
  }
  const remaining = Math.max(0, timer.deadlineMs - nowMs);
  const finished = remaining === 0 && !timer.completed;
  const alert = !timer.warned && remaining > 0 && remaining <= clampNumber(alertSeconds, 0, 3600) * 1000;
  return {
    timer: {
      ...timer,
      remainingMs: remaining,
      status: finished ? 'done' : 'running',
      deadlineMs: finished ? null : timer.deadlineMs,
      warned: timer.warned || alert,
      completed: timer.completed || finished
    },
    alert,
    finished
  };
}

export function sanitizePresets(value: unknown): ClockPreset[] {
  if (!Array.isArray(value)) return DEFAULT_PRESETS;
  const presets = value.filter((v): v is ClockPreset =>
    typeof v === 'object' && v !== null && typeof v.id === 'string' && typeof v.name === 'string' &&
    v.name.trim().length > 0 && v.name.trim().length <= 24 &&
    typeof v.durationSeconds === 'number' && Number.isInteger(v.durationSeconds) &&
    v.durationSeconds >= 1 && v.durationSeconds <= 24 * 60 * 60
  ).slice(0, 50);
  return presets.length ? presets : DEFAULT_PRESETS;
}
