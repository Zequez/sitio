<script lang="ts">
  import { onMount } from "svelte";
  import FocusedImageStage from "./FocusedImageStage.svelte";
  import {
    DEFAULT_IMAGE_FOCUS_SETTINGS,
    loadImageFocusSettings,
    type ImageFocusSettings,
  } from "./image-focus-state";
  import {
    createVectorPolygon,
    loadVectorPolygons,
    saveVectorPolygons,
    type RelativePoint,
    type VectorPolygon,
  } from "./vector-polygons-state";

  interface Props {
    onBack?: () => void;
    onExport?: () => void;
  }

  let { onBack = () => {}, onExport = () => {} }: Props = $props();
  let settings = $state<ImageFocusSettings>({
    ...DEFAULT_IMAGE_FOCUS_SETTINGS,
  });
  let polygons = $state<VectorPolygon[]>([]);
  let currentPolygon = $state<RelativePoint[]>([]);
  let focusedPolygonId = $state<string | undefined>(undefined);
  let canvas = $state<HTMLCanvasElement | undefined>(undefined);
  let hasLoaded = $state(false);

  onMount(() => {
    settings = loadImageFocusSettings();
    polygons = loadVectorPolygons();
    hasLoaded = true;

    const resizeObserver = new ResizeObserver(() => {
      syncCanvasSize();
      drawPolygons();
    });

    if (canvas?.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    return () => {
      resizeObserver.disconnect();
    };
  });

  $effect(() => {
    if (!hasLoaded) {
      return;
    }

    saveVectorPolygons(polygons);
  });

  $effect(() => {
    syncCanvasSize();
    drawPolygons();
  });

  function syncCanvasSize() {
    if (!canvas || !canvas.parentElement) {
      return;
    }

    const bounds = canvas.parentElement.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));

    canvas.width = Math.round(width * devicePixelRatio);
    canvas.height = Math.round(height * devicePixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  function drawPolygons() {
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    context.clearRect(0, 0, width, height);

    for (const polygon of polygons) {
      const isFocused = polygon.id === focusedPolygonId;
      drawPolygon(context, polygon.points, width, height, true, isFocused);
      drawPolygonLabel(context, polygon, width, height, isFocused);
    }

    if (currentPolygon.length > 0) {
      drawPolygon(context, currentPolygon, width, height, false, false);
    }
  }

  function drawPolygon(
    context: CanvasRenderingContext2D,
    polygon: RelativePoint[],
    width: number,
    height: number,
    isClosed: boolean,
    isFocused: boolean,
  ) {
    if (polygon.length === 0) {
      return;
    }

    const points = polygon.map((point) => ({
      x: point.x * width,
      y: point.y * height,
    }));

    context.beginPath();
    context.moveTo(points[0]!.x, points[0]!.y);

    for (const point of points.slice(1)) {
      context.lineTo(point.x, point.y);
    }

    if (isClosed && points.length >= 3) {
      context.closePath();
      context.fillStyle = isFocused
        ? "rgba(245, 158, 11, 0.28)"
        : "rgba(0, 0, 0, 0.18)";
      context.fill();
    }

    context.strokeStyle = isFocused
      ? "rgba(245, 158, 11, 0.95)"
      : "rgba(15, 23, 42, 0.95)";
    context.lineWidth = isFocused ? 3 : 2;
    context.stroke();

    for (const point of points) {
      context.beginPath();
      context.arc(point.x, point.y, isFocused ? 5 : 4, 0, Math.PI * 2);
      context.fillStyle = isFocused ? "#f59e0b" : "#dc2626";
      context.fill();
    }
  }

  function drawPolygonLabel(
    context: CanvasRenderingContext2D,
    polygon: VectorPolygon,
    width: number,
    height: number,
    isFocused: boolean,
  ) {
    const label = polygon.label.trim();

    if (!label || polygon.points.length === 0) {
      return;
    }

    const center = polygon.points.reduce(
      (accumulator, point) => ({
        x: accumulator.x + point.x,
        y: accumulator.y + point.y,
      }),
      { x: 0, y: 0 },
    );
    const x = (center.x / polygon.points.length) * width;
    const y = (center.y / polygon.points.length) * height;

    context.font = '600 16px "Georgia", "Times New Roman", serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 4;
    context.strokeStyle = isFocused
      ? "rgba(255, 248, 220, 0.98)"
      : "rgba(255,255,255,0.9)";
    context.strokeText(label, x, y);
    context.fillStyle = isFocused ? "rgba(180, 83, 9, 0.98)" : "rgba(15,23,42,0.95)";
    context.fillText(label, x, y);
  }

  function handleCanvasClick(event: MouseEvent) {
    if (!canvas) {
      return;
    }

    const point = getRelativePoint(event);

    if (!point) {
      return;
    }

    if (
      currentPolygon.length >= 3 &&
      isClosingPoint(point, currentPolygon[0]!)
    ) {
      polygons = [...polygons, createVectorPolygon(currentPolygon)];
      currentPolygon = [];
      return;
    }

    currentPolygon = [...currentPolygon, point];
  }

  function handleCanvasContextMenu(event: MouseEvent) {
    event.preventDefault();

    if (currentPolygon.length === 0) {
      return;
    }

    currentPolygon = currentPolygon.slice(0, -1);
  }

  function getRelativePoint(event: MouseEvent): RelativePoint | undefined {
    if (!canvas) {
      return undefined;
    }

    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;

    return {
      x: clamp(x, 0, 1),
      y: clamp(y, 0, 1),
    };
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  function isClosingPoint(candidate: RelativePoint, firstPoint: RelativePoint) {
    const dx = candidate.x - firstPoint.x;
    const dy = candidate.y - firstPoint.y;

    return Math.hypot(dx, dy) <= 0.025;
  }

  function updatePolygonLabel(polygonId: string, label: string) {
    polygons = polygons.map((polygon) =>
      polygon.id === polygonId ? { ...polygon, label } : polygon,
    );
  }

  function deletePolygon(polygonId: string) {
    polygons = polygons.filter((polygon) => polygon.id !== polygonId);

    if (focusedPolygonId === polygonId) {
      focusedPolygonId = undefined;
    }
  }

  function focusPolygon(polygonId: string) {
    focusedPolygonId = polygonId;
  }

  function blurPolygon(polygonId: string) {
    if (focusedPolygonId === polygonId) {
      focusedPolygonId = undefined;
    }
  }
</script>

<div
  class="fixed inset-0 grid gap-5 p-5 max-lg:grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)]"
>
  <aside
    class="grid h-[calc(100vh_-_30px)] content-start gap-4 rounded-[1.75rem] bg-slate-900/82 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.24)] backdrop-blur-[14px]"
  >
    <button
      type="button"
      class="cursor-pointer rounded-full border-0 bg-linear-to-br from-slate-200 to-slate-300 px-[1.15rem] py-[0.95rem] text-[0.95rem] font-bold text-slate-900"
      onclick={onBack}
    >
      Back
    </button>

    <div class="grid min-h-0 gap-2">
      <div class="grid gap-1">
        <p
          class="m-0 text-[0.72rem] uppercase tracking-[0.08em] text-slate-400"
        >
          Casas
        </p>
        <p class="m-0 text-[0.8rem] leading-[1.35] text-slate-200/80">
          Click para crear un polígono. Click derecho para borrar un punto.
        </p>
      </div>

      <div class="grid auto-rows-min gap-1.5 overflow-auto pr-[0.15rem]">
        {#if polygons.length === 0}
          <div
            class="rounded-[0.95rem] border border-dashed border-slate-600/80 bg-slate-800/45 px-2.5 py-3 text-[0.8rem] text-slate-300/80"
          >
            Sin datos
          </div>
        {:else}
          {#each polygons as polygon, index (polygon.id)}
            <div
              class={`grid items-center gap-2 rounded-[0.95rem] px-2.5 py-2 [grid-template-columns:auto_minmax(0,1fr)_auto] ${
                focusedPolygonId === polygon.id
                  ? "bg-amber-500/18 ring-1 ring-amber-400/70"
                  : "bg-slate-800/72"
              }`}
            >
              <span
                class="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-950/35 px-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.04em] text-slate-300/78"
              >
                {index + 1}
              </span>

              <input
                type="text"
                class="h-8 w-full rounded-[0.7rem] border border-slate-600 bg-slate-950/35 px-2.5 text-[0.8rem] text-slate-50 outline-none placeholder:text-slate-400 focus:border-amber-400"
                placeholder="Nombre"
                value={polygon.label}
                onfocus={() => focusPolygon(polygon.id)}
                onblur={() => blurPolygon(polygon.id)}
                oninput={(event) =>
                  updatePolygonLabel(
                    polygon.id,
                    (event.currentTarget as HTMLInputElement).value,
                  )}
              />

              <button
                type="button"
                class="inline-flex size-8 items-center justify-center rounded-full border-0 bg-slate-50/12 text-slate-50 transition hover:bg-red-500/85"
                onclick={() => deletePolygon(polygon.id)}
                aria-label={`Delete polygon ${index + 1}`}
              >
                <span class="i-fa-trash-can text-[0.78rem]"></span>
              </button>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <button
      type="button"
      class="cursor-pointer rounded-full border-0 bg-linear-to-br from-orange-500 to-amber-500 px-[1.15rem] py-[0.95rem] text-[0.95rem] font-bold text-gray-900"
      onclick={onExport}
    >
      Export
    </button>
  </aside>

  <section class="grid min-h-0 min-w-0 place-items-center max-lg:items-start">
    <FocusedImageStage {settings}>
      <canvas
        bind:this={canvas}
        class="absolute inset-0 block size-full cursor-crosshair"
        onclick={handleCanvasClick}
        oncontextmenu={handleCanvasContextMenu}
      ></canvas>
    </FocusedImageStage>
  </section>
</div>
