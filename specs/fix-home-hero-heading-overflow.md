# ホーム h1 の word-break: keep-all による見出し・Matchday board あふれ修正

## 背景

`feat-home-matchday-board.md`（PR #500、2026-07-08 マージ・デプロイ済み）で、ホームのヒーロー h1 コピーを「海外ラグビーを、／日本語で深掘り。」から「今週の海外ラグビーを、／日本時間で追う。」に変更し、ヒーローを2カラム化（右に Matchday board）した。本番デプロイ後の実機確認（320/375/1440px）で、**見出しと Matchday board が画面右側で見切れる**バグが確認された。

### 原因（DOM 実測で確認済み）

`app/page.tsx` のヒーロー h1 には既存の `break-keep`（`word-break: keep-all`）クラスが付いている。この指定は「空白のない CJK 文字列は改行しない」という意味で、旧コピー「海外ラグビーを、」（7文字・単カラム全幅レイアウト、当時のコンテナ幅は `max-w-6xl` 由来で約1100px）では問題にならなかった。

しかし新コピー「今週の海外ラグビーを、」（11文字）を、PR #500 で追加した2カラムグリッド（`app/page.tsx` のヒーロー内 `grid ... lg:grid-cols-[minmax(0,1fr)_420px]`）に置いたことで、見出し側のコンテナ幅が大幅に狭くなった（実測: 1440px時 636px、375px時 343px）。`word-break: keep-all` はこの文字列全体を分割不可能な1行として扱うため、コンテナ幅を無視してあふれる。

実測値（本番 `https://www.trylinerugby.com/` で確認、2026-07-08）:
- 375px: テキスト行幅 514.8px（コンテナ幅 343px）→ 172px あふれ、ヒーロー `<section>` の `overflow-hidden` でクリップされ**見えなくなる**
- 1440px: テキスト行幅 772px（h1 の箱幅 636px）→ 136px あふれ、Matchday board 側に食い込む
- 375px・320px では **Matchday board 自体も見切れる**。これは h1 の分割不可能な最小幅が、lg未満で明示的な `grid-template-columns` を持たない実装グリッド列の auto トラック幅を押し広げ、同じ列にある Matchday board（別の grid item）も巻き添えで広がるため

これは `feat-home-matchday-board.md` の受け入れ条件7が想定していたリスク（「モバイルで語中改行が起きないこと、`wbr` か手動改行で制御」）そのものだが、実装では新コピーの先頭区間「今週の海外ラグビーを、」内部に改行可能点を追加しておらず、`break-keep` と衝突してあふれが発生した。受け入れ条件12（320/375/768/1440pxのスクショ確認）も、Codex 側でローカル環境の制約により実施できていなかった（PR #500 ノート記載）。

## スコープ

対象:
- `app/page.tsx` のヒーロー h1（「今週の海外ラグビーを、／日本時間で追う。」）に安全な改行点を追加する
- ヒーロー2カラムグリッドのコンテナに、lg未満でも `minmax(0, 1fr)` 相当の明示的なトラック制約を追加し、子要素の最小幅が列全体を押し広げないようにする

対象外:
- h1 のコピー文言自体の変更（「今週の海外ラグビーを、日本時間で追う。」は維持）
- `break-keep` の削除（他の改行方式への置き換えはしない。カタカナ語の語中改行〈例:「ラグビ／ー」〉を防ぐ目的で既存踏襲）
- Matchday board・注目大会カードの内部レイアウト変更（`feat-home-matchday-board.md` で実装済み範囲は変更しない。今回のグリッド修正で副次的に解消される想定）
- ヒーロー以外のセクション（「今週の試合」帯・注目大会カード等）の見出し

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

### 1. h1 に `<wbr />` を挿入する（`app/page.tsx` のヒーロー h1）

現状:
```tsx
<h1 className="break-keep font-serif text-5xl font-bold leading-tight tracking-tight text-white sm:text-7xl">
  今週の海外ラグビーを、
  <br className="hidden sm:block" />
  日本時間で追う。
</h1>
```

変更後、1行目の文字列内に意味の区切りで `<wbr />` を挿入し、`break-keep` を維持したまま安全な改行点を用意する:

```tsx
<h1 className="break-keep font-serif text-5xl font-bold leading-tight tracking-tight text-white sm:text-7xl">
  今週の<wbr />海外<wbr />ラグビー<wbr />を、
  <br className="hidden sm:block" />
  日本時間で追う。
</h1>
```

- `<wbr />` は「今週の」「海外」「ラグビー」「を、」の間に置く。**「ラグビー」内部・「今週」内部・「海外」内部には置かない**（`break-keep` によりカタカナ語・単語内の語中改行を防ぐという既存の意図を壊さないため）
- 挿入位置はテキストの意味区切りを優先し、上記の4分割から大きく変える場合は理由を添えて構わない（例えばコンテナ幅に対して依然あふれる場合はさらに分割してよい）

### 2. ヒーロー2カラムグリッドのトラック制約（`app/page.tsx` のヒーロー内グリッドコンテナ）

現状:
```tsx
<div
  className={
    homepageWeekMatches.length > 0
      ? "grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_420px]"
      : "max-w-3xl"
  }
>
```

`lg:` 未満では `grid-template-columns` が未指定のため、暗黙グリッドが子要素の最小幅（min-content）に応じて列幅を決定し、あふれの原因になっている。lg未満でも明示的に単一トラックを `minmax(0, 1fr)` で指定する:

```tsx
<div
  className={
    homepageWeekMatches.length > 0
      ? "grid grid-cols-[minmax(0,1fr)] items-center gap-8 lg:grid-cols-[minmax(0,1fr)_420px]"
      : "max-w-3xl"
  }
>
```

## LLM 連携

なし。

## 受け入れ条件

1. 本番相当のビルドで `/` を 320px・375px・768px・1440px の4幅で表示したとき、`document.body.scrollWidth` が各ビューポート幅と一致する（水平方向のクリップ・はみ出しがない）
2. h1 のテキストノードを `Range.getClientRects()` で取得したとき、いずれの行の `width` も h1 自身の `getBoundingClientRect().width` を超えない（4幅すべてで確認）
3. 「ラグビー」の4文字が同一行内に収まり、行をまたいで分割されない（4幅すべてで確認）
4. Matchday board（`aria-label="今週の注目試合"`）が 320px・375px 幅でも `getBoundingClientRect().right` がビューポート幅を超えない
5. `tests/app/home-page.test.tsx` の既存テスト（h1 テキスト・サンプルカード削除・Matchday board 描画等）が引き続き通る。h1 のテキストアサーションが `<wbr />` 挿入後の DOM 構造（テキストが複数ノードに分割される場合がある）に対応していない場合は更新する
6. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
7. 320 / 375 / 768 / 1440px のスクリーンショットを提示し、h1 と Matchday board の両方が画面内に収まっていることを目視確認する

## 未解決の質問

- `<wbr />` の分割位置（今週の／海外／ラグビー／を、）で 320px 幅でもまだあふれる場合、どこまで細かく分割してよいか。目安として「ラグビー」（4文字）より短い単位への分割は避けたい（「ラグ／ビー」のような不自然な分割を防ぐため）が、Codex の実測で必要なら Owner に報告の上で判断する
- `feat-home-matchday-board.md` の未解決の質問にあった「ヒーローの Premium CTA 文言」変更は本 fix のスコープ外のまま。今回は触らない
