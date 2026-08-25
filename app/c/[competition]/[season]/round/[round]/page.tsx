import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/status-badge";
import { TeamBadge } from "@/components/team-badge";
import {
  getCompetitionBySlug,
  listSeasonsByFamily,
} from "@/lib/db/queries/competitions";
import { getContentStatusForMatches } from "@/lib/db/queries/match-content";
import {
  getRoundMatches,
  listRoundHubParams,
  listRoundsForCompetition,
} from "@/lib/db/queries/matches";
import {
  formatCompetitionTitle,
  formatFamilyName,
  getCompetitionFamilyColor,
} from "@/lib/format/competition";
import {
  formatKickoffJstDate,
  formatKickoffJstTime,
} from "@/lib/format/kickoff";
import { formatRoundLabel } from "@/lib/format/round-label";
import { SITE_URL } from "@/lib/site";

import type { MatchContentStatus } from "@/lib/db/queries/match-content";
import type { MatchListItem } from "@/lib/db/queries/matches";
import type { Metadata } from "next";
import type { CSSProperties } from "react";

type Props = {
  params: Promise<{ competition: string; round: string; season: string }>;
};

export const revalidate = 3600;

export async function generateStaticParams() {
  const roundHubs = await listRoundHubParams();

  return roundHubs.map((hub) => ({
    competition: hub.competition,
    round: String(hub.round),
    season: hub.season,
  }));
}

function parseRoundParam(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const round = Number(value);

  return Number.isSafeInteger(round) ? round : null;
}

type DayGroup = {
  dateLabel: string;
  key: string;
  matches: MatchListItem[];
};

function withOpacity(color: string, opacity: number): string {
  const hex = color.replace("#", "");

  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return `rgb(15 23 42 / ${opacity})`;
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);

  return `rgb(${red} ${green} ${blue} / ${opacity})`;
}

function darken(color: string): string {
  const hex = color.replace("#", "");

  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return "#0f172a";
  }

  const channels = [0, 2, 4].map((offset) =>
    Math.round(Number.parseInt(hex.slice(offset, offset + 2), 16) * 0.55),
  );

  return `rgb(${channels.join(" ")})`;
}

function groupMatchesByJstDay(matches: MatchListItem[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();

  for (const match of [...matches].sort((left, right) =>
    left.kickoffAt.localeCompare(right.kickoffAt),
  )) {
    const dateLabel = formatKickoffJstDate(match.kickoffAt);
    const key = dateLabel.slice(0, 10);
    const group = groups.get(key) ?? { dateLabel, key, matches: [] };

    group.matches.push(match);
    groups.set(key, group);
  }

  return [...groups.values()];
}

function getDayLabelParts(dateLabel: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) \((.+)\)$/.exec(dateLabel);

  if (!match) {
    return { day: dateLabel, month: "JST", weekday: "" };
  }

  return {
    day: String(Number(match[3])),
    month: `${Number(match[2])}月`,
    weekday: match[4],
  };
}

function RoundMatchRow({
  accentColor,
  contentStatus,
  index,
  match,
}: {
  accentColor: string;
  contentStatus: MatchContentStatus;
  index: number;
  match: MatchListItem;
}) {
  const rowStyle = {
    "--round-row-hover": withOpacity(accentColor, 0.09),
    "--round-row-tint":
      index % 2 === 1 ? withOpacity(accentColor, 0.045) : "transparent",
  } as CSSProperties;
  const score =
    match.status === "finished"
      ? `${match.homeScore ?? 0}–${match.awayScore ?? 0}`
      : null;

  return (
    <li style={rowStyle}>
      <Link
        className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 bg-[var(--round-row-tint)] px-3 py-3 transition-colors hover:bg-[var(--round-row-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)] sm:grid-cols-[5.25rem_minmax(0,1fr)_auto] sm:px-4"
        href={`/matches/${match.id}`}
      >
        <time
          className="text-xs font-bold tabular-nums text-[var(--color-ink-muted)]"
          dateTime={match.kickoffAt}
        >
          {formatKickoffJstTime(match.kickoffAt)}
        </time>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-[var(--color-ink)]">
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
              <TeamBadge
                shortCode={match.homeTeam.shortCode}
                size={20}
                slug={match.homeTeam.slug}
              />
              <span className="truncate">{match.homeTeam.name}</span>
            </span>
            <span className="shrink-0 text-xs font-normal text-[var(--color-ink-muted)]">
              対
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
              <TeamBadge
                shortCode={match.awayTeam.shortCode}
                size={20}
                slug={match.awayTeam.slug}
              />
              <span className="truncate">{match.awayTeam.name}</span>
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {contentStatus.hasPreview && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                プレビューあり
              </span>
            )}
            {contentStatus.hasRecap && (
              <span className="bg-[var(--color-accent)]/10 rounded-full px-2 py-0.5 text-[10px] font-bold text-[var(--color-accent)]">
                レビューあり
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {score ? (
            <span className="text-base font-black tabular-nums text-[var(--color-ink)]">
              {score}
            </span>
          ) : (
            <StatusBadge status={match.status} />
          )}
        </div>
      </Link>
    </li>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competition, round, season } = await params;
  const roundNumber = parseRoundParam(round);
  const comp = await getCompetitionBySlug(`${competition}-${season}`);

  if (!comp || roundNumber === null) {
    return { title: "Tryline" };
  }

  const competitionTitle = formatCompetitionTitle(comp, comp.season);
  const roundLabel = formatRoundLabel(roundNumber, comp.family);
  const matches = await getRoundMatches(competition, season, roundNumber);
  const matchSummary = matches
    .slice(0, 3)
    .map((match) => `${match.homeTeam.name} 対 ${match.awayTeam.name}`)
    .join("、");
  const description = `${competitionTitle} ${roundLabel}の全試合の結果・スコア・日本語レビュー。${matchSummary}。`;
  const url = `${SITE_URL}/c/${competition}/${season}/round/${roundNumber}`;

  return {
    alternates: { canonical: url },
    description,
    openGraph: {
      description,
      images: [{ height: 630, url: `${SITE_URL}/og-image.png`, width: 1200 }],
      locale: "ja_JP",
      title: `${competitionTitle} ${roundLabel} | Tryline`,
      type: "website",
      url,
    },
    title: {
      absolute: `${competitionTitle} ${roundLabel} 結果・日程 | Tryline`,
    },
  };
}

export default async function RoundHubPage({ params }: Props) {
  const { competition, round, season } = await params;
  const roundNumber = parseRoundParam(round);

  if (roundNumber === null) {
    notFound();
  }

  const comp = await getCompetitionBySlug(`${competition}-${season}`);

  if (!comp) {
    notFound();
  }

  const [matches, rounds, seasons] = await Promise.all([
    getRoundMatches(competition, season, roundNumber),
    listRoundsForCompetition(competition, season),
    listSeasonsByFamily(comp.family),
  ]);

  if (matches.length === 0 || !rounds.includes(roundNumber)) {
    notFound();
  }

  const contentStatusMap = await getContentStatusForMatches(
    matches.map((match) => match.id),
  );
  const competitionTitle = formatCompetitionTitle(comp, comp.season);
  const roundLabel = formatRoundLabel(roundNumber, comp.family);
  const pageUrl = `${SITE_URL}/c/${competition}/${season}/round/${roundNumber}`;
  const accentColor = getCompetitionFamilyColor(comp.family);
  const currentRoundIndex = rounds.indexOf(roundNumber);
  const previousRound =
    currentRoundIndex > 0 ? (rounds[currentRoundIndex - 1] ?? null) : null;
  const nextRound =
    currentRoundIndex >= 0 && currentRoundIndex < rounds.length - 1
      ? (rounds[currentRoundIndex + 1] ?? null)
      : null;
  const dayGroups = groupMatchesByJstDay(matches);
  const contentCount = Object.values(contentStatusMap).filter(
    (status) => status.hasPreview || status.hasRecap,
  ).length;
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        item: SITE_URL,
        name: "Tryline",
        position: 1,
      },
      {
        "@type": "ListItem",
        item: `${SITE_URL}/c/${competition}`,
        name: formatFamilyName(comp.family),
        position: 2,
      },
      {
        "@type": "ListItem",
        item: `${SITE_URL}/c/${competition}/${season}`,
        name: competitionTitle,
        position: 3,
      },
      {
        "@type": "ListItem",
        item: pageUrl,
        name: roundLabel,
        position: 4,
      },
    ],
  };

  return (
    <main className="bg-paper min-h-screen">
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd),
        }}
        type="application/ld+json"
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10 md:px-8">
        <nav className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-muted)]">
          <Link className="hover:text-[var(--color-ink)]" href="/">
            Tryline
          </Link>
          <span>/</span>
          <Link
            className="hover:text-[var(--color-ink)]"
            href={`/c/${competition}`}
          >
            {formatFamilyName(comp.family)}
          </Link>
          <span>/</span>
          <Link
            className="hover:text-[var(--color-ink)]"
            href={`/c/${competition}/${season}`}
          >
            {comp.season}
          </Link>
          <span>/</span>
          <span className="text-[var(--color-ink)]">{roundLabel}</span>
        </nav>

        <header
          className="flex flex-col gap-3 rounded-2xl px-5 py-5 text-white shadow-[var(--shadow-soft)] sm:flex-row sm:items-center sm:justify-between sm:px-6"
          style={{ backgroundColor: darken(accentColor) }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">
              {formatFamilyName(comp.family)}
            </p>
            <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {roundLabel}
            </h1>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-white/75 sm:justify-end">
            <span>{competitionTitle}</span>
            <span>{matches.length}試合</span>
            <span>解説{contentCount}本</span>
            <span>{dayGroups[0]?.dateLabel ?? "日程未定"}</span>
          </div>
        </header>

        <section className="space-y-4" aria-label={`${roundLabel}の試合一覧`}>
          {dayGroups.map((group) => {
            const dayParts = getDayLabelParts(group.dateLabel);

            return (
              <section
                className="flex items-stretch gap-3 sm:gap-4"
                key={group.key}
                aria-labelledby={`round-date-${group.key}`}
              >
                <div
                  className="flex w-16 shrink-0 flex-col items-center justify-center rounded-2xl px-2 py-4 text-white shadow-sm"
                  style={{ backgroundColor: accentColor }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">
                    {dayParts.weekday}
                  </span>
                  <h2
                    className="mt-1 font-number text-3xl font-black leading-none text-white"
                    id={`round-date-${group.key}`}
                  >
                    {dayParts.day}
                  </h2>
                  <span className="mt-1 text-[10px] font-bold text-white/75">
                    {dayParts.month}
                  </span>
                  <span className="mt-3 rounded-full bg-black/15 px-2 py-0.5 text-[10px] font-bold text-white/80">
                    {group.matches.length}試合
                  </span>
                </div>
                <ul className="min-w-0 flex-1 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  {group.matches.map((match, index) => (
                    <RoundMatchRow
                      accentColor={accentColor}
                      contentStatus={
                        contentStatusMap[match.id] ?? {
                          hasPreview: false,
                          hasRecap: false,
                        }
                      }
                      index={index}
                      key={match.id}
                      match={match}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </section>

        <nav
          aria-label="前後のラウンド"
          className="flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            {previousRound !== null && (
              <Link
                className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors hover:border-slate-300 hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                href={`/c/${competition}/${season}/round/${previousRound}`}
              >
                ← {formatRoundLabel(previousRound, comp.family)}
              </Link>
            )}
          </div>
          <Link
            className="inline-flex justify-center rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            href={`/c/${competition}/${season}`}
          >
            シーズン全体を見る →
          </Link>
          <div className="text-right">
            {nextRound !== null && (
              <Link
                className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors hover:border-slate-300 hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                href={`/c/${competition}/${season}/round/${nextRound}`}
              >
                {formatRoundLabel(nextRound, comp.family)} →
              </Link>
            )}
          </div>
        </nav>

        {seasons.length > 1 && (
          <p className="text-xs text-[var(--color-ink-muted)]">
            他シーズンの一覧は大会ページから確認できます。
          </p>
        )}
      </div>
    </main>
  );
}
