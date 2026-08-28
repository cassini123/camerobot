import { describe, expect, it } from "vitest";
import { parsePlyHeaderText, sampleStride, samplePlyFile } from "../lib/ply-stream";
import { zipStore } from "../lib/zip-store";

describe("ply streaming", () => {
  it("parses a binary header", () => {
    const header = parsePlyHeaderText(
      [
        "ply",
        "format binary_little_endian 1.0",
        "element vertex 1000000",
        "property float x",
        "property float y",
        "property float z",
        "property uchar red",
        "property uchar green",
        "property uchar blue",
        "end_header",
      ].join("\n"),
    );
    expect(header.format).toBe("binary_little_endian");
    expect(header.vertexCount).toBe(1_000_000);
    expect(header.vertexSize).toBe(15);
    expect(sampleStride(header.vertexCount)).toBeGreaterThan(1);
  });

  it("samples a tiny binary ply without loading extra vertices", async () => {
    const text = [
      "ply",
      "format binary_little_endian 1.0",
      "element vertex 3",
      "property float x",
      "property float y",
      "property float z",
      "end_header\n",
    ].join("\n");
    const head = new TextEncoder().encode(text);
    const body = new ArrayBuffer(36);
    const view = new DataView(body);
    view.setFloat32(0, 1, true);
    view.setFloat32(4, 2, true);
    view.setFloat32(8, 3, true);
    view.setFloat32(12, 4, true);
    view.setFloat32(16, 5, true);
    view.setFloat32(20, 6, true);
    view.setFloat32(24, 7, true);
    view.setFloat32(28, 8, true);
    view.setFloat32(32, 9, true);
    const file = new File([head, body], "tiny.ply");
    const sampled = await samplePlyFile(file);
    expect(sampled.kept).toBe(3);
    expect(sampled.positions[0]).toBeCloseTo(1);
    expect(sampled.positions[8]).toBeCloseTo(9);
  });
});

describe("zip store", () => {
  it("builds a zip blob", () => {
    const blob = zipStore([{ name: "a.jpg", data: new Uint8Array([1, 2, 3]) }]);
    expect(blob.size).toBeGreaterThan(30);
    expect(blob.type).toContain("zip");
  });
});
