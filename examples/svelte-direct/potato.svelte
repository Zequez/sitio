<script lang="ts">
  import { images, imagesSizes } from "virtual:images";
  import ImgSet from "/@shared/ImgSet.svelte";
</script>

<div class="bg-blue">
  <ImgSet class="w-100" src={images["ezequiel"]!} thumb={false} />
</div>
