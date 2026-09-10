仕様書 `specs/fix-pricing-video-upload-date.md` を実装してください。**先に全文を読んでください。**

**日付は確定しています。そのまま実装してください。**

## 何が問題か

`app/pricing/page.tsx:76-86` の `VideoObject` に、プレースホルダのままの日付が入っています。

```ts
uploadDate: "2025-01-01",     // 元日
```

`uploadDate` は `VideoObject` の**必須プロパティ**で、構造化データとして検索エンジンへ送られます。元日という値は実運用で動画を公開する日付として不自然です。

**実アップロード日は `2026-05-18` です**（2026-09-09、Owner が YouTube Studio で確認）。Claude Code は YouTube へ外部アクセスしていません。**この値は Owner の確認によるもので、推測ではありません。**

## やること

`uploadDate` を `2025-01-01` から **`2026-05-18`** に変えてください。1 行です。

**それが確認済みの実測値であることを、コメントまたは PR 本文から追えるようにしてください。** 出所は「2026-09-09、Owner が YouTube Studio で確認」。次に見た人が、また仮置きの日付だと判断して書き換えないようにするためです。

## やってはいけないこと

- **LLM に「この動画はいつ公開されましたか」と尋ねること。** 検証できない日付を構造化データに入れるのは、この spec が直そうとしている問題そのものです
- `VideoObject` の他のプロパティ（`name` / `description` / `thumbnailUrl` / `embedUrl`）を変えること
  - ※ `description` は同時に投げている `fix-ai-label-product-naming` が触ります。**そちらに任せてください**
- pricing ページの主張・実演・価格を変えること
- `createPricingFaqJsonLd` など他の JSON-LD を変えること

## 完了の定義

受け入れ条件 1〜8 を満たすこと。特に:

- **日付の出所が PR 本文に書かれている**（2026-09-09、Owner が YouTube Studio で確認）（条件 2）
- ISO 8601 の日付形式（条件 4）
- **画面表示に差分が無い**（条件 6）

テストは `tests/app/` 配下へ（`exclude` 非該当。確認済み）。

git worktree で `origin/main` から切ってください（`docs/runbooks/codex-worktree.md`）。

**これは 1 行の修正です。** pricing ページの説得力は別問題で Owner 判断が要ります。「pricing を改善した」と報告しないでください。

仕様と現状が食い違うと判断したら、実装を止めて指摘してください。
