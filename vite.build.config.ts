import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import * as path from "node:path";
import { Liquid } from "liquidjs";
import type { FS } from "liquidjs/dist/fs/fs";
import { normalizePath, type Plugin, type UserConfig } from "vite";
import { replaceComponents } from "./src/lib/htmlTagsToLiquidInclude.ts";

export interface SitioBuildMetaConfigOptions {
  rootDir: string;
  port: number;
  liquidData?: Record<string, unknown>;
}

interface HtmlTemplateFile {
  filePath: string;
  name: string;
}

function withHtmlExtension(filePath: string, extname: string) {
  return path.extname(filePath) ? filePath : `${filePath}${extname}`;
}

function normalizeTemplateName(name: string) {
  return name.split(path.sep).join("/");
}

function stripHtmlExtension(name: string) {
  return name.endsWith(".html") ? name.slice(0, -".html".length) : name;
}

function toTemplateLookupKey(filePath: string) {
  return stripHtmlExtension(path.basename(normalizeTemplateName(filePath)));
}

function toComponentName(relativePath: string) {
  return relativePath
    .slice(0, -path.extname(relativePath).length)
    .split(path.sep)
    .join("-");
}

async function collectHtmlFiles(
  rootDir: string,
  currentDir = rootDir,
): Promise<HtmlTemplateFile[]> {
  let entries;

  try {
    entries = await readdir(currentDir, { withFileTypes: true });
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
      htmlFiles.push(...(await collectHtmlFiles(rootDir, absolutePath)));
      continue;
    }

    if (!entry.isFile() || path.extname(entry.name) !== ".html") {
      continue;
    }

    const relativePath = path.relative(rootDir, absolutePath);

    htmlFiles.push({
      filePath: absolutePath,
      name: normalizeTemplateName(relativePath),
    });
  }

  return htmlFiles;
}

async function collectHtmlEntrypoints(pagesDir: string) {
  const pageFiles = await collectHtmlFiles(pagesDir);

  return Object.fromEntries(
    pageFiles.map(({ filePath, name }) => [
      name.slice(0, -path.extname(name).length),
      filePath,
    ]),
  );
}

async function collectComponentTemplates(componentsDir: string) {
  const componentFiles = await collectHtmlFiles(componentsDir);
  const componentNames = componentFiles.map(({ name }) =>
    toComponentName(name),
  );
  const templates: Record<string, string> = {};
  const slotRegex = /<slot\s*\/\s*>/i;

  for (const componentFile of componentFiles) {
    const componentName = toComponentName(componentFile.name);
    const source = await readFile(componentFile.filePath, "utf8");
    const processedTemplate = await replaceComponents(source, componentNames);
    const slotMatch = slotRegex.exec(processedTemplate);

    if (!slotMatch) {
      templates[`component-${componentName}`] = processedTemplate;
      continue;
    }

    templates[`component-${componentName}-start`] = processedTemplate.slice(
      0,
      slotMatch.index,
    );
    templates[`component-${componentName}-end`] = processedTemplate.slice(
      slotMatch.index + slotMatch[0].length,
    );
  }

  return {
    componentNames,
    templates,
  };
}

function createLiquidTemplateFs(
  pagesDir: string,
  componentTemplates: Record<string, string>,
): FS {
  async function fileExists(filePath: string) {
    try {
      await readFile(filePath, "utf8");
      return true;
    } catch {
      return false;
    }
  }

  function getComponentTemplate(filePath: string) {
    const normalizedPath = normalizeTemplateName(filePath);
    const templateKey = toTemplateLookupKey(filePath);

    return (
      componentTemplates[normalizedPath] ?? componentTemplates[templateKey]
    );
  }

  function isComponentTemplate(filePath: string) {
    return getComponentTemplate(filePath) !== undefined;
  }

  function isInsidePagesRoot(filePath: string) {
    const relativePath = path.relative(pagesDir, filePath);
    return (
      relativePath === "" ||
      (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
    );
  }

  return {
    sep: path.sep,
    async exists(filePath) {
      return isComponentTemplate(filePath) || (await fileExists(filePath));
    },
    existsSync(filePath) {
      return isComponentTemplate(filePath) || existsSync(filePath);
    },
    async readFile(filePath) {
      const template = getComponentTemplate(filePath);

      if (template !== undefined) {
        return template;
      }

      return readFile(filePath, "utf8");
    },
    readFileSync(filePath) {
      const template = getComponentTemplate(filePath);

      if (template !== undefined) {
        return template;
      }

      return readFileSync(filePath, "utf8");
    },
    resolve(dir, file, ext) {
      const templateName = normalizeTemplateName(withHtmlExtension(file, ext));

      if (templateName in componentTemplates) {
        return templateName;
      }

      return path.resolve(dir, withHtmlExtension(file, ext));
    },
    contains(root, file) {
      return (
        isComponentTemplate(file) ||
        isInsidePagesRoot(file) ||
        isInsidePagesRoot(path.resolve(root, file))
      );
    },
    dirname(file) {
      return path.dirname(file);
    },
  };
}

function restartOnTemplateTopologyChangePlugin(
  pagesDir: string,
  componentsDir: string,
): Plugin {
  const watchedRoots = [
    normalizePath(path.resolve(pagesDir)),
    normalizePath(path.resolve(componentsDir)),
  ];
  let restartTimer: ReturnType<typeof setTimeout> | undefined;

  function shouldRestart(filePath: string) {
    const normalizedFilePath = normalizePath(path.resolve(filePath));

    if (!normalizedFilePath.endsWith(".html")) {
      return false;
    }

    return watchedRoots.some((root) => {
      if (!normalizedFilePath.startsWith(`${root}/`)) {
        return false;
      }

      const relativePath = normalizedFilePath.slice(root.length + 1);

      return !relativePath.split("/").some((segment) => segment.startsWith("_"));
    });
  }

  return {
    name: "sitio-restart-on-template-topology-change",
    apply: "serve",
    configureServer(server) {
      const queueRestart = async (filePath: string) => {
        if (!shouldRestart(filePath)) {
          return;
        }

        if (restartTimer) {
          clearTimeout(restartTimer);
        }

        restartTimer = setTimeout(() => {
          restartTimer = undefined;
          void server.restart();
        }, 50);
      };

      server.watcher.on("add", queueRestart);
      server.watcher.on("unlink", queueRestart);

      return () => {
        server.watcher.off("add", queueRestart);
        server.watcher.off("unlink", queueRestart);
      };
    },
  };
}

function liquidPagesPlugin(
  pagesDir: string,
  componentNames: string[],
  componentTemplates: Record<string, string>,
  liquidData: Record<string, unknown>,
): Plugin {
  const liquid = new Liquid({
    root: pagesDir,
    partials: pagesDir,
    layouts: pagesDir,
    extname: ".html",
    relativeReference: true,
    fs: createLiquidTemplateFs(pagesDir, componentTemplates),
  });

  return {
    name: "sitio-liquid-pages",
    enforce: "pre",
    transformIndexHtml: {
      order: "pre",
      async handler(html, ctx) {
        if (!ctx.filename.startsWith(`${pagesDir}${path.sep}`)) {
          return html;
        }

        const processedTemplate = await replaceComponents(html, componentNames);

        return liquid.parseAndRender(processedTemplate, liquidData, {
          globals: {
            page: {
              path: path.relative(pagesDir, ctx.filename),
            },
          },
        });
      },
    },
  };
}

export async function defineSitioBuildMetaConfig({
  rootDir,
  port,
  liquidData = {},
}: SitioBuildMetaConfigOptions): Promise<UserConfig> {
  const resolvedRootDir = path.resolve(rootDir);
  const pagesDir = path.join(resolvedRootDir, "pages");
  const componentsDir = path.join(resolvedRootDir, "components");
  const input = await collectHtmlEntrypoints(pagesDir);
  const { componentNames, templates } = await collectComponentTemplates(
    componentsDir,
  );

  return {
    root: pagesDir,
    publicDir: path.join(resolvedRootDir, "public"),
    plugins: [
      restartOnTemplateTopologyChangePlugin(pagesDir, componentsDir),
      liquidPagesPlugin(pagesDir, componentNames, templates, liquidData),
    ],
    server: {
      port,
      fs: {
        allow: [resolvedRootDir],
      },
    },
    build: {
      rollupOptions: {
        input,
      },
    },
  };
}

export default defineSitioBuildMetaConfig;
