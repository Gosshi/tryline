import { beforeAll, describe, expect, it } from "vitest";

import {
  createAnonClient,
  ensureSupabaseTestEnvironment,
  insertMatchFixture,
  signUpTestUser,
} from "./helpers";

describe("database RLS", () => {
  beforeAll(() => {
    ensureSupabaseTestEnvironment();
  });

  it("prevents anonymous users from reading match chats", async () => {
    const { matchId, service } = await insertMatchFixture();
    const { user } = await signUpTestUser("rls-owner");

    const insertResult = await service.from("match_chats").insert({
      user_id: user.id,
      match_id: matchId,
      messages: [
        { role: "user", content: "hello", at: new Date().toISOString() },
      ],
    });

    expect(insertResult.error).toBeNull();

    const anon = createAnonClient();
    const { data, error } = await anon.from("match_chats").select("*");

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("only allows a user to read their own match chats", async () => {
    const { matchId, service } = await insertMatchFixture();
    const owner = await signUpTestUser("chat-owner");
    const stranger = await signUpTestUser("chat-stranger");

    const insertResult = await service.from("match_chats").insert({
      user_id: owner.user.id,
      match_id: matchId,
      messages: [
        { role: "user", content: "owner-only", at: new Date().toISOString() },
      ],
    });

    expect(insertResult.error).toBeNull();

    const ownerRead = await owner.client
      .from("match_chats")
      .select("user_id, match_id");
    const strangerRead = await stranger.client
      .from("match_chats")
      .select("user_id, match_id");

    expect(ownerRead.error).toBeNull();
    expect(ownerRead.data).toHaveLength(1);
    expect(ownerRead.data?.[0]?.user_id).toBe(owner.user.id);

    expect(strangerRead.error).toBeNull();
    expect(strangerRead.data).toEqual([]);
  });
});
