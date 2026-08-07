# グレイテスト・ライバリー・ツアー 2026 の取り込み

## 背景

2026年8〜9月に開催されるニュージーランド代表の南アフリカ遠征「Rugby's Greatest Rivalry」が、Tryline に**まったく存在しない**。`competitions` を `rival` / `tour` / `ライバ` で検索しても0件で、大会も試合も登録されていない。

30年ぶりのオールブラックス南アフリカ遠征という節目の大会で、南アフリカのフランチャイズ4チームとの対戦に加え、スプリングボクスとの**テストマッチ4戦**を含む全8試合が組まれている。日本では J SPORTS が放送しており（番組表に「グレイテスト・ライバルリー・ツアー 2026 〜オールブラックス 南アフリカ遠征〜」として掲載）、日本語圏の視聴者が実際に見ている大会である。

`rugby-rp.com/game-schedule` にも「■グレイテストライバルリーツアー」として掲載されている。

### 取り込み可能性の事前検証（2026-08-07 実施）

Wikipedia の [2026 New Zealand rugby union tour of South Africa](https://en.wikipedia.org/wiki/2026_New_Zealand_rugby_union_tour_of_South_Africa) に対し、リポジトリの既存パーサ `parseWikipediaSeasonMatches`（`lib/scrapers/wikipedia-season-parser.ts`）を実行したところ、**全8試合を正しく抽出できた**。

| 現地日時 | 対戦 | セクション ID |
|---|---|---|
| 7 August 2026 19:10 SAST | Stormers vs New Zealand | `Stormers` |
| 11 August 2026 19:10 SAST | Sharks vs New Zealand | `Sharks` |
| 15 August 2026 19:10 SAST | Bulls vs New Zealand | `Bulls` |
| 22 August 2026 17:10 SAST | South Africa vs New Zealand | `First_test` |
| 25 August 2026 19:10 SAST | Lions vs New Zealand | `Lions` |
| 29 August 2026 17:10 SAST | South Africa vs New Zealand | `Second_test` |
| 5 September 2026 17:10 SAST | South Africa vs New Zealand | `Third_test` |
| 12 September 2026 17:00 **EDT (UTC-04)** | South Africa vs New Zealand | `Fourth_test` |

第4テストのみ米国（ボルチモア）開催のため**タイムゾーンが異なる**点に注意。

### チームはすべて登録済み

必要なチームは既に `teams` に存在し、日本語名も入っている。**新規チーム登録は不要。**

| slug | name | name_ja |
|---|---|---|
| `stormers` | Stormers | ストーマーズ |
| `sharks` | Sharks | シャークス |
| `bulls` | Bulls | ブルズ |
| `lions` | Lions | ライオンズ |
| `new-zealand` | New Zealand | ニュージーランド |
| `south-africa` | South Africa | 南アフリカ |

なお `sharks` は南アフリカのシャークスで、Premiership の `sale-sharks` とは別レコードとして既に区別されている。

## スコープ

対象:
- `competitions` への大会1件の追加
- Wikipedia からの試合取り込みモジュール1本の追加
- `lib/ingestion/live-competitions.ts` への登録
- 大会ハブページが既存テンプレートで正しく表示されること

対象外:
- **チームの新規登録**（全て登録済み）
- 大会専用のページテンプレート作成。既存の大会ハブテンプレートに乗せる
- 順位表の実装（ツアーであり順位表が存在しない）
- 放送情報の投入（JRFU 経由の自動取得は日本代表戦のみが対象。本大会は手動投入または別 spec）
- ノックアウトブラケット
- 過去の遠征（1996年等）の取り込み

## データモデル変更

**スキーマ変更なし。マイグレーション不要。** 既存の `competitions` と `matches` にデータを追加するのみ。

`competitions` に追加する行:

| カラム | 値 |
|---|---|
| `slug` | `greatest-rivalry-2026` |
| `name` | `Greatest Rivalry 2026` |
| `season` | `2026` |
| `start_date` | `2026-08-07` |
| `end_date` | `2026-09-12` |

日本語表示名は **「グレイテスト・ライバルリー・ツアー」**（Owner 確定、2026-08-07）。既存の大会日本語名の仕組みに合わせて設定し、他大会と同じ経路を使う。本 spec で新しい命名機構は作らない。

## API サーフェス

### 新規モジュール

`lib/ingestion/sources/wikipedia-greatest-rivalry.ts`

`lib/ingestion/sources/wikipedia-rugby-championship.ts`（47行）を**そのままの構造で**踏襲する。

```
const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Bulls: "bulls",
  Lions: "lions",
  "New Zealand": "new-zealand",
  Sharks: "sharks",
  "South Africa": "south-africa",
  Stormers: "stormers",
};

function buildWikipediaUrl(): string;
export function parseGreatestRivalryLiveHtml(html, wikipediaUrl): ParsedLiveMatch[];
export async function fetchGreatestRivalry2026(): Promise<ParsedLiveMatch[]>;
```

- パースは `parseWikipediaSixNationsHtml`（`lib/ingestion/sources/wikipedia-six-nations.ts`）を使う
- `toEmptyWhenMissingOrUnstructured` と `mapWithTeamSlugs` を rugby-championship と同じ形で使う
- 取得は `fetchWithPolicy`（robots 判定・リトライ・レート制限）
- ページ不在時は `isMissingWikipediaPage` で空配列を返す

Wikipedia URL は年度で組み立てられない特殊な形式（`2026_New_Zealand_rugby_union_tour_of_South_Africa`）のため、他大会のような `${season}_...` パターンにはしない。

### 登録

`lib/ingestion/live-competitions.ts` に追加する。

```
{
  competitionName: "Greatest Rivalry 2026",
  competitionSlug: "greatest-rivalry-2026",
  family: "greatest-rivalry",
  fetch: fetchGreatestRivalry2026,
  season: "2026",
  sourceLabel: "wikipedia",
},
```

## UI サーフェス

**新規ページの作成は不要。** 既存の大会ハブテンプレート `app/c/[competition]/[season]/page.tsx` が `competitions` の行を元に描画するため、データが入れば `/c/greatest-rivalry/2026` が自動的に表示される。

ただし次を確認すること。

- 順位表タブが空になる場合に破綻せず、自然な表示になること（ツアーには順位表がない）
- ラウンド見出しに Wikipedia のセクション ID（`First_test` 等）がそのまま出ないこと。出る場合は日本語の節名に整形する
- ホームや大会一覧のナビゲーションに本大会が現れること

## LLM 連携

なし。本 spec は取り込みのみ。プレビュー・レビューの生成は既存の orchestrate パイプラインが `matches` を見て自動的に対象化するため、追加実装は不要。

## 受け入れ条件

1. `competitions` に `greatest-rivalry-2026` が1件存在する。
2. `parseGreatestRivalryLiveHtml` が実際の Wikipedia ページ HTML から **8試合**を抽出する。テストのフィクスチャは実ページから起こすこと。
3. 抽出結果の対戦カードとキックオフ日時が、背景の表と一致する。
4. 第4テスト（9/12、米国 EDT）の `kickoff_at` が **UTC で正しく保存される**（`2026-09-12 17:00 EDT` → `2026-09-12T21:00:00.000Z`）。SAST（UTC+2）の7試合と混同していないことをテストで確認する。

   **前提（2026-08-07 追記）**: `lib/ingestion/sources/wikipedia-six-nations.ts` の `TIMEZONE_OFFSETS`（6〜21行）に `EDT` が存在せず、90行目の `TIMEZONE_OFFSETS[params.timezoneText ?? "UTC"] ?? 0` により未知のタイムゾーンはオフセット0として扱われる。本条件を満たすには **`EDT: -4` の追加が必要**であり、Owner がこれを承認済み。追加してよいのはこの1エントリのみで、パースロジックと既存エントリには触れない。
5. `mapWithTeamSlugs` により全8試合の両チームが既存 slug に解決され、未解決で落ちる試合が0件である。
6. Wikipedia ページが取得できない場合に例外を投げず空配列を返す。
7. `lib/ingestion/live-competitions.ts` に登録され、既存の取り込み cron の対象になる。
8. `/c/greatest-rivalry/2026` が 200 で表示され、8試合が日本時間で表示される。順位表が空でもページが破綻しない。
9. 既存大会の取り込みに影響がない（既存テストが通る）。
10. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean。

## 未解決の質問

1. **ツアーは既に開幕している（8/7 ストーマーズ戦）。** 実装完了時点で数試合が終了済みの可能性がある。終了済み試合のスコア取り込みが既存パイプラインで行われるか、別途バックフィルが要るかは実装時に確認すること。

2. ~~日本語の大会名表記が未確定。~~ **解決済み（2026-08-07）。「グレイテスト・ライバルリー・ツアー」に確定**（J SPORTS の表記に合わせる）。`rugby-rp.com` の「グレイテストライバルリーツアー」は採用しない。

3. **放送情報は本 spec では埋まらない。** JRFU 経由の自動取得（`specs/feat-broadcast-auto-ingest.md`）は日本代表戦のみが対象。J SPORTS が放送しているため、手動投入するか別 spec で対応するかは Owner 判断。

4. **順位表タブの扱いが未確認。** ツアーに順位表は存在しない。既存テンプレートが空の順位表をどう描画するかを実装時に確認し、不自然なら非表示にする。
