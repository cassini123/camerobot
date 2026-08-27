function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) {
    return base;
  }
  if (Array.isArray(patch) || !isPlainObject(patch) || !isPlainObject(base)) {
    return patch as T;
  }
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    next[key] = deepMerge((base as Record<string, unknown>)[key], value);
  }
  return next as T;
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (!isPlainObject(acc)) {
      return undefined;
    }
    return acc[key];
  }, obj);
}

export function setPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const keys = path.split(".");
  const root = structuredClone(obj);
  let cursor: Record<string, unknown> = root;
  for (const key of keys.slice(0, -1)) {
    const nested = cursor[key];
    if (!isPlainObject(nested)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;
  return root;
}
