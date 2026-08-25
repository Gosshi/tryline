`/specs/fix-design-md-brand-realignment.md` の仕様を実装してください。仕様本文は繰り返しません。着手前に必ず spec を読んでください。

## このタスクの性質

**変更してよいファイルは `design.md` 1本だけです。**

`app/`・`components/`・`app/globals.css`・`app/layout.tsx`・設定ファイルには一切触れないでください。`design.md` の記述を実装に合わせるタスクであり、実装を design.md に合わせるタスクではありません。**方向が逆になると、Owner が 2026-06-23 に明示的に却下した案（案3「余白プレミアム」）へコードを巻き戻すことになります。**

なお `docs/codex-prompts/pr7-create-design-md.md` と `pr8-ui-design-md-polish.md` は、今回置き換える「Apple-inspired」方向の design.md を作った当時の指示書です。**参照しないでください。** 内容が現行ブランドと矛盾します。

## 値は必ず実ファイルから読む

spec 本文に書かれている値は説明用です。**転記しないでください。** 以下から読み取った実値を書いてください。

- `app/globals.css` の `:root` — 色・radius・shadow・type scale
- `app/globals.css` の `body` セレクタ — 実際の背景色と背景レイヤー（`--color-paper` とは別の値です。ここを取り違えるとコントラスト計算も全部ずれます）
- `app/layout.tsx` — フォントファミリーと weight

## 特に注意する3点

1. **`--color-paper` はページ背景ではありません。** カード内部パネル用に3箇所で使われているだけで、ページ全体の背景は `body` セレクタが別の色を持っています。現行 design.md はこれを "app background" と書いており、そこが誤りです。書き分けてください。

2. **フォントの3ロールは同一フォントのエイリアスです。** `--font-body` / `--font-heading` / `--font-serif-jp` がすべて同じ変数を指しています。「3書体を使い分ける」という現行の記述は事実に反します。実際に別フォントなのは数値表示だけです。

3. **未達を達成しているように書かないでください。** コントラスト比と `prefers-reduced-motion` は現状 WCAG AA を満たしていません。design.md は「目標」ではなく「現状の記述 ＋ 既知の未達」として書いてください。数値は自分で再計算して確認してください（相対輝度 → コントラスト比の標準式）。

## 禁止事項を空にしない

Do's and Don'ts 節は、現行の禁止（decorative gradients / glassmorphism / heavy shadows）がいずれも意図的な実装と衝突しています。ただし**削除して「何でもOK」にはしないでください。** 現行ブランドで実際に避けるべきことに置き換えてください。判断に迷う場合は、既存の実装で「やっていないこと」を根拠にしてください。

## 一致している記述は残す

全面書き換えではありません。Elevation & Depth 節のチームカラーの扱い（stripe / 低濃度グラデーションとして補助的に使い、本文テキスト色には使わない）は実装と一致しており、`docs/codex-prompts/feat-upcoming-fixture-visual-redesign.md:11` が既に実装根拠として参照しています。この種の記述は残してください。

## 完了の定義

spec の「受け入れ条件」10項目をすべて満たすこと。特に:

- `grep -c "oklch(58% 0.18 145)\|Noto Serif JP\|Fraunces" design.md` が **0**
- `git status` の差分が **`design.md` のみ**
- design.md に書いた色・radius・フォント名が `app/globals.css` / `app/layout.tsx` の実値と一致（PR 本文に、照合に使ったコマンドと結果を貼ってください）

## PR 本文に必ず含めること

- design.md の変更前後で「何がどう変わったか」の対応表（節ごと）
- 実値との照合コマンドとその出力
- 再計算したコントラスト比の値と計算方法
- 「アプリケーションコードに触れていない」ことの `git status` 出力
