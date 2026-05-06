<script lang="ts">
  import { imagesSizes } from "virtual:images";

  type ImageSizeKey = keyof typeof imagesSizes;
  type ImageSet = Record<string, unknown>;

  const {
    src,
    thumb = false,
    class: className,
    alt,
  } = $props<{
    src: Record<string, unknown>;
    thumb?: boolean;
    class?: string;
    alt?: string;
  }>();

  const previewKey = thumb ? "thumb_0" : "0";
  const fallbackKey = thumb ? "thumb_1" : "1";
  const resolvedSrc = src[previewKey] ?? src[fallbackKey] ?? "";
  const resolvedSrcset = createSrcset(src, thumb);

  function createSrcset(image: ImageSet, useThumb: boolean) {
    return Object.entries(imagesSizes)
      .filter(([sizeKey]) => {
        return useThumb
          ? sizeKey.startsWith("thumb_") && !isLowQualityImageKey(sizeKey)
          : !sizeKey.startsWith("thumb_") && !isLowQualityImageKey(sizeKey);
      })
      .flatMap(([sizeKey, width]) => {
        const imageSrc = image[sizeKey as ImageSizeKey];

        if (typeof imageSrc !== "string") {
          return [];
        }

        return [`${imageSrc} ${width}w`];
      })
      .join(", ");
  }

  function isLowQualityImageKey(imageKey: string) {
    return (
      imageKey === "0" || imageKey.endsWith("_0") || imageKey.endsWith("-0")
    );
  }
</script>

<img
  src={resolvedSrc}
  srcset={resolvedSrcset}
  sizes="100vw"
  class={className}
  {alt}
/>
