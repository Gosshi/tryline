import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
});

const serverEnvSchema = publicEnvSchema.extend({
  CRON_SECRET: z.string(),
  OPENAI_API_KEY: z.string(),
  SCRAPER_USER_AGENT: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

type EnvSource = Record<string, string | undefined>;

export function getPublicEnv(rawEnv: EnvSource = process.env): PublicEnv {
  return publicEnvSchema.parse(rawEnv);
}

export function getServerEnv(rawEnv: EnvSource = process.env): ServerEnv {
  return serverEnvSchema.parse(rawEnv);
}

export function hasConfiguredValue(value: string) {
  return value.trim().length > 0;
}
