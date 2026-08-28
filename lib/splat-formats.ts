export const SPARK_BUFFER_MAX_BYTES = 800 * 1024 * 1024;
/** Compressed 3DGS (PLZ / SPZ / SOG) can stream larger than a raw PLY buffer. */
export const SPARK_STREAM_MAX_BYTES = 1500 * 1024 * 1024;

export const SPARK_NATIVE_EXTS = [
  "spz",
  "sog",
  "plz",
  "zip",
  "rad",
  "ksplat",
] as const;

export type SparkNativeExt = (typeof SPARK_NATIVE_EXTS)[number];

export function extOf(name: string): string {
  const base = name.split("?")[0]?.split("#")[0] ?? name;
  return base.split(".").pop()?.toLowerCase() ?? "";
}

export function isSparkNativeExt(ext: string): ext is SparkNativeExt {
  return (SPARK_NATIVE_EXTS as readonly string[]).includes(ext);
}

export function isSceneModelExt(ext: string): boolean {
  return (
    isSparkNativeExt(ext) ||
    ext === "ply" ||
    ext === "splat" ||
    ext === "glb" ||
    ext === "gltf"
  );
}

/** Spark infers type from the filename; .plz is a zip container of compressed 3DGS. */
export function sparkHintName(fileName: string): string {
  const ext = extOf(fileName);
  if (ext === "plz") {
    return fileName.replace(/\.plz$/i, ".zip");
  }
  return fileName;
}

export function sparkNativeMeta(ext: string): {
  zUp: boolean;
  label: string;
  paged: boolean;
} | null {
  switch (ext) {
    case "spz":
      return { zUp: true, label: "3DGS SPZ", paged: false };
    case "sog":
      return { zUp: true, label: "3DGS SOG", paged: false };
    case "plz":
    case "zip":
      return { zUp: true, label: "3DGS PLZ", paged: false };
    case "rad":
      return { zUp: true, label: "3DGS RAD", paged: true };
    case "ksplat":
      return { zUp: false, label: "3DGS KSPLAT", paged: false };
    default:
      return null;
  }
}

export function canSparkDecodeGaussianPly(bytes: number): boolean {
  return bytes > 0 && bytes <= SPARK_BUFFER_MAX_BYTES;
}

export function canSparkStreamCompressed(bytes: number): boolean {
  return bytes > 0 && bytes <= SPARK_STREAM_MAX_BYTES;
}

export const WEB_HQ_HINT =
  "网页要出 3DGS 高质量，请用 PLZ / SPZ / SOG（通常几十到几百 MB），不要直接丢数 GB 的高斯 PLY。做成 App 也解不开浏览器显存；压缩格式才是正路。";

/** Windows/macOS file dialogs often hide .spz; sniff gzip/NGSP/PLY magic. */
export async function ensureSplatFileName(file: File): Promise<File> {
  const ext = extOf(file.name);
  if (isSceneModelExt(ext)) {
    return file;
  }
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const ascii = new TextDecoder("latin1").decode(head);
  const base = (file.name.replace(/\.[^.]+$/, "") || "scene").trim() || "scene";
  const rename = (suffix: string) =>
    new File([file], `${base}.${suffix}`, { type: "application/octet-stream" });
  if (head[0] === 0x1f && head[1] === 0x8b) {
    return rename("spz");
  }
  if (ascii.startsWith("NGSP") || ascii.startsWith("SPZ")) {
    return rename("spz");
  }
  if (ascii.startsWith("ply") || ascii.startsWith("PLY")) {
    return rename("ply");
  }
  if (head[0] === 0x50 && head[1] === 0x4b) {
    return rename("zip");
  }
  return rename("spz");
}

export function isGoogleDriveUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "drive.google.com" || host === "docs.google.com";
  } catch {
    return false;
  }
}
