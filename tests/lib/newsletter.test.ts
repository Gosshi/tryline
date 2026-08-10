import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  error: null as { message: string } | null,
  rows: [] as Array<{ email: string; id: string }>,
}));

const envMock = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => {
      if (table !== "email_subscribers") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: () => ({
          eq: () => Promise.resolve({ data: dbMock.rows, error: dbMock.error }),
        }),
      };
    },
  }),
}));

vi.mock("@/lib/env", () => envMock);

describe("newsletter delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    dbMock.error = null;
    dbMock.rows = [];
    envMock.getServerEnv.mockReturnValue({ RESEND_API_KEY: "resend-test-key" });
    global.fetch = vi.fn();
  });

  it("sends the weekly digest only to confirmed subscriber query results", async () => {
    dbMock.rows = [
      { email: "confirmed@example.com", id: "subscriber-1" },
      { email: "another@example.com", id: "subscriber-2" },
    ];
    (fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const { sendWeeklyDigestEmails } = await import("@/lib/newsletter");
    await expect(sendWeeklyDigestEmails("今週の原稿")).resolves.toEqual({
      failed: 0,
      sent: 2,
      skipped: false,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(
      String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.body),
    );
    expect(payload).toMatchObject({
      from: "Tryline <noreply@mail.trylinerugby.com>",
      reply_to: "support@trylinerugby.com",
      subject: "【Tryline】今週の海外ラグビーまとめ",
      to: "confirmed@example.com",
    });
    expect(payload.text).toContain("送信者: Tryline");
    expect(payload.text).toContain("配信停止:");
    expect(payload.text).toContain("token=subscriber-1");
  });

  it("keeps sending after an individual delivery failure and logs the counts", async () => {
    dbMock.rows = [
      { email: "first@example.com", id: "subscriber-1" },
      { email: "second@example.com", id: "subscriber-2" },
    ];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    (fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const { sendWeeklyDigestEmails } = await import("@/lib/newsletter");
    await expect(sendWeeklyDigestEmails("今週の原稿")).resolves.toEqual({
      failed: 1,
      sent: 1,
      skipped: false,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith(
      "[weekly-digest] newsletter delivery failed",
      expect.any(String),
    );
    expect(consoleInfo).toHaveBeenCalledWith("[weekly-digest] newsletter delivery", {
      failed: 1,
      sent: 1,
      skipped: false,
    });
  });

  it("skips cleanly when there are no confirmed subscribers", async () => {
    const { sendWeeklyDigestEmails } = await import("@/lib/newsletter");
    await expect(sendWeeklyDigestEmails("今週の原稿")).resolves.toEqual({
      failed: 0,
      sent: 0,
      skipped: false,
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("includes confirmation and unsubscribe links in every confirmation email", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
    });
    const { sendConfirmationEmail } = await import("@/lib/newsletter");
    await sendConfirmationEmail({
      confirmationToken: "confirm-token",
      email: "fan@example.com",
      subscriberId: "subscriber-1",
    });

    const payload = JSON.parse(
      String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.body),
    );
    expect(payload.text).toContain("/api/newsletter/confirm?token=confirm-token");
    expect(payload.text).toContain("/api/newsletter/unsubscribe?token=subscriber-1");
    expect(payload.text).toContain("お問い合わせ: support@trylinerugby.com");
  });
});
