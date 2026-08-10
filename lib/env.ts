import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
});

const serverEnvSchema = publicEnvSchema.extend({
  CRON_SECRET: z.string(),
  DISCORD_WEBHOOK_EN: z.string().url().optional(),
  DISCORD_WEBHOOK_JA: z.string().url().optional(),
  DISCORD_WEBHOOK_OPS: z.string().url().optional(),
  DISCORD_WEBHOOK_WEEKLY_DIGEST: z.string().url().optional(),
  OPENAI_API_KEY: z.string(),
  RESEND_API_KEY: z.string().min(1).optional(),
  REVENUECAT_SECRET_API_KEY: z.string().optional(),
  REVENUECAT_WEBHOOK_SECRET: z.string().optional(),
  SCRAPER_USER_AGENT: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  VAPID_PRIVATE_KEY: z.string(),
  VAPID_PUBLIC_KEY: z.string(),
  VAPID_SUBJECT: z.string(),
  WIKIPEDIA_SQUAD_URL: z.string().url(),
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
