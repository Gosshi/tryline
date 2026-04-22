import { beforeAll, describe, expect, it } from "vitest";

import {
  ensureSupabaseTestEnvironment,
  insertMatchFixture,
  signUpTestUser,
} from "./helpers";

describe("database triggers", () => {
  beforeAll(() => {
    ensureSupabaseTestEnvironment();
  });

  it("creates a public user profile when auth.users receives a new row", async () => {
    const { service } = await insertMatchFixture();
    const { user } = await signUpTestUser("trigger-user");

    const { data, error } = await service
      .from("users")
      .select("id, email, plan")
      .eq("id", user.id)
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      id: user.id,
      email: user.email,
      plan: "free",
    });
  });

  it("updates updated_at automatically for matches and users", async () => {
    const { matchId, matchUpdatedAt, service } = await insertMatchFixture();
    const account = await signUpTestUser("updated-at");

    const userBefore = await service
      .from("users")
      .select("updated_at")
      .eq("id", account.user.id)
      .single();
    expect(userBefore.error).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 1_100));

    const matchUpdate = await service
      .from("matches")
      .update({ venue: "Tokyo Stadium" })
      .eq("id", matchId)
      .select("updated_at")
      .single();

    const userUpdate = await account.client
      .from("users")
      .update({ display_name: "Updated Name" })
      .eq("id", account.user.id)
      .select("updated_at")
      .single();

    expect(matchUpdate.error).toBeNull();
    expect(userUpdate.error).toBeNull();
    expect(new Date(matchUpdate.data!.updated_at).getTime()).toBeGreaterThan(
      new Date(matchUpdatedAt).getTime(),
    );
    expect(new Date(userUpdate.data!.updated_at).getTime()).toBeGreaterThan(
      new Date(userBefore.data!.updated_at).getTime(),
    );
  });
});
