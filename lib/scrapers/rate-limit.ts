const DEFAULT_MIN_INTERVAL_MS = 3_000;

const lastRequestAtByDomain = new Map<string, number>();
const pendingByDomain = new Map<string, Promise<void>>();

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function acquireSlot(
  domain: string,
  minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
): Promise<void> {
  const previous = pendingByDomain.get(domain) ?? Promise.resolve();
  let releaseCurrent!: () => void;

  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const currentChain = previous.then(() => current);

  pendingByDomain.set(domain, currentChain);
  currentChain.finally(() => {
    if (pendingByDomain.get(domain) === currentChain) {
      pendingByDomain.delete(domain);
    }
  });

  await previous;

  try {
    const now = Date.now();
    const lastRequestAt = lastRequestAtByDomain.get(domain) ?? 0;
    const waitMs = Math.max(0, minIntervalMs - (now - lastRequestAt));

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    lastRequestAtByDomain.set(domain, Date.now());
  } finally {
    releaseCurrent();
  }
}
