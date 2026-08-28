"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  FEED,
  FRIENDS,
  PLACES,
  sharedBy,
  type FriendId,
} from "@/lib/game-world";

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

  const feed = selected === "all" ? FEED : FEED.filter((item) => item.who === selected);

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
                  here === place.id ? "pin here" : people.length > 1 ? "pin shared" : "pin"
                }
                style={{ left: `${place.x}%`, top: `${place.y}%`, opacity: dim ? 0.28 : 1 }}
                onClick={() => walkTo(place.id)}
              >
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
        <p className="map-hint">点地点即可走入。好友去过的地点会互相点亮；两人以上到过即为共享。</p>
      </div>

      <section className="game-feed" aria-label="信息流">
        <h2>信息流</h2>
        {visiblePlaces.length ? (
          <p className="feed-sub">
            {selected === "all"
              ? "全图动态"
              : `${FRIENDS.find((f) => f.id === selected)?.name} 去过 ${visiblePlaces.length} 处`}
          </p>
        ) : null}
        <ol>
          {feed.map((item) => {
            const place = PLACES.find((p) => p.id === item.placeId);
            const who = FRIENDS.find((f) => f.id === item.who);
            return (
              <li key={item.id}>
                <button type="button" onClick={() => walkTo(item.placeId)}>
                  <b>{item.text}</b>
                  <small>
                    {item.time}
                    {place && sharedBy(place.id).length > 1 ? " · 共享地点" : ""}
                    {who ? ` · ${who.name}` : ""}
                  </small>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
