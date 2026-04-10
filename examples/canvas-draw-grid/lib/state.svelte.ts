import {
  applyBucketFill,
  applyPenStroke,
  getSquareBrushCoordinates,
  parseCellKey,
  TRANSPARENT_SWATCH,
  type DrawMode,
  type DrawTool,
  type GridCoordinate,
  type PaintedCells,
} from "./tools";
import { lsState } from "/@shared/ls-state.svelte";

interface PersistedDrawState {
  canvasWidth: number;
  canvasHeight: number;
  blockSize: number;
  palette: string[];
  selectedPaletteIndex: number;
  secondaryPaletteIndex: number;
  penSize: number;
  showGrid: boolean;
  paintedCells: PaintedCells;
}

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1350;
const DEFAULT_BLOCK_SIZE = 48;
const ENABLE_PALETTE_EDITING = false;
const INDICATOR_RESOLUTION_SCALE = 0.5;
const DEFAULT_PEN_SIZE = 1;
const MIN_PEN_SIZE = 1;
const MAX_PEN_SIZE = 100;
const DEFAULT_PALETTE = [
  TRANSPARENT_SWATCH,
  "#ffffff",
  "#000000",
  "#ef4444",
  "#f59e0b",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#a855f7",
];
const STORAGE_KEY = "canvas-draw-grid-state";
const DEFAULT_STATE: PersistedDrawState = {
  canvasWidth: DEFAULT_WIDTH,
  canvasHeight: DEFAULT_HEIGHT,
  blockSize: DEFAULT_BLOCK_SIZE,
  palette: [...DEFAULT_PALETTE],
  selectedPaletteIndex: 2,
  secondaryPaletteIndex: 0,
  penSize: DEFAULT_PEN_SIZE,
  showGrid: true,
  paintedCells: {},
};

function createState() {
  let persisted = lsState(STORAGE_KEY, DEFAULT_STATE, normalizePersistedState);
}

function normalizePersistedState(
  value: Partial<PersistedDrawState> | PersistedDrawState,
): PersistedDrawState {
  const paintedCells =
    value &&
    typeof value === "object" &&
    value.paintedCells &&
    typeof value.paintedCells === "object"
      ? Object.fromEntries(
          Object.entries(value.paintedCells).flatMap(([key, cellValue]) => {
            if (typeof cellValue === "string" && !!cellValue) {
              return [[key, cellValue] as const];
            }

            if (cellValue) {
              return [[key, "#000000"] as const];
            }

            return [];
          }),
        )
      : {};
  const rawPalette: string[] =
    value &&
    typeof value === "object" &&
    Array.isArray(value.palette) &&
    value.palette.length > 0
      ? value.palette
          .filter(
            (entry): entry is string => typeof entry === "string" && !!entry,
          )
          .map(normalizePaletteEntry)
      : [...DEFAULT_PALETTE];
  const hasTransparentSwatch = rawPalette.includes(TRANSPARENT_SWATCH);
  const palette = hasTransparentSwatch
    ? rawPalette
    : [TRANSPARENT_SWATCH, ...rawPalette];
  const selectedPaletteIndex = clampNumber(
    (value.selectedPaletteIndex ?? 1) + (hasTransparentSwatch ? 0 : 1),
    0,
    Math.max(0, palette.length - 1),
  );
  const secondaryPaletteIndex = clampNumber(
    value.secondaryPaletteIndex ?? 0,
    0,
    Math.max(0, palette.length - 1),
  );

  return {
    canvasWidth: clampNumber(value.canvasWidth ?? DEFAULT_WIDTH, 64, 4096),
    canvasHeight: clampNumber(value.canvasHeight ?? DEFAULT_HEIGHT, 64, 4096),
    blockSize: clampNumber(value.blockSize ?? DEFAULT_BLOCK_SIZE, 2, 1024),
    palette,
    selectedPaletteIndex,
    secondaryPaletteIndex,
    penSize: clampNumber(value.penSize ?? DEFAULT_PEN_SIZE, 1, MAX_PEN_SIZE),
    showGrid: value.showGrid ?? true,
    paintedCells,
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizePaletteEntry(value: string) {
  return value === TRANSPARENT_SWATCH
    ? TRANSPARENT_SWATCH
    : value.toLowerCase();
}
