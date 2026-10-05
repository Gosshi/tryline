# Codex 指示書: アプリ向け API でチームの色を返す

仕様書: `specs/feat-team-colors-api.md`（受け入れ条件は仕様書を正とする）

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。**

## やること
- `lib/format/team-identity.ts` に `getTeamColorOrNull(slug)` を足す（色が無ければ `null`。今の `getTeamColor` は変えない）。
- 仕様書の「未解決の質問 1」の 3 チーム（香港・ジンバブエ・ホンダヒート）を `TEAM_IDENTITY` に足す。`us-montauban` は足さない。
- `lib/api/v1/types.ts` の `V1TeamSummary` に `color: string | null`、`V1Standing` に `team_slug`・`team_color` を足し、`app/api/v1/` の各ルートで値を入れる（場所は仕様書の一覧。`rg -n "short_code:" app/api/v1` で漏れが無いか確かめる）。
- 仕様書の受け入れ条件 1〜4 のテストを足す。網羅のテストの fixture は仕様書の付録の 91 件をそのまま使う。

## 守ること
- Web の画面の見た目を変えない（`getTeamColor`・`getTeamStripe` の挙動は今のまま）。
- 今あるフィールドを消したり型を変えたりしない（今のアプリが読んでいる）。
- 旗を隠す処理（`suppressFlags`）に色を巻き込まない。

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて必ず実行し、結果を完了報告に含める。**
- 受け入れ条件 5（壊して落ちる）の出力と、7（プレビューの `/api/v1/calendar` の応答の一部）を PR 本文に貼る。PR を出したらマージを待つ。
