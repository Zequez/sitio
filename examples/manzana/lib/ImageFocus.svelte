<script lang="ts">
  import { onMount } from "svelte";
  import FocusedImageStage from "./FocusedImageStage.svelte";
  import {
    DEFAULT_IMAGE_FOCUS_SETTINGS,
    loadImageFocusSettings,
    saveImageFocusSettings,
    type ImageFocusSettings,
  } from "./image-focus-state";

  type ControlKey = "offsetX" | "offsetY" | "rotation" | "zoom";

  interface ControlConfig {
    key: ControlKey;
    label: string;
    max: number;
    min: number;
    sensitivity: number;
  }

  interface Props {
    onConfirm?: () => void;
  }

  const CONTROLS: ControlConfig[] = [
    {
      key: "rotation",
      label: "Rotate",
      min: -180,
      max: 180,
      sensitivity: 0.8,
    },
    {
      key: "zoom",
      label: "Zoom",
      min: 0.4,
      max: 3,
      sensitivity: 0.008,
    },
    {
      key: "offsetX",
      label: "Move X",
      min: -45,
      max: 45,
      sensitivity: 0.15,
    },
    {
      key: "offsetY",
      label: "Move Y",
      min: -45,
      max: 45,
      sensitivity: 0.15,
    },
  ];

  let { onConfirm = () => {} }: Props = $props();

  let settings = $state<ImageFocusSettings>({ ...DEFAULT_IMAGE_FOCUS_SETTINGS });
  let hasLoaded = $state(false);

  onMount(() => {
    settings = loadImageFocusSettings();
    hasLoaded = true;
  });

  $effect(() => {
    if (hasLoaded) {
      saveImageFocusSettings(settings);
    }
  });

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  function getControlValue(controlKey: ControlKey) {
    return settings[controlKey];
  }

  function setControlValue(controlKey: ControlKey, value: number) {
    const control = CONTROLS.find(({ key }) => key === controlKey);

    if (!control) {
      return;
    }

    settings = {
      ...settings,
      [controlKey]:
        controlKey === "zoom"
          ? Math.round(clamp(value, control.min, control.max) * 1000) / 1000
          : Math.round(clamp(value, control.min, control.max) * 10) / 10,
    };
  }

  function resetControl(controlKey: ControlKey) {
    setControlValue(controlKey, DEFAULT_IMAGE_FOCUS_SETTINGS[controlKey]);
  }

  function startKnobDrag(event: PointerEvent, control: ControlConfig) {
    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    const startValue = getControlValue(control.key);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = startY - moveEvent.clientY;
      const delta = deltaX + deltaY;

      setControlValue(control.key, startValue + delta * control.sensitivity);
    };

    const stopDragging = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDragging);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDragging);
  }

  function getKnobAngle(control: ControlConfig) {
    const percent =
      (getControlValue(control.key) - control.min) /
      (control.max - control.min);

    return -135 + percent * 270;
  }

  function formatControlValue(controlKey: ControlKey) {
    const value = getControlValue(controlKey);

    if (controlKey === "rotation") {
      return `${Math.round(value)}deg`;
    }

    if (controlKey === "zoom") {
      return `${value.toFixed(2)}x`;
    }

    return `${value.toFixed(1)}`;
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
        Stage 1
      </p>
      <h2 class="m-0 text-2xl">Image Focus</h2>
      <p class="m-0 text-sm leading-[1.45] text-slate-200/80">
        Adjust framing before moving on to the vector stage.
      </p>
    </div>

    <div class="grid auto-rows-min gap-3 overflow-auto pr-[0.2rem] max-lg:overflow-visible">
      {#each CONTROLS as control}
        <div
          class="grid items-center gap-3 rounded-[1.15rem] bg-slate-800/72 p-[0.7rem] [grid-template-columns:auto_1fr_auto]"
        >
          <button
            type="button"
            class="size-[4.7rem] cursor-grab touch-none rounded-full border-0 bg-transparent p-0 active:cursor-grabbing"
            aria-label={control.label}
            onpointerdown={(event) => startKnobDrag(event, control)}
          >
            <svg class="block size-full" viewBox="0 0 100 100" aria-hidden="true">
              <circle
                cx="50"
                cy="50"
                r="34"
                fill="rgba(15, 23, 42, 0.9)"
                stroke="rgba(148, 163, 184, 0.35)"
                stroke-width="2"
              />
              <path
                d="M 16 50 A 34 34 0 1 1 84 50"
                fill="none"
                stroke="rgba(148, 163, 184, 0.25)"
                stroke-width="7"
                stroke-linecap="round"
              />
              <g transform={`rotate(${getKnobAngle(control)} 50 50)`}>
                <line
                  x1="50"
                  y1="50"
                  x2="50"
                  y2="20"
                  stroke="#f8fafc"
                  stroke-width="5"
                  stroke-linecap="round"
                />
              </g>
              <circle cx="50" cy="50" r="4" fill="#f8fafc" />
            </svg>
          </button>

          <div class="grid min-w-0 gap-[0.12rem]">
            <span class="text-[0.73rem] uppercase tracking-[0.04em] text-slate-200/78">
              {control.label}
            </span>
            <strong class="text-[0.95rem] text-slate-50">
              {formatControlValue(control.key)}
            </strong>
          </div>

          <button
            type="button"
            class="cursor-pointer rounded-full border-0 bg-slate-50/14 px-[0.85rem] py-[0.45rem] text-[0.75rem] text-slate-50 hover:bg-slate-50/22"
            onclick={() => resetControl(control.key)}
          >
            Reset
          </button>
        </div>
      {/each}
    </div>

    <button
      type="button"
      class="cursor-pointer rounded-full border-0 bg-linear-to-br from-orange-500 to-amber-500 px-[1.15rem] py-[0.95rem] text-[0.95rem] font-bold text-gray-900"
      onclick={onConfirm}
    >
      Confirm Focus
    </button>
  </aside>

  <section class="grid min-h-0 min-w-0 place-items-center max-lg:items-start">
    <FocusedImageStage {settings} />
  </section>
</div>
