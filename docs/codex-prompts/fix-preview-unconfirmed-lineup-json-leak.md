`/specs/fix-preview-unconfirmed-lineup-json-leak.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 直前の関連修正 `specs/fix-projected-lineup-fallback-fabrication.md`（PR #465、マージ済み）で `assembled.projected_lineups.confirmed.home`/`away` という真偽値シグナルが既に導入済み。今回はこのシグナルを使って生JSONダンプをサニタイズするだけで、`confirmed` の算出ロジック自体（`lib/llm/lineups.ts`・`lib/llm/stages/assemble.ts`）は変更不要
- 対象は `lib/llm/prompts/generate-preview.ts` の `` `試合データ: ${JSON.stringify(assembled)}` `` 行（230行目付近）
- `lineupUsageBlock`（158-167行目、`hasLineups` に基づく分岐）は既に正しく動作しているので変更不要。今回直すのは「`hasLineups=false` でも生データ自体はプロンプトに丸ごと見えている」という別経路の漏れ

入出力の例:
- 実際に本番で観測された失敗ケース: away側（イタリア）の `projected_lineups` が `confirmed: false`（`players` キャップ数順フォールバック）で「Alessandro Garbisi / Scrum-half」等を含む状態でプレビュー生成すると、`hasLineups=false` で構成分岐・`lineupUsageBlock` は正しく省略されたにもかかわらず、生成本文に「イタリアのスクラムハーフ、アレッサンドロ・ガルビジが...」という一文が生成された
- 変更後: 同じ入力で、プロンプト文字列（`buildGeneratePreviewPrompt` の戻り値）に "Alessandro Garbisi" という文字列が一切含まれないことをテストで確認できる状態にする
- 対照ケース: home側が `confirmed: true` の場合は、従来通りプロンプト文字列に home側の実名が含まれること

処理すべきエッジケース:
- home/away で confirmed 状態が非対称なケース（片方だけ確定lineup、もう片方はフォールバック）で、確定側の名前だけがJSONダンプに残り、未確定側だけが空配列になること
- `assembled` オブジェクト自体を直接書き換えない（イミュータブルにコピーを作る。coding-style.mdの不変性原則）
- `generate-recap.ts` に同じ `JSON.stringify(assembled)` 全体ダンプパターンがあるか確認し、あれば同様に対応すること。無ければ対応不要（spec の「未解決の質問」に沿って報告すること）

完了の定義:
- specs の受け入れ条件4項目すべてを満たす
- `pnpm test` が通る
- `pnpm tsc --noEmit` でエラーなし

要件:
- 受け入れ条件セクションのすべてを実装する
- 「対象外」にある項目（`lineupUsageBlock`自体の変更、他フィールドのサニタイズ、該当試合の再生成実行）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- `generate-recap.ts` に同様の問題があったか無かったか、結果を明記する
- `PROMPT_VERSION` を何に変更したか明記する
- Owner への未解決の質問があれば記載する
