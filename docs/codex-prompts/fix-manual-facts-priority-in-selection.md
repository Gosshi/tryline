仕様書 `specs/fix-manual-facts-priority-in-selection.md` を実装してください。**先に全文を読んでください。**

## 何を直すか

**Owner が調査して入れた事実24件のうち、生成に渡ったのは1件だけでした。**

```
lib/llm/sourced-facts/fetch.ts:383-384
.order("fetched_at", { ascending: false })
.limit(MAX_STORED_FACTS)   // = 8
```

**新しい8件しか渡りません。** `fetch-sourced-facts?force=true` が自動取得を毎回取り直すため、**自動側の `fetched_at` が実行時刻に更新され、手動を押し出します。**

手動は一度入れたら `fetched_at` が動かない（自動再取得の削除対象から除外されている）ので、**再生成するほど手動が押し出される構造**になっています。

落ちたのは、エディー・ジョーンズのコメント、稲場巧の初トライの本人談、公式 Player of the Match が確認できなかった記録、モール／スクラム／ラインアウトの文脈です。**`docs/chatgpt-prompts/` で「自動で取れない層を優先して集めよ」と指示している、まさにその層が落ちています。**

## 影響範囲に注意してください

**`loadSourcedFactsForMatch` は `lib/llm/stages/assemble.ts:965` の1箇所から呼ばれ、プレビュー・レビューの両方・全大会に効きます。すべての生成の入力が変わります。**

## 直すこと（2点）

### 1. 手動を優先して選ぶ

1. **`metadata.entry_method === "manual"` を先に取る**（`fetched_at` 降順）
2. 枠が余ったら自動で埋める（`fetched_at` 降順）
3. 合計 `MAX_STORED_FACTS` 件

**手動が8件以上なら自動は0件になります。これは意図した挙動です。**

**判定には既存の `isManualSourcedFact`（同ファイル `:72`）を使ってください。** 新しい判定を書かないでください。

### 2. allowlist フィルタを上限より前に移す

現状はフィルタが上限の**後**にあります。

```
.limit(MAX_STORED_FACTS)          ← 先に8件へ切る
const allowedRows = rows.filter() ← そのあと除外
```

**除外された分だけ枠が空のまま渡っています。** `Excluded N non-allowlisted cached fact(s)` が出る試合では、実際には 8 − N 件しか渡っていません。

**フィルタを先に適用し、そのうえで上限まで取ってください。** 8枠が実際に8件で埋まります。

## 変えてはいけないもの

- **`MAX_STORED_FACTS` の値**（8のまま）
- `confidence` の絞り込み（`high` / `medium`）
- `content_type` の絞り込み（対象 + `shared`）
- 除外件数のログ
- `fetchSourcedFactsForMatch`
- `lib/llm/stages/assemble.ts`
- `supabase/`

## 実装方法

**DB 側で `metadata->>entry_method` を並び替えに使うより、必要十分な件数を取得して JS で並べ替えるほうが単純です**（1試合あたり実測で最大24件程度）。ただし方法は問いません。

## テスト

- 手動3件＋自動10件 → 手動3件が先、自動5件で合計8件
- 手動10件 → 手動8件のみ、自動0件
- **手動0件 → 現行と同じ結果（回帰テスト）**
- allowlist 外の自動が混ざる → 除外され、枠が別の事実で埋まる
- allowlist 外でも手動なら渡る（既存の例外を維持）

## 完了の定義

1. 仕様書の受け入れ条件18項目をすべて満たす
2. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean
3. PR 本文に次を記載する
   - **手動0件のとき現行と同じ結果になることの説明**
   - allowlist フィルタを前に移したことによる件数の変化
   - `assemble.ts` / `supabase/` に差分が無いことの明示

## 検証

**マージ後、デプロイが READY になってから実行してください。**

1. `cron-post-match-recap-refresh` を `from=2026-09-05 to=2026-09-05` で回す
2. **本文にエディー・ジョーンズのコメントか、モール／スクラム／ラインアウトの文脈のいずれかが入る**

この試合には現在**手動24件・自動7件**があり、修正後は**手動8件が渡る**はずです。

## 判断に迷ったら

**仕様書に矛盾や不足を見つけたら、実装を進めずに質問してください。**

**プロンプト長が増えることで QA の字数条件と干渉しそうな場合は、実装前に報告してください。** 過去にプロンプトの字数予算と QA の最低字数が矛盾し、297件が draft 化して本番から消えた事故があります。
