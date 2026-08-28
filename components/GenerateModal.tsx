"use client";

import { useEffect, useRef, useState } from "react";
import type { GenerateKind } from "@/lib/generate-intent";
import type { GenerateJob } from "@/lib/generate-job";
import { jobHeadline } from "@/lib/generate-job";

export function GenerateModal({
  kind: initialKind,
  initialPrompt,
  initialImage,
  job,
  docking,
  onClose,
  onMinimize,
  onStart,
}: {
  kind: GenerateKind;
  initialPrompt: string;
  initialImage?: { name: string; dataUrl: string } | null;
  job?: GenerateJob;
  docking?: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onStart: (input: {
    kind: GenerateKind;
    prompt: string;
    image?: { name: string; dataUrl: string } | null;
  }) => void;
}) {
  const [kind, setKind] = useState<GenerateKind>(job?.kind ?? initialKind);
  const [prompt, setPrompt] = useState(job?.prompt ?? initialPrompt);
  const [image, setImage] = useState<{ name: string; dataUrl: string } | null>(
    initialImage ?? (job?.imageDataUrl ? { name: "reference", dataUrl: job.imageDataUrl } : null),
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = job?.status === "running" ? jobHeadline(job) : null;
  const error = job?.status === "failed" ? job.error : null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (job?.status === "running") {
          onMinimize();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [job, onClose, onMinimize]);

  function readImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => setImage({ name: file.name, dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return (
    <div
      className={docking ? "gen-overlay docking" : "gen-overlay"}
      role="dialog"
      aria-modal="true"
      aria-label="生成"
    >
      <div className="gen-modal sky-glass gemini-glow">
        <div className="gen-modal-tools">
          <button
            type="button"
            className="panel-x gen-min"
            aria-label="缩小到右下角"
            title="缩小到右下角"
            onClick={onMinimize}
            disabled={!job || job.status !== "running"}
          >
            –
          </button>
          <button
            type="button"
            className="panel-x"
            aria-label="关闭"
            onClick={() => (job?.status === "running" ? onMinimize() : onClose())}
          >
            ×
          </button>
        </div>
        <p className="gen-kicker">SEMANTIC GENERATE</p>
        <h2>{kind === "world" ? "生成场景世界" : "生成物体"}</h2>
        <p className="gen-note">
          已接 Aholo Labs。上传参考图会显示预览；生成中可缩小到右下角，完成或失败都会提示原因。
        </p>
        <div className="gen-kinds">
          <button
            type="button"
            className={kind === "world" ? "on" : ""}
            disabled={Boolean(busy)}
            onClick={() => setKind("world")}
          >
            场景世界
          </button>
          <button
            type="button"
            className={kind === "object" ? "on" : ""}
            disabled={Boolean(busy)}
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
              ? "例如：一座暖金木结构厅堂，中轴对称，可走入拍摄"
              : "例如：一把雕花腿的红色木椅，写实 PBR"
          }
          value={prompt}
          disabled={Boolean(busy)}
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
            if (file) {
              readImage(file);
            }
          }}
        />
        <div
          className={image ? "gen-drop has-image" : "gen-drop"}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file?.type.startsWith("image/")) {
              readImage(file);
            }
          }}
        >
          {image ? (
            <img src={image.dataUrl} alt={image.name} />
          ) : (
            <span>
              拖入或点击上传参考图
              <br />
              预览会出现在这里
            </span>
          )}
          <button
            type="button"
            className="btn"
            disabled={Boolean(busy)}
            onClick={(e) => {
              e.preventDefault();
              fileRef.current?.click();
            }}
          >
            {image ? "更换图片" : "+ 参考图（可选）"}
          </button>
        </div>
        <div className="gen-row">
          <span className="gen-file-name">{image?.name ?? "无参考图，将按文字生成"}</span>
          <button
            type="button"
            className="btn primary"
            disabled={Boolean(busy)}
            onClick={() => {
              if (!prompt.trim()) {
                return;
              }
              onStart({ kind, prompt: prompt.trim(), image });
            }}
          >
            {busy ? "生成中" : "生成并入库"}
          </button>
        </div>
        {busy ? <p className="composer-status">{busy}</p> : null}
        {error ? <p className="gen-error">{error}</p> : null}
      </div>
    </div>
  );
}
