仕様書 `specs/fix-reading-time-basis.md` を実装してください。**先に全文を読んでください。**

## 何が問題か

`components/match-content-section.tsx:63-67`:

```ts
const readingMinutes = content
  ? language === "en"
    ? Math.max(1, Math.ceil(content.contentMdJa.split(/\s+/).length / 220))
    : Math.max(1, Math.ceil(content.contentMdJa.length / 500))
  : null;
```

**(1) Markdown 記法を文字数に数えています。** `content_md` は Markdown 原文で、`#` `**` `[表示](URL)` や URL 文字列が全部カウントされています。

**(2) 有料部分が対象から外れています。** `lockedContentMd` は同じコンポーネントが受け取り（`:18` の型、`:44` の分割代入）`:114` で子へ渡しているのに、`readingMinutes` は `content.contentMdJa` だけを見ます。**Premium 記事では無料部分だけの分数が、記事全体の分数として表示されます。**

## 調査済み・直さないでください

**英語分岐が `contentMdJa` を使っているのはバグではありません。** `contentMdJa` は `lib/db/queries/match-content.ts:67` で `row.content_md` を写した名前で、言語は `match_content.language` の別列です。英語記事には英語本文が入ります。日本語テキストを空白分割しているわけではないので、ここは触らないでください。

## やること

**算出対象**: `:60` で既に `parseMarkdown` を呼んでいます。その結果を使えば記法は落ちます。**新しいパーサを書かないでください。**

**有料部分**: 次のどちらかに揃えてください。表示と対象が一致していればどちらでも構いません。

| 方針 | 表示 |
|---|---|
| 記事全体 | `lockedContentMd` を加算。「記事全体で約○分」と分かる |
| 無料部分のみ | 加算しない。**無料部分の分数だと分かる表記にする** |

**現状のように「加算せず全体の分数のように見せる」ことだけ避けてください。**

`lockedContentMd` は `lockedLoading` 中は未取得です（`:19` の型、`match-content.tsx:386` の分岐）。**読み込み中に分数が飛ぶ表示にしないでください。**

**表記**: 「約○分」のように推定値だと分かる形にしてください。

## やってはいけないこと

- **速度定数（英語 220 words/min、日本語 500 文字/分）を変えること**
- **出典・タイムラインを読了分数へ足すこと。** 監査が明示的に禁じています
- 英語側の `split(/\s+/)` による語数算出をやめること
- 読了時間の表示位置・デザインを変えること
- `parseMarkdown` の挙動を変えること

## 完了の定義

受け入れ条件 1〜11 を満たすこと。特に:

- 記法文字と URL が分数に寄与しない（条件 1・2）
- **表示と算出対象が一致している**（条件 3）
- `lockedLoading` 中に分数が不安定に変化しない（条件 4）
- 空文字・記法のみで 1 分未満にならない（条件 6）
- **速度定数に差分が無い**（条件 8）

採用した方針（記事全体 / 無料部分のみ）を PR 本文に書いてください。

テストは `tests/components/` 配下へ（`exclude` 非該当。確認済み）。

git worktree で `origin/main` から切ってください（`docs/runbooks/codex-worktree.md`）。

**これは推定値の精度を上げる作業で、実際の読了実績を測るものではありません。** 「読了率が分かるようになった」と報告しないでください。

仕様と現状が食い違うと判断したら、実装を止めて指摘してください。
