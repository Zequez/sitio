import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline/promises";
import bestzip from "bestzip";

interface PublishToNetlifyOptions {
  outputDir: string;
  workDir: string;
}

interface NetlifySite {
  admin_url?: unknown;
  deploy_url?: unknown;
  id?: unknown;
  ssl_url?: unknown;
  url?: unknown;
}

export interface NetlifyPublishResult {
  siteId: string;
  siteUrl: string;
  adminUrl: string;
}

export async function publishToNetlify({
  outputDir,
  workDir,
}: PublishToNetlifyOptions): Promise<NetlifyPublishResult> {
  const envPath = path.join(workDir, ".env");
  const storedEnv = loadDotEnv(workDir);
  const authToken = await ensureStoredNetlifyAuthToken(
    workDir,
    storedEnv.NETLIFY_AUTH_TOKEN,
  );
  const accountId = await ensureStoredNetlifyAccountId(
    workDir,
    authToken,
    storedEnv.NETLIFY_ACCOUNT_ID,
  );
  let siteId = storedEnv.NETLIFY_SITE_ID;

  if (!siteId) {
    siteId = await createNetlifySiteAndDeploy(
      authToken,
      accountId,
      outputDir,
      workDir,
    );
    upsertEnvValue(workDir, "NETLIFY_SITE_ID", siteId);
  } else {
    await deployNetlifySite(authToken, outputDir, siteId);
  }

  const site = await fetchNetlifySite(authToken, siteId);

  return {
    siteId,
    siteUrl: getNetlifySiteUrl(site),
    adminUrl: site.admin_url as string,
  };
}

function loadDotEnv(workDir: string) {
  const envPath = path.join(workDir, ".env");
  const envEntries = {} as Record<string, string | undefined>;

  if (!existsSync(envPath)) {
    return envEntries;
  }

  const envContents = readFileSync(envPath, "utf8");

  for (const line of envContents.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    envEntries[key] = stripWrappingQuotes(rawValue);
  }

  return envEntries;
}

async function ensureStoredNetlifyAuthToken(
  workDir: string,
  storedAuthToken?: string,
) {
  if (storedAuthToken) {
    return storedAuthToken;
  }

  const envPath = path.join(workDir, ".env");
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const authToken = (await prompt.question(
      `Enter NETLIFY_AUTH_TOKEN to store in ${envPath}: `,
    )).trim();

    if (!authToken) {
      throw new Error("NETLIFY_AUTH_TOKEN is required");
    }

    upsertEnvValue(workDir, "NETLIFY_AUTH_TOKEN", authToken);
    return authToken;
  } finally {
    prompt.close();
  }
}

async function ensureStoredNetlifyAccountId(
  workDir: string,
  authToken: string,
  storedAccountId?: string,
) {
  if (storedAccountId) {
    return storedAccountId;
  }

  const accounts = await fetchNetlifyAccounts(authToken);

  if (accounts.length === 0) {
    throw new Error("No Netlify accounts were returned for this auth token");
  }

  const accountId = accounts[0]?.id;

  if (typeof accountId !== "string" || accountId.length === 0) {
    throw new Error("Netlify account lookup did not return a valid account id");
  }

  upsertEnvValue(workDir, "NETLIFY_ACCOUNT_ID", accountId);
  return accountId;
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

function toNetlifySiteName(input: string) {
  const normalizedName = input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);

  return normalizedName || "sitio-site";
}

async function createNetlifySiteAndDeploy(
  authToken: string,
  accountId: string,
  outputDir: string,
  workDir: string,
) {
  const zipPath = await createDeploymentZip(outputDir);

  try {
    const preferredName = toNetlifySiteName(path.basename(workDir));
    const preferredResponse = await requestNetlifyCreateAndDeploy(
      authToken,
      accountId,
      zipPath,
      preferredName,
    );

    if (preferredResponse.ok) {
      return finalizeNetlifyCreateAndDeploy(authToken, preferredResponse);
    }

    const fallbackResponse = await requestNetlifyCreateAndDeploy(
      authToken,
      accountId,
      zipPath,
    );

    if (fallbackResponse.ok) {
      return finalizeNetlifyCreateAndDeploy(authToken, fallbackResponse);
    }

    const errorText = await fallbackResponse.text();
    throw new Error(
      `Failed to create and deploy Netlify site (${fallbackResponse.status}): ${errorText}`,
    );
  } finally {
    rmSync(zipPath, { force: true });
  }
}

async function finalizeNetlifyCreateAndDeploy(
  authToken: string,
  response: Response,
) {
  const payload = (await response.json()) as {
    id?: unknown;
    site_id?: unknown;
    deploy_id?: unknown;
    published_deploy?: { id?: unknown } | null;
  };

  const siteId =
    typeof payload.site_id === "string" && payload.site_id.length > 0
      ? payload.site_id
      : typeof payload.id === "string" && payload.id.length > 0
        ? payload.id
        : undefined;

  if (!siteId) {
    throw new Error(
      "Netlify create+deploy succeeded but no site id was returned",
    );
  }

  const deployId =
    typeof payload.deploy_id === "string" && payload.deploy_id.length > 0
      ? payload.deploy_id
      : payload.published_deploy &&
          typeof payload.published_deploy.id === "string" &&
          payload.published_deploy.id.length > 0
        ? payload.published_deploy.id
        : undefined;

  if (deployId) {
    await waitForNetlifyDeployReady(authToken, deployId);
  }

  return siteId;
}

async function createDeploymentZip(outputDir: string) {
  const zipPath = path.join(
    tmpdir(),
    `sitio-netlify-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`,
  );
  await bestzip({
    cwd: outputDir,
    destination: zipPath,
    source: "*",
  });

  return zipPath;
}

function requestNetlifyCreateAndDeploy(
  authToken: string,
  accountId: string,
  zipPath: string,
  siteName?: string,
) {
  const url = new URL(
    `https://api.netlify.com/api/v1/${encodeURIComponent(accountId)}/sites`,
  );

  if (siteName) {
    url.searchParams.set("name", siteName);
  }

  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/zip",
      "User-Agent": "sitio-cli",
    },
    body: Bun.file(zipPath),
  });
}

async function deployNetlifySite(
  authToken: string,
  outputDir: string,
  siteId: string,
) {
  const zipPath = await createDeploymentZip(outputDir);

  try {
    const response = await fetch(
      `https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}/deploys`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/zip",
          "User-Agent": "sitio-cli",
        },
        body: Bun.file(zipPath),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to deploy Netlify site (${response.status}): ${errorText}`,
      );
    }

    const payload = (await response.json()) as { id?: unknown };

    if (typeof payload.id === "string" && payload.id.length > 0) {
      await waitForNetlifyDeployReady(authToken, payload.id);
    }
  } finally {
    rmSync(zipPath, { force: true });
  }
}

async function waitForNetlifyDeployReady(authToken: string, deployId: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(
      `https://api.netlify.com/api/v1/deploys/${encodeURIComponent(deployId)}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "User-Agent": "sitio-cli",
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Netlify deploy verification failed (${response.status}): ${errorText}`,
      );
    }

    const deploy = (await response.json()) as {
      error_message?: unknown;
      state?: unknown;
    };

    if (deploy.state === "ready") {
      return;
    }

    if (deploy.state === "error") {
      const errorMessage =
        typeof deploy.error_message === "string" ? deploy.error_message : "";
      throw new Error(
        `Netlify deploy failed${errorMessage ? `: ${errorMessage}` : ""}`,
      );
    }

    await Bun.sleep(1000);
  }

  throw new Error("Netlify deploy did not reach ready state within 20 seconds");
}

async function fetchNetlifySite(authToken: string, siteId: string) {
  const response = await fetch(
    `https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}`,
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
        "User-Agent": "sitio-cli",
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch Netlify site (${response.status}): ${errorText}`,
    );
  }

  return (await response.json()) as NetlifySite;
}

async function fetchNetlifyAccounts(authToken: string) {
  const response = await fetch("https://api.netlify.com/api/v1/accounts", {
    headers: {
      Authorization: `Bearer ${authToken}`,
      "User-Agent": "sitio-cli",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch Netlify accounts (${response.status}): ${errorText}`,
    );
  }

  return (await response.json()) as Array<{
    id?: unknown;
    name?: unknown;
    slug?: unknown;
  }>;
}

function getNetlifySiteUrl(site: NetlifySite) {
  const siteUrlCandidates = [site.ssl_url, site.url, site.deploy_url];

  for (const candidate of siteUrlCandidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  throw new Error("Netlify site published but no public URL was returned");
}

function upsertEnvValue(workDir: string, key: string, value: string) {
  const envPath = path.join(workDir, ".env");
  const envContents = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const envLines = envContents.length > 0 ? envContents.split(/\r?\n/) : [];
  const keyPrefix = `${key}=`;
  const nextLine = `${key}=${value}`;
  let replaced = false;

  const nextLines = envLines.map((line) => {
    if (!line.trim().startsWith(keyPrefix)) {
      return line;
    }

    replaced = true;
    return nextLine;
  });

  if (!replaced) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") {
      nextLines.push("");
    }

    nextLines.push(nextLine);
  }

  writeFileSync(envPath, `${nextLines.join("\n").replace(/\n*$/, "")}\n`);
}
