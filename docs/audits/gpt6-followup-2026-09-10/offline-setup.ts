// No repository .env loading (see vitest.config.ts) and no real fetches.
// Individual tests replace this function with their explicit mocks.
globalThis.fetch = async () => {
  throw new Error("External fetch is disabled for this offline review");
};
