# Codex プロンプト: feat-match-broadcasts

2 部構成。**A と B は並行実装可**（Owner 判断 2026-07-15。B は API 契約を仕様書の定義から自前実装し、A マージ後に型同期を確認する）。金曜 7/18 に必達なのは A の本番反映まで。

---

## プロンプト A（tryline リポジトリで貼る）

`/specs/feat-match-broadcasts.md` の「tryline 側」を実装してください: `match_broadcasts` テーブル、投入スクリプト、試合詳細「視聴方法」セクション、カレンダーのサイト内リンク化、BFF 拡張。

コンテキスト:
- `AGENTS.md` を読む
- **PR #576（単一 URL 表示）の置き換え**です。`components/match-header.tsx` の「視聴する」ボタンと `components/calendar/week-schedule.tsx` の外部リンクを本 spec の UI に差し替える（PR #576 のテストも新仕様に合わせて更新）
- 投入スクリプトの service role 接続・実行規約は `tools/` の既存スクリプトのパターンに従う
- RLS/grant テストは `tests/db/ios-push-rls.test.ts`、BFF テストは `tests/api/mobile-api-v1-*.test.ts` を参照
- BFF は**フィールド追加のみ**（`lib/api/v1/types.ts` の既存型を変更しない。`broadcasts` / `has_broadcasts` を追加）

エッジケース:
- 同一試合に同名サービスを再投入 → upsert で URL・kind・verified_at が更新される（行は増えない）
- 投入 JSON の kind が不正値 → スクリプトがバリデーションで弾く（DB エラー前に）
- broadcasts 0 件の試合 → Web/BFF とも従来と同じレスポンス形（`broadcasts: []` / `has_broadcasts: false`）
- カレンダーのアンカーリンク `#broadcasts` は broadcasts が 1 件以上の試合のみ
- `broadcast_jp_url` に値がある試合（現在 0 件だが将来含む）は Web UI では無視（新テーブルが唯一のソース）

完了の定義: 受け入れ条件 1〜6 のテスト、`pnpm test`・`pnpm build` pass。**マイグレーション適用とデータ投入は Owner が行う**。仕様書と実環境の食い違いは停止して Owner に確認。

---

## プロンプト B（tryline-mobile リポジトリで貼る。A と並行可）

`docs/specs/feat-match-broadcasts.md`（このリポジトリにコピー設置済み）の「tryline-mobile 側」を実装してください。サーバー側は並行実装中のため、**型は仕様書の定義どおり `src/api/types.ts` に自前で追加**し、テストはモックデータで完結させます。

コンテキスト:
- `AGENTS.md` を読む
- `src/api/types.ts` への型追加は仕様書の定義に従う（A マージ後の型同期確認はレビュー側の作業）
- 表示は `src/matches/MatchDetailScreen.tsx` の既存「視聴する」ボタン部分を置換。スタイルは `src/theme/tokens.ts`

エッジケース:
- `broadcasts` 非空 → リスト表示。空＋`broadcast_jp_url` 非 null → 旧ボタン fallback。両方なし → 非表示
- 古いサーバーレスポンス（`broadcasts` フィールド自体が無い）でもクラッシュしない（undefined を空配列扱い）

完了の定義: 受け入れ条件 8〜10 のテスト、CI green、視聴方法リストのシミュレータスクリーンショットを PR に添付（モック data で可）。

---

## 委譲後の流れ（Owner 向けメモ）

1. プロンプト A → PR → `codex-review` → マージ → `supabase db push --linked` → デプロイ確認
2. 日本×フランスの投入 JSON は Claude Code が用意済み（レビュー完了時に受け渡し）。`node --env-file=.env.production.local tools/run-ts.cjs tools/upsert-match-broadcasts.ts <json>` で投入 → 本番目視（受け入れ条件 7）
3. プロンプト B はアプリ未公開のため急がない（来週で可）
