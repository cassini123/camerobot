import { describe, expect, it } from "vitest";
import { leftPaneNdc, VIEW_SPLIT } from "../lib/view-pane";

describe("left pane NDC", () => {
  const rect = { left: 0, top: 0, width: 1000, height: 500 };

  it("maps the left split independently of the right pane", () => {
    const left = leftPaneNdc(0, 250, rect, true);
    const mid = leftPaneNdc(VIEW_SPLIT * 1000, 250, rect, true);
    const right = leftPaneNdc(VIEW_SPLIT * 1000 + 20, 250, rect, true);
    expect(left).toEqual({ x: -1, y: 0 });
    expect(mid).toEqual({ x: 1, y: 0 });
    expect(right).toBeNull();
  });

  it("uses the full canvas when dual is off", () => {
    const ndc = leftPaneNdc(1000, 0, rect, false);
    expect(ndc).toEqual({ x: 1, y: 1 });
  });
});
