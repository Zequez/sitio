<script lang="ts">
  import { onMount } from "svelte";
  import {
    loadVectorPolygons,
    type RelativePoint,
    type VectorPolygon,
  } from "./vector-polygons-state";

  interface Props {
    onBack?: () => void;
  }

  let { onBack = () => {} }: Props = $props();

  let polygons = $state<VectorPolygon[]>([]);
  let hasCopied = $state(false);
  let copyFeedbackTimeout: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    polygons = loadVectorPolygons();
  });

  let svgCode = $derived.by(() => createExportSvg(polygons));
  let svgPreviewUrl = $derived.by(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgCode)}`,
  );

  function createExportSvg(polygons: VectorPolygon[]) {
    const polygonGroups = polygons
      .map((polygon, index) => renderPolygonGroup(polygon, index))
      .join("\n");

    return [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">',
      '  <metadata>{"source":"sitio-manzana-export"}</metadata>',
      polygonGroups,
      "</svg>",
    ].join("\n");
  }

  function renderPolygonGroup(polygon: VectorPolygon, index: number) {
    const points = polygon.points.map(formatPoint).join(" ");
    const metadata = escapeXml(
      JSON.stringify({
        id: polygon.id,
        label: polygon.label,
      }),
    );
    const label = polygon.label.trim();
    const centroid = calculateCentroid(polygon.points);
    const labelMarkup = label
      ? `\n    <text x="${formatNumber(centroid.x)}" y="${formatNumber(centroid.y)}" text-anchor="middle" dominant-baseline="middle" font-size="inherit" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace" fill="#111827" stroke="rgba(255,255,255,0.92)" stroke-width="0.008" paint-order="stroke fill">${escapeXml(label)}</text>`
      : "";

    return [
      `  <g id="polygon-${index + 1}" font-size="0.032">`,
      `    <metadata>${metadata}</metadata>`,
      `    <polygon points="${points}" fill="rgba(15,23,42,0.22)" stroke="#0f172a" stroke-width="0.008" />${labelMarkup}`,
      "  </g>",
    ].join("\n");
  }

  function calculateCentroid(points: RelativePoint[]) {
    if (points.length === 0) {
      return { x: 0.5, y: 0.5 };
    }

    const sum = points.reduce(
      (accumulator, point) => ({
        x: accumulator.x + point.x,
        y: accumulator.y + point.y,
      }),
      { x: 0, y: 0 },
    );

    return {
      x: sum.x / points.length,
      y: sum.y / points.length,
    };
  }

  async function copySvgCode() {
    await navigator.clipboard.writeText(svgCode);
    hasCopied = true;

    if (copyFeedbackTimeout) {
      clearTimeout(copyFeedbackTimeout);
    }

    copyFeedbackTimeout = setTimeout(() => {
      hasCopied = false;
    }, 1600);
  }

  function formatPoint(point: RelativePoint) {
    return `${formatNumber(point.x)},${formatNumber(point.y)}`;
  }

  function formatNumber(value: number) {
    return value.toFixed(6).replace(/\.?0+$/, "");
  }

  function escapeXml(value: string) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }
</script>

<div
  class="fixed inset-0 grid gap-5 p-5 max-lg:grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)]"
>
  <aside
    class="grid min-h-0 gap-4 rounded-[1.75rem] bg-slate-900/82 p-4 text-slate-50 shadow-[0_18px_44px_rgba(15,23,42,0.24)] backdrop-blur-[14px] lg:grid-rows-[auto_1fr_auto] max-lg:grid-rows-[auto_auto_auto]"
  >
    <div class="grid gap-[0.35rem] text-slate-50">
      <p class="m-0 text-[0.72rem] uppercase tracking-[0.08em] text-slate-400">
        Stage 3
      </p>
      <h2 class="m-0 text-2xl">Export</h2>
      <p class="m-0 text-sm leading-[1.45] text-slate-200/80">
        Preview and copy the final SVG with labels and polygon metadata.
      </p>
    </div>

    <div class="grid min-h-0 auto-rows-min gap-3 overflow-auto pr-[0.2rem] max-lg:overflow-visible">
      <div class="grid min-h-0 gap-2">
        <div class="flex items-center justify-between gap-3">
          <p class="m-0 text-[0.72rem] uppercase tracking-[0.08em] text-slate-400">
            SVG Code
          </p>
          <button
            type="button"
            class="inline-flex cursor-pointer items-center justify-center rounded-full border-0 bg-white px-3 py-2 text-[0.73rem] font-semibold text-slate-900 hover:bg-slate-200"
            onclick={copySvgCode}
          >
            {hasCopied ? "Copied" : "Copy"}
          </button>
        </div>

        <textarea
          class="min-h-[16rem] w-full resize-none rounded-[1.2rem] border border-slate-700 bg-slate-950 p-4 font-mono text-[0.64rem] leading-[1.3] text-slate-100 outline-none"
          readonly
          spellcheck="false"
          value={svgCode}
        ></textarea>
      </div>
    </div>

    <button
      type="button"
      class="cursor-pointer rounded-full border-0 bg-linear-to-br from-slate-200 to-slate-300 px-[1.15rem] py-[0.95rem] text-[0.95rem] font-bold text-slate-900"
      onclick={onBack}
    >
      Back
    </button>
  </aside>

  <section class="grid min-h-0 min-w-0 place-items-center max-lg:items-start">
    <div
      class="grid aspect-square w-[min(100%,calc(100vh-2.5rem))] max-w-[min(70vw,calc(100vh-2.5rem))] overflow-hidden rounded-[2rem] bg-linear-to-br from-stone-50/98 to-slate-100/94 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-[12px] max-lg:w-[min(100%,calc(100vh-10rem))] max-lg:max-w-none"
    >
      <div
        class="grid min-h-0 place-items-center overflow-hidden rounded-[1.5rem] border border-slate-300/75 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.92),rgba(226,232,240,0.92))] p-4"
      >
        <div class="aspect-square w-full max-w-full overflow-hidden rounded-[1.15rem] bg-white shadow-[inset_0_0_0_1px_rgba(148,163,184,0.24)]">
          <img
            src={svgPreviewUrl}
            alt="SVG export preview"
            class="block size-full object-contain"
          />
        </div>
      </div>
    </div>
  </section>
</div>
