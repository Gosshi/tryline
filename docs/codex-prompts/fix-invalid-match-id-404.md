# Codex 指示書: 形式が正しくない試合IDで 500 ではなく 404 を返す

仕様書: `specs/fix-invalid-match-id-404.md`（受け入れ条件は仕様書を正とする）

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。** 仕様書と実際のコードが食い違っていたら、実装を進めずにその場で止めて報告する。

## やること
- `lib/ids.ts` を新しく作り、`isUuid(value: string): boolean` を export する。形式だけを見る（`8-4-4-4-12` の16進数、大文字小文字は区別しない、バージョン桁の制限なし、trim しない）。
- 次の6か所で、`params` から `id` を取り出した直後、**DB や認証の処理より前に** `isUuid(id)` を確認する。
  - `app/matches/[id]/page.tsx`：`generateMetadata` は `{ title: "Match Not Found" }` を返し、ページ本体は `notFound()` を呼ぶ
  - `app/matches/[id]/en/page.tsx`：同じ
  - `app/api/v1/matches/[id]/route.ts`：`apiError("match not found", 404, PUBLIC_CACHE_CONTROL)` を返す
  - `app/api/v1/matches/[id]/content/route.ts`：同じ。`apiError` と `PUBLIC_CACHE_CONTROL` を import する
- 受け入れ条件1・2のテストを書く。`lib/ids.ts` の単体テストは新しく作る。各経路のテストは既存のファイル（`tests/api/mobile-api-v1-match-detail.test.ts`・`tests/api/mobile-api-v1-content.test.ts` など）に足す。試合ページ2つにテストファイルが無ければ新しく作る。

## 守ること
- 形式が正しい ID の挙動は1つも変えない。存在しない UUID に対する `/api/v1/matches/[id]/content` の 200 もそのまま残す。
- 既存の cron と Stripe webhook にある `isUuid`（バージョン桁を制限している方）は触らない。新しい関数で置き換えない。
- 大文字の UUID を小文字に直したり、リダイレクトしたりしない。
- 本番のデータには触らない。新しい依存パッケージを足さない。

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて必ず実行し、結果を完了報告に含める。**
- 受け入れ条件4：4つの経路（6か所）のうち1か所で確認を外したときに、テストが落ちた出力を PR 本文に貼る（変更は戻す）。
- 受け入れ条件5（本番での curl 確認）は、デプロイ後に Claude が行う。
- PR を出したら、マージを待つ。

## 他の作業との関係
`fix-auth-purchase-intent-return` とは触るファイルが重ならない。並行して進めてよく、マージの順番は問わない。
