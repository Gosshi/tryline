# ナラティブ出力のコードフェンス除去

## 背景

2026-06-06 のリーグワン3決 recap（match `96863688-cf14-40f8-b3d7-8d485ae5504b`, ja）再生成で、`match_content.content_md` が本文全体を ```` ```markdown … ``` ```` のコードフェンスで囲んだ状態で保存された。サイトのマークダウンレンダラはこれを**コードブロックとしてベタ表示**し、見出し・段落が一切整形されない表示崩れになる。

ナラティブ用プロンプトは既に「コードブロック・コードフェンス使用禁止」を明記している（`lib/llm/stages/generate-narrative.ts` L178 / L253 / L301）が、gpt-4o（temperature 0.7）が指示を無視して出力した。**プロンプト指示だけでは防げない**ことが実証されたため、決定的な後処理でストリップする。

同一事象は preview / recap・ja / en・length-revision 経路すべてで再発しうる。本件は既存の `p9-sample-recap-markdown-strip.md`（ホームページ抜粋カードの表示用プレーン化）とは別物で、**保存される `content_md` 本体**を対象とする。

## スコープ

対象:
- ナラティブ本文を返す直前で、本文を囲む**先頭/末尾のコードフェンスのみ**を除去する
- 通常ナラティブ・length-revision 後ナラティブの両方
- ja / en 両言語、preview / recap 両タイプ

対象外:
- 本文「内部」に正当に存在するフェンス（先頭・末尾の囲みフェンスのみ対象、途中は不可触）
- 既存の字数下限未達問題（別 spec）
- QA ロジックの変更
- ホームページ抜粋の表示処理（`p9-sample-recap-markdown-strip.md` の範囲）

## データモデル変更

なし。

## API サーフェス

なし（内部パイプラインのみ）。

## UI サーフェス

なし（保存される `content_md` が正しくなることで既存レンダラが正しく表示する）。

## LLM 連携

パイプライン段階: ステージ3（ナラティブ生成）後、ステージ5（永続化 upsert）前。

実装方針:
- `lib/llm/stages/generate-narrative.ts` に純粋関数 `stripWrappingCodeFence(text: string): string` を追加し、`generateNarrative` / `reviseNarrativeLength` の戻り値 `content` に適用する。これで `lib/llm/pipeline.ts` 側の全経路（温度リトライ・length-revision）を自然にカバーできる。
- 除去ロジック（先頭・末尾の囲みフェンスのみ）:
  - `text.trim()` が ```` ``` ```` または ```` ```<lang> ````（例 `markdown`）で始まり、対応する末尾 ```` ``` ```` で終わる場合に限り、先頭フェンス行と末尾フェンスを除去して中身を `trim()` して返す。
  - 開始/終了フェンスが揃わない場合は**何もしない**（誤除去防止）。
  - 本文途中のフェンスは保持する。
- 既存の「禁止」プロンプト文言はそのまま残す（多層防御）。

## 受け入れ条件

- `stripWrappingCodeFence` の単体テスト:
  - ```` ```markdown\n# 見出し\n本文\n``` ```` → `# 見出し\n本文`
  - ```` ```\n# 見出し\n``` ```` → `# 見出し`
  - フェンス無し本文 → 変化なし
  - 本文途中にのみフェンスがある場合 → 変化なし（中身保持）
  - 先頭のみ／末尾のみ（不揃い）→ 変化なし
- `generateNarrative` / `reviseNarrativeLength` の戻り `content` がストリップ済みであることをテストで確認
- 既存テスト（`tests/llm/stages/*.test.ts`, `tests/llm/pipeline-*.test.ts`）が緑
- `tsc --noEmit` clean / `eslint` clean

## 未解決の質問

- 既に保存済みの3決 recap（`96863688-…`, ja）の `content_md` から囲みフェンスを除去する暫定対応を、本 fix デプロイ前に Owner が手動で行うか、デプロイ後に recap 再生成で上書きするか。
