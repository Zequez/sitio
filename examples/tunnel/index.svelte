<script lang="ts">
  import { onMount } from "svelte";
  import { tunnelTo } from "../../src/lib/tunneling.ts";
  import textContent from "./importer.ts";

  let text = $state(textContent.default);

  onMount(() => {});

  $effect(() => {
    console.log("text", text);
    // Dream code:
    tunnelTo("+tunnel.ts", "writeToDisk", text);
  });
</script>

<div class="h-screen w-full">
  <textarea
    class="w-full h-full text-5/6 p-3 block b-0 m-0 font-mono"
    bind:value={text}
  ></textarea>
</div>
