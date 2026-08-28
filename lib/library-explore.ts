export type ExploreItem = {
  id: string;
  title: string;
  kind: "video" | "image";
  src?: string;
  poster?: string;
  kicker?: string;
};

/** Explore 信息流。视频资源稍后接入，先占位结构。 */
export const EXPLORE_FEED: ExploreItem[] = [];
