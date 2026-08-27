import type {
  CameraPath,
  MovementType,
  Shot,
  SpaceModel,
  SpaceObject,
  Vec3,
} from "./types";
import { add, clampVec, lookEuler, normalize, roundVec, scale, sub } from "./vec";

const MOVEMENT_ALIASES: Record<string, MovementType> = {
  STATIC: "STATIC",
  LOCKED_OFF: "STATIC",
  DOLLY: "DOLLY_IN",
  DOLLY_IN: "DOLLY_IN",
  DOLLYIN: "DOLLY_IN",
  PUSH: "DOLLY_IN",
  SLOW_PUSH: "DOLLY_IN",
  DOLLY_OUT: "DOLLY_OUT",
  PULL: "DOLLY_OUT",
  TRACK: "TRACKING",
  TRACKING: "TRACKING",
  PAN: "PAN",
  ORBIT: "ORBIT",
  FOLLOW: "FOLLOW",
};

export function normalizeMovement(type: string | undefined): MovementType {
  if (!type) {
    return "STATIC";
  }
  const key = type.toUpperCase().replace(/[\s-]+/g, "_");
  return MOVEMENT_ALIASES[key] ?? "STATIC";
}

export function findObject(
  space: SpaceModel,
  idOrType: string,
): SpaceObject | undefined {
  return (
    space.objects.find((item) => item.id === idOrType) ??
    space.objects.find((item) => item.type === idOrType)
  );
}

function targetPoint(shot: Shot, space: SpaceModel): Vec3 {
  const byId = findObject(space, shot.target.object_id);
  if (byId) {
    return [
      byId.position[0],
      byId.position[1] + (byId.size?.[1] ?? 1.6) * 0.35,
      byId.position[2],
    ];
  }
  return shot.target.position;
}

function lateral(dir: Vec3, amount: number): Vec3 {
  const side = normalize([-dir[2], 0, dir[0]]);
  return scale(side, amount);
}

export function buildPath(shot: Shot, space: SpaceModel): CameraPath {
  const target = targetPoint(shot, space);
  const height = shot.camera.height || 1.6;
  const type = normalizeMovement(shot.movement.type);
  const bounds = space.bounds;
  const person = findObject(space, "person_01") ?? findObject(space, "person");
  const building = findObject(space, "building_01") ?? findObject(space, "building");
  const personPos = person?.position ?? ([0, 0.9, 3.5] as Vec3);
  const buildingPos = building?.position ?? target;

  const towardBuilding = normalize(sub(buildingPos, personPos));
  let start: Vec3;
  let end: Vec3;
  let waypoints: Vec3[] = [];

  switch (type) {
    case "STATIC": {
      start = [shot.camera.position[0], height, shot.camera.position[2]];
      end = start;
      break;
    }
    case "DOLLY_IN": {
      start = add(target, [0, height - target[1], 10]);
      end = add(target, [0, height - target[1], 5]);
      waypoints = [lerpSafe(start, end, 0.5)];
      break;
    }
    case "DOLLY_OUT": {
      start = add(target, [0, height - target[1], 5]);
      end = add(target, [0, height - target[1], 11]);
      waypoints = [lerpSafe(start, end, 0.5)];
      break;
    }
    case "TRACKING": {
      const offset = add(lateral(towardBuilding, -2.8), [0, height - personPos[1], -1.6]);
      start = add(personPos, offset);
      end = add(add(personPos, scale(towardBuilding, 7)), offset);
      waypoints = [
        add(start, scale(towardBuilding, 2.4)),
        add(start, scale(towardBuilding, 4.8)),
      ];
      break;
    }
    case "PAN": {
      start = [shot.camera.position[0], height, shot.camera.position[2]];
      end = start;
      waypoints = [];
      break;
    }
    case "ORBIT": {
      const radius = 7.2;
      const cy = height;
      const points: Vec3[] = [];
      for (let i = 0; i <= 6; i += 1) {
        const t = i / 6;
        const angle = Math.PI * 0.15 + t * Math.PI * 0.85;
        points.push([
          target[0] + Math.cos(angle) * radius,
          cy,
          target[2] + Math.sin(angle) * radius,
        ]);
      }
      start = points[0];
      waypoints = points.slice(1, -1);
      end = points[points.length - 1];
      break;
    }
    case "FOLLOW": {
      const behind = add(scale(towardBuilding, -2.4), lateral(towardBuilding, -1.1));
      start = add(personPos, [behind[0], height - personPos[1], behind[2]]);
      const mid = add(personPos, scale(towardBuilding, 4));
      const front = add(buildingPos, [2.4, 0, -6.5]);
      waypoints = [
        add(mid, [behind[0], height - personPos[1], behind[2] * 0.3]),
        [front[0], height, front[2] + 2],
      ];
      end = [front[0], height, front[2]];
      break;
    }
    default: {
      start = shot.camera.position;
      end = shot.movement.end ?? shot.camera.position;
    }
  }

  if (shot.movement.start?.length === 3 && type === "STATIC") {
    start = [shot.movement.start[0], height, shot.movement.start[2]];
    end = start;
  }

  start = roundVec(clampVec(start, bounds));
  end = roundVec(clampVec(end, bounds));
  waypoints = waypoints.map((point) => roundVec(clampVec(point, bounds)));
  const targetClamped = roundVec(clampVec(target, bounds, 0));

  return {
    start,
    waypoints,
    end,
    target: targetClamped,
  };
}

function lerpSafe(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export function samplePath(path: CameraPath, t: number): Vec3 {
  const points = [path.start, ...path.waypoints, path.end];
  if (points.length === 1) {
    return points[0];
  }
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const localT = scaled - index;
  return lerpSafe(points[index], points[index + 1], localT);
}

export function applyPathToShot(shot: Shot, space: SpaceModel): Shot {
  const path = buildPath(shot, space);
  const rotation = lookEuler(path.start, path.target);
  return {
    ...shot,
    movement: {
      ...shot.movement,
      type: normalizeMovement(shot.movement.type),
      start: path.start,
      end: path.end,
    },
    camera: {
      ...shot.camera,
      position: path.start,
      rotation,
      height: shot.camera.height,
    },
    path,
  };
}

export function pathPoints(path: CameraPath): Vec3[] {
  return [path.start, ...path.waypoints, path.end];
}
