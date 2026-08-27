import { NextResponse } from "next/server";
import { heuristicDirector } from "@/lib/fallbacks";
import { qingchengJson } from "@/lib/qingcheng";
import type { DirectorResponse, Shot } from "@/lib/types";

const SYSTEM = `You are the director controller of YUNJING.

You do not rewrite the story.
You do not create new space objects.
You only modify existing scene/shot/path parameters.
Return JSON only:
{
  "patch": { ...nested shot fields... },
  "changes": [
    { "key": "camera.height", "label": "Camera Height", "from": 1.6, "to": 1.1, "slider": { "min": 0.5, "max": 2.5, "step": 0.05, "unit": "m" } }
  ]
}

Allowed parameters:
- camera.position camera.rotation camera.lens camera.height camera.angle
- composition
- movement.type movement.duration movement.speed
- path.start path.end path.waypoints
- target
- color

movement.type must be one of STATIC DOLLY_IN DOLLY_OUT TRACKING PAN ORBIT FOLLOW.
Preserve spatial constraints. Preserve story intent.
Numeric changes that represent speed, distance, height, duration, or lens MUST include slider metadata.`;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    scope?: string;
    instruction?: string;
    current_state?: Shot;
  };

  if (!body.instruction || !body.current_state) {
    return NextResponse.json(
      { error: "instruction and current_state required" },
      { status: 400 },
    );
  }

  const fallback = heuristicDirector(body.instruction, body.current_state);

  try {
    const { data } = await qingchengJson({
      system: SYSTEM,
      user: JSON.stringify({
        scope: body.scope || "current_shot",
        instruction: body.instruction,
        current_state: {
          shot_id: body.current_state.shot_id,
          camera: body.current_state.camera,
          composition: body.current_state.composition,
          movement: body.current_state.movement,
          target: body.current_state.target,
          color: body.current_state.color,
        },
      }),
    });
    const parsed = data as DirectorResponse;
    if (parsed.patch && Array.isArray(parsed.changes) && parsed.changes.length) {
      return NextResponse.json({ ...parsed, provider: "qingcheng" });
    }
  } catch {
    // fallback
  }

  return NextResponse.json({ ...fallback, provider: "example" });
}
