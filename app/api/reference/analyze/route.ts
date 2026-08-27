import { NextResponse } from "next/server";
import { EXAMPLE_VISUAL_DNA } from "@/lib/fallbacks";
import { qingchengJson } from "@/lib/qingcheng";
import type { VisualDNA } from "@/lib/types";

const SYSTEM = `You are a cinematographer analyzing a still for YUNJING.
Return JSON only matching:
{
  "reference_id": "ref_001",
  "subject": { "type": "person|building|object", "count": 1, "position": "center|left|right" },
  "objects": ["building","window"],
  "composition": { "shot_type": "wide|medium_wide|medium|close", "subject_position": "center", "symmetry": true, "depth": "strong|medium|flat", "building_ratio": 0.65 },
  "camera": { "lens": 35, "height": "low|eye|high", "angle": "low_angle|eye_level|high_angle", "movement": "dolly_in|static|tracking|orbit" },
  "color": { "temperature": "warm|neutral|cool", "contrast": "low|medium|high", "saturation": "muted|medium|high" },
  "mood": ["cinematic","nostalgic"]
}`;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    image?: string;
    reference_id?: string;
  };

  try {
    if (body.image) {
      const { data } = await qingchengJson({
        vision: true,
        system: SYSTEM,
        user: [
          { type: "text", text: "Analyze this cinematography reference still." },
          { type: "image_url", image_url: { url: body.image } },
        ],
      });
      const dna = data as VisualDNA;
      return NextResponse.json({
        visual_dna: {
          ...EXAMPLE_VISUAL_DNA,
          ...dna,
          reference_id: body.reference_id || dna.reference_id || "ref_001",
        },
        provider: "qingcheng",
      });
    }
  } catch {
    // example fallback
  }

  return NextResponse.json({
    visual_dna: {
      ...EXAMPLE_VISUAL_DNA,
      reference_id: body.reference_id || "ref_001",
    },
    provider: "example",
  });
}
