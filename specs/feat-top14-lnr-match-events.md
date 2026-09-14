# Top 14 の得点イベントを lnr.fr の試合シートから取り込む

## 背景

**Top 14 2026-27 の終了済み14試合すべてが `match_events` 0件で、レビューが1本も生成されていない。**

`lib/llm/pipeline.ts:247-256` は `eventIntegrity.reason === "events_unavailable"` のとき recap をスキップする。`lib/llm/stages/assemble.ts:358` が `eventCount === 0` でこれを立てるため、**イベントが無い限り記事は作られない**。この判定は捏造防止として正しく、緩めない（`specs/p3-recap-require-events.md`）。

2026-09-14 実測:

| 大会・シーズン | finished | イベントあり | `wikipedia_url` |
|---|---:|---:|---:|
| Top 14 2024-25 | 6 | 6 | 6 |
| Top 14 2025-26 | 5 | 5 | 5 |
| **Top 14 2026-27** | **14** | **0** | **0** |

**過去2シーズンの11試合はすべてプレーオフ**（6月開催）で、Wikipedia の `div.vevent.summary` から取れていた。`specs/feat-top14-regular-season-backfill.md` が記録するとおり、**レギュラーシーズンは Wikipedia に試合単位の日付すら存在せず**（英語版は 14×14 のスコア表）、`docs/decisions.md:327`（D016 決定5）は「**Top 14 のレギュラーシーズンは Wikipedia では修復不能**」と結論している。

2026-27 は取り込み元が lnr.fr に移り、`external_ids` は `source: "lnr.fr"` / `top14_lnr_match_path` を持ち **`wikipedia_event_id` を持たない**。したがって `scripts/backfill-top14-match-events.ts`（Wikipedia の sectionId で vevent を特定する）は **2026-27 に適用できない**。

### 何が失われているか

イベント0件で recap 候補に残り続ける44試合のうち14試合が Top 14 で、**その14試合すべてが `match_sourced_facts` を保有している**（1試合7〜26件、計220件）。**事実の収集は成功していて、落ちているのは得点イベントだけである。**

さらに `lib/cron/orchestrate.ts` の recap 候補はキックオフの新しい順で、`RECAP_BATCH_SIZE = 10` の10枠が現在すべてイベント0件の試合で占有されている（`specs/feat-notify-recap-generation-skipped.md` 参照）。

## 取得元の調査結果（2026-09-14、`fetchWithPolicy` で実測）

**得点データは SSR HTML に JSON として埋まっている。JS レンダリングは不要。**

試合シートの `/resumes-replays` に次の形で存在する。

```html
<header-timeline :fixture-id='11832' :game-facts='[{
  "type":"Point","subtype":"Essai","slugType":"point","slugSubType":"essai",
  "club":"home","period":1,"minute":16,"additionalMinute":0,
  "score":[5,0],
  "player":{"firstName":"Kalvin","lastName":"GOURGUES", ...}
}, ...]'>
```

- `__NUXT__` / `__NEXT_DATA__` / `type="application/json"` のスクリプトは**いずれも0件**
- `cheerio` の `$("header-timeline").attr(":game-facts")` で取得でき、`JSON.parse` できることを実測で確認した
- 試合シートのルートにも同一の payload がある（`<vertical-timeline> :items` も同じ内容・同じ長さ）。**本 spec は `/resumes-replays` を使う**。2試合で実測したのがこちらであるため
- 兄弟サブページは `/compositions` `/resumes-replays` `/statistiques-du-match` の3つのみ

### 観測した語彙

| 試合 | `slugSubType` の内訳 |
|---|---|
| `11832-toulouse-bordeaux-begles`（48-12） | `Point/essai` 10 |
| `11828-clermont-paris`（25-16） | `Point/essai` 4 / **`Point/penalite` 5** / **`Exclusion joueur/jaune` 1** |

**`Point` 以外に `Exclusion joueur` が存在する。** カードは現在どの経路でも取得できていないため（`docs/chatgpt-prompts/weekend-recap-facts.md:122`）、これは副次的な収穫にあたる。

**ドロップゴール・レッドカード・ペナルティトライの綴りは未観測である。** 本 spec はこれを推測せず、**未知の `slugSubType` は例外で停止させる**（後述）。

### 変換はイベントとして存在しない。`score` の差分から決まる

`game-facts` に `transformation` は現れない。**しかし `score` は変換分を含んで動く。**

`11828-clermont-paris` の全10件（直接観測）:

```
min=6   away penalite  [0,3]   +3      min=48  away penalite  [6,9]   +3
min=16  home penalite  [3,3]   +3      min=52  home essai     [13,9]  +7 ← 変換あり
min=29  away penalite  [3,6]   +3      min=63  home essai     [20,9]  +7 ← 変換あり
min=43  away jaune     [3,6]   +0      min=71  away essai     [20,16] +7 ← 変換あり
min=45  home penalite  [6,6]   +3      min=73  home essai     [25,16] +5 ← 変換なし
```

**変換は `score` の差分から導く。** これは推測ではなく算術で一意に決まる。**蹴った選手だけが不明である。**

**ただし「トライ行の差分だけを見る」のは誤りである（2026-09-14 訂正）。** 変換が別の fact の行に計上されることがある。詳細は「3. 変換の導出」を参照。

検算: ホーム `3×5 + 2×2 + 2×3 = 25` / アウェイ `1×5 + 1×2 + 3×3 = 16`。**実際のスコア 25-16 と一致する。**

`11832` も同じ規則で成立する。トライ10本・最終 48-12 は、ホーム8トライ（`8×5 + 4×2 = 48`）・アウェイ2トライ（`2×5 + 1×2 = 12`）以外に解が無い。**この試合は PG が0本だっただけである。**

## スコープ

対象:

- `lib/scrapers/top14-lnr-match-events.ts`（新規）— `:game-facts` を解析し `ParsedPlayerMatchEvent[]` を返す読み取り専用スクレイパー
- `scripts/backfill-top14-lnr-match-events.ts`（新規）— 終了済みかつイベント0件の試合を対象にするバックフィル CLI
- `app/api/cron/ingest-top14-match-events/route.ts`（新規）＋ `.github/workflows/cron-ingest-top14-match-events.yml`（新規）
- `lib/ingestion/events.ts` の `resolvePlayerId` — **選手名が空のとき照合しない**ガード（後述）

対象外:

- **`lib/ingestion/live-ingest.ts` への統合。** 同ファイル `:431-443` はイベントを `rawHtml` から解析するが、`lib/ingestion/sources/top14-lnr-live.ts:79` は `rawHtml: ""` を返す。試合シートは節別ページとは別 URL なので、**どの経路でも試合ごとの追加リクエストが必要**であり、live 経路に混ぜるとリクエスト量の制約（後述）に抵触する
- **他大会への展開。** `feat-top14-team-stats.md:7` の9大会横断調査では Top 14 公式だけが静的 HTML で取得でき、他8大会は JS 必須
- **チームスタッツ**（`feat-top14-team-stats.md` の対象。`match_team_stats` は現在も全期間0行）
- **2026-27 より前のシーズン**。過去11試合は既にイベントを持つ
- `events_unavailable` ゲートの変更
- ラインアップ（`/compositions`）

## Owner の承認が必要な事項

**試合シートは1試合1リクエストであり、これは既存の判断が抑制してきた取得パターンにあたる。**

`docs/decisions.md:678` は 2026-08-29 の判断を次のように記録している。

> 節単位・1回3節上限・節間3秒・全26節の一括取得はしない

背景は `specs/feat-top14-lnr-live-source.md:59` で、**フランスの sui generis データベース権**により「実質的な部分の抽出」が制限され得るためであり、同 `:231` は**法的な最終判断を Owner に委ねる**としている。

本 spec は次の制約下で実装する。**この制約と、定期実行を有効化するかどうかは Owner の承認事項である。**

- `MAX_TOP14_LNR_MATCHES_PER_RUN = 7`（1節分）を定数として持つ
- `TOP14_LNR_MATCH_DELAY_MS = 3_000`（既存 `TOP14_LNR_ROUND_DELAY_MS` と同値）を試合間に入れる
- **終了済みかつ `match_events` が0件の試合だけ**を対象にする。取得済みの試合を取り直さない
- 初回の14試合は CLI を複数回に分けて実行する

## データモデル変更

なし。既存の `match_events` と `matches.external_ids` を使う。

## API サーフェス

### 1. スクレイパー

`lib/scrapers/top14-match-stats.ts:368-383` の `buildTop14MatchStatsUrl` / `fetchTop14MatchStats` と**同じ形にすること**。

```ts
export function buildTop14LnrMatchEventsUrl(matchPath: string): string;
export function parseTop14LnrGameFactsHtml(html: string): ParsedPlayerMatchEvent[];
export async function fetchTop14LnrMatchEvents(matchPath: string): Promise<ParsedPlayerMatchEvent[]>;
```

`buildTop14LnrMatchEventsUrl` は `matchPath` の末尾に `/resumes-replays` を付ける。**既存関数が `endsWith("/statistiques-du-match")` を先に判定しているのと同じ形で、二重付与を防ぐこと。**

`matchPath` は `matches.external_ids.top14_lnr_match_path` に**全試合分が保存済み**である（例: `/feuille-de-match/2026-2027/j2/11832-toulouse-bordeaux-begles`）。**名寄せの実装は不要。**

### 2. 種別の対応表

```
Point / essai              → "try"
Point / penalite           → "penalty_goal"
Exclusion joueur / jaune   → "yellow_card"
（差分が +7 のトライから生成） → "conversion"
```

**上記以外の `slugSubType` を見つけたら例外を投げて停止すること。黙って読み飛ばさない。**

読み飛ばすと得点合計が最終スコアと合わず、`upsertMatchEvents` の同一性ガードが `score_mismatch` で拒否する。**そのとき原因が「未知の種別があった」ことだと分からなくなる。** 例外メッセージには実際の `type` と `slugSubType` を含める。

**ペナルティトライは `essai` として現れない前提に依存しない。** ペナルティトライも +7 なので差分だけでは変換付きトライと区別できないが、**別の `slugSubType` を持つなら未知種別として停止するため安全側に倒れる。**

### 3. 変換の導出（2026-09-14 訂正）

**すべての fact について、両クラブ分の `score` 差分を直前の fact から求め、差分からイベントを導く。**

| クラブ側の差分 | 生成するもの |
|---:|---|
| 0 | なし |
| **+2** | **`conversion`**（**どの種別の fact に乗っていても拾う**） |
| +3 | `penalty_goal` |
| +5 | `try` |
| +7 | `try` ＋ `conversion`（`minute` は同じ） |
| それ以外 | **例外で停止** |

`minute` は差分が現れた fact の `minute` を使う。

**この形なら合計は構造的に一致する。** すべての差分をイベントに変換するため、取りこぼしが原理的に起きない。

#### なぜ訂正したか

**初版は「各 `Point/essai` のクラブ側の増分だけ」を見ていた。** 2026-09-14 の本番 dry-run で、ペルピニャン×カストル（43-29）が **41-29** となり2点不足して停止した。

```
min=46 home essai  [29,15] +5   ← トライ（この時点では変換なしと判定）
min=47 away jaune  [31,15] +2 on HOME  ← 46分のトライの変換が、カード行に乗っている
```

**LNR は得点を必ずしも得点イベントの行に載せない。** 検証に使った2試合（クレルモン・トゥールーズ）ではたまたま全変換がトライ行に乗っていたため、**2試合の観測から誤って一般化した**。

**この停止自体は設計どおりに機能した。** `upsertMatchEvents` を呼ぶ前に `eventTotalsMatchFinalScore` が弾いたため、**誤ったイベントは1件も書き込まれていない。**

`conversion` の `playerName` は **空文字 `""`** とする。`game-facts` に蹴り手が含まれないため。**推測で埋めないこと。**

`lib/llm/stages/assemble.ts:269` が `player_name || null` で正規化し、`components/match-events-section.tsx:201` が `"—"` を選手不明の番兵として扱い、`lib/format/match-timeline.ts:5` が `playerName: string | null` を許容する。**UI 側の追加実装は不要である。**

### 4. `resolvePlayerId` のガード

`lib/ingestion/events.ts:112-122` は現在こうなっている。

```ts
const { data, error } = await db
  .from("players")
  .select("id")
  .eq("team_id", params.teamId)
  .ilike("name", `%${params.playerName}%`);
```

**`playerName` が空文字だと `%%` になり、そのチームの全選手に一致する。** 登録選手がちょうど1人のチームでは `data.length === 1` が成立し、**無関係な選手が変換の得点者として紐付く。**

2026-09-14 実測では**該当するチームは存在しない**（登録0人が60チーム、次は23人。ちょうど1人のチームは0）。**現時点で実害は無いが、1人だけ登録された瞬間に成立する。**

**`playerName` を trim して空なら、DB を引かずに `null` を返すこと。**

Top 14 の14チームは**全て登録選手0人**であるため、**本 spec で投入するイベントは全件 `player_id = null` になる。これは異常ではない。** `onUnresolvedPlayer` が毎回発火するが、**失敗として扱ってはならない。**

### 5. バックフィル CLI

```bash
pnpm tsx scripts/backfill-top14-lnr-match-events.ts [--limit=7] [--dry-run]
```

対象の抽出条件（**この条件から外れて書き換えないこと**）:

- `competitions.family = 'top-14'` かつ `season = '2026-27'`
- `matches.status = 'finished'`
- `match_events` が0件
- `external_ids->>'top14_lnr_match_path'` が非 null
- キックオフの新しい順、`--limit`（既定 `MAX_TOP14_LNR_MATCHES_PER_RUN`）件まで

保存は `upsertMatchEvents` を使い、戻り値に `assertEventInsertionAccepted` を適用する。**拒否されたら次の試合へ進まず、その試合の内訳を出力して停止すること。**

### 6. cron

`app/api/cron/ingest-top14-match-events/route.ts` は CLI と同じ抽出条件で動く。`assertCronAuthorized` を使う。

**`.github/workflows/cron-ingest-top14-match-events.yml` の `schedule` は、Owner が承認するまでコメントアウトしておくこと。** `workflow_dispatch` は有効にする。

## UI サーフェス

なし。`components/match-events-section.tsx:17-24` の `EVENT_TYPE_LABEL` は `conversion` / `drop_goal` / `penalty_goal` / `red_card` / `try` / `yellow_card` を**すべて定義済み**である。

## LLM 連携

なし。イベントが入れば既存の recap 生成が他大会と同じ経路で動く。

## テストのフィクスチャ

**実ページから取得した `:game-facts` の JSON をそのまま保存して使うこと。手で組んだ HTML を使わない**（`feedback_scraper_test_fixture_realism` の教訓。手作りフィクスチャは実データで壊れた実績がある）。

2試合分を `tests/fixtures/` に保存する。

| フィクスチャ | 中身 |
|---|---|
| `top14-lnr-11828-clermont-paris.json` | `Point/essai` 4・`Point/penalite` 5・`Exclusion joueur/jaune` 1。最終 25-16 |
| `top14-lnr-11832-toulouse-bordeaux.json` | `Point/essai` 10。最終 48-12 |
| `top14-lnr-11826-perpignan-castres.json` | `Point/essai` 10・`Point/penalite` 2・`Exclusion joueur/jaune` 3。最終 43-29。**変換がカード行に乗るケースを含む（2026-09-14 追加）** |

## 受け入れ条件

1. `buildTop14LnrMatchEventsUrl("/feuille-de-match/2026-2027/j2/11832-toulouse-bordeaux-begles")` が `.../11832-toulouse-bordeaux-begles/resumes-replays` を返す
2. 既に `/resumes-replays` で終わる入力に対して**二重付与しない**
3. `11828` のフィクスチャを解析すると、**イベントが13件**返る（`try` 4・`conversion` 3・`penalty_goal` 5・`yellow_card` 1）
4. `11828` の `try` の分が **52 / 63 / 71 / 73**、`conversion` の分が **52 / 63 / 71** である
5. `11828` の `teamSide` 別の得点合計が **ホーム25・アウェイ16** になる（`pointsForMatchEvent` で合算して確認すること）
6. `11832` のフィクスチャを解析すると **`try` 10件・`conversion` 5件**、`penalty_goal` と `yellow_card` は**0件**で、得点合計が **ホーム48・アウェイ12** になる
7. `club: "home"` が `teamSide: "home"`、`"away"` が `"away"` に対応する
8. `slugSubType` が未知の値のとき、**例外を投げる**。例外メッセージに実際の `type` と `slugSubType` が含まれる。**読み飛ばして正常終了しない**
9. トライのスコア増分が 7 でも 5 でもないとき、**例外を投げる**
10. `conversion` の `playerName` が空文字であり、`try` の得点者名で埋められていない
11. `minute` は `game-facts` の `minute` をそのまま使う。`additionalMinute` を加算しない（`11832` には `40+2` と `80+3` が存在する）
12. `resolvePlayerId` に空文字または空白のみの `playerName` を渡すと、**`players` テーブルを1回も参照せずに `null` を返す**
13. `resolvePlayerId` に非空の `playerName` を渡したときの挙動が**変わっていない**
14. CLI が `--dry-run` で、対象試合数と各試合の解析結果の件数を出力し、**DB に書き込まない**
15. CLI が既定で `MAX_TOP14_LNR_MATCHES_PER_RUN` 件を超えて処理しない
16. CLI が試合と試合の間に `TOP14_LNR_MATCH_DELAY_MS` 待機する
17. `upsertMatchEvents` が拒否を返したとき、CLI が**その試合の拒否理由を出力して停止する**
18. `.github/workflows/cron-ingest-top14-match-events.yml` の `schedule` が**コメントアウトされている**
19. 既存の Wikipedia 経由のイベント解析（`parseMatchEventsFromVeventHtml` / `scripts/backfill-top14-match-events.ts`）に差分が無い
20. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

**以下は 2026-09-14 の訂正で追加した条件である。**

21. `11826` のフィクスチャを解析すると、**イベントが23件**返る（`try` 10・`conversion` 8・`penalty_goal` 2・`yellow_card` 3）。`teamSide` 別の得点合計が **ホーム43・アウェイ29** になる
22. `11826` の `conversion` の分に **47 が含まれる**。これは46分のトライの変換が**47分のカード行に計上されている**ケースであり、**トライ行の差分だけを見る実装では検出できない**
23. どの fact であっても、クラブ側の差分が **0・2・3・5・7 のいずれでもないとき例外を投げる**。例外メッセージに差分の値と分を含める

## 検証（PR 本文に書くこと）

### RED になる条件（2026-09-14 訂正版）

**初版の実装は PR #822 でマージ済みである。** したがって条件 1〜20 は**すでに通っている**。今回の訂正で**新たに落ちるのは 21・22・23 だけ**である。

| # | 現行実装（PR #822） |
|---|---|
| **21** | **RED**。現行は22件・**41-29** を返す（変換を1本取りこぼす） |
| **22** | **RED**。現行の `conversion` の分は 15/19/25/31/52/63/75 で、**47 を含まない** |
| **23** | **RED**。現行はカード行の +2 差分を**黙って無視する**（例外を投げない） |
| 1〜20 | GREEN（既存挙動の保護。**訂正後も数字が変わらないことを 2026-09-14 に3フィクスチャで実測済み**） |

**条件 3・4・5・6 が訂正後も変わらないことは確認済みである。** クレルモン13件・トゥールーズ15件はいずれも全変換がトライ行に乗っていたため、規則を変えても結果が同一になる。**期待値を推測で書き換えていない。**

### 実装後に意図的に壊して確認すること

**13・19 は自明に通るため、壊して初めて検出力が確認できる。**

| 壊し方 | 落ちるべき条件 |
|---|---|
| `resolvePlayerId` のガードを「空文字でも DB を引く」に戻す | **12**（13 は通ったまま） |
| 未知の `slugSubType` を `continue` で読み飛ばす | **8** |
| 変換の `playerName` にトライの得点者名を入れる | **10** |
| `minute` に `additionalMinute` を加算する | **11** |

**特に3つ目に注意すること。** 変換にトライの得点者名を入れても、件数も得点合計も変わらないため **条件3・5・6 はすべて通る。** 条件10だけが検出する。

### 本番での確認

CLI を `--dry-run` で実行し、**14試合すべてで解析結果の得点合計が `matches.home_score` / `away_score` と一致すること**を出力で示すこと。1件でも一致しない試合があれば、その `slugSubType` の内訳を報告し、**実装を進めずに Owner に確認する。**

## デプロイ後に Owner が確認すること

- Top 14 の試合詳細ページに得点経過グラフが表示される
- 翌朝の run で `specs/feat-notify-recap-generation-skipped.md` の Discord 通知の件数が **14件分減る**
- Top 14 のレビューが公開される。**本文に PG やカードへの言及が入っているか**を1本目で目視する

## 未解決の質問

- **定期実行を有効にするか。** 1試合1リクエストは 2026-08-29 の判断が抑制してきた取得パターンにあたる。**Owner の承認事項**
- **ドロップゴール・レッドカード・ペナルティトライの `slugSubType`。** 未観測。出現した時点で例外が上がるので、そのときに対応表へ追加する
- **過去シーズンへの適用。** 2025-26 以前は既にイベントを持つため不要だが、`feat-top14-regular-season-backfill.md` がレギュラーシーズンを投入した場合は対象になる
