# Codex 指示書: ブレディスローカップ 2026 の取り込み

仕様書: `specs/feat-bledisloe-cup-2026-ingestion.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コード・実ページが食い違ったら、実装を進めずその場で止めて Owner に確認する。

**締切: 10/8(木) までに本番へ出す。** 第 1 テストが 10/10(土) 15:10 JST で、金曜夜のプレビュー生成に乗せるため。

## 直したいこと

ニュージーランド × オーストラリアの 2 テスト（10/10 Auckland、10/17 Sydney）が DB に無い。
Puma Trophy（豪 × アルゼンチン）と同じ「Rugby Championship 休止年の単独シリーズ」なので、**Puma Trophy と同じやり方で取り込む。**

## 雛形（これをなぞる）

`git show 5216db5 --stat`（feat: ingest Puma Trophy 2026）が触ったファイルが、そのまま今回触るファイルの一覧になる。

| 雛形 | 今回 |
|---|---|
| `lib/ingestion/sources/wikipedia-puma-trophy.ts` | `lib/ingestion/sources/wikipedia-bledisloe-cup.ts`（新規） |
| `tests/fixtures/wikipedia-puma-trophy-2026.html` | `tests/fixtures/wikipedia-bledisloe-cup-2026.html`（**実ページの HTML を保存**。手作りしない） |
| `tests/ingestion/wikipedia-puma-trophy.test.ts` | `tests/ingestion/wikipedia-bledisloe-cup.test.ts`（新規） |
| `lib/ingestion/live-competitions.ts` の Puma エントリ | 同じ形でブレディスローのエントリを追加 |
| `lib/format/competition.ts`・`lib/format/japanese-names.ts`・`lib/competition-hero-images.ts` | 仕様書「表示資材」の表どおり（`australia-south-africa-test` の 2 行も含む） |
| `tests/ingestion/live-sources.test.ts`・`tests/format/competition.test.ts`・`tests/lib/competition-hero-images.test.ts` | 追加分の assert を足す |

- URL: `https://en.wikipedia.org/wiki/2026_Bledisloe_Cup`
- チーム名の対応表: `"New Zealand": "new-zealand"`, `Australia: "australia"`
- 命名（slug・family・name・name_ja）は仕様書の「命名」表のとおり

## 具体例（期待値）

| homeTeamSlug | awayTeamSlug | kickoffAt（UTC） | 元の現地時刻 |
|---|---|---|---|
| `new-zealand` | `australia` | `2026-10-10T06:10:00.000Z` | 19:10 NZDT（UTC+13） |
| `australia` | `new-zealand` | `2026-10-17T04:45:00.000Z` | 15:45 AEDT（UTC+11） |

## 処理すべきエッジケース

1. 現地時刻の UTC 変換。**NZ も豪州も 10 月は夏時間**（NZDT は UTC+13、AEDT は UTC+11）。雛形のパーサが時差をどう扱っているか確認し、期待値と一致させる
2. venue 末尾の脚注記号 `[数字]`（雛形は `.replace(/\[\d+\]$/, "")` で消している）
3. 404 のとき空配列を返す
4. 対応表に無いチーム名は落とす

## やってはいけないこと

- `competitions` への手動 INSERT やマイグレーションを書くこと（取り込み時に upsert される）
- プレビュー／レビュー生成の仕組みを触ること
- 手入力した `australia-south-africa-test-2026` の試合データ（得点経過など）を触ること。表示名・色の追加だけ
- 新しいヒーロー画像を作ること（既存の `/visuals/rugby-championship.jpg` を使う）

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test`（**型チェックも必ず実行し、結果を完了報告に含める**。前回、型チェック未実行で CI が落ちた）
- 受け入れ条件 7: UTC 変換を外した実装で条件 1 のテストが落ちることを一時的に壊して確認し、PR 本文に書く（コミットしない）

## 完了時

- PR 本文に: 変更ファイル一覧、受け入れ条件 1〜8 それぞれの確認方法と結果、「壊して落ちた」確認の内容
- PR 作成まで。マージはしない
