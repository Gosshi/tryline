# 日本代表選手名を漢字表記でプレビュー・レビューに反映する

## 背景

Owner から「日本人選手なのにカタカナ表記なのはおかしい、漢字にしてほしい」との指摘(2026-07-19、日本 vs フランス recapで「イシダ」「オツカ」表記を確認)。

**原因**(コード確認済み):
- `lib/llm/prompts/generate-recap.ts`(288-296行目)の `nameStyleInstruction` は、league-one以外の大会では**全選手を一律カタカナ化**する指示になっている: 「選手名は必ずカタカナで記載すること。アルファベット表記は禁止。英語の人名はカタカナに変換し…」。日本人選手か外国人選手かを区別する仕組みが無い
- `match_events.metadata.player_name` は国籍を問わずローマ字表記(例: `"Ishida"`, `"Otsuka"`)で格納されているため、LLMは「日本語話者にとって不自然でもローマ字→カタカナ変換」という単一ルールしか適用できない
- **既存の類似機構が使える**: `lib/llm/stages/assemble.ts`(884-914行目)に `japaneseNameGlossary` という仕組みが既にあり、`JAPANESE_TEAM_NAMES_BY_SLUG` 等の静的マップからチーム名・大会名の日本語表記グロッサリを構築し、プロンプトに「以下の日本語表記を必ず使うこと」という形で注入している(`generate-recap.ts` 279-296行目, `generate-preview.ts` 198-231行目)。この仕組みを選手名にも拡張すれば、ゼロから作る必要はない
- `match_events.player_id` は`players.id`への外部キーとして概ね機能している(実測: 日本×フランス戦の16イベント中15件が`player_id`あり、1件のみ`null`という既知の欠損)。`players`テーブルには日本代表選手が81件登録済み(`name`列はローマ字フルネーム、例: `"Yuki Ikeda"`)
- **再利用可能なソース**: `rugby-japan.jp`(既にsourced_factsの許可リスト・スクレイピング対象。試合登録メンバー発表記事に漢字氏名が掲載されている。実例: sourced_factsに既存の「PR大塚壮二郎（関西学院大）」の記載を確認済み)

## スコープ

対象:
1. `players` テーブルに `name_ja`(nullable text)カラムを追加する
2. 日本代表(`teams.slug = 'japan'`)の選手について、`rugby-japan.jp` の試合登録メンバー発表記事等から漢字氏名を取得し `name_ja` へバックフィルするスクリプトを作成する(`scripts/backfill-japan-player-kanji-names.ts` 等。既存の `scripts/backfill-*` パターンに倣う。dry-runデフォルト、`--confirm-owner-approved` で本番反映)
3. `lib/llm/stages/assemble.ts` で、`match_events` に含まれる日本代表選手(`player_id` が解決でき、対応する `players.name_ja` が非nullのもの)について、選手名グロッサリ(既存の `japaneseNameGlossary` を拡張するか、`player_name_glossary` として新設するかはCodex判断)を構築する
4. `generate-recap.ts`・`generate-preview.ts` の `nameStyleInstruction` を更新し、「グロッサリに存在する選手は指定の漢字表記を使う。存在しない選手(外国人選手・グロッサリ未登録の日本人選手)は従来通りカタカナ変換する」という優先順位に変更する

対象外:
- 日本代表以外のチーム(海外クラブ在籍の日本人選手を含む)への横展開。まずは日本代表(national team)のみ
- `match_events.player_id` が `null` になっている既存の欠損の修正(今回の日本×フランス戦の「Otsuka」のような欠損は既知の別課題。本specでは `player_id` が解決できる選手のみ対応し、解決できない選手は従来通りカタカナのままでよい)
- 既存published記事の遡及的な再生成(kanji化のための一括regenは別途Owner判断。本specはパイプラインの今後の生成に適用されることのみが目的)
- league-one(既に「日本語表記を使用すること」という別ルールが存在し、対象外の一律カタカナ強制ではない)の `nameStyleInstruction` 変更

## データモデル変更

```sql
alter table public.players add column name_ja text;
```

## API サーフェス

なし。

## LLM 連携

既存のrecap/preview生成パイプライン(4段階: 集約→事実抽出→ナラティブ生成→品質チェック)の「集約」段階(`assemble.ts`)にグロッサリ構築ロジックを追加し、「ナラティブ生成」段階のプロンプト(`generate-recap.ts`・`generate-preview.ts`)がそれを参照する。**追加のLLM呼び出しは発生しない**(既存の `japaneseNameGlossary` と同じ静的注入パターン)。

## 受け入れ条件

1. `players.name_ja` カラムが追加され、マイグレーションが `pnpm build` 等で問題なく適用できる
2. `scripts/backfill-japan-player-kanji-names.ts` のdry-run実行で、日本代表選手の漢字氏名候補と出典URLが一覧表示されることを確認する(実際の本番反映はOwner承認後に別途実施)
3. `assemble.ts` が、`match_events` 中の日本代表選手で `player_id` が解決でき `name_ja` が設定されている場合に、選手名グロッサリへ正しく含めることを確認するユニットテストがある
4. `name_ja` が無い選手(外国人選手・未バックフィルの日本人選手)は、従来通りグロッサリに含まれずカタカナ変換対象のままであることを確認するテストがある
5. `generate-recap.ts`・`generate-preview.ts` の `nameStyleInstruction` に、グロッサリ優先・フォールバックでカタカナ変換という優先順位が反映されていることを確認するテストがある
6. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` が通る
7. **Owner目視確認**: バックフィル後、日本×フランス戦のような日本代表を含む試合で新規生成したrecap/previewが「石田」「大塚」のような漢字表記になっていることを確認する

## 未解決の質問

- `rugby-japan.jp` の試合登録メンバー発表記事は毎試合前に発表される(23名)。全81名(過去キャップ保持者含む)の漢字氏名を一括で確実に取得できるソースが1ページに無い場合、複数の記事(直近の試合登録メンバー発表を試合ごとに遡る等)を組み合わせる実装が必要になる可能性がある。Codex実装時に `rugby-japan.jp` の実際のページ構造を確認し、取得できない選手が残る場合は「取得できた分のみ反映、残りは従来通りカタカナ」という段階的な対応でよい
- 選手が移籍・引退・新規招集された場合の `name_ja` 更新運用(手動再実行前提か、定期cron化するか)は、まず手動スクリプトとして作り、運用が固まってから自動化を検討する
