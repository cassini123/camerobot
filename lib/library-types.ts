export type AssetKind = "image" | "video" | "object" | "scene";

export type AssetSource = "upload" | "generated" | "example" | "bundled";

export type LibraryAsset = {
  id: string;
  name: string;
  kind: AssetKind;
  source: AssetSource;
  mime?: string;
  sizeLabel: string;
  createdAt: number;
  prompt?: string;
  remoteUrl?: string;
  previewUrl?: string;
  plyUrl?: string;
  spzUrl?: string;
};

export function inferAssetKind(file: File, hint?: AssetKind): AssetKind {
  if (hint) {
    return hint;
  }
  if (file.type.startsWith("image/")) {
    return "image";
  }
  if (file.type.startsWith("video/")) {
    return "video";
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["ply", "spz", "splat", "ksplat"].includes(ext)) {
    return "scene";
  }
  return "object";
}
