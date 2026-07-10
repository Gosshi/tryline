import type { PublishedMatchContent } from "@/lib/db/queries/match-content";

type MatchContentTrustStripProps = {
  content: PublishedMatchContent;
  hasConfirmedLineups: boolean;
  sourcedFactCount: number;
};

function formatGeneratedDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

export function MatchContentTrustStrip({
  content,
  hasConfirmedLineups,
  sourcedFactCount,
}: MatchContentTrustStripProps) {
  const signals = [
    hasConfirmedLineups ? "ラインアップ確認済み" : null,
    sourcedFactCount > 0 ? `参照元${sourcedFactCount}件` : null,
    `更新: ${formatGeneratedDate(content.generatedAt)}`,
  ].filter(Boolean);

  return (
    <div className="mt-6 border-t border-[var(--color-rule)] pt-4">
      <dl className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-semibold leading-relaxed text-[var(--color-ink-muted)]">
        <dt className="sr-only">この記事の根拠</dt>
        {signals.map((signal, index) => (
          <div className="contents" key={signal}>
            {index > 0 && (
              <span
                aria-hidden
                className="text-[var(--color-rule)]"
              >
                ・
              </span>
            )}
            <dd className="rounded-full bg-[var(--color-accent-subtle)] px-3 py-1">
              {signal}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
