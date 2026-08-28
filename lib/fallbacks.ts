import type { DirectorResponse, Shot, SpaceModel, VisualDNA } from "@/lib/types";
import { resolveSpaceObject } from "./space-objects";
import { applyPathToShot } from "./path-engine";

export const EXAMPLE_VISUAL_DNA: VisualDNA = {
  reference_id: "ref_001",
  subject: {
    type: "person",
    count: 1,
    position: "center",
  },
  objects: ["building", "window"],
  composition: {
    shot_type: "medium_wide",
    subject_position: "center",
    symmetry: true,
    depth: "strong",
    building_ratio: 0.65,
  },
  camera: {
    lens: 35,
    height: "low",
    angle: "low_angle",
    movement: "dolly_in",
  },
  color: {
    temperature: "warm",
    contrast: "medium",
    saturation: "muted",
    palette: ["#c4a574", "#5c4634", "#d8cbb8"],
  },
  mood: ["cinematic", "nostalgic", "quiet"],
};

export function fallbackShots(
  sceneId: string,
  space: SpaceModel,
  referenceId = "ref_001",
): Shot[] {
  const person = space.objects.find((item) => item.type === "person");
  const building = space.objects.find((item) => item.type === "building");
  const windowObj = space.objects.find((item) => item.type === "window");
  const personPos = person?.position ?? ([0, 0.9, 3.5] as [number, number, number]);
  const buildingPos = building?.position ?? ([0, 2.6, 17] as [number, number, number]);
  const windowPos = windowObj?.position ?? ([3, 3, 15] as [number, number, number]);

  const drafts: Shot[] = [
    {
      shot_id: "shot_01",
      scene_id: sceneId,
      reference_id: referenceId,
      title: "Establishing",
      kind: "establishing",
      target: {
        type: "building",
        object_id: building?.id ?? "building_01",
        position: buildingPos,
      },
      camera: {
        position: [0, 2.1, -4],
        rotation: [0, 0, 0],
        lens: 24,
        height: 2.1,
        angle: "eye_level",
      },
      composition: {
        subject_ratio: 0.62,
        horizontal: 0.5,
        vertical: 0.46,
      },
      movement: {
        type: "DOLLY_IN",
        start: [0, 2.1, -4],
        end: [0, 1.9, 2],
        duration: 6,
        speed: 1,
      },
      path: { start: [0, 2.1, -4], waypoints: [], end: [0, 1.9, 2], target: buildingPos },
      match: {
        composition: 0.9,
        subject: 0.78,
        color: 0.84,
        camera: 0.88,
        overall: 0.85,
      },
      color: { temperature: "warm", contrast: "medium" },
    },
    {
      shot_id: "shot_02",
      scene_id: sceneId,
      reference_id: referenceId,
      title: "Follow",
      kind: "follow",
      target: {
        type: "person",
        object_id: person?.id ?? "person_01",
        position: personPos,
      },
      camera: {
        position: [-2.8, 1.5, 1.6],
        rotation: [0, 20, 0],
        lens: 35,
        height: 1.55,
        angle: "eye_level",
      },
      composition: {
        subject_ratio: 0.38,
        horizontal: 0.42,
        vertical: 0.52,
      },
      movement: {
        type: "TRACKING",
        start: [-2.8, 1.5, 1.6],
        end: [-2.2, 1.5, 10],
        duration: 5,
        speed: 1,
      },
      path: { start: [-2.8, 1.5, 1.6], waypoints: [], end: [-2.2, 1.5, 10], target: personPos },
      match: {
        composition: 0.92,
        subject: 0.87,
        color: 0.81,
        camera: 0.89,
        overall: 0.88,
      },
      color: { temperature: "warm", contrast: "medium" },
    },
    {
      shot_id: "shot_03",
      scene_id: sceneId,
      reference_id: referenceId,
      title: "Reveal",
      kind: "reveal",
      target: {
        type: "building",
        object_id: windowObj?.id ?? building?.id ?? "building_01",
        position: windowPos,
      },
      camera: {
        position: [6.5, 1.15, 10],
        rotation: [-8, -40, 0],
        lens: 35,
        height: 1.15,
        angle: "low_angle",
      },
      composition: {
        subject_ratio: 0.55,
        horizontal: 0.58,
        vertical: 0.4,
      },
      movement: {
        type: "ORBIT",
        start: [6.5, 1.15, 10],
        end: [-5.5, 1.15, 9],
        duration: 7,
        speed: 0.9,
      },
      path: { start: [6.5, 1.15, 10], waypoints: [], end: [-5.5, 1.15, 9], target: windowPos },
      match: {
        composition: 0.86,
        subject: 0.8,
        color: 0.83,
        camera: 0.91,
        overall: 0.85,
      },
      color: { temperature: "warm", contrast: "high" },
    },
  ];

  return drafts.map((shot) => applyPathToShot(shot, space));
}

export function heuristicDirector(
  instruction: string,
  shot: Shot,
  space?: SpaceModel,
): DirectorResponse {
  const text = instruction.toLowerCase();
  const patch: Record<string, unknown> = {};
  const changes: DirectorResponse["changes"] = [];

  const setChange = (
    key: string,
    label: string,
    from: string | number,
    to: string | number,
    slider?: DirectorResponse["changes"][number]["slider"],
  ) => {
    changes.push({ key, label, from, to, slider });
  };

  if (/慢/.test(text)) {
    const nextSpeed = 0.6;
    const nextDuration = Math.round((shot.movement.duration / (shot.movement.speed || 1)) * (1 / nextSpeed) * 10) / 10;
    patch.movement = {
      ...(typeof patch.movement === "object" ? patch.movement : {}),
      speed: nextSpeed,
      duration: nextDuration,
    };
    setChange("movement.speed", "Speed", shot.movement.speed ?? 1, nextSpeed, {
      min: 0.3,
      max: 1.5,
      step: 0.05,
    });
    setChange("movement.duration", "Duration", shot.movement.duration, nextDuration, {
      min: 2,
      max: 16,
      step: 0.5,
      unit: "s",
    });
  }

  if (/低/.test(text)) {
    patch.camera = {
      ...(typeof patch.camera === "object" ? patch.camera : {}),
      height: 1.1,
      angle: "low_angle",
    };
    setChange("camera.height", "Camera Height", shot.camera.height, 1.1, {
      min: 0.5,
      max: 2.8,
      step: 0.05,
      unit: "m",
    });
  }

  if (/侧后|跟拍|跟踪/.test(text)) {
    patch.camera = {
      ...(typeof patch.camera === "object" ? patch.camera : {}),
      angle: "rear_3_4",
    };
    patch.movement = {
      ...(typeof patch.movement === "object" ? patch.movement : {}),
      type: /绕/.test(text) ? "FOLLOW" : "TRACKING",
    };
    setChange("camera.angle", "Camera", shot.camera.angle ?? "front", "rear_3_4");
    setChange(
      "movement.type",
      "Movement",
      shot.movement.type,
      /绕/.test(text) ? "TRACKING + ORBIT" : "TRACKING",
    );
  } else if (/绕|环绕/.test(text)) {
    patch.movement = {
      ...(typeof patch.movement === "object" ? patch.movement : {}),
      type: "ORBIT",
    };
    setChange("movement.type", "Movement", shot.movement.type, "ORBIT");
  }

  if (/广角|鱼眼/.test(text)) {
    const fisheye = /鱼眼/.test(text);
    const lens = fisheye ? 12 : 24;
    patch.camera = {
      ...(typeof patch.camera === "object" ? patch.camera : {}),
      lens,
    };
    if (fisheye) {
      patch.lensStyle = "fisheye";
    }
    setChange("camera.lens", "Lens", shot.camera.lens, lens, {
      min: 12,
      max: 85,
      step: 1,
      unit: "mm",
    });
  }

  if (/黑柔/.test(text)) {
    patch.look = "black_soft";
    setChange("look", "Look", shot.look ?? "none", "black_soft");
  } else if (/白柔/.test(text)) {
    patch.look = "white_soft";
    setChange("look", "Look", shot.look ?? "none", "white_soft");
  } else if (/柔焦/.test(text)) {
    patch.look = "black_soft";
    setChange("look", "Look", shot.look ?? "none", "black_soft");
  }

  if (/荷兰|倾斜/.test(text)) {
    patch.camera = {
      ...(typeof patch.camera === "object" ? patch.camera : {}),
      angle: "dutch",
    };
    setChange("camera.angle", "Camera", shot.camera.angle ?? "eye_level", "dutch");
  }

  if (/急推/.test(text)) {
    patch.movement = {
      ...(typeof patch.movement === "object" ? patch.movement : {}),
      type: "DOLLY_IN",
      duration: 1.2,
      speed: 1.4,
    };
    setChange("movement.type", "Movement", shot.movement.type, "DOLLY_IN");
    setChange("movement.duration", "Duration", shot.movement.duration, 1.2, {
      min: 0.6,
      max: 16,
      step: 0.1,
      unit: "s",
    });
  }

  if (/手持/.test(text)) {
    patch.handheld = true;
    setChange("handheld", "Handheld", shot.handheld ? "on" : "off", "on");
  }

  if (/过肩/.test(text)) {
    patch.kind = "follow";
    patch.movement = {
      ...(typeof patch.movement === "object" ? patch.movement : {}),
      type: "FOLLOW",
    };
    setChange("kind", "Shot type", shot.kind, "follow");
  } else if (/建立/.test(text)) {
    patch.kind = "establishing";
    patch.movement = {
      ...(typeof patch.movement === "object" ? patch.movement : {}),
      type: "DOLLY_IN",
    };
    setChange("kind", "Shot type", shot.kind, "establishing");
  }

  if (/暖/.test(text) && !/柔/.test(text)) {
    patch.color = { temperature: "warm", contrast: shot.color?.contrast ?? "medium" };
    setChange("color.temperature", "Color", shot.color?.temperature ?? "neutral", "warm");
  } else if (/冷|青蓝/.test(text)) {
    patch.color = { temperature: "cool", contrast: shot.color?.contrast ?? "medium" };
    setChange("color.temperature", "Color", shot.color?.temperature ?? "neutral", "cool");
  }

  if (/高对比|对比/.test(text)) {
    patch.color = {
      temperature: (patch.color as { temperature?: string } | undefined)?.temperature
        ?? shot.color?.temperature
        ?? "warm",
      contrast: "high",
    };
    setChange("color.contrast", "Contrast", shot.color?.contrast ?? "medium", "high");
  }

  if (/青橙/.test(text)) {
    patch.color = { temperature: "teal_orange", contrast: "high" };
    setChange("color.temperature", "Color", shot.color?.temperature ?? "neutral", "teal_orange");
  }

  if (/靠近|更近/.test(text)) {
    patch.movement = {
      ...(typeof patch.movement === "object" ? patch.movement : {}),
      type: "DOLLY_IN",
    };
    setChange("movement.type", "Movement", shot.movement.type, "DOLLY_IN");
  }

  if (/电影/.test(text)) {
    patch.camera = {
      ...(typeof patch.camera === "object" ? patch.camera : {}),
      lens: 35,
    };
    patch.color = { temperature: "warm", contrast: "high" };
    setChange("camera.lens", "Lens", shot.camera.lens, 35, {
      min: 12,
      max: 85,
      step: 1,
      unit: "mm",
    });
  }

  if (/强化建筑/.test(text) || (/建筑/.test(text) && /强化|主体/.test(text) && !/跟拍|侧后/.test(text))) {
    patch.target = { type: "building", object_id: "building_01" };
    setChange("target", "Target", shot.target.type, "building");
  } else if (/强化人物/.test(text) || (/人物/.test(text) && /强化|靠近|跟/.test(text))) {
    patch.target = { type: "person", object_id: "person_01" };
    setChange("target", "Target", shot.target.type, "person");
  }

  const mentioned = space ? resolveSpaceObject(space, instruction) : undefined;
  if (mentioned) {
    patch.target = {
      type: mentioned.type,
      object_id: mentioned.id,
      position: mentioned.position,
    };
    setChange("target", "Target", shot.target.object_id, mentioned.label || mentioned.id);
  }

  if (changes.length === 0) {
    const nextHeight = Math.max(0.8, shot.camera.height - 0.15);
    patch.camera = { height: nextHeight };
    setChange("camera.height", "Camera Height", shot.camera.height, nextHeight, {
      min: 0.5,
      max: 2.8,
      step: 0.05,
      unit: "m",
    });
  }

  return { patch, changes };
}

export const QUICK_PROMPTS = [
  { id: "cinematic", label: "更电影感", instruction: "整体更电影感，35mm，暖色高对比。" },
  { id: "closer", label: "更靠近人物", instruction: "镜头更靠近人物，强化人物。" },
  { id: "wide", label: "更广角", instruction: "换成更广角，必要时带一点特殊镜头感。" },
  { id: "low", label: "更低机位", instruction: "镜头低一点，仰拍建筑与人物关系。" },
  { id: "building", label: "强化建筑", instruction: "强化建筑，主体对准铁路建筑立面。" },
  { id: "person", label: "强化人物", instruction: "强化人物，保持人物在画面中心偏左。" },
  { id: "slow", label: "慢一点", instruction: "让人物走慢一点，镜头运动也放慢。" },
  { id: "orbit", label: "环绕人物", instruction: "环绕人物，最后绕到建筑正面。" },
  { id: "match", label: "匹配参考图", instruction: "更贴近参考图的构图、机位和色彩。" },
];
