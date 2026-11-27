import type { Map as MapLibreMap } from "maplibre-gl";
import { BottomSheet } from "pure-web-bottom-sheet";
import { copy } from "./copy.ts";
import {
  MOBILE_MQ,
  SNAP_FULL,
  SNAP_PEEK,
  cycleSnapIndex,
  type RiverSheet,
} from "./sheet.ts";

declare global {
  interface HTMLElementTagNameMap {
    "bottom-sheet": BottomSheet;
  }
}

export function registerRiverSheet(): void {
  if (customElements.get("bottom-sheet")) return;
  customElements.define("bottom-sheet", BottomSheet);
}

function sheetFace(sheet: BottomSheet): HTMLElement | null {
  const root = sheet.shadowRoot;
  if (!root) return null;
  const face = root.querySelector("[part='sheet']");
  return face instanceof HTMLElement ? face : null;
}

export function mountRiverSheet(map: MapLibreMap): RiverSheet {
  registerRiverSheet();

  const app = document.querySelector(".hw-app");
  const chrome = document.querySelector(".hw-chrome");
  const dock = document.querySelector(".hw-dock");
  const sheet = document.querySelector("bottom-sheet");
  const panels = document.querySelector("#dock-panels");
  const cycle = document.querySelector("#sheet-cycle");
  const mq = window.matchMedia(MOBILE_MQ);

  if (
    !(app instanceof HTMLElement) ||
    !(dock instanceof HTMLElement) ||
    !(sheet instanceof BottomSheet) ||
    !(panels instanceof HTMLElement)
  ) {
    return {
      snapTo: () => undefined,
      snapIndex: () => SNAP_PEEK,
      expandFromPeek: () => undefined,
      afterPanelChange: () => undefined,
    };
  }

  let index = SNAP_PEEK;
  let faceObserver: ResizeObserver | null = null;

  const snapTo = (next: number, behavior: ScrollBehavior = "smooth"): void => {
    sheet.snapToPoint(next, { behavior });
  };

  const placePanels = (mobile: boolean): void => {
    sheet.hidden = !mobile;
    if (mobile) {
      if (panels.parentElement !== sheet) sheet.append(panels);
      snapTo(SNAP_PEEK, "instant");
    } else if (panels.parentElement !== dock) {
      dock.append(panels);
    }
  };

  const syncPadding = (): void => {
    const mobile = mq.matches;
    const top =
      mobile && chrome instanceof HTMLElement
        ? Math.round(chrome.getBoundingClientRect().height)
        : 0;
    let bottom = 0;
    if (mobile) {
      const face = sheetFace(sheet);
      bottom = face ? Math.round(face.getBoundingClientRect().height) : 0;
    }
    app.style.setProperty("--dock-offset", `${bottom}px`);
    map.setPadding({ top, right: 0, bottom, left: 0 });
  };

  const watchFace = (): void => {
    faceObserver?.disconnect();
    faceObserver = null;
    if (!mq.matches) return;
    const face = sheetFace(sheet);
    if (!face) return;
    faceObserver = new ResizeObserver(syncPadding);
    faceObserver.observe(face);
  };

  const onMedia = (): void => {
    placePanels(mq.matches);
    watchFace();
    syncPadding();
  };

  if (cycle instanceof HTMLButtonElement) {
    cycle.addEventListener("click", () => {
      snapTo(cycleSnapIndex(index));
    });
  }

  sheet.addEventListener("snap-position-change", (ev: Event) => {
    const detail = (ev as CustomEvent<{ snapIndex: number; sheetState: string }>)
      .detail;
    if (!detail) return;
    index = detail.snapIndex;
    if (cycle instanceof HTMLButtonElement) {
      cycle.setAttribute(
        "aria-label",
        detail.sheetState === "expanded" ? copy.sheetShrink : copy.sheetExpand,
      );
    }
    syncPadding();
  });

  if (chrome instanceof HTMLElement) {
    const chromeObserver = new ResizeObserver(syncPadding);
    chromeObserver.observe(chrome);
  }

  mq.addEventListener("change", onMedia);
  onMedia();

  return {
    snapTo,
    snapIndex: () => index,
    expandFromPeek: () => {
      if (!mq.matches || index > SNAP_PEEK) return;
      snapTo(SNAP_FULL);
    },
    afterPanelChange: (fromEmpty: boolean) => {
      if (!mq.matches) return;
      snapTo(fromEmpty ? SNAP_PEEK : index, "instant");
    },
  };
}
