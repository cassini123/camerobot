import { describe, expect, it } from "vitest";
import { isShared, sharedBy, WORLD_PLACES } from "../lib/game-world";
import { gameWorldExploreItems } from "../lib/library-explore";

describe("game world sharing", () => {
  it("marks ridge as shared by more than one friend", () => {
    expect(isShared("ridge")).toBe(true);
    expect(sharedBy("ridge").map((f) => f.id)).toContain("heng");
    expect(sharedBy("ridge").map((f) => f.id)).toContain("bei");
  });

  it("does not mark a solo cape as shared", () => {
    expect(isShared("south-cape")).toBe(false);
  });

  it("pins four generated worlds with panos on the map", () => {
    expect(WORLD_PLACES).toHaveLength(4);
    for (const place of WORLD_PLACES) {
      expect(place.pano).toMatch(/^\/library\/worlds\/.+\.jpg$/);
      expect(place.sceneHref).toContain("/yunjing/virtupath?scene=");
    }
    const clips = gameWorldExploreItems();
    expect(clips).toHaveLength(4);
    expect(clips.every((item) => item.kind === "image")).toBe(true);
    expect(clips.every((item) => item.plyUrl && item.spzUrl)).toBe(true);
  });
});
