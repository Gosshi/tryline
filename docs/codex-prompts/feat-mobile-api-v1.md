# Codex プロンプト: feat-mobile-api-v1

Owner がそのまま Codex に貼るプロンプト。前提の `feat-premium-entitlement-refactor` は PR #571 でマージ・本番適用済み。

---

`/specs/feat-mobile-api-v1.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む（Codex 向けの規約ファイル。`CLAUDE.md` は Claude Code 向けなので参照しない）
- システム設計は `/docs/architecture.md`、過去の判断は `/docs/decisions.md`（特に D014）を読む
- 前提 spec `feat-premium-entitlement-refactor` は実装・本番適用済み。Premium 判定は `lib/auth/server.ts` の `isPremium()` / `isProfilePremium()` を必ず経由する
- 再利用するクエリは仕様書のエンドポイント表のとおり（`lib/db/queries/matches.ts`・`match-content.ts`・`competitions.ts`・`standings.ts` の既存エクスポート関数）。**新しい SQL やクエリ関数を書く前に既存関数で足りないか確認する**
- Premium ゲートの判定ロジックは `app/api/matches/[id]/recap-locked/route.ts` を参照実装とする

入出力の具体例:

1. `GET /api/v1/calendar?from=2026-07-13&to=2026-07-19`
   - 200: `{ "success": true, "data": { "matches": [...] }, "error": null }`、各要素に試合 ID・大会（slug/日本語名）・両チーム（slug/日本語名/スコア）・`kickoff_utc`（ISO 8601）・ステータス・`broadcast_jp_url`・`has_preview`/`has_recap`
   - `from=2026-01-01&to=2026-12-31`（31日超）→ 400: `{ "success": false, "data": null, "error": "..." }`
2. `GET /api/v1/matches/<uuid>/content`（匿名）
   - 200 だが locked 部分の Markdown 本文はボディに含まれず、`locked: true` フラグのみ

Codex が処理すべきエッジケース:
- Bearer トークンが不正・期限切れの場合: 公開エンドポイントは匿名として扱い、`/api/v1/me` 系は 401
- `from` > `to`、日付として不正な文字列 → 400
- 試合は存在するが preview/recap とも未公開 → `/content` は 200 で両方 null（404 にしない）
- pool 制大会（RWC 等）の順位表は `getPoolStandingsForCompetition` に分岐
- 順位表データが 0 件の大会 → 既存 Web ページの扱いに合わせる（仕様書の未解決の質問 2。決めたら PR 説明に明記）
- `PUT /api/v1/me/favorites` のボディが JSON でない / 配列要素に非文字列が混じる → 400

要件:
- 受け入れ条件セクションのすべてを実装する
- 「スコープ対象外」にある項目は実装しない（push 登録・AI チャット・IAP・CORS・既存ルートの変更はやらない）
- 受け入れ条件項目に対するテストを書く（`tests/api` の既存構成に倣う。特に受け入れ条件 4 の「locked 本文がボディに含まれない」は文字列検索で検証）
- レスポンス型は `lib/api/v1/types.ts` に集約し、route 実装はそこから import する
- キャッシュヘッダは仕様書どおり（公開 GET は `s-maxage`、`/me`・`/content` は `no-store`）
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、実装を進めずその場で停止して Owner に確認する（`AGENTS.md` の「実装を停止すべきケース」参照。実装し終えてから末尾で質問しない）

完了の定義:
- `app/api/v1/` 配下に仕様書の 7 エンドポイントが追加されている
- `getUserFromBearer(request)` が `lib/auth/` に追加され、既存の cookie ベース `getUser()` は無変更
- 受け入れ条件 1〜10 のテストが追加され、`pnpm test` と `pnpm build` が全て pass する
- 既存ルート・既存ページの diff がゼロ（受け入れ条件 10）
- 実装内容・変更ファイルの要約、仕様書からの逸脱（あれば理由）、未解決の質問を報告する

---

## 委譲後の流れ（Owner 向けメモ）

1. 上記を Codex に貼る
2. 実装が返ってきたら Claude Code の `codex-review` スキルでレビュー（Premium ゲートのサーバー側強制と locked 本文の非露出を重点確認）
3. マージ後、DB 変更はないためデプロイ確認のみ
4. 次はアプリ本体 spec（tryline-mobile 側、Expo 雛形生成から）を Claude Code が起票
