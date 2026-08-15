# Codex 指示: ingest-lineups の players insert が slug NOT NULL で落ちる問題を修正

## 仕様書

`specs/fix-ingest-lineups-player-slug.md` を読んでから着手すること。以下は補足であり、仕様の置き換えではない。

## 何が壊れているか（一文）

`app/api/cron/ingest-lineups/route.ts:117-123` の `players` insert に `slug` が含まれていないが、`players.slug` は NOT NULL + UNIQUE（`supabase/migrations/20260517010000_add_player_slugs.sql:24-25`、DEFAULT・トリガーなし）なので、**未登録選手が 1 名でも含まれる試合は必ず HTTP 500 になる**。

## これは 3 度目の同じバグ

同じ修正が `ingest-squads` で 1 回（`specs/fix-ingest-squads-slug.md`）、JRFU 経路で 1 回（PR #690、本番で失敗）行われている。**今回は共有ヘルパーに切り出して、4 度目が起きないようにすることまでが仕事。** `ingest-lineups` に `generatePlayerSlug` をコピペして終わらせないこと。

## 先に実読すべきファイル

| ファイル | 何を確認するか |
|---|---|
| `app/api/cron/ingest-squads/route.ts:9-19` | **これが移植元**。既存の slug 生成アルゴリズム |
| `app/api/cron/ingest-lineups/route.ts:91-142` | `ensurePlayerIds()`。insert に slug がないこと、`team_id` で絞って `name` 完全一致で既存を探すこと |
| `app/api/cron/ingest-lineups/route.ts:88-90, 198-202` | レスポンス形。**変えてはいけない** |
| `supabase/migrations/20260517010000_add_player_slugs.sql` | NOT NULL / UNIQUE / 重複解決の `ROW_NUMBER()` |
| `specs/fix-ingest-squads-slug.md` | 前回の修正の判断 |

## アルゴリズムを変えないこと（重要）

既存の `/players/josua-tuisova` のような URL は検索流入の実績がある（GSC 2026-07-15〜08-11 実測で 15 インプレッション）。

`ingest-squads` の現行実装と**同じ入力に同じ出力**を返すこと。「もっと良い slug 生成」を思いついても実装しないこと。受け入れ条件 5 がこれを検証する。

```ts
// app/api/cron/ingest-squads/route.ts:9-19（移植元・そのまま）
function generatePlayerSlug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/, "");
  if (cleaned) {
    return cleaned;
  }
  return `player-${createHash("sha256").update(name, "utf8").digest("hex").slice(0, 8)}`;
}
```

## 足すもの: UNIQUE 衝突の回避

現行実装には衝突処理がない。`ensurePlayerIds()` は既存選手を `team_id` で絞って探すため、**別チームに同姓同名がいると既存を見つけられず新規 insert に回り、slug が衝突して 500 になる**。

マイグレーション 15-22 行目と同じ考え方で `-2` / `-3` を付ける。

**2 層に分けること**（DB 依存を単体テストから切り離すため）:
- 純関数: `name` → slug 候補（DB 不要）
- DB を伴う関数: 候補 → 既存と突き合わせて空いている slug

**同一バッチ内の衝突も潰すこと。** 1 回の insert で `Harry Wilson` が 2 名来たとき、両方に `harry-wilson` を割り当てないこと（受け入れ条件 9）。DB を引いた結果だけを見ていると、まだ insert されていない同バッチの他の候補と衝突する。

## 絶対にやってはいけないこと

1. **既存 `players` 行の slug を書き換えない。** UPDATE を一切書かないこと
2. **`ensurePlayerIds` の名寄せ方式（`name` 完全一致）を変えない。** 表記ゆれ対応・ローマ字/漢字の統合は本 spec の対象外。「ついでに直す」をしない
3. **レスポンス形を変えない。** `{"announced": false}` を HTTP 200 で返す挙動も含めて維持する。`specs/feat-manual-ingest-lineups-workflow.md` の集計がこの形に依存している
4. **マイグレーションを書かない。** スキーマ変更は不要
5. **本番で実行しない。** 受け入れ条件 20・21 の検証は Owner が判断して行う

## 入出力の具体例

### 純関数
```
"Harry Wilson"       → "harry-wilson"
"Josua Tuisova"      → "josua-tuisova"
"Luke Cowan-Dickie"  → "luke-cowan-dickie"   （ハイフンが連続しない）
"木田晴斗"            → "player-xxxxxxxx"     （決定的・同入力で同出力）
```

### 衝突回避（既存 slug との突き合わせ）
```
既存: []                                  候補 "harry-wilson" → "harry-wilson"
既存: ["harry-wilson"]                    候補 "harry-wilson" → "harry-wilson-2"
既存: ["harry-wilson","harry-wilson-2"]   候補 "harry-wilson" → "harry-wilson-3"
同一バッチ ["Harry Wilson","Harry Wilson"] → 2 件に別々の slug
```

## エッジケース

- `name` が空文字・空白のみ → ケバブケース化の結果が空になり SHA-256 分岐に落ちる。クラッシュしないこと
- `name` が記号のみ（`"---"`）→ 同上
- 既存に `harry-wilson-2` はあるが `harry-wilson` は無い → 候補 `harry-wilson` はそのまま使える（空いている番号を探すのではなく、**候補そのものが空いていればそれを使う**）
- 1 試合で 46 名（両チーム 23 名ずつ）が全員新規 → 既存 slug の照会が 1 名ずつ 46 回にならないこと（まとめて `in` で引く）

## 完了の定義

- `specs/fix-ingest-lineups-player-slug.md` の受け入れ条件 1〜19 をすべて満たす
- 変更ファイル: 共有ヘルパー（新規）/ `app/api/cron/ingest-lineups/route.ts` / `app/api/cron/ingest-squads/route.ts` / ヘルパーの単体テスト
- `pnpm test` と型チェックが green
- **本番実行なし。** PR 本文に「未検証。受け入れ条件 20 の検証対象試合は Owner が選定」と明記する
- PR 本文に、同一バッチ内の衝突をどう解決したかを 1 行で書くこと
