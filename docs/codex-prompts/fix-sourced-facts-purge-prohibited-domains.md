`specs/fix-sourced-facts-purge-prohibited-domains.md` の仕様を実装してください。

**着手前に必ず読むこと**: `specs/fix-sourced-facts-allowlist-compliance.md`。本 spec はその「対象外」に置かれた積み残し（既存行の遡及削除）を塞ぐものです。同 spec が除外したドメインを**復活させてはいけません**。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- 背景の要点:
  - 過去の除外 spec は allowlist から外して新規収集を止めただけで、既存行を削除していない
  - パイプラインは `match_sourced_facts` を `match_id` で読み出し、読み出し時にドメインで絞らない。そのため除外済みドメイン由来の事実がいまも記事生成に使われている
  - 2026-08-07 の実測で全154件中114件（74%）が除外済みドメイン由来
  - あわせて `englandrugby.com` / `allblacks.com` / `lnr.fr` の3件が規約違反であることが新たに判明した
- 変更対象:
  - `lib/llm/sourced-facts/allowlist.ts`（3ドメインの削除）
  - 記事生成のために `match_sourced_facts` を読み出す箇所（許可ドメインでの絞り込み追加）
  - `scripts/` に削除スクリプトを新規追加
- 参考にする既存パターン:
  - 危険操作のフラグ設計: `scripts/regenerate-overseas-content.ts` の `--dry-run` と `--confirm-owner-approved`
  - ドメイン判定: `lib/llm/sourced-facts/allowlist.ts` の `isAllowedSourcedFactDomain`（サブドメインを `endsWith` で許容している既存の挙動を壊さないこと）

実装のポイント:
- **削除スクリプトの判定基準は `SOURCED_FACT_ALLOWED_DOMAINS` のみ**にすること。削除対象ドメインをスクリプト内に列挙しないでください。列挙すると allowlist と二重管理になり、今回と同じ乖離が再発します。allowlist を1件増減させると削除対象も変わることをテストで担保してください
- 読み出し時のフィルタも同じ判定関数を使うこと
- 除外された行があった場合は件数をログに出すこと。静かに捨てないでください

エッジケース:
- **サブドメインの扱い**。`en.rugby-japan.jp` と `stats.unitedrugby.com` は、親ドメインが許可されていれば残さなければなりません。既存の `domainMatches` の挙動に従うこと
- `source_domain` が null や空文字の行がある場合の扱いを決めて、テストで固定すること
- 削除対象が0件のときにスクリプトが正常終了すること
- 読み出しフィルタで全件が除外された試合（許可ドメイン由来の事実が1件もない）でも、生成が例外にならず「事実なし」として扱われること

やらないこと:
- **新規ドメインの追加**。監査の結果、追加できる候補は見つかりませんでした
- 灰色判定ドメイン（`rugby-japan.jp` / `premiershiprugby.com` / `super.rugby` / `onrugby.it` / `therugbypaper.co.uk`）の除去。Owner 判断待ちです
- 削除対象の事実を使って生成された既存記事の再生成・取り下げ
- プレビュー・レビューのプロンプト、生成ロジック、QA の変更
- **本番 DB に対する実削除の実行**。スクリプトを実装するところまでが範囲で、実行は Owner が行います。dry-run での動作確認までに留めてください

テスト:
- 3ドメインが `isAllowedSourcedFactDomain` で `false` を返すこと
- 読み出し経路で許可リスト外の行が使われないこと
- 除外件数がログに出ること
- 削除スクリプトが `--dry-run` 既定で、ドメイン別件数を表示すること
- allowlist を変更すると削除対象が連動して変わること（ハードコードでないことの担保）
- サブドメインが親ドメインの許可を継承すること

完了の定義:
- spec の受け入れ条件1〜8をすべて満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- 削除スクリプトを **dry-run で本番に対して実行**し、ドメイン別の削除対象件数を報告する（**実削除は行わないこと**）
- 読み出しフィルタを入れた箇所と、その結果いくつの試合で事実が0件になるかを報告する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
