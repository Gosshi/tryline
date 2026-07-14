import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createServiceClient,
  insertMatchFixture,
  signUpTestUser,
} from "./helpers";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("iOS push notification table RLS", () => {
  let anonClient: SupabaseClient<Database>;
  let matchId: string;
  let service: SupabaseClient<Database>;
  let userId: string;

  beforeAll(async () => {
    service = createServiceClient();
    const signedUp = await signUpTestUser("ios-push-rls");
    anonClient = signedUp.client;
    userId = signedUp.user.id;
    const fixture = await insertMatchFixture();
    matchId = fixture.matchId;
  });

  afterAll(async () => {
    if (userId) {
      await service.auth.admin.deleteUser(userId);
    }
  });

  it("rejects authenticated SELECT/INSERT/UPDATE/DELETE on expo_push_tokens", async () => {
    const select = await anonClient.from("expo_push_tokens").select("*");
    const insert = await anonClient.from("expo_push_tokens").insert({
      token: "ExponentPushToken[rls-test]",
      user_id: userId,
      team_slugs: ["japan"],
    });
    const update = await anonClient
      .from("expo_push_tokens")
      .update({ notify_prematch: false })
      .eq("token", "ExponentPushToken[rls-test]");
    const deletion = await anonClient
      .from("expo_push_tokens")
      .delete()
      .eq("token", "ExponentPushToken[rls-test]");

    expect(select.error).toBeTruthy();
    expect(insert.error).toBeTruthy();
    expect(update.error).toBeTruthy();
    expect(deletion.error).toBeTruthy();
  });

  it("rejects authenticated SELECT/INSERT/UPDATE/DELETE on push_notification_log", async () => {
    const select = await anonClient.from("push_notification_log").select("*");
    const insert = await anonClient.from("push_notification_log").insert({
      match_id: matchId,
      kind: "prematch",
      sent_count: 1,
    });
    const update = await anonClient
      .from("push_notification_log")
      .update({ sent_count: 2 })
      .eq("match_id", matchId);
    const deletion = await anonClient
      .from("push_notification_log")
      .delete()
      .eq("match_id", matchId);

    expect(select.error).toBeTruthy();
    expect(insert.error).toBeTruthy();
    expect(update.error).toBeTruthy();
    expect(deletion.error).toBeTruthy();
  });
});
