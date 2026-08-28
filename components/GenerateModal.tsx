"use client";

import { useEffect, useRef, useState } from "react";
import type { GenerateKind } from "@/lib/generate-intent";
import type { AssetKind } from "@/lib/library-types";

export function GenerateModal({
  kind: initialKind,
  initialPrompt,
  onClose,
  addGenerated,
  addFromFile,
}: {
  kind: GenerateKind;
  initialPrompt: string;
  onClose: () => void;
  addGenerated: (input: {
    name: string;
    kind: AssetKind;
    prompt: string;
    remoteUrl?: string;
    previewUrl?: string;
  }) => Promise<unknown>;
  addFromFile: (
    file: File,
    options?: { kind?: AssetKind; source?: "generated"; prompt?: string },
  ) => Promise<unknown>;
}) {
  const [kind, setKind] = useState<GenerateKind>(initialKind);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [image, setImage] = useState<{ name: string; dataUrl: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const closed = useRef(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function run() {
    const text = prompt.trim();
    if (!text) {
      setError("先写一句要生成什么");
      return;
    }
    setError(null);
    setBusy("提交生成任务…");
    try {
      const created = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          prompt: text,
          imageDataUrl: image?.dataUrl,
        }),
      }).then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "创建失败");
        }
        return json as {
          configured: boolean;
          id?: string;
          kind: GenerateKind;
          prompt: string;
          message?: string;
        };
      });
      let remoteUrl: string | undefined;
      let savedFile: File | undefined;
      if (created.configured && created.id) {
        setBusy("Aholo 生成中，场景完成后会写入素材库…");
        for (let i = 0; i < 90; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          if (closed.current) {
            return;
          }
          const poll = await fetch(
            `/api/generate?kind=${created.kind}&id=${encodeURIComponent(created.id)}`,
          ).then((res) => res.json());
          if (poll.status === "SUCCEEDED") {
            remoteUrl = poll.downloadUrl as string | undefined;
            const ext = (poll.format as string | undefined) || (kind === "world" ? "ply" : "glb");
            if (remoteUrl) {
              setBusy("正在下载生成结果…");
              try {
                const direct = await fetch(remoteUrl);
                if (direct.ok) {
                  savedFile = new File(
                    [await direct.blob()],
                    `${text.slice(0, 28)}.${ext}`,
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
                    `${text.slice(0, 28)}.${ext}`,
                    { type: "application/octet-stream" },
                  );
                }
              }
            }
            break;
          }
          if (["FAILED", "CANCELED", "TIMEOUT", "REJECTED"].includes(poll.status)) {
            throw new Error(poll.error || "生成失败");
          }
          setBusy(`Aholo 生成中（${poll.status || "RUNNING"}）…`);
        }
        if (!remoteUrl && !savedFile) {
          throw new Error("生成超时，请稍后在 Library 查看或重试");
        }
      } else {
        setBusy(created.message || "未配置 Aholo key，写入占位素材");
        await new Promise((r) => setTimeout(r, 600));
      }
      if (savedFile) {
        await addFromFile(savedFile, {
          kind: kind === "world" ? "scene" : "object",
          source: "generated",
          prompt: text,
        });
      } else {
        await addGenerated({
          name: text.slice(0, 42),
          kind: kind === "world" ? "scene" : "object",
          prompt: text,
          remoteUrl,
          previewUrl: image?.dataUrl,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
      setBusy(null);
    }
  }

  return (
    <div className="gen-overlay" role="dialog" aria-modal="true" aria-label="生成">
      <div className="gen-modal sky-glass gemini-glow">
        <button type="button" className="panel-x" onClick={onClose} disabled={Boolean(busy)}>
          ×
        </button>
        <p className="gen-kicker">SEMANTIC GENERATE</p>
        <h2>{kind === "world" ? "生成场景世界" : "生成物体"}</h2>
        <p className="gen-note">
          已接 Aholo Labs（Asset 上传 + World 3DGS / Lux3D）。场景生成完成后自动入库，可在 VirtuPath Apply。
        </p>
        <div className="gen-kinds">
          <button
            type="button"
            className={kind === "world" ? "on" : ""}
            onClick={() => setKind("world")}
          >
            场景世界
          </button>
          <button
            type="button"
            className={kind === "object" ? "on" : ""}
            onClick={() => setKind("object")}
          >
            物体
          </button>
        </div>
        <textarea
          className="gen-prompt"
          rows={4}
          placeholder={
            kind === "world"
              ? "例如： generater 一座暖金木结构厅堂，中轴对称，可走入拍摄"
              : "例如：一把雕花腿的红色木椅，写实 PBR"
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) {
              return;
            }
            const reader = new FileReader();
            reader.onload = () =>
              setImage({ name: file.name, dataUrl: String(reader.result) });
            reader.readAsDataURL(file);
          }}
        />
        <div className="gen-row">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            {image ? image.name : "+ 参考图（可选）"}
          </button>
          <button type="button" className="btn primary" disabled={Boolean(busy)} onClick={() => void run()}>
            {busy ? "生成中" : "生成并入库"}
          </button>
        </div>
        {busy ? <p className="composer-status">{busy}</p> : null}
        {error ? <p className="gen-error">{error}</p> : null}
      </div>
    </div>
  );
}
