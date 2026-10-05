import { describe, expect, it } from "vitest";
import {
  appendMonitorLine,
  formatMonitorLine,
  formatMonitorTime,
  shouldThrottle,
  type MonitorLine,
} from "@/lib/flyvision-monitor";

describe("serial monitor lines", () => {
  it("prints a clock stamp with milliseconds", () => {
    expect(formatMonitorTime(Date.UTC(2026, 9, 5, 6, 7, 8, 9))).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it("keeps Arduino-style ERR/OK/INFO rows", () => {
    const text = formatMonitorLine({ t: Date.UTC(2026, 9, 5, 6, 7, 8, 9), level: "ERR", msg: "没有可用的 YOLO 帧" });
    expect(text).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\] ERR  没有可用的 YOLO 帧$/);
    expect(formatMonitorLine({ t: 0, level: "OK", msg: "本机 YOLO 就绪" })).toContain("OK  ");
    expect(formatMonitorLine({ t: 0, level: "INFO", msg: "监视器已开" })).toContain("INFO");
  });

  it("throttles repeated match noise", () => {
    expect(shouldThrottle(undefined, 1000, 1500)).toBe(false);
    expect(shouldThrottle(1000, 2000, 1500)).toBe(true);
    expect(shouldThrottle(1000, 2600, 1500)).toBe(false);
  });

  it("caps the log so the monitor does not grow forever", () => {
    const seed: MonitorLine[] = Array.from({ length: 199 }, (_, id) => ({
      id,
      t: id,
      level: "INFO",
      msg: String(id),
    }));
    const next = appendMonitorLine(seed, { id: 199, t: 199, level: "ERR", msg: "满了" }, 200);
    expect(next).toHaveLength(200);
    const overflow = appendMonitorLine(next, { id: 200, t: 200, level: "ERR", msg: "再来" }, 200);
    expect(overflow.length).toBeLessThanOrEqual(200);
    expect(overflow.at(-1)?.msg).toBe("再来");
  });
});
