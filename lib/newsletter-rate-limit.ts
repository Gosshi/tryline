const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;

const requestsByIp = new Map<string, number[]>();

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function isNewsletterSubscribeRateLimited(
  request: Request,
  now = Date.now(),
): boolean {
  const clientIp = getClientIp(request);
  const recentRequests = (requestsByIp.get(clientIp) ?? []).filter(
    (timestamp) => timestamp > now - WINDOW_MS,
  );

  if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    requestsByIp.set(clientIp, recentRequests);

    return true;
  }

  recentRequests.push(now);
  requestsByIp.set(clientIp, recentRequests);

  return false;
}
