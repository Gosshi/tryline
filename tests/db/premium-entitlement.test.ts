import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { isProfilePremium } from "@/lib/auth/server";

import {
  createServiceClient,
  ensureSupabaseTestEnvironment,
  runLocalSqlFile,
  signUpTestUser,
} from "./helpers";

const backfillMigration = path.join(
  process.cwd(),
  "supabase/migrations/20260714084401_backfill_premium_entitlements.sql",
);
const restrictChatCounterMigration = path.join(
  process.cwd(),
  "supabase/migrations/20260715010000_restrict_chat_counter_updates.sql",
);

describe("premium entitlement database migration", () => {
  beforeAll(() => {
    ensureSupabaseTestEnvironment();
    runLocalSqlFile(restrictChatCounterMigration);
  });

  it("backfills Stripe and manual entitlements without changing premium count", async () => {
    const service = createServiceClient();
    const stripeAccount = await signUpTestUser("premium-backfill-stripe");
    const manualAccount = await signUpTestUser("premium-backfill-manual");
    const freeAccount = await signUpTestUser("premium-backfill-free");
    const stripePeriodEnd = "2027-01-01T00:00:00.000Z";

    const legacyUpdate = await service.from("user_profiles").upsert([
      {
        current_period_end: stripePeriodEnd,
        id: stripeAccount.user.id,
        premium_source: null,
        premium_until: null,
        subscription_status: "premium",
      },
      {
        current_period_end: null,
        id: manualAccount.user.id,
        premium_source: null,
        premium_until: null,
        subscription_status: "premium",
      },
      {
        current_period_end: null,
        id: freeAccount.user.id,
        premium_source: null,
        premium_until: null,
        subscription_status: "free",
      },
    ]);

    expect(legacyUpdate.error).toBeNull();

    const fixtureIds = [
      stripeAccount.user.id,
      manualAccount.user.id,
      freeAccount.user.id,
    ];
    const before = await service
      .from("user_profiles")
      .select("id", { count: "exact" })
      .in("id", fixtureIds)
      .eq("subscription_status", "premium");
    expect(before.error).toBeNull();
    expect(before.count).toBe(2);

    const appliedAt = Date.now();
    runLocalSqlFile(backfillMigration);

    const after = await service
      .from("user_profiles")
      .select("id, premium_source, premium_until, subscription_status")
      .in("id", fixtureIds);

    expect(after.error).toBeNull();
    const profiles = new Map(
      after.data?.map((profile) => [profile.id, profile]),
    );
    const stripeProfile = profiles.get(stripeAccount.user.id);
    const manualProfile = profiles.get(manualAccount.user.id);
    const freeProfile = profiles.get(freeAccount.user.id);

    expect(stripeProfile).toMatchObject({
      premium_source: "stripe",
      premium_until: stripePeriodEnd,
    });
    expect(manualProfile?.premium_source).toBe("manual");
    expect(manualProfile?.premium_until).not.toBeNull();
    expect(freeProfile).toMatchObject({
      premium_source: null,
      premium_until: null,
    });

    const manualUntil = new Date(manualProfile!.premium_until!).getTime();
    const oneYearMs = 365 * 24 * 60 * 60 * 1_000;
    expect(manualUntil - appliedAt).toBeGreaterThanOrEqual(oneYearMs - 5_000);
    expect(manualUntil - appliedAt).toBeLessThanOrEqual(
      oneYearMs + 24 * 60 * 60 * 1_000,
    );

    const premiumAfter = [stripeProfile, manualProfile, freeProfile].filter(
      (profile) => isProfilePremium(profile),
    );
    expect(premiumAfter).toHaveLength(before.count!);
  });

  it("rejects invalid premium sources", async () => {
    const service = createServiceClient();
    const account = await signUpTestUser("premium-source-check");

    const result = await service
      .from("user_profiles")
      .update({ premium_source: "invalid" })
      .eq("id", account.user.id);

    expect(result.error).not.toBeNull();
  });

  it("blocks authenticated clients from updating billing fields", async () => {
    const account = await signUpTestUser("premium-grant-blocked");
    const protectedUpdates = [
      { current_period_end: "2027-01-01T00:00:00.000Z" },
      { premium_source: "manual" },
      { premium_until: "2027-01-01T00:00:00.000Z" },
      { stripe_customer_id: "cus_forbidden" },
      { stripe_subscription_id: "sub_forbidden" },
      { subscription_status: "premium" },
    ];

    for (const update of protectedUpdates) {
      const result = await account.client
        .from("user_profiles")
        .update(update)
        .eq("id", account.user.id);

      expect(result.error, JSON.stringify(update)).not.toBeNull();
    }
  });

  it("blocks authenticated clients from deleting and reinserting their profile", async () => {
    const service = createServiceClient();
    const account = await signUpTestUser("premium-grant-insert-delete");

    const deleteResult = await account.client
      .from("user_profiles")
      .delete()
      .eq("id", account.user.id);

    expect(deleteResult.error).not.toBeNull();

    const serviceDelete = await service
      .from("user_profiles")
      .delete()
      .eq("id", account.user.id);

    expect(serviceDelete.error).toBeNull();

    const insertResult = await account.client.from("user_profiles").insert({
      id: account.user.id,
      premium_source: "manual",
      premium_until: "2027-01-01T00:00:00.000Z",
      subscription_status: "premium",
    });

    expect(insertResult.error).not.toBeNull();

    const profile = await service
      .from("user_profiles")
      .select("id")
      .eq("id", account.user.id)
      .maybeSingle();

    expect(profile.error).toBeNull();
    expect(profile.data).toBeNull();
  });

  it("keeps authenticated profile updates working without chat counter grants", async () => {
    const account = await signUpTestUser("premium-grant-allowed");

    const profileUpdate = await account.client
      .from("user_profiles")
      .update({
        display_name: "Rugby Fan",
        favorite_team_slugs: ["japan", "france"],
      })
      .eq("id", account.user.id)
      .select("display_name, favorite_team_slugs")
      .single();

    expect(profileUpdate.error).toBeNull();
    expect(profileUpdate.data).toEqual({
      display_name: "Rugby Fan",
      favorite_team_slugs: ["japan", "france"],
    });

    const protectedUpdates = [
      { chat_daily_count: 2 },
      { chat_daily_reset_date: "2026-07-14" },
    ];

    for (const update of protectedUpdates) {
      const result = await account.client
        .from("user_profiles")
        .update(update)
        .eq("id", account.user.id);

      expect(result.error, JSON.stringify(update)).not.toBeNull();
    }
  });
});
