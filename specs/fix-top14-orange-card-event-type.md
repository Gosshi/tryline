# Top 14 のオレンジカードでイベント取り込みが停止する問題

## 背景

2026-09-16、PR #842（`b689b04`）の修正により、Top 14 のイベント取り込みが**初めて j1（9/5-6）に到達した**。しかし1試合を投入した直後に例外で停止した。

```
HTTP 500
{"detail":"Unknown Top 14 game-fact subtype: type=Exclusion joueur slugSubType=orange"}
```

`lib/scrapers/top14-lnr-match-events.ts` の `eventType` が対応しているのは `essai` / `penalite` / `jaune` / `rouge` の4つで、**`orange`（カルトン・オランジュ）が未対応**だった。未知の subtype は例外を投げる実装のため、**1件の未知データがバッチ全体を落とす**。

実行後の本番状態（2026-09-16 10:24 UTC 時点）:

| 試合 | スコア | イベント | 得点合計の照合 |
|---|---|---:|---|
| 9/06 ラ・ロシェル × トゥールーズ（`11822`） | 30-27 | **19件** | **一致** |
| 9/05 の6試合 | — | **0件** | — |

**投入済みの1件は正しい**（得点合計がスコアと一致）。残り6試合は未着手で、部分的に壊れた状態ではない。

停止した試合は **ボルドー・ベーグル × ラシン92（9/05 19:15、64-5、`/feuille-de-match/2026-2027/j1/11820-bordeaux-begles-racing-92`）** と推定される。キックオフ降順の処理順で、投入済みのラ・ロシェル戦の次に来る唯一の試合であるため。**実装時は当該ページの `game-facts` を実際に確認すること。**

イベントが0件の試合は recap 生成でスキップされるため、**この6試合はレビューを作れない**。

## Owner の決定（2026-09-16）

**オレンジカードは `red_card` として保存する。** `match_events` の CHECK 制約は `try` / `conversion` / `penalty_goal` / `drop_goal` / `yellow_card` / `red_card` / `substitution` のみを許可しており、**`red_card` は既存の値なのでマイグレーションは不要**。

## スコープ

**対象:**
- `lib/scrapers/top14-lnr-match-events.ts` の `eventType` に `Exclusion joueur` / `orange` の分岐を追加
- `tests/scrapers/top14-lnr-match-events.test.ts` にオレンジカードの変換テストを追加

**対象外:**
- `match_events` の CHECK 制約の変更（`orange_card` 型の新設はしない）
- カードの UI 表示、記事本文での扱い
- 得点差分（`scoreEventsForIncrement`）のロジック
- レート制限（`TOP14_LNR_MATCH_DELAY_MS = 3_000`）とバッチ上限（`MAX_TOP14_LNR_MATCHES_PER_RUN = 7`）
- **未知の subtype でバッチ全体を停止させる設計そのもの**（未解決の質問1を参照。本 spec では変えない）
- 候補ウィンドウの制約で26件のギャップが到達不能な件（別課題。[[specs/fix-event-gap-query-embedded-filter.md]] の後続）

## データモデル変更

**なし。マイグレーション不要。**

## API サーフェス

`eventType` に分岐を1つ足すだけでよい。

```ts
if (fact.type === "Exclusion joueur" && fact.slugSubType === "orange") {
  return "red_card";
}
```

**イベント生成側は変更不要。** `parseTop14LnrGameFactsHtml` のカード出力は `if (factType === "yellow_card" || factType === "red_card")` で分岐しており、`orange` を `red_card` に写像すれば既存経路をそのまま通る。カード fact はスコア差分0なので、得点イベントは生成されない（`scoreEventsForIncrement` が `increment === 0` で空配列を返す既存挙動）。

## UI サーフェス

なし。既存のカード表示がそのまま適用される。

## LLM 連携

なし。スクレイパーと DB 書き込みのみ。**LLM 費用の増減はゼロ。**

## 受け入れ条件

1. `type = "Exclusion joueur"` / `slugSubType = "orange"` の fact が **`red_card` のイベント1件**に変換される。`playerName` はその fact の選手名、`minute` は fact の `minute` をそのまま、`teamSide` は fact の `club` に従う。
2. 同じ fact から**得点イベントが生成されない**（スコア差分0）。オレンジカードを含むフィクスチャ全体で、`teamSide` 別の得点合計が変化しないことを確認する。
3. 既存の `jaune` → `yellow_card`、`rouge` → `red_card` の変換が**変わっていない**（既存テスト `parses LNR red-card facts` が通り続ける）。
4. **`orange` 以外の未知 subtype は引き続き例外を投げる。** 既存テスト `rejects an unknown game-fact subtype instead of ignoring it` が通り続け、例外メッセージに `type` と `slugSubType` の両方が含まれる。
5. **意図的破壊の確認**: 追加した `orange` の分岐を一時的に削除すると、受け入れ条件1のテストが**実際に落ちる**ことを確かめ、結果を PR 本文に書く。
6. `pnpm typecheck` / `pnpm lint` / `pnpm test` が通る。テスト総数が **311 files / 1,906 tests** から減っていない。

### 本番での検証（Owner 承認のうえ実施。Codex は実行しない）

7. 手動 `workflow_dispatch` で `cron-ingest-top14-match-events` を実行すると、**j1 の残り6試合すべてにイベントが入る**。各試合で、`try=5 / conversion=2 / penalty_goal=3 / drop_goal=3` で集計した `teamSide` 別合計が `matches.home_score` / `away_score` と一致する。特にボルドー × ラシン92（64-5）を確認する。
8. 実行後、Top 14 2026-27 の `finished` 14試合すべてがイベントを持ち、イベント0件の試合が**0件**になる（2026-09-16 時点で j1 の6件が残っている状態からの変化として数える）。

## 未解決の質問

1. **未知の語彙でバッチ全体を停止させる設計を変えるか。** 現状は未知 subtype が1件あるだけで、その run の残り全試合が処理されない。**推奨案**: 得点に関わらない fact（`Exclusion joueur` 系）の未知 subtype は、そのイベントだけ飛ばして件数をレスポンスに残し処理を続行する。得点に関わる fact（`Point` 系）の未知 subtype は従来どおり停止させ、スコア整合のガードを維持する。**この変更は Owner 承認後に別 spec とする。**
2. 他の未観測語彙（ドロップゴール、ペナルティトライ等）がいつ現れるかは不明。1 の方針が入るまでは、現れるたびに同じ停止が起きる。
