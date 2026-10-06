import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = resolve("scripts/vercel-ignore-build.sh");
const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Tryline Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Tryline Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

describe("vercel-ignore-build", () => {
  let repository: string;
  let previousSha: string;

  function git(...args: string[]) {
    return execFileSync("git", args, {
      cwd: repository,
      encoding: "utf8",
      env: gitEnv,
    }).trim();
  }

  function commitChanges(...paths: string[]) {
    for (const path of paths) {
      const file = join(repository, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, "changed\n");
    }
    git("add", "--", ...paths);
    git("commit", "-qm", "change files");
  }

  function runIgnore(previous = previousSha, env = {}) {
    return spawnSync("/bin/sh", [script], {
      cwd: repository,
      encoding: "utf8",
      env: { ...gitEnv, VERCEL_GIT_PREVIOUS_SHA: previous, ...env },
    });
  }

  beforeEach(() => {
    repository = mkdtempSync(join(tmpdir(), "tryline-vercel-ignore-"));
    git("init", "-q", "--initial-branch=main");
    git("commit", "--allow-empty", "-qm", "initial");
    previousSha = git("rev-parse", "HEAD");
  });

  afterEach(() => {
    rmSync(repository, { recursive: true, force: true });
  });

  it.each(["docs/a.md", "specs/b.md", "docs/notes/x.png"])(
    "skips a change confined to %s",
    (path) => {
      commitChanges(path);

      const result = runIgnore();

      expect(result.status).toBe(0);
      expect(result.stdout).toBe(
        `skip: only docs/ and specs/ changed since ${previousSha}\n`,
      );
    },
  );

  it.each(["app/page.tsx", "public/videos/intro.mp4"])(
    "builds a change to %s",
    (path) => {
      commitChanges(path);

      const result = runIgnore();

      expect(result.status).toBe(1);
      expect(result.stdout).toMatch(
        /^build: changes outside docs\/ and specs\//,
      );
    },
  );

  it("builds mixed documentation and code changes", () => {
    commitChanges("docs/a.md", "lib/x.ts");

    expect(runIgnore().status).toBe(1);
  });

  it("builds code changes in an earlier commit even when HEAD is docs-only", () => {
    commitChanges("lib/x.ts");
    commitChanges("docs/a.md");

    expect(runIgnore().status).toBe(1);
  });

  it("builds when the previous deployment SHA is empty", () => {
    const result = runIgnore("");

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("build: VERCEL_GIT_PREVIOUS_SHA is empty\n");
  });

  it("builds when the previous deployment SHA is missing from local history", () => {
    const result = runIgnore("0123456789012345678901234567890123456789");

    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(
      /^build: previous deployment commit is unavailable/,
    );
  });

  it("builds when git is unavailable", () => {
    const result = runIgnore(previousSha, { PATH: "" });

    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(
      /^build: previous deployment commit is unavailable/,
    );
  });

  it("builds when git diff fails after the commit check succeeds", () => {
    const bin = join(repository, "bin");
    mkdirSync(bin);
    writeFileSync(
      join(bin, "git"),
      '#!/bin/sh\nif [ "$1" = "cat-file" ]; then exit 0; fi\nexit 128\n',
      { mode: 0o755 },
    );

    const result = runIgnore(previousSha, { PATH: bin });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("build: git diff failed (exit 128)\n");
  });
});
