import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { Liquid } from "liquidjs";
import { type OutputBundle, type OutputChunk } from "rollup";
import {
  normalizePath,
  type Plugin,
  type ResolvedConfig,
  type ViteDevServer,
} from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRESET_COMPONENTS_DIR = path.join(__dirname, "../components");
const SVELTE_PAGE_MAIN_PREFIX = "virtual:sitio/svelte-page-main:";
const SVELTE_PAGE_MAIN_SUFFIX = ".ts";

interface SveltePageFile {
  entryName: string;
  filePath: string;
  routePath: string;
}

const DEFAULT_IGNORED_SVELTE_DIRS = new Set([
  ".git",
  "dist",
  "node_modules",
  "public",
]);

export async function createSveltePagesPlugin(
  pagesDir: string,
  componentsDir: string,
): Promise<Plugin[]> {
  const standardLayoutPath = resolveStandardLayoutPath(componentsDir);
  const standardLayoutTemplate = readFileSync(standardLayoutPath, "utf8");
  const liquid = new Liquid();

  let config: ResolvedConfig;

  function collectPages() {
    return collectSveltePageFiles(pagesDir);
  }

  function findPageByRequestPath(requestPath: string) {
    const normalizedRequestPath = normalizeRoutePath(requestPath);

    return collectPages().find((page) => page.routePath === normalizedRequestPath);
  }

  function renderPageHtml(page: SveltePageFile) {
    return renderPageShell(
      liquid,
      standardLayoutTemplate,
      [
        '<div id="root"></div>',
        "<script type=\"module\">",
        `  import "${createPageMainId(page.filePath)}";`,
        "</script>",
      ].join("\n"),
    );
  }

  function createDevMiddleware(server: ViteDevServer) {
    return async (
      req: { originalUrl?: string; url?: string },
      res: {
        statusCode: number;
        setHeader(name: string, value: string): void;
        end(body: string): void;
      },
      next: (error?: unknown) => void,
    ) => {
      const pathname = new URL(
        req.originalUrl || req.url || "/",
        "http://localhost",
      ).pathname;

      if (pathname.startsWith("/@") || pathname.includes(".", 1)) {
        return next();
      }

      const page = findPageByRequestPath(pathname);

      if (!page) {
        return next();
      }

      try {
        const html = await server.transformIndexHtml(pathname, renderPageHtml(page));

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html");
        res.end(html);
      } catch (error) {
        next(error);
      }
    };
  }

  return [
    {
      name: "svelte-pages-virtual-main",
      enforce: "pre",
      configResolved(resolvedConfig) {
        config = resolvedConfig;
      },
      resolveId(id) {
        if (!id.startsWith(SVELTE_PAGE_MAIN_PREFIX)) {
          return null;
        }

        return id;
      },
      load(id) {
        if (!id.startsWith(SVELTE_PAGE_MAIN_PREFIX)) {
          return null;
        }

        const normalizedPageFilePath = decodePageMainId(id);

        return [
          'import { mount } from "svelte";',
          `import Page from "${normalizedPageFilePath}";`,
          "",
          'const target = document.getElementById("root");',
          "",
          "if (!target) {",
          '  throw new Error(\'Missing "#root" element for Svelte page mount.\');',
          "}",
          "",
          "mount(Page, { target });",
          "",
        ].join("\n");
      },
      configureServer(server) {
        server.middlewares.use(createDevMiddleware(server));
      },
      generateBundle(_, bundle) {
        const pages = collectPages();

        for (const page of pages) {
          const entryChunk = findEntryChunkForPage(bundle, page);

          if (!entryChunk) {
            this.error(
              `Missing generated entry chunk for Svelte page "${page.entryName}".`,
            );
          }

          const htmlFileName = `${page.entryName}.html`;
          const html = renderBuiltPageHtml(
            entryChunk,
            renderPageShell(liquid, standardLayoutTemplate, '<div id="root"></div>'),
            config,
          );

          this.emitFile({
            type: "asset",
            fileName: htmlFileName,
            source: html,
          });
        }
      },
    },
  ];
}

export function collectSvelteHtmlEntrypoints(
  pagesDir: string,
  ignoredDirectoryNames?: Set<string>,
): { [k: string]: string } {
  const pageFiles = collectSveltePageFiles(pagesDir, ignoredDirectoryNames);

  return Object.fromEntries(
    pageFiles.map(({ entryName, filePath }) => [
      entryName,
      createPageMainId(filePath),
    ]),
  );
}

function renderBuiltPageHtml(
  entryChunk: OutputChunk,
  layoutHtml: string,
  config: ResolvedConfig,
) {
  const assetBase = ensureTrailingSlash(config.base || "/");
  const cssLinks = collectEntryCssFiles(entryChunk).map((fileName) => {
    return `<link rel="stylesheet" href="${assetBase}${fileName}">`;
  });
  const scriptTag = `<script type="module" crossorigin src="${assetBase}${entryChunk.fileName}"></script>`;

  return layoutHtml.replace("</head>", `${cssLinks.join("\n")}\n</head>`).replace(
    "</body>",
    `${scriptTag}\n</body>`,
  );
}

function collectEntryCssFiles(entryChunk: OutputChunk) {
  const viteMetadata = (
    entryChunk as OutputChunk & {
      viteMetadata?: {
        importedCss?: Set<string>;
      };
    }
  ).viteMetadata;
  const importedCss = viteMetadata?.importedCss ?? new Set<string>();

  return Array.from(importedCss).sort();
}

function findEntryChunkForPage(bundle: OutputBundle, page: SveltePageFile) {
  const expectedFacadeId = normalizePath(createPageMainId(page.filePath));

  return Object.values(bundle).find((output) => {
    return (
      output.type === "chunk" &&
      output.isEntry &&
      normalizePath(output.facadeModuleId || "") === expectedFacadeId
    );
  }) as OutputChunk | undefined;
}

function collectSveltePageFiles(
  pagesDir: string,
  ignoredDirectoryNames = DEFAULT_IGNORED_SVELTE_DIRS,
  currentDir = pagesDir,
): SveltePageFile[] {
  if (!existsSync(currentDir)) {
    return [];
  }

  const entries = readdirSync(currentDir, { withFileTypes: true });
  const pageFiles: SveltePageFile[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith("_")) {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      if (ignoredDirectoryNames.has(entry.name)) {
        continue;
      }

      pageFiles.push(
        ...collectSveltePageFiles(
          pagesDir,
          ignoredDirectoryNames,
          absolutePath,
        ),
      );
      continue;
    }

    if (!entry.isFile() || path.extname(entry.name) !== ".svelte") {
      continue;
    }

    const relativePath = path.relative(pagesDir, absolutePath);
    const name = relativePath.slice(0, -path.extname(relativePath).length);
    const normalizedEntryName = name.split(path.sep).join("/");

    pageFiles.push({
      entryName: normalizedEntryName,
      filePath: absolutePath,
      routePath: entryNameToRoutePath(normalizedEntryName),
    });
  }

  return pageFiles.sort((left, right) => left.entryName.localeCompare(right.entryName));
}

function entryNameToRoutePath(entryName: string) {
  if (entryName === "index") {
    return "/";
  }

  if (entryName.endsWith("/index")) {
    return `/${entryName.slice(0, -"/index".length)}`;
  }

  return `/${entryName}`;
}

function normalizeRoutePath(routePath: string) {
  if (routePath === "/") {
    return routePath;
  }

  const withoutTrailingSlash =
    routePath.endsWith("/") && routePath !== "/" ? routePath.slice(0, -1) : routePath;

  if (withoutTrailingSlash.endsWith(".html")) {
    const withoutExtension = withoutTrailingSlash.slice(0, -".html".length);
    return withoutExtension || "/";
  }

  return withoutTrailingSlash;
}

function createPageMainId(filePath: string) {
  const encodedPath = Buffer.from(normalizePath(filePath), "utf8").toString(
    "base64url",
  );

  return `${SVELTE_PAGE_MAIN_PREFIX}${encodedPath}${SVELTE_PAGE_MAIN_SUFFIX}`;
}

function decodePageMainId(id: string) {
  const encodedPath = id
    .slice(SVELTE_PAGE_MAIN_PREFIX.length)
    .slice(0, -SVELTE_PAGE_MAIN_SUFFIX.length);

  return Buffer.from(encodedPath, "base64url").toString("utf8");
}

function renderPageShell(
  liquid: Liquid,
  standardLayoutTemplate: string,
  content: string,
) {
  return liquid.parseAndRenderSync(standardLayoutTemplate, {
    title: "",
    description: "",
    theme: "",
    class: "",
    content,
  });
}

function resolveStandardLayoutPath(componentsDir: string) {
  const projectLayoutPath = path.join(componentsDir, "StandardLayout.html");

  if (existsSync(projectLayoutPath)) {
    return projectLayoutPath;
  }

  return path.join(PRESET_COMPONENTS_DIR, "StandardLayout.html");
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
