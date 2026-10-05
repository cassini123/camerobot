/** Arduino-style serial monitor lines for the flyvision workbench. */

export type MonitorLevel = "ERR" | "OK" | "INFO";

export type MonitorLine = {
  id: number;
  t: number;
  level: MonitorLevel;
  msg: string;
};

export function formatMonitorTime(t: number): string {
  const date = new Date(t);
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export function formatMonitorLine(line: Pick<MonitorLine, "t" | "level" | "msg">): string {
  return `[${formatMonitorTime(line.t)}] ${line.level.padEnd(4)} ${line.msg}`;
}

export function shouldThrottle(lastAt: number | undefined, now: number, windowMs: number): boolean {
  return lastAt != null && now - lastAt < windowMs;
}

export function appendMonitorLine(list: MonitorLine[], line: MonitorLine, limit = 200): MonitorLine[] {
  const next = [...list, line];
  return next.length > limit ? next.slice(next.length - limit + 20) : next;
}
