# 生成不能な試合が recap バッチ枠を占有し、1回の実行で1本しか作れない問題

## 背景

2026-09-16 の Discord 通知で表面化した。

```
⚠️ recap 生成をスキップ（イベント不足）
スキップ: 9件 / バッチ枠 10件
理由別: events_unavailable 9件
```

**10枠のうち9枠が「イベントが無く、絶対に生成できない試合」に消費されている。** その結果、1回の実行で作れる recap は実質1本になっている。

`lib/cron/orchestrate.ts` の `runOrchestrate` は、`getMatchIdsMissingContent`（recap 未作成の `finished` 試合を `kickoff_at` 降順で全件取得）の結果から `eligibleMatches.slice(0, RECAP_BATCH_SIZE)` で先頭10件を取る。**イベントの有無は候補選定で一切見ていない。** 生成不能な試合は recap が作られないため候補リストの先頭に居座り続け、**翌日以降も同じ試合が同じ枠を食う。**

### 本番実測（2026-09-16）

recap 候補（`status = finished`、キックオフから12時間以上経過、recap 未作成）:

| | 件数 |
|---|---:|
| 候補 合計 | **98** |
| **イベント0件で生成不能** | **36** |
| 生成可能（イベントあり） | **62** |
| うち sourced facts は持つのにイベントが無い | 19 |

最古の候補は 2025-09-26、生成不能のうち最新は 2026-09-05 19:15（ボルドー × ラシン92）。

**62件の生成可能な試合が、36件の生成不能な試合の後ろで滞留している。** 現状のペース（1回1本）では消化に2か月かかる。

### この spec の位置づけ

`specs/feat-notify-recap-generation-skipped.md`（PR #820）が**対象外として明記して残した続き**である。

> **生成不能な試合をバッチ選択から除外すること。** 枠の占有そのものを解く変更であり、除外条件の設計を伴う。本 spec は「見えるようにする」までで止める

#820 で「見えるようになった」結果が冒頭の通知であり、本 spec で「枠を食わないようにする」を行う。

## スコープ

**対象:**
- recap の候補選定で、`match_events` を1件も持たない試合をバッチから除外する
- 除外した件数と試合を Discord 通知に残す（見えなくしない）

**対象外:**
- **`p3-recap-require-events.md` のガード**（`match_events` が0件なら LLM を呼ばずに `status: "skipped"` を返す）。**弱めない。多層防御として残す**
- **`fix-generation-event-integrity-gate.md` のスコア不一致処理**。イベントを持つが整合しない試合は**従来どおりバッチに入り**、`score_mismatch` として報告される
- preview の候補選定（`previewCandidates`）
- `RECAP_BATCH_SIZE`（10）の値
- イベント欠落36件そのものを埋めること（別課題。`specs/fix-event-gap-query-embedded-filter.md` の後続と、Top 14 のオレンジカード対応 `specs/fix-top14-orange-card-event-type.md`）
- 通知の重複抑制（#820 が対象外としたとおり、同じ試合が毎日鳴ることは許容する）

## データモデル変更

**なし。マイグレーション不要。** 読み取りクエリを1本増やすのみ。

## API サーフェス

`lib/cron/orchestrate.ts` の `runOrchestrate` 内、`recapCandidates` を得た後・`slice(0, RECAP_BATCH_SIZE)` の**前**に、イベント保有の判定を挟む。

1. `recapCandidates.eligibleMatches` の**先頭 `RECAP_EVENT_LOOKUP_CANDIDATES` 件**（新規定数、60 を想定）を対象に、`match_events` から `select("match_id").in("match_id", 対象のid配列)` で取得する。
2. 返った `match_id` の集合に含まれる試合だけを残し、その中から先頭 `RECAP_BATCH_SIZE` 件をバッチとする。
3. 1の範囲で除外された試合（イベント0件）を**除外リスト**として保持する。

**`match_events!left(id)` + `.is("match_events.id", null)` の書き方は使わないこと。** PostgREST では `!left` で埋め込んだリソースへのフィルタが親行を絞り込まず、同じ書き方で3経路が沈黙していた（`specs/fix-event-gap-query-embedded-filter.md`、PR #842）。

`getMatchIdsMissingContent` の戻り値 `skippedCount` は「既にコンテンツがある試合の数」を意味しており、**今回の除外数と混同しないこと。**

### 通知

`RecapSkipReport`（`batchSize` / `matches` / `skippedCount`）に、候補から除外した件数と試合を加える。既存の「スキップ: N件 / バッチ枠 M件」「理由別」の行は**意味を変えない**（バッチ内で生成を試みた結果スキップされた件数のまま）。

除外分は別の行として出す。例:

```
候補から除外（イベント未取得）: 36件
除外の例: <url> / <url> / <url> / <url> ほか32件
```

試合リンクの表示件数は既存の `DATA_INTEGRITY_ACTION_ITEM_LIMIT` に合わせる。**除外が0件のときは、この行を出さない。**

## UI サーフェス

なし。

## LLM 連携

**LLM 呼び出しは増えない。** 生成不能な試合に対しては現状も LLM を呼んでいない（`p3-recap-require-events.md` のガードが先に止めている）。本変更は枠の割り当てを変えるだけであり、**1回の実行で生成される recap が最大1本から最大10本に増える分、LLM コストは増える**。これは意図した効果である（滞留62件の消化）。

## 受け入れ条件

1. イベントを持つ試合3件・持たない試合2件が候補の先頭5件にあり `RECAP_BATCH_SIZE = 3` のとき、**バッチに入るのはイベントを持つ3件**である（持たない2件は `generateContent` を呼ばれない）。
2. 候補の先頭が全てイベント0件でも、**後続のイベントを持つ試合まで到達して枠を埋める**（除外前に `slice` すると0件になるフィクスチャで検証する）。
3. `match_events` の照会が**候補ID限定**（`.in("match_id", ...)`）である。フィルタ無しの全件取得をしない。
4. 除外した件数と試合が Discord 通知に出る。**除外0件のときは当該行を出さない。**
5. 既存の「バッチ内スキップ」の報告が**意味を変えずに残る**。イベントを持つがスコア不整合等でスキップされた試合は、従来どおり `matches` と `理由別` に現れる。既存テストの次の6本が通り続けること。
   - `processes missing recaps from newest finished matches first`
   - `counts recap skips when the recap-skip notifier is unset`
   - `reports all events-unavailable recap skips once per batch`
   - `does not report recap skips when no recap is skipped`
   - `reports only the events-unavailable recap skips in a mixed batch`
   - `returns the orchestration result when recap-skip notification fails`
6. preview の候補選定が変わっていない（`previewCandidates` の経路に差分が無い）。
7. `p3-recap-require-events.md` のガードが残っている。**イベント0件の試合が何らかの経路でバッチに入った場合、従来どおり LLM を呼ばずに `skipped` を返す**ことをテストで確認する。
8. **意図的破壊の確認**: 除外処理を外す（または除外前に `slice` する）と、受け入れ条件1・2のテストが**実際に落ちる**ことを確かめ、結果を PR 本文に書く。
9. `pnpm typecheck` / `pnpm lint` / `pnpm test` が通る。テスト総数が **311 files / 1,906 tests** から減っていない。

### 本番での検証（Owner 承認のうえ実施。Codex は実行しない）

10. 次回の orchestrate 実行で、**生成された recap が2本以上**になる（現状は1本）。同じ実行の通知で「候補から除外」が概ね36件前後になる。

## 未解決の質問

1. **`RECAP_EVENT_LOOKUP_CANDIDATES = 60` でよいか。** 現在の候補98件・生成不能36件なので、先頭60件を見れば10件の生成可能な試合は確実に含まれる（実測では62件が生成可能）。ただし将来イベント欠落が増えると、この値でも枠が埋まらなくなる。**「枠が埋まらなかった実行」を通知で分かるようにするかは Owner 判断。**
2. **滞留62件を一気に消化するか。** 1回10本になると、62件は約6日で消化される。LLM コストが数日集中する。**バッチサイズや実行頻度を変えるかは本 spec の対象外とし、実測を見てから判断する。**
