export type GenerateKind = "world" | "object";

export type GenerateIntent = {
  kind: GenerateKind;
  prompt: string;
};

const SHOT_ONLY = /生成镜头|generate shots|分镜|shot list/i;

/** Semantic trigger for the Aholo generate popup. Director/shot language is ignored. */
export function detectGenerateIntent(text: string): GenerateIntent | null {
  const prompt = text.trim();
  if (!prompt || SHOT_ONLY.test(prompt)) {
    return null;
  }
  const wantsGenerate = /生成|creat(?:e|ing)|make a|给我|做一/i.test(prompt);
  const world =
    /世界|场景模型|world model|重建场景|生成场景|生成世界|室内场景|3dgs|空间模型|厅堂|生成.{0,12}场景/i.test(
      prompt,
    );
  const object =
    /物体|道具|椅子|桌子|灯|雕塑|沙发|门|窗|文生3d|图生3d|lux3d|生成模型|生成一个|生成一把|生成一只/i.test(
      prompt,
    );
  if (world && (wantsGenerate || /world model/i.test(prompt))) {
    return { kind: "world", prompt };
  }
  if (object && wantsGenerate) {
    return { kind: "object", prompt };
  }
  if (/creat(?:e|ing) your world|创建世界/i.test(prompt)) {
    return { kind: "world", prompt };
  }
  return null;
}
