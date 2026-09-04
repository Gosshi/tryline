export const SOURCE_URL_VALIDATION_TIMEOUT_MS = 5_000;

const HEAD_FALLBACK_STATUSES = new Set([405, 501]);

type FetchImplementation = typeof fetch;

export type SourceUrlValidationResult =
  | {
      ok: true;
      sourceDomain: string;
    }
  | {
      ok: false;
      reason: string;
    };

export async function validateSourceUrl(
  sourceUrl: string,
  options: {
    fetchImplementation?: FetchImplementation;
    timeoutMs?: number;
  } = {},
): Promise<SourceUrlValidationResult> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return { ok: false, reason: "出典 URL の形式が正しくありません。" };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      ok: false,
      reason: "出典 URL は http または https で指定してください。",
    };
  }

  const fetchImplementation = options.fetchImplementation ?? fetch;
  const timeoutMs = options.timeoutMs ?? SOURCE_URL_VALIDATION_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    let response = await fetchImplementation(parsedUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });

    if (HEAD_FALLBACK_STATUSES.has(response.status)) {
      response = await fetchImplementation(parsedUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
      await response.body?.cancel();
    }

    if (response.status !== 200) {
      return {
        ok: false,
        reason: `出典 URL が HTTP ${response.status} を返しました。`,
      };
    }

    return { ok: true, sourceDomain: parsedUrl.hostname };
  } catch {
    if (timedOut) {
      return {
        ok: false,
        reason: `出典 URL の確認が ${timeoutMs / 1_000} 秒でタイムアウトしました。`,
      };
    }

    return { ok: false, reason: "出典 URL に接続できませんでした。" };
  } finally {
    clearTimeout(timeout);
  }
}
