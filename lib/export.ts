import type { RobotHints, Shot } from "./types";
import { yawDeg } from "./vec";

function lensHint(lens: number): string {
  if (lens <= 24) {
    return "wide";
  }
  if (lens <= 40) {
    return "normal";
  }
  return "short_telephoto";
}

export function shotToRobotHints(shot: Shot): RobotHints {
  const start = shot.path.start;
  const end = shot.path.end;
  const moving = ["TRACKING", "FOLLOW", "DOLLY_IN", "DOLLY_OUT", "ORBIT"].includes(
    shot.movement.type,
  );
  return {
    base: {
      x_m: start[0],
      y_m: start[2],
      yaw_deg: Math.round(yawDeg(start, end.length ? end : shot.path.target)),
      mode: moving ? "follow" : "position",
    },
    lift: {
      height_m: shot.camera.height,
      lock_after_move: shot.movement.type === "STATIC",
    },
    head: {
      pan_deg: 0,
      tilt_deg: shot.camera.angle === "low_angle" ? 10 : shot.camera.angle === "high_angle" ? -12 : 0,
      roll_deg: 0,
      tracking: "subject_lock",
    },
    camera: {
      mode: "video",
      focal_length_hint: lensHint(shot.camera.lens),
      exposure_mode: "auto_with_face_priority",
      focus_mode: "subject_tracking",
    },
    safety: {
      max_speed_mps: 0.35,
      human_clearance_m: 0.8,
      emergency_stop_required: true,
      privacy_indicator_required: true,
    },
  };
}

export function buildExportPayload(input: {
  project: { id: string; name: string };
  story: unknown;
  space: unknown;
  references: unknown[];
  scenes: unknown;
  shots: Shot[];
}) {
  return {
    project: input.project,
    story: input.story,
    space: input.space,
    references: input.references,
    scenes: input.scenes,
    shots: input.shots.map((shot) => ({
      ...shot,
      robot_hints: shotToRobotHints(shot),
    })),
  };
}
