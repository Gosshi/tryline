# PR40: AI チャット応答の Markdown 記法除去

## 背景

AI チャットのアシスタント応答に `**太字**` や番号付きリストの Markdown 記法が含まれているが、
`components/match-chat.tsx` はプレーンテキストとして表示するため `**` がそのまま画面に出る。

レビュー本文（`match-content.tsx`）も同じ問題に直面し、すでに解決済みである。
その際の方針は「react-markdown は npm レジストリ制約のため導入不可。LLM に Markdown 記法を
使わせない制約をプロンプトに追加する」（`docs/codex-prompts/fix-markdown-renderer.md` 参照）。

AI チャットにも同じ方針を適用する。

## スコープ

対象:
- `lib/chat/context.ts`（system prompt 組み立て箇所）

対象外:
- `components/match-chat.tsx` の表示ロジック変更
- `react-markdown` 等の外部ライブラリ導入
- レビュー・プレビューのプロンプト（変更不要）

## 変更詳細

### `lib/chat/context.ts` — system prompt への書式制約追加

`assembleMatchContext` が返す system prompt の末尾に、以下の書式制約を追加する。

```
## 応答フォーマットの制約
- Markdown 記法（**太字**、*斜体*、## 見出し、--- 区切り線）は一切使用しない。
- 番号付きリスト（1. 2. 3.）と箇条書き（- ）は使用してよい。
- テキストのみで回答する。装飾記号を含めない。
```

この制約を追加することで、モデルが `**ペナルティゴールの活用**:` のような出力を
`ペナルティゴールの活用:` のように記号なしで返すようになる。

## 受け入れ条件

- AI チャットで「〇〇の勝因は？」など質問したとき、アシスタントの応答に
  `**`, `*`, `##`, `---` などの Markdown 記号が含まれない
- 番号付きリストや箇条書きは引き続き使用される（可読性は維持する）
- 既存のレビュー・プレビュー生成（`generate-preview.ts`・`generate-recap.ts`）への影響なし
- `pnpm build` でエラーなし

## 参考ファイル

- `docs/codex-prompts/fix-markdown-renderer.md` — 同じ方針をレビューに適用した経緯
- `app/api/chat/[matchId]/route.ts` — `assembleMatchContext` の呼び出し元

## 未解決の質問

なし。
