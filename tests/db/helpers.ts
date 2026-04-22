import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";

import type { Database } from "@/lib/db/types";

type SupabaseStatus = {
  ANON_KEY: string;
  API_URL: string;
  SERVICE_ROLE_KEY: string;
};

let bootstrappedStatus: SupabaseStatus | undefined;

function runSupabase(args: string[]) {
  execFileSync("pnpm", ["supabase", ...args], {
    cwd: process.cwd(),
    stdio: "pipe",
    env: process.env,
  });
}

function readSupabaseStatus() {
  const raw = execFileSync("pnpm", ["supabase", "status", "-o", "json"], {
    cwd: process.cwd(),
    stdio: "pipe",
    env: process.env,
    encoding: "utf8",
  });

  const parsed = JSON.parse(raw) as Record<string, string>;
  const { ANON_KEY, API_URL, SERVICE_ROLE_KEY } = parsed;

  if (!ANON_KEY || !API_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Supabase local status is missing required keys.");
  }

  return { ANON_KEY, API_URL, SERVICE_ROLE_KEY };
}

export function ensureSupabaseTestEnvironment() {
  if (bootstrappedStatus) {
    return bootstrappedStatus;
  }

  try {
    bootstrappedStatus = readSupabaseStatus();
  } catch {
    runSupabase(["start"]);
    bootstrappedStatus = readSupabaseStatus();
  }

  runSupabase(["db", "reset", "--yes"]);

  return bootstrappedStatus;
}

export function createAnonClient() {
  const { API_URL, ANON_KEY } = ensureSupabaseTestEnvironment();

  return createClient<Database>(API_URL, ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createServiceClient() {
  const { API_URL, SERVICE_ROLE_KEY } = ensureSupabaseTestEnvironment();

  return createClient<Database>(API_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function signUpTestUser(label: string) {
  const client = createAnonClient();
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = "tryline-test-password";
  const { data, error } = await client.auth.signUp({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error("Expected signUp to return a user.");
  }

  return {
    client,
    email,
    user: data.user,
  };
}

export async function insertMatchFixture() {
  const service = createServiceClient();
  const fixtureSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const competitionSlug = `competition-${fixtureSuffix}`;
  const homeTeamSlug = `home-${fixtureSuffix}`;
  const awayTeamSlug = `away-${fixtureSuffix}`;

  const { data: competition, error: competitionError } = await service
    .from("competitions")
    .insert({
      slug: competitionSlug,
      name: `Competition ${fixtureSuffix}`,
      season: "2026",
    })
    .select("id")
    .single();

  if (competitionError) {
    throw competitionError;
  }

  const { data: teams, error: teamsError } = await service
    .from("teams")
    .insert([
      {
        slug: homeTeamSlug,
        name: `Home ${fixtureSuffix}`,
        country: "NZL",
      },
      {
        slug: awayTeamSlug,
        name: `Away ${fixtureSuffix}`,
        country: "AUS",
      },
    ])
    .select("id, slug");

  if (teamsError) {
    throw teamsError;
  }

  const homeTeam = teams.find((team) => team.slug === homeTeamSlug);
  const awayTeam = teams.find((team) => team.slug === awayTeamSlug);

  if (!homeTeam || !awayTeam) {
    throw new Error("Expected both teams to be created.");
  }

  const { data: match, error: matchError } = await service
    .from("matches")
    .insert({
      competition_id: competition.id,
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
      kickoff_at: new Date().toISOString(),
      status: "scheduled",
    })
    .select("id, updated_at")
    .single();

  if (matchError) {
    throw matchError;
  }

  return {
    competitionId: competition.id,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    matchId: match.id,
    matchUpdatedAt: match.updated_at,
    service,
  };
}
