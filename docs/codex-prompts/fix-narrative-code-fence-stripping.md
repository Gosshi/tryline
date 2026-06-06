# Codex プロンプト: ナラティブ出力のコードフェンス除去

仕様: `specs/fix-narrative-code-fence-stripping.md` を参照（内容はインライン展開しない）。

## タスク
ナラティブ生成（gpt-4o）が本文全体を ```` ```markdown … ``` ```` のコードフェンスで囲んで出力することがあり、`match_content.content_md` がそのまま保存されてサイトでコードブロックとしてベタ表示される。プロンプトでは既に禁止しているがモデルが無視するため、決定的な後処理で囲みフェンスを除去する。

## 変更ファイルと内容

### 1) `lib/llm/stages/generate-narrative.ts`
純粋関数 `stripWrappingCodeFence(text: string): string` を追加し、`generateNarrative` と `reviseNarrativeLength` の戻り `content`（現状 `response.text`）に適用する。

ロジック（**先頭・末尾の囲みフェンスのみ**）:
- `text.trim()` が ```` ``` ```` または ```` ```<lang> ````（任意の言語ラベル、例 `markdown`）で始まり、対応する末尾 ```` ``` ```` で終わる場合のみ、先頭フェンス行と末尾フェンスを除去し中身を `trim()` して返す。
- 開始/終了が揃わない場合は入力をそのまま返す（誤除去防止）。
- 本文途中のフェンスは保持する。

既存の「コードフェンス禁止」プロンプト文言は残す（多層防御）。

## 受け入れ条件（完了の定義）
- `stripWrappingCodeFence` の単体テスト:
  - ```` ```markdown\n# 見出し\n本文\n``` ```` → `# 見出し\n本文`
  - ```` ```\n# 見出し\n``` ```` → `# 見出し`
  - フェンス無し → 変化なし
  - 途中のみフェンス → 変化なし
  - 先頭のみ／末尾のみ（不揃い）→ 変化なし
- `generateNarrative` / `reviseNarrativeLength` の戻り `content` がストリップ済みであることのテスト
- 既存テスト（`tests/llm/stages/*.test.ts`, `tests/llm/pipeline-*.test.ts`）が緑
- `pnpm tsc --noEmit` / `pnpm lint` clean

## 参考パターン
- 適用箇所は `response.text` を返している L67-78 / L111-117 付近。
- 既存の `NarrativeResponse` 型は変更不要。
