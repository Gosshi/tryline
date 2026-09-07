# Codex の作業は git worktree で分ける

**決定日**: 2026-09-06（Owner 判断）

## なぜ

2026-09-06、**同じ事故が 1 日に 2 回**起きた。どちらも Codex が `main` のワーキングツリーで直接作業し、そこに溜まっていた**無関係なステージ済み削除**を巻き込んでコミットしたものである。

| コミット | タイトル | 実際に消えたもの |
|---|---|---|
| `11ddd95` | docs: spec a JRFU fallback for Japan national team results | 監査ツール 873 行 + テスト 328 行（**1,201 行**） |
| `a6f2854` | docs: spec a JRFU fallback for Japan match scoring events | 上記に加え `lib/ingestion/external-identifiers.ts` ほか（**2,121 行**）。`app/page.tsx` の `sr-only` span が復活し、修正済みの横スクロールバグが戻った |

どちらもタイトルは「docs: spec を追加」で、削除とは無関係に見える。復旧は `e4a6256` と `e9f403c` の 2 コミット、計 3,322 行。

**根本原因はワーキングツリーの共有である。** `git status` に `D `（ステージ済み削除）が残った状態で誰かが `git commit` すると、そのコミットが何のためのものかに関係なく削除が入る。

## 手順

### 作業を始めるとき

```bash
git fetch origin main
git worktree add -b codex/<作業名> /tmp/tryline-<作業名> origin/main
cd /tmp/tryline-<作業名>
ln -s /Users/gota/Documents/src/tryline/node_modules node_modules
```

**`origin/main` から切ること。** ローカルの `main` は古い可能性がある（今日の事故はどちらもローカル `main` が origin より遅れた状態で起きた）。

### 作業中

`node_modules` はシンボリックリンクで共有してよい。`.env*` は**コピーしない**。本番接続が必要な作業は Owner が本体のディレクトリで行う。

### 作業を終えたとき

```bash
git add -A && git commit -m "..."     # このツリーには他人の変更が無いので -A が安全
git push -u origin codex/<作業名>
gh pr create ...
```

### PR がマージされたあと

```bash
cd /Users/gota/Documents/src/tryline
git worktree remove /tmp/tryline-<作業名>
git fetch origin main && git pull --ff-only
```

`.env` をコピーしてしまった場合は `git worktree remove` の前に必ず削除する。

## 本体のディレクトリで守ること

- **`git commit -a` と `git add -A` を使わない。** 触ったパスを明示する（`git commit -- <paths>`）
- コミット前に `git status --short` を読み、`D ` が意図したものか確認する
- 意図しない `D ` を見つけたら `git reset origin/main`（**mixed reset**）で index だけ戻す。**`--hard` は作業中のファイルを消すので使わない**。実際、今日の 2 件目では `--hard` していたら Codex の未コミット作業（後の PR #778）を失っていた

## レビュー・マージ側で守ること

今日の事故は、マージ直前に head SHA を読み直さなかったために本番へ入った。

```bash
HEAD_NOW=$(gh pr view <n> --json headRefOid -q .headRefOid)
[ "${HEAD_NOW:0:7}" = "<レビューした SHA>" ] && gh pr merge <n> --merge || echo "head が変わったので中止"
```

あわせて、単一コミットの stat ではなく**ブランチ全体**を見る。

```bash
git diff --stat origin/main...origin/<branch>
git diff --diff-filter=D --name-only origin/main...origin/<branch>   # 削除は 0 件か
```

**`gh pr view --json files` の結果はマージ時点の内容を保証しない。**

## 事故に気づいたときの復旧

汚れた本体ツリーで作業しない。独立した worktree を作る。

```bash
git worktree add --detach /tmp/tryline-restore origin/main
git -C /tmp/tryline-restore checkout <良い SHA> -- <パス1> <パス2> ...
git -C /tmp/tryline-restore status --short      # 意図した分だけか確認
git -C /tmp/tryline-restore commit -m "fix: restore ..."
git -C /tmp/tryline-restore push origin HEAD:main
git worktree remove /tmp/tryline-restore
```

パスは 1 つずつ引数に渡す。1 つの文字列にまとめると pathspec エラーになる。

削除だけを戻し、そのコミットが**追加**したものは残すこと。`a6f2854` の復旧では JRFU の spec 2 本を残し、削除された 11 パスだけを戻した。
