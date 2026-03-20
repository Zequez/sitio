import * as path from "node:path";
import { mkdir, readdir, rename } from "node:fs/promises";

import { type Plugin, type ResolvedConfig } from "vite";

export function directoryIndexHtmlPlugin(): Plugin {
  let config: ResolvedConfig;

  return {
    name: "directory-index-html",
    apply: "build",
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    async closeBundle() {
      const outDir = path.resolve(config.root, config.build.outDir);
      const htmlFiles = await collectHtmlFiles(outDir);

      for (const htmlFile of htmlFiles) {
        if (path.basename(htmlFile) === "index.html") {
          continue;
        }

        const relativePath = path.relative(outDir, htmlFile);
        const parsedPath = path.parse(relativePath);
        const targetDir = path.join(
          outDir,
          parsedPath.dir,
          parsedPath.name,
        );
        const targetPath = path.join(targetDir, "index.html");

        await mkdir(targetDir, { recursive: true });
        await rename(htmlFile, targetPath);
      }
    },
  };
}

async function collectHtmlFiles(
  targetDir: string,
  currentDir = targetDir,
): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const htmlFiles: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      htmlFiles.push(...(await collectHtmlFiles(targetDir, absolutePath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".html")) {
      htmlFiles.push(absolutePath);
    }
  }

  return htmlFiles;
}
