import { describe, expect, it } from "vitest";
import { isShared, sharedBy } from "../lib/game-world";

describe("game world sharing", () => {
  it("marks ridge as shared by more than one friend", () => {
    expect(isShared("ridge")).toBe(true);
    expect(sharedBy("ridge").map((f) => f.id)).toContain("heng");
    expect(sharedBy("ridge").map((f) => f.id)).toContain("bei");
  });

  it("does not mark a solo cape as shared", () => {
    expect(isShared("south-cape")).toBe(false);
  });
});
