# Codex 指示書: RWC 2027 のキックオフ時刻を会場の時間帯で正しく取り込む

仕様書: `specs/fix-rwc2027-kickoff-timezones.md`（受け入れ条件は仕様書を正とする）

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。**

## やること
- 着手前に `rg -n "parseWikipediaSixNationsHtml|parseWikipediaSixNations2027Html" lib app` の出力を PR 本文に貼る（共通の読み取り処理を使っている取り込みの一覧）。
- RWC 2027 の取り込みで、キックオフを会場の都市の IANA の時間帯から計算する（夏時間の切り替え日を含めて正しく）。会場が分からない試合は書き込まない。
- 共通の読み取り処理の時間帯の略称の表に `ACST`・`ACDT`・`AWST` を足し、30 分単位の時差を扱う。知らない略称は UTC にせず `kickoffAt: null` にする。
- `.github/workflows/cron-ingest-fixtures.yml` に `{"competition":"rwc-2027"}` を付けた 2 つ目の呼び出しを足す。
- 仕様書の受け入れ条件 1〜5 のテストを足す。36 試合の fixture は仕様書の表をそのまま使う。

## 守ること
- 新しい依存パッケージを足さない（`Intl` で時差を求める）。
- シックスネーションズなど他の取り込みの結果を変えない（既存のテストが通ること）。
- 本番のデータには触らない（取り込み直しは Claude Code がマージ後に行う）。

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて必ず実行し、結果を完了報告に含める。**
- 受け入れ条件 6（壊して落ちる）の出力を PR 本文に貼る。PR を出したらマージを待つ。
