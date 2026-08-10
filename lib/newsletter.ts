import { getSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";
import { SITE_URL } from "@/lib/site";

const NEWSLETTER_FROM = "Tryline <noreply@mail.trylinerugby.com>";
const CONTACT_EMAIL = "support@trylinerugby.com";

type ResendEmail = {
  subject: string;
  text: string;
  to: string;
};

type NewsletterDeliveryResult = {
  failed: number;
  sent: number;
  skipped: boolean;
};

function getUnsubscribeUrl(subscriberId: string): string {
  return `${SITE_URL}/api/newsletter/unsubscribe?token=${encodeURIComponent(subscriberId)}`;
}

function getEmailFooter(subscriberId: string): string {
  return [
    "",
    "---",
    "送信者: Tryline（海外ラグビーを日本語で追う）",
    `お問い合わせ: ${CONTACT_EMAIL}`,
    `配信停止: ${getUnsubscribeUrl(subscriberId)}`,
  ].join("\n");
}

async function sendResendEmail({ subject, text, to }: ResendEmail): Promise<void> {
  const { RESEND_API_KEY } = getServerEnv();

  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from: NEWSLETTER_FROM,
      reply_to: CONTACT_EMAIL,
      subject,
      text,
      to,
    }),
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Resend email failed: ${response.status}`);
  }
}

export async function sendConfirmationEmail({
  confirmationToken,
  email,
  subscriberId,
}: {
  confirmationToken: string;
  email: string;
  subscriberId: string;
}): Promise<void> {
  const confirmationUrl = `${SITE_URL}/api/newsletter/confirm?token=${encodeURIComponent(confirmationToken)}`;
  const text = [
    "Tryline ニュースレターへの登録を受け付けました。",
    "",
    "週に1回、週末の海外ラグビーの試合結果を日本語でまとめてお届けします。",
    "以下のリンクを開いて、登録を完了してください。",
    confirmationUrl,
    "",
    "このメールに心当たりがない場合は、何もせず削除してください。",
    getEmailFooter(subscriberId),
  ].join("\n");

  await sendResendEmail({
    subject: "Tryline ニュースレター登録の確認",
    text,
    to: email,
  });
}

export async function sendWeeklyDigestEmails(
  digest: string,
): Promise<NewsletterDeliveryResult> {
  if (!getServerEnv().RESEND_API_KEY) {
    const result = { failed: 0, sent: 0, skipped: true };
    console.info("[weekly-digest] newsletter delivery", result);

    return result;
  }

  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("email_subscribers")
    .select("id, email")
    .eq("status", "confirmed");

  if (error) {
    console.error(
      "[weekly-digest] newsletter subscriber lookup failed",
      JSON.stringify({ message: error.message }),
    );

    return { failed: 1, sent: 0, skipped: false };
  }

  let failed = 0;
  let sent = 0;

  for (const subscriber of data ?? []) {
    try {
      await sendResendEmail({
        subject: "【Tryline】今週の海外ラグビーまとめ",
        text: `${digest}${getEmailFooter(subscriber.id)}`,
        to: subscriber.email,
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(
        "[weekly-digest] newsletter delivery failed",
        JSON.stringify({
          message: error instanceof Error ? error.message : String(error),
          subscriberId: subscriber.id,
        }),
      );
    }
  }

  const result = { failed, sent, skipped: false };
  console.info("[weekly-digest] newsletter delivery", result);

  return result;
}
