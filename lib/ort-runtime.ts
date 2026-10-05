/** Path helpers. Browser code must not import onnxruntime-web. */

export function isLocalOrtPath(path: string): boolean {
  return path.startsWith("/") && !/^https?:\/\//.test(path);
}
