"use client";

import type { GenerateJob } from "@/lib/generate-job";
import { jobHeadline } from "@/lib/generate-job";

export function GenerateDock({
  jobs,
  onOpen,
  onDismiss,
}: {
  jobs: GenerateJob[];
  onOpen: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const shown = jobs.filter((job) => job.minimized || job.status !== "running");
  if (!shown.length) {
    return null;
  }
  return (
    <aside className="gen-dock" aria-label="生成任务">
      {shown.map((job) => (
        <button
          key={job.id}
          type="button"
          className={`gen-chip ${job.status}`}
          onClick={() => (job.status === "running" ? onOpen(job.id) : onDismiss(job.id))}
        >
          {job.imageDataUrl || job.previewUrl ? (
            <img src={job.imageDataUrl || job.previewUrl} alt="" />
          ) : (
            <span className="gen-chip-ph">{job.kind === "world" ? "W" : "O"}</span>
          )}
          <span>
            <b>
              {job.status === "done"
                ? "生成完成"
                : job.status === "failed"
                  ? "生成失败"
                  : "生成中"}
            </b>
            <small>{jobHeadline(job)}</small>
          </span>
        </button>
      ))}
    </aside>
  );
}
