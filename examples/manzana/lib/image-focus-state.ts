export interface ImageFocusSettings {
  offsetX: number;
  offsetY: number;
  rotation: number;
  zoom: number;
}

export const IMAGE_FOCUS_STORAGE_KEY = "manzana-image-focus-settings";
export const IMAGE_FOCUS_IMAGE_PATH = "/images/mz/3.webp";
export const DEFAULT_IMAGE_FOCUS_SETTINGS: ImageFocusSettings = {
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  zoom: 1,
};

export function loadImageFocusSettings() {
  const storedValue = localStorage.getItem(IMAGE_FOCUS_STORAGE_KEY);

  if (!storedValue) {
    return { ...DEFAULT_IMAGE_FOCUS_SETTINGS };
  }

  try {
    const parsedValue = JSON.parse(storedValue) as Partial<ImageFocusSettings>;

    return {
      ...DEFAULT_IMAGE_FOCUS_SETTINGS,
      ...parsedValue,
    };
  } catch {
    return { ...DEFAULT_IMAGE_FOCUS_SETTINGS };
  }
}

export function saveImageFocusSettings(settings: ImageFocusSettings) {
  localStorage.setItem(IMAGE_FOCUS_STORAGE_KEY, JSON.stringify(settings));
}
