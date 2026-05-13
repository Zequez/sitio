import {
  existsSync,
  readFileSync,
  readdirSync,
  watch,
  type FSWatcher,
} from "node:fs";
import * as path from "node:path";
import { resiliantWatcher } from "src/lib/resiliant-watcher.ts";

import { type Plugin, type ViteDevServer } from "vite";

import { imagesSizes } from "./images-plugin.ts";

const VIRTUAL_IMAGES_ID = "virtual:images";
const RESOLVED_VIRTUAL_IMAGES_ID = "\0virtual:images";

export interface VirtualImagesData {
  images: Record<string, unknown>;
  imagesSizes: typeof imagesSizes;
}

export function virtualImagesPlugin(imagesDir: string): Plugin {
  const imagesParentDir = path.dirname(imagesDir);

  function notifyImagesChanged(server: ViteDevServer) {
    const virtualModule = server.moduleGraph.getModuleById(
      RESOLVED_VIRTUAL_IMAGES_ID,
    );

    if (virtualModule) {
      server.moduleGraph.invalidateModule(virtualModule);
    }

    server.ws.send({
      type: "full-reload",
      path: "*",
    });
  }

  return {
    name: "virtual-images",
    resolveId(id) {
      if (id !== VIRTUAL_IMAGES_ID) {
        return null;
      }

      return RESOLVED_VIRTUAL_IMAGES_ID;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_IMAGES_ID) {
        return null;
      }

      const data = collectVirtualImagesData(imagesDir);

      return [
        `export const images = ${JSON.stringify(data.images)};`,
        `export const imagesSizes = ${JSON.stringify(data.imagesSizes)};`,
      ].join("\n");
    },
    configureServer(server) {
      const watcher = resiliantWatcher(imagesDir, () => {
        notifyImagesChanged(server);
      });

      // let reloadTimer: ReturnType<typeof setTimeout> | undefined;
      // let imagesWatcher: FSWatcher | undefined;
      // let parentWatcher: FSWatcher | undefined;

      // const queueReload = () => {
      //   if (reloadTimer) {
      //     clearTimeout(reloadTimer);
      //   }

      //   reloadTimer = setTimeout(() => {
      //     reloadTimer = undefined;
      //     notifyImagesChanged(server);
      //   }, 50);
      // };

      // const closeImagesWatcher = () => {
      //   imagesWatcher?.close();
      //   imagesWatcher = undefined;
      // };

      // const attachImagesWatcher = () => {
      //   if (imagesWatcher || !existsSync(imagesDir)) {
      //     return;
      //   }

      //   try {
      //     imagesWatcher = watch(imagesDir, { recursive: true }, () => {
      //       queueReload();
      //     });
      //   } catch {
      //     imagesWatcher = watch(imagesDir, () => {
      //       queueReload();
      //     });
      //   }
      // };

      // const refreshImagesWatcher = () => {
      //   if (existsSync(imagesDir)) {
      //     attachImagesWatcher();
      //     return;
      //   }

      //   closeImagesWatcher();
      // };

      // refreshImagesWatcher();

      // try {
      //   parentWatcher = watch(imagesParentDir, () => {
      //     refreshImagesWatcher();
      //     queueReload();
      //   });
      // } catch {
      //   parentWatcher = watch(imagesParentDir, () => {
      //     refreshImagesWatcher();
      //     queueReload();
      //   });
      // }

      server.httpServer?.once("close", () => {
        // if (reloadTimer) {
        //   clearTimeout(reloadTimer);
        // }

        watcher.close();
      });
    },
  };
}

export function collectVirtualImagesData(imagesDir: string): VirtualImagesData {
  return {
    images: collectImagesFiles(imagesDir),
    imagesSizes,
  };
}

function collectImagesFiles(imagesDir: string) {
  const imageFiles = collectGeneratedImageFiles(imagesDir);
  const imageMap: Record<string, unknown> = {};

  for (const imageFile of imageFiles) {
    const relativePath = path.relative(imagesDir, imageFile);
    const imagePath = relativePath.replace(/\.webp$/i, "").split(path.sep);
    const imageKey = imagePath[imagePath.length - 1] ?? "";

    const imageValue = isLowQualityImageKey(imageKey)
      ? asDataUri(readFileSync(imageFile))
      : `/images/${relativePath.split(path.sep).join("/")}`;

    setNestedValue(imageMap, imagePath, imageValue);
  }

  return imageMap;
}

function isLowQualityImageKey(imageKey: string) {
  return imageKey === "0" || imageKey.endsWith("_0") || imageKey.endsWith("-0");
}

function asDataUri(fileBuffer: Buffer) {
  return `data:image/webp;base64,${fileBuffer.toString("base64")}`;
}

function collectGeneratedImageFiles(
  imagesDir: string,
  currentDir = imagesDir,
): string[] {
  let entries;

  try {
    entries = readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const imageFiles: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith("_") || entry.name === ".DS_Store") {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      imageFiles.push(...collectGeneratedImageFiles(imagesDir, absolutePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".webp")) {
      imageFiles.push(absolutePath);
    }
  }

  return imageFiles;
}

function setNestedValue(
  target: Record<string, unknown>,
  pathSegments: string[],
  value: unknown,
) {
  let current: Record<string, unknown> = target;

  for (const segment of pathSegments.slice(0, -1)) {
    const existingValue = current[segment];

    if (
      existingValue === null ||
      typeof existingValue !== "object" ||
      Array.isArray(existingValue)
    ) {
      current[segment] = {};
    }

    current = current[segment] as Record<string, unknown>;
  }

  const lastSegment = pathSegments[pathSegments.length - 1];

  if (lastSegment) {
    current[lastSegment] = value;
  }
}
