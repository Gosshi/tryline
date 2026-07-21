`/specs/feat-lipovitan-challenge-cup-2026.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 2026-07-21、日本代表の2026年国内開催テストマッチシリーズ「リポビタンDチャレンジカップ2026」（対オーストラリア・カナダ・フィジー）がDBに1件も取り込まれていないことが判明した
- 最も近い既存パターンは `autumn-nations` ファミリー。`lib/scrapers/wikipedia-autumn-nations-results.ts` と `scripts/import-autumn-nations-results.ts` を参照実装として、同じ構造で新規ファミリーを追加する

やること:
- `lib/scrapers/wikipedia-lipovitan-challenge-cup-results.ts` を新規作成し、日本語版Wikipedia「[リポビタンDチャレンジカップ2026](https://ja.wikipedia.org/wiki/%E3%83%AA%E3%83%9D%E3%83%93%E3%82%BF%E3%83%B3D%E3%83%81%E3%83%A3%E3%83%AC%E3%83%B3%E3%82%B8%E3%82%AB%E3%83%83%E3%83%972026)から試合の日程・会場・スコアを抽出する。構造は `wikipedia-autumn-nations-results.ts` の `HistoricalMatchResult` 型・fetch/parseパターンを踏襲する
- `scripts/import-lipovitan-challenge-cup-results.ts` を新規作成し、`scripts/import-autumn-nations-results.ts` と同じ構造で以下の値を使う: `family=lipovitan-challenge-cup` / `slug=lipovitan-challenge-cup-2026` / `name=Lipovitan-D Challenge Cup 2026` / `name_ja=リポビタンDチャレンジカップ2026` / `season=2026`
- 対象試合は以下の4件:
  1. 2026-08-08 日本代表 vs オーストラリア代表（花園ラグビー場、東大阪市）
  2. 2026-08-15 オーストラリア代表 vs 日本代表（North Queensland Stadium, Townsville。追加の情報源として英語版Wikipedia「[2026 Australia–Japan rugby union test series](https://en.wikipedia.org/wiki/2026_Australia%E2%80%93Japan_rugby_union_test_series)」を使う）
  3. 2026-09-05 日本代表 vs カナダ代表（デンカビッグスワンスタジアム、新潟市）
  4. 2026-10-24 日本代表 vs フィジー代表（秩父宮ラグビー場、東京都港区、日本協会100周年記念試合）
- チームは既存の `japan` / `australia` を使う。`canada` / `fiji` が `teams` テーブルに存在するか実装時に確認し、なければ新規追加する
- `lib/format/competition.ts` の `FAMILY_DISPLAY_NAMES` に `"lipovitan-challenge-cup": "リポビタンDチャレンジカップ"` を追加する
- `app/c/[competition]/page.tsx` の `COMPETITION_DESCRIPTIONS` に `"lipovitan-challenge-cup"` のエントリを追加する

処理すべきエッジケース:
- キックオフ時刻はWikipedia記事に一部記載があるが、正確性のため実装時に一次情報（JRFU公式・Rugby Australia公式）で再確認してから使う
- このシリーズは順位表を持たない試合の集合のため、`/c/lipovitan-challenge-cup-2026` で順位表セクションが空でもエラーにならないことを確認する
- 試合前はスコアがnull、試合終了後にスクリプトを再実行すると実際のスコアに更新される（upsert）ことを確認する
- JAPAN XV vs マオリ・オールブラックス戦（2026-06-27）は対象外。日本代表（`japan`チーム）の試合ではないため実装しない

完了の定義:
- specの受け入れ条件1〜8を満たす
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更・新規ファイル一覧を報告する

要件:
- ヒーロー画像・専用カラーの追加は対象外（デフォルトフォールバックで良い）
- 自動cron化は対象外。手動実行のCLIスクリプトのままでよい
- 本番DBへの実際のスクリプト実行（データ書き込み）はOwner承認後に別途行う。実装・テストまでで完了とする
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・新規/変更ファイルを要約する
- Wikipediaおよび一次情報から実際に確認した4試合の日時・会場・キックオフ時刻を報告に含める
- `canada` / `fiji` チームを新規追加したかどうかを報告する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
