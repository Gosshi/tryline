---
name: pr-merge
description: Codex の PR を確認してマージし、後処理までやるときに使う。「問題なければマージして」「マージまでやって」と言われたら起動。CI 確認・マージ方式・ローカル整理・デプロイ確認の手順。
---

# PR マージ〜後処理

`codex-review` スキル（spec 照合・Tryline 固有チェック）でレビューした後の、マージと後処理のワークフロー。**マージは Owner の明示的な許可があるときだけ**（「問題なければマージして」等）。

## 手順

### 1. CI 確認

```bash
gh pr checks <番号>
```

全て pass になるまでマージしない。pending の場合は Monitor で terminal state を待つ（ポーリングループを直接 sleep で書かない）。

### 2. マージ

```bash
gh pr merge <番号> --merge --delete-branch
```

このリポジトリの標準は **merge commit 方式**（squash ではない）。`gh pr view <番号> --json state,mergedAt` で MERGED を確認。

### 3. ローカル整理（重要・事故ポイント）

Codex がこの共有ワークツリーで作業するため、マージ済みの内容と同一のファイルが**未コミット変更・未追跡ファイルとしてローカルに残る**ことがある。`git pull` が abort したら:

1. `git fetch origin main`（**必ず fetch してから比較**。古い ref と比較すると DIFFERS と誤判定する）
2. 各ファイルを `cmp -s <file> <(git show origin/main:<file>)` でバイト比較
3. **IDENTICAL を確認できたものだけ** `rm`（未追跡）/ `git checkout --`（変更）で破棄
4. DIFFERS のファイルは**破棄しない**。内容を確認して Owner に報告
5. `git pull` して `git log --oneline -3` でマージコミットを確認

### 4. デプロイ確認

```bash
gh api repos/Gosshi/tryline/commits/<merge-sha>/status --jq '.state'
```

- `pending` → Monitor で success/failure を待つ（2〜8分かかる）
- デプロイ success 直後は **CDN エッジキャッシュが古い内容を返すことがある**。静的アセット差し替えの場合は `curl -sI <URL> | grep -iE "content-length|x-vercel-cache"` で新ファイルのサイズになったか確認。数分の伝播遅延は正常
- 本番で該当ページを Playwright で開き目視確認（`site-audit` スキルの誤検出注意も参照）

## 直列依存の管理

同じファイルを触る PR は並列マージしない。マージ順は spec 作成時に決めた依存関係（例: シーズンページ → RWC2027）に従う。
