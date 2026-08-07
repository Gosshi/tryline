type MatchContentTrustStripProps = {
  hasConfirmedLineups: boolean;
  sourcedFactSources: Array<{
    domain: string;
    sourceUrl: string | null;
  }>;
};

export function MatchContentTrustStrip({
  hasConfirmedLineups,
  sourcedFactSources,
}: MatchContentTrustStripProps) {
  const sourcesByDomain = new Map<
    string,
    { domain: string; sourceUrl: string | null }
  >();

  for (const source of sourcedFactSources) {
    const existing = sourcesByDomain.get(source.domain);

    if (!existing || (!existing.sourceUrl && source.sourceUrl)) {
      sourcesByDomain.set(source.domain, source);
    }
  }

  const sources = [...sourcesByDomain.values()];

  if (!hasConfirmedLineups && sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 border-t border-[var(--color-rule)] pt-4">
      <dl className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-semibold leading-relaxed text-[var(--color-ink-muted)]">
        <dt className="sr-only">この記事の根拠</dt>
        {hasConfirmedLineups && (
          <dd className="rounded-full bg-[var(--color-accent-subtle)] px-3 py-1">
            ラインアップ確認済み
          </dd>
        )}
        {hasConfirmedLineups && sources.length > 0 && (
          <span aria-hidden className="text-[var(--color-rule)]">
            ・
          </span>
        )}
        {sources.map((source, index) => (
          <div className="contents" key={source.domain}>
            {index > 0 && (
              <span aria-hidden className="text-[var(--color-rule)]">
                ・
              </span>
            )}
            <dd className="rounded-full bg-[var(--color-accent-subtle)] px-3 py-1">
              {source.sourceUrl ? (
                <a
                  className="underline decoration-[var(--color-accent)] underline-offset-2 hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  href={source.sourceUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  出典: {source.domain}
                </a>
              ) : (
                <>出典: {source.domain}</>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
