# ingest-lineups の players insert が slug NOT NULL で落ちる問題を修正

## 背景

`app/api/cron/ingest-lineups`（汎用・Wikipedia 経由）は、**未登録の選手が 1 名でも含まれる試合で必ず HTTP 500 を返す。**

`ensurePlayerIds()`（`route.ts:91-142`）が `players` へ insert する際、渡している列は 3 つだけ:

```ts
// app/api/cron/ingest-lineups/route.ts:117-123
const { error: insertError } = await db.from("players").insert(
  missingNames.map((name) => ({
    team_id: teamId,
    name,
    external_ids: { wikipedia_title: name },
  })),
);
```

一方 `players.slug` は `supabase/migrations/20260517010000_add_player_slugs.sql` で NOT NULL + UNIQUE が付いている:

```sql
-- 24-25 行目
ALTER TABLE players ALTER COLUMN slug SET NOT NULL;
ALTER TABLE players ADD CONSTRAINT players_slug_key UNIQUE (slug);
```

同マイグレーションに DEFAULT もトリガーも定義されていない。

### これは 3 度目の同じバグ

| 経路 | 状態 |
|---|---|
| `ingest-squads` | `specs/fix-ingest-squads-slug.md` で修正済み。`route.ts:9` に `generatePlayerSlug()` をローカル定義 |
| JRFU lineups（PR #690） | 本番で `{"error":"Failed to ingest lineups"}`。`specs/feat-jrfu-lineup-ingestion.md` が原因として記録 |
| **`ingest-lineups`（汎用）** | **未修正。本 spec の対象** |

`fix-ingest-squads-slug.md` は「対象: `app/api/cron/ingest-squads/route.ts` のみ」と明記しており、他の insert 経路は意図的に範囲外だった。その結果、同じ修正が 3 箇所目で再び必要になっている。**本 spec では slug 生成を共有ヘルパーに切り出し、これを最後にする。**

### 重要度

`specs/feat-manual-ingest-lineups-workflow.md`（汎用ラインアップ取込の手動ワークフロー）は、この修正が入るまで実質的に機能しない。ラインアップが未取得だった大会の選手は `players` に登録されていないため、**手動ワークフローの主対象がほぼ全件このバグに当たる**。

### もう 1 つの潜在バグ: UNIQUE 衝突

`generatePlayerSlug()`（squads 版）は衝突処理を持たない。一方 `ensurePlayerIds()` は既存選手を **`team_id` で絞ってから `name` 完全一致**で探すため、**別チームに同姓同名の選手がいると既存を見つけられず新規 insert に回り、slug が既存行と衝突して UNIQUE 違反（500）になる**。

マイグレーション側は移行時にこれを `ROW_NUMBER()` で `-2` / `-3` を付けて解決していた（15-22 行目）が、アプリ側にその実装がない。

## スコープ

対象:
- `lib/db/player-slug.ts`（新規、パスは Codex の判断でよい）— slug 生成と衝突回避を担う共有ヘルパー
- `app/api/cron/ingest-lineups/route.ts` — `ensurePlayerIds()` の insert に `slug` を追加
- `app/api/cron/ingest-squads/route.ts` — ローカル定義の `generatePlayerSlug()` を共有ヘルパーへ置き換え
- 共有ヘルパーの単体テスト

対象外:
- **選手の名寄せロジックの改善**（表記ゆれ・ローマ字/漢字の統合）。`ensurePlayerIds` が `name` 完全一致で探す設計そのものは変えない。これは別問題であり、`specs/feat-jrfu-lineup-ingestion.md` で JRFU 経路について既に Owner 判断が出ている
- 既存 `players` 行の slug の付け替え（**既存 slug は SEO 資産なので触らない**。後述）
- `players` への新規作成をやめる/減らす方針変更
- Wikipedia パーサーの改善
- DB スキーマ・マイグレーションの変更

## データモデル変更

**なし。** 既存 `players` テーブルへ insert する列が 3 → 4 に増えるだけ。

| 列 | 型 | 本 spec での扱い |
|---|---|---|
| `team_id` | uuid | 変更なし |
| `name` | text | 変更なし |
| `slug` | text NOT NULL UNIQUE | **今回追加して渡す** |
| `external_ids` | jsonb | 変更なし |

## API サーフェス

**新規ルートなし。** レスポンス形も変えない。

`ingest-lineups` の成功時レスポンス `{"announced": true, "home_count": <n>, "away_count": <n>}` と、パース失敗時の `{"announced": false}`（HTTP 200）はそのまま維持すること。`specs/feat-manual-ingest-lineups-workflow.md` の集計がこの形に依存している。

### 共有ヘルパーの要件

**既存の可読 slug のアルゴリズムを変えないこと。** 現行の `/players/josua-tuisova` のような URL は検索流入を得ている実績があり（GSC 2026-07-15〜08-11 で `/players/josua-tuisova` に 15 インプレッション）、生成規則を変えると既存選手と新規選手で slug の付き方がズレる。

`app/api/cron/ingest-squads/route.ts:9-19` の実装をそのまま共有ヘルパーへ移すこと:

1. `name` を小文字化し、`[^a-z0-9]+` を `-` に置換、前後の `-` を除去
2. 結果が空でなければそれを返す（ASCII を含む名前 → ケバブケース）
3. 空なら `player-<name の SHA-256 先頭 8 文字>` を返す（日本語等）

**その上で衝突回避を追加する。** 生成した候補が `players.slug` に既存する場合、`-2`、`-3`、… と連番を付けて空きを探す（マイグレーション 15-22 行目と同じ考え方）。

衝突判定には DB 参照が必要なため、ヘルパーは以下の 2 層に分けることを推奨する（具体的な形は Codex の判断でよい）:

- **純関数**: `name` から slug 候補を作る。DB に依存しない = 単体テスト可能
- **DB を伴う関数**: 候補を受け取り、既存 slug と突き合わせて空いている slug を返す。**同一バッチ内で新規作成する複数選手の間でも衝突しないこと**（1 回の insert で同姓同名 2 名が来た場合に両方 `harry-wilson` を作らない）

## UI サーフェス

**変更なし。**

## LLM 連携

**なし。** 本 spec に LLM 呼び出しは含まれず、**追加コストはゼロ**。

ただし副次的な効果として、これまで 500 で止まっていた `ingest-lineups` が通るようになるため、後続の `generate-content` が動く試合が増える。その分の LLM コストは `specs/feat-manual-ingest-lineups-workflow.md` の見積もりに含まれており、手動起動のみなので暴発しない。

## 受け入れ条件

### 共有ヘルパー（純関数）

1. `"Harry Wilson"` → `"harry-wilson"` を返す
2. `"Josua Tuisova"` → `"josua-tuisova"` を返す
3. `"Luke Cowan-Dickie"` → `"luke-cowan-dickie"` を返す（ハイフンが連続しない）
4. `"木田晴斗"`（ASCII なし）→ `"player-"` で始まり、同じ入力に対して**常に同じ値**を返す（SHA-256 ベースなので決定的）
5. 現行 `app/api/cron/ingest-squads/route.ts:9-19` と**同じ入力に対して同じ出力**を返す（既存 slug との整合性が保たれる）

### 共有ヘルパー（衝突回避）

6. 候補 `"harry-wilson"` が既存に無ければ `"harry-wilson"` を返す
7. 候補 `"harry-wilson"` が既存にあれば `"harry-wilson-2"` を返す
8. `"harry-wilson"` と `"harry-wilson-2"` が既存にあれば `"harry-wilson-3"` を返す
9. **同一バッチで同姓同名 2 名**（例: `[{name:"Harry Wilson"}, {name:"Harry Wilson"}]`）を処理した場合、2 件に**異なる slug** が割り当てられる

### ingest-lineups

10. `ensurePlayerIds()` の insert に `slug` が含まれている
11. 未登録選手を含む試合で `POST /api/cron/ingest-lineups?match_id=<uuid>` が **500 を返さない**
12. 成功時のレスポンス形が `{"announced": true, "home_count": <n>, "away_count": <n>}` のまま変わっていない
13. パース失敗時に `{"announced": false}` を HTTP 200 で返す既存挙動が変わっていない
14. 既存選手のみで構成される試合では `players` への insert が発生しない（従来どおり既存 id を引く）

### ingest-squads

15. ローカルの `generatePlayerSlug()` が削除され、共有ヘルパーを import している
16. `ingest-squads` の既存の挙動（生成される slug の値）が変わっていない
17. `createHash` の import が不要になったなら削除されている

### テスト

18. 共有ヘルパーの単体テストが追加され、上記 1〜9 に対応するケースを含む
19. `pnpm test` と型チェックが通る

### 本番検証（マージ後、Owner が判断して実施）

20. **全件実行しない。** まず未登録選手を含むことが分かっている試合 **1 件**で `ingest-lineups` を叩き、以下を確認する:
    - HTTP 200 が返る
    - `home_count` / `away_count` が 0 より大きい
    - `players` に作られた行の `slug` が意図した形式になっている
    - 既存選手の slug が**書き換わっていない**
21. 1 件目の結果を確認してから、複数試合へ広げるかを Owner が判断する

## 未解決の質問

1. **検証に使う試合の選定。** 受け入れ条件 20 は「未登録選手を含む試合」を前提にしているが、どの試合がそれに当たるかは本番 DB を見ないと分からない。`specs/fix-lineup-ingestion-non-league-one.md` の実測では League One 以外の 5 大会がラインアップ 0 件だったため候補は多いはずだが、**そもそもパーサーがラインアップを返さない試合では検証にならない**（`{"announced": false}` で終わる）。→ 検証対象の特定は Owner が本番 DB を確認して決める。Codex は候補選定をしない
2. 同姓同名で `-2` が付いた選手の URL（`/players/harry-wilson-2`）は人間にとって意味が読めない。将来的にチーム名を混ぜた slug（`harry-wilson-wallabies`）にするかは本 spec では決めない。**既存 slug を壊さない**制約がある以上、変更するなら移行計画が別途必要
3. `ensurePlayerIds` が `team_id` で絞って `name` 完全一致で探す設計は、選手の移籍時に同一人物を二重登録する。これは本 spec の対象外だが、**未解決の負債として認識しておく**（`players.canonical_player_id` が既に存在するので、統合の仕組み自体はある）
