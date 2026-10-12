# Codex 指示書: ChatGPT の調査結果を、1回の貼り付けで全試合分入れる

仕様書: `specs/feat-ops-bulk-fact-paste.md`（受け入れ条件は仕様書を正とする）

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。** 仕様書と実際のコードが食い違っていたら、実装を進めずにその場で止めて報告する。

## やること
- `lib/env.ts` に `OPS_OWNER_USER_IDS` を足し、`lib/auth/ops.ts` に `requireOpsOwner()` を作る。未設定・空なら誰も通さない。
- `lib/ops/bulk-research-paste.ts` に `splitBulkResearchPaste` を作る。本文の読み取りは既存の `parseResearchPaste`（`lib/discord/research-paste.ts`）をそのまま使う。試合 ID の判定は `isUuid`（`lib/ids.ts`）を使う。
- `lib/sourced-facts/manual-entry.ts` に `saveManualResearchFacts` と `decideManualFactRegeneration` を作る。`app/api/discord/interactions/route.ts` の `processResearchFactEntry` から、**動きを変えずに**切り出す。Discord 側は、この2つを呼ぶ形に書き換える。
- API ルート3つ（`/api/ops/facts/preview`・`/save`・`/regenerate`）と、ページ `/ops/facts` を作る。
- `app/robots.ts` に `/ops` の disallow を足す。
- 受け入れ条件1〜6のテストを書く。読み取りの fixture は仕様書の背景にある実際の出力の形を使う。

## 守ること
- ページと3つの API ルートの**すべて**で、最初に `requireOpsOwner()` を呼ぶ。拒否するときは 404 にする（403 にしない）。`Origin` の確認も行う。
- `/save` では生成しない。生成は `/regenerate` で1試合ずつ行い、`/regenerate` はサーバー側で判定をやり直す。
- 出典 URL の確認は同時に4本まで。画面からの `/regenerate` の呼び出しは同時に3本まで。
- Discord の返信文言、`after()` での作り直し、既存の Discord のテストのアサーションは変えない。
- `decideManualFactRegeneration` は、この PR では `"regenerate"` か `"none"` だけを返す。`"generate"` は後続の spec で足す。
- 新しい依存パッケージを足さない。本番 DB には触らない。テストでは Supabase・`validateSourceUrl`・`generateMatchContent` をモックする。

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて実行し、結果を完了報告に含める。** ローカルの build が DB 接続で止まるときは、止まった場所を書く。
- PR 本文に貼るもの:
  - 受け入れ条件7：わざと壊したときにテストが落ちた出力を2つ（どちらの変更も戻す）
  - `pnpm build` のルート表のうち `/ops/facts` の行（`ƒ` であること）
  - 幅 1280px の確認画面のスクリーンショット1枚（fixture を貼った状態。テスト用の Owner ID でローカル起動してよい）
- 受け入れ条件8（本番での確認）は、マージ後に Owner と Claude が行う。
- PR を出したら、マージを待つ。

## 他の作業との関係
後続の `specs/fix-preview-hold-for-research.md` は、この PR の `decideManualFactRegeneration` を拡張する。**この PR のマージ後に着手する。**
