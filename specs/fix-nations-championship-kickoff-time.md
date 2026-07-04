# Nations Championship 2026 キックオフ時刻の欠落を修正

## 背景

`nations-championship-2026`（全37試合、7/4・7/11・7/18・11月シリーズ・Finals Weekend）の全試合が `matches.kickoff_at = 00:00:00+00`（日付のみ、時刻は常に深夜0時UTC）で保存されている。本番確認済み（2026-07-04、Supabase `matches` テーブル直接照会、37件全件が同一パターン）。

**根本原因**: `lib/ingestion/sources/wikipedia-nations-championship.ts` が参照する `https://en.wikipedia.org/wiki/2026_Nations_Championship` の Round テーブルは「日付・ホーム・スコア・アウェー・会場」の5列のみで**時刻列が存在しない**（Wikipedia側で未整備）。パーサの実装ミスではなく、時刻情報を持たないソースを唯一の参照元にしていることが原因。`buildUtcIsoString()`（`lib/ingestion/sources/live-source-utils.ts`）自体は `timeText` / `offsetHours` を受け取れるが、呼び出し側（本パーサ100行目）が `dateText` しか渡していない。

**影響**: 全試合ページの表示キックオフ時刻が実際と異なる（例: 2026-07-04 日本vsイタリアは実際 17:40 JST だが表示は 09:00 JST）。今後の全ラウンド（7/11・7/18・11月シリーズ・Finals）も同様に不正確になる。

**時刻を持つ代替ソース候補**（Web調査で確認、2026-07-04時点）:
- `https://www.world.rugby/nations-cup/en/matches/2026` — World Rugby 公式。全6ラウンド・37試合の現地キックオフ時刻を掲載していることをWeb調査で確認済み（例: Round1は NZ vs France 9:10am, Japan vs Italy 10:40am 等、現地時間表記）
- `https://www.world.rugby/beta/en/tournaments/nations-championship/2026` — 同じく World Rugby 系

World Rugby は大会の主催団体公式サイトであり、ソースとして適切と考えられる。ただし実装前に **fetch 対象URLと robots.txt 準拠を Owner が最終確認すること**（CLAUDE.md のスクレイピング境界ルール）。

## スコープ

対象:
- Nations Championship 2026 の各試合について、実際のキックオフ時刻（現地時間 + UTC変換）を取得できるソースを追加または既存パーサを拡張する
- 取得した時刻で `matches.kickoff_at` を正しい値に更新する（37試合分のバックフィル）
- 今後の cron 実行でも正しい時刻が入るようにする（新規試合の取り込み含む）

対象外:
- Wikipedia ソース自体の廃止（結果・スコア取得は引き続き Wikipedia を使ってよい。時刻のみ別ソースで補完 or 差し替え、どちらの設計にするかは Codex の判断に委ねる）
- 他大会（Autumn Nations 等）の時刻精度改善（別問題として扱う）
- 表示レイヤーのタイムゾーン変換ロジック自体の変更（既存の JST 表示ロジックは正しく動いている前提。入力データが正しくなれば表示も正しくなる）

## データモデル変更

なし。`matches.kickoff_at` は既存カラム（`timestamptz`）を使う。

## API サーフェス

なし。

## 実装方針（提案。詳細実装は Codex 判断）

1. World Rugby の対象ページ（上記候補URL）の実際のHTML構造を確認し、37試合の「チーム・キックオフ時刻・タイムゾーン」を取得できるか検証する
2. 取得できる場合:
   - 新規パーサ（例: `lib/ingestion/sources/world-rugby-nations-championship-times.ts`）を追加し、既存の `fetchWithPolicy`（robots.txt・レート制限を継承）を使う
   - Wikipedia ソースの結果と World Rugby の時刻を試合単位でマッチング（チーム名・ラウンド・日付で対応付け）し、`kickoffAt` を上書きする
   - もしくは、Wikipedia ソース1本で完結させたい場合は `wikipedia-nations-championship.ts` 自体は結果・スコア用に残しつつ、時刻のみ World Rugby から取得してマージする層を `live-competitions.ts` 側に追加する（設計はどちらでもよい。テストしやすい方を優先）
3. 既存37試合の `kickoff_at` を正しい値でバックフィルするスクリプト（`scripts/` 配下、他の backfill スクリプトの慣例に合わせる）
4. cron 実行時（今後の結果反映）にも正しい時刻が入り続けることを確認

## 受け入れ条件

1. 2026-07-04 の日本 vs イタリア（`f56e9ee9-14be-49e3-b47d-c51a29c07593`）の `kickoff_at` が `2026-07-04T08:40:00Z`（JST 17:40 相当）に修正されている
2. `nations-championship-2026` の全37試合の `kickoff_at` が World Rugby 記載の現地キックオフ時刻から正しく UTC 変換されている（日付のみでなく時刻も一致）
3. 新規パーサ/マージ層に対する単体テストがある（他ソースの既存テストパターンに準拠）
4. `pnpm test` 全体が通る
5. TypeScript strict エラーなし
6. バックフィル実行後、本番の `matches` テーブルで37件を再確認し、`00:00:00+00` が0件になっていることを確認する

## 未解決の質問

- World Rugby ページの実際のHTML構造（テーブル形式かカード形式か等）は未確認。Codex が実装着手時に fetch して構造を確認すること
- robots.txt の確認結果次第では代替ソース（各国協会の公式サイト等）が必要になる可能性がある。その場合は Owner に代替候補を相談すること
- 既存37試合分のバックフィルを本番に対して誰が・いつ実行するか（Codex のPRにスクリプトを含め、実行は Owner 承認後）
