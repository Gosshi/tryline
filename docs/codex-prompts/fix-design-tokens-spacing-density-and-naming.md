# Codex 指示書: デザイントークンに spacing / density / layout を新設し、命名乖離2件を整理する

仕様書: `specs/fix-design-tokens-spacing-density-and-naming.md`
判断の根拠: `docs/decisions.md` の **D020**（2026-08-31、Owner 承認済み）

**先に spec と D020 を読んでから着手してください。**

## 位置づけ

`specs/feat-calendar-week-board.md` の**前提**です。あちらが本作業で定義するトークンと `layout.listRow` の規定を使います。**先にこちらを終わらせてください。**

## 一文で言うと

`design.md` には色・書体・角丸・影はあるのに、**spacing / density / layout が1行もありません。** 実測された不具合はすべてその空欄の中にあります。

## 最重要の制約

**見た目を1pxも変えないでください。**

本作業はトークンの定義と文書の追記だけです。`--space-*` を既存コンポーネントに**適用しないでください**。適用は後続 spec の仕事です。

`git diff` に `space-` を使う JSX や CSS の変更が含まれていたらスコープ違反です。

## やること（4つ）

| # | 対象 | 内容 |
|---|---|---|
| 1 | `design.md` | front-matter に `spacing` / `layout` を追加。本文に対応する散文を追加 |
| 2 | `app/globals.css` | `--space-*` を追加 |
| 3 | `app/globals.css` | `--font-serif-jp` を**削除**（消費箇所0のデッドコード） |
| 4 | `app/globals.css` + 3ファイル | `--color-paper` → `--color-panel` に改名 |

## 値は発明しないでください

spacing のスケールは**実装から書き起こします**。走査済みの実測値（2026-08-31）:

```
gap-2  (8px)  64回    px-4 (16px) 117回    py-2  (8px) 76回
gap-3 (12px)  52回    px-3 (12px)  72回    py-3 (12px) 41回
gap-4 (16px)  36回    px-6 (24px)  43回    py-4 (16px) 29回
gap-1.5 (6px) 17回    px-5 (20px)  37回    py-1.5 (6px)27回
gap-6 (24px)  10回    px-2  (8px)  32回    py-0.5 (2px)27回
gap-8 (32px)   6回    px-8 (32px)  30回    py-1  (4px) 25回
gap-5 (20px)   6回
コンテナ: max-w-6xl (1152px) が14箇所で最頻
```

→ base unit **4px**、スケール **2 / 4 / 6 / 8 / 12 / 16 / 20 / 24 / 32 / 40px**。

**新規に決めるのは2つだけ**です（spec の該当節に値が書いてあります）:
- `spacing.density.desktop: "compact"`（mobile は `comfortable`）
- `layout.listRow.desktop.maxEmptyRatio: 0.25`

## 本文の Layout 節に必ず書くこと

実測でこうなっています:

```
sm:  221回     ← 640px で分岐
md:   49回
lg:   24回     ← 1024px 以上に効く指定は実質30箇所
xl:    6回
```

**読者の63%はデスクトップです。** 「`sm:` で分岐して終わりにせず、`lg:` 以上で情報の並べ方を変える」という要求を本文に明示的に書いてください。これが「引き伸ばされたモバイル」の構造的な原因です。

## 改名の注意（ここが唯一の罠）

`--color-paper`（`#f5f6f8`、内部パネル用、消費3箇所）と `.bg-paper` ユーティリティ（`#f1efe9`、ページ背景、21ファイル）は**別物**です。

**改名するのは前者だけです。`.bg-paper` には一切触らないでください。**

この2つの取り違えが、過去に実際にコントラスト比の誤計算を引き起こしています（D018 の教訓に記録済み）。

置換対象の3箇所:
- `app/matches/[id]/page.tsx:548`
- `components/match-events-section.tsx:196`
- `components/score-graph.tsx:57`

`design.md` の Colors 節にある `--color-paper` の説明も新しい名前に更新してください。

## 触ってはいけないもの

- `.bg-paper` ユーティリティと、それを使う21ファイル
- Tailwind の `font-serif`（`tailwind.config.ts:40` で `var(--font-heading)` にマップ。**`--font-serif-jp` は経由していません**。10ファイル以上で意図的に使われています）
- 色・書体・角丸・影の**値**（D018 / D020 で確定済み）
- 既存コンポーネントのレイアウト

## 検証コマンド

```
grep -rn -- '--font-serif-jp' app components lib tailwind.config.ts    # 期待: 0件
grep -rn -- 'var(--color-paper)' app components lib                    # 期待: 0件
grep -rn -- 'var(--color-panel)' app components lib                    # 期待: 3件
grep -rl 'bg-paper' app components | wc -l                             # 変更前後で同じ（21）
git diff --stat                                                        # space- を使う JSX 変更が無いこと
```

さらに、**front-matter と globals.css の突き合わせ**を実行し、色・書体・角丸・影の20項目が全件一致することを PR 本文に貼ってください。2026-08-31 に一致を確認済みです（`ink-muted: #646a76` / `muted-foreground: 220 7% 42%` を含む）。**回帰させないでください。**

## 「完了」の定義

1. spec の受け入れ条件 19 項目を1件ずつ照合し、PR 本文にチェックリストで貼る
2. 上の検証コマンドの実行結果を PR 本文に貼る
3. front-matter × globals.css の20項目一致を PR 本文に貼る
4. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean
5. **見た目の非回帰**: `/` / `/calendar` / `/c/urc/2026-27` / `/matches/<公開済み試合>` / `/c/nations-championship/2026` を **1440 と 390** の両幅で変更前後に撮り、差分ゼロを示す

## 判断に迷ったら

spec の「未解決の質問」3件は Owner 判断です。実装を止めず、**spec の既定値（`maxEmptyRatio: 0.25`、`--space-*` と Tailwind の二重管理を許容、`.bg-paper` は据え置き）で進め、PR 本文で明示的に指摘してください。**
