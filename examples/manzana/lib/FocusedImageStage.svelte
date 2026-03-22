<script lang="ts">
  import type { Snippet } from "svelte";
  import {
    IMAGE_FOCUS_IMAGE_PATH,
    type ImageFocusSettings,
  } from "./image-focus-state";

  interface Props {
    children?: Snippet;
    imagePath?: string;
    settings: ImageFocusSettings;
  }

  let {
    children,
    imagePath = IMAGE_FOCUS_IMAGE_PATH,
    settings,
  }: Props = $props();
</script>

<div
  class="aspect-square w-[min(100%,calc(100vh-2.5rem))] max-w-[min(70vw,calc(100vh-2.5rem))] rounded-[2rem] bg-linear-to-br from-stone-50/98 to-slate-100/94 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-[12px] max-lg:w-[min(100%,calc(100vh-26rem))] max-lg:max-w-none"
>
  <div class="relative size-full overflow-hidden rounded-[1.35rem] bg-white/92">
    <svg
      class="pointer-events-none block size-full"
      viewBox="-50 -50 100 100"
      aria-label="Focused image stage"
    >
      <defs>
        <clipPath id="editor-stage-clip">
          <rect x="-50" y="-50" width="100" height="100" rx="0" ry="0" />
        </clipPath>
        <pattern
          id="editor-grid"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 10 0 L 0 0 0 10"
            fill="none"
            stroke="rgba(148, 163, 184, 0.28)"
            stroke-width="0.4"
          />
        </pattern>
      </defs>

      <rect x="-50" y="-50" width="100" height="100" fill="url(#editor-grid)" />
      <g clip-path="url(#editor-stage-clip)">
        <g
          transform={`translate(${settings.offsetX} ${settings.offsetY}) rotate(${settings.rotation}) scale(${settings.zoom})`}
        >
          <image
            href={imagePath}
            x="-50"
            y="-50"
            width="100"
            height="100"
            preserveAspectRatio="xMidYMid slice"
          />
        </g>
      </g>
      <rect
        x="-50"
        y="-50"
        width="100"
        height="100"
        fill="none"
        stroke="rgba(15, 23, 42, 0.9)"
        stroke-width="1.2"
      />
      <line
        x1="-50"
        y1="0"
        x2="50"
        y2="0"
        stroke="rgba(15, 23, 42, 0.2)"
        stroke-width="0.45"
        stroke-dasharray="2 2"
      />
      <line
        x1="0"
        y1="-50"
        x2="0"
        y2="50"
        stroke="rgba(15, 23, 42, 0.2)"
        stroke-width="0.45"
        stroke-dasharray="2 2"
      />
    </svg>

    {#if children}
      <div class="absolute inset-0">{@render children()}</div>
    {/if}
  </div>
</div>
