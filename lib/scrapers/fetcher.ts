import { getServerEnv } from "@/lib/env";
import { FetchError, RobotsDisallowedError } from "@/lib/scrapers/errors";
import { acquireSlot } from "@/lib/scrapers/rate-limit";
import { isAllowed } from "@/lib/scrapers/robots";

export interface FetchPolicyOptions {
  minIntervalMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  skipRobotsCheck?: boolean;
  headers?: Record<string, string>;
}

const DEFAULT_MIN_INTERVAL_MS = 3_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 3;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getRetryDelayMs(response: Response, attempt: number) {
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");

    if (retryAfter) {
      const seconds = Number(retryAfter);

      if (!Number.isNaN(seconds)) {
        return seconds * 1_000;
      }

      const dateMs = Date.parse(retryAfter);

      if (!Number.isNaN(dateMs)) {
        return Math.max(0, dateMs - Date.now());
      }
    }
  }

  return 2 ** (attempt - 1) * 1_000;
}

async function runFetch(url: string, timeoutMs: number, headers: Headers) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchWithPolicy(
  url: string,
  options: FetchPolicyOptions = {},
): Promise<Response> {
  const {
    headers: extraHeaders,
    maxRetries = DEFAULT_MAX_RETRIES,
    minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
    skipRobotsCheck = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const { SCRAPER_USER_AGENT } = getServerEnv();
  const domain = new URL(url).hostname;

  if (!skipRobotsCheck) {
    const allowed = await isAllowed(url, SCRAPER_USER_AGENT);

    if (!allowed) {
      throw new RobotsDisallowedError(url);
    }
  }

  const headers = new Headers(extraHeaders);
  headers.set("User-Agent", SCRAPER_USER_AGENT);

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    await acquireSlot(domain, minIntervalMs);

    try {
      const response = await runFetch(url, timeoutMs, headers);

      if (response.ok) {
        return response;
      }

      if (response.status >= 500 || response.status === 429) {
        if (attempt > maxRetries) {
          throw new FetchError({ attempt, status: response.status, url });
        }

        const delayMs = getRetryDelayMs(response, attempt);

        console.warn(
          `Retrying ${url} after attempt ${attempt} with status ${response.status} in ${delayMs}ms.`,
        );
        await sleep(delayMs);

        continue;
      }

      throw new FetchError({ attempt, status: response.status, url });
    } catch (error) {
      if (error instanceof FetchError || error instanceof RobotsDisallowedError) {
        throw error;
      }

      if (attempt > maxRetries) {
        throw new FetchError({ attempt, cause: error, url });
      }

      const delayMs = 2 ** (attempt - 1) * 1_000;

      console.warn(`Retrying ${url} after attempt ${attempt} in ${delayMs}ms.`);
      await sleep(delayMs);
    }
  }

  throw new FetchError({ attempt: maxRetries + 1, url });
}
