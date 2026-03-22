<script lang="ts">
  import { onMount } from "svelte";
  import Export from "./Export.svelte";
  import ImageFocus from "./ImageFocus.svelte";
  import VectorsEditor from "./VectorsEditor.svelte";

  type EditorStage = "image-focus" | "vectors" | "export";

  const STORAGE_KEY = "manzana-editor-stage";
  const DEFAULT_STAGE: EditorStage = "image-focus";

  let currentStage = $state<EditorStage>(DEFAULT_STAGE);
  let hasLoaded = $state(false);

  onMount(() => {
    const storedStage = localStorage.getItem(STORAGE_KEY);

    if (
      storedStage === "image-focus" ||
      storedStage === "vectors" ||
      storedStage === "export"
    ) {
      currentStage = storedStage;
    }

    hasLoaded = true;
  });

  $effect(() => {
    if (hasLoaded) {
      localStorage.setItem(STORAGE_KEY, currentStage);
    }
  });

  function handleImageFocusConfirm() {
    currentStage = "vectors";
  }

  function handleVectorsBack() {
    currentStage = "image-focus";
  }

  function handleVectorsExport() {
    currentStage = "export";
  }

  function handleExportBack() {
    currentStage = "vectors";
  }
</script>

<div class="fixed top-0 left-0 size-full overflow-auto bg-gray-500">
  {#if currentStage === "image-focus"}
    <ImageFocus onConfirm={handleImageFocusConfirm} />
  {:else if currentStage === "vectors"}
    <VectorsEditor onBack={handleVectorsBack} onExport={handleVectorsExport} />
  {:else}
    <Export onBack={handleExportBack} />
  {/if}
</div>
