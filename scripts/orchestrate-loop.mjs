import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const ORCHESTRATE_MAX_ATTEMPTS = 4;

export async function runOrchestrateLoop({
  authorization,
  fetchImpl = fetch,
  maxAttempts = ORCHESTRATE_MAX_ATTEMPTS,
  targetUrl,
}) {
  if (!targetUrl) {
    throw new Error("ORCHESTRATE_TARGET_URL is required");
  }
  if (!authorization) {
    throw new Error("CRON_SECRET is required");
  }

  const endpoint = new URL("/api/cron/orchestrate", targetUrl).toString();
  let remaining;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchImpl(endpoint, {
      headers: { Authorization: `Bearer ${authorization}` },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Orchestrate failed with HTTP ${response.status}`);
    }

    const result = await response.json();
    if (
      !result ||
      !result.remaining ||
      !Number.isSafeInteger(result.remaining.previews) ||
      !Number.isSafeInteger(result.remaining.recaps) ||
      result.remaining.previews < 0 ||
      result.remaining.recaps < 0
    ) {
      throw new Error("Orchestrate response is missing a valid remaining count");
    }

    remaining = result.remaining;
    console.log(
      `Orchestrate attempt ${attempt}/${maxAttempts}: ` +
        `${remaining.previews} previews and ${remaining.recaps} recaps remain`,
    );
    if (remaining.previews + remaining.recaps === 0) {
      return { attempts: attempt, remaining };
    }
  }

  return { attempts: maxAttempts, remaining };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runOrchestrateLoop({
    authorization: process.env.CRON_SECRET,
    targetUrl: process.env.ORCHESTRATE_TARGET_URL,
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
