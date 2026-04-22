import robotsParser from "robots-parser";

const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;

type CachedRobots = {
  fetchedAt: number;
  robot: ReturnType<typeof robotsParser> | null;
};

const robotsCache = new Map<string, CachedRobots>();

async function fetchRobots(origin: string, userAgent: string) {
  const cached = robotsCache.get(origin);

  if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS) {
    return cached.robot;
  }

  const robotsUrl = new URL("/robots.txt", origin).toString();

  try {
    const response = await fetch(robotsUrl, {
      headers: {
        "User-Agent": userAgent,
      },
    });

    if (!response.ok) {
      robotsCache.set(origin, { fetchedAt: Date.now(), robot: null });

      return null;
    }

    const body = await response.text();
    const robot = robotsParser(robotsUrl, body);

    robotsCache.set(origin, { fetchedAt: Date.now(), robot });

    return robot;
  } catch {
    robotsCache.set(origin, { fetchedAt: Date.now(), robot: null });

    return null;
  }
}

export async function isAllowed(url: string, userAgent: string): Promise<boolean> {
  const target = new URL(url);
  const robot = await fetchRobots(target.origin, userAgent);

  if (!robot) {
    return true;
  }

  return robot.isAllowed(url, userAgent) !== false;
}
