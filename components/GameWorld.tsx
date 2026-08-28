"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FRIENDS, PLACES, type FriendId } from "@/lib/game-world";
import { EXPLORE_FEED, gameWorldExploreItems } from "@/lib/library-explore";
import { ExploreMasonry } from "./ExploreMasonry";

export function GameWorld() {
  const [selected, setSelected] = useState<FriendId | "all">("all");
  const [here, setHere] = useState("ridge");
  const [visits, setVisits] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(FRIENDS.map((friend) => [friend.id, [...friend.visited]])),
  );

  const visiblePlaces = useMemo(() => {
    if (selected === "all") {
      return PLACES;
    }
    const ids = new Set(visits[selected] ?? []);
    return PLACES.filter((place) => ids.has(place.id));
  }, [selected, visits]);

  function walkTo(placeId: string) {
    setHere(placeId);
    setVisits((cur) => {
      const mine = new Set(cur.you ?? []);
      mine.add(placeId);
      return { ...cur, you: [...mine] };
    });
  }

  const worldClips = useMemo(() => gameWorldExploreItems(), []);
  const clips =
    selected === "all"
      ? [...worldClips, ...EXPLORE_FEED]
      : [...worldClips, ...EXPLORE_FEED].filter((item) => item.who === selected);

  return (
    <div className="game-world">
      <header className="product-top">
        <Link className="brand" href="/yunjing">
          <b>YUNJING</b>
        </Link>
        <span className="product-mark">Game world</span>
      </header>

      <aside className="friend-rail" aria-label="好友">
        <p>好友</p>
        {FRIENDS.map((friend) => (
          <button
            key={friend.id}
            type="button"
            className={selected === friend.id ? "friend on" : "friend"}
            style={{ ["--f" as string]: friend.color }}
            onClick={() => setSelected((cur) => (cur === friend.id ? "all" : friend.id))}
            title={`${friend.name} · ${friend.title}`}
          >
            <i className={friend.online ? "online" : "offline"} />
            <b>{friend.name.slice(0, 1)}</b>
            <small>{friend.name}</small>
          </button>
        ))}
      </aside>

      <div className="game-map-wrap">
        <div className="game-map" role="application" aria-label="开放地图">
          <div className="map-wash" />
          {PLACES.map((place) => {
            const people = FRIENDS.filter((friend) => (visits[friend.id] ?? []).includes(place.id));
            const dim =
              selected !== "all" && !(visits[selected] ?? []).includes(place.id);
            return (
              <button
                key={place.id}
                type="button"
                className={
                  here === place.id
                    ? place.pano
                      ? "pin world here"
                      : "pin here"
                    : people.length > 1
                      ? place.pano
                        ? "pin world shared"
                        : "pin shared"
                      : place.pano
                        ? "pin world"
                        : "pin"
                }
                style={{ left: `${place.x}%`, top: `${place.y}%`, opacity: dim ? 0.28 : 1 }}
                onClick={() => walkTo(place.id)}
              >
                {place.pano ? <img src={place.pano} alt="" /> : null}
                <span>{place.name}</span>
                <em>
                  {people.length > 1
                    ? people.map((p) => p.name).join(" · ")
                    : place.hint}
                </em>
              </button>
            );
          })}
          <div className="you-token" style={{ left: `${PLACES.find((p) => p.id === here)?.x}%`, top: `${PLACES.find((p) => p.id === here)?.y}%` }} />
        </div>
        <p className="map-hint">点地点即可走入。四个生成世界带全景图钉；点信息流可进 VirtuPath 拍 3DGS。好友去过的地点会互相点亮。</p>
      </div>

      <section className="game-feed" aria-label="信息流">
        <h2>Explore</h2>
        {visiblePlaces.length ? (
          <p className="feed-sub">
            {selected === "all"
              ? "不规则信息流 · 悬停播放"
              : `${FRIENDS.find((f) => f.id === selected)?.name} 去过 ${visiblePlaces.length} 处`}
          </p>
        ) : null}
        <ExploreMasonry items={clips} />
      </section>
    </div>
  );
}
