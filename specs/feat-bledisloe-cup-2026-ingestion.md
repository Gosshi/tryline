# ブレディスローカップ 2026（ニュージーランド × オーストラリア 2 テスト）の取り込み

## 背景

**2026 年のブレディスローカップ 2 試合が `matches` に 1 件も無い**（2026-09-23 本番 DB で確認）。

| 日本時間 | 対戦 | 会場 | 現地時刻（Wikipedia） |
|---|---|---|---|
| 10/10(土) 15:10 | ニュージーランド 対 オーストラリア | Eden Park, Auckland | 19:10 NZDT（UTC+13） |
| 10/17(土) 13:45 | オーストラリア 対 ニュージーランド | Stadium Australia, Sydney | 15:45 AEDT（UTC+11） |

出典: Wikipedia「2026 Bledisloe Cup」（2026-09-23 に wikitext を取得して確認。`{{rugbybox}}` 2 件、見出し「First test」「Second test」）。

2026 年は The Rugby Championship が開催されず（`specs/feat-puma-trophy-2026-ingestion.md` の背景と同じ）、ブレディスローカップは単独のシリーズとして行われる。同じ理由で生まれた 2 シリーズは取り込み済みで、流入の実績がある。

| シリーズ | GA4 organic 着地（2026-08-26〜09-22） | レビュー |
|---|---:|---:|
| `greatest-rivalry-2026`（NZ × 南ア） | 50 ユーザー / 56 セッション | 8 本 |
| `puma-trophy-2026`（豪 × アルゼンチン） | **0**（`landingPage` に `puma-trophy` を含む行なし） | 2 本 |

**流入はシリーズの格で大きく違う。** NZ × 南アは 50 人、豪 × アルゼンチンは 0 人だった。ブレディスローカップ（NZ × 豪）はこの間のどこかと見込むが、実測は無い。取り込みの工数は Puma Trophy と同程度（ソース 1 ファイル＋登録）なので、0 人でも損失は小さい。

**同じ構造のシリーズなのに、ブレディスローカップだけが入っていない。** 取りこぼしを仕組みで検出する件は `specs/feat-missing-international-fixtures-audit.md` で扱う。本 spec はこの 1 件の取り込みだけ。

### 締切

- 第 1 テストは **10/10(土) 15:10 JST**。金曜 21:05 JST のプレビュー生成（翌日・翌々日が対象）に乗せるには、**10/9(金) の夕方までに取り込みが済んでいること**
- 取り込みは `cron-live-pipeline.yml` の 6 時間ごとの実行（`cron: "0 0,6,12,18 * * *"`）で動く。**10/8(木) までに本番へ出す**ことを目標にする

## スコープ

対象:
- Wikipedia の「2026 Bledisloe Cup」ページから試合を取り込むソースの新設
- `LIVE_COMPETITION_SOURCES` への登録
- ファミリーの表示資材（アクセント色・日本語表示名・ヒーロー画像）
- ついでに、9/27 に手入力した `australia-south-africa-test` ファミリーの日本語表示名とアクセント色（大会トップの見出しが「Australia South Africa Test」と英語で出ているため）

対象外:
- プレビュー・レビュー生成の仕組みの変更（大会に依存しないので変更不要。`specs/feat-puma-trophy-2026-ingestion.md` の「プレビュー生成側の変更は不要」と同じ理由）
- マイグレーション（`ingestLiveCompetition` が `competitions` 行を upsert する）
- 放送情報
- 大会ガイド（`competition_guides`）
- 手入力した 9/27 の試合（`australia-south-africa-test-2026`）の得点経過。`external_ids.wikipedia_event_id` が無く、Wikipedia の代表戦一覧ページ全体を渡すと他試合のイベントが混ざる危険がある（過去のイベント汚染事故と同型）ので、ここでは扱わない

## データモデル変更

なし。`teams` は両チームとも登録済み（`new-zealand`／`australia`、日本語名あり）。

## 命名

| 項目 | 値 |
|---|---|
| `competitionSlug` | `bledisloe-cup-2026` |
| `family` | `bledisloe-cup` |
| `competitionName` | `Bledisloe Cup 2026` |
| `competitionNameJa` | `ブレディスローカップ オールブラックス対ワラビーズ` |
| `season` | `2026` |
| `sourceLabel` | `wikipedia` |

`competitionNameJa` は `greatest-rivalry-2026`・`puma-trophy-2026` の流儀（固有名＋対戦の説明）に揃えた。

## 取り込みソース

**雛形は `lib/ingestion/sources/wikipedia-puma-trophy.ts`（51 行）。** 同じ構造（遠征ページ・`{{rugbybox}}`・vevent）なので、URL とチーム名の対応表を差し替えるだけで済むはず。

- 新規ファイル: `lib/ingestion/sources/wikipedia-bledisloe-cup.ts`
- 対象 URL: `https://en.wikipedia.org/wiki/2026_Bledisloe_Cup`
- チーム名の対応表: `"New Zealand": "new-zealand"`, `Australia: "australia"`
- ページが 404 のときは空配列を返す（雛形の `isMissingWikipediaPage` と同じ）

## 表示資材

| ファイル | 追加する値 |
|---|---|
| `lib/format/competition.ts` の `COMPETITION_FAMILY_COLORS` | `"bledisloe-cup": "#000000"`（オールブラックスの黒）、`"australia-south-africa-test": "#FFB81C"`（ワラビーズの金） |
| `lib/format/competition.ts` の `FAMILY_DISPLAY_NAMES` | `"bledisloe-cup": "ブレディスローカップ"`、`"australia-south-africa-test": "オーストラリア対南アフリカ"` |
| `lib/format/japanese-names.ts` の `JAPANESE_COMPETITION_NAMES_BY_FAMILY` | 同上の 2 件 |
| `lib/competition-hero-images.ts` | `"bledisloe-cup": "/visuals/rugby-championship.jpg"`（`puma-trophy` と同じ既存画像。新しい画像は作らない） |

## API サーフェス / UI サーフェス

変更なし。取り込まれれば既存の大会トップ・シーズンページ・カレンダー・試合ページにそのまま出る。

## LLM 連携

なし（取り込みのみ）。プレビュー・レビューは既存の cron が大会に依存せず生成する。

## 受け入れ条件

1. **解析**: `tests/fixtures/wikipedia-bledisloe-cup-2026.html`（実ページの HTML を保存したもの。手作りしない。`feedback_scraper_test_fixture_realism`）から、次の 2 試合がちょうど得られる

   | homeTeamSlug | awayTeamSlug | kickoffAt（UTC） | venue |
   |---|---|---|---|
   | `new-zealand` | `australia` | `2026-10-10T06:10:00.000Z` | Eden Park, Auckland |
   | `australia` | `new-zealand` | `2026-10-17T04:45:00.000Z` | Stadium Australia, Sydney |

   venue の末尾に `[数字]` の脚注記号が残らないこと
2. **未知のチーム**: 対応表に無いチーム名の試合は落とす（`mapWithTeamSlugs` の既存挙動）
3. **404**: 取得が 404 のとき空配列を返し、例外を投げない
4. **登録**: `LIVE_COMPETITION_SOURCES` に上の「命名」どおりのエントリが 1 件あり、`slug` が他と重複しない（`tests/ingestion/live-sources.test.ts` に追加）
5. **表示名**: `formatFamilyName("bledisloe-cup")` が「ブレディスローカップ」、`formatFamilyName("australia-south-africa-test")` が「オーストラリア対南アフリカ」
6. **色・画像**: `getCompetitionFamilyColor` と `getCompetitionHeroImage` が上の表の値を返す
7. **壊して落ちる確認**: 条件 1 のテストが、UTC 変換を外した実装（現地時刻をそのまま UTC とみなす）で落ちることを一時的に壊して確認し、PR 本文に書く
8. `pnpm lint`・`pnpm typecheck`・`pnpm test` が通り、CI（`gh pr checks`）が緑
9. **デプロイ後（Claude Code が確認）**: 次の取り込み実行の後、本番 DB に `bledisloe-cup-2026` と 2 試合が上の値で入っている

## 既存テストの巻き添え

- `tests/ingestion/live-sources.test.ts` が `LIVE_COMPETITION_SOURCES` の件数や順序を assert している場合は、件数を合わせる
- `tests/format/competition.test.ts` にファミリー名・色の一覧を網羅する assert があれば追加分を足す

## 競合とマージ順

- `specs/feat-missing-international-fixtures-audit.md` と触るファイルは重ならない。**本 spec を先に出す**（締切が近い）

## 本番操作

なし（取り込みは cron が行う）。

## 未解決の質問

なし。
