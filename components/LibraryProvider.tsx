"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import type { GenerateKind } from "@/lib/generate-intent";

const META_KEY = "yunjing-library-meta-v1";

type GenerateOpen = { kind: GenerateKind; prompt?: string } | null;

type LibraryContextValue = {
  assets: LibraryAsset[];
  addFromFile: (
    file: File,
    options?: { kind?: AssetKind; source?: AssetSource; prompt?: string },
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
  openGenerate: (kind: GenerateKind, prompt?: string) => void;
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

  useEffect(() => {
    setAssets(loadMeta());
  }, []);

  const addAsset = useCallback(async (asset: LibraryAsset, blob?: Blob) => {
    if (blob) {
      await putBlob(asset.id, blob).catch(() => undefined);
    }
    setAssets((cur) => {
      const next = [asset, ...cur.filter((item) => item.id !== asset.id)];
      const slim = next.map((item) => {
        const copy = { ...item };
        delete copy.previewUrl;
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
      options?: { kind?: AssetKind; source?: AssetSource; prompt?: string },
    ) => {
      const id = `${file.name}-${file.size}-${Date.now()}`;
      const previewUrl = URL.createObjectURL(file);
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
      return addAsset(asset, file);
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
      const asset: LibraryAsset = {
        id: `gen-${Date.now()}`,
        name: input.name,
        kind: input.kind,
        source: "generated",
        sizeLabel: "generated",
        createdAt: Date.now(),
        prompt: input.prompt,
        remoteUrl: input.remoteUrl,
        previewUrl: input.previewUrl,
      };
      return addAsset(asset);
    },
    [addAsset],
  );

  const value = useMemo(
    () => ({
      assets,
      addFromFile,
      addFromDataUrl,
      addGenerated,
      openGenerate: (kind: GenerateKind, prompt?: string) =>
        setGenerate({ kind, prompt }),
    }),
    [assets, addFromFile, addFromDataUrl, addGenerated],
  );

  return (
    <LibraryContext.Provider value={value}>
      {children}
      {generate ? (
        <GenerateModal
          kind={generate.kind}
          initialPrompt={generate.prompt ?? ""}
          onClose={() => setGenerate(null)}
          addGenerated={addGenerated}
        />
      ) : null}
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
