<script lang="ts">
  import { tick } from "svelte";
  import Slider from "./Slider.svelte";
  import {
    clampNumber,
    drawCells,
    drawGridLines,
    floodFill,
    type GridCoordinate,
    interpolateGridLine,
    parseCellKey,
    toCellKey,
  } from "./utils";
  import { lsState } from "/@shared/ls-state.svelte";

  const STORAGE_KEY = "state10";
  const BLOCK_SIZES = [6, 12, 24, 48, 96, 192, 384, 768, 1536];
  const PALETTE = [
    "transparent",
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
  const DEFAULT_STATE: {
    aspectRatioName: "square" | "goldenV" | "goldenH" | "stage";
    aspectRatio: number;
    blockSize: number;
    mainColor: string;
    altColor: string;
    cells: { [key: string]: string };
    tool: "pen" | "bucket";
    showGrid: boolean;
    penSize: number;
  } = {
    aspectRatioName: "stage",
    aspectRatio: 1,
    blockSize: BLOCK_SIZES[3]!,
    mainColor: PALETTE[3]!,
    altColor: PALETTE[0]!,
    cells: {},
    tool: "pen",
    showGrid: true,
    penSize: 1,
  };

  let shell = $state<HTMLDivElement>(null!);
  let canvas = $state<HTMLCanvasElement>(null!);
  let gridCanvas = $state<HTMLCanvasElement>(null!);
  let bottomBar = $state<HTMLDivElement>(null!);
  let stage = $state<HTMLDivElement>(null!);
  let P = lsState(STORAGE_KEY, DEFAULT_STATE);

  let canvasLeft = $state(0);
  let canvasTop = $state(0);
  let canvasWidth = $state(100);
  let canvasHeight = $state(100);
  let logicalWidth = $state(100);
  let logicalHeight = $state(100);
  let isFullscreen = $state(false);

  let mouseXY = $state<GridCoordinate | null>(null);
  let canvasXY = $derived(mouseXY ? clientCoordToCanvas(mouseXY) : null);
  let gridMouseXY = $derived(
    mouseXY ? canvasCoordToCell(clientCoordToCanvas(mouseXY)) : null,
  );
  let gridPenBrushTargetXY = $derived.by(() => {
    if (canvasXY) {
      return canvasCoordToGroupOfCells(canvasXY, P.penSize);
    } else {
      return null;
    }
  });

  // $effect(() => {
  //   // const { x, y } = clientCoordToCanvas(canvasXY);
  //   console.log(canvasXY);
  // });

  function canvasCoordToGroupOfCells({ x, y }: GridCoordinate, size: number) {
    const even = size % 2 === 0;

    const cx = even ? Math.floor(x + 0.5) : Math.floor(x);
    const cy = even ? Math.floor(y + 0.5) : Math.floor(y);

    const half = Math.floor(size / 2);

    return {
      x: cx - half,
      y: cy - half,
    };
  }

  let pointerState = $state<null | {
    type: "penDown";
    mode: "main" | "alt";
    lastP: GridCoordinate;
  }>(null);

  function setAspectRatio(target: (typeof P)["aspectRatioName"]) {
    P.aspectRatioName = target;

    if (target === "square") {
      P.aspectRatio = 1;
    } else if (target === "goldenV") {
      P.aspectRatio = 16 / 9;
    } else if (target === "goldenH") {
      P.aspectRatio = 9 / 16;
    } else if (target === "stage") {
      const { width, height } = stage.getBoundingClientRect();
      P.aspectRatio = width / height;
    }
    resize();
  }

  function setPenSize(size: number) {
    P.penSize = clampNumber(size, 1, 64);
  }

  $effect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === stage) {
          resize();
        }
      }
    });

    const handleFullscreenChange = () => {
      isFullscreen = document.fullscreenElement === shell;
    };

    resizeObserver.observe(stage);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      resizeObserver.disconnect();
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  });

  function changeBlockSize(newBlockSize: number) {
    const prevBlockSize = P.blockSize;
    const prevColumns = Math.floor(canvasWidth / prevBlockSize) || 1;
    const prevRows = Math.floor(canvasHeight / prevBlockSize) || 1;
    const nextColumns = Math.floor(canvasWidth / newBlockSize) || 1;
    const nextRows = Math.floor(canvasHeight / newBlockSize) || 1;

    const shiftX = getCenteredGridShift(nextColumns - prevColumns);
    const shiftY = getCenteredGridShift(nextRows - prevRows);

    P.cells = shiftCells(P.cells, { x: shiftX, y: shiftY });
    P.blockSize = newBlockSize;
    resize();
  }

  function resize() {
    const { width, height } = stage.getBoundingClientRect();

    const stageAspectRatio = width / height;

    if (P.aspectRatioName === "stage") {
      P.aspectRatio = stageAspectRatio;
    }

    if (stageAspectRatio > P.aspectRatio) {
      canvasWidth = height * P.aspectRatio;
      canvasHeight = height;
    } else {
      canvasWidth = width;
      canvasHeight = width / P.aspectRatio;
    }

    const pxW = Math.floor(canvasWidth / P.blockSize);
    const pxH = Math.floor(canvasHeight / P.blockSize);

    canvas.width = pxW || 1;
    canvas.height = pxH || 1;
    logicalWidth = canvas.width;
    logicalHeight = canvas.height;
    gridCanvas.width = canvasWidth - (canvasWidth % P.blockSize);
    gridCanvas.height = canvasHeight - (canvasHeight % P.blockSize);

    // drawPixelCheckerboard(ctx);
    drawGridLines(gridCanvas.getContext("2d")!, P.blockSize);
    drawCells(canvas, P.cells);
    tick().then(() => {
      const { left, top } = gridCanvas.getBoundingClientRect();
      canvasLeft = left;
      canvasTop = top;
    });
  }

  function realBlockSize() {
    const w = logicalWidth;
    const h = logicalHeight;

    console.log("REAL BLOCK SIZE");

    return { xx: canvasWidth / w, yy: canvasHeight / h };
  }

  function clientCoordToCanvas(p: { x: number; y: number }): {
    x: number;
    y: number;
  } {
    if (canvasWidth === 0 || canvasHeight === 0) {
      return { x: 0, y: 0 };
    }

    return {
      x: ((p.x - canvasLeft) / canvasWidth) * logicalWidth,
      y: ((p.y - canvasTop) / canvasHeight) * logicalHeight,
    };
  }

  function canvasCoordToCell(p: { x: number; y: number }): {
    x: number;
    y: number;
  } {
    return {
      x: Math.max(0, Math.min(logicalWidth - 1, Math.floor(p.x))),
      y: Math.max(0, Math.min(logicalHeight - 1, Math.floor(p.y))),
    };
  }

  // function eventToCell(ev: PointerEvent) {
  //   return canvasCoordToCell(
  //     clientCoordToCanvas({ x: ev.clientX, y: ev.clientY }),
  //   );
  // }

  function paintStroke(from: GridCoordinate | null, to: GridCoordinate) {
    if (pointerState === null) return;
    const alt = pointerState.mode === "alt";

    let coordinatesToPaint: GridCoordinate[] = [];
    if (P.penSize !== 1) {
      if (from) {
        const p1 = canvasCoordToGroupOfCells(from, P.penSize);
        const p2 = canvasCoordToGroupOfCells(to, P.penSize);
        for (let i = 0; i < P.penSize; i++) {
          for (let j = 0; j < P.penSize; j++) {
            const cells = interpolateGridLine(
              { x: p1.x + i, y: p1.y + j },
              { x: p2.x + i, y: p2.y + j },
            );
            coordinatesToPaint.push(...cells);
          }
        }
      } else {
        const p = canvasCoordToGroupOfCells(to, P.penSize);
        for (let i = 0; i < P.penSize; i++) {
          for (let j = 0; j < P.penSize; j++) {
            coordinatesToPaint.push({ x: p.x + i, y: p.y + j });
          }
        }
      }
    } else {
      coordinatesToPaint = from
        ? interpolateGridLine(canvasCoordToCell(from), canvasCoordToCell(to))
        : [canvasCoordToCell(to)];
    }

    const color = alt ? P.altColor : P.mainColor;
    const shouldDelete = color === "transparent";

    for (const coordinate of coordinatesToPaint) {
      if (shouldDelete) {
        deleteCell(coordinate);
      } else {
        storeCell(coordinate, color);
      }
    }

    drawCells(canvas, P.cells);
  }

  function reset() {
    P.cells = {};
    drawCells(canvas, P.cells);
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement === shell) {
      await document.exitFullscreen();
      return;
    }

    await shell.requestFullscreen();
  }

  function storeCell(p: GridCoordinate, color: string) {
    const key = toCellKey(p.x, p.y);
    P.cells[key] = color;
  }

  function deleteCell(p: GridCoordinate) {
    const key = toCellKey(p.x, p.y);
    delete P.cells[key];
  }

  function shiftCells(
    cells: Record<string, string>,
    shift: GridCoordinate,
  ): Record<string, string> {
    const nextCells: Record<string, string> = {};

    for (const [key, color] of Object.entries(cells)) {
      const coordinate = parseCellKey(key);
      const nextCoordinate = {
        x: coordinate.x + shift.x,
        y: coordinate.y + shift.y,
      };

      nextCells[toCellKey(nextCoordinate.x, nextCoordinate.y)] = color;
    }

    return nextCells;
  }

  function getCenteredGridShift(delta: number) {
    return delta >= 0 ? Math.floor((delta + 1) / 2) : -Math.floor(-delta / 2);
  }

  // ███████╗██╗   ██╗███████╗███╗   ██╗████████╗███████╗
  // ██╔════╝██║   ██║██╔════╝████╗  ██║╚══██╔══╝██╔════╝
  // █████╗  ██║   ██║█████╗  ██╔██╗ ██║   ██║   ███████╗
  // ██╔══╝  ╚██╗ ██╔╝██╔══╝  ██║╚██╗██║   ██║   ╚════██║
  // ███████╗ ╚████╔╝ ███████╗██║ ╚████║   ██║   ███████║
  // ╚══════╝  ╚═══╝  ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝

  function handlePointerDown(ev: PointerEvent) {
    if (ev.button === 1) return;
    const lastP = clientCoordToCanvas(ev);
    const mode = ev.button === 2 ? "alt" : "main";

    if (P.tool === "pen") {
      pointerState = { type: "penDown", lastP, mode };
      paintStroke(null, lastP);
    } else if (P.tool === "bucket") {
      const coords = floodFill(P.cells, canvasCoordToCell(lastP), {
        columns: logicalWidth,
        rows: logicalHeight,
      });
      const color = mode === "main" ? P.mainColor : P.altColor;
      for (const coord of coords) {
        if (color === "transparent") {
          deleteCell(coord);
        } else {
          storeCell(coord, color);
        }
      }
      drawCells(canvas, P.cells);
    }
  }

  function handlePointerMove(ev: PointerEvent) {
    mouseXY = { x: ev.clientX, y: ev.clientY };
    if (pointerState === null) return;

    switch (pointerState.type) {
      case "penDown": {
        const nextP = clientCoordToCanvas(ev);
        paintStroke(pointerState.lastP, nextP);
        pointerState.lastP = nextP;
        break;
      }
    }
  }

  function handlePointerLeave() {
    if (pointerState !== null) {
      pointerState = null;
    }
  }

  function handlePointerWheel(ev: WheelEvent) {
    if (P.tool !== "pen") return;
    ev.preventDefault();
    setPenSize(P.penSize + (ev.deltaY < 0 ? 1 : -1));
  }
</script>

<div class="size-screen bg-gray-900 flex flex-col" bind:this={shell}>
  <div class="grow relative flex-cc overflow-hidden" bind:this={stage}>
    <div
      class="relative transparent-lines shadow-[0_20px_60px_rgba(0,0,0,0.34)]"
      style="width: {canvasWidth}px; height: {canvasHeight}px;"
    >
      <canvas
        style="image-rendering: pixelated;"
        class="absolute size-full left-0 top-0 z-1 cursor-crosshair"
        onpointerdown={handlePointerDown}
        onpointermove={handlePointerMove}
        onpointerleave={handlePointerLeave}
        onpointerup={handlePointerLeave}
        onwheel={handlePointerWheel}
        oncontextmenu={(ev) => ev.preventDefault()}
        bind:this={canvas}
      ></canvas>
      <canvas
        class="absolute size-full left-0 top-0 z-2 pointer-events-none"
        bind:this={gridCanvas}
      ></canvas>
      {#if P.tool === "pen" && gridPenBrushTargetXY}
        <!-- {@const multiX =} -->
        {@const { xx, yy } = realBlockSize()}
        {@const s = P.penSize}
        {@const { x, y } = gridPenBrushTargetXY}
        <!-- {@const xBlockSize = P.blockSize} -->
        <!-- {@const yBlockSize = P.blockSize} -->
        <div
          style={`transform: translate(${x * xx}px, ${y * yy}px);
              width: ${xx * P.penSize}px; height: ${yy * P.penSize}px;
              `}
          class="absolute z-3 top-0 left-0 b-2 b-black pointer-events-none"
        ></div>
      {/if}
    </div>
  </div>
  <div
    class="h12 bg-slate-500 flex-cc space-x-3 font-mono px-2"
    bind:this={bottomBar}
  >
    <select
      class="bg-white text-black w30 h8 rounded-1 px1.5"
      value={P.aspectRatioName}
      oninput={(ev) => setAspectRatio(ev.currentTarget.value as any)}
    >
      <option value="square">Square</option>
      <option value="goldenV">GoldenV</option>
      <option value="goldenH">GoldenH</option>
      <option value="stage">Stage</option>
    </select>

    <button
      class="bg-gray-100 h8 flex-cc hover:bg-white cursor-pointer text-black rounded-1 px1.5 uppercase"
      onclick={reset}>Reset</button
    >

    <button
      class="bg-gray-100 h8 flex-cc hover:bg-white cursor-pointer text-black rounded-1 px1.5 uppercase"
      onclick={toggleFullscreen}
    >
      {#if isFullscreen}
        <span class="i-fa-compress"></span>
      {:else}
        <span class="i-fa-expand"></span>
      {/if}
    </button>

    <div class="flex space-x-3 text-white">
      <div class="">SIZE:</div>
      <Slider
        value={P.blockSize}
        values={BLOCK_SIZES}
        onChange={(v) => {
          changeBlockSize(v);
        }}
      />
      <div>{P.blockSize}px</div>
    </div>
    <div class="grow"></div>
    <div class="flex overflow-hidden rounded-1">
      {#each PALETTE as color}
        <button
          class={[
            "h-8 w-8 relative group",
            {
              "transparent-lines": color === "transparent",
            },
          ]}
          style="background-color: {color};"
          aria-label="Set color to {color}"
          oncontextmenu={(ev) => ev.preventDefault()}
          onmousedown={(ev) => {
            if (ev.button === 0) {
              P.mainColor = color;
            } else if (ev.button === 2) {
              P.altColor = color;
            }
          }}
        >
          <div
            class={[
              "group-hover:block hidden absolute inset-0 b-1.5  group-last:rounded-r-1 group-first:rounded-l-1",
              {
                "b-gray-800 bg-white/20": color !== "#000000",
                "b-gray-200 bg-black/20": color === "#000000",
              },
            ]}
          ></div>
          {#if color === P.mainColor}
            <span
              class="absolute top-.5 left-.5 h3 w3 bg-white rounded-full b b-black"
            ></span>
          {/if}
          {#if color === P.altColor}
            <span
              class="absolute bottom-.5 right-.5 h3 w3 bg-white rounded-full b b-black"
            ></span>
          {/if}
        </button>
      {/each}
    </div>
    <div class="text-white b b-white/80 h-8 w-8 flex-cc rounded-1">
      {P.penSize}
    </div>
    <div class="flex bg-white/20 rounded-1">
      <button
        class={[
          "w8 h8 first:rounded-l-1",
          {
            "bg-white text-black": P.tool === "pen",
            "text-white": P.tool !== "pen",
          },
        ]}
        onclick={() => (P.tool = "pen")}
        aria-label="Pen tool"
      >
        <span class="i-fa-pen size-full block"></span>
      </button>
      <button
        class={[
          "w8 h8 last:rounded-r-1",
          {
            "bg-white text-black": P.tool === "bucket",
            "text-white": P.tool !== "bucket",
          },
        ]}
        onclick={() => (P.tool = "bucket")}
        aria-label="Fill tool"
      >
        <span class="i-fa-fill size-full block"></span>
      </button>
    </div>
  </div>
</div>

<style>
  .transparent-lines {
    background-image: linear-gradient(
      -45deg,
      rgba(255, 255, 255, 0.96) 25%,
      rgba(229, 231, 235, 0.96) 25%,
      rgba(229, 231, 235, 0.96) 50%,
      rgba(255, 255, 255, 0.96) 50%,
      rgba(255, 255, 255, 0.96) 75%,
      rgba(229, 231, 235, 0.96) 75%,
      rgba(229, 231, 235, 0.96) 100%
    );
    background-size: 20px 20px;
  }
</style>
