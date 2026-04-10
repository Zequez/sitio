<script lang="ts">
  import { TRANSPARENT_SWATCH, type DrawTool } from "./tools";

  interface Props {
    toolbarElement?: HTMLDivElement | undefined;
    isFullscreen: boolean;
    canvasWidth: number;
    canvasHeight: number;
    blockSize: number;
    palette: string[];
    selectedPaletteIndex: number;
    secondaryPaletteIndex: number;
    penSize: number;
    enablePaletteEditing: boolean;
    showGrid: boolean;
    activeTool: DrawTool;
    onCanvasWidthChange: (value: number) => void;
    onCanvasHeightChange: (value: number) => void;
    onBlockSizeChange: (value: number) => void;
    onSelectPaletteColor: (index: number) => void;
    onSelectSecondaryPaletteColor: (index: number) => void;
    onUpdatePaletteColor: (index: number, color: string) => void;
    onToggleGrid: () => void;
    onMatchScreen: () => void;
    onToggleFullscreen: () => void;
    onClear: () => void;
    onExport: () => void;
    onSelectTool: (tool: DrawTool) => void;
  }

  let {
    toolbarElement = $bindable<HTMLDivElement | undefined>(),
    isFullscreen,
    canvasWidth,
    canvasHeight,
    blockSize,
    palette,
    selectedPaletteIndex,
    secondaryPaletteIndex,
    penSize,
    enablePaletteEditing,
    showGrid,
    activeTool,
    onCanvasWidthChange,
    onCanvasHeightChange,
    onBlockSizeChange,
    onSelectPaletteColor,
    onSelectSecondaryPaletteColor,
    onUpdatePaletteColor,
    onToggleGrid,
    onMatchScreen,
    onToggleFullscreen,
    onClear,
    onExport,
    onSelectTool,
  }: Props = $props();

  function parseNumberInput(event: Event) {
    return Number.parseInt((event.currentTarget as HTMLInputElement).value, 10);
  }

  let activePaletteColor = $derived(
    (() => {
      const color =
        palette[
          Math.min(
            Math.max(selectedPaletteIndex, 0),
            Math.max(0, palette.length - 1),
          )
        ] ?? "#000000";

      return color === TRANSPARENT_SWATCH ? "#000000" : color;
    })(),
  );

  function isLightSwatch(color: string) {
    return (
      color === TRANSPARENT_SWATCH || color === "#ffffff" || color === "#eab308"
    );
  }
</script>

<div
  bind:this={toolbarElement}
  class={`flex items-center gap-2 overflow-x-auto border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-1.5 py-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur ${
    isFullscreen ? "rounded-none border-x-0 border-b-0" : "rounded-none"
  }`}
>
  <div class="flex shrink-0 items-center gap-1.5">
    <label
      class="flex h-10 items-center gap-2 rounded-[0.8rem] border border-white/10 bg-white/[0.06] px-3"
      aria-label="Canvas width"
      title="Canvas width"
    >
      <span class="i-fa-arrows-left-right text-sm text-stone-300"></span>
      <input
        type="number"
        min="64"
        max="4096"
        step="1"
        inputmode="numeric"
        class="w-20 border-0 bg-transparent text-sm text-stone-50 outline-none"
        value={canvasWidth}
        oninput={(event) => onCanvasWidthChange(parseNumberInput(event))}
      />
    </label>

    <label
      class="flex h-10 items-center gap-2 rounded-[0.8rem] border border-white/10 bg-white/[0.06] px-3"
      aria-label="Canvas height"
      title="Canvas height"
    >
      <span class="i-fa-arrows-up-down text-sm text-stone-300"></span>
      <input
        type="number"
        min="64"
        max="4096"
        step="1"
        inputmode="numeric"
        class="w-20 border-0 bg-transparent text-sm text-stone-50 outline-none"
        value={canvasHeight}
        oninput={(event) => onCanvasHeightChange(parseNumberInput(event))}
      />
    </label>

    <button
      type="button"
      aria-label="Match screen size"
      title="Match screen size"
      class="flex h-10 w-12 shrink-0 cursor-pointer items-center justify-center rounded-[0.8rem] border border-white/10 bg-white/8 text-stone-200 transition hover:bg-white/14"
      onclick={onMatchScreen}
    >
      <span class="i-fa-display text-sm"></span>
    </button>
  </div>

  <div class="flex shrink-0 items-center gap-1.5">
    <label
      class="flex h-10 items-center gap-2 rounded-[0.8rem] border border-white/10 bg-white/[0.06] px-3"
      aria-label="Block size"
      title="Block size"
    >
      <span class="i-fa-table-cells text-sm text-stone-300"></span>
      <input
        type="number"
        min="2"
        max="1024"
        step="1"
        inputmode="numeric"
        class="w-[4.5rem] border-0 bg-transparent text-sm text-stone-50 outline-none"
        value={blockSize}
        oninput={(event) => onBlockSizeChange(parseNumberInput(event))}
      />
    </label>

    <button
      type="button"
      aria-label={showGrid ? "Hide grid" : "Show grid"}
      title={showGrid ? "Hide grid" : "Show grid"}
      class={`flex h-10 w-12 shrink-0 cursor-pointer items-center justify-center rounded-[0.8rem] border transition ${
        showGrid
          ? "border-amber-300/60 bg-amber-300 text-stone-950"
          : "border-white/10 bg-white/8 text-stone-200 hover:bg-white/14"
      }`}
      onclick={onToggleGrid}
    >
      <span class="i-fa-border-all text-sm"></span>
    </button>
  </div>

  <div class="flex shrink-0 items-center gap-1.5">
    <button
      type="button"
      aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      class="flex h-10 w-12 shrink-0 cursor-pointer items-center justify-center rounded-[0.8rem] border border-white/10 bg-white/8 text-stone-200 transition hover:bg-white/14"
      onclick={onToggleFullscreen}
    >
      <span class={`${isFullscreen ? "i-fa-compress" : "i-fa-expand"} text-sm`}
      ></span>
    </button>

    <button
      type="button"
      aria-label="Clear"
      title="Clear"
      class="flex h-10 w-12 shrink-0 cursor-pointer items-center justify-center rounded-[0.8rem] border border-white/10 bg-white/8 text-stone-200 transition hover:bg-white/14"
      onclick={onClear}
    >
      <span class="i-fa-trash-can text-sm"></span>
    </button>

    <button
      type="button"
      aria-label="Export PNG"
      title="Export PNG"
      class="flex h-10 w-12 shrink-0 cursor-pointer items-center justify-center rounded-[0.8rem] bg-amber-300 text-stone-950 transition hover:brightness-105"
      onclick={onExport}
    >
      <span class="i-fa-file-arrow-down text-sm"></span>
    </button>
  </div>

  <div class="ml-auto flex shrink-0 items-center gap-2">
    <div
      class="flex h-10 items-center gap-1.5"
      aria-label="Palette"
      title="Palette"
    >
      <div class="flex items-center">
        {#each palette as color, index}
          <button
            type="button"
            aria-label={`Select primary color ${index + 1}`}
            title={color}
            class={`relative flex h-8 w-7 cursor-pointer items-center justify-center overflow-hidden border-y border-white/12 bg-transparent transition first:rounded-l-[0.7rem] first:border-l last:rounded-r-[0.7rem] last:border-r ${
              index > 0 ? "border-l-0" : ""
            } ${
              selectedPaletteIndex === index
                ? "z-1 border-amber-300/70"
                : "border-white/20"
            }`}
            onclick={() => onSelectPaletteColor(index)}
            oncontextmenu={(event) => {
              event.preventDefault();
              onSelectSecondaryPaletteColor(index);
            }}
          >
            <span
              class={`absolute inset-0 ${
                color === TRANSPARENT_SWATCH
                  ? "bg-[linear-gradient(45deg,rgba(255,255,255,0.96)_25%,rgba(229,231,235,0.96)_25%,rgba(229,231,235,0.96)_50%,rgba(255,255,255,0.96)_50%,rgba(255,255,255,0.96)_75%,rgba(229,231,235,0.96)_75%,rgba(229,231,235,0.96)_100%)] bg-[length:20px_20px]"
                  : ""
              }`}
              style={color === TRANSPARENT_SWATCH
                ? undefined
                : `background:${color};`}
            ></span>
            <span
              class={`relative z-1 i-fa-check text-[0.65rem] ${
                selectedPaletteIndex === index ? "opacity-100" : "opacity-0"
              } ${isLightSwatch(color) ? "text-stone-950" : "text-white"}`}
            ></span>
            <span
              class={`absolute bottom-0.5 right-0.5 z-1 h-2 w-2 rounded-full border ${
                isLightSwatch(color) ? "border-stone-950/45" : "border-white/50"
              } ${
                secondaryPaletteIndex === index
                  ? color === TRANSPARENT_SWATCH
                    ? "bg-[linear-gradient(45deg,rgba(255,255,255,0.96)_25%,rgba(229,231,235,0.96)_25%,rgba(229,231,235,0.96)_50%,rgba(255,255,255,0.96)_50%,rgba(255,255,255,0.96)_75%,rgba(229,231,235,0.96)_75%,rgba(229,231,235,0.96)_100%)] bg-[length:6px_6px]"
                    : isLightSwatch(color)
                      ? "bg-stone-950"
                      : "bg-white"
                  : "opacity-0"
              }`}
            ></span>
          </button>
        {/each}
      </div>

      {#if enablePaletteEditing}
        <label
          class="relative flex h-8 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[0.7rem] border border-white/15 bg-white/8"
          aria-label="Edit selected palette color"
          title="Edit selected palette color"
        >
          <span class="i-fa-droplet text-[0.8rem] text-stone-200"></span>
          <input
            type="color"
            class="absolute inset-0 cursor-pointer opacity-0"
            value={activePaletteColor}
            oninput={(event) =>
              onUpdatePaletteColor(
                selectedPaletteIndex,
                (event.currentTarget as HTMLInputElement).value,
              )}
          />
        </label>
      {/if}
    </div>

    <div class="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`Pen tool size ${penSize}`}
        title={`Pen ${penSize}x${penSize}`}
        class={`relative flex h-10 w-12 shrink-0 cursor-pointer items-center justify-center rounded-[0.8rem] border transition ${
          activeTool === "pen"
            ? "border-amber-300/60 bg-amber-300 text-stone-950"
            : "border-white/10 bg-white/8 text-stone-200 hover:bg-white/14"
        }`}
        onclick={() => onSelectTool("pen")}
      >
        <span class="i-fa-pen text-sm"></span>
        <span
          class={`absolute bottom-1 right-1 min-w-4 rounded-md px-1 text-[0.55rem] font-semibold leading-4 ${
            activeTool === "pen"
              ? "bg-stone-950/12 text-stone-950"
              : "bg-white/10 text-stone-100"
          }`}
        >
          {penSize}
        </span>
      </button>

      <button
        type="button"
        aria-label="Bucket tool"
        title="Bucket"
        class={`flex h-10 w-12 shrink-0 cursor-pointer items-center justify-center rounded-[0.8rem] border transition ${
          activeTool === "bucket"
            ? "border-amber-300/60 bg-amber-300 text-stone-950"
            : "border-white/10 bg-white/8 text-stone-200 hover:bg-white/14"
        }`}
        onclick={() => onSelectTool("bucket")}
      >
        <span class="i-fa-fill text-sm"></span>
      </button>
    </div>
  </div>
</div>
