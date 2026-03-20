import { existsSync, watch, type FSWatcher } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import * as path from "node:path";

import sharp from "sharp";
import { type Plugin } from "vite";

const LOW_QUALITY = 20;
const HIGH_QUALITY = 80;

export const imagesSizes = {
  thumb_0: 32,
  thumb_1: 320,
  thumb_2: 640,
  "0": 32,
  "1": 480,
  "2": 768,
  "3": 1280,
  "4": 1920,
} as const;

export type ImageSet = {
  [sizeKey in keyof typeof imagesSizes]: string;
};

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".gif",
  ".tiff",
]);

interface SourceImageFile {
  absolutePath: string;
  relativePathWithoutExtension: string;
}

function isImageFile(filePath: string) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isLowQualitySize(sizeKey: string) {
  return sizeKey.endsWith("-0") || sizeKey.endsWith("_0");
}

function isThumbSize(sizeKey: string) {
  return sizeKey.startsWith("thumb_");
}

async function collectImageFiles(
  imagesDir: string,
  currentDir = imagesDir,
): Promise<SourceImageFile[]> {
  let entries;

  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const imageFiles: SourceImageFile[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      imageFiles.push(...(await collectImageFiles(imagesDir, absolutePath)));
      continue;
    }

    if (!entry.isFile() || !isImageFile(entry.name)) {
      continue;
    }

    const relativePath = path.relative(imagesDir, absolutePath);
    const relativePathWithoutExtension = relativePath.slice(
      0,
      -path.extname(relativePath).length,
    );

    imageFiles.push({
      absolutePath,
      relativePathWithoutExtension,
    });
  }

  return imageFiles;
}

async function collectOutputFiles(
  outputDir: string,
  currentDir = outputDir,
): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const outputFiles: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      outputFiles.push(...(await collectOutputFiles(outputDir, absolutePath)));
      continue;
    }

    if (entry.isFile()) {
      outputFiles.push(absolutePath);
    }
  }

  return outputFiles;
}

async function removeEmptyDirectories(
  directory: string,
  stopAt: string,
): Promise<void> {
  if (directory === stopAt) {
    return;
  }

  let entries;

  try {
    entries = await readdir(directory);
  } catch {
    return;
  }

  if (entries.length > 0) {
    return;
  }

  await rm(directory, { recursive: true, force: true });
  await removeEmptyDirectories(path.dirname(directory), stopAt);
}

async function processImage(
  sourceImage: SourceImageFile,
  outputDir: string,
): Promise<void> {
  const baseOutputDir = path.join(
    outputDir,
    sourceImage.relativePathWithoutExtension,
  );
  await mkdir(baseOutputDir, { recursive: true });

  for (const [sizeKey, width] of Object.entries(imagesSizes)) {
    const outputPath = path.join(baseOutputDir, `${sizeKey}.webp`);
    const image = sharp(sourceImage.absolutePath).rotate();

    if (isThumbSize(sizeKey)) {
      image.resize({
        width,
        height: width,
        fit: "cover",
        position: sharp.strategy.entropy,
      });
    } else {
      image.resize({
        width,
        withoutEnlargement: true,
      });
    }

    await image
      .webp({
        quality: isLowQualitySize(sizeKey) ? LOW_QUALITY : HIGH_QUALITY,
      })
      .toFile(outputPath);
  }
}

async function syncImages(imagesDir: string, outputDir: string): Promise<void> {
  await mkdir(path.dirname(outputDir), { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const sourceImages = await collectImageFiles(imagesDir);
  const expectedOutputs = new Set<string>();

  for (const sourceImage of sourceImages) {
    const sourceStat = await stat(sourceImage.absolutePath);
    let shouldProcess = false;

    for (const sizeKey of Object.keys(imagesSizes)) {
      const outputPath = path.join(
        outputDir,
        sourceImage.relativePathWithoutExtension,
        `${sizeKey}.webp`,
      );

      expectedOutputs.add(outputPath);

      try {
        const outputStat = await stat(outputPath);

        if (outputStat.mtimeMs < sourceStat.mtimeMs) {
          shouldProcess = true;
        }
      } catch {
        shouldProcess = true;
      }
    }

    if (shouldProcess) {
      await processImage(sourceImage, outputDir);
    }
  }

  const existingOutputs = await collectOutputFiles(outputDir);

  for (const outputFile of existingOutputs) {
    if (expectedOutputs.has(outputFile)) {
      continue;
    }

    await rm(outputFile, { force: true });
    await removeEmptyDirectories(path.dirname(outputFile), outputDir);
  }
}

export default function imagesPlugin(
  imagesDir: string,
  outputDir: string,
): Plugin {
  let syncPromise: Promise<void> = Promise.resolve();
  const imagesParentDir = path.dirname(imagesDir);

  const queueSync = () => {
    syncPromise = syncPromise
      .catch(() => {})
      .then(() => syncImages(imagesDir, outputDir));
    return syncPromise;
  };

  return {
    name: "images-plugin",
    async buildStart() {
      await queueSync();
    },
    configureServer(server) {
      let imagesWatcher: FSWatcher | undefined;
      let parentWatcher: FSWatcher | undefined;

      const closeImagesWatcher = () => {
        imagesWatcher?.close();
        imagesWatcher = undefined;
      };

      const attachImagesWatcher = () => {
        if (imagesWatcher || !existsSync(imagesDir)) {
          return;
        }

        try {
          imagesWatcher = watch(imagesDir, { recursive: true }, () => {
            void queueSync();
          });
        } catch {
          imagesWatcher = watch(imagesDir, () => {
            void queueSync();
          });
        }
      };

      const refreshImagesWatcher = () => {
        if (existsSync(imagesDir)) {
          attachImagesWatcher();
          return;
        }

        closeImagesWatcher();
      };

      void queueSync();
      refreshImagesWatcher();

      try {
        parentWatcher = watch(imagesParentDir, () => {
          refreshImagesWatcher();
          void queueSync();
        });
      } catch {
        parentWatcher = watch(imagesParentDir, () => {
          refreshImagesWatcher();
          void queueSync();
        });
      }

      server.httpServer?.once("close", () => {
        closeImagesWatcher();
        parentWatcher?.close();
      });
    },
  };
}
