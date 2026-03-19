import { existsSync, readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";

import { type Plugin } from "vite";
import { Liquid } from "liquidjs";
import type { FS } from "liquidjs/dist/fs/fs";

import { replaceComponents } from "../lib/htmlTagsToLiquidInclude.ts";
import { renderMarkdownWithHtmlPassthrough } from "../lib/renderMarkdownWithHtmlPassthrough.ts";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const PRESET_COMPONENTS_DIR = path.join(__dirname, "../components");

export async function createLiquidPagesPlugin(
  pagesDir: string,
  componentsDir: string,
): Promise<
  [
    {
      [k: string]: string;
    },
    Plugin,
  ]
> {
  const input = await collectHtmlEntrypoints(pagesDir);

  const liquidData = {};

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

  return [
    input,
    {
      name: "sitio-liquid-pages",
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
  ];
}

interface HtmlTemplateFile {
  filePath: string;
  name: string;
}

function toComponentName(relativePath: string) {
  return relativePath
    .slice(0, -path.extname(relativePath).length)
    .split(path.sep)
    .join("-");
}

function collectHtmlFiles(
  rootDir: string,
  currentDir = rootDir,
): HtmlTemplateFile[] {
  let entries;

  try {
    entries = readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const htmlFiles: HtmlTemplateFile[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith("_")) {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      htmlFiles.push(...collectHtmlFiles(rootDir, absolutePath));
      continue;
    }

    if (!entry.isFile() || path.extname(entry.name) !== ".html") {
      continue;
    }

    const relativePath = path.relative(rootDir, absolutePath);

    htmlFiles.push({
      filePath: absolutePath,
      name: relativePath.split(path.sep).join("/"),
    });
  }

  return htmlFiles;
}

function collectHtmlEntrypoints(pagesDir: string) {
  const pageFiles = collectHtmlFiles(pagesDir);

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
    console.log("RESOLVING FILE PATH", filePath, isComponent);
    if (isComponent) {
      const normalizedFileName = isComponent ? fileName.slice(1) : fileName;
      const componentPath = path.join(componentsDir, normalizedFileName);
      const presetComponentPath = path.join(
        PRESET_COMPONENTS_DIR,
        normalizedFileName,
      );
      console.log("Is component!", componentPath, presetComponentPath);
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
