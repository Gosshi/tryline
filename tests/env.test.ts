import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { getServerEnv, hasConfiguredValue } from "../lib/env";

describe("getServerEnv", () => {
  it("accepts blank but declared runtime variables", () => {
    expect(
      getServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
        OPENAI_API_KEY: "",
        SCRAPER_USER_AGENT: "",
      }),
    ).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      OPENAI_API_KEY: "",
      SCRAPER_USER_AGENT: "",
    });
  });

  it("throws when a required variable is missing", () => {
    expect(() =>
      getServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        OPENAI_API_KEY: "",
        SCRAPER_USER_AGENT: "",
      }),
    ).toThrow(ZodError);
  });

  it("distinguishes empty placeholders from configured values", () => {
    expect(hasConfiguredValue("")).toBe(false);
    expect(hasConfiguredValue(" sk-test ")).toBe(true);
  });
});
