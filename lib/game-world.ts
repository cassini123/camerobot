export type FriendId = "you" | "heng" | "bei";

export type Place = {
  id: string;
  name: string;
  hint: string;
  x: number;
  y: number;
};

export type Friend = {
  id: FriendId;
  name: string;
  title: string;
  online: boolean;
  color: string;
  visited: string[];
};

export const PLACES: Place[] = [
  { id: "north-bay", name: "北湾", hint: "冷雾港湾", x: 28, y: 22 },
  { id: "ridge", name: "半岛脊", hint: "中脊高地", x: 42, y: 46 },
  { id: "east-port", name: "东岸港", hint: "灯塔与码头", x: 62, y: 40 },
  { id: "isles", name: "岛链", hint: "外海列岛", x: 78, y: 48 },
  { id: "south-cape", name: "南岬", hint: "潮汐角", x: 38, y: 72 },
];

export const FRIENDS: Friend[] = [
  {
    id: "you",
    name: "你",
    title: "主号",
    online: true,
    color: "#7dba8a",
    visited: ["ridge", "east-port"],
  },
  {
    id: "heng",
    name: "阿衡",
    title: "好友",
    online: true,
    color: "#d4a574",
    visited: ["east-port", "isles", "ridge"],
  },
  {
    id: "bei",
    name: "北岛",
    title: "好友",
    online: false,
    color: "#7aa0c4",
    visited: ["north-bay", "ridge", "south-cape"],
  },
];

export type FeedItem = {
  id: string;
  who: FriendId;
  placeId: string;
  text: string;
  time: string;
};

export const FEED: FeedItem[] = [
  { id: "f1", who: "heng", placeId: "isles", text: "阿衡 点亮了 岛链", time: "2 分钟前" },
  { id: "f2", who: "you", placeId: "east-port", text: "你 和 阿衡 共享了 东岸港", time: "1 小时前" },
  { id: "f3", who: "bei", placeId: "south-cape", text: "北岛 走到了 南岬", time: "昨天" },
  { id: "f4", who: "heng", placeId: "ridge", text: "阿衡 与 北岛 在 半岛脊 相遇", time: "昨天" },
];

export function sharedBy(placeId: string): Friend[] {
  return FRIENDS.filter((friend) => friend.visited.includes(placeId));
}

export function isShared(placeId: string): boolean {
  return sharedBy(placeId).length >= 2;
}
