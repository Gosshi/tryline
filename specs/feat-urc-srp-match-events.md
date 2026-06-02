# URC / Super Rugby Pacific のイベント取り込み（recap 成立のためのデータギャップ解消）

## 背景

捏造修正（[[fix-content-fabrication]] / `specs/fix-content-fabrication.md`）の過程で、本番 Supabase（`rtoljbvqvbxcgpesohpt`）を直接精査し、**イベント取り込みの構造的ギャップ**が判明した（2026-06-02 実測）。

### 大会別 イベント取り込み率（終了試合）
| 大会 | events有 | events無 | 率 |
|------|-----:|-----:|---:|
| **urc** | 5 | **150** | **3%** |
| **super-rugby-pacific** | 17 | **143** | **11%** |
| premiership | 118 | 40 | 75% |
| league-one | 220 | 6 | 97% |
| six-nations / rwc / pnc / top-14 / rugby-championship / autumn-nations | — | ~0-1 | ほぼ100% |

### ギャップ試合の Wikipedia ソース保有状況
| 大会 | ギャップ | wikipedia_url 有 | wikipedia_event_id 有 |
|------|-----:|-----:|-----:|
| urc | 150 | 138 | 150 |
| super-rugby-pacific | 143 | 83 | 143 |

### なぜ起きたか
- イベント源は **Wikipedia**（`lib/scrapers/wikipedia-match-events.ts` の `parseMatchEventsFromVeventHtml` ＝汎用 vevent パーサ）。
- 汎用 vevent で取れる大会（six-nations / premiership / rwc 等）は埋まっている。`scripts/fill-event-gaps.ts` がイベント無し終了試合を検出し汎用パーサで埋める。
- **URC**: 汎用 vevent では構造が合わず、専用パーサ `lib/scrapers/wikipedia-urc-match-details.ts`（`parseWikipediaUrcMatchDetailsHtml`、events を返す）が作られている。だが**全 URC 試合への backfill が回っておらず 3% のまま**。
- **Super Rugby Pacific**: `wikipedia-super-rugby-pacific-results.ts`（結果＝スコアのみ）はあるが、**イベント/match-details パーサが存在しない**。さらにギャップ143件中 wikipedia_url を持つのは83件のみ。

### なぜ今これが問題か（捏造対策の副作用）
捏造ガード稼働後、**イベント0件の試合は recap が skip され生成されない**（`lib/llm/pipeline.ts:82`）。よって URC/SRP は**過去分（draft 降格済み65件）だけでなく、今後の新規試合も recap が作られない**。SRP は進行中シーズン（2026）であり、2大会が「recap 空白」になる product 影響がある。

### 検証結果（2026-06-02・`fill-event-gaps.ts --limit=2000` 本実行で実測）
**汎用 `fill-event-gaps`（vevent パーサ）を全件本実行した結果（Filled 123/268）:**

- **premiership: 100% 達成**（ギャップ40件 filled）。汎用パーサで OK。
- **SRP: 17→100 件 events 取得（回収成功）**。SRP の試合は `List_of_2025_Super_Rugby_Pacific_matches` ページに全試合の得点詳細があり、汎用 vevent パーサで取れる。**残60件は `wikipedia_url` が `2025_Super_Rugby_Pacific_season`（決勝のみ）を指す or URL 欠落**が原因 → URL を List ページに直せば回収可能。
  - 注: 当初 season ページだけ見て「SRP は Wikipedia に無い」と誤判断したが、List ページに存在した。**実行が正しかった。**
- **URC: 全件 `no events parsed`（汎用パーサで取れない）**。URC は構造が異なり、**専用パーサ `parseWikipediaUrcMatchDetailsHtml` が必須**。これが本 spec の主スコープ（後述）。
- league-one 6件: `external_ids.wikipedia_url` が**スペイン語版**（es.wikipedia）を指し parse 失敗 → 英語版 URL に修正要。
- rwc 1件: URL が 404（`2023_Rugby_World_Cup_third-place_play-off`）→ URL 修正 or 対象外。**さらに fill-event-gaps はこの 404 で例外停止した＝fetch 失敗を catch して継続すべき軽微バグ。**

## スコープ

**対象（実装が要るのは主に URC。他は URL 修正＋小バグ）:**
- **URC イベント backfill（主タスク・要実装）**: 汎用 vevent では取れないことが本実行で確定。既存 `parseWikipediaUrcMatchDetailsHtml` を使う backfill スクリプトを用意（`scripts/backfill-premiership-match-events.ts` 等と同型、または `backfill-club-match-details.ts` の URC 対応拡張）。`Round_N_Team_v_Team` の event_id でブロックを切り出す。150件中138件が wikipedia_url 保有、過去シーズンは別 URL（`2024–25 United Rugby Championship` 等）。
- **SRP 残60件の URL 修正（データ修正）**: `wikipedia_url` が `2025_Super_Rugby_Pacific_season`（決勝のみ）や欠落になっている分を `List_of_<year>_Super_Rugby_Pacific_matches` に直し、`fill-event-gaps.ts` を再実行。SRPの100件は既に汎用パーサで取得済み。
- **league-one 6件の URL 修正**: es.wikipedia → 英語版 Wikipedia URL に修正して再実行。
- **rwc 1件の URL 修正**: 404 URL を正しいページに。
- **`fill-event-gaps.ts` の堅牢化（軽微バグ）**: fetch 失敗（404等）を catch して当該試合を skip し**全体を止めない**（今回 rwc 404 で例外停止した）。
- backfill 後、`scripts/regenerate-overseas-content.ts --content-type recap --match-ids-file ./fabricated-ids.txt --confirm-owner-approved`（または `--family`）で recap を再生成。

**対象外:**
- premiership / SRP(取得済み100件) / その他 … 汎用 `scripts/fill-event-gaps.ts` で**既に回収済み**（2026-06-02 実行・Filled 123/268）。
- 新統計指標（成功率・テリトリー等）の取り込み … データモデルに無く、[[fix-content-fabrication]] の方針どおり恒久的に「書かせない」。本 spec はイベント（実在の得点経過）のみ。

## データモデル変更
なし（既存 `match_events` / `matches.external_ids` を使用）。SRP の URL 補完は `matches.external_ids` の更新のみ。

## スクレイピング / コンプライアンス
- 取得は Wikipedia のみ。`lib/scrapers/fetcher.ts` の `fetchWithPolicy`（robots.txt 準拠・レート制限）を必ず経由。
- 既存 backfill と同じ作法（`scripts/backfill-rwc-match-events.ts` 等）を踏襲。User-Agent 偽装・rate limit 回避はしない。

## 受け入れ条件
1. URC: ギャップ150件のうち wikipedia_url を持つ試合のイベント取り込み率が大幅に上がる（目標: URC 終了試合の events 有が 3% → 80%+）。
2. SRP: `wikipedia-super-rugby-pacific-match-details.ts` が SRP Wikipedia ページからイベントを抽出するユニットテスト付き（固定 HTML フィクスチャ）。wikipedia_url のある83件＋URL補完分でイベント取り込み。
3. backfill は `--dry-run` と Owner 承認ゲートを持つ（[[fix-content-fabrication]] のコスト保護に準拠。LLM は使わないがスクレイプ量が出るため）。
4. backfill 後に recap 再生成し、URC/SRP の draft 降格 recap（65件のうちイベントが入ったもの）が **published のクリーン recap に復活**。捏造マーカーは0。
5. 既存の他大会のイベント・取り込みを壊さない。

## 未解決の質問（Owner 判断）
1. **SRP をどうするか（検証済み: Wikipedia 不可）**: SRP のレギュラー戦 events は Wikipedia に無い。回収するなら**別データソース選定**（公式 Super Rugby / 統計プロバイダ等）が必要で、ライセンス・robots・信頼性・工数を含む独立案件。**推奨は当面 descope**（SRP は recap 空白を受容）。0→1 局面での投資対効果は低い。
2. **URC は Part 1 で済むか専用 backfill が要るか**: `fill-event-gaps.ts --dry-run` の出力で判定（汎用パーサが `Round_N_Team_v_Team` アンカーから URC events を拾えるか）。拾えれば本 spec の URC スコープも消え、運用手順だけで完了。
3. **URC の URL 欠落12件**: results 取り込み時に各季節ページの URL を保存していたか。欠落分は URL 補完するか recap 対象外で割り切るか（12件と小さいので後者でも可）。

## 補足: Part 1（即時層・本 spec のコード変更不要）
premiership/LO/rwc（計47件・うち旧捏造22件）は既存ツールで回収:
```
pnpm tsx scripts/fill-event-gaps.ts --dry-run --limit=500   # 確認
pnpm tsx scripts/fill-event-gaps.ts --limit=500             # 実行
pnpm tsx scripts/regenerate-overseas-content.ts --content-type recap --match-ids-file ./fabricated-ids.txt --confirm-owner-approved
```
dry-run 出力で URC が汎用パーサで拾えるなら、URC も Part 1 に昇格し本 spec の URC スコープは縮小する。
