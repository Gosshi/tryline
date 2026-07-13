import { describe, expect, it } from "vitest";

import {
  buildConcatFileContent,
  parseArgs,
} from "@/scripts/generate-competition-explainer-video";

describe("generate-competition-explainer-video script helpers", () => {
  it("parses family, season and optional output directory", () => {
    expect(
      parseArgs([
        "--family=nations-championship",
        "--season",
        "2026",
        "--out-dir",
        "tmp/custom-video",
      ]),
    ).toEqual({
      family: "nations-championship",
      outDir: "tmp/custom-video",
      season: "2026",
    });
  });

  it("requires family and season", () => {
    expect(() => parseArgs(["--family=nations-championship"])).toThrow(
      "Usage:",
    );
  });

  it("writes ffmpeg concat entries with repeated final slide", () => {
    expect(buildConcatFileContent(["/tmp/slide-1.png", "/tmp/slide-2.png"], 7))
      .toMatchInlineSnapshot(`
        "file '/tmp/slide-1.png'
        duration 7.00
        file '/tmp/slide-2.png'
        duration 7.00
        file '/tmp/slide-2.png'
        "
      `);
  });
});
