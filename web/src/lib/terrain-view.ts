export type SceneView = {
  pitch: number;
  terrain: { source: "terrain"; exaggeration: number } | null;
  hillshade: "visible" | "none";
  rivers: "all" | "highlights";
};

export const TERRAIN_EXAGGERATION = 1.5;
export const HILLSHADE_EXAGGERATION = 0.3;
export const TERRAIN_PITCH = 60;

export function sceneView(opts: { terrain: boolean }): SceneView {
  if (!opts.terrain) {
    return {
      pitch: 0,
      terrain: null,
      hillshade: "none",
      rivers: "all",
    };
  }
  return {
    pitch: TERRAIN_PITCH,
    terrain: { source: "terrain", exaggeration: TERRAIN_EXAGGERATION },
    hillshade: "visible",
    rivers: "highlights",
  };
}
