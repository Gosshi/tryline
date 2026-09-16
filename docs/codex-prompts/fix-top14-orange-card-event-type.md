# Codex 指示書: Top 14 のオレンジカード対応

仕様: `specs/fix-top14-orange-card-event-type.md`（権威。ここに書いていない判断は仕様書に従う）

## やること

Top 14 のイベント取り込みが、LNR の `Exclusion joueur` / `slugSubType = "orange"`（カルトン・オランジュ）で例外を投げて停止している。**Owner の決定により `red_card` として保存する。**

```
{"detail":"Unknown Top 14 game-fact subtype: type=Exclusion joueur slugSubType=orange"}
```

## 変更するファイル

- `lib/scrapers/top14-lnr-match-events.ts` — `eventType` に分岐を1つ追加（`Exclusion joueur` + `orange` → `red_card`）
- `tests/scrapers/top14-lnr-match-events.test.ts` — オレンジカードの変換テストを追加

**それ以外は変更しない。**

## 変更が不要な理由（触らないこと）

- **イベント生成側**: `parseTop14LnrGameFactsHtml` のカード出力は `if (factType === "yellow_card" || factType === "red_card")` なので、`red_card` に写像すれば既存経路を通る
- **DB**: `match_events` の CHECK 制約に `red_card` は既に含まれている。**マイグレーション不要**
- **得点ロジック**: カード fact はスコア差分0で、`scoreEventsForIncrement` が空配列を返す既存挙動のまま

## テストの書き方

既存の慣習に合わせること。`fixtureHtml(facts)` が `<header-timeline :game-facts='...'>` を組み立てる。`it("parses LNR red-card facts")`（143行目付近）が `slugSubType = "rouge"` を扱う先例なので、同じ形でよい。

停止した試合は**ボルドー・ベーグル × ラシン92（64-5、`/feuille-de-match/2026-2027/j1/11820-bordeaux-begles-racing-92`）** と推定している。**推定なので、実際の `game-facts` を確認したうえでフィクスチャを作ること。** 手作りの HTML で済ませず、実データの構造に合わせる。

## 完了の定義

仕様書の受け入れ条件1〜6。特に次を省略しない。

- **AC5（意図的破壊）**: 追加した `orange` の分岐を一時的に消すと、AC1 のテストが**実際に落ちる**ことを確認し、結果を PR 本文に書く。
- **AC4**: `orange` 以外の未知 subtype は引き続き例外を投げること。既存テスト `rejects an unknown game-fact subtype instead of ignoring it` を壊さない。
- **AC2**: オレンジカードから得点イベントが生まれないこと（得点合計が変わらないこと）を検証する。

受け入れ条件7・8（本番での取り込み実行と照合）は **Owner 承認が必要なので Codex 側では実行しない**。PR 本文に「未実施」と明記すること。

## 検証コマンド

```
pnpm typecheck
pnpm lint
pnpm test
```

`pnpm test` のテスト総数が 311 files / 1,906 tests から減っていないことを PR 本文に書くこと。

## 依存

追加パッケージなし。マイグレーションなし。本番DBへの書き込みなし。
