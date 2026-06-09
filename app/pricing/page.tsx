import Image from "next/image";
import Link from "next/link";

import { PricingForm } from "@/app/pricing/pricing-form";
import { HeroTexture } from "@/components/hero-texture";
import { getRecentlyReviewedMatchById } from "@/lib/db/queries/matches";
import { formatCompetitionTitle } from "@/lib/format/competition";
import { PRIMARY_SAMPLE_MATCH_ID } from "@/lib/sample-matches";
import { SITE_URL } from "@/lib/site";

import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/pricing` },
  description:
    "見逃した海外ラグビーの試合を日本語レビューと AI チャットで深く追える Tryline Premium。7日間無料、その後 ¥980/月。",
  openGraph: {
    description:
      "見逃した海外ラグビーの試合を日本語レビューと AI チャットで深く追える Tryline Premium。7日間無料、その後 ¥980/月。",
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
  { free: false, name: "試合 AI チャット", premium: true },
  { free: true, name: "試合更新・公開通知", premium: true },
];

const faqs = [
  {
    answer:
      "はい。初回登録時に 7 日間の無料トライアルをご利用いただけます。トライアル期間中は日本語レビュー全文・試合 AI チャットを含むすべての Premium 機能をお使いいただけます。トライアル終了後は自動的に ¥980/月の課金が始まります。期間中はいつでもキャンセル可能です。",
    question: "無料トライアルはありますか？",
  },
  {
    answer:
      "試合スコア・順位表・ラインナップ・日本語プレビュー全文・試合更新通知は無料でご利用いただけます。日本語レビュー全文・試合 AI チャットは Premium 限定です。",
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
      "Six Nations、Premiership、URC、Top 14、Super Rugby Pacific、Rugby Championship、Autumn Nations Series に対応しています。",
    question: "どの大会のコンテンツが読めますか？",
  },
  {
    answer: "クレジットカード・デビットカードに対応しています（Stripe 決済）。",
    question: "支払い方法は？",
  },
];

const pricingVideoJsonLd = {
  "@context": "https://schema.org",
  "@type": "VideoObject",
  description:
    "海外ラグビーの試合を日本語で解説。プレビュー・レビュー・AI チャットが使える Tryline の紹介動画です。",
  embedUrl: "https://www.youtube.com/embed/2kFHgiaI-NA",
  name: "Tryline — ラグビー解説サービス紹介",
  thumbnailUrl: "https://img.youtube.com/vi/2kFHgiaI-NA/maxresdefault.jpg",
  uploadDate: "2025-01-01",
};

const pricingFaqJsonLd = {
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

function FeatureMark({ enabled }: { enabled: boolean }) {
  return (
    <span
      aria-label={enabled ? "利用可" : "対象外"}
      className={enabled ? "text-[var(--color-accent)]" : "text-slate-300"}
    >
      {enabled ? "✓" : "—"}
    </span>
  );
}

export default async function PricingPage() {
  const sample = await getRecentlyReviewedMatchById(
    PRIMARY_SAMPLE_MATCH_ID,
    "ja",
  );
  const trialUrl = sample ? `/matches/${PRIMARY_SAMPLE_MATCH_ID}` : "/";

  return (
    <main className="min-h-screen bg-slate-50">
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
      <section className="relative overflow-hidden bg-[var(--color-ink)] px-4 py-16 text-white sm:px-6 sm:py-20 md:px-8">
        <HeroTexture />
        <div className="relative z-10 mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent)]">
            Tryline Premium
          </p>
          <h1 className="mt-4 max-w-3xl text-balance font-serif text-4xl font-bold tracking-tight sm:text-6xl">
            見逃した海外ラグビーを、日本語で深く追える。
          </h1>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/60">
            <span>8大会対応</span>
            <span>500試合以上</span>
            <span>7日間無料</span>
          </div>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/65">
            DAZN、J SPORTS、WOWOW
            で追う試合が重なる週末でも、試合の流れ・勝負どころ・注目選手を
            日本語レビューと試合 AI チャットで確認できます。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PricingForm buttonLabel="7日間無料でレビュー全文を読む" />
            <Link
              className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:border-white/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              href={trialUrl}
            >
              無料サンプルを読む
            </Link>
          </div>
          <p className="mt-3 text-xs text-white/45">
            7日間無料 · その後 ¥980/月 · いつでもキャンセル可能 · Stripe 決済
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-14 px-4 py-12 sm:px-6 md:px-8">
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            プロダクトデモ
          </p>
          <h2 className="mb-6 text-2xl font-black tracking-tight text-[var(--color-ink)] sm:text-3xl">
            実際の画面を見てみる
          </h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
              <iframe
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
                src="https://www.youtube.com/embed/2kFHgiaI-NA?rel=0&modestbranding=1"
                title="Tryline プロダクトデモ"
              />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr] border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>機能</span>
            <span className="text-center">Free</span>
            <span className="text-center text-[var(--color-accent)]">
              Premium
            </span>
          </div>
          <ul className="divide-y divide-slate-100">
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

        <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
              Sample
            </p>
            <h2 className="mt-2 font-serif text-3xl font-bold text-[var(--color-ink)]">
              まず無料サンプルで確認できます
            </h2>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {sample ? (
              <>
                <p className="text-xs font-semibold text-[var(--color-ink-muted)]">
                  {formatCompetitionTitle(
                    sample.competition.name,
                    sample.competition.season,
                  )}
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">
                  {sample.homeTeam.name} vs {sample.awayTeam.name}
                </p>
                <p className="mt-4 max-h-32 overflow-hidden text-sm leading-7 text-[var(--color-ink-muted)]">
                  {sample.recapExcerpt}
                </p>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-white/0" />
              </>
            ) : (
              <div className="space-y-3 text-sm text-[var(--color-ink-muted)]">
                <p className="font-semibold text-[var(--color-ink)]">
                  試合直後に更新
                </p>
                <p className="leading-7">
                  ノックアウト式の試合では、キックオフ後 30〜60 分で
                  日本語レビューが生成されます。プレビューは無料で読めます。レビュー全文と
                  試合 AI チャットは Premium 限定です。
                </p>
              </div>
            )}
            <div className="relative mt-8">
              <PricingForm
                buttonLabel="7日間無料で全文を読む"
                variant="inline"
              />
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-2xl font-black tracking-tight text-[var(--color-ink)] sm:text-3xl">
            Premium ではこんな画面が読めます
          </h2>
          <p className="mb-10 text-sm text-[var(--color-ink-muted)]">
            詳細な日本語レビューと、試合について何でも聞ける AI チャット。
          </p>

          <div className="space-y-12">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
                日本語レビュー全文
              </p>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
                試合 AI チャット
              </p>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <Image
                  alt="AI チャットの画面例"
                  className="h-auto w-full"
                  height={1120}
                  src="/pricing/ai-chat.png"
                  width={1726}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-serif text-3xl font-bold text-[var(--color-ink)]">
            FAQ
          </h2>
          <div className="grid gap-3">
            {faqs.map((faq) => (
              <article
                className="rounded-xl border border-slate-200 bg-white p-5"
                key={faq.question}
              >
                <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                  {faq.question}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">
                  {faq.answer}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
