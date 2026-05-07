# fix-content-winner-qa: レビュー勝者誤認の検出・再生成

## 背景

LLM 生成レビューで「実際は浦安が勝ったのに埼玉が勝ったと書かれている」という
事実誤認が発生した（match_id: `02b60757-e852-47de-ab46-14e88fdd92e4`）。
QA ステージの `factual_grounding` が論旨レベルの勝者誤認を見逃している。

このタスクは:
1. 既存コンテンツ全体を診断して同様の誤認を検出するスクリプトを作成する
2. 誤認が検出された試合のコンテンツを削除して再生成する
3. QA プロンプトに勝者チェックを追加する

## 1. 診断スクリプト: `scripts/diagnose-winner-mismatch.ts`

**実行コマンド:**
```bash
# 診断のみ（副作用なし）
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/diagnose-winner-mismatch.ts

# 誤認を検出して再生成
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/diagnose-winner-mismatch.ts --fix
```

**処理フロー:**
```
1. match_content テーブルから content_type = "recap", status IN ("draft","published") を全件取得
   フィールド: match_id, content_md_ja
2. 各 match_id に対して matches テーブルから home_score, away_score,
   home_team(name), away_team(name) を取得
3. 勝者を判定:
   - home_score > away_score → home チームが勝者
   - away_score > home_score → away チームが勝者
   - 引き分けはスキップ
4. content_md_ja に以下のいずれかが含まれるか正規表現で検査:
   - 敗者チーム名 + "が勝利" / "が制した" / "が逃げ切った" / "が下した"
   - 敗者チーム名 + "の勝利" / "が接戦をものにした"
5. ヒットした match_id を「疑い」リストとして出力
   （誤検知あり前提で、目視確認用の候補リスト）
6. --fix フラグがある場合:
   疑いリストの match_content を DELETE して
   generateMatchContent(matchId, "recap") で再生成する
```

**実装上の注意:**
- 正規表現は厳密に当てるのが難しいため「疑い」リストとして扱う
- `--fix` なしのデフォルトは診断のみ（副作用なし）
- `--fix` 実行前に必ず `--fix` なしで結果を確認してから使うこと
- エラーが 1 件起きても止めずに次へ進む
- Supabase クライアントは `getSupabaseServerClient` を使う

## 2. QA プロンプト改善: `lib/llm/prompts/qa-content.ts`

`buildQaContentPrompt` に以下の勝者チェック指示を追加する:

```typescript
// contentType === "recap" のときのみ追加するブロック
const winnerCheckBlock = contentType === "recap"
  ? [
      "## 勝者整合性チェック",
      "入力データの home_score と away_score を確認すること。",
      "スコアが高い方のチームが実際の勝者である。",
      "本文中で敗者チームが勝利したかのように書かれていれば factual_grounding を 1 にして verdict を reject にすること。",
      "引き分け（同点）の場合はこのチェックを無視する。",
    ].join("\n")
  : "";
```

`PROMPT_VERSION` を `qa@1.2.0` に上げること。

## 3. 変更ファイル一覧

- `scripts/diagnose-winner-mismatch.ts`（新規作成）
- `lib/llm/prompts/qa-content.ts`（`PROMPT_VERSION` 更新 + 勝者チェック追加）

## 完了条件

- `pnpm tsc --noEmit` パス
- `--fix` なし実行で疑いリストが出力される
- `qa-content.ts` の `PROMPT_VERSION` が `qa@1.2.0` になっている
- recap 向けに勝者チェック指示がプロンプトに含まれている

## ブランチ・PR

- ブランチ: `fix/content-winner-qa`
- PR タイトル: `Fix: detect winner mismatch in reviews, strengthen QA prompt`
