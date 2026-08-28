export const VIEW_SPLIT = 0.62;

export function leftPaneNdc(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  dual: boolean,
): { x: number; y: number } | null {
  const split = dual ? rect.width * VIEW_SPLIT : rect.width;
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  if (localX < 0 || localX > split || localY < 0 || localY > rect.height) {
    return null;
  }
  return {
    x: (localX / Math.max(1, split)) * 2 - 1,
    y: -(localY / Math.max(1, rect.height)) * 2 + 1,
  };
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}
