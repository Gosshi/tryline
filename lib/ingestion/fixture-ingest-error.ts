export class FixtureIngestSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixtureIngestSafetyError";
  }
}
