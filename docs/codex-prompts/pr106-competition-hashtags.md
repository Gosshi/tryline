# PR #106 — X投稿のハッシュタグを大会別に動的化

## 背景

現在 `buildTweetText` のハッシュタグは言語ごとに固定値:
- EN: `#LeagueOne #Rugby #JapanRugby`
- JA: `#ラグビー #Rugby`

Six Nations や Super Rugby の投稿でも `#LeagueOne` が付いてしまう（明らかに誤り）。
`competition.family` に基づいて大会別のハッシュタグに切り替える。

## スコープ

対象:
- `lib/x/post.ts` — `XPostParams` に `competitionFamily` を追加、ハッシュタグロジック更新
- `app/api/cron/notify-discord/route.ts` — `family` を SELECT に追加、呼び出し側を更新

対象外:
- 選手ハッシュタグのリプライ投稿は含めない（別 PR）
- Discord 通知部分の変更なし

---

## 変更仕様

### 1. `lib/x/post.ts` — `XPostParams` に `competitionFamily` を追加

```ts
// Before
export type XPostParams = {
  awayScore: number | null;
  awayTeamName: string;
  competitionLabel: string;
  contentType: "preview" | "recap";
  homeScore: number | null;
  homeTeamName: string;
  language: "ja" | "en";
  matchId: string;
  recapExcerpt: string;
};

// After
export type XPostParams = {
  awayScore: number | null;
  awayTeamName: string;
  competitionFamily: string | null;
  competitionLabel: string;
  contentType: "preview" | "recap";
  homeScore: number | null;
  homeTeamName: string;
  language: "ja" | "en";
  matchId: string;
  recapExcerpt: string;
};
```

### 2. `lib/x/post.ts` — ハッシュタグマッピング関数を追加

`buildTweetText` の外（ファイルスコープ）に追加する:

```ts
const HASHTAGS_BY_FAMILY: Record<string, { ja: string; en: string }> = {
  "league-one":          { ja: "#リーグワン #ラグビー",              en: "#LeagueOne #Rugby #JapanRugby" },
  "six-nations":         { ja: "#シックスネーションズ #ラグビー",     en: "#SixNations #Rugby" },
  "super-rugby":         { ja: "#スーパーラグビー #ラグビー",         en: "#SuperRugby #Rugby" },
  "premiership":         { ja: "#プレミアシップ #ラグビー",           en: "#GallagherPremiership #Rugby" },
  "urc":                 { ja: "#URC #ラグビー",                    en: "#URC #UnitedRugbyChampionship #Rugby" },
  "top-14":              { ja: "#トップ14 #ラグビー",                en: "#Top14 #Rugby" },
  "rugby-championship":  { ja: "#ラグビーチャンピオンシップ #ラグビー", en: "#RugbyChampionship #Rugby" },
  "rwc":                 { ja: "#RWC2027 #ラグビー",                en: "#RWC2027 #RugbyWorldCup #Rugby" },
};

const DEFAULT_HASHTAGS = { ja: "#ラグビー #Rugby", en: "#Rugby" };

function getHashtags(family: string | null, language: "ja" | "en"): string {
  const entry = family ? (HASHTAGS_BY_FAMILY[family] ?? DEFAULT_HASHTAGS) : DEFAULT_HASHTAGS;
  return entry[language];
}
```

### 3. `lib/x/post.ts` — `buildTweetText` でハッシュタグを動的化

`hashtagLine` の生成部分を置き換える:

```ts
// Before
const hashtagLine =
  params.language === "en"
    ? "#LeagueOne #Rugby #JapanRugby"
    : "#ラグビー #Rugby";

// After
const hashtagLine = getHashtags(params.competitionFamily, params.language);
```

### 4. `app/api/cron/notify-discord/route.ts` — `family` を SELECT に追加

`selectClause` の competition 部分に `family` を追加する:

```ts
// Before
competition:competitions!matches_competition_id_fkey ( name, season )

// After
competition:competitions!matches_competition_id_fkey ( name, season, family )
```

`CompetitionRow` 型（同ファイルのローカル型）にも `family: string | null` を追加する。

### 5. `app/api/cron/notify-discord/route.ts` — 呼び出し側を更新

`buildTweetText` の呼び出しに `competitionFamily` を追加する:

```ts
const draftTweet = buildTweetText({
  // ...既存フィールド...
  competitionFamily: competition?.family ?? null,
});
```

---

## 完了の定義

- [ ] Six Nations の EN 投稿に `#SixNations #Rugby` が付く（`#LeagueOne` は付かない）
- [ ] League One の JA 投稿に `#リーグワン #ラグビー` が付く
- [ ] `competitionFamily` が null の場合はデフォルト `#Rugby` / `#ラグビー #Rugby` にフォールバックする
- [ ] TypeScript エラーなし・`pnpm build` 通過
