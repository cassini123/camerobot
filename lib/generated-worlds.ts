import type { LibraryAsset } from "./library-types";

export type GeneratedWorld = {
  id: string;
  name: string;
  prompt: string;
  worldId: string;
  pano: string;
  plyUrl: string;
  spzUrl: string;
};

export const GENERATED_WORLDS: GeneratedWorld[] = [
  {
    id: "world-fjord",
    name: "峡湾观景台",
    prompt: "Misty fjord with turquoise water, waterfalls, cruise ship, and a railing viewpoint.",
    worldId: "3FO4K4XR7XT1",
    pano: "/library/worlds/fjord.jpg",
    plyUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/795c031b23ab40698d5be1e8ff3ddc78-185508-1417_MaaSReportFile-771133cc213f2aeba8b72efd957d74c8.ply",
    spzUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/795c031b23ab40698d5be1e8ff3ddc78-185508-1417_MaaSReportFile-f8f406b29e98c0e23feafbb3073a6acb.spz",
  },
  {
    id: "world-rooftop",
    name: "屋顶菜园",
    prompt: "Sunny rooftop vegetable garden with scarecrow, bees, and city skyline.",
    worldId: "3FO4K4XR2EVD",
    pano: "/library/worlds/rooftop.jpg",
    plyUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/de91f690b4e845bea02f086e5b7449ca-193151-52af_MaaSReportFile-771133cc213f2aeba8b72efd957d74c8.ply",
    spzUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/de91f690b4e845bea02f086e5b7449ca-193151-52af_MaaSReportFile-f8f406b29e98c0e23feafbb3073a6acb.spz",
  },
  {
    id: "world-canyon",
    name: "峡谷仙人掌",
    prompt: "Golden-hour red-rock canyon with a saguaro cactus overlook.",
    worldId: "3FO4K4XR24UA",
    pano: "/library/worlds/canyon.jpg",
    plyUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/c2e14039eff64a9d9ed0adba6920360a-193645-4574_MaaSReportFile-771133cc213f2aeba8b72efd957d74c8.ply",
    spzUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/c2e14039eff64a9d9ed0adba6920360a-193645-4574_MaaSReportFile-f8f406b29e98c0e23feafbb3073a6acb.spz",
  },
  {
    id: "world-ice",
    name: "冰峡谷",
    prompt: "Glacial ice canyon with a snowy path toward a dark tunnel.",
    worldId: "3FO4K4XR287B",
    pano: "/library/worlds/ice.jpg",
    plyUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/229702a132f74330bd5af64ddea3df31-194937-0414_MaaSReportFile-771133cc213f2aeba8b72efd957d74c8.ply",
    spzUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/229702a132f74330bd5af64ddea3df31-194937-0414_MaaSReportFile-f8f406b29e98c0e23feafbb3073a6acb.spz",
  },
  {
    id: "world-patagonia",
    name: "巴塔哥尼亚湖山",
    prompt: "Patagonian grassland, guanacos, blue lake, and snow-dusted peaks.",
    worldId: "3FO4K4XR3GNO",
    pano: "/library/worlds/patagonia.jpg",
    plyUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/5e887d0defca4353bcd95ccb552b0313-200332-7462_MaaSReportFile-771133cc213f2aeba8b72efd957d74c8.ply",
    spzUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/5e887d0defca4353bcd95ccb552b0313-200332-7462_MaaSReportFile-f8f406b29e98c0e23feafbb3073a6acb.spz",
  },
  {
    id: "world-lagoon",
    name: "热带泻湖",
    prompt: "Tropical limestone lagoon, white sand, and a colorful longtail boat.",
    worldId: "3FO4K4XR39YM",
    pano: "/library/worlds/lagoon.jpg",
    plyUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/6718ef87c7314b96beaae9e4d9b0d4b4-201149-ce92_MaaSReportFile-771133cc213f2aeba8b72efd957d74c8.ply",
    spzUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/6718ef87c7314b96beaae9e4d9b0d4b4-201149-ce92_MaaSReportFile-f8f406b29e98c0e23feafbb3073a6acb.spz",
  },
  {
    id: "world-potala",
    name: "布达拉宫",
    prompt: "Potala Palace reflected in a lake beside golden prayer wheels.",
    worldId: "3FO4K4XR3DBN",
    pano: "/library/worlds/potala.jpg",
    plyUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/399a953dd538483b846e26520f8b6d41-202625-5e4d_MaaSReportFile-771133cc213f2aeba8b72efd957d74c8.ply",
    spzUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/399a953dd538483b846e26520f8b6d41-202625-5e4d_MaaSReportFile-f8f406b29e98c0e23feafbb3073a6acb.spz",
  },
  {
    id: "world-forest",
    name: "魔法森林铁轨",
    prompt: "Enchanted forest railroad with a pig, a rooster, and golden light.",
    worldId: "3FO4K4XR33AK",
    pano: "/library/worlds/forest.jpg",
    plyUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/82a1ea3d21c9436aa4dac021b7b3d2ed-203801-e379_MaaSReportFile-771133cc213f2aeba8b72efd957d74c8.ply",
    spzUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/82a1ea3d21c9436aa4dac021b7b3d2ed-203801-e379_MaaSReportFile-f8f406b29e98c0e23feafbb3073a6acb.spz",
  },
  {
    id: "world-monastery",
    name: "雾中寺院",
    prompt: "Misty mountain monastery, golden roofs, stairs, and red-robed monks.",
    worldId: "3FO4K4XR36ML",
    pano: "/library/worlds/monastery.jpg",
    plyUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/9fc30b4dd9c442edaa4cf7a8dedc8274-205027-33ca_MaaSReportFile-771133cc213f2aeba8b72efd957d74c8.ply",
    spzUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/9fc30b4dd9c442edaa4cf7a8dedc8274-205027-33ca_MaaSReportFile-f8f406b29e98c0e23feafbb3073a6acb.spz",
  },
  {
    id: "world-grotto",
    name: "石窟佛像",
    prompt: "Sunlit Buddhist grotto with a colossal Buddha and niche carvings.",
    worldId: "3FO4K4XR2VLI",
    pano: "/library/worlds/grotto.jpg",
    plyUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/5169163601f94df3b0a075e40f52bf17-211220-ee6b_MaaSReportFile-771133cc213f2aeba8b72efd957d74c8.ply",
    spzUrl:
      "https://holo-cos.aholo3d.cn/spatial-gen-3dgs/3FO4FL1SATJF/aholo/output/5169163601f94df3b0a075e40f52bf17-211220-ee6b_MaaSReportFile-f8f406b29e98c0e23feafbb3073a6acb.spz",
  },
];

export function bundledLibraryAssets() {
  return GENERATED_WORLDS.flatMap((world) => [
    {
      id: `${world.id}-pano`,
      name: `${world.name} · 全景`,
      kind: "image" as const,
      source: "generated" as const,
      mime: "image/jpeg",
      sizeLabel: "全景预览",
      createdAt: 0,
      prompt: world.prompt,
      previewUrl: world.pano,
      remoteUrl: world.pano,
    },
    {
      id: world.id,
      name: world.name,
      kind: "scene" as const,
      source: "generated" as const,
      sizeLabel: "3DGS SPZ",
      createdAt: 0,
      prompt: world.prompt,
      previewUrl: world.pano,
      remoteUrl: world.spzUrl,
      plyUrl: world.plyUrl,
      spzUrl: world.spzUrl,
    },
  ]);
}

export function worldSplatHref(id: string): string | null {
  return GENERATED_WORLDS.some((world) => world.id === id) ? `/api/scene-splat/${id}` : null;
}

export function mergeLibraryAssets(existing: LibraryAsset[]): LibraryAsset[] {
  const bundled = bundledLibraryAssets();
  const bundledIds = new Set(bundled.map((item) => item.id));
  return [...bundled, ...existing.filter((item) => !bundledIds.has(item.id))];
}
