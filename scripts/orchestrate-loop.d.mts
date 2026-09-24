export const ORCHESTRATE_MAX_ATTEMPTS: number;

export function runOrchestrateLoop(params: {
  authorization: string | undefined;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  targetUrl: string | undefined;
}): Promise<{
  attempts: number;
  remaining: { previews: number; recaps: number };
}>;
