import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  modelsList: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({ select: mocks.select })),
  })),
}));

vi.mock("@/lib/env", () => ({
  getPublicEnv: vi.fn(() => ({
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  })),
  getServerEnv: vi.fn(() => ({ OPENAI_API_KEY: "test-key" })),
  hasConfiguredValue: vi.fn((value: string) => value.trim().length > 0),
}));

vi.mock("@/lib/llm/client", () => ({
  getOpenAIClient: vi.fn(() => ({
    chat: { completions: { create: vi.fn() } },
    models: { list: mocks.modelsList },
    responses: { create: vi.fn() },
  })),
}));

import { GET } from "@/app/api/health/route";

describe("/api/health status aggregation", () => {
  beforeEach(() => {
    mocks.modelsList.mockResolvedValue({ data: [] });
    mocks.select.mockResolvedValue({ error: null });
  });

  it("returns error and HTTP 503 when Supabase is unavailable", async () => {
    mocks.select.mockResolvedValue({ error: { code: "db_unavailable" } });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      checks: { openai: "ok", supabase: "error" },
      status: "error",
    });
  });

  it("returns degraded and HTTP 200 when OpenAI is unavailable", async () => {
    mocks.modelsList.mockRejectedValue(new Error("unavailable"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      checks: { openai: "error", supabase: "ok" },
      status: "degraded",
    });
  });

  it("returns ok and HTTP 200 when every check succeeds", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      checks: { openai: "ok", supabase: "ok" },
      status: "ok",
    });
  });
});
