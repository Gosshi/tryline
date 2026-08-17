# Codex 指示: ライブ取り込みが別試合のイベントを書き込む問題を修正

## 仕様書

`specs/fix-live-ingest-event-key-collision.md` を読んでから着手すること。以下は補足であり、仕様の置き換えではない。

## 何が起きたか（一文）

2026-08-16 06:33、`live-ingest` が **8/15 の日本 vs オーストラリア第2戦に、第1戦（8/8）のイベントを書き込んだ**。`upsertMatchEvents` は delete → insert なので、**正しいデータが消えて誤ったデータに置き換わった**。

**推測ではない。** `pipeline_runs` の stage 0 に `{"awayDelta":18,"homeDelta":-24}` が記録され、イベント合計が 32-35（第1戦のスコア）になることを実測で確認済み。

## これは 10% の試合で起きている

イベントを持つ finished 試合 1,011 件のうち **101 件でスコアが一致しない**。うち **17 件は差 10 点超**、**84 件は published recap を持つ**。

（初版は「152 件」と書いていたが、得点計算の定義を誤った集計だった。正しい定義で再集計した値が上記。**重大な 17 件は変わらない。**）

**ただし既存 152 件の復旧は本 spec の対象外。** 先に「これ以上汚染を作らない」ことを実装する。順序を逆にすると、復旧しても次の cron で再汚染される。

## 先に実読すべきファイル

| ファイル | 何を確認するか |
|---|---|
| `lib/ingestion/live-ingest.ts:217-226` | `buildParsedMatchKey`。**日付が入っていない** |
| `lib/ingestion/live-ingest.ts:233-245` | `eventMatchByKey` の構築。**Map で黙って後勝ち上書き** |
| `lib/ingestion/live-ingest.ts:333-372` | イベント割り当てと `upsertMatchEvents` 呼び出し |
| `lib/ingestion/events.ts:60-109` | `upsertMatchEvents` が **delete → insert** であること |
| `lib/llm/pipeline.ts:169-190` | stage 0 のスコア整合性チェック。**同じ計算を取り込み側にも入れる** |
| `lib/ingestion/sources/wikipedia-lipovitan-challenge-cup-events.ts:29-45` | イベント取得元が**単一ページ**でシリーズ全試合を返すこと |

## 直すのは 3 点（優先順）

**1. 保存直前のスコア照合（最重要）**

`upsertMatchEvents` を呼ぶ直前に、`events` の得点合計と `match.homeScore` / `match.awayScore` を比較する。**一致しなければ書き込まない。**

**これが最後の防波堤。** キー設計を直しても別経路で誤りが入る可能性は残るが、この照合があれば「壊れたデータで正しいデータを上書きする」ことは起きない。

**2. マッチキーに日付を含める**

`buildParsedMatchKey` に kickoff 日を足す。同一カードの連戦が別キーになるようにする。

**3. キー衝突の検出**

Map 構築時に既存キーがあれば警告ログ。**黙って上書きしない。**

## 絶対にやってはいけないこと

1. **不一致時に既存イベントを削除しない。** 「どうせ間違っているなら消す」は誤り。**古くても正しいデータのほうが、消えた状態より価値がある**
2. **既存 152 件の修正・削除・再取り込みをしない。** 本 spec の対象外
3. **`upsertMatchEvents` の delete → insert 方式を変えない**
4. **`pipeline.ts` の stage 0 を消さない。** 取り込み側にチェックを足しても、記事生成時のチェックは別の防波堤として残す
5. **各ソースのパーサーを直しに行かない。** 原因がパーサー側にある可能性は残るが（未解決の質問 2）、本 spec の範囲は `live-ingest.ts` のみ
6. **本番で取り込みを実行しない。** 復旧は Owner が判断する

## スコア計算の定義（初版の記載は誤り。訂正済み）

> **2026-08-17 訂正。** 初版は「`penalty_try` 5 点」と書いていたが**誤り**。Codex の指摘が正しい。**ペナルティトライは 7 点**で、`penalty_try` という type は存在しない。以下が正。

**`lib/format/match-event-points.ts` の `pointsForMatchEvent` をそのまま使うこと。新しく計算式を書き起こさない。**

```ts
const PENALTY_TRY_POINTS = 7;   // ← ペナルティトライは 7 点
const TRY_POINTS = 5;

if (event.type === "try") {
  return event.is_penalty_try === true || event.isPenaltyTry === true
    ? PENALTY_TRY_POINTS : TRY_POINTS;
}
if (event.type === "conversion") return 2;
if (event.type === "penalty" || event.type === "penalty_goal" || event.type === "drop_goal") return 3;
return 0;
```

**注意点 3 つ:**

1. **7 点を 5 点に戻さない。** 過去に 5 点だったバグを `specs/fix-penalty-try-scoring.md` で修正済み
2. **`penalty_try` という type は存在しない。** `type: "try"` ＋ `metadata.is_penalty_try = true`（本番実測 57 件）
3. `penalty` と `penalty_goal` はどちらも 3 点

`pipeline.ts` も同じ関数を使っているため、これに従えば取り込み側と生成側で計算がずれない。

## 日付の粒度に注意

キーに使う日付は、**パース結果と DB レコードで同じ粒度**にすること。時刻まで含めると、タイムゾーンや分単位のずれで突合が壊れ、**今度は「イベントが一切入らない」という逆方向の事故になる**。日付単位を推奨する。

`ParsedLiveMatch` が実際にどの日付フィールドを持つか実読してから決めること。

## テストで押さえる点

**「呼ばれないこと」が今回の核心。**

- スコア不一致のイベント群を渡したとき、`upsertMatchEvents` が**呼ばれない**
- スコア一致時は従来どおり呼ばれる
- 同一カードの連戦 2 試合で、**それぞれ別のイベントが割り当てられる**
- キー衝突時に後勝ち上書きされない

## 完了の定義

- `specs/fix-live-ingest-event-key-collision.md` の受け入れ条件 1〜18 を満たす
- 変更ファイル: `lib/ingestion/live-ingest.ts` と対応するテスト（スコア計算を共通化する場合はその切り出し先も）
- `pnpm test` と型チェックが green
- **本番実行なし。** 受け入れ条件 19・20（日本戦の復旧と recap 再生成）は Owner が判断する
- PR 本文に以下を書くこと:
  - スコア照合をどこに挿入したか
  - 日付の粒度を何にしたか、およびその根拠（`ParsedLiveMatch` のどのフィールドを見たか）
  - キー衝突時にどちらを残す実装にしたか
