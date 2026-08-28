import type { Shot } from "./types";

export function shotDuration(shot: Shot): number {
  return Math.max(0.1, shot.movement.duration || 0.1);
}

export function filmDuration(shots: Shot[]): number {
  return shots.reduce((sum, shot) => sum + shotDuration(shot), 0);
}

export function filmTAtShot(shots: Shot[], shotId: string): number {
  const total = filmDuration(shots);
  if (!total) {
    return 0;
  }
  let acc = 0;
  for (const shot of shots) {
    if (shot.shot_id === shotId) {
      return acc / total;
    }
    acc += shotDuration(shot);
  }
  return 0;
}

export function sampleFilm(
  shots: Shot[],
  t01: number,
): { shot: Shot; localT: number; index: number } | null {
  if (!shots.length) {
    return null;
  }
  const total = filmDuration(shots);
  let remain = Math.max(0, Math.min(1, t01)) * total;
  for (let i = 0; i < shots.length; i++) {
    const duration = shotDuration(shots[i]);
    if (remain < duration || i === shots.length - 1) {
      return {
        shot: shots[i],
        localT: Math.min(1, remain / duration),
        index: i,
      };
    }
    remain -= duration;
  }
  const last = shots.length - 1;
  return { shot: shots[last], localT: 1, index: last };
}
