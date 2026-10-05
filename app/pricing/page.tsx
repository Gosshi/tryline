import Image from "next/image";

import { PricingForm } from "@/app/pricing/pricing-form";
import { HeroTexture } from "@/components/hero-texture";
import {
  PricingBillingSummary,
  PricingTrialBadge,
} from "@/components/pricing-billing-copy";
import { PricingFaq } from "@/components/pricing-faq";
import { TrackedLink } from "@/components/tracked-link";
import { BILLING_TERMS, type BillingTerms } from "@/lib/billing/terms";
import { getRecentlyReviewedMatchById } from "@/lib/db/queries/matches";
import { formatCompetitionTitle } from "@/lib/format/competition";
import { getPrimarySampleMatchId } from "@/lib/sample-matches";
import { SITE_URL } from "@/lib/site";

import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/pricing` },
  description: BILLING_TERMS.pricingDescription,
  openGraph: {
    description: BILLING_TERMS.pricingDescription,
    images: [{ height: 630, url: `${SITE_URL}/og-image.png`, width: 1200 }],
    locale: "ja_JP",
    title: "プランを選ぶ | Tryline",
    type: "website",
    url: `${SITE_URL}/pricing`,
  },
  title: "プランを選ぶ",
};

const features = [
  { free: true, name: "試合スコア・順位表・得点推移グラフ", premium: true },
  { free: true, name: "大会アーカイブ閲覧", premium: true },
  { free: true, name: "日本語プレビュー全文", premium: true },
  { free: false, name: "日本語レビュー全文", premium: true },
  { free: false, name: "この試合について質問する", premium: true },
  { free: true, name: "試合更新・公開通知", premium: true },
];

function createFaqs(billingTerms: BillingTerms) {
  return [
    {
      answer: billingTerms.trialFaqAnswer,
      question: "無料トライアルはありますか？",
    },
    {
      answer:
        "試合スコア・順位表・ラインナップ・日本語プレビュー全文・試合更新通知は無料でご利用いただけます。日本語レビュー全文・「この試合について質問する」は Premium 限定です。",
      question: "無料でどこまで利用できますか？",
    },
    {
      answer:
        "デジタルコンテンツの性質上、原則として返金は承っておりません。ご不明な点は support@trylinerugby.com までお問い合わせください。",
      question: "返金ポリシーを教えてください。",
    },
    {
      answer:
        "はい。Stripe カスタマーポータルからいつでも解約できます。次回更新日まで引き続きご利用いただけます。",
      question: "いつでもキャンセルできますか？",
    },
    {
      answer:
        "Six Nations、Premiership、URC、Top 14、Super Rugby Pacific、Rugby Championship、Autumn Nations Series、リーグワン、Pacific Nations Cup、RWC 2027 に対応しています。",
      question: "どの大会のコンテンツが読めますか？",
    },
    {
      answer:
        "クレジットカード・デビットカードに対応しています（Stripe 決済）。",
      question: "支払い方法は？",
    },
  ];
}

const pricingVideoJsonLd = {
  "@context": "https://schema.org",
  "@type": "VideoObject",
  description:
    "日本語で海外ラグビーを追うための Tryline の紹介。今週の試合と結果を日本時間で、大会ごとの日程・結果・順位表、試合ごとの日本語のプレビューとレビュー、日本代表の対戦成績、スコアを自分で開くまで隠せる iPhone アプリ。",
  duration: "PT31S",
  embedUrl: "https://www.youtube.com/embed/FiIQ26g19ek",
  name: "Tryline 紹介｜海外ラグビーを、日本語で（2026年10月）",
  thumbnailUrl: "https://i.ytimg.com/vi/FiIQ26g19ek/hqdefault.jpg",
  uploadDate: "2026-10-05",
};

function createPricingFaqJsonLd(billingTerms: BillingTerms) {
  const faqs = createFaqs(billingTerms);

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
      name: faq.question,
    })),
  };
}

function FeatureMark({ enabled }: { enabled: boolean }) {
  return (
    <span
      aria-label={enabled ? "利用可" : "対象外"}
      className={
        enabled ? "text-[var(--color-accent)]" : "text-[var(--color-ink-muted)]"
      }
    >
      {enabled ? "✓" : "—"}
    </span>
  );
}

export default async function PricingPage() {
  const faqs = createFaqs(BILLING_TERMS);
  const pricingFaqJsonLd = createPricingFaqJsonLd(BILLING_TERMS);
  const sampleMatchId = await getPrimarySampleMatchId();
  const sample = await getRecentlyReviewedMatchById(sampleMatchId, "ja");
  const trialUrl = sample ? `/matches/${sampleMatchId}` : "/";

  return (
    <main className="tl-scope tl-pricing-page bg-paper min-h-screen">
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(pricingVideoJsonLd),
        }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(pricingFaqJsonLd),
        }}
        type="application/ld+json"
      />
      <section className="tl-pricing-hero relative overflow-hidden px-4 py-10 text-white sm:px-6 sm:py-12 md:px-8">
        <HeroTexture />
        <div className="tl-pricing-hero-grid relative z-10 mx-auto max-w-6xl">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent)]">
              Tryline Premium
            </p>
            <h1 className="mt-4 max-w-3xl font-serif text-4xl font-extrabold tracking-tight sm:text-6xl">
              <span className="block">見逃した海外ラグビーを、</span>
              <span className="block">日本語で深く追える。</span>
            </h1>
            <div className="tl-pricing-badges mt-6 flex flex-wrap gap-2 text-sm">
              <span>10大会対応</span>
              <span>500試合以上</span>
              <PricingTrialBadge billingTerms={BILLING_TERMS} />
            </div>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[#dedbd4]">
              DAZN、J SPORTS、WOWOW
              で追う試合が重なる週末でも、試合の流れ・勝負どころ・注目選手を
              日本語レビューと試合Q&Aで確認できます。
            </p>
          </div>
          <div className="tl-pricing-enroll">
            <div className="flex flex-wrap gap-3">
              <PricingForm
                analytics={{
                  cta_id: "pricing_hero_checkout",
                  cta_location: "pricing_hero",
                  destination: "checkout",
                  label: BILLING_TERMS.trialRecapCtaLabel,
                }}
                buttonLabel={BILLING_TERMS.trialRecapCtaLabel}
              />
              <TrackedLink
                analytics={{
                  content_type: "recap",
                  cta_id: "pricing_hero_sample_recap",
                  cta_location: "pricing_hero",
                  destination: sample ? "sample_match" : "home",
                  is_sample: Boolean(sample),
                  label: "無料サンプルを読む",
                  match_id: sample ? sampleMatchId : undefined,
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/40 px-5 py-2.5 text-sm font-semibold text-[#fffdf8] transition-colors hover:border-white/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                href={trialUrl}
              >
                無料サンプルを読む
              </TrackedLink>
            </div>
            <p className="mt-5 text-sm leading-7 text-[#dedbd4]">
              <PricingBillingSummary billingTerms={BILLING_TERMS} />
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6 sm:py-12 md:px-8">
        <div className="tl-pricing-overview grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-start">
          <section className="tl-pricing-section">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
              プロダクトデモ
            </p>
            <h2 className="mb-6 text-2xl font-extrabold tracking-tight text-[var(--color-ink)] sm:text-3xl">
              実際の画面を見てみる
            </h2>
            <div className="tl-pricing-frame overflow-hidden">
              <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                <iframe
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full"
                  src="https://www.youtube.com/embed/FiIQ26g19ek?rel=0&modestbranding=1"
                  title="Tryline 紹介動画"
                />
              </div>
            </div>
          </section>

          <section className="tl-pricing-comparison overflow-hidden">
            <div className="tl-pricing-comparison-head grid grid-cols-[1.4fr_0.8fr_0.8fr] px-4 py-4 text-xs font-semibold uppercase tracking-[0.18em]">
              <span>機能</span>
              <span className="text-center">Free</span>
              <span className="text-center text-[var(--color-accent)]">
                Premium
              </span>
            </div>
            <ul className="divide-y divide-[var(--color-rule)]">
              {features.map((feature) => (
                <li
                  className="grid grid-cols-[1.4fr_0.8fr_0.8fr] items-center px-4 py-4 text-sm"
                  key={feature.name}
                >
                  <span className="font-medium text-[var(--color-ink)]">
                    {feature.name}
                  </span>
                  <span className="text-center text-lg font-bold">
                    <FeatureMark enabled={feature.free} />
                  </span>
                  <span className="text-center text-lg font-bold">
                    <FeatureMark enabled={feature.premium} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <section className="tl-pricing-sample tl-pricing-section grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
              Sample
            </p>
            <h2 className="mt-2 font-serif text-3xl font-extrabold text-[var(--color-ink)]">
              まず無料サンプルで確認できます
            </h2>
          </div>
          <div className="tl-pricing-sample-card relative overflow-hidden p-6">
            {sample ? (
              <>
                <p className="text-xs font-semibold text-[var(--color-ink-muted)]">
                  {formatCompetitionTitle(
                    sample.competition.name,
                    sample.competition.season,
                  )}
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">
                  {sample.homeTeam.name} 対 {sample.awayTeam.name}
                </p>
                <p className="mt-4 max-h-32 overflow-hidden text-sm leading-7 text-[var(--color-ink-muted)]">
                  {sample.recapExcerpt}
                </p>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#fffdf8] to-[#fffdf8]/0" />
              </>
            ) : (
              <div className="space-y-3 text-sm text-[var(--color-ink-muted)]">
                <p className="font-semibold text-[var(--color-ink)]">
                  試合直後に更新
                </p>
                <p className="leading-7">
                  ノックアウト式の試合では、キックオフ後 30〜60 分で
                  日本語レビューが生成されます。プレビューは無料で読めます。レビュー全文と
                  「この試合について質問する」は Premium 限定です。
                </p>
              </div>
            )}
            <div className="relative mt-8">
              <PricingForm
                analytics={{
                  cta_id: "pricing_sample_section_checkout",
                  cta_location: "pricing_sample_section",
                  destination: "checkout",
                  label: BILLING_TERMS.trialFullContentCtaLabel,
                }}
                buttonLabel={BILLING_TERMS.trialFullContentCtaLabel}
                variant="inline"
              />
            </div>
          </div>
        </section>

        <section className="tl-pricing-section">
          <h2 className="mb-2 text-2xl font-extrabold tracking-tight text-[var(--color-ink)] sm:text-3xl">
            Premiumで使える機能
          </h2>
          <p className="mb-10 text-sm text-[var(--color-ink-muted)]">
            詳細な日本語レビューと、試合データと公開レビューをもとに質問できる機能。
          </p>

          <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
                日本語レビュー全文
              </p>
              <div className="tl-pricing-frame overflow-hidden">
                <Image
                  alt="Premium 試合レビューの画面例"
                  className="h-auto w-full"
                  height={2209}
                  src="/pricing/review-full.png"
                  width={1703}
                />
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
                この試合について質問する
              </p>
              <div className="tl-pricing-frame overflow-hidden">
                <Image
                  alt="「この試合について質問する」の画面例"
                  className="h-auto w-full"
                  height={1120}
                  src="/pricing/ai-chat.png"
                  width={1726}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="tl-pricing-faq tl-pricing-section space-y-4">
          <h2 className="font-serif text-3xl font-extrabold text-[var(--color-ink)]">
            FAQ
          </h2>
          <PricingFaq faqs={faqs} />
        </section>
      </div>
    </main>
  );
}
