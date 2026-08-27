import { describe, expect, it } from "vitest";
import { matchTools } from "../lib/tools";

describe("natural language tool match", () => {
  it("surfaces follow, orbit, speed and move from the demo prompt", () => {
    const ids = matchTools(
      "让人物走慢一点，镜头从人物侧后方跟拍，最后绕到建筑正面。",
    );
    expect(ids).toContain("follow");
    expect(ids).toContain("orbit");
    expect(ids).toContain("speed");
    expect(ids).toContain("move");
  });

  it("matches lens and height phrases", () => {
    const ids = matchTools("更广角，机位低一点");
    expect(ids).toContain("lens");
    expect(ids).toContain("height");
  });

  it("returns nothing for empty text", () => {
    expect(matchTools("   ")).toEqual([]);
  });
});
