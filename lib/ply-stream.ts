export type PlyFormat = "ascii" | "binary_little_endian" | "binary_big_endian";

export type PlyProperty = { name: string; type: string };

export type PlyHeader = {
  format: PlyFormat;
  vertexCount: number;
  headerLength: number;
  properties: PlyProperty[];
  vertexSize: number;
};

const TYPE_SIZE: Record<string, number> = {
  char: 1,
  uchar: 1,
  int8: 1,
  uint8: 1,
  short: 2,
  ushort: 2,
  int16: 2,
  uint16: 2,
  int: 4,
  uint: 4,
  int32: 4,
  uint32: 4,
  float: 4,
  float32: 4,
  double: 8,
  float64: 8,
};

export const TARGET_POINTS = 180_000;
export const CHUNK = 8 * 1024 * 1024;
/** 3DGS spherical-harmonic DC coefficient → linear RGB. */
export const SH_C0 = 0.28209479177387814;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function parsePlyHeaderText(text: string): Omit<PlyHeader, "headerLength"> {
  const lines = text.split(/\r?\n/);
  if ((lines[0] ?? "").trim() !== "ply") {
    throw new Error("不是有效的 PLY（缺少 ply 头）");
  }
  let format: PlyFormat | null = null;
  let vertexCount = 0;
  let inVertex = false;
  const properties: PlyProperty[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "end_header") {
      break;
    }
    if (line.startsWith("format ")) {
      const token = line.split(/\s+/)[1];
      if (
        token === "ascii" ||
        token === "binary_little_endian" ||
        token === "binary_big_endian"
      ) {
        format = token;
      }
    }
    if (line.startsWith("element ")) {
      const parts = line.split(/\s+/);
      inVertex = parts[1] === "vertex";
      if (inVertex) {
        vertexCount = Number(parts[2]);
      }
    }
    if (inVertex && line.startsWith("property ")) {
      const parts = line.split(/\s+/);
      if (parts[1] === "list") {
        continue;
      }
      properties.push({ type: parts[1], name: parts[2] });
    }
  }
  if (!format) {
    throw new Error("PLY 头缺少 format");
  }
  if (!vertexCount) {
    throw new Error("PLY 没有 vertex");
  }
  const vertexSize = properties.reduce((sum, prop) => {
    const size = TYPE_SIZE[prop.type];
    if (!size) {
      throw new Error(`不支持的 PLY 属性 ${prop.type} ${prop.name}`);
    }
    return sum + size;
  }, 0);
  return { format, vertexCount, properties, vertexSize };
}

export function sampleStride(vertexCount: number, target = TARGET_POINTS): number {
  return Math.max(1, Math.floor(vertexCount / target));
}

/** 3DGS PLY: SH DC + opacity/scale/rotation, not a colored point cloud. */
export function isGaussianPly(properties: PlyProperty[]): boolean {
  const names = new Set(properties.map((prop) => prop.name));
  if (!names.has("f_dc_0") && !names.has("opacity") && !names.has("scale_0")) {
    return false;
  }
  return (
    names.has("f_dc_0") ||
    names.has("f_dc_1") ||
    names.has("opacity") ||
    names.has("scale_0") ||
    names.has("rot_0")
  );
}

function propertyIndex(properties: PlyProperty[], names: string[]): number {
  return properties.findIndex((prop) => names.includes(prop.name));
}

/** RGB from `red/green/blue` or 3DGS `f_dc_*` SH DC. */
export function colorFromChannels(
  properties: PlyProperty[],
  read: (index: number) => number,
): [number, number, number] | null {
  const red = propertyIndex(properties, ["red", "r"]);
  const green = propertyIndex(properties, ["green", "g"]);
  const blue = propertyIndex(properties, ["blue", "b"]);
  if (red >= 0 && green >= 0 && blue >= 0) {
    let r = read(red);
    let g = read(green);
    let b = read(blue);
    if (r > 1.5 || g > 1.5 || b > 1.5) {
      r /= 255;
      g /= 255;
      b /= 255;
    }
    return [r, g, b];
  }
  const dc0 = propertyIndex(properties, ["f_dc_0"]);
  const dc1 = propertyIndex(properties, ["f_dc_1"]);
  const dc2 = propertyIndex(properties, ["f_dc_2"]);
  if (dc0 >= 0 && dc1 >= 0 && dc2 >= 0) {
    return [
      Math.min(1, Math.max(0, 0.5 + SH_C0 * read(dc0))),
      Math.min(1, Math.max(0, 0.5 + SH_C0 * read(dc1))),
      Math.min(1, Math.max(0, 0.5 + SH_C0 * read(dc2))),
    ];
  }
  return null;
}

function findHeaderEnd(bytes: Uint8Array): number {
  const needle = "end_header";
  const text = new TextDecoder("latin1").decode(bytes);
  const idx = text.indexOf(needle);
  if (idx < 0) {
    return -1;
  }
  let end = idx + needle.length;
  if (text[end] === "\r") {
    end += 1;
  }
  if (text[end] === "\n") {
    end += 1;
  }
  return end;
}

export async function readPlyHeader(file: File): Promise<PlyHeader> {
  const probe = new Uint8Array(await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer());
  const headerLength = findHeaderEnd(probe);
  if (headerLength < 0) {
    throw new Error("找不到 PLY end_header，文件可能损坏");
  }
  const parsed = parsePlyHeaderText(new TextDecoder("latin1").decode(probe.subarray(0, headerLength)));
  return { ...parsed, headerLength };
}

function readNumber(
  view: DataView,
  offset: number,
  type: string,
  little: boolean,
): { value: number; size: number } {
  switch (type) {
    case "char":
    case "int8":
      return { value: view.getInt8(offset), size: 1 };
    case "uchar":
    case "uint8":
      return { value: view.getUint8(offset), size: 1 };
    case "short":
    case "int16":
      return { value: view.getInt16(offset, little), size: 2 };
    case "ushort":
    case "uint16":
      return { value: view.getUint16(offset, little), size: 2 };
    case "int":
    case "int32":
      return { value: view.getInt32(offset, little), size: 4 };
    case "uint":
    case "uint32":
      return { value: view.getUint32(offset, little), size: 4 };
    case "double":
    case "float64":
      return { value: view.getFloat64(offset, little), size: 8 };
    default:
      return { value: view.getFloat32(offset, little), size: 4 };
  }
}

export type SampledCloud = {
  positions: Float32Array;
  colors: Float32Array;
  kept: number;
  total: number;
  stride: number;
};

export async function sampleBinaryPly(
  file: File,
  header: PlyHeader,
  onProgress?: (ratio: number, label: string) => void,
): Promise<SampledCloud> {
  const little = header.format === "binary_little_endian";
  const stride = sampleStride(header.vertexCount);
  const kept = Math.ceil(header.vertexCount / stride);
  const positions = new Float32Array(kept * 3);
  const colors = new Float32Array(kept * 3);
  const x = header.properties.findIndex((p) => p.name === "x");
  const y = header.properties.findIndex((p) => p.name === "y");
  const z = header.properties.findIndex((p) => p.name === "z");
  if (x < 0 || y < 0 || z < 0) {
    throw new Error("PLY 缺少 x/y/z");
  }
  const offsets: number[] = [];
  let acc = 0;
  for (const prop of header.properties) {
    offsets.push(acc);
    acc += TYPE_SIZE[prop.type];
  }

  let readPos = header.headerLength;
  let leftover = new Uint8Array(0);
  let keepIndex = 0;
  let vertexIndex = 0;

  const skip = (bytes: number) => {
    if (leftover.length >= bytes) {
      leftover = leftover.subarray(bytes);
      return;
    }
    bytes -= leftover.length;
    leftover = new Uint8Array(0);
    readPos += bytes;
  };

  const readExact = async (n: number): Promise<Uint8Array> => {
    const out = new Uint8Array(n);
    let filled = 0;
    if (leftover.length) {
      const take = Math.min(leftover.length, n);
      out.set(leftover.subarray(0, take));
      leftover = leftover.subarray(take);
      filled += take;
    }
    while (filled < n) {
      if (readPos >= file.size) {
        throw new Error("PLY 在顶点数据中提前结束");
      }
      const want = Math.max(n - filled, Math.min(CHUNK, file.size - readPos));
      const chunk = new Uint8Array(await file.slice(readPos, readPos + want).arrayBuffer());
      readPos += chunk.byteLength;
      const need = n - filled;
      if (chunk.byteLength <= need) {
        out.set(chunk, filled);
        filled += chunk.byteLength;
      } else {
        out.set(chunk.subarray(0, need), filled);
        leftover = chunk.subarray(need);
        filled = n;
      }
    }
    return out;
  };

  const writeVertex = (bytes: Uint8Array) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const xv = readNumber(view, offsets[x], header.properties[x].type, little).value;
    const yv = readNumber(view, offsets[y], header.properties[y].type, little).value;
    const zv = readNumber(view, offsets[z], header.properties[z].type, little).value;
    positions[keepIndex * 3] = xv;
    positions[keepIndex * 3 + 1] = yv;
    positions[keepIndex * 3 + 2] = zv;
    const rgb = colorFromChannels(header.properties, (index) =>
      readNumber(view, offsets[index], header.properties[index].type, little).value,
    );
    if (rgb) {
      colors[keepIndex * 3] = rgb[0];
      colors[keepIndex * 3 + 1] = rgb[1];
      colors[keepIndex * 3 + 2] = rgb[2];
    }
    keepIndex += 1;
  };

  while (vertexIndex < header.vertexCount && keepIndex < kept) {
    const bytes = await readExact(header.vertexSize);
    writeVertex(bytes);
    vertexIndex += 1;
    const jump = Math.min(stride - 1, header.vertexCount - vertexIndex);
    if (jump > 0) {
      skip(jump * header.vertexSize);
      vertexIndex += jump;
    }
    if (keepIndex % 4000 === 0) {
      onProgress?.(keepIndex / kept, `采样 ${keepIndex}/${header.vertexCount} 点`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  onProgress?.(1, `采样完成 ${keepIndex} / ${header.vertexCount}`);
  return {
    positions: positions.slice(0, keepIndex * 3),
    colors: colors.slice(0, keepIndex * 3),
    kept: keepIndex,
    total: header.vertexCount,
    stride,
  };
}

export async function samplePlyFile(
  file: File,
  onProgress?: (ratio: number, label: string) => void,
): Promise<SampledCloud> {
  onProgress?.(0.02, "读取 PLY 头…");
  const header = await readPlyHeader(file);
  if (header.format === "ascii") {
    if (file.size > 80 * 1024 * 1024) {
      throw new Error("ASCII PLY 过大。请另存为 binary little endian PLY 后再上传（可支持数 GB）。");
    }
    const text = await file.text();
    const body = text.slice(header.headerLength);
    const lines = body.split(/\r?\n/).filter((line) => line.trim());
    const stride = sampleStride(header.vertexCount);
    const kept = Math.ceil(header.vertexCount / stride);
    const positions = new Float32Array(kept * 3);
    const colors = new Float32Array(kept * 3);
    const names = header.properties.map((p) => p.name);
    const xi = names.indexOf("x");
    const yi = names.indexOf("y");
    const zi = names.indexOf("z");
    let keepIndex = 0;
    for (let i = 0; i < header.vertexCount && keepIndex < kept; i += stride) {
      const parts = lines[i]?.trim().split(/\s+/) ?? [];
      positions[keepIndex * 3] = Number(parts[xi]);
      positions[keepIndex * 3 + 1] = Number(parts[yi]);
      positions[keepIndex * 3 + 2] = Number(parts[zi]);
      const rgb = colorFromChannels(header.properties, (index) => Number(parts[index]));
      if (rgb) {
        colors[keepIndex * 3] = rgb[0];
        colors[keepIndex * 3 + 1] = rgb[1];
        colors[keepIndex * 3 + 2] = rgb[2];
      }
      keepIndex += 1;
    }
    return { positions, colors, kept: keepIndex, total: header.vertexCount, stride };
  }
  return sampleBinaryPly(file, header, onProgress);
}
