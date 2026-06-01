import { SITE_URL } from "@/lib/site";

export const INDEXNOW_PUBLIC_KEY = "3b6f2c0a9d984e6ebd74703d7d6d8f2a";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export async function submitUrlsToIndexNow(urls: string[]): Promise<void> {
  const indexNowKey = process.env.INDEXNOW_KEY ?? "";

  if (!indexNowKey || urls.length === 0) {
    return;
  }

  if (!SITE_URL.includes("trylinerugby.com")) {
    return;
  }

  const host = new URL(SITE_URL).host;

  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      body: JSON.stringify({
        host,
        key: indexNowKey,
        keyLocation: `${SITE_URL}/${indexNowKey}.txt`,
        urlList: urls,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      console.error("[indexnow] non-ok", response.status, await response.text());
    }
  } catch (error) {
    console.error("[indexnow] submit failed", error);
  }
}
