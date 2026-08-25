# 大会ハブのヒーロー帯: スクリム配合の是正とプール名の日本語化

## 背景

`feat-competition-hub-visual-differentiation.md`（PR #726、2026-08-25 マージ済み）でシーズンページのヒーローを写真帯にしたが、**本番で確認したところ大会によって結果が大きく振れる**ことが判明した。

### 1. スクリムが写真を殺している

現行の実装（`app/c/[competition]/[season]/page.tsx:646`）は**大会カラーをそのまま** 92% → 78% → 42% で重ねている。

```ts
background: `linear-gradient(100deg, ${accentColor}eb 0%, ${accentColor}c7 42%, ${accentColor}6b 100%)`
```

本番実測（2026-08-25）:

| 大会 | カラー | 結果 |
|---|---|---|
| シックスネイションズ | `#001489`（明るい青） | ✅ 写真が見え、色が識別として機能している |
| ネーションズチャンピオンシップ | `#1A3A5C`（暗い紺） | ⚠️ 写真は在るが**平坦な濃紺に見える**。生成画像がほぼ効いていない |
| ジャパンラグビー リーグワン | `#FF6B00`（橙） | ❌ **写真が完全に消失**。オレンジのベタ塗り |

**濃色の大会では写真と同化し、明色の大会では彩度が写真を塗り潰す。** シックスネイションズだけが成立して見えるのは、あの大会の色がたまたま明るい青で、写真にも青い照明が入っているという偶然による。他大会に一般化できない。

元 spec は「色は大会カラーの暗色版から導出してよい」と書いたが曖昧で、生のカラーが使われた。**本 spec で配合を確定する。**

### 2. プール名が英語のまま出ている

NC のヒーローに `Northern Hemisphere: フランス / Southern Hemisphere: 南アフリカ` と表示される（`app/c/[competition]/[season]/page.tsx:503`）。`competition_pools.pool_name` の生値が日本語 UI にそのまま出ている。

## スコープ

対象:
- `app/c/[competition]/[season]/page.tsx` — ヒーロー帯のスクリム配合
- `lib/format/competition.ts` — プール名の表示名変換関数を追加
- プール名を表示している箇所（ヒーロー、順位表のプール帯）

対象外:
- **B2 のレイアウト構造。** 変えるのは配合と文言だけ
- 順位表ページ・ラウンドページの構造
- `components/match-card.tsx`
- `competition_pools` テーブルへの列追加やデータ変更（表示層で解決する）
- ヒーロー以外の場所の配色

## 決定した配合（案B）

比較モック `docs/design/mock-hub-scrim-variants.html` の**案B**を採用する（Owner 選定、2026-08-25）。

**大会カラーを黒と混ぜた暗色**をスクリムに使う。色の系統は残しつつ、明色の大会でも写真が生き残る。

```
C2 = color-mix(in srgb, <大会カラー> 42%, #06090f)

background: linear-gradient(100deg,
  <C2 を alpha 92%>  0%,
  <C2 を alpha 74%> 45%,
  <C2 を alpha 30%> 100%)
```

- 大会カラーは `getCompetitionFamilyColor(family)` から取る。**ハードコードしない**
- 混合比 42% と alpha 92 / 74 / 30 は**モックで確定した値**。変更する場合はモックを焼き直して Owner が再判断する
- `color-mix` は既に `app/globals.css` の `--color-accent-dim` / `--color-accent-subtle` で使用実績がある。同じ書き方でよい

## プール名の表示名変換

`lib/format/competition.ts` に `formatPoolName(poolName: string): string` を追加する。`formatFamilyName` の隣に置き、同じ流儀にすること。

**現時点で DB に存在するプール名は8種のみ**（2026-08-25 実測、`competition_pools` 全件）:

| pool_name | 大会 | 表示 |
|---|---|---|
| `Northern Hemisphere` | nations-championship-2026 | 北半球 |
| `Southern Hemisphere` | nations-championship-2026 | 南半球 |
| `Pool A` 〜 `Pool D` | rwc-2023 | プールA 〜 プールD |
| `Pool A` 〜 `Pool F` | rwc-2027 | プールA 〜 プールF |

実装方針:

1. `Northern Hemisphere` / `Southern Hemisphere` は**完全一致のマップ**で変換する
2. `Pool X` は**正規表現 `/^Pool ([A-Z])$/` で受けて `プール$1`** にする。A〜F を個別に列挙しない（将来 Pool G 以降が増えても動く）
3. **どちらにも当たらない場合は入力をそのまま返す。** 未知のプール名を握り潰したり空文字にしたりしない

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

- ヒーロー帯の見た目が変わる。**レイアウト・文字サイズ・要素の配置は変えない**
- プール名が日本語で表示される。ヒーローの「首位」行と、順位表のプール帯の両方

## LLM 連携

なし

## 受け入れ条件

1. スクリムが `color-mix` で暗色化した大会カラーを使っている。生の `getCompetitionFamilyColor` 値をそのまま alpha 付きで使っている箇所が無い
2. `/c/league-one/2025-26` で**背景写真が視認できる**（オレンジのベタ塗りになっていない）
3. `/c/nations-championship/2026` で背景写真が視認できる
4. `/c/six-nations/2025` が現状から大きく劣化していない
5. ヒーロー内の白文字が3大会すべてで読める
6. `formatPoolName` が `Northern Hemisphere` → `北半球`、`Southern Hemisphere` → `南半球`、`Pool A` → `プールA` を返す
7. `formatPoolName` が未知の入力（例: `Conference X`）を**そのまま返す**
8. `Pool A` 〜 `Pool F` が個別列挙ではなく正規表現で処理されている
9. ヒーローの「首位」行と順位表のプール帯の両方で日本語表示になっている
10. B2 のレイアウト構造に差分が無い（要素の追加・削除・並び替えが無い。変わるのは `background` の値とプール名の文字列のみ）
11. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean

## 未解決の質問

- 案B はリーグワンの橙が焦茶寄りになる。**本番で見て違和感があれば混合比 42% を調整する**（上げると色が強く出て写真が薄くなり、下げると写真が出て色が弱くなる）。モックで再確認してから変更すること
- `rwc` ファミリーは `COMPETITION_FAMILY_COLORS` にも `COMPETITION_HERO_IMAGES` にも未登録で、汎用フォールバック（`#1e293b` / `default.jpg`）になる。RWC 2027 は専用ページを持つため実害は限定的だが、`/c/rwc/2023` 等の汎用シーズンページは存在する。**本 spec では扱わない**
