# ページ全体の背景に質感を持たせる（案A: ペーパー質感）

## 背景

Owner から「ページが全体的に白い」という指摘（2026-07-07）。実際に確認すると、ページ本体の背景（`app/globals.css` の `--color-paper: #f5f6f8`、および各ページの `<main>` に直書きされている Tailwind の `bg-slate-50`）と、その上に乗るカードの背景（`bg-white`）がほぼ同じ明るさで、罫線とうっすらした影だけで区別している状態だった。ヒーロー写真や試合詳細のグラデーションは「白い海に浮かぶ色の島」でしかなく、ページ本体の土台には色気が一切ない。これは `~/.claude/rules/web/design-quality.md` が明示的に禁止パターンとして挙げる「Safe gray-on-white styling with one decorative accent color」に該当する。

3方向のモックアップ（`docs/design/mock-bg-{a-paper,b-dark}.html`）を作成し比較。案B「ダークベース」はフォーム・決済・スタッツ表など白背景前提のコンポーネント全体に手を入れる規模になり、GA4実測（過去90日・全184セッション）でも夜間帯（22-05時JST）の比率は約31%とダーク移行を強く裏付けるほどではなかった（合意: 2026-07-07）。まずは低リスクな**案A「ペーパー質感」を採用**する。将来的にダーク版が必要になった場合は `mock-bg-b-dark.html` の資産をトグルとして流用する想定（本specの対象外）。

基準ビジュアル: `docs/design/mock-bg-a-paper.html`

## スコープ

対象:
1. `app/globals.css` — `--color-paper` を使っている `body` の背景を、暖色寄りグラデーション + 微細グレインに変更する
2. 以下15ファイルの `<main>` に直書きされている `bg-slate-50` を、新しいペーパー質感クラス（`bg-paper` 等、名称はCodexの裁量）に置き換える:
   - `app/error.tsx`
   - `app/page.tsx`
   - `app/calendar/page.tsx`
   - `app/h2h/[pair]/page.tsx`
   - `app/players/[slug]/page.tsx`
   - `app/matches/[id]/en/page.tsx`
   - `app/teams/[slug]/page.tsx`
   - `app/en/page.tsx`
   - `app/legal/privacy/page.tsx`
   - `app/c/[competition]/page.tsx`
   - `app/c/[competition]/[season]/round/[round]/page.tsx`
   - `app/c/[competition]/[season]/page.tsx`
   - `app/c/rwc/2027/page.tsx`
   - `app/c/rwc/2027/bracket/page.tsx`
   - `app/pricing/page.tsx`
3. （任意・優先度低）ホームページ「今週の試合」セクション（`app/page.tsx:364-386` 付近）に、アクセントカラーの薄いアンビエント（放射状の色み）を追加する。モック `mock-bg-a-paper.html` の `.section-week` を参照。実装コストが見合わない場合は見送ってよい（末尾の質問参照）

対象外:
- 案B「ダークベース」の実装（別spec）
- ダークモードのトグル機能そのもの
- カード自体（`bg-white`）の変更。カードは白のまま、背景とのコントラストで差別化する
- `app/legal/terms.tsx` 等、`bg-slate-50` を使っていない他の静的ページの新規スタイリング

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

### `app/globals.css`

```diff
  body {
-   background-color: var(--color-paper);
+   background-color: #f1efe9;
+   background-image:
+     radial-gradient(120% 60% at 20% 0%, rgb(201 58 58 / 5%), transparent 60%),
+     radial-gradient(120% 60% at 100% 40%, rgb(26 58 92 / 5%), transparent 55%),
+     linear-gradient(180deg, #f8f7f4 0%, #f1efe9 45%, #eceae3 100%),
+     url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.02 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    font-family: var(--font-body);
  }
```

同じ `background` の考え方（グラデーション + グレインSVG）を、`.bg-paper` という共有ユーティリティクラス（`@layer utilities` または globals.css内の素のCSSクラス、既存の記法に合わせる）としても定義し、後述の15ファイルから使えるようにする。`background-color: var(--color-paper)` を直接参照している他の箇所があれば、置き換えの要否を確認すること（`grep -rn "color-paper" app components` で洗い出す）。

### 15ファイルの `<main>` 置き換え

```diff
- <main className="min-h-screen bg-slate-50">
+ <main className="min-h-screen bg-paper">
```

単純なクラス名の置き換えのみ。`min-h-screen` 等、他のクラスは変更しない。

### （任意）ホーム「今週の試合」セクション

```diff
- <section className="space-y-3">
+ <section className="space-y-3 rounded-[20px] bg-[radial-gradient(140%_100%_at_0%_0%,rgb(201_58_58/5%),transparent_65%)] p-3.5 -m-3.5">
    <div className="flex items-center justify-between gap-4">
```

（クラス名・実装方法はCodexの裁量。視覚的に「セクションの左上からアクセントカラーが薄く滲む」効果が出ればよい。既存のレイアウト・余白が崩れないよう注意）

## LLM 連携

なし

## 受け入れ条件

1. 全ページで `body` の背景が新しいグラデーション + グレイン処理になっている（`app/globals.css` の変更が全ページ共通で効く）
2. 上記15ファイルの `<main>` が `bg-slate-50` から新しい `bg-paper` クラスに置き換わっている
3. 既存の `bg-white` カード・コンポーネントの見た目（色・境界線）に regression がない
4. グレインテクスチャが強すぎて可読性を損なわない（本文テキストの上に重ならない、または透過率が十分低いこと）ことをスクリーンショットで確認する
5. 320/768/1024/1440pxの主要ページ（ホーム・試合詳細・カレンダー・料金）でレイアウト崩れがない
6. モバイルSafari等での `background-attachment` 関連の既知の不具合（固定背景のちらつき等）を避けるため、`background-attachment: fixed` は使わない（`scroll`のデフォルト挙動のままにする）
7. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean

## 未解決の質問

- スコープ3（「今週の試合」セクションのアンビエントカラー）は優先度低の任意対応。Codexが実装コストと見た目のバランスを見て、崩れやすい・過剰装飾になると判断すれば見送ってよい（その場合は完了報告に理由を明記すること）
- `--color-paper` トークン自体が他のコンポーネント（今回のgrep対象外の場所）で参照されている場合、置き換えの影響範囲をCodex側で確認し、影響があれば報告すること
