<script lang="ts">
  import { onMount } from "svelte";

  type DrawMode = "paint" | "erase" | null;

  interface GridCoordinate {
    x: number;
    y: number;
  }

  const DEFAULT_WIDTH = 1080;
  const DEFAULT_HEIGHT = 1350;
  const DEFAULT_BLOCK_SIZE = 48;
  const DEFAULT_BLOCK_GAP = 2;

  let canvas = $state<HTMLCanvasElement | undefined>(undefined);
  let stageViewport = $state<HTMLDivElement | undefined>(undefined);
  let stageSection = $state<HTMLElement | undefined>(undefined);
  let canvasWidth = $state(DEFAULT_WIDTH);
  let canvasHeight = $state(DEFAULT_HEIGHT);
  let blockSize = $state(DEFAULT_BLOCK_SIZE);
  let blockGap = $state(DEFAULT_BLOCK_GAP);
  let showGrid = $state(true);
  let drawMode = $state<DrawMode>(null);
  let paintedCells = $state<Record<string, true>>({});
  let lastDrawCoordinate = $state<GridCoordinate | null>(null);
  let stageViewportWidth = $state(0);
  let stageViewportHeight = $state(0);
  let isFullscreen = $state(false);

  let columns = $derived(Math.max(1, Math.round(canvasWidth / blockSize)));
  let rows = $derived(Math.max(1, Math.round(canvasHeight / blockSize)));
  let cellWidth = $derived(canvasWidth / columns);
  let cellHeight = $derived(canvasHeight / rows);
  let clampedBlockGap = $derived(
    Math.max(0, Math.min(blockGap, Math.min(cellWidth, cellHeight) - 1)),
  );
  let paintedCount = $derived(Object.keys(paintedCells).length);
  let stageScale = $derived.by(() => {
    if (stageViewportWidth <= 0 || stageViewportHeight <= 0) {
      return 1;
    }

    return Math.min(
      1,
      stageViewportWidth / canvasWidth,
      stageViewportHeight / canvasHeight,
    );
  });
  let scaledCanvasWidth = $derived(canvasWidth * stageScale);
  let scaledCanvasHeight = $derived(canvasHeight * stageScale);

  onMount(() => {
    const stopDrawing = () => {
      drawMode = null;
      lastDrawCoordinate = null;
    };
    const handleFullscreenChange = () => {
      isFullscreen = document.fullscreenElement === stageSection;
    };
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      stageViewportWidth = entry.contentRect.width;
      stageViewportHeight = entry.contentRect.height;
    });

    window.addEventListener("pointerup", stopDrawing);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    if (stageViewport) {
      resizeObserver.observe(stageViewport);
    }

    return () => {
      window.removeEventListener("pointerup", stopDrawing);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      resizeObserver.disconnect();
    };
  });

  $effect(() => {
    const nextCells: Record<string, true> = {};
    let changed = false;

    for (const key of Object.keys(paintedCells)) {
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

      nextCells[key] = true;
    }

    if (changed) {
      paintedCells = nextCells;
    }
  });

  $effect(() => {
    drawCanvas();
  });

  function setCanvasWidth(value: number) {
    canvasWidth = clampNumber(value, 64, 4096);
  }

  function setCanvasHeight(value: number) {
    canvasHeight = clampNumber(value, 64, 4096);
  }

  function setBlockSize(value: number) {
    blockSize = clampNumber(value, 2, 1024);
  }

  function setBlockGap(value: number) {
    blockGap = clampNumber(value, 0, 64);
  }

  function drawCanvas() {
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    context.clearRect(0, 0, canvasWidth, canvasHeight);
    drawPaintedSquares(context);

    if (showGrid) {
      drawGridLines(context);
    }
  }

  function drawPaintedSquares(context: CanvasRenderingContext2D) {
    const gapOffset = clampedBlockGap / 2;
    const drawWidth = Math.max(0, cellWidth - clampedBlockGap);
    const drawHeight = Math.max(0, cellHeight - clampedBlockGap);

    context.fillStyle = "#111111";

    for (const key of Object.keys(paintedCells)) {
      const { x, y } = parseCellKey(key);

      context.fillRect(
        x * cellWidth + gapOffset,
        y * cellHeight + gapOffset,
        drawWidth,
        drawHeight,
      );
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
      context.lineTo(x, canvasHeight);
      context.stroke();
    }

    for (let row = 0; row <= rows; row += 1) {
      const y = row * cellHeight;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvasWidth, y);
      context.stroke();
    }

    context.restore();
  }

  function handlePointerDown(event: PointerEvent) {
    event.preventDefault();

    drawMode = event.button === 2 ? "erase" : "paint";
    applyDrawEvent(event);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!drawMode) {
      return;
    }

    applyDrawEvent(event);
  }

  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
  }

  function applyDrawEvent(event: PointerEvent) {
    const coordinate = getCellFromPointerEvent(event);

    if (!coordinate) {
      return;
    }

    const coordinatesToApply = lastDrawCoordinate
      ? interpolateGridLine(lastDrawCoordinate, coordinate)
      : [coordinate];

    for (const nextCoordinate of coordinatesToApply) {
      if (drawMode === "paint") {
        paintCell(nextCoordinate);
        continue;
      }

      if (drawMode === "erase") {
        eraseCell(nextCoordinate);
      }
    }

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

    const x = ((event.clientX - bounds.left) / bounds.width) * canvasWidth;
    const y = ((event.clientY - bounds.top) / bounds.height) * canvasHeight;

    if (x < 0 || y < 0 || x > canvasWidth || y > canvasHeight) {
      return null;
    }

    return {
      x: clampNumber(Math.floor(x / cellWidth), 0, columns - 1),
      y: clampNumber(Math.floor(y / cellHeight), 0, rows - 1),
    };
  }

  function paintCell({ x, y }: GridCoordinate) {
    const key = toCellKey(x, y);

    if (paintedCells[key]) {
      return;
    }

    paintedCells = {
      ...paintedCells,
      [key]: true,
    };
  }

  function eraseCell({ x, y }: GridCoordinate) {
    const key = toCellKey(x, y);

    if (!paintedCells[key]) {
      return;
    }

    const nextCells = { ...paintedCells };
    delete nextCells[key];
    paintedCells = nextCells;
  }

  function clearAll() {
    paintedCells = {};
  }

  function setCanvasToScreenSize() {
    setCanvasWidth(window.screen.width);
    setCanvasHeight(window.screen.height);
  }

  async function toggleFullscreen() {
    if (!stageSection) {
      return;
    }

    if (document.fullscreenElement === stageSection) {
      await document.exitFullscreen();
      return;
    }

    await stageSection.requestFullscreen();
  }

  function exportCanvas() {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvasWidth;
    exportCanvas.height = canvasHeight;

    const context = exportCanvas.getContext("2d");

    if (!context) {
      return;
    }

    drawPaintedSquares(context);

    const link = document.createElement("a");
    link.href = exportCanvas.toDataURL("image/png");
    link.download = `sitio-grid-${canvasWidth}x${canvasHeight}.png`;
    link.click();
  }

  function toCellKey(x: number, y: number) {
    return `${x},${y}`;
  }

  function parseCellKey(key: string): GridCoordinate {
    const [x, y] = key.split(",").map((value) => Number.parseInt(value, 10));

    return {
      x: x!,
      y: y!,
    };
  }

  function interpolateGridLine(from: GridCoordinate, to: GridCoordinate) {
    const coordinates: GridCoordinate[] = [];
    const deltaX = Math.abs(to.x - from.x);
    const deltaY = Math.abs(to.y - from.y);
    const stepX = from.x < to.x ? 1 : -1;
    const stepY = from.y < to.y ? 1 : -1;

    let currentX = from.x;
    let currentY = from.y;
    let error = deltaX - deltaY;

    while (true) {
      coordinates.push({ x: currentX, y: currentY });

      if (currentX === to.x && currentY === to.y) {
        break;
      }

      const doubledError = error * 2;

      if (doubledError > -deltaY) {
        error -= deltaY;
        currentX += stepX;
      }

      if (doubledError < deltaX) {
        error += deltaX;
        currentY += stepY;
      }
    }

    return coordinates;
  }

  function clampNumber(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  }
</script>

<div
  class="fixed inset-0 grid gap-5 bg-stone-950 p-5 text-stone-950 max-lg:grid-cols-1 lg:grid-cols-[19rem_minmax(0,1fr)]"
>
  <aside
    class="grid min-h-0 gap-4 rounded-[1.75rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 text-stone-50 shadow-[0_20px_60px_rgba(0,0,0,0.32)] backdrop-blur"
  >
    <div class="grid gap-2 border-b border-white/10 pb-4">
      <p
        class="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-amber-200/75"
      >
        Canvas Draw Grid
      </p>
      <h1 class="m-0 text-3xl leading-none">Draw</h1>
      <p class="m-0 text-sm leading-6 text-stone-300/86">
        Resize the canvas, choose a target block size, and paint directly onto
        cells.
      </p>
    </div>

    <div class="grid min-h-0 content-start gap-3 overflow-auto pr-1">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <label class="grid gap-2 rounded-[1.2rem] bg-white/5 p-3">
          <span
            class="text-[0.74rem] font-semibold uppercase tracking-[0.14em] text-stone-300"
          >
            Canvas width
          </span>
          <input
            type="number"
            min="64"
            max="4096"
            step="1"
            class="h-11 rounded-[0.95rem] border border-white/10 bg-stone-950/65 px-3 text-[0.95rem] text-stone-50 outline-none focus:border-amber-300"
            value={canvasWidth}
            oninput={(event) =>
              setCanvasWidth(
                Number.parseInt(
                  (event.currentTarget as HTMLInputElement).value,
                  10,
                ),
              )}
          />
        </label>

        <label class="grid gap-2 rounded-[1.2rem] bg-white/5 p-3">
          <span
            class="text-[0.74rem] font-semibold uppercase tracking-[0.14em] text-stone-300"
          >
            Canvas height
          </span>
          <input
            type="number"
            min="64"
            max="4096"
            step="1"
            class="h-11 rounded-[0.95rem] border border-white/10 bg-stone-950/65 px-3 text-[0.95rem] text-stone-50 outline-none focus:border-amber-300"
            value={canvasHeight}
            oninput={(event) =>
              setCanvasHeight(
                Number.parseInt(
                  (event.currentTarget as HTMLInputElement).value,
                  10,
                ),
              )}
          />
        </label>
      </div>

      <label class="grid gap-2 rounded-[1.2rem] bg-white/5 p-3">
        <span
          class="text-[0.74rem] font-semibold uppercase tracking-[0.14em] text-stone-300"
        >
          Block size
        </span>
        <input
          type="number"
          min="2"
          max="1024"
          step="1"
          class="h-11 rounded-[0.95rem] border border-white/10 bg-stone-950/65 px-3 text-[0.95rem] text-stone-50 outline-none focus:border-amber-300"
          value={blockSize}
          oninput={(event) =>
            setBlockSize(
              Number.parseInt(
                (event.currentTarget as HTMLInputElement).value,
                10,
              ),
            )}
        />
      </label>

      <label class="grid gap-2 rounded-[1.2rem] bg-white/5 p-3">
        <span
          class="text-[0.74rem] font-semibold uppercase tracking-[0.14em] text-stone-300"
        >
          Block gap
        </span>
        <input
          type="number"
          min="0"
          max="64"
          step="1"
          class="h-11 rounded-[0.95rem] border border-white/10 bg-stone-950/65 px-3 text-[0.95rem] text-stone-50 outline-none focus:border-amber-300"
          value={blockGap}
          oninput={(event) =>
            setBlockGap(
              Number.parseInt(
                (event.currentTarget as HTMLInputElement).value,
                10,
              ),
            )}
        />
      </label>

      <label
        class="flex items-center justify-between gap-4 rounded-[1.2rem] bg-white/5 px-3 py-3"
      >
        <div class="grid gap-1">
          <span
            class="text-[0.74rem] font-semibold uppercase tracking-[0.14em] text-stone-300"
          >
            Show grid
          </span>
          <span class="text-xs text-stone-400">
            Toggle guide lines on the stage
          </span>
        </div>
        <button
          type="button"
          aria-label={showGrid ? "Hide grid" : "Show grid"}
          class={`relative h-8 w-14 rounded-full transition ${
            showGrid ? "bg-amber-300" : "bg-white/12"
          }`}
          onclick={() => {
            showGrid = !showGrid;
          }}
        >
          <span
            class={`absolute top-1 size-6 rounded-full bg-stone-950 transition ${
              showGrid ? "left-7" : "left-1"
            }`}
          ></span>
        </button>
      </label>

      <div class="grid gap-2 rounded-[1.2rem] bg-white/5 p-3">
        <div
          class="text-[0.74rem] font-semibold uppercase tracking-[0.14em] text-stone-300"
        >
          Stage metrics
        </div>
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <div class="rounded-[0.95rem] bg-stone-950/45 px-3 py-2">
            <div
              class="text-[0.68rem] uppercase tracking-[0.14em] text-stone-500"
            >
              Columns
            </div>
            <div class="mt-1 text-lg font-semibold text-stone-50">{columns}</div>
          </div>
          <div class="rounded-[0.95rem] bg-stone-950/45 px-3 py-2">
            <div
              class="text-[0.68rem] uppercase tracking-[0.14em] text-stone-500"
            >
              Rows
            </div>
            <div class="mt-1 text-lg font-semibold text-stone-50">{rows}</div>
          </div>
          <div class="rounded-[0.95rem] bg-stone-950/45 px-3 py-2">
            <div
              class="text-[0.68rem] uppercase tracking-[0.14em] text-stone-500"
            >
              Actual block width
            </div>
            <div class="mt-1 text-lg font-semibold text-stone-50">
              {cellWidth.toFixed(2)}px
            </div>
          </div>
          <div class="rounded-[0.95rem] bg-stone-950/45 px-3 py-2">
            <div
              class="text-[0.68rem] uppercase tracking-[0.14em] text-stone-500"
            >
              Actual block height
            </div>
            <div class="mt-1 text-lg font-semibold text-stone-50">
              {cellHeight.toFixed(2)}px
            </div>
          </div>
          <div class="rounded-[0.95rem] bg-stone-950/45 px-3 py-2">
            <div
              class="text-[0.68rem] uppercase tracking-[0.14em] text-stone-500"
            >
              Painted cells
            </div>
            <div class="mt-1 text-lg font-semibold text-stone-50">
              {paintedCount}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      class="grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2 lg:grid-cols-1"
    >
      <button
        type="button"
        class="cursor-pointer rounded-full border border-white/10 bg-white/8 px-5 py-3 text-[0.82rem] font-semibold uppercase tracking-[0.18em] text-stone-50 transition hover:bg-white/14"
        onclick={setCanvasToScreenSize}
      >
        Screen Size
      </button>
      <button
        type="button"
        class="cursor-pointer rounded-full border border-white/10 bg-white/8 px-5 py-3 text-[0.82rem] font-semibold uppercase tracking-[0.18em] text-stone-50 transition hover:bg-white/14"
        onclick={toggleFullscreen}
      >
        {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
      </button>
      <button
        type="button"
        class="cursor-pointer rounded-full border border-white/10 bg-white/8 px-5 py-3 text-[0.82rem] font-semibold uppercase tracking-[0.18em] text-stone-50 transition hover:bg-white/14"
        onclick={clearAll}
      >
        Clear
      </button>
      <button
        type="button"
        class="cursor-pointer rounded-full bg-amber-300 px-5 py-3 text-[0.82rem] font-bold uppercase tracking-[0.18em] text-stone-950 transition hover:brightness-105"
        onclick={exportCanvas}
      >
        Export PNG
      </button>
    </div>
  </aside>

  <section
    bind:this={stageSection}
    class="grid min-h-0 min-w-0 place-items-center overflow-hidden rounded-[1.9rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
  >
    <div
      bind:this={stageViewport}
      class="grid size-full min-h-0 place-items-center overflow-hidden rounded-[1.55rem] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_38%),linear-gradient(180deg,rgba(24,24,27,0.95),rgba(10,10,10,0.98))]"
    >
      <div
        class="relative shrink-0"
        style={`width:${scaledCanvasWidth}px;height:${scaledCanvasHeight}px;`}
      >
        <div
          class="absolute left-0 top-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.92)_25%,rgba(245,245,244,0.92)_25%,rgba(245,245,244,0.92)_50%,rgba(255,255,255,0.92)_50%,rgba(255,255,255,0.92)_75%,rgba(245,245,244,0.92)_75%,rgba(245,245,244,0.92)_100%)] bg-[length:24px_24px] shadow-[0_20px_60px_rgba(0,0,0,0.34)]"
          style={`width:${canvasWidth}px;height:${canvasHeight}px;transform:scale(${stageScale});transform-origin:top left;`}
        >
          <canvas
            bind:this={canvas}
            class="block cursor-crosshair bg-transparent"
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            oncontextmenu={handleContextMenu}
          ></canvas>
        </div>
      </div>
    </div>
  </section>
</div>
