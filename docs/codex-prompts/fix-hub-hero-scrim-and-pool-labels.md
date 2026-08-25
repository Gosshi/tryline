`/specs/fix-hub-hero-scrim-and-pool-labels.md` の仕様を実装してください。仕様本文は繰り返しません。着手前に必ず spec を読んでください。

比較モックは `docs/design/mock-hub-scrim-variants.html`。**採用は「案B」**です。ブラウザで開いて、現行と案B の違いを実際に見てから着手してください。

## これは PR #726 の是正です

PR #726 でシーズンページのヒーローを写真帯にしましたが、本番で確認したところ**大会によって結果が振れる**ことが分かりました。

- リーグワン（`#FF6B00`）: 写真が完全に消えてオレンジのベタ塗り
- ネーションズチャンピオンシップ（`#1A3A5C`）: 写真はあるが平坦な濃紺に見える
- シックスネイションズ（`#001489`）: たまたま成立している

原因は、スクリムに**大会カラーをそのまま**重ねていることです。元 spec の「暗色版から導出してよい」という書き方が曖昧でした。今回は配合を確定してあります。

## 変えるのは2つだけ

**1. スクリムの配合**（`app/c/[competition]/[season]/page.tsx:646`）

```
C2 = color-mix(in srgb, <大会カラー> 42%, #06090f)
linear-gradient(100deg, C2@92% 0%, C2@74% 45%, C2@30% 100%)
```

大会カラーは `getCompetitionFamilyColor(family)` から取ってください。**ハードコード禁止。** `color-mix` は `app/globals.css` の `--color-accent-dim` に使用実績があるので同じ書き方で構いません。

**2. プール名の日本語化**（`lib/format/competition.ts` に `formatPoolName` を追加）

`formatFamilyName` の隣に、同じ流儀で置いてください。

## やってはいけないこと

1. **レイアウトを変えない。** B2 の構造はそのまま。変わるのは `background` の値とプール名の文字列だけです。要素の追加・削除・並び替えをしたら設計ミスです
2. **`Pool A` 〜 `Pool F` を個別に列挙しない。** 正規表現 `/^Pool ([A-Z])$/` → `プール$1` で処理してください。将来 Pool G が増えても動く必要があります
3. **未知のプール名を握り潰さない。** マップにも正規表現にも当たらなければ**入力をそのまま返す**こと。空文字や `undefined` にしない
4. **順位表・ラウンドページの構造に触らない**
5. 混合比 42% と alpha 92/74/30 は**モックで確定した値**です。勝手に変えないでください

## 完了の定義

spec の「受け入れ条件」11項目をすべて満たすこと。特に:

- `grep -rn "accentColor}eb\|accentColor}c7\|accentColor}6b" app/c/` が **0件**（生カラーの alpha 付き使用が残っていない）
- `formatPoolName("Conference X")` が `"Conference X"` を返すテストがある
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` が clean

## PR 本文に必ず含めること

- **3大会のヒーローのスクリーンショット**（`/c/league-one/2025-26`、`/c/nations-championship/2026`、`/c/six-nations/2025`）。今回の修正は「写真が見えること」が成果物なので、これが無いと検証できません
- プール名が日本語化された箇所のスクリーンショット（ヒーローの「首位」行と順位表のプール帯）
- `git diff --stat`
