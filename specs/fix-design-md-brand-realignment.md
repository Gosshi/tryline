# design.md を現行ブランドへ再整合する

## 背景

`design.md`（リポジトリ直下、176行）は **2026-05-06** に「Apple-inspired design system」として作成された（commit `91ea49f`）。しかしその **7週間後の 2026-06-23**、Owner は試合ページ刷新のモック3案から **案1「やわらかモダン」**（丸ゴシック Zen Maru Gothic ＋ 白基調 ＋ チームカラーグラデ）を選定し、案3「余白プレミアム」（細身セリフ＋余白、上品だが訴求が弱い）を**明示的に不採用**とした。

`design.md` の内容は事実上この却下された案3である。

- `design.md`: accent = 緑 `oklch(58% 0.18 145)` / 見出し = `Noto Serif JP` セリフ / display = `Fraunces` / "Cards should feel crisp and premium, **not playful**"
- 実装: accent = `#c93a40`（赤）/ 全フォントロールが `Zen_Maru_Gothic`（＝丸ゴシック、まさに playful）/ 数値のみ `Outfit`

design.md は以後一度も更新されず、2026-06-23 の刷新・2026-07-07 の bento 刷新のいずれも反映されていない。デザイン監査（PR #722、`docs/design/audit-2026-08-24.md` 所見 A-1）でこの世代差が検出された。

**D018 により「実装を文書に寄せる」のではなく「文書を現行ブランドで書き直す」と決定した。** 実装を design.md に寄せることは Owner が却下した案3への回帰を意味するため。

## スコープ

対象:
- `design.md` の記述を現行実装に合わせて改訂する

対象外（重要）:
- **アプリケーションコードの変更は一切しない**。`app/`・`components/`・`app/globals.css`・`app/layout.tsx` に差分を出してはいけない
- トークン名の変更・リネーム（`--font-serif-jp` 等の命名問題は「未解決の質問」に記載、別 spec）
- コントラスト比の是正そのもの（a11y 修正は別 spec。本 spec は「現状を正しく記述する」ところまで）
- `docs/design/audit-2026-08-24.md` の書き換え

## 全面書き換えではない

design.md には**実装と既に一致している記述もある**。たとえば Elevation & Depth 節の

> Team identity is expressed through stripes and low-opacity card gradients, not through primary text color.

は現行実装の方針と一致しており、`docs/codex-prompts/feat-upcoming-fixture-visual-redesign.md:11` が既にこの記述を実装の根拠として参照している。**一致している記述は残すこと。** 乖離している節だけを対象にする。

## 値の取得元（source of truth）

design.md に書く具体値は、**必ず以下の実ファイルから読み取って記述する。** 本 spec の本文に書かれた値を転記してはいけない（本 spec の値は説明用であり、実装が更新されれば古くなる）。

- `app/globals.css` の `:root` ブロック — 色・radius・shadow・type scale の各トークン
- `app/globals.css` の `body` セレクタ — 実際の背景色と背景レイヤー
- `app/layout.tsx` — フォントファミリーと weight の定義

## 改訂する節と内容

### Colors

- accent を実装値（`--color-accent`）に置き換える。緑 `oklch(58% 0.18 145)` の記述を消す
- `--color-paper` / `--color-ink` / `--color-ink-muted` / `--color-rule` を実装値に置き換える
- **`--color-paper` と実際の body 背景が異なる事実を書き分けること。** `--color-paper` はカード内部パネル用として3箇所（`app/matches/[id]/page.tsx`・`components/match-events-section.tsx`・`components/score-graph.tsx`）で使われており、ページ全体の背景は `body` セレクタが持つ別の色である。「app background」と一括りにしない
- 現行の shadcn 互換トークン（`--background` / `--primary` 等の HSL 値）との対応関係にも触れる

### Typography

- 見出しのセリフ指定（`Noto Serif JP`）と display の `Fraunces` を削除し、実装のフォント構成に置き換える
- **`--font-body` / `--font-heading` / `--font-serif-jp` の3ロールがすべて同一フォントにエイリアスされている事実を明記する。** 「3つの書体を使い分ける」という現行 design.md の記述は誤り
- 数値表示だけが別フォント（`--font-number`）で `tabular-nums` を使う、という実際の役割分担を書く
- body の `font-weight` と見出しの `font-weight` の実値を書く
- type scale トークン（`--text-xs` 〜 `--text-4xl`）の実際の段数を記載する

### Shapes

- radius を実装値（`--radius-sm` / `--radius-md` / `--radius-lg` および `--radius`）に置き換える
- 「Avoid overly rounded cards... not playful」という現行の記述は、選定された方向性（やわらかモダン＝親しみやすさ）と矛盾するため書き換える

### Elevation & Depth ／ Do's and Don'ts

現行 design.md は以下を禁止しているが、いずれも**意図的な実装として存在する**。禁止ルールを実態に合わせて改訂すること。

| 現行 design.md の禁止 | 実装の実態 |
|---|---|
| decorative gradients を避ける | body / `.bg-paper` に radial-gradient + linear-gradient + ノイズテクスチャ（紙テクスチャ背景、commit `0bc0238` の意図的実装） |
| glassmorphism を避ける | `backdrop-blur` が UI 全体で13宣言 |
| heavy shadows を避ける | `--shadow` は大きめのソフトシャドウ |

「何を避けるか」を捨てるのではなく、**現行ブランドで実際に避けるべきものに置き換える**こと（例: チームカラーを本文テキスト色に使わない、データを邪魔する装飾を足さない、等）。無条件に全部許可する記述にはしない。

### Accessibility

- 実測のコントラスト比を記載する。**現状が要求を満たしていない場合、満たしているかのように書いてはいけない。** 「既知の未達」として明記する
- 参考値（2026-08-25 時点の実測、Codex 側で再計算して確認すること）:
  - ink / 実 body 背景 = 13.37:1
  - ink-muted / 実 body 背景 = 3.60:1（WCAG AA の 4.5:1 未達）
  - ink-muted / 白カード = 4.14:1（同じく未達）
- `prefers-reduced-motion` の記述は残す。ただし**現状の実装が0箇所である**ことを既知の未達として明記する
- フォーカスリングの記述は実装の実値に合わせる

### Overview ／ Brand Position ／ Visual Principles

- 「Apple-inspired」という位置づけを、選定された方向性（案1「やわらかモダン」＝親しみやすくアプリらしい）に置き換える
- 方向性の決定日（2026-06-23）と、基準モック `docs/design/mock-1-soft-v3.html` への参照を残す

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

なし（ドキュメントのみ）

## LLM 連携

なし

## 受け入れ条件

1. `design.md` 内のすべての具体値（色・radius・shadow・フォント名・weight・type scale）が `app/globals.css` および `app/layout.tsx` の実値と一致する。照合はテキスト検索で機械的に可能なこと
2. `oklch(58% 0.18 145)` / `Noto Serif JP` / `Fraunces` の記述が `design.md` に **0件**（`grep -c` で確認できること）
3. `--color-paper` について、ページ全体の背景ではなく内部パネル用トークンであることが書かれている
4. `--font-body` / `--font-heading` / `--font-serif-jp` が同一フォントを指している事実が書かれている
5. Accessibility 節に実測コントラスト比が記載され、要求未達の項目が「未達」と明記されている
6. `prefers-reduced-motion` 対応が現状0箇所である旨が明記されている
7. Do's and Don'ts 節が空でも「全部OK」でもなく、現行ブランドで避けるべき事項を具体的に列挙している
8. 方向性が「やわらかモダン」であることと決定日への言及がある
9. **`git status` で `design.md` 以外の差分が0件**。アプリケーションコード・CSS・設定ファイルに一切触れていない
10. 実装と既に一致している記述（Elevation & Depth のチームカラーの扱い等）が削除されずに残っている

## 未解決の質問

Codex 着手前に Owner が判断する必要はないが、本 spec の作業中に気づいた点として記録する。**いずれも本 spec では扱わず、別 spec の候補とする。**

- `--color-paper`（内部パネル用）と body の実背景色が別値であることは意図的か、統一すべき不整合か。統一する場合はコード変更を伴うため別 spec
- `--font-serif-jp` というトークン名が実際には丸ゴシックを指しており、名前と実体が乖離している。リネームは影響範囲の調査が必要なため別 spec
- コントラスト未達（ink-muted 3.60:1 / 4.14:1）と `prefers-reduced-motion` 0箇所は実バグであり、design.md の記述とは独立に修正 spec が必要
