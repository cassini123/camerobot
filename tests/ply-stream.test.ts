import { describe, expect, it } from "vitest";
import {
  colorFromChannels,
  isGaussianPly,
  parsePlyHeaderText,
  samplePlyFile,
  sampleStride,
  SH_C0,
} from "../lib/ply-stream";
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

  it("decodes 3DGS f_dc spherical-harmonic colors", () => {
    const properties = [
      { name: "x", type: "float" },
      { name: "y", type: "float" },
      { name: "z", type: "float" },
      { name: "f_dc_0", type: "float" },
      { name: "f_dc_1", type: "float" },
      { name: "f_dc_2", type: "float" },
    ];
    const values = [0, 0, 0, 1.7724539, 0, -1.7724539];
    const rgb = colorFromChannels(properties, (index) => values[index]);
    expect(rgb?.[0]).toBeCloseTo(0.5 + SH_C0 * 1.7724539, 5);
    expect(rgb?.[1]).toBeCloseTo(0.5, 5);
    expect(rgb?.[2]).toBeCloseTo(0, 5);
  });

  it("detects 3DGS gaussian ply headers", () => {
    const header = parsePlyHeaderText(
      [
        "ply",
        "format binary_little_endian 1.0",
        "element vertex 10",
        "property float x",
        "property float y",
        "property float z",
        "property float f_dc_0",
        "property float opacity",
        "property float scale_0",
        "end_header",
      ].join("\n"),
    );
    expect(isGaussianPly(header.properties)).toBe(true);
  });

  it("does not treat RGB point clouds as gaussian", () => {
    const header = parsePlyHeaderText(
      [
        "ply",
        "format binary_little_endian 1.0",
        "element vertex 10",
        "property float x",
        "property float y",
        "property float z",
        "property uchar red",
        "property uchar green",
        "property uchar blue",
        "end_header",
      ].join("\n"),
    );
    expect(isGaussianPly(header.properties)).toBe(false);
  });
});

describe("rgb cloud splat pack", () => {
  it("writes 32-byte records", async () => {
    const { rgbCloudToSplat } = await import("../lib/load-scene-model");
    const positions = new Float32Array([0, 0, 0, 1, 0, 0]);
    const colors = new Float32Array([1, 0, 0, 0, 1, 0]);
    const buf = rgbCloudToSplat(positions, colors);
    expect(buf.byteLength).toBe(64);
  });
});

describe("zip store", () => {
  it("builds a zip blob", () => {
    const blob = zipStore([{ name: "a.jpg", data: new Uint8Array([1, 2, 3]) }]);
    expect(blob.size).toBeGreaterThan(30);
    expect(blob.type).toContain("zip");
  });
});

describe("splat formats", () => {
  it("maps plz to a zip filename Spark can infer", async () => {
    const { sparkHintName, canSparkDecodeGaussianPly, isSparkNativeExt } = await import(
      "../lib/splat-formats"
    );
    expect(sparkHintName("hall.plz")).toBe("hall.zip");
    expect(isSparkNativeExt("plz")).toBe(true);
    expect(canSparkDecodeGaussianPly(3_528_201_479)).toBe(false);
    expect(canSparkDecodeGaussianPly(80 * 1024 * 1024)).toBe(true);
  });

  it("loads plz as spark-native without sampling the file as PLY", async () => {
    const { loadUploadedScene } = await import("../lib/load-scene-model");
    const zipMagic = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 1, 2, 3]);
    const file = new File([zipMagic], "hall.plz");
    const { space, visual } = await loadUploadedScene(file);
    expect(space.format).toBe("plz");
    expect(visual?.mode).toBe("spark");
    expect(visual?.splat?.quality).toBe("full");
    expect(visual?.splat?.fileName).toBe("hall.zip");
    expect(visual?.splat?.file).toBe(file);
    expect(visual?.splat?.paged).toBe(false);
  });

  it("renames gzip blobs without an extension to .spz", async () => {
    const { ensureSplatFileName } = await import("../lib/splat-formats");
    const gzip = new Uint8Array([0x1f, 0x8b, 0x08, 0, 1, 2, 3, 4]);
    const file = new File([gzip], "scan");
    const named = await ensureSplatFileName(file);
    expect(named.name).toBe("scan.spz");
  });
});
