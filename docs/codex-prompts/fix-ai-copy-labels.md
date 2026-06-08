# Codex プロンプト: UI コピーから "AI" ラベルを除去

## 仕様書

`specs/fix-ai-copy-labels.md` を読んで実装してください。

## 概要

サイト全体の UI テキスト・メタディスクリプション・OGP から「AI解説」「AI日本語レビュー」等の "AI" 冠詞を取り除きます。ロジック・パイプラインは一切変更しません。コピーのみの変更です。

## 対象ファイル（計7ファイル）

1. `app/layout.tsx`
2. `app/page.tsx`
3. `app/matches/[id]/page.tsx`
4. `app/h2h/[pair]/page.tsx`
5. `app/c/[competition]/page.tsx`
6. `components/premium-upsell-banner.tsx`
7. `app/en/page.tsx`

## 変更しないファイル（触らない）

- `components/match-chat.tsx`（"AI CHAT" / "AI チャット" はチャット機能の正式名称）
- `components/sample-recap-cta.tsx`（"試合 AI チャット" は同上）
- lib/ 配下のすべてのファイル
- その他ロジックを含むファイル

## 置換パターン

各ファイルで以下のパターンに従って変更してください（仕様書の表を参照）:

- `AI日本語レビュー` → `日本語レビュー`
- `日本語AIレビュー` → `日本語レビュー`
- `AI Rugby Analysis in Japanese` → `Rugby Analysis in Japanese`
- `AI レビューのサンプル` → `レビューのサンプル`
- `AI 日本語レビューを全文読むには Premium が必要です` → `日本語レビュー全文は Premium でお読みいただけます`
- `世界のラグビーを AI 日本語レビューと` → `世界のラグビーを日本語レビューと`
- `AI-generated` → 削除（`match previews & recaps` のみ残す）

## 確認方法

実装後、以下で検証してください:

```bash
grep -rn "AI日本語\|AI レビュー\|AI Rugby\|AI-generated\|日本語AIレビュー" \
  app/layout.tsx app/page.tsx \
  components/premium-upsell-banner.tsx app/en/page.tsx
```

出力が0件であれば完了。

## 完了条件

- 上記 grep が0件
- `components/match-chat.tsx` の "AI CHAT"/"AI チャット" が残っている
- `pnpm tsc --noEmit` clean
- `pnpm lint` clean
- `pnpm build` clean
