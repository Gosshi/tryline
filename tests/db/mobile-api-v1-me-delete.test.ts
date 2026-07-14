import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { DELETE } from "@/app/api/v1/me/route";
import {
  createServiceClient,
  ensureSupabaseTestEnvironment,
  signUpTestUser,
} from "@/tests/db/helpers";

let createdUserId: string | null = null;

describe("DELETE /api/v1/me integration", () => {
  beforeAll(() => {
    const { ANON_KEY, API_URL, SERVICE_ROLE_KEY } =
      ensureSupabaseTestEnvironment();

    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = API_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
  });

  afterEach(async () => {
    if (!createdUserId) {
      return;
    }

    await createServiceClient().auth.admin.deleteUser(createdUserId);
    createdUserId = null;
  });

  it("deletes auth.users and cascades to user_profiles", async () => {
    const { client, user } = await signUpTestUser("mobile-api-delete");
    createdUserId = user.id;
    const service = createServiceClient();
    const {
      data: { session },
      error: sessionError,
    } = await client.auth.getSession();

    expect(sessionError).toBeNull();
    expect(session).not.toBeNull();

    const { data: profileBefore, error: profileBeforeError } = await service
      .from("user_profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    expect(profileBeforeError).toBeNull();
    expect(profileBefore?.id).toBe(user.id);

    const response = await DELETE(
      new Request("http://localhost/api/v1/me", {
        headers: { Authorization: `Bearer ${session!.access_token}` },
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { deleted: true },
      error: null,
      success: true,
    });

    const { data: deletedAuthUser } = await service.auth.admin.getUserById(
      user.id,
    );
    const { data: profileAfter, error: profileAfterError } = await service
      .from("user_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    expect(deletedAuthUser.user).toBeNull();
    expect(profileAfterError).toBeNull();
    expect(profileAfter).toBeNull();
    createdUserId = null;
  });
});
