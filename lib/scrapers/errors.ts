export class RobotsDisallowedError extends Error {
  url: string;

  constructor(url: string) {
    super(`Robots policy disallows fetching ${url}.`);
    this.name = "RobotsDisallowedError";
    this.url = url;
  }
}

export class RateLimitedError extends Error {
  domain: string;
  retryAfter?: number;

  constructor(domain: string, retryAfter?: number) {
    super(`Rate limited for domain ${domain}.`);
    this.name = "RateLimitedError";
    this.domain = domain;
    this.retryAfter = retryAfter;
  }
}

export class FetchError extends Error {
  url: string;
  status?: number;
  attempt: number;

  constructor(params: {
    url: string;
    attempt: number;
    status?: number;
    cause?: unknown;
  }) {
    const { attempt, status, url } = params;
    const statusLabel = status ? `status ${status}` : "network error";

    super(`Failed to fetch ${url} on attempt ${attempt} (${statusLabel}).`, {
      cause: params.cause,
    });
    this.name = "FetchError";
    this.url = url;
    this.status = status;
    this.attempt = attempt;
  }
}
