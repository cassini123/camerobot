import { createAssetClient } from "@manycore/aholo-sdk-asset";
import { createLux3dClient } from "@manycore/aholo-sdk-lux3d";
import { createWorldClient } from "@manycore/aholo-sdk-world";
import type { GenerateKind } from "./generate-intent";

export function hasAholoKey(): boolean {
  return Boolean((process.env.AHOLO_API_KEY ?? "").trim());
}

function region(): "cn" | "com" {
  return process.env.AHOLO_REGION === "com" ? "com" : "cn";
}

function cfg() {
  return {
    apiKey: (process.env.AHOLO_API_KEY ?? "").trim(),
    region: region(),
    timeoutMs: 120_000,
  };
}

export async function uploadAholoBuffer(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const asset = createAssetClient(cfg());
  const uploaded = await asset.uploadBuffer(buffer, { filename });
  return uploaded.url;
}

export async function startAholoJob(input: {
  kind: GenerateKind;
  prompt: string;
  imageUrl?: string;
}): Promise<{ id: string; kind: GenerateKind }> {
  if (input.kind === "world") {
    const world = createWorldClient(cfg());
    const { worldId } = await world.generations.create({
      name: input.prompt.slice(0, 48) || "yunjing-world",
      prompt: input.prompt,
      resources: input.imageUrl
        ? [{ url: input.imageUrl, type: "image" }]
        : undefined,
    });
    return { id: worldId, kind: "world" };
  }
  const lux3d = createLux3dClient(cfg());
  const taskId = input.imageUrl
    ? await lux3d.imgTo3d.create({
        img: input.imageUrl,
        version: "G1-Turbo",
        outputFormat: ["glb", "ply"],
      })
    : await lux3d.textTo3d.create({
        prompt: input.prompt,
        version: "G1-Turbo",
        outputFormat: ["glb", "ply"],
      });
  return { id: String(taskId), kind: "object" };
}

export async function pollAholoJob(
  kind: GenerateKind,
  id: string,
): Promise<{
  status: string;
  downloadUrl?: string;
  format?: string;
  previewUrl?: string;
  progress?: number;
  error?: string;
}> {
  if (kind === "world") {
    const world = createWorldClient(cfg());
    const detail = await world.retrieve(id);
    const ply = detail.assets?.splats?.urls?.plyPath;
    const spz = detail.assets?.splats?.urls?.spzPath;
    return {
      status: detail.status ?? "PENDING",
      downloadUrl: ply || spz,
      format: ply ? "ply" : spz ? "spz" : undefined,
      previewUrl: detail.cover || detail.assets?.imagery?.panoUrl,
      progress: detail.progress,
      error:
        detail.status === "FAILED" ||
        detail.status === "TIMEOUT" ||
        detail.status === "REJECTED"
          ? `世界生成失败（${detail.status}）`
          : detail.status === "CANCELED"
            ? "世界生成已取消"
            : undefined,
    };
  }
  const lux3d = createLux3dClient(cfg());
  const task = await lux3d.tasks.retrieve(Number(id));
  const map: Record<number, string> = {
    0: "PENDING",
    1: "RUNNING",
    3: "SUCCEEDED",
    4: "FAILED",
    6: "CANCELED",
  };
  const status = map[task.status] ?? "PENDING";
  const glb = task.outputs?.find((item) =>
    (item.content || "").toLowerCase().includes(".glb"),
  );
  const ply = task.outputs?.find((item) =>
    (item.content || "").toLowerCase().includes(".ply"),
  );
  const any = task.outputs?.find((item) => item.content);
  return {
    status,
    downloadUrl: glb?.content || ply?.content || any?.content || undefined,
    format: glb ? "glb" : ply ? "ply" : undefined,
    error:
      status === "FAILED"
        ? "Lux3D 任务失败（status=FAILED）。检查参考图是否可读、额度是否用尽。"
        : status === "CANCELED"
          ? "Lux3D 任务已取消"
          : undefined,
  };
}
