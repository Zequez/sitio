import {
  existsSync,
  readFileSync,
  readdirSync,
  watch,
  type FSWatcher,
} from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { type Plugin } from "vite";
import { Liquid } from "liquidjs";
import type { FS } from "liquidjs/dist/fs/fs";
import { parse } from "yaml";

import { replaceComponents } from "../lib/htmlTagsToLiquidInclude.ts";
import { renderMarkdownWithHtmlPassthrough } from "../lib/renderMarkdownWithHtmlPassthrough.ts";
import { imagesSizes, type ImageSet } from "./images-plugin.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRESET_COMPONENTS_DIR = path.join(__dirname, "../components");

export async function createLiquidPagesPlugin(
  pagesDir: string,
  componentsDir: string,
  dataDir: string,
  imagesDir: string,
): Promise<[Plugin, Plugin]> {
  const liquid = new Liquid({
    root: pagesDir,
    partials: pagesDir,
    layouts: pagesDir,
    extname: ".html",
    relativeReference: true,
    fs: createLiquidTemplateFs(pagesDir, componentsDir),
  });

  liquid.registerFilter("markdown", (input: string) => {
    return renderMarkdownWithHtmlPassthrough(input);
  });
  liquid.registerFilter("normal_srcset", (image) => {
    return createImageSrcset(image, false);
  });
  liquid.registerFilter("thumb_srcset", (image) => {
    return createImageSrcset(image, true);
  });

  let liquidData: Record<string, unknown> = {};
  async function refreshData() {
    const nextData: Record<string, unknown> = {};

    if (existsSync(dataDir)) {
      const yamlFiles = collectYamlFiles(dataDir);

      for (const yamlFile of yamlFiles) {
        const parsedData = parse(readFileSync(yamlFile, "utf8"));
        const relativePath = path.relative(dataDir, yamlFile);
        const dataPath = relativePath.replace(/\.ya?ml$/i, "").split(path.sep);

        setNestedValue(nextData, dataPath, parsedData);
      }
    }

    nextData.images = await collectImagesFiles(imagesDir);
    nextData.imagesSizes = imagesSizes;
    liquidData = nextData;
  }

  /* For the following directory structure:
   *   /public/images/ezequiel/0.webp
   *   /public/images/ezequiel/1.webp
   *   /public/images/ezequiel/2.webp
   *   /public/images/ezequiel/thumb_0.webp
   *   /public/images/ezequiel/thumb_1.webp
   *   /public/images/many/foo/0.webp
   *   /public/images/many/foo/1.webp
   *   /public/images/many/foo/2.webp
   *   /public/images/many/foo/thumb_0.webp
   *   /public/images/many/foo/thumb_1.webp
   *   /public/images/many/bar/0.webp
   *   /public/images/many/bar/1.webp
   *   /public/images/many/bar/2.webp
   *   /public/images/many/bar/thumb_0.webp
   *   /public/images/many/bar/thumb_1.webp
   * it should generate the following object:
   * {
   *  "ezequiel": {
   *    "0": <URI encoded>,
   *    "1": "/images/ezequiel/1.webp",
   *    "2": "/images/ezequiel/2.webp",
   *    "thumb_0": <URI encoded>,
   *    "thumb_1": "/images/ezequiel/thumb_1.webp",
   *  },
   *  "many": {
   *    "foo": {
   *      "0": <URI encoded>,
   *      "1": "/images/many/foo/1.webp",
   *      "2": "/images/many/foo/2.webp",
   *      "thumb_0": <URI encoded>,
   *      "thumb_1": "/images/many/foo/thumb_1.webp",
   *    },
   *    "bar": {
   *      "0": <URI encoded>,
   *      "1": "/images/many/bar/1.webp",
   *      "2": "/images/many/bar/2.webp",
   *      "thumb_0": <URI encoded>,
   *      "thumb_1": "/images/many/bar/thumb_1.webp",
   *    },
   *  }
   * }
   */

  async function collectImagesFiles(imagesDir: string) {
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

  await refreshData();

  return [
    {
      name: "liquid-pages-plugin",
      enforce: "pre",
      transformIndexHtml: {
        order: "pre",
        async handler(html, ctx) {
          if (!ctx.filename.startsWith(`${pagesDir}${path.sep}`)) {
            return html;
          }

          const componentNames = await collectComponentsNames(componentsDir);

          const processedTemplate = await replaceComponents(
            html,
            componentNames,
          );
          return liquid.parseAndRender(processedTemplate, liquidData, {
            globals: {
              page: {
                path: path.relative(pagesDir, ctx.filename),
              },
            },
          });
        },
      },
    },
    {
      name: "liquid-pages-refresher",
      apply: "serve",
      configureServer(server) {
        let reloadTimer: ReturnType<typeof setTimeout> | undefined;

        const reloadDataAndQueueReload = async () => {
          await refreshData();
          queueReload();
        };
        const queueReload = () => {
          if (reloadTimer) {
            clearTimeout(reloadTimer);
          }

          reloadTimer = setTimeout(() => {
            reloadTimer = undefined;
            server.ws.send({
              type: "full-reload",
              path: "*",
            });
          }, 50);
        };

        const componentsWatch = waitForDirectoryAndWatch(componentsDir, () => {
          queueReload();
        });

        const dataWatch = waitForDirectoryAndWatch(dataDir, async () => {
          await reloadDataAndQueueReload();
        });

        const imagesWatch = waitForDirectoryAndWatch(imagesDir, async () => {
          await reloadDataAndQueueReload();
        });

        server.httpServer?.once("close", () => {
          if (reloadTimer) {
            clearTimeout(reloadTimer);
          }

          componentsWatch.stop();
          dataWatch.stop();
          imagesWatch.stop();
        });
      },
    },
  ];
}

interface HtmlTemplateFile {
  filePath: string;
  name: string;
}

const DEFAULT_IGNORED_HTML_DIRS = new Set([
  ".git",
  "dist",
  "node_modules",
  "public",
]);

function isImageSourcesMap(value: unknown): value is Record<string, string> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function waitForDirectoryAndWatch(
  directoryPath: string,
  onChange: () => void | Promise<void>,
) {
  let isStopped = false;
  let directoryWatcher: FSWatcher | undefined;
  let ancestorWatcher: FSWatcher | undefined;
  let watchedAncestorPath: string | undefined;

  const closeAll = () => {
    isStopped = true;
    directoryWatcher?.close();
    directoryWatcher = undefined;
    ancestorWatcher?.close();
    ancestorWatcher = undefined;
    watchedAncestorPath = undefined;
  };

  const attachDirectoryWatcher = () => {
    if (isStopped || directoryWatcher || !existsSync(directoryPath)) {
      return false;
    }

    const handleChange = () => {
      void onChange();
    };

    try {
      directoryWatcher = watch(directoryPath, { recursive: true }, () => {
        handleChange();
      });
    } catch {
      directoryWatcher = watch(directoryPath, () => {
        handleChange();
      });
    }

    return true;
  };

  const ready = (async () => {
    if (attachDirectoryWatcher()) {
      return;
    }

    await new Promise<void>((resolve) => {
      const handleAncestorChange = () => {
        if (isStopped) {
          ancestorWatcher?.close();
          ancestorWatcher = undefined;
          watchedAncestorPath = undefined;
          resolve();
          return;
        }

        if (attachDirectoryWatcher()) {
          ancestorWatcher?.close();
          ancestorWatcher = undefined;
          watchedAncestorPath = undefined;
          void onChange();
          resolve();
          return;
        }

        const nextAncestorPath = findDeepestExistingAncestor(directoryPath);

        if (!nextAncestorPath || watchedAncestorPath === nextAncestorPath) {
          return;
        }

        ancestorWatcher?.close();
        watchedAncestorPath = nextAncestorPath;

        try {
          ancestorWatcher = watch(nextAncestorPath, handleAncestorChange);
        } catch {
          ancestorWatcher = watch(nextAncestorPath, handleAncestorChange);
        }
      };

      handleAncestorChange();
    });
  })();

  return {
    ready,
    stop: closeAll,
  };
}

function findDeepestExistingAncestor(directoryPath: string) {
  let currentPath = path.resolve(directoryPath);

  while (!existsSync(currentPath)) {
    const parentPath = path.dirname(currentPath);

    if (parentPath === currentPath) {
      return undefined;
    }

    currentPath = parentPath;
  }

  return currentPath;
}

function createImageSrcset(image: ImageSet, thumb: boolean) {
  if (!isImageSourcesMap(image)) {
    return "";
  }

  return Object.entries(imagesSizes)
    .filter(([sizeKey]) =>
      thumb
        ? sizeKey.startsWith("thumb_") && !isLowQualityImageKey(sizeKey)
        : !sizeKey.startsWith("thumb_") && !isLowQualityImageKey(sizeKey),
    )
    .filter(
      ([sizeKey]) =>
        typeof image[sizeKey as keyof typeof imagesSizes] === "string",
    )
    .map(
      ([sizeKey, width]) =>
        `${image[sizeKey as keyof typeof imagesSizes]} ${width}w`,
    )
    .join(", ");
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

function collectYamlFiles(dataDir: string, currentDir = dataDir): string[] {
  let entries;

  try {
    entries = readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const yamlFiles: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith("_")) {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      yamlFiles.push(...collectYamlFiles(dataDir, absolutePath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")) {
      yamlFiles.push(absolutePath);
    }
  }

  return yamlFiles;
}

function toComponentName(relativePath: string) {
  return relativePath
    .slice(0, -path.extname(relativePath).length)
    .split(path.sep)
    .join("-");
}

function collectHtmlFiles(
  targetDir: string,
  currentDir = targetDir,
  ignoredDirectoryNames = DEFAULT_IGNORED_HTML_DIRS,
): HtmlTemplateFile[] {
  let entries;

  try {
    entries = readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const htmlFiles: HtmlTemplateFile[] = [];

  for (const entry of entries) {
    if (
      entry.name.startsWith("_") ||
      (entry.isDirectory() &&
        (entry.name.startsWith(".") ||
          ignoredDirectoryNames.has(entry.name)))
    ) {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      htmlFiles.push(
        ...collectHtmlFiles(targetDir, absolutePath, ignoredDirectoryNames),
      );
      continue;
    }

    if (!entry.isFile() || path.extname(entry.name) !== ".html") {
      continue;
    }

    const relativePath = path.relative(targetDir, absolutePath);

    htmlFiles.push({
      filePath: absolutePath,
      name: relativePath.split(path.sep).join("/"),
    });
  }

  return htmlFiles;
}

export function collectHtmlEntrypoints(
  pagesDir: string,
  ignoredDirectoryNames?: Set<string>,
) {
  const pageFiles = collectHtmlFiles(
    pagesDir,
    pagesDir,
    ignoredDirectoryNames,
  );

  return Object.fromEntries(
    pageFiles.map(({ filePath, name }) => [
      name.slice(0, -path.extname(name).length),
      filePath,
    ]),
  );
}

function collectComponentsNames(componentsDir: string) {
  const presetComponentsFiles = collectHtmlFiles(PRESET_COMPONENTS_DIR);
  const componentFiles = collectHtmlFiles(componentsDir);
  const componentNames = componentFiles.map(({ name }) =>
    toComponentName(name),
  );
  const presetComponentsNames = presetComponentsFiles.map(({ name }) =>
    toComponentName(name),
  );

  return componentNames.concat(presetComponentsNames);
}

function createLiquidTemplateFs(pagesDir: string, componentsDir: string): FS {
  function resolveFilePath(filePath: string) {
    const fileName = path.basename(filePath);
    const isComponent = fileName.startsWith("@");
    if (isComponent) {
      const normalizedFileName = isComponent ? fileName.slice(1) : fileName;
      const componentPath = path.join(componentsDir, normalizedFileName);
      const presetComponentPath = path.join(
        PRESET_COMPONENTS_DIR,
        normalizedFileName,
      );
      return existsSync(componentPath)
        ? componentPath
        : existsSync(presetComponentPath)
          ? presetComponentPath
          : undefined;
    } else {
      return existsSync(filePath) ? filePath : undefined;
    }
  }

  function readTemplateSync(filePath: string) {
    const componentNames = collectComponentsNames(componentsDir);
    return replaceComponents(readFileSync(filePath, "utf8"), componentNames);
  }

  const debug = false;
  const log = debug ? console.log : () => {};

  function noExistGuard(
    originalFilePath: string,
    resolvedFilePath: string | undefined,
  ): string {
    if (!resolvedFilePath) {
      throw new Error(
        `ENOENT: no such file or directory, open '${originalFilePath}'`,
      );
    }
    return resolvedFilePath!;
  }

  // All the file paths are absolute and on the /pages directory
  // Components are prefixed with @ and should be rewrited, with the @ removed and
  // the path pointing to the /components directory instead

  return {
    sep: path.sep,
    async exists(filePath) {
      log("exists", filePath);
      return !!resolveFilePath(filePath);
    },
    existsSync(filePath) {
      log("existsSync", filePath);
      return !!resolveFilePath(filePath);
    },
    async readFile(filePath) {
      log("readFile", filePath);
      return readTemplateSync(
        noExistGuard(filePath, resolveFilePath(filePath)),
      );
    },
    readFileSync(filePath) {
      log("readFileSync", filePath);
      return readTemplateSync(
        noExistGuard(filePath, resolveFilePath(filePath)),
      );
    },
    resolve(dir, file, ext) {
      log("resolve", dir, file, ext);
      const fullPath = path.join(dir, `${file}${ext}`);
      return resolveFilePath(fullPath) || fullPath;
    },
    contains(root, file) {
      log("contains", root, file);
      return true;
    },
    dirname(filePath) {
      const resolvedPath = resolveFilePath(filePath) || filePath;
      return path.dirname(resolvedPath);
    },
  };
}
