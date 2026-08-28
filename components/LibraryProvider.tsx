"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { formatBytes } from "@/lib/ply-stream";
import {
  inferAssetKind,
  type AssetKind,
  type AssetSource,
  type LibraryAsset,
} from "@/lib/library-types";
import { GenerateModal } from "./GenerateModal";
import { GenerateDock } from "./GenerateDock";
import type { GenerateKind } from "@/lib/generate-intent";
import { runGenerateJob, type GenerateJob } from "@/lib/generate-job";

const META_KEY = "yunjing-library-meta-v1";

type GenerateOpen = {
  kind: GenerateKind;
  prompt?: string;
  image?: { name: string; dataUrl: string } | null;
  jobId?: string;
} | null;

type LibraryContextValue = {
  assets: LibraryAsset[];
  jobs: GenerateJob[];
  addFromFile: (
    file: File,
    options?: {
      kind?: AssetKind;
      source?: AssetSource;
      prompt?: string;
      previewUrl?: string;
    },
  ) => Promise<LibraryAsset>;
  addFromDataUrl: (
    name: string,
    dataUrl: string,
    kind: "image" | "video",
    source?: AssetSource,
  ) => Promise<LibraryAsset>;
  addGenerated: (input: {
    name: string;
    kind: AssetKind;
    prompt: string;
    remoteUrl?: string;
    previewUrl?: string;
  }) => Promise<LibraryAsset>;
  getBlob: (id: string) => Promise<Blob | undefined>;
  openGenerate: (
    kind: GenerateKind,
    prompt?: string,
    image?: { name: string; dataUrl: string } | null,
  ) => void;
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("yunjing-library", 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("blobs")) {
        req.result.createObjectStore("blobs");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getBlob(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("blobs", "readonly");
    const req = tx.objectStore("blobs").get(id);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function putBlob(id: string, blob: Blob) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("blobs", "readwrite");
    tx.objectStore("blobs").put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function loadMeta(): LibraryAsset[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as LibraryAsset[]) : [];
  } catch {
    return [];
  }
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [generate, setGenerate] = useState<GenerateOpen>(null);
  const [jobs, setJobs] = useState<GenerateJob[]>([]);
  const [docking, setDocking] = useState(false);
  const abortRef = useRef(new Map<string, AbortController>());

  useEffect(() => {
    const meta = loadMeta();
    void (async () => {
      const restored = await Promise.all(
        meta.map(async (item) => {
          const preview = await getBlob(`preview-${item.id}`);
          if (preview) {
            return { ...item, previewUrl: URL.createObjectURL(preview) };
          }
          const blob = await getBlob(item.id);
          if (blob?.type.startsWith("image/") || blob?.type.startsWith("video/")) {
            return { ...item, previewUrl: URL.createObjectURL(blob) };
          }
          return item;
        }),
      );
      setAssets(restored);
    })();
  }, []);

  const addAsset = useCallback(async (asset: LibraryAsset, blob?: Blob, preview?: Blob) => {
    if (blob) {
      await putBlob(asset.id, blob).catch(() => undefined);
    }
    if (preview) {
      await putBlob(`preview-${asset.id}`, preview).catch(() => undefined);
    }
    setAssets((cur) => {
      const next = [asset, ...cur.filter((item) => item.id !== asset.id)];
      const slim = next.map((item) => {
        const copy = { ...item };
        if (copy.previewUrl?.startsWith("blob:") || copy.previewUrl?.startsWith("data:")) {
          delete copy.previewUrl;
        }
        return copy;
      });
      localStorage.setItem(META_KEY, JSON.stringify(slim));
      return next;
    });
    return asset;
  }, []);

  const addFromFile = useCallback(
    async (
      file: File,
      options?: {
        kind?: AssetKind;
        source?: AssetSource;
        prompt?: string;
        previewUrl?: string;
      },
    ) => {
      const id = `${file.name}-${file.size}-${Date.now()}`;
      let previewUrl = options?.previewUrl;
      let previewBlob: Blob | undefined;
      if (previewUrl?.startsWith("data:")) {
        const blob = await fetch(previewUrl).then((res) => res.blob());
        previewBlob = blob;
        previewUrl = URL.createObjectURL(blob);
      } else if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
        previewUrl = URL.createObjectURL(file);
      }
      const asset: LibraryAsset = {
        id,
        name: file.name,
        kind: inferAssetKind(file, options?.kind),
        source: options?.source ?? "upload",
        mime: file.type,
        sizeLabel: formatBytes(file.size),
        createdAt: Date.now(),
        prompt: options?.prompt,
        previewUrl,
      };
      return addAsset(asset, file, previewBlob);
    },
    [addAsset],
  );

  const addFromDataUrl = useCallback(
    async (
      name: string,
      dataUrl: string,
      kind: "image" | "video",
      source: AssetSource = "upload",
    ) => {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], name, { type: blob.type });
      return addFromFile(file, { kind, source });
    },
    [addFromFile],
  );

  const addGenerated = useCallback(
    async (input: {
      name: string;
      kind: AssetKind;
      prompt: string;
      remoteUrl?: string;
      previewUrl?: string;
    }) => {
      let previewUrl = input.previewUrl;
      let previewBlob: Blob | undefined;
      if (previewUrl?.startsWith("data:")) {
        const blob = await fetch(previewUrl).then((res) => res.blob());
        previewBlob = blob;
        previewUrl = URL.createObjectURL(blob);
      } else if (previewUrl?.startsWith("http")) {
        try {
          const blob = await fetch(previewUrl).then((res) => res.blob());
          previewBlob = blob;
          previewUrl = URL.createObjectURL(blob);
        } catch {
          /* keep remote url */
        }
      }
      const asset: LibraryAsset = {
        id: `gen-${Date.now()}`,
        name: input.name,
        kind: input.kind,
        source: "generated",
        sizeLabel: "generated",
        createdAt: Date.now(),
        prompt: input.prompt,
        remoteUrl: input.remoteUrl,
        previewUrl,
      };
      return addAsset(asset, undefined, previewBlob);
    },
    [addAsset],
  );

  const patchJob = useCallback((id: string, patch: Partial<GenerateJob>) => {
    setJobs((cur) => cur.map((job) => (job.id === id ? { ...job, ...patch } : job)));
  }, []);

  const startJob = useCallback(
    (input: {
      kind: GenerateKind;
      prompt: string;
      image?: { name: string; dataUrl: string } | null;
    }) => {
      const text = input.prompt.trim();
      if (!text) {
        return;
      }
      const id = `job-${Date.now()}`;
      const controller = new AbortController();
      abortRef.current.set(id, controller);
      const job: GenerateJob = {
        id,
        kind: input.kind,
        prompt: text,
        imageDataUrl: input.image?.dataUrl,
        status: "running",
        phase: "提交生成任务…",
        minimized: false,
        createdAt: Date.now(),
      };
      setJobs((cur) => [job, ...cur]);
      setGenerate({ kind: input.kind, prompt: text, image: input.image, jobId: id });
      void (async () => {
        try {
          const result = await runGenerateJob(
            { kind: input.kind, prompt: text, imageDataUrl: input.image?.dataUrl },
            {
              signal: controller.signal,
              onPhase: (phase, extra) =>
                patchJob(id, {
                  phase,
                  progress: extra?.progress,
                  previewUrl: extra?.previewUrl,
                }),
            },
          );
          if (result.file) {
            await addFromFile(result.file, {
              kind: input.kind === "world" ? "scene" : "object",
              source: "generated",
              prompt: text,
              previewUrl: result.previewUrl || input.image?.dataUrl,
            });
          } else {
            await addGenerated({
              name: text.slice(0, 42),
              kind: input.kind === "world" ? "scene" : "object",
              prompt: text,
              remoteUrl: result.remoteUrl,
              previewUrl: result.previewUrl || input.image?.dataUrl,
            });
          }
          patchJob(id, { status: "done", phase: "已加入 Library", minimized: true });
          setGenerate((cur) => (cur?.jobId === id ? null : cur));
          window.setTimeout(() => {
            setJobs((cur) => cur.filter((item) => item.id !== id || item.status !== "done"));
          }, 12000);
        } catch (error) {
          const message = error instanceof Error ? error.message : "生成失败";
          patchJob(id, { status: "failed", error: message, phase: message, minimized: true });
          setGenerate((cur) => (cur?.jobId === id ? null : cur));
        } finally {
          abortRef.current.delete(id);
        }
      })();
    },
    [addFromFile, addGenerated, patchJob],
  );

  const minimizeGenerate = useCallback(() => {
    if (!generate?.jobId) {
      setGenerate(null);
      return;
    }
    setDocking(true);
    const id = generate.jobId;
    window.setTimeout(() => {
      patchJob(id, { minimized: true });
      setGenerate(null);
      setDocking(false);
    }, 420);
  }, [generate, patchJob]);

  const value = useMemo(
    () => ({
      assets,
      jobs,
      addFromFile,
      addFromDataUrl,
      addGenerated,
      getBlob,
      openGenerate: (
        kind: GenerateKind,
        prompt?: string,
        image?: { name: string; dataUrl: string } | null,
      ) => setGenerate({ kind, prompt, image }),
    }),
    [assets, jobs, addFromFile, addFromDataUrl, addGenerated],
  );

  const activeJob = jobs.find((job) => job.id === generate?.jobId);

  return (
    <LibraryContext.Provider value={value}>
      {children}
      {generate && !activeJob?.minimized ? (
        <GenerateModal
          kind={generate.kind}
          initialPrompt={generate.prompt ?? ""}
          initialImage={generate.image}
          job={activeJob}
          docking={docking}
          onClose={() => setGenerate(null)}
          onMinimize={minimizeGenerate}
          onStart={startJob}
        />
      ) : null}
      <GenerateDock
        jobs={jobs}
        onOpen={(id) => {
          const job = jobs.find((item) => item.id === id);
          if (!job) {
            return;
          }
          patchJob(id, { minimized: false });
          setGenerate({
            kind: job.kind,
            prompt: job.prompt,
            image: job.imageDataUrl ? { name: "reference", dataUrl: job.imageDataUrl } : null,
            jobId: id,
          });
        }}
        onDismiss={(id) => setJobs((cur) => cur.filter((item) => item.id !== id))}
      />
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error("useLibrary must be used within LibraryProvider");
  }
  return ctx;
}
