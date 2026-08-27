import OpenAI from "openai";

const DEFAULT_BASE_URL = "https://aiping.cn/api/v1";
const DEFAULT_VISION = "Qwen2.5-VL-32B-Instruct";
const DEFAULT_TEXT = "DeepSeek-V3.1";

export function hasQingchengKey(): boolean {
  return Boolean(process.env.QINGCHENG_API_KEY);
}

export function createQingchengClient(): OpenAI | null {
  const apiKey = process.env.QINGCHENG_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new OpenAI({
    apiKey,
    baseURL: process.env.QINGCHENG_BASE_URL || DEFAULT_BASE_URL,
  });
}

export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    const arrayStart = raw.indexOf("[");
    const arrayEnd = raw.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return JSON.parse(raw.slice(arrayStart, arrayEnd + 1));
    }
    throw new Error("Model did not return JSON");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

export async function qingchengJson(options: {
  model?: string;
  system: string;
  user: string | OpenAI.Chat.ChatCompletionContentPart[];
  vision?: boolean;
}): Promise<{ data: unknown; model: string; fallback: false }> {
  const client = createQingchengClient();
  if (!client) {
    throw new Error("QINGCHENG_API_KEY missing");
  }
  const model =
    options.model ||
    (options.vision
      ? process.env.QINGCHENG_VISION_MODEL || DEFAULT_VISION
      : process.env.QINGCHENG_TEXT_MODEL || DEFAULT_TEXT);

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: options.system },
      {
        role: "user",
        content: options.user,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) {
    throw new Error("Empty model response");
  }
  return { data: parseJsonLoose(text), model, fallback: false };
}
