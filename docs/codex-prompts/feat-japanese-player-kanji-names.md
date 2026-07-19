`/specs/feat-japanese-player-kanji-names.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 日本代表選手が漢字ではなくカタカナで表記される問題。`lib/llm/prompts/generate-recap.ts`(288-296行目)の `nameStyleInstruction` が全選手を一律カタカナ化する指示になっており、日本人選手か外国人選手かを区別していない
- 既存の `japaneseNameGlossary` 機構(`lib/llm/stages/assemble.ts` 884-914行目、`JAPANESE_TEAM_NAMES_BY_SLUG` 等の静的マップからチーム名・大会名の日本語表記を注入)と同じパターンで選手名にも拡張する
- `match_events.player_id` は`players.id`への外部キーとして機能している(一部`null`の既知欠損あり、対応不要)

やること:
1. `players` テーブルに `name_ja`(nullable text)カラムを追加するマイグレーションを作成する
2. `rugby-japan.jp`(既存の許可リストに含まれるスクレイピング対象)の試合登録メンバー発表記事等から日本代表選手の漢字氏名を取得し、`players.name_ja` へバックフィルするスクリプト(`scripts/backfill-japan-player-kanji-names.ts`、既存の `scripts/backfill-*.ts` パターンに倣いdry-runデフォルト・`--confirm-owner-approved`で本番反映)を作成する
3. `lib/llm/stages/assemble.ts` で、`match_events` 中の日本代表選手(`player_id` 解決済み・`players.name_ja` が非null)について選手名グロッサリを構築する(既存の `japaneseNameGlossary` を拡張するか新設するかは実装しやすい方でよい)
4. `generate-recap.ts`・`generate-preview.ts` の `nameStyleInstruction` を更新し、グロッサリにある選手は指定の漢字表記、無い選手は従来通りカタカナ変換、という優先順位にする

処理すべきエッジケース:
- `player_id` が `null` の選手(既知の欠損)は従来通りカタカナのまま。エラーにしない
- `name_ja` が未バックフィルの日本代表選手も従来通りカタカナのまま
- 外国人選手には一切影響しない(グロッサリは日本代表選手のみ対象)
- league-one大会の既存の `nameStyleInstruction`(既に「日本語表記を使用」というルール)は変更しない

完了の定義:
- specs の受け入れ条件1〜6を満たす(7はOwnerが目視確認するためスコープ外)
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する(想定: マイグレーションファイル、`scripts/backfill-japan-player-kanji-names.ts`、`lib/llm/stages/assemble.ts`、`lib/llm/prompts/generate-recap.ts`、`lib/llm/prompts/generate-preview.ts`、関連テスト)

要件:
- 「対象外」(日本代表以外への横展開、player_id null欠損の修正、既存published記事の遡及的再生成、league-oneのルール変更)は実装しない
- バックフィルスクリプトの実際の本番実行(`--confirm-owner-approved`)はOwner承認後にOwner自身またはOwner指示で行う。Codexの実装スコープはスクリプトの作成とdry-run動作確認まで
- 曖昧な箇所や仕様書と実環境の食い違い(特にrugby-japan.jpのページ構造で全選手の漢字名が取得できない場合)があれば、その場で実装を停止して質問する。未解決の質問を参照

完了時:
- 実装内容・変更ファイルを要約する
- dry-run実行結果(何人分の漢字氏名を取得できたか)を報告する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
