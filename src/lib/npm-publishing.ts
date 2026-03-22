#!/usr/bin/env bun

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

const workDir = process.cwd();
const envPath = path.join(workDir, ".env");
const token = loadDotEnv(envPath).NPM_TOKEN?.trim();

if (!token) {
  throw new Error(`NPM_TOKEN is required in ${envPath}`);
}

const npmrcDir = mkdtempSync(path.join(tmpdir(), "sitio-npm-"));
const npmrcPath = path.join(npmrcDir, ".npmrc");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

writeFileSync(
  npmrcPath,
  [
    "registry=https://registry.npmjs.org/",
    `//registry.npmjs.org/:_authToken=${token}`,
    "always-auth=true",
    "",
  ].join("\n"),
);

try {
  const child = Bun.spawn([npmCommand, "publish", "--access", "public"], {
    cwd: workDir,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      npm_config_userconfig: npmrcPath,
    },
  });

  const exitCode = await child.exited;

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
} finally {
  rmSync(npmrcDir, { recursive: true, force: true });
}

function loadDotEnv(filePath: string) {
  if (!existsSync(filePath)) {
    return {} as Record<string, string | undefined>;
  }

  const entries = {} as Record<string, string | undefined>;
  const contents = readFileSync(filePath, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    entries[key] = stripWrappingQuotes(value);
  }

  return entries;
}

function stripWrappingQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
