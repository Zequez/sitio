import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { normalizePath, type UserConfig } from "vite";

import {
  createLiquidPagesPlugin,
  collectHtmlEntrypoints,
} from "./src/vite-plugins/liquid-pages-plugin";
import {
  createSveltePagesPlugin,
  collectSvelteHtmlEntrypoints,
} from "./src/vite-plugins/svelte-pages-plugin";

import { notFoundPlugin } from "./src/vite-plugins/not-found-plugin";
import { unoVirtualLinkPlugin } from "./src/vite-plugins/uno-virtual-link-plugin";
import { directoryIndexHtmlPlugin } from "./src/vite-plugins/directory-index-html-plugin";
import { virtualImagesPlugin } from "./src/vite-plugins/virtual-images-plugin";
import UnoCSS from "unocss/vite";
import generateUnoCSSConfig, { getFontsDir } from "./unocss.build.config";
import { existsSync, readFileSync } from "node:fs";
import imagesPlugin from "./src/vite-plugins/images-plugin";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";

export interface SitioBuildMetaConfigOptions {
  workDir: string;
  port: number;
  host?: string;
  buildMode?: boolean;
}

type PwaConfig = {
  name: string;
  description: string;
  theme: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function defineSitioBuildMetaConfig({
  workDir: workDir,
  port,
  host = "localhost",
  buildMode = false,
}: SitioBuildMetaConfigOptions): Promise<UserConfig> {
  const resolvedWorkDir = path.resolve(workDir);
  const libDir = path.join(resolvedWorkDir, "lib");
  const configuredPagesDir = path.join(resolvedWorkDir, "pages");
  const hasPagesDir = existsSync(configuredPagesDir);
  let pagesDir = configuredPagesDir;
  const componentsDir = path.join(resolvedWorkDir, "components");
  const dataDir = path.join(resolvedWorkDir, "data");
  const inputImagesDir = path.join(resolvedWorkDir, "images");
  const publicDir = path.join(resolvedWorkDir, "public");
  const outputImagesDir = path.join(publicDir, "images");
  const outputDir = path.join(resolvedWorkDir, "www");
  const sharedDir = path.join(__dirname, "src/shared");
  const sitioDir = __dirname;
  const workDirHash = Buffer.from(resolvedWorkDir).toString("base64");
  const rootAliases = {
    "/@lib": normalizePath(libDir),
    "/@fonts": normalizePath(getFontsDir(workDirHash)),
    "/@shared": normalizePath(sharedDir),
  };

  if (!hasPagesDir) {
    pagesDir = resolvedWorkDir;
  }

  const ignoredEntrypointDirs = hasPagesDir
    ? undefined
    : new Set([
        ".git",
        "components",
        "data",
        "dist",
        "www",
        "images",
        "lib",
        "node_modules",
        "public",
        "src",
      ]);

  const htmlEntrypoints = collectHtmlEntrypoints(
    pagesDir,
    ignoredEntrypointDirs,
  );
  const svelteEntrypoints = collectSvelteHtmlEntrypoints(
    pagesDir,
    ignoredEntrypointDirs,
  );
  const useHtmlEntrypoints = Object.keys(htmlEntrypoints).length > 0;
  const useSvelteEntrypoints = Object.keys(svelteEntrypoints).length > 0;
  const overlappingEntrypoints = Object.keys(htmlEntrypoints).filter((entryName) =>
    Object.hasOwn(svelteEntrypoints, entryName),
  );

  if (overlappingEntrypoints.length > 0) {
    throw new Error(
      `Duplicate page routes found for: ${overlappingEntrypoints.join(", ")}`,
    );
  }

  const htmlEntrypointsGetter = () => {
    return {
      ...htmlEntrypoints,
      ...svelteEntrypoints,
    };
  };

  const pagesPlugins = [];

  if (useHtmlEntrypoints) {
    pagesPlugins.push(
      ...(await createLiquidPagesPlugin(
        pagesDir,
        componentsDir,
        dataDir,
        outputImagesDir,
      )),
    );
  }

  if (useSvelteEntrypoints) {
    pagesPlugins.push(
      ...(await createSveltePagesPlugin(
        pagesDir,
        componentsDir,
        ignoredEntrypointDirs,
      )),
    );
  }

  // const liquidPagesPlugin = await createLiquidPagesPlugin(
  //   pagesDir,
  //   componentsDir,
  //   dataDir,
  //   outputImagesDir,
  // );

  const pwaConfigPath = path.join(workDir, "pwa.yml");
  const pwaConfig: PwaConfig | null = existsSync(pwaConfigPath)
    ? parse(readFileSync(pwaConfigPath, "utf8"))
    : null;

  return {
    root: pagesDir,
    clearScreen: false,
    publicDir: path.join(resolvedWorkDir, "public"),
    resolve: {
      alias: Object.entries(rootAliases).map(([key, targetPath]) => ({
        find: new RegExp(
          `^${key.replace(/[.*+?^${}()|[\]\\\\]/g, "\\$&")}(?=/|$)`,
        ),
        replacement: targetPath,
      })),
    },

    plugins: [
      // {
      //   name: "debug-resolve",
      //   enforce: "pre",
      //   async resolveId(id, importer) {
      //     console.log("RESOLVE ATTEMPT:", id, "FROM:", importer);
      //     return null;
      //   },
      // },
      // rootAliasPlugin(rootAliases),
      pagesPlugins,
      unoVirtualLinkPlugin(),
      notFoundPlugin(),
      UnoCSS(generateUnoCSSConfig(workDir, workDirHash)),
      imagesPlugin(inputImagesDir, outputImagesDir),
      virtualImagesPlugin(outputImagesDir),
      directoryIndexHtmlPlugin(),
      svelte(),
      pwaConfig
        ? VitePWA({
            registerType: "autoUpdate",
            injectRegister: "auto",
            workbox: {
              globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
            },
            includeAssets: [
              "icons/favicon.ico",
              "icons/apple-touch-icon.png",
              "icons/mask-icon.svg",
            ],
            manifest: {
              name: pwaConfig.name,
              short_name: pwaConfig.name.replace(/\s/g, ""),
              description: pwaConfig.description,
              theme_color: pwaConfig.theme,
              icons: [
                {
                  src: "icons/pwa-192x192.png",
                  sizes: "192x192",
                  type: "image/png",
                },
                {
                  src: "icons/pwa-512x512.png",
                  sizes: "512x512",
                  type: "image/png",
                },
              ],
            },
          })
        : null,
    ],
    cacheDir: path.join(__dirname, `node_modules/.vite-${workDirHash}`),
    server: {
      port,
      strictPort: true,
      host,
      fs: {
        allow: [
          normalizePath(resolvedWorkDir),
          normalizePath(componentsDir),
          normalizePath(getFontsDir(workDirHash)),
          normalizePath(sitioDir),
          // normalizePath(path.join(sitioDir, "src")),
          // normalizePath(sharedDir),
        ],
      },
    },
    build: {
      outDir: outputDir,
      rollupOptions: {
        input: htmlEntrypointsGetter(),
      },
    },
  };
}

export default defineSitioBuildMetaConfig;
