# カレンダーページ（/calendar）の OG 画像を生成する

## 背景

2026-07-14、X 固定ポストのリンク先を検討する過程で、`/calendar`（今週の試合カレンダー）に OG 画像が存在しないことが判明した。`app/calendar/page.tsx:63-70` の `generateMetadata` には `openGraph` フィールド自体がなく、ルート共通の `app/layout.tsx:47-51` の `openGraph` にも `images` の指定がない。サイト全体で見ても `app/` 配下に `opengraph-image.tsx` / `opengraph-image.png` は存在しない。

結果として、X・note で `/calendar` のリンクをシェアしても画像なしのカードになる。カレンダーは X 固定ポスト・note 記事末尾の固定 CTA・週次配信など、`docs/decisions.md` D013（note運用方針v1）や `docs/x-reply-strategy.md` の確定文案で継続的にリンクされる導線のハブとして位置づけられており、画像付きシェアにする価値が高い。

既存の動的 OG 画像生成基盤（`app/api/og/route.tsx`、`@vercel/og` の `ImageResponse`、edge runtime）は `type=result`（試合結果）・`type=competition`（大会）・`type=round-scoreboard`（ラウンド全結果）の3種類が本番稼働済み。本 spec はこの基盤に `type=calendar` を追加する（`specs/feat-competition-og-images.md`・`specs/feat-round-scoreboard-og-image.md` と同じ拡張パターン）。

## スコープ

対象:
- `app/api/og/route.tsx` に `type=calendar` の分岐を追加し、週の日付レンジ・試合数・大会数・注目試合（あれば）を使った OG 画像を生成する
- `lib/seo/og-image.ts` に `createCalendarOgImage` ヘルパを追加
- `app/calendar/page.tsx` の `generateMetadata` に `openGraph.images` を追加し、このヘルパ経由の動的画像を設定する

対象外:
- その週の全試合を1枚にリストする「ラウンド全結果」型のレイアウト（`type=round-scoreboard` と同じ列挙スタイル）。カレンダーは複数大会・週20試合以上になり得るため、本 spec では**サマリーカード**（週の日付レンジ・試合数・大会数・注目試合の見出しのみ）とする。全試合列挙が必要になった場合は別 spec で検討する
- ホームページ・料金ページ等、カレンダーに紐付かないページの OG 画像
- `week` クエリパラメータ（過去/未来の週）以外の `/calendar` の挙動変更
- `match_events` 由来の統計（トライ数等）を画像に含めること

## データモデル変更

なし。

## API サーフェス

### `app/api/og/route.tsx` に `type=calendar` 分岐を追加

既存の `type=competition` ブロック（132〜243行目）と同様に、専用の分岐を追加する。この分岐は `round-scoreboard` のように自前で DB クエリを行わず、**呼び出し元（`generateMetadata`）が計算済みの値をクエリパラメータとして渡す**方式にする（`type=result`・`type=competition` と同じ設計。理由: カレンダーページの `generateMetadata` は既に週レンジ・試合一覧を計算する構造になっており、OG 画像側で二重にクエリを組み立てる必要がない）。

クエリパラメータ:
- `week_label`（必須）: `formatJstWeekRangeLabel` の出力（例: `7月14日 - 20日 JST`）
- `match_count`（必須）: その週の試合数
- `competition_count`（必須）: その週に試合がある大会数
- `focus_home` / `focus_away`（任意）: 注目試合のホーム/アウェイチーム名。`selectCalendarFocusMatchId` が試合を返さない週（該当週の試合が0件等）では省略される
- `focus_competition`（任意）: 注目試合の大会名（`formatCompetitionTitle` 等、既存のフォーマッタで整形済みの文字列）

デザイン方針:
- `type=competition` の中央寄せカード構成（グラデーション背景・中央にタイトル・右上に `TRYLINE` バッジ・下部に `trylinerugby.com`）をベーススタイルとして流用する
- 見出しは「今週の海外ラグビー」固定文言＋ `week_label`
- サブラインに `{competition_count}大会 {match_count}試合`
- `focus_home`/`focus_away` が両方揃っている場合のみ、下部に「注目: {focus_home} vs {focus_away}」（`focus_competition` があれば併記）を表示。無い場合はこの行を出さない
- 既存の `truncate` 関数・`sanitizeAccentColor` 相当の入力サニタイズ（チーム名・大会名の文字数上限）を適用し、極端に長い文字列で崩れないようにする
- 既存の `interFont`/`fontData`/`fontName`/`bgDataUri` 取得ロジック（ファイル冒頭、行1-130付近）は共通で使い回す

### `lib/seo/og-image.ts` に `createCalendarOgImage` を追加

`createCompetitionOgImage`（`lib/seo/og-image.ts:38-54`）と同じ形で以下を追加する:

```ts
type CalendarOgImageParams = {
  competitionCount: number;
  focusAway?: string;
  focusCompetition?: string;
  focusHome?: string;
  matchCount: number;
  weekLabel: string;
};

export function createCalendarOgImage(params: CalendarOgImageParams) {
  const searchParams = new URLSearchParams({
    type: "calendar",
    week_label: params.weekLabel,
    match_count: String(params.matchCount),
    competition_count: String(params.competitionCount),
  });

  if (params.focusHome && params.focusAway) {
    searchParams.set("focus_home", params.focusHome);
    searchParams.set("focus_away", params.focusAway);

    if (params.focusCompetition) {
      searchParams.set("focus_competition", params.focusCompetition);
    }
  }

  return {
    height: 630,
    url: `/api/og?${searchParams.toString()}`,
    width: 1200,
  };
}
```

## UI サーフェス

### `app/calendar/page.tsx`

`generateMetadata`（57-70行目）に、既存の週レンジ計算・試合取得ロジックを使って `openGraph.images` を追加する。現在 `generateMetadata` は `getMatchesInRange` を呼んでいないため、`app/matches/[id]/page.tsx` の `generateMetadata` が独自に `getMatchById` を呼ぶ既存パターン（データ取得をページ本体と `generateMetadata` の双方で行う。重複フェッチは許容されている既存の設計）に倣い、`generateMetadata` 内で以下を行う:

1. `getWeekParam` → `getJstWeekRangeUtc` / `getCurrentJstWeekRangeUtc` で range を計算（78-80行目と同じロジック）
2. `getMatchesInRange(range.startUtcIso, range.endUtcIso)` で試合を取得
3. 大会数は `matches` の `competition.id`（または `slug`）のユニーク数
4. 注目試合は `selectCalendarFocusMatchId`（`lib/format/calendar-focus.ts`）で決定。この関数は `standingPositions`（`getStandingPositionLookupForCompetitions`）を引数に取るため、`generateMetadata` 側でも同様に計算する（85-91行目のページ本体と同じ手順）
5. `createCalendarOgImage({ weekLabel: formatJstWeekRangeLabel(range.weekStartJst), matchCount: matches.length, competitionCount: <ユニーク数>, focusHome, focusAway, focusCompetition })` を `openGraph.images` に設定

`week` クエリパラメータ付き（`hasWeekParam`、`robots: { index: false }` のケース）でも OG 画像自体は生成してよい（noindex でも SNS シェア時の見た目は必要なため）。

## LLM 連携

なし。

## 受け入れ条件

1. `/calendar` の OG 画像 URL（`<meta property="og:image">`）が `/api/og?type=calendar&...` を含む動的画像になっている
2. `/calendar?week=<過去の週の日付>` でも、その週の試合数・大会数を反映した OG 画像になる（現在の週と異なる URL になる）
3. `/api/og?type=calendar&week_label=7月14日%20-%2020日%20JST&match_count=12&competition_count=5&focus_home=Japan&focus_away=France&focus_competition=Nations%20Championship` に直接アクセスすると、1200x630 の画像が返る（ステータス200）
4. `focus_home`/`focus_away` を省略した場合（該当週に試合が0件、または注目試合を特定できない場合）、注目試合の行を表示せずにエラーなく画像が返る
5. `match_count=0` の週（試合が1件もない週）でもエラーにならない
6. 既存の `type=result` / `type=competition` / `type=round-scoreboard` の動作に変更がない
7. チーム名・大会名が極端に長い場合、`truncate` 等で省略され、画像内のレイアウトが崩れない
8. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` が通る
9. 実際に生成された OG 画像（試合が複数ある通常の週、試合0件の週、注目試合がある週の3パターン）をスクリーンショットで提示し、テキストが画像内に収まり読みやすいことを確認する

## 設計判断（2026-07-14、Owner 確認済み）

注目試合（`selectCalendarFocusMatchId`、日本戦最優先ロジック）の扱いは、大会横断ハブとしての中立性と、X運用方針（`docs/decisions.md` D012「重心は日本代表週」）の両立で決着した。

- **見出し（主役）**: 「◯大会◯試合」を大きく表示し、大会横断ハブとしての網羅性を主張する。中立性はここで担保する
- **注目試合の行（脇役）**: 日本戦がある週のみ、小さめの補足行として「注目: {focus_home} vs {focus_away}」を表示する。日本戦が無い週はこの行を出さない（本 spec の元設計どおり）
- 見出しの文字サイズ・重み ＞ 注目試合の行の文字サイズ・重み、という視覚的な優先順位を必ず守ること。注目試合の行が見出しより目立ってはならない

## 未解決の質問

- `generateMetadata` と page 本体の双方で `getMatchesInRange` を呼ぶ重複フェッチについて、React `cache()` 等でのメモ化は本 spec のスコープ外とした（既存の `app/matches/[id]/page.tsx` も同様の重複フェッチを許容しているため）。パフォーマンス上の懸念が顕在化した場合は別 spec でメモ化を検討する
