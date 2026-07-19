`/specs/fix-nations-championship-round-heading-edit-source-suffix.md` の仕様を実装してください。

**これは実際のバグ修正です(前2回の診断ログのみのspecとは異なります)。原因は確定済みです。**

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 前2回のPR(#595, #596、いずれもマージ済み)で追加した診断ログにより、`nations-championship-2026` の見出しテキストが本番では `'Round 3[edit source]'` のような形式で来ていることが判明した。ローカルでは `'Round 3[edit]'` 形式で来ていた
- `lib/ingestion/sources/wikipedia-nations-championship.ts` の2箇所(`getHtmlStructureDiagnostics` 53-93行目、`parseRoundTableMatches` 171-188行目)で使われている `.replace(/\[edit\]$/i, "")` が、リテラルの `[edit]` にしかマッチせず `[edit source]` を除去できないため、`parseRoundNumber()` の完全一致判定(`/^Round\s+(\d+)$/i`)に失敗し、Round見出しが1件も認識されなくなっていた

やること:
1. `getHtmlStructureDiagnostics` と `parseRoundTableMatches` の両方で、見出しテキストから編集リンクラベルを取り除くロジックを、`[edit]` と `[edit source]` の両方に対応するよう修正する。実装方法はspecの「実装方針」に2案(正規表現を緩める / DOM要素として編集リンクを除去する)を挙げているので、実際のWikipediaページ構造を確認した上でどちらか選んでよい(理由を完了報告に書くこと)
2. 重複ロジックが気になる場合は共通関数に抽出してよい(ただし過剰な抽象化は避ける)

入出力の例:
- 入力: `<div class="mw-heading"><h3 id="Round_3">Round 3</h3><span class="mw-editsection">...[edit source]</span></div>` のような構造(実際のDOM構造はCodexが確認して正確なfixtureを作ること)に続けてtableがある場合
- 期待する出力: `parseRoundTableMatches()` が `round: 3` として正しく試合データをパースする。`[edit]` 表記の従来のfixtureでも同様に動く

処理すべきエッジケース:
- `[edit]` 形式(従来)と `[edit source]` 形式の両方でテストする
- `getHtmlStructureDiagnostics`(診断ログ用)側でも同様に `roundHeadingCount` が正しくカウントされることを確認する
- Round見出し以外の一般的な見出し(例: "Fixtures[edit source]" 等、Round番号を含まない)は引き続きスキップされること(既存のスキップ挙動を壊さない)

完了の定義:
- specs の受け入れ条件1〜6を満たす(7はOwnerが本番確認するためスコープ外)
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` clean
- 変更ファイル一覧を報告する(想定: `lib/ingestion/sources/wikipedia-nations-championship.ts`、`tests/ingestion/live-sources.test.ts`)

要件:
- 「対象外」(診断ログ自体の変更、他大会ソースへの横展開、Wikipedia側の挙動の根本原因特定)は実装しない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイル・選んだ実装方針(正規表現緩和 or DOM要素除去)とその理由を要約する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
