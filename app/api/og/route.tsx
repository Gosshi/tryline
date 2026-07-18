import { ImageResponse } from "@vercel/og";

import { getSupabasePublicServerClient } from "@/lib/db/public-server";
import { formatCompetitionTitle } from "@/lib/format/competition";
import { formatKickoffJstCompact } from "@/lib/format/kickoff";
import { getTeamDisplayName } from "@/lib/format/team";
import { getTeamColor } from "@/lib/format/team-identity";
import { getResultTeamNameFontSize } from "@/lib/seo/og-result-team-name";

import type { Json } from "@/lib/db/types";

export const runtime = "edge";

const STORY_IMAGE_CACHE_CONTROL =
  "public, s-maxage=86400, stale-while-revalidate=604800";

type StoryItemType = "preview" | "result" | "recap";
type StoryTextMode = "full" | "none";

type StoryOgMatchRow = {
  away_score: number | null;
  away_team: {
    flag_code: string | null;
    name: string;
    name_ja: string | null;
    short_code: string | null;
    slug: string;
  } | null;
  competition: {
    name: string;
    name_ja: string | null;
    season: string;
    slug: string | null;
  } | null;
  home_score: number | null;
  home_team: {
    flag_code: string | null;
    name: string;
    name_ja: string | null;
    short_code: string | null;
    slug: string;
  } | null;
  id: string;
  kickoff_at: string;
  status: string;
};

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function sanitizeAccentColor(value: string | null): string {
  return value && /^#[0-9a-f]{3,8}$/i.test(value) ? value : "#c93a3a";
}

function parseNonNegativeCount(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) {
    return 0;
  }

  const count = Number(value);

  return Number.isSafeInteger(count) ? count : 0;
}

function formatCalendarFocusKickoff(value: string | null): string | null {
  if (!value || Number.isNaN(new Date(value).getTime())) {
    return null;
  }

  return formatKickoffJstCompact(value);
}

function parseStoryItemType(value: string | null): StoryItemType | null {
  return value === "preview" || value === "result" || value === "recap"
    ? value
    : null;
}

function parseStoryTextMode(value: string | null): StoryTextMode {
  return value === "none" ? "none" : "full";
}

function teamColorRgba(color: string, opacity: number): string {
  const hex = color.replace("#", "");

  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return `rgba(148, 163, 184, ${opacity})`;
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

async function loadStoryOgMatch(matchId: string | null) {
  if (!matchId) {
    return null;
  }

  try {
    const client = getSupabasePublicServerClient();
    const { data, error } = await client
      .from("matches")
      .select(
        `
          id,
          kickoff_at,
          status,
          home_score,
          away_score,
          home_team:teams!matches_home_team_id_fkey (
            slug,
            name,
            name_ja,
            short_code,
            flag_code
          ),
          away_team:teams!matches_away_team_id_fkey (
            slug,
            name,
            name_ja,
            short_code,
            flag_code
          ),
          competition:competitions!matches_competition_id_fkey (
            name,
            name_ja,
            slug,
            season
          )
        `,
      )
      .eq("id", matchId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data as StoryOgMatchRow;
  } catch {
    return null;
  }
}

function getStoryTeamLabel(
  team: NonNullable<StoryOgMatchRow["home_team"]>,
): string {
  return getTeamDisplayName({
    name: team.name,
    nameJa: team.name_ja,
    slug: team.slug,
  });
}

function storyFallbackImage(
  fontData: ArrayBuffer,
  fontName: string,
  orientation: "landscape" | "portrait",
) {
  const isPortrait = orientation === "portrait";
  const width = isPortrait ? 1080 : 1200;
  const height = isPortrait ? 1920 : 630;

  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "linear-gradient(180deg, #0B1628 0%, #1A3A5C 100%)",
        color: "#f8fafc",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Inter, Geist, sans-serif",
        height: `${height}px`,
        justifyContent: "center",
        overflow: "hidden",
        padding: isPortrait ? "120px" : "64px",
        position: "relative",
        width: `${width}px`,
      }}
    >
      <div
        style={{
          background:
            "radial-gradient(circle at 24% 18%, rgba(201,58,64,0.36), transparent 28%), radial-gradient(circle at 80% 76%, rgba(255,255,255,0.12), transparent 34%)",
          display: "flex",
          inset: 0,
          position: "absolute",
        }}
      />
      <div
        style={{
          color: "#f8fafc",
          display: "flex",
          fontSize: isPortrait ? "94px" : "72px",
          fontWeight: 900,
          letterSpacing: "0.02em",
          position: "relative",
        }}
      >
        Tryline
      </div>
      <div
        style={{
          color: "rgba(248,250,252,0.66)",
          display: "flex",
          fontSize: isPortrait ? "34px" : "24px",
          fontWeight: 800,
          marginTop: "24px",
          position: "relative",
        }}
      >
        海外ラグビーを日本語で
      </div>
      <div
        style={{
          bottom: isPortrait ? 84 : 44,
          color: "rgba(248,250,252,0.56)",
          display: "flex",
          fontSize: isPortrait ? "28px" : "20px",
          fontWeight: 800,
          position: "absolute",
        }}
      >
        trylinerugby.com
      </div>
    </div>,
    {
      fonts: [
        {
          data: fontData,
          name: fontName,
          style: "normal",
          weight: 700,
        },
      ],
      headers: { "Cache-Control": STORY_IMAGE_CACHE_CONTROL },
      height,
      width,
    },
  );
}

function storyImage(
  match: StoryOgMatchRow,
  item: StoryItemType,
  fontData: ArrayBuffer,
  fontName: string,
  orientation: "landscape" | "portrait",
  textMode: StoryTextMode,
) {
  if (!match.home_team || !match.away_team || !match.competition) {
    return storyFallbackImage(fontData, fontName, orientation);
  }

  const isPortrait = orientation === "portrait";
  const width = isPortrait ? 1080 : 1200;
  const height = isPortrait ? 1920 : 630;
  const homeColor = getTeamColor(match.home_team.slug);
  const awayColor = getTeamColor(match.away_team.slug);
  const home = truncate(getStoryTeamLabel(match.home_team), isPortrait ? 18 : 20);
  const away = truncate(getStoryTeamLabel(match.away_team), isPortrait ? 18 : 20);
  const competition = truncate(
    formatCompetitionTitle(
      {
        name: match.competition.name,
        nameJa: match.competition.name_ja,
        slug: match.competition.slug,
      },
      match.competition.season,
    ),
    isPortrait ? 28 : 38,
  );
  const label =
    item === "preview" ? "PREVIEW" : item === "recap" ? "RECAP" : "RESULT";
  const title =
    item === "preview"
      ? "試合プレビュー"
      : item === "recap"
        ? "試合レビュー"
        : "試合結果";
  const score =
    item === "result" &&
    match.status === "finished" &&
    match.home_score !== null &&
    match.away_score !== null
      ? `${match.home_score} — ${match.away_score}`
      : null;
  const homeFontSize = isPortrait
    ? 76
    : getResultTeamNameFontSize(home);
  const awayFontSize = isPortrait
    ? 76
    : getResultTeamNameFontSize(away);
  const renderText = textMode === "full";

  return new ImageResponse(
    <div
      style={{
        background: "linear-gradient(180deg, #0B1628 0%, #06111f 100%)",
        color: "#f8fafc",
        display: "flex",
        fontFamily: "Inter, Geist, sans-serif",
        height: `${height}px`,
        overflow: "hidden",
        padding: isPortrait ? "86px 78px" : "52px 64px",
        position: "relative",
        width: `${width}px`,
      }}
    >
      <div
        style={{
          background:
            `radial-gradient(circle at 6% 0%, ${teamColorRgba(homeColor, 1)} 0%, ${teamColorRgba(homeColor, 0.72)} 30%, transparent 64%), radial-gradient(circle at 96% 100%, ${teamColorRgba(awayColor, 1)} 0%, ${teamColorRgba(awayColor, 0.72)} 30%, transparent 64%), linear-gradient(135deg, ${teamColorRgba(homeColor, 0.5)} 0%, #0B1628 48%, ${teamColorRgba(awayColor, 0.5)} 100%)`,
          bottom: 0,
          display: "flex",
          left: 0,
          position: "absolute",
          right: 0,
          top: 0,
        }}
      />
      <div
        style={{
          background:
            "linear-gradient(180deg, rgba(6,17,31,0.2) 0%, rgba(6,17,31,0.78) 100%)",
          bottom: 0,
          display: "flex",
          left: 0,
          position: "absolute",
          right: 0,
          top: 0,
        }}
      />
      <div
        style={{
          background: "#c93a40",
          display: "flex",
          height: isPortrait ? "14px" : "8px",
          left: 0,
          position: "absolute",
          right: 0,
          top: 0,
        }}
      />
      {renderText && (
        <div
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
            left: isPortrait ? 78 : 64,
            position: "absolute",
            right: isPortrait ? 78 : 64,
            top: isPortrait ? 86 : 52,
          }}
        >
          <div
            style={{
              border: "1px solid rgba(248,250,252,0.22)",
              borderRadius: "9999px",
              color: "#f8fafc",
              display: "flex",
              fontSize: isPortrait ? "30px" : "22px",
              fontWeight: 900,
              letterSpacing: "0.12em",
              padding: isPortrait ? "14px 24px" : "10px 18px",
            }}
          >
            {label}
          </div>
          <div
            style={{
              color: "rgba(248,250,252,0.72)",
              display: "flex",
              fontSize: isPortrait ? "30px" : "22px",
              fontWeight: 900,
              letterSpacing: "0.08em",
            }}
          >
            TRYLINE
          </div>
        </div>
      )}

      {renderText && (
        <div
          style={{
            bottom: isPortrait ? 230 : 108,
            display: "flex",
            flexDirection: "column",
            gap: isPortrait ? "34px" : "22px",
            justifyContent: "center",
            left: isPortrait ? 78 : 72,
            position: "absolute",
            right: isPortrait ? 78 : 72,
            top: isPortrait ? 300 : 138,
          }}
        >
          <div
            style={{
              color: "rgba(248,250,252,0.66)",
              display: "flex",
              fontSize: isPortrait ? "34px" : "24px",
              fontWeight: 900,
              letterSpacing: "0.04em",
            }}
          >
            {competition}
          </div>
          <div
            style={{
              color: "#f8fafc",
              display: "flex",
              fontSize: isPortrait ? "54px" : "38px",
              fontWeight: 900,
              lineHeight: 1.08,
            }}
          >
            {title}
          </div>
          <div
            style={{
              alignItems: isPortrait ? "flex-start" : "center",
              display: "flex",
              flexDirection: isPortrait ? "column" : "row",
              gap: isPortrait ? "22px" : "30px",
              marginTop: isPortrait ? "38px" : "20px",
            }}
          >
            <div
              style={{
                color: "#f8fafc",
                display: "flex",
                flex: isPortrait ? "none" : 1,
                fontSize: `${homeFontSize}px`,
                fontWeight: 900,
                lineHeight: 1.02,
              }}
            >
              {home}
            </div>
            <div
              style={{
                color: score ? "#c93a40" : "rgba(248,250,252,0.42)",
                display: "flex",
                fontSize: isPortrait
                  ? score
                    ? "86px"
                    : "42px"
                  : score
                    ? "62px"
                    : "34px",
                fontWeight: 950,
                lineHeight: 1,
              }}
            >
              {score ?? "vs"}
            </div>
            <div
              style={{
                color: "#f8fafc",
                display: "flex",
                flex: isPortrait ? "none" : 1,
                fontSize: `${awayFontSize}px`,
                fontWeight: 900,
                lineHeight: 1.02,
              }}
            >
              {away}
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          bottom: isPortrait ? 82 : 42,
          color: "rgba(248,250,252,0.58)",
          display: "flex",
          fontSize: isPortrait ? "30px" : "20px",
          fontWeight: 800,
          position: "absolute",
          right: isPortrait ? 78 : 64,
        }}
      >
        trylinerugby.com
      </div>
    </div>,
    {
      fonts: [
        {
          data: fontData,
          name: fontName,
          style: "normal",
          weight: 700,
        },
      ],
      headers: { "Cache-Control": STORY_IMAGE_CACHE_CONTROL },
      height,
      width,
    },
  );
}

type RoundScoreboardMatchRow = {
  away_score: number | null;
  away_team: { name: string; short_code: string | null } | null;
  competition: {
    name: string;
    name_ja: string | null;
    season: string;
  } | null;
  external_ids: Json;
  home_score: number | null;
  home_team: { name: string; short_code: string | null } | null;
  id: string;
  kickoff_at: string;
};

function parseRound(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const round = Number(value);

  return Number.isSafeInteger(round) ? round : null;
}

function getRoundFromExternalIds(externalIds: Json): number | null {
  if (
    !externalIds ||
    typeof externalIds !== "object" ||
    Array.isArray(externalIds)
  ) {
    return null;
  }

  const round = externalIds.round ?? externalIds.wikipedia_round;

  if (typeof round === "number" && Number.isInteger(round)) {
    return round;
  }

  if (typeof round === "string" && /^\d+$/.test(round.trim())) {
    return Number.parseInt(round, 10);
  }

  return null;
}

async function loadRoundScoreboardMatches(
  competitionId: string,
  round: number,
) {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        home_score,
        away_score,
        external_ids,
        home_team:teams!matches_home_team_id_fkey(name, short_code),
        away_team:teams!matches_away_team_id_fkey(name, short_code),
        competition:competitions!matches_competition_id_fkey(name, name_ja, season)
      `,
    )
    .eq("competition_id", competitionId)
    .eq("status", "finished")
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .order("kickoff_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as RoundScoreboardMatchRow[]).filter(
    (match) => getRoundFromExternalIds(match.external_ids) === round,
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const interFont = await fetch(
    "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2",
  ).then((res) => res.arrayBuffer());
  const fontSignature = new TextDecoder("ascii").decode(
    new Uint8Array(interFont).slice(0, 4),
  );
  const fontData =
    fontSignature === "wOF2"
      ? await fetch(new URL("/og-font.ttf", request.url)).then((res) =>
          res.arrayBuffer(),
        )
      : interFont;
  const fontName = fontSignature === "wOF2" ? "Geist" : "Inter";
  let bgDataUri: string | null = null;

  try {
    const bgResponse = await fetch(new URL("/og-bg.png", request.url));

    if (!bgResponse.ok) {
      throw new Error("OG background image is unavailable.");
    }

    const bgBuffer = await bgResponse.arrayBuffer();
    bgDataUri = `data:image/png;base64,${Buffer.from(bgBuffer).toString(
      "base64",
    )}`;
  } catch {
    bgDataUri = null;
  }

  if (searchParams.get("type") === "story") {
    const item = parseStoryItemType(searchParams.get("item"));
    const textMode = parseStoryTextMode(searchParams.get("text"));
    const orientation =
      searchParams.get("orientation") === "landscape"
        ? "landscape"
        : "portrait";
    const match = item
      ? await loadStoryOgMatch(searchParams.get("match"))
      : null;

    return match && item
      ? storyImage(match, item, fontData, fontName, orientation, textMode)
      : storyFallbackImage(fontData, fontName, orientation);
  }

  if (searchParams.get("type") === "competition") {
    const familyName = truncate(searchParams.get("family_name") ?? "Rugby", 42);
    const seasonLabel = truncate(searchParams.get("season") ?? "", 16);
    const accentColor = sanitizeAccentColor(searchParams.get("accent"));

    return new ImageResponse(
      <div
        style={{
          alignItems: "center",
          background: `linear-gradient(135deg, #111827 0%, ${accentColor} 145%)`,
          color: "white",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Inter, Geist, sans-serif",
          height: "630px",
          justifyContent: "center",
          overflow: "hidden",
          padding: "64px 80px",
          position: "relative",
          width: "1200px",
        }}
      >
        <div
          style={{
            background:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.18), transparent 34%), radial-gradient(circle at 80% 0%, rgba(255,255,255,0.12), transparent 30%)",
            display: "flex",
            inset: 0,
            position: "absolute",
          }}
        />
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: "9999px",
            color: "rgba(255,255,255,0.74)",
            display: "flex",
            fontSize: "24px",
            fontWeight: 800,
            letterSpacing: "0.14em",
            padding: "10px 22px",
            position: "absolute",
            right: 72,
            top: 58,
          }}
        >
          TRYLINE
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            maxWidth: "980px",
            position: "relative",
            textAlign: "center",
          }}
        >
          <div
            style={{
              color: "white",
              display: "flex",
              fontSize: familyName.length > 28 ? "64px" : "76px",
              fontWeight: 800,
              justifyContent: "center",
              lineHeight: 1.05,
              textAlign: "center",
            }}
          >
            {familyName}
          </div>
          {seasonLabel && (
            <div
              style={{
                color: "rgba(255,255,255,0.72)",
                display: "flex",
                fontSize: "38px",
                fontWeight: 700,
                justifyContent: "center",
                marginTop: "20px",
              }}
            >
              {seasonLabel}
            </div>
          )}
        </div>
        <div
          style={{
            bottom: 52,
            color: "rgba(255,255,255,0.54)",
            display: "flex",
            fontSize: "24px",
            fontWeight: 700,
            position: "absolute",
          }}
        >
          trylinerugby.com
        </div>
      </div>,
      {
        fonts: [
          {
            data: fontData,
            name: fontName,
            style: "normal",
            weight: 700,
          },
        ],
        height: 630,
        width: 1200,
      },
    );
  }

  if (searchParams.get("type") === "calendar") {
    const weekLabel = truncate(searchParams.get("week_label") ?? "JST", 30);
    const matchCount = parseNonNegativeCount(searchParams.get("match_count"));
    const competitionCount = parseNonNegativeCount(
      searchParams.get("competition_count"),
    );
    const focusHome = searchParams.get("focus_home");
    const focusAway = searchParams.get("focus_away");
    const focusCompetition = searchParams.get("focus_competition");
    const hasFocus = Boolean(focusHome && focusAway);
    const focusLabel = hasFocus
      ? `${truncate(focusHome!, 20)} vs ${truncate(focusAway!, 20)}`
      : "";
    const focusCompetitionLabel = focusCompetition
      ? truncate(focusCompetition, 30)
      : "";
    const focusKickoffLabel = hasFocus
      ? formatCalendarFocusKickoff(searchParams.get("focus_kickoff"))
      : null;

    return new ImageResponse(
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(135deg, #111827 0%, #1A3A5C 145%)",
          color: "white",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Inter, Geist, sans-serif",
          height: "630px",
          justifyContent: "center",
          overflow: "hidden",
          padding: "64px 80px",
          position: "relative",
          width: "1200px",
        }}
      >
        <div
          style={{
            background:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.18), transparent 34%), radial-gradient(circle at 80% 0%, rgba(34,197,94,0.2), transparent 30%)",
            display: "flex",
            inset: 0,
            position: "absolute",
          }}
        />
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: "9999px",
            color: "rgba(255,255,255,0.74)",
            display: "flex",
            fontSize: "24px",
            fontWeight: 800,
            letterSpacing: "0.14em",
            padding: "10px 22px",
            position: "absolute",
            right: 72,
            top: 58,
          }}
        >
          TRYLINE
        </div>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            maxWidth: "980px",
            position: "relative",
            textAlign: "center",
          }}
        >
          <div
            style={{
              color: "rgba(255,255,255,0.72)",
              display: "flex",
              fontSize: "34px",
              fontWeight: 800,
              justifyContent: "center",
              letterSpacing: "0.08em",
              marginBottom: "22px",
              textTransform: "uppercase",
            }}
          >
            Weekly Match Calendar
          </div>
          <div
            style={{
              color: "white",
              display: "flex",
              fontSize: "72px",
              fontWeight: 900,
              justifyContent: "center",
              lineHeight: 1.05,
              textAlign: "center",
            }}
          >
            今週の海外ラグビー
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.7)",
              display: "flex",
              fontSize: "34px",
              fontWeight: 800,
              justifyContent: "center",
              marginTop: "18px",
            }}
          >
            {weekLabel}
          </div>
          <div
            style={{
              color: "#c93a40",
              display: "flex",
              fontSize: "62px",
              fontWeight: 900,
              justifyContent: "center",
              lineHeight: 1.05,
              marginTop: "42px",
            }}
          >
            {competitionCount}大会 {matchCount}試合
          </div>
          {hasFocus && (
            <div
              style={{
                alignItems: "center",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.16)",
                borderRadius: "9999px",
                color: "rgba(255,255,255,0.76)",
                display: "flex",
                fontSize: "26px",
                fontWeight: 750,
                justifyContent: "center",
                marginTop: "30px",
                maxWidth: "920px",
                padding: "14px 24px",
                textAlign: "center",
              }}
            >
              注目: {focusLabel}
              {focusKickoffLabel ? ` — ${focusKickoffLabel}` : ""}
              {focusCompetitionLabel ? `（${focusCompetitionLabel}）` : ""}
            </div>
          )}
        </div>
        <div
          style={{
            bottom: 52,
            color: "rgba(255,255,255,0.54)",
            display: "flex",
            fontSize: "24px",
            fontWeight: 700,
            position: "absolute",
          }}
        >
          trylinerugby.com
        </div>
      </div>,
      {
        fonts: [
          {
            data: fontData,
            name: fontName,
            style: "normal",
            weight: 700,
          },
        ],
        height: 630,
        width: 1200,
      },
    );
  }

  if (searchParams.get("type") === "round-scoreboard") {
    const competitionId = searchParams.get("competition_id");
    const round = parseRound(searchParams.get("round"));
    const matches =
      competitionId && round !== null
        ? await loadRoundScoreboardMatches(competitionId, round)
        : [];
    const competitionLabel =
      matches[0]?.competition !== null && matches[0]?.competition !== undefined
        ? formatCompetitionTitle(
            {
              name: matches[0].competition.name,
              nameJa: matches[0].competition.name_ja,
            },
            matches[0].competition.season,
          )
        : truncate(searchParams.get("competition") ?? "Round Scoreboard", 42);
    const roundLabel = round !== null ? `Round ${round}` : "Round";
    const compactRows = matches.length >= 8;
    const rowHeight = compactRows ? 42 : 54;
    const rowGap = compactRows ? 8 : 12;
    const teamFontSize = compactRows ? "24px" : "30px";
    const scoreFontSize = compactRows ? "28px" : "34px";

    return new ImageResponse(
      <div
        style={{
          background: "linear-gradient(135deg, #06111f 0%, #0f172a 100%)",
          color: "white",
          display: "flex",
          fontFamily: "Inter, Geist, sans-serif",
          height: "630px",
          overflow: "hidden",
          padding: "52px 64px",
          position: "relative",
          width: "1200px",
        }}
      >
        {bgDataUri && (
          // eslint-disable-next-line @next/next/no-img-element -- @vercel/og renders plain img elements in ImageResponse.
          <img
            alt=""
            src={bgDataUri}
            style={{
              display: "flex",
              height: "100%",
              inset: 0,
              objectFit: "cover",
              opacity: 0.32,
              position: "absolute",
              width: "100%",
            }}
          />
        )}
        <div
          style={{
            background:
              "linear-gradient(180deg, rgba(6,17,31,0.72) 0%, rgba(6,17,31,0.94) 100%)",
            display: "flex",
            inset: 0,
            position: "absolute",
          }}
        />
        <div
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
            position: "relative",
            width: "100%",
            zIndex: 2,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div
              style={{
                color: "#f8fafc",
                display: "flex",
                fontSize: "34px",
                fontWeight: 800,
                lineHeight: 1.1,
              }}
            >
              {truncate(competitionLabel, 38)}
            </div>
            <div
              style={{
                color: "#94a3b8",
                display: "flex",
                fontSize: "22px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {roundLabel} results
            </div>
          </div>
          <div
            style={{
              color: "#f8fafc",
              display: "flex",
              fontSize: "28px",
              fontWeight: 800,
              letterSpacing: "0.08em",
            }}
          >
            TRYLINE
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: `${rowGap}px`,
            left: 64,
            position: "absolute",
            right: 64,
            top: 152,
            zIndex: 2,
          }}
        >
          {matches.length === 0 ? (
            <div
              style={{
                alignItems: "center",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.16)",
                borderRadius: "22px",
                color: "#cbd5e1",
                display: "flex",
                fontSize: "34px",
                fontWeight: 800,
                height: "220px",
                justifyContent: "center",
                textAlign: "center",
              }}
            >
              No finished matches yet
            </div>
          ) : (
            matches.map((match) => {
              const homeScore = match.home_score ?? 0;
              const awayScore = match.away_score ?? 0;
              const homeWon = homeScore > awayScore;
              const awayWon = awayScore > homeScore;

              return (
                <div
                  key={match.id}
                  style={{
                    alignItems: "center",
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: "18px",
                    display: "flex",
                    height: `${rowHeight}px`,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      background: homeWon ? "#22c55e" : "transparent",
                      display: "flex",
                      height: "100%",
                      width: "7px",
                    }}
                  />
                  <div
                    style={{
                      color: homeWon ? "#f8fafc" : "#cbd5e1",
                      display: "flex",
                      flex: 1,
                      fontSize: teamFontSize,
                      fontWeight: homeWon ? 900 : 700,
                      lineHeight: 1,
                      paddingLeft: "22px",
                    }}
                  >
                    {truncate(match.home_team?.name ?? "Home", 26)}
                  </div>
                  <div
                    style={{
                      color: "#22c55e",
                      display: "flex",
                      fontSize: scoreFontSize,
                      fontWeight: 900,
                      justifyContent: "center",
                      minWidth: "156px",
                      textAlign: "center",
                    }}
                  >
                    {homeScore} — {awayScore}
                  </div>
                  <div
                    style={{
                      color: awayWon ? "#f8fafc" : "#cbd5e1",
                      display: "flex",
                      flex: 1,
                      fontSize: teamFontSize,
                      fontWeight: awayWon ? 900 : 700,
                      justifyContent: "flex-end",
                      lineHeight: 1,
                      paddingRight: "22px",
                      textAlign: "right",
                    }}
                  >
                    {truncate(match.away_team?.name ?? "Away", 26)}
                  </div>
                  <div
                    style={{
                      background: awayWon ? "#22c55e" : "transparent",
                      display: "flex",
                      height: "100%",
                      width: "7px",
                    }}
                  />
                </div>
              );
            })
          )}
        </div>

        <div
          style={{
            bottom: 36,
            color: "#94a3b8",
            display: "flex",
            fontSize: "20px",
            fontWeight: 700,
            position: "absolute",
            right: 64,
            zIndex: 2,
          }}
        >
          trylinerugby.com
        </div>
      </div>,
      {
        fonts: [
          {
            data: fontData,
            name: fontName,
            style: "normal",
            weight: 700,
          },
        ],
        height: 630,
        width: 1200,
      },
    );
  }

  const home = truncate(searchParams.get("home") ?? "Home", 20);
  const away = truncate(searchParams.get("away") ?? "Away", 20);
  const homeScore = searchParams.get("hs");
  const awayScore = searchParams.get("as");
  const score = searchParams.get("score") ?? "";
  const competition = truncate(
    searchParams.get("comp") ?? searchParams.get("competition") ?? "Rugby",
    42,
  );
  const status = searchParams.get("status") ?? "upcoming";

  if (searchParams.get("type") === "result") {
    const resultScore =
      homeScore !== null && awayScore !== null
        ? `${homeScore} — ${awayScore}`
        : "vs";
    const homeFontSize = getResultTeamNameFontSize(home);
    const awayFontSize = getResultTeamNameFontSize(away);

    return new ImageResponse(
      <div
        style={{
          background: "linear-gradient(135deg, #06111f 0%, #0f172a 100%)",
          color: "white",
          display: "flex",
          fontFamily: "Inter, Geist, sans-serif",
          height: "675px",
          overflow: "hidden",
          padding: "56px 64px",
          position: "relative",
          width: "1200px",
        }}
      >
        {bgDataUri && (
          // eslint-disable-next-line @next/next/no-img-element -- @vercel/og renders plain img elements in ImageResponse.
          <img
            alt=""
            src={bgDataUri}
            style={{
              display: "flex",
              height: "100%",
              inset: 0,
              objectFit: "cover",
              opacity: 0.38,
              position: "absolute",
              width: "100%",
            }}
          />
        )}
        <div
          style={{
            background:
              "linear-gradient(180deg, rgba(6,17,31,0.72) 0%, rgba(6,17,31,0.92) 100%)",
            display: "flex",
            inset: 0,
            position: "absolute",
          }}
        />
        <div
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
            position: "relative",
            width: "100%",
            zIndex: 2,
          }}
        >
          <div
            style={{
              color: "#f8fafc",
              display: "flex",
              fontSize: "28px",
              fontWeight: 800,
              letterSpacing: "0.08em",
            }}
          >
            TRYLINE
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: "9999px",
              color: "#cbd5e1",
              display: "flex",
              fontSize: "22px",
              fontWeight: 700,
              padding: "10px 18px",
            }}
          >
            {competition}
          </div>
        </div>

        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: "32px",
            inset: "0 72px",
            justifyContent: "center",
            position: "absolute",
            zIndex: 2,
          }}
        >
          <div
            style={{
              display: "flex",
              flex: 1,
              fontSize: `${homeFontSize}px`,
              fontWeight: 800,
              justifyContent: "flex-end",
              lineHeight: 1.05,
              textAlign: "right",
            }}
          >
            {home}
          </div>
          <div
            style={{
              color:
                homeScore !== null && awayScore !== null
                  ? "#22c55e"
                  : "#94a3b8",
              display: "flex",
              fontSize: "58px",
              fontWeight: 800,
              justifyContent: "center",
              minWidth: "240px",
              textAlign: "center",
            }}
          >
            {resultScore}
          </div>
          <div
            style={{
              display: "flex",
              flex: 1,
              fontSize: `${awayFontSize}px`,
              fontWeight: 800,
              justifyContent: "flex-start",
              lineHeight: 1.05,
            }}
          >
            {away}
          </div>
        </div>

        <div
          style={{
            bottom: 44,
            color: "#94a3b8",
            display: "flex",
            fontSize: "20px",
            fontWeight: 700,
            position: "absolute",
            right: 64,
            zIndex: 2,
          }}
        >
          trylinerugby.com
        </div>
      </div>,
      {
        fonts: [
          {
            data: fontData,
            name: fontName,
            style: "normal",
            weight: 700,
          },
        ],
        height: 675,
        width: 1200,
      },
    );
  }

  return new ImageResponse(
    <div
      style={{
        background: "linear-gradient(180deg, #0B1628 0%, #0f172a 100%)",
        color: "white",
        display: "flex",
        fontFamily: "Inter, Geist, sans-serif",
        height: "630px",
        overflow: "hidden",
        padding: "56px 64px 48px 70px",
        position: "relative",
        width: "1200px",
      }}
    >
      {bgDataUri && (
        // eslint-disable-next-line @next/next/no-img-element -- @vercel/og renders plain img elements in ImageResponse.
        <img
          alt=""
          src={bgDataUri}
          style={{
            display: "flex",
            height: "100%",
            inset: 0,
            objectFit: "cover",
            position: "absolute",
            width: "100%",
          }}
        />
      )}
      <div
        style={{
          background: "rgba(11, 22, 40, 0.72)",
          display: "flex",
          inset: 0,
          position: "absolute",
        }}
      />
      <div
        style={{
          background: "#22c55e",
          bottom: 0,
          display: "flex",
          left: 0,
          position: "absolute",
          top: 0,
          width: "6px",
          zIndex: 2,
        }}
      />

      <div
        style={{
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          left: 70,
          position: "absolute",
          right: 64,
          top: 54,
          zIndex: 2,
        }}
      >
        <div
          style={{
            background: "rgba(148, 163, 184, 0.14)",
            border: "1px solid rgba(148, 163, 184, 0.22)",
            borderRadius: "9999px",
            color: "#cbd5e1",
            display: "flex",
            fontSize: "22px",
            fontWeight: 700,
            padding: "10px 18px",
          }}
        >
          {competition}
        </div>
        <div style={{ color: "#e2e8f0", fontSize: "24px", fontWeight: 700 }}>
          Tryline
        </div>
      </div>

      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          gap: "30px",
          height: "100%",
          justifyContent: "center",
          position: "relative",
          width: "100%",
          zIndex: 2,
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            fontSize: "64px",
            fontWeight: 700,
            gap: "36px",
            justifyContent: "center",
            lineHeight: 1.05,
            maxWidth: "1060px",
          }}
        >
          <span
            style={{
              display: "flex",
              justifyContent: "flex-end",
              minWidth: "360px",
              textAlign: "right",
            }}
          >
            {home}
          </span>
          {score ? (
            <span
              style={{
                color: "#22c55e",
                display: "flex",
                fontSize: "58px",
                fontWeight: 700,
                justifyContent: "center",
                minWidth: "190px",
                textAlign: "center",
              }}
            >
              {score}
            </span>
          ) : (
            <span
              style={{
                color: "#64748b",
                display: "flex",
                fontSize: "40px",
                justifyContent: "center",
                minWidth: "120px",
              }}
            >
              vs
            </span>
          )}
          <span
            style={{
              display: "flex",
              justifyContent: "flex-start",
              minWidth: "360px",
            }}
          >
            {away}
          </span>
        </div>

        {status === "live" && (
          <div
            style={{
              background: "#dc2626",
              borderRadius: "9999px",
              color: "white",
              fontSize: "16px",
              fontWeight: 700,
              padding: "6px 16px",
            }}
          >
            LIVE
          </div>
        )}
      </div>

      <div
        style={{
          bottom: 44,
          color: "#64748b",
          display: "flex",
          fontSize: "20px",
          fontWeight: 700,
          position: "absolute",
          right: 64,
          zIndex: 2,
        }}
      >
        trylinerugby.com
      </div>
    </div>,
    {
      fonts: [
        {
          data: fontData,
          name: fontName,
          style: "normal",
          weight: 700,
        },
      ],
      height: 630,
      width: 1200,
    },
  );
}
