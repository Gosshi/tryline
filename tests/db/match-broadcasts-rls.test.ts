import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createAnonClient,
  createServiceClient,
  ensureSupabaseTestEnvironment,
  insertMatchFixture,
  runLocalSqlFile,
  signUpTestUser,
} from "./helpers";

const migration = path.join(
  process.cwd(),
  "supabase/migrations/20260715020000_create_match_broadcasts.sql",
);

describe("match_broadcasts RLS", () => {
  beforeAll(() => {
    ensureSupabaseTestEnvironment();
    runLocalSqlFile(migration);
  });

  it("allows public SELECT but blocks anon and authenticated writes", async () => {
    const anon = createAnonClient();
    const service = createServiceClient();
    const account = await signUpTestUser("match-broadcasts-rls");
    const { matchId } = await insertMatchFixture();

    const serviceInsert = await service.from("match_broadcasts").insert({
      kind: "tv",
      match_id: matchId,
      service_name: "WOWOW プライム",
      url: "https://example.com/wowow",
    });

    expect(serviceInsert.error).toBeNull();

    const anonSelect = await anon
      .from("match_broadcasts")
      .select("match_id, service_name")
      .eq("match_id", matchId);
    expect(anonSelect.error).toBeNull();
    expect(anonSelect.data).toEqual([
      { match_id: matchId, service_name: "WOWOW プライム" },
    ]);

    const anonInsert = await anon.from("match_broadcasts").insert({
      kind: "streaming",
      match_id: matchId,
      service_name: "J SPORTS オンデマンド",
      url: "https://example.com/jsports",
    });
    const authenticatedInsert = await account.client
      .from("match_broadcasts")
      .insert({
        kind: "streaming",
        match_id: matchId,
        service_name: "WOWOW オンデマンド",
        url: "https://example.com/wowow-ondemand",
      });
    const authenticatedUpdate = await account.client
      .from("match_broadcasts")
      .update({ url: "https://example.com/changed" })
      .eq("match_id", matchId);
    const authenticatedDelete = await account.client
      .from("match_broadcasts")
      .delete()
      .eq("match_id", matchId);

    expect(anonInsert.error).not.toBeNull();
    expect(authenticatedInsert.error).not.toBeNull();
    expect(authenticatedUpdate.error).not.toBeNull();
    expect(authenticatedDelete.error).not.toBeNull();
  });
});
