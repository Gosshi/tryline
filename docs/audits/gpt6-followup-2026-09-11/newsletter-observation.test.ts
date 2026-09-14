import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  subscriber: {
    confirmation_token: "synthetic-token" as string | null,
    created_at: "2026-09-11T00:00:00.000Z",
    id: "synthetic-subscriber",
    status: "pending",
  },
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({
    from: () => ({
      select: () => {
        let token: unknown;
        const query = {
          eq: (_column: string, value: unknown) => {
            token = value;
            return query;
          },
          maybeSingle: async () => ({
            data: state.subscriber.confirmation_token === token
              ? { ...state.subscriber }
              : null,
            error: null,
          }),
        };
        return query;
      },
      update: (values: Partial<typeof state.subscriber>) => {
        const filters: Array<[string, unknown]> = [];
        const query = {
          eq: (column: string, value: unknown) => {
            filters.push([column, value]);
            return query;
          },
          then: (resolve: (result: { error: null }) => unknown) => {
            if (filters.every(([column, value]) =>
              state.subscriber[column as keyof typeof state.subscriber] === value)) {
              Object.assign(state.subscriber, values);
            }
            return Promise.resolve(resolve({ error: null }));
          },
        };
        return query;
      },
    }),
  }),
}));

beforeEach(() => {
  state.subscriber.confirmation_token = "synthetic-token";
  state.subscriber.status = "pending";
  state.subscriber.created_at = new Date().toISOString();
});

// Observation of the current defect, not a desired regression expectation.
it("a successful confirmation makes the same email link appear invalid", async () => {
  const { GET } = await import("@/app/api/newsletter/confirm/route");
  const request = () => new Request("http://localhost/api/newsletter/confirm?token=synthetic-token");
  const first = await GET(request());
  expect(first.headers.get("location")).toBe("http://localhost/newsletter/confirmed?completed=1");
  expect(state.subscriber.status).toBe("confirmed");
  expect(state.subscriber.confirmation_token).toBeNull();
  const second = await GET(request());
  expect(second.headers.get("location")).toBe("http://localhost/newsletter/invalid-link");
});
