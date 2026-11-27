export const MOBILE_MQ = "(max-width: 720px)";

/** Library snap index for peek. 0 is swipe-to-dismiss, which we do not use. */
export const SNAP_PEEK = 1;
export const SNAP_HALF = 2;
export const SNAP_FULL = 3;

const SNAP_ORDER = [SNAP_PEEK, SNAP_HALF, SNAP_FULL] as const;

const SEARCH_PAD = { top: 88, right: 48, bottom: 16, left: 48 };

export type EdgePad = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type RiverSheet = {
  snapTo: (index: number, behavior?: ScrollBehavior) => void;
  snapIndex: () => number;
  expandFromPeek: () => void;
  afterPanelChange: (fromEmpty: boolean) => void;
};

export function cycleSnapIndex(index: number): number {
  const from = SNAP_ORDER.indexOf(index as (typeof SNAP_ORDER)[number]);
  const i = from === -1 ? 0 : from;
  return SNAP_ORDER[(i + 1) % SNAP_ORDER.length];
}

export function framePadding(pad: Partial<EdgePad>): EdgePad {
  return {
    top: Math.max(SEARCH_PAD.top, pad.top ?? 0),
    right: Math.max(SEARCH_PAD.right, pad.right ?? 0),
    bottom: Math.max(SEARCH_PAD.bottom, pad.bottom ?? 0),
    left: Math.max(SEARCH_PAD.left, pad.left ?? 0),
  };
}
