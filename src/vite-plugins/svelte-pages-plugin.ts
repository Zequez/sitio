import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { Liquid } from "liquidjs";
import { type OutputBundle, type OutputChunk } from "rollup";
import { render } from "svelte/server";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import {
  createServer,
  normalizePath,
  type Plugin,
  type ResolvedConfig,
  type ViteDevServer,
} from "vite";
import { virtualImagesPlugin } from "./virtual-images-plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRESET_COMPONENTS_DIR = path.join(__dirname, "../components");
const SVELTE_PAGE_MAIN_PREFIX = "virtual:sitio/svelte-page-main:";
const SVELTE_PAGE_MAIN_SUFFIX = ".ts";
const UNO_VIRTUAL_IMPORT_SCRIPT_PATTERN =
  /<script\s+type=(["'])module\1>\s*import\s+(["'])virtual:uno\.css\2;?\s*<\/script>/gi;

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
  outputImagesDir: string,
  ignoredDirectoryNames?: Set<string>,
): Promise<Plugin[]> {
  const standardLayoutPath = resolveStandardLayoutPath(componentsDir);
  const standardLayoutTemplate = readFileSync(standardLayoutPath, "utf8");
  const liquid = new Liquid();

  let config: ResolvedConfig;

  function collectPages() {
    return collectSveltePageFiles(pagesDir, ignoredDirectoryNames);
  }

  function findPageByRequestPath(requestPath: string) {
    const normalizedRequestPath = normalizeRoutePath(requestPath);

    return collectPages().find(
      (page) => page.routePath === normalizedRequestPath,
    );
  }

  function renderPageHtml(page: SveltePageFile) {
    return renderPageShell(
      liquid,
      standardLayoutTemplate,
      [
        '<div style="display: contents" id="root" ></div>',
        '<script type="module">',
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
        const html = await server.transformIndexHtml(
          pathname,
          renderPageHtml(page),
        );

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
          'import { hydrate, mount } from "svelte";',
          'import "virtual:uno.css";',
          `import Page from "${normalizedPageFilePath}";`,
          "",
          'const target = document.getElementById("root");',
          "",
          "if (!target) {",
          "  throw new Error('Missing \"#root\" element for Svelte page mount.');",
          "}",
          "",
          "if (target.hasChildNodes()) {",
          "  hydrate(Page, { target });",
          "} else {",
          "  mount(Page, { target });",
          "}",
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
            entryChunk!,
            bundle,
            renderPageShell(
              liquid,
              standardLayoutTemplate,
              '<div style="display: contents" id="root"></div>',
            ),
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
    {
      name: "svelte-pages-prerender",
      apply: "build",
      async writeBundle() {
        await prerenderBuiltPages(
          collectPages(),
          pagesDir,
          config,
          outputImagesDir,
        );
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
  bundle: OutputBundle,
  layoutHtml: string,
  config: ResolvedConfig,
) {
  const assetBase = ensureTrailingSlash(config.base || "/");
  const processedLayoutHtml = stripUnoVirtualImportScript(layoutHtml);
  const cssLinks = collectEntryCssFiles(entryChunk, bundle).map((fileName) => {
    return `<link rel="stylesheet" href="${assetBase}${fileName}">`;
  });
  const scriptTag = `<script type="module" crossorigin src="${assetBase}${entryChunk.fileName}"></script>`;

  return processedLayoutHtml
    .replace("</head>", `${cssLinks.join("\n")}\n</head>`)
    .replace("</body>", `${scriptTag}\n</body>`);
}

function stripUnoVirtualImportScript(html: string) {
  return html.replace(UNO_VIRTUAL_IMPORT_SCRIPT_PATTERN, "");
}

async function prerenderBuiltPages(
  pages: SveltePageFile[],
  pagesDir: string,
  config: ResolvedConfig,
  outputImagesDir: string,
) {
  if (pages.length === 0) {
    return;
  }

  const ssrServer = await createPrerenderServer(config, outputImagesDir);

  try {
    for (const page of pages) {
      const renderOutput = await renderSveltePage(ssrServer, pagesDir, page);
      const htmlFilePath = resolveBuiltHtmlFilePath(config, page);
      const existingHtml = await readFile(htmlFilePath, "utf8");
      const prerenderedHtml = injectPrerenderedMarkup(
        existingHtml,
        renderOutput,
      );

      await writeFile(htmlFilePath, prerenderedHtml);
    }
  } finally {
    await ssrServer.close();
  }
}

async function createPrerenderServer(
  config: ResolvedConfig,
  outputImagesDir: string,
) {
  return createServer({
    appType: "custom",
    clearScreen: false,
    configFile: false,
    logLevel: "error",
    mode: "production",
    root: config.root,
    publicDir: false,
    cacheDir: path.join(config.cacheDir, "svelte-pages-prerender"),
    optimizeDeps: {
      noDiscovery: true,
    },
    resolve: {
      alias: config.resolve.alias,
    },
    server: {
      middlewareMode: true,
      hmr: false,
      fs: {
        allow: config.server.fs.allow,
      },
    },
    plugins: [
      svelte({
        compilerOptions: {
          dev: false,
        },
      }),
      virtualImagesPlugin(outputImagesDir),
    ],
  });
}

async function renderSveltePage(
  ssrServer: Awaited<ReturnType<typeof createPrerenderServer>>,
  pagesDir: string,
  page: SveltePageFile,
) {
  const pageModuleId = createSsrPageModuleId(pagesDir, page.filePath);
  const pageModule = await ssrServer.ssrLoadModule(pageModuleId);
  const pageComponent = pageModule.default;

  if (!pageComponent) {
    throw new Error(
      `Missing default export while prerendering Svelte page "${page.entryName}".`,
    );
  }

  const renderedPage = await render(pageComponent);

  return {
    body: renderedPage.body,
    head: renderedPage.head,
  };
}

function resolveBuiltHtmlFilePath(
  config: ResolvedConfig,
  page: SveltePageFile,
) {
  return path.join(config.build.outDir, `${page.entryName}.html`);
}

function injectPrerenderedMarkup(
  html: string,
  renderedPage: {
    body: string;
    head: string;
  },
) {
  const htmlWithHead = renderedPage.head
    ? html.replace("</head>", `${renderedPage.head}\n</head>`)
    : html;

  return htmlWithHead.replace(
    '<div style="display: contents" id="root"></div>',
    `<div style="display: contents" id="root">${renderedPage.body}</div>`,
  );
}

function collectEntryCssFiles(entryChunk: OutputChunk, bundle: OutputBundle) {
  const visitedChunkFileNames = new Set<string>();
  const importedCssFiles = new Set<string>();

  function visitChunk(chunk: OutputChunk) {
    if (visitedChunkFileNames.has(chunk.fileName)) {
      return;
    }

    visitedChunkFileNames.add(chunk.fileName);

    for (const cssFileName of getImportedCssFiles(chunk)) {
      importedCssFiles.add(cssFileName);
    }

    for (const importedChunkFileName of chunk.imports) {
      const importedChunk = bundle[importedChunkFileName];

      if (importedChunk?.type === "chunk") {
        visitChunk(importedChunk);
      }
    }
  }

  visitChunk(entryChunk);

  return Array.from(importedCssFiles).sort();
}

function getImportedCssFiles(chunk: OutputChunk) {
  const viteMetadata = (
    chunk as OutputChunk & {
      viteMetadata?: {
        importedCss?: Set<string>;
      };
    }
  ).viteMetadata;

  return viteMetadata?.importedCss ?? new Set<string>();
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

  return pageFiles.sort((left, right) =>
    left.entryName.localeCompare(right.entryName),
  );
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
    routePath.endsWith("/") && routePath !== "/"
      ? routePath.slice(0, -1)
      : routePath;

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

function createSsrPageModuleId(pagesDir: string, filePath: string) {
  const relativePath = path.relative(pagesDir, filePath);

  return `/${relativePath.split(path.sep).join("/")}`;
}

function renderPageShell(
  liquid: Liquid,
  standardLayoutTemplate: string,
  content: string,
) {
  return stripUnoVirtualImportScript(
    liquid.parseAndRenderSync(standardLayoutTemplate, {
      title: "",
      description: "",
      theme: "",
      class: "",
      content,
    }),
  );
}

const LAYOUT = "SvelteLayout.html";

function resolveStandardLayoutPath(componentsDir: string) {
  const projectLayoutPath = path.join(componentsDir, LAYOUT);

  if (existsSync(projectLayoutPath)) {
    return projectLayoutPath;
  }

  return path.join(PRESET_COMPONENTS_DIR, LAYOUT);
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
