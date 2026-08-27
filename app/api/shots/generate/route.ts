import { NextResponse } from "next/server";
import { fallbackShots } from "@/lib/fallbacks";
import { applyPathToShot } from "@/lib/path-engine";
import { qingchengJson } from "@/lib/qingcheng";
import type { Scene, Shot, SpaceModel, VisualDNA } from "@/lib/types";

const SYSTEM = `You are the shot planner of YUNJING.
Return JSON: { "shots": Shot[] } with 3 shots: establishing, follow/character, reveal.
Each shot must include shot_id, title, kind, target {type, object_id, position}, camera {position, rotation, lens, height, angle}, composition, movement {type, duration, speed}, match scores 0-1.
Movement type must be one of STATIC, DOLLY_IN, DOLLY_OUT, TRACKING, PAN, ORBIT, FOLLOW.
Use only object ids from the provided space. Do not invent new space objects. Do not include a path field.`;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    scene?: Scene;
    space?: SpaceModel;
    visual_dna?: VisualDNA;
  };

  if (!body.scene || !body.space) {
    return NextResponse.json({ error: "scene and space required" }, { status: 400 });
  }

  try {
    const { data } = await qingchengJson({
      system: SYSTEM,
      user: JSON.stringify({
        scene: body.scene,
        space: {
          space_id: body.space.space_id,
          bounds: body.space.bounds,
          objects: body.space.objects,
        },
        visual_dna: body.visual_dna,
      }),
    });
    const parsed = data as { shots?: Shot[] };
    if (Array.isArray(parsed.shots) && parsed.shots.length >= 3) {
      const shots = parsed.shots.slice(0, 4).map((shot, index) =>
        applyPathToShot(
          {
            ...shot,
            shot_id: shot.shot_id || `shot_0${index + 1}`,
            scene_id: body.scene!.scene_id,
            reference_id: body.visual_dna?.reference_id || "ref_001",
            path: shot.path || {
              start: shot.camera.position,
              waypoints: [],
              end: shot.movement.end || shot.camera.position,
              target: shot.target.position,
            },
          },
          body.space!,
        ),
      );
      return NextResponse.json({ shots, provider: "qingcheng" });
    }
  } catch {
    // fallback
  }

  return NextResponse.json({
    shots: fallbackShots(
      body.scene.scene_id,
      body.space,
      body.visual_dna?.reference_id || "ref_001",
    ),
    provider: "example",
  });
}
