import chalk, { type ChalkInstance } from "chalk";
import { readdir, readFile, writeFile, mkdir, copyFile } from "fs/promises";
import Handlebars from "handlebars";
import matter from "gray-matter";
import { parse } from "yaml";
import { watch } from "fs";
import { generateCSS } from "./lib/atomic-css.ts";
import { bundleComponents } from "./lib/bundle-components.ts";

import { portForName } from "./lib/portForName.ts";
import { createServer } from "./lib/server.ts";

const workDir = Bun.argv[2]!;

if (!workDir) throw "Must provide workdir";

const PORT = await portForName(workDir);

function printTitle(title: string, color: ChalkInstance) {
  const eq = title.replace(/./g, "=");
  console.log(color(eq));
  console.log(color(title));
  console.log(color(eq));
}

// ██████╗ ██╗   ██╗██╗██╗     ██████╗
// ██╔══██╗██║   ██║██║██║     ██╔══██╗
// ██████╔╝██║   ██║██║██║     ██║  ██║
// ██╔══██╗██║   ██║██║██║     ██║  ██║
// ██████╔╝╚██████╔╝██║███████╗██████╔╝
// ╚═════╝  ╚═════╝ ╚═╝╚══════╝╚═════╝

async function build() {
  await mkdir(`${workDir}/dist`, { recursive: true });
  const data = await readData();
  await buildPages(data);
  await generateCSS(workDir, `${workDir}/dist/uno.css`);

  const assets = await readdir(`${workDir}/assets`);
  for (const asset of assets) {
    await copyFile(`${workDir}/assets/${asset}`, `${workDir}/dist/${asset}`);
  }

  // await compileComponents();
  await bundleComponents(
    `${workDir}/components`,
    `${workDir}/dist/components.js`,
  );
  await buildScripts();
}

async function readData(): Promise<any> {
  const dataItems = await readdir(`${workDir}/data`);
  let data: any = {};
  for (const itemName of dataItems) {
    const item = parse(await readFile(`${workDir}/data/${itemName}`, "utf-8"));
    const itemKey = itemName.replace(".yml", "");
    data[itemKey] = item;
  }
  return data;
}

async function buildPages(data: any) {
  const pages = await readdir(`${workDir}/pages`);
  const layoutSrc = await readFile(`${workDir}/layouts/default.html`, "utf8");
  const layoutGen = Handlebars.compile(layoutSrc);

  for (const pageName of pages) {
    const pageRaw = await readFile(`${workDir}/pages/${pageName}`, "utf8");

    const { data: frontmatter, content } = matter(pageRaw);

    const pageGen = Handlebars.compile(content);
    const page = pageGen({ data });
    const html = layoutGen({ content: page, ...frontmatter, data });

    if (pageName !== "index.html") {
      const actualPageName = pageName.split(".")[0];
      await mkdir(`${workDir}/dist/${actualPageName}`, { recursive: true });
      await writeFile(`${workDir}/dist/${actualPageName}/index.html`, html);
      continue;
    } else {
      await writeFile(`${workDir}/dist/${pageName}`, html);
    }
  }
}

async function buildScripts() {
  const scripts = await readdir(`${workDir}/scripts`);

  for (const scriptName of scripts) {
    const entry = `${workDir}/scripts/${scriptName}`;
    const out = `${workDir}/dist`;

    await Bun.build({
      entrypoints: [entry],
      outdir: out,
      target: "browser",
      minify: true,
      sourcemap: "inline",
    });
  }
}

//  ██████╗██╗     ██╗
// ██╔════╝██║     ██║
// ██║     ██║     ██║
// ██║     ██║     ██║
// ╚██████╗███████╗██║
//  ╚═════╝╚══════╝╚═╝

function run() {
  printTitle(`Sitio started... http://localhost:${PORT}`, chalk.yellowBright);

  const { reloadPage } = createServer(`${workDir}/dist`, PORT);

  async function buildAndReload() {
    await build();
    reloadPage();
  }

  watch(`${workDir}/pages`, buildAndReload);
  watch(`${workDir}/layouts`, buildAndReload);
  watch(`${workDir}/components`, buildAndReload);
  watch(`${workDir}/assets`, buildAndReload);
  watch(`${workDir}/scripts`, buildAndReload);

  build();
}

run();
