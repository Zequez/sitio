<script lang="ts">
  import { onMount } from "svelte";
  import { lsState } from "/@shared/ls-state.svelte";
  import Toolbar from "./Toolbar.svelte";
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

  let canvas = $state<HTMLCanvasElement | undefined>(undefined);
  let gridCanvas = $state<HTMLCanvasElement | undefined>(undefined);
  let indicatorCanvas = $state<HTMLCanvasElement | undefined>(undefined);
  let shell = $state<HTMLDivElement | undefined>(undefined);
  let stageViewport = $state<HTMLDivElement | undefined>(undefined);
  let bottomBar = $state<HTMLDivElement | undefined>(undefined);
  let persisted = lsState(STORAGE_KEY, DEFAULT_STATE, normalizePersistedState);
  let activeTool = $state<DrawTool>("pen");
  let drawMode = $state<DrawMode>(null);
  let activeStrokeColor = $state<string | null>(null);
  let hoverCoordinate = $state<GridCoordinate | null>(null);
  let lastDrawCoordinate = $state<GridCoordinate | null>(null);
  let stageViewportWidth = $state(0);
  let stageViewportHeight = $state(0);
  let bottomBarHeight = $state(0);
  let isFullscreen = $state(false);

  let columns = $derived(
    Math.max(1, Math.round(persisted.canvasWidth / persisted.blockSize)),
  );
  let rows = $derived(
    Math.max(1, Math.round(persisted.canvasHeight / persisted.blockSize)),
  );
  let cellWidth = $derived(persisted.canvasWidth / columns);
  let cellHeight = $derived(persisted.canvasHeight / rows);
  let stageScale = $derived.by(() => {
    if (stageViewportWidth <= 0 || stageViewportHeight <= 0) {
      return 1;
    }

    return Math.min(
      1,
      stageViewportWidth / persisted.canvasWidth,
      stageViewportHeight / persisted.canvasHeight,
    );
  });
  let scaledCanvasWidth = $derived(persisted.canvasWidth * stageScale);
  let scaledCanvasHeight = $derived(persisted.canvasHeight * stageScale);
  let activePaintColor = $derived(
    toPaintColor(
      persisted.palette[
        clampNumber(
          persisted.selectedPaletteIndex,
          0,
          Math.max(0, persisted.palette.length - 1),
        )
      ] ?? DEFAULT_PALETTE[2]!,
    ),
  );
  let activeSecondaryPaintColor = $derived(
    toPaintColor(
      persisted.palette[
        clampNumber(
          persisted.secondaryPaletteIndex,
          0,
          Math.max(0, persisted.palette.length - 1),
        )
      ] ?? DEFAULT_PALETTE[0]!,
    ),
  );

  onMount(() => {
    const stopDrawing = () => {
      drawMode = null;
      activeStrokeColor = null;
      lastDrawCoordinate = null;
    };
    const handleFullscreenChange = () => {
      isFullscreen = document.fullscreenElement === shell;
    };
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === stageViewport) {
          stageViewportWidth = entry.contentRect.width;
          stageViewportHeight = entry.contentRect.height;
        }

        if (entry.target === bottomBar) {
          bottomBarHeight = entry.contentRect.height;
        }
      }
    });

    window.addEventListener("pointerup", stopDrawing);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    if (stageViewport) {
      resizeObserver.observe(stageViewport);
    }

    if (bottomBar) {
      resizeObserver.observe(bottomBar);
      bottomBarHeight = bottomBar.getBoundingClientRect().height;
    }

    return () => {
      window.removeEventListener("pointerup", stopDrawing);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      resizeObserver.disconnect();
    };
  });

  $effect(() => {
    const nextCells: PaintedCells = {};
    let changed = false;

    for (const key of Object.keys(persisted.paintedCells)) {
      const coordinate = parseCellKey(key);

      if (
        coordinate.x >= columns ||
        coordinate.y >= rows ||
        coordinate.x < 0 ||
        coordinate.y < 0
      ) {
        changed = true;
        continue;
      }

      nextCells[key] = persisted.paintedCells[key]!;
    }

    if (changed) {
      persisted.paintedCells = nextCells;
    }
  });

  $effect(() => {
    drawCanvas();
  });

  $effect(() => {
    drawGridCanvas();
  });

  $effect(() => {
    drawIndicatorCanvas();
  });

  function setCanvasWidth(value: number) {
    persisted.canvasWidth = clampNumber(value, 64, 4096);
  }

  function setCanvasHeight(value: number) {
    persisted.canvasHeight = clampNumber(value, 64, 4096);
  }

  function setBlockSize(value: number) {
    persisted.blockSize = clampNumber(value, 2, 1024);
  }

  function setPenSize(value: number) {
    persisted.penSize = clampNumber(value, MIN_PEN_SIZE, MAX_PEN_SIZE);
  }

  function selectPaletteColor(index: number) {
    persisted.selectedPaletteIndex = clampNumber(
      index,
      0,
      Math.max(0, persisted.palette.length - 1),
    );
  }

  function selectSecondaryPaletteColor(index: number) {
    persisted.secondaryPaletteIndex = clampNumber(
      index,
      0,
      Math.max(0, persisted.palette.length - 1),
    );
  }

  function updatePaletteColor(index: number, color: string) {
    if (index < 0 || index >= persisted.palette.length) {
      return;
    }

    const normalizedColor = normalizePaletteEntry(color);

    persisted.palette = persisted.palette.map((entry, entryIndex) =>
      entryIndex === index ? normalizedColor : entry,
    );
  }

  function clearAll() {
    persisted.paintedCells = {};
  }

  function setCanvasAspectRatio(
    mode: "maxFullwindow" | "maxFullscreen" | "square" | "vGolden" | "hGolden",
  ) {
    const nextBottomBarHeight = Math.round(
      bottomBar?.getBoundingClientRect().height ?? bottomBarHeight,
    );

    switch (mode) {
      case "maxFullwindow":
        setCanvasWidth(window.document.documentElement.clientWidth);
        setCanvasHeight(
          window.document.documentElement.clientHeight - nextBottomBarHeight,
        );
        break;
      case "maxFullscreen":
        setCanvasWidth(window.screen.width);
        setCanvasHeight(window.screen.height - nextBottomBarHeight);
        break;
      case "square":
        break;
      case "vGolden":
        break;
      case "hGolden":
        break;
    }
  }

  async function toggleFullscreen() {
    if (!shell) {
      return;
    }

    if (document.fullscreenElement === shell) {
      await document.exitFullscreen();
      return;
    }

    await shell.requestFullscreen();
  }

  function exportCanvas() {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = persisted.canvasWidth;
    exportCanvas.height = persisted.canvasHeight;

    const context = exportCanvas.getContext("2d");

    if (!context) {
      return;
    }

    drawPaintedPixels(context);

    const link = document.createElement("a");
    link.href = exportCanvas.toDataURL("image/png");
    link.download = `sitio-grid-${persisted.canvasWidth}x${persisted.canvasHeight}.png`;
    link.click();
  }

  function selectTool(nextTool: DrawTool) {
    activeTool = nextTool;
    drawMode = null;
    activeStrokeColor = null;
    lastDrawCoordinate = null;
  }

  function handlePointerDown(event: PointerEvent) {
    event.preventDefault();

    const nextStrokeColor =
      event.button === 2 ? activeSecondaryPaintColor : activePaintColor;
    const nextDrawMode: DrawMode = nextStrokeColor ? "paint" : "erase";
    const coordinate = getCellFromPointerEvent(event);

    if (!coordinate) {
      return;
    }

    activeStrokeColor = nextStrokeColor;
    hoverCoordinate = coordinate;

    if (activeTool === "bucket") {
      persisted.paintedCells = applyBucketFill({
        cells: persisted.paintedCells,
        start: coordinate,
        mode: nextDrawMode,
        paintColor: nextStrokeColor ?? "#000000",
        columns,
        rows,
      });
      drawMode = null;
      activeStrokeColor = null;
      lastDrawCoordinate = null;
      return;
    }

    drawMode = nextDrawMode;
    applyPenCoordinate(coordinate, nextDrawMode, nextStrokeColor);
  }

  function handlePointerMove(event: PointerEvent) {
    const coordinate = getCellFromPointerEvent(event);
    hoverCoordinate = coordinate;

    if (!drawMode || activeTool !== "pen" || !coordinate) {
      return;
    }

    applyPenCoordinate(coordinate, drawMode, activeStrokeColor);
  }

  function handlePointerLeave() {
    hoverCoordinate = null;
  }

  function handlePointerWheel(event: WheelEvent) {
    if (activeTool !== "pen" || event.deltaY === 0) {
      return;
    }

    event.preventDefault();
    setPenSize(persisted.penSize + (event.deltaY < 0 ? 1 : -1));
  }

  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
  }

  function drawCanvas() {
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const cellsCanvasResolution = getCellsCanvasResolution();

    canvas.width = cellsCanvasResolution.width;
    canvas.height = cellsCanvasResolution.height;
    canvas.style.width = `${persisted.canvasWidth}px`;
    canvas.style.height = `${persisted.canvasHeight}px`;
    canvas.style.imageRendering = "pixelated";

    context.clearRect(
      0,
      0,
      cellsCanvasResolution.width,
      cellsCanvasResolution.height,
    );
    context.imageSmoothingEnabled = false;

    drawPaintedPixels(context);
  }

  function getCellsCanvasResolution() {
    return {
      width: columns,
      height: rows,
    };
  }

  function drawGridCanvas() {
    if (!gridCanvas) {
      return;
    }

    const context = gridCanvas.getContext("2d");

    if (!context) {
      return;
    }

    gridCanvas.width = persisted.canvasWidth;
    gridCanvas.height = persisted.canvasHeight;
    gridCanvas.style.width = `${persisted.canvasWidth}px`;
    gridCanvas.style.height = `${persisted.canvasHeight}px`;

    context.clearRect(0, 0, persisted.canvasWidth, persisted.canvasHeight);

    if (!persisted.showGrid) {
      return;
    }

    drawGridLines(context);
  }

  function drawIndicatorCanvas() {
    if (!indicatorCanvas) {
      return;
    }

    const context = indicatorCanvas.getContext("2d");

    if (!context) {
      return;
    }

    const width = Math.max(
      1,
      Math.round(persisted.canvasWidth * INDICATOR_RESOLUTION_SCALE),
    );
    const height = Math.max(
      1,
      Math.round(persisted.canvasHeight * INDICATOR_RESOLUTION_SCALE),
    );
    const scaleX = width / persisted.canvasWidth;
    const scaleY = height / persisted.canvasHeight;
    const previewMode = drawMode ?? (activePaintColor ? "paint" : "erase");
    const previewColor =
      drawMode === "paint" ? activeStrokeColor : activePaintColor;

    indicatorCanvas.width = width;
    indicatorCanvas.height = height;
    indicatorCanvas.style.width = `${persisted.canvasWidth}px`;
    indicatorCanvas.style.height = `${persisted.canvasHeight}px`;

    context.clearRect(0, 0, width, height);

    if (!hoverCoordinate || activeTool !== "pen") {
      return;
    }

    context.imageSmoothingEnabled = false;
    context.save();
    context.scale(scaleX, scaleY);
    drawIndicatorSquares(context, hoverCoordinate, previewMode, previewColor);
    context.restore();
  }

  function drawPaintedPixels(context: CanvasRenderingContext2D) {
    for (const key of Object.keys(persisted.paintedCells)) {
      const { x, y } = parseCellKey(key);
      context.fillStyle = persisted.paintedCells[key]!;
      context.fillRect(x, y, 1, 1);
    }
  }

  function drawGridLines(context: CanvasRenderingContext2D) {
    context.save();
    context.strokeStyle = "rgba(24, 24, 27, 0.18)";
    context.lineWidth = 1;

    for (let column = 0; column <= columns; column += 1) {
      const x = column * cellWidth;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, persisted.canvasHeight);
      context.stroke();
    }

    for (let row = 0; row <= rows; row += 1) {
      const y = row * cellHeight;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(persisted.canvasWidth, y);
      context.stroke();
    }

    context.restore();
  }

  function drawIndicatorSquares(
    context: CanvasRenderingContext2D,
    center: GridCoordinate,
    mode: Exclude<DrawMode, null>,
    color: string | null,
  ) {
    const drawWidth = Math.max(0, cellWidth);
    const drawHeight = Math.max(0, cellHeight);
    const indicatorCoordinates = getSquareBrushCoordinates({
      center,
      size: persisted.penSize,
      columns,
      rows,
    });

    context.save();

    for (const coordinate of indicatorCoordinates) {
      const x = coordinate.x * cellWidth;
      const y = coordinate.y * cellHeight;

      if (mode === "paint" && color) {
        context.fillStyle = `${color}aa`;
        context.fillRect(x, y, drawWidth, drawHeight);
      }

      context.lineWidth = 2;
      context.strokeStyle =
        mode === "paint" && color ? "rgba(255,255,255,0.95)" : "#111111";
      context.strokeRect(x, y, drawWidth, drawHeight);
    }

    context.restore();
  }

  function applyPenCoordinate(
    coordinate: GridCoordinate,
    nextDrawMode: Exclude<DrawMode, null>,
    nextStrokeColor: string | null,
  ) {
    persisted.paintedCells = applyPenStroke({
      cells: persisted.paintedCells,
      from: lastDrawCoordinate,
      to: coordinate,
      mode: nextDrawMode,
      paintColor: nextStrokeColor ?? "#000000",
      brushSize: persisted.penSize,
      columns,
      rows,
    });
    lastDrawCoordinate = coordinate;
  }

  function getCellFromPointerEvent(event: PointerEvent): GridCoordinate | null {
    if (!canvas) {
      return null;
    }

    const bounds = canvas.getBoundingClientRect();

    if (bounds.width === 0 || bounds.height === 0) {
      return null;
    }

    const x =
      ((event.clientX - bounds.left) / bounds.width) * persisted.canvasWidth;
    const y =
      ((event.clientY - bounds.top) / bounds.height) * persisted.canvasHeight;

    if (
      x < 0 ||
      y < 0 ||
      x > persisted.canvasWidth ||
      y > persisted.canvasHeight
    ) {
      return null;
    }

    return {
      x: clampNumber(Math.floor(x / cellWidth), 0, columns - 1),
      y: clampNumber(Math.floor(y / cellHeight), 0, rows - 1),
    };
  }

  function clampNumber(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  }

  function toPaintColor(value: string) {
    return value === TRANSPARENT_SWATCH ? null : value;
  }

  function normalizePaletteEntry(value: string) {
    return value === TRANSPARENT_SWATCH
      ? TRANSPARENT_SWATCH
      : value.toLowerCase();
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
    const rawPalette =
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
</script>

<div
  bind:this={shell}
  class={`fixed inset-0 grid grid-rows-[minmax(0,1fr)_auto] bg-stone-950 text-stone-50 gap-0 p-0 `}
>
  <section
    class={`min-h-0 min-w-0 overflow-hidden border border-white/8  rounded-none border-0`}
  >
    <div
      bind:this={stageViewport}
      class={`grid size-full min-h-0 place-items-center overflow-hidden  rounded-none`}
    >
      <div
        class="relative shrink-0"
        style={`width:${scaledCanvasWidth}px;height:${scaledCanvasHeight}px;`}
      >
        <div
          class="absolute left-0 top-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.96)_25%,rgba(229,231,235,0.96)_25%,rgba(229,231,235,0.96)_50%,rgba(255,255,255,0.96)_50%,rgba(255,255,255,0.96)_75%,rgba(229,231,235,0.96)_75%,rgba(229,231,235,0.96)_100%)] bg-[length:20px_20px] shadow-[0_20px_60px_rgba(0,0,0,0.34)]"
          style={`width:${persisted.canvasWidth}px;height:${persisted.canvasHeight}px;transform:scale(${stageScale});transform-origin:top left;`}
        >
          <canvas
            bind:this={canvas}
            class={`block bg-transparent ${
              activeTool === "pen" ? "cursor-crosshair" : "cursor-default"
            }`}
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            onpointerleave={handlePointerLeave}
            oncontextmenu={handleContextMenu}
            onwheel={handlePointerWheel}
          ></canvas>
          <canvas
            bind:this={gridCanvas}
            class="pointer-events-none absolute left-0 top-0 block"
          ></canvas>
          <canvas
            bind:this={indicatorCanvas}
            class="pointer-events-none absolute left-0 top-0 block"
          ></canvas>
        </div>
      </div>
    </div>
  </section>

  <Toolbar
    bind:toolbarElement={bottomBar}
    {isFullscreen}
    canvasWidth={persisted.canvasWidth}
    canvasHeight={persisted.canvasHeight}
    blockSize={persisted.blockSize}
    palette={persisted.palette}
    selectedPaletteIndex={persisted.selectedPaletteIndex}
    secondaryPaletteIndex={persisted.secondaryPaletteIndex}
    penSize={persisted.penSize}
    enablePaletteEditing={ENABLE_PALETTE_EDITING}
    showGrid={persisted.showGrid}
    {activeTool}
    onCanvasWidthChange={setCanvasWidth}
    onCanvasHeightChange={setCanvasHeight}
    onBlockSizeChange={setBlockSize}
    onSelectPaletteColor={selectPaletteColor}
    onSelectSecondaryPaletteColor={selectSecondaryPaletteColor}
    onUpdatePaletteColor={updatePaletteColor}
    onToggleGrid={() => {
      persisted.showGrid = !persisted.showGrid;
    }}
    onMatchScreen={() => setCanvasAspectRatio("maxFullscreen")}
    onToggleFullscreen={toggleFullscreen}
    onClear={clearAll}
    onExport={exportCanvas}
    onSelectTool={selectTool}
  />
</div>
