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

  function getResolvedSrc(image: ImageSet, useThumb: boolean) {
    const previewKey = useThumb ? "thumb_0" : "0";
    const fallbackKey = useThumb ? "thumb_1" : "1";

    return image[previewKey] ?? image[fallbackKey] ?? "";
  }
</script>

<img
  src={getResolvedSrc(src, thumb)}
  srcset={createSrcset(src, thumb)}
  sizes="100vw"
  class={className}
  {alt}
/>
