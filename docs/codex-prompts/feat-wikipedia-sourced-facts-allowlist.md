`specs/feat-wikipedia-sourced-facts-allowlist.md` の仕様を実装してください。

**着手前に必ず読むこと**: `specs/fix-sourced-facts-purge-prohibited-domains.md`（マージ済み）。同 spec が除外した13ドメインを**復活させてはいけません**。本 spec で追加するのは `wikipedia.org` の1件だけです。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- **調査済みの事実（再調査不要）**:
  - `en.wikipedia.org/robots.txt` を 2026-08-07 に実測し、**GPTBot / CCBot の禁止記述が0件**であることを確認済み
  - Tryline は既に `lib/scrapers/wikipedia-*` の20本以上で Wikipedia を主要データソースとして使用している
  - 現在 `en.wikipedia.org` 由来の sourced facts が9件存在する
  - `components/match-content-trust-strip.tsx` は現在**件数のみ**を表示しており、出典ドメインも URL も出していない
- 変更対象:
  - `lib/llm/sourced-facts/allowlist.ts`（1エントリ追加）
  - `components/match-content-trust-strip.tsx`（出典表示）
  - 必要なら呼び出し側（`components/match-content.tsx` 等）に出典を渡す拡張

実装のポイント:
- **`wikipedia.org` の1エントリのみ追加すること**。既存の `domainMatches` が `endsWith('.' + allowedDomain)` で判定するため、これだけで `en.wikipedia.org` と `ja.wikipedia.org` の両方が通ります。言語別サブドメインを個別に列挙しないでください
- **`OFFICIAL_DOMAINS` と `MEDIA_DOMAINS` のどちらに置くかを判断してください**。`isOfficialSourcedFactDomain` が `confidence: high` の判定に影響するかを実コードで確認し、Wikipedia は百科事典（二次情報）であることを踏まえて選び、**どちらにした理由を報告してください**
- 出典表示は、ドメイン名を重複排除して並べ、対応する `source_url` へのリンクにします。外部リンクなので `target="_blank"` と `rel="noopener noreferrer"` を付けてください

エッジケース:
- 同一ドメインから複数の fact がある場合、ドメインは1回だけ表示し、リンク先は代表1件でよい
- `source_url` が null の fact がある場合の扱いを決めて、テストで固定してください（リンクなしのテキスト表示にするなど）
- 出典が0件のときは何も表示しない既存の挙動を維持すること
- 「ラインアップ確認済み」の表示は従来どおり出ること
- `MatchContentTrustStrip` は複数箇所から使われている可能性があります。props を拡張する場合は全呼び出し元を更新してください

やらないこと:
- **他ドメインの追加・除去**。`fix-sourced-facts-purge-prohibited-domains.md` の結果を維持します
- `lib/scrapers/` の `wikipedia-*` モジュールの変更（試合データ取り込みは別系統です）
- 記事本文への出典脚注の埋め込み。プロンプト変更を伴うため別 spec とします
- プロンプト・モデル・QA 基準の変更
- 削除スクリプト（`scripts/purge-prohibited-sourced-facts.ts`）の変更
- `match_sourced_facts` のスキーマ変更

テスト:
- `isAllowedSourcedFactDomain("en.wikipedia.org")` と `("ja.wikipedia.org")` が `true`
- 除外済み13ドメインが引き続き `false`
- 出典ドメインが重複排除されて表示されること
- 外部リンクに `target` と `rel` が付いていること
- 出典0件で何も表示されないこと
- `buildSearchPrompt` の出力に `wikipedia.org` が含まれること（allowlist から導出しているため自動のはず）

完了の定義:
- spec の受け入れ条件1〜9をすべて満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- **`wikipedia.org` を `OFFICIAL_DOMAINS` と `MEDIA_DOMAINS` のどちらに置いたか、その理由を報告してください**
- `source_url` が null のケースをどう扱ったかを報告する
- 出典表示のスクリーンショットを添えて報告する（sourced facts がある試合ページをローカルで開く）
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
