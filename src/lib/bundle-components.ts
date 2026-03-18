import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join, basename, dirname } from "path";
import { compile } from "svelte/compiler";

function injectOptions(source: string, tag: string) {
  const options = `<svelte:options customElement={{tag: "${tag}", shadow: "none"}} />\n`;

  if (source.includes("<svelte:options")) {
    return source; // don't duplicate
  }

  return options + source;
}

export async function bundleComponents(compDir: string, outFile: string) {
  const files = await readdir(compDir);
  const svelteFiles = files.filter((f) => f.endsWith(".svelte"));

  const TMP = "./.tmp";
  const ENTRY = join(TMP, basename(outFile));
  await mkdir(TMP, { recursive: true });
  let entryImports: string[] = [];

  let bundle = `
/* Generated Svelte custom elements bundle */
`;

  for (const file of svelteFiles) {
    const path = join(compDir, file);
    const source = await readFile(path, "utf8");

    const tag = basename(file, ".svelte").toLowerCase();
    const modified = injectOptions(source, tag);

    const compiled = compile(modified, {
      filename: file,
      generate: "client",
      customElement: true,
      css: "injected",
    });

    const outFile = join(TMP, file.replace(".svelte", ".js"));
    await writeFile(outFile, compiled.js.code);

    entryImports.push(`import "./${basename(outFile)}";`);
  }

  await writeFile(ENTRY, entryImports.join("\n"));

  await Bun.build({
    entrypoints: [ENTRY],
    outdir: dirname(outFile),
    target: "browser",
    format: "esm",
    minify: false,
  });

  console.log(`Built ${svelteFiles.length} components → ${outFile}`);
}
