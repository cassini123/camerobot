import type { GenerateKind } from "./generate-intent";

export const GENERATE_FAIL = new Set(["FAILED", "CANCELED", "TIMEOUT", "REJECTED"]);

export type GenerateJobStatus = "running" | "done" | "failed";

export type GenerateJob = {
  id: string;
  kind: GenerateKind;
  prompt: string;
  imageDataUrl?: string;
  status: GenerateJobStatus;
  phase: string;
  error?: string;
  minimized: boolean;
  progress?: number;
  previewUrl?: string;
  createdAt: number;
};

export type GenerateJobResult = {
  configured: boolean;
  file?: File;
  remoteUrl?: string;
  previewUrl?: string;
};

type JobHooks = {
  signal?: AbortSignal;
  onPhase: (phase: string, extra?: { progress?: number; previewUrl?: string }) => void;
};

export function jobHeadline(job: GenerateJob): string {
  if (job.status === "failed") {
    return job.error || "生成失败";
  }
  if (job.status === "done") {
    return "已加入 Library";
  }
  return job.phase;
}

export async function runGenerateJob(
  input: { kind: GenerateKind; prompt: string; imageDataUrl?: string },
  hooks: JobHooks,
): Promise<GenerateJobResult> {
  const { signal, onPhase } = hooks;
  const throwIfAborted = () => {
    if (signal?.aborted) {
      throw new Error("已取消");
    }
  };

  onPhase("提交生成任务…");
  const created = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: input.kind,
      prompt: input.prompt,
      imageDataUrl: input.imageDataUrl,
    }),
  }).then(async (res) => {
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || `创建失败（HTTP ${res.status}）`);
    }
    return json as {
      configured: boolean;
      id?: string;
      kind: GenerateKind;
      prompt: string;
      message?: string;
      error?: string;
    };
  });
  throwIfAborted();

  let remoteUrl: string | undefined;
  let savedFile: File | undefined;
  let previewUrl = input.imageDataUrl;

  if (created.configured && created.id) {
    onPhase("Aholo 生成中…");
    for (let i = 0; i < 90; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      throwIfAborted();
      const poll = await fetch(
        `/api/generate?kind=${created.kind}&id=${encodeURIComponent(created.id)}`,
      ).then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || `查询失败（HTTP ${res.status}）`);
        }
        return json as {
          status?: string;
          downloadUrl?: string;
          format?: string;
          error?: string;
          previewUrl?: string;
          progress?: number;
        };
      });
      if (poll.previewUrl) {
        previewUrl = previewUrl || poll.previewUrl;
      }
      if (poll.status === "SUCCEEDED") {
        remoteUrl = poll.downloadUrl;
        const ext = poll.format || (input.kind === "world" ? "ply" : "glb");
        if (remoteUrl) {
          onPhase("正在下载生成结果…");
          try {
            const direct = await fetch(remoteUrl);
            if (direct.ok) {
              savedFile = new File(
                [await direct.blob()],
                `${input.prompt.slice(0, 28)}.${ext}`,
                { type: "application/octet-stream" },
              );
            }
          } catch {
            savedFile = undefined;
          }
          if (!savedFile) {
            const proxied = await fetch(
              `/api/generate?kind=${created.kind}&id=${encodeURIComponent(created.id)}&file=1`,
            );
            if (proxied.ok) {
              savedFile = new File(
                [await proxied.blob()],
                `${input.prompt.slice(0, 28)}.${ext}`,
                { type: "application/octet-stream" },
              );
            }
          }
        }
        break;
      }
      if (poll.status && GENERATE_FAIL.has(poll.status)) {
        throw new Error(poll.error || `生成失败（${poll.status}）`);
      }
      const pct =
        typeof poll.progress === "number" ? ` ${Math.round(poll.progress * 100)}%` : "";
      onPhase(`Aholo 生成中（${poll.status || "RUNNING"}${pct}）…`, {
        progress: poll.progress,
        previewUrl: poll.previewUrl,
      });
    }
    if (!remoteUrl && !savedFile) {
      throw new Error("生成超时。Aholo 超过约 7.5 分钟未完成，请稍后在 Library 重试。");
    }
  } else {
    onPhase(created.message || "未配置 AHOLO_API_KEY，写入占位素材");
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  return { configured: Boolean(created.configured), file: savedFile, remoteUrl, previewUrl };
}
