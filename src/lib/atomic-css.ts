import { createGenerator } from "unocss";
import { readdir, readFile, writeFile, mkdir, copyFile } from "fs/promises";

import unoCssConfig from "../../unocss.config.ts";

const uno = await createGenerator(unoCssConfig);

async function scanFiles(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true });
  let contents: string[] = [];

  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;

    if (entry.isDirectory()) {
      contents.push(...(await scanFiles(path)));
    } else if (entry.name.endsWith(".html") || entry.name.endsWith(".svelte")) {
      contents.push(await readFile(path, "utf8"));
    }
  }

  return contents;
}

async function buildCSS(fromDir: string) {
  const files = await scanFiles(fromDir);

  const { css } = await uno.generate(files.join("\n"));

  return css;
}

export async function generateCSS(fromDir: string, toDir: string) {
  const result = await buildCSS(fromDir);
  await writeFile(toDir, result);
}
