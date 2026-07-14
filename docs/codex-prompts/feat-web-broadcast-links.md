# Codex プロンプト: feat-web-broadcast-links

tryline リポジトリで貼る。

---

`/specs/feat-web-broadcast-links.md` の仕様を実装してください。

コンテキスト:
- `AGENTS.md` を読む
- 表示対象は 2 ページのみ: `app/matches/[id]/page.tsx` と `app/calendar/page.tsx`
- データ取得は既存の再利用を優先: 対象ページのクエリが `broadcast_jp_url` を select していなければ、select 追加 or `lib/api/v1/server.ts` の `getBroadcastUrlsForMatches` の再利用を検討
- スタイルは `app/globals.css` の既存トークンと、試合詳細ページの既存リンク・ボタンの見た目に揃える

エッジケース:
- `broadcast_jp_url` が null → 何も描画しない（プレースホルダ禁止。現状データ 0 件のため、全試合が null でもレイアウトが崩れないこと）
- 不正な URL 文字列が入っていても Next.js のビルド・レンダリングが落ちない（そのまま href に出す。バリデーションは投入側の責務）
- 終了済み試合でも表示する（アーカイブ視聴 URL を想定）

完了の定義:
- 受け入れ条件 1〜5 のテスト、`pnpm test`・`pnpm build` pass
- 受け入れ条件 6 用に、ローカルでテストデータ 1 件を入れた試合詳細・カレンダー（モバイル幅）のスクリーンショットを PR に添付（テストデータの入れ方も PR 説明に記載）

---

## 委譲後の流れ（Owner 向けメモ）

1. Codex に貼る → PR → `codex-review`（スクリーンショット目視含む）→ マージ → デプロイ確認（DB 変更なし）
2. マージ後、7/18 日本×フランス等の重要試合から `broadcast_jp_url` の手動投入を開始（投入運用は別途 /today に組み込み）
