#!/usr/bin/env bash
# Codex パイプライン（spec → prompt → PR → merge）の状態を俯瞰する読み取り専用スクリプト。
# 使い方: bash tools/ops/codex-queue.sh [遡る日数(default 21)]
# 出力: Markdown。判定はファイル名・ブランチ名・コミットメッセージの突合による「ヒューリスティック」。
# マージ判定はコミットログの完全一致に加え、マージ済みPRのブランチ名を正規化した緩い一致も見る
# （codex/ プレフィックス以前の feat/xxx, fix/xxx 等の命名でも拾えるようにするため）。
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 1
DAYS="${1:-21}"

echo "# Codex キュー状態（直近 ${DAYS} 日に更新された spec）"
echo
echo "_生成: $(date '+%Y-%m-%d %H:%M') / 判定はヒューリスティック。マージ判定はコミットログ完全一致＋マージ済みPRブランチ名の緩い一致に依る_"
echo

# --- 1. オープン PR ---
echo "## オープン PR"
echo
PR_JSON="$(gh pr list --state open --limit 30 --json number,title,headRefName,isDraft 2>/dev/null || true)"
if [ -z "$PR_JSON" ] || [ "$PR_JSON" = "[]" ]; then
  echo "（オープン PR なし）"
else
  echo "$PR_JSON" | node -e '
    const prs = JSON.parse(require("fs").readFileSync(0, "utf8"));
    console.log("| # | タイトル | ブランチ | 種別 |");
    console.log("|---|---|---|---|");
    for (const p of prs) {
      const kind = p.title.startsWith("draft:") ? "routine ドラフト（検品対象）"
                 : p.headRefName.startsWith("codex/") ? "Codex 実装（レビュー対象）"
                 : "その他";
      console.log(`| ${p.number} | ${p.title} | ${p.headRefName} | ${kind} |`);
    }
  '
fi
echo

# --- 2. 直近 spec のパイプライン状態 ---
echo "## 直近 spec の状態"
echo
echo "| spec | prompt | 状態 |"
echo "|---|---|---|"

REMOTE_BRANCHES="$(git branch -r 2>/dev/null || true)"

# マージ済みPRのブランチ名を正規化して緩い一致に使う。
# "codex/" プレフィックス採用以前の命名（feat/xxx, fix/xxx 等）はマージコミット
# メッセージに slug がそのまま出現しないため、スラッシュをハイフンに変換した形や
# プレフィックスを外した形も候補に含める。
MERGED_PR_JSON="$(gh pr list --state merged --limit 300 --json headRefName 2>/dev/null || true)"
MERGED_BRANCHES_NORM="$(echo "$MERGED_PR_JSON" | node -e '
  let d = "";
  process.stdin.on("data", (c) => (d += c));
  process.stdin.on("end", () => {
    let prs = [];
    try { prs = JSON.parse(d || "[]"); } catch (e) { prs = []; }
    const out = new Set();
    for (const p of prs) {
      const raw = p.headRefName || "";
      if (!raw) continue;
      out.add(raw);
      out.add(raw.replace(/\//g, "-"));
      out.add(raw.replace(/^[a-z0-9]+\//, ""));
    }
    console.log([...out].join("\n"));
  });
' 2>/dev/null || true)"

FOUND=0
while IFS= read -r spec; do
  [ -z "$spec" ] && continue
  slug="$(basename "$spec" .md)"
  [ "$slug" = "README" ] && continue
  FOUND=1

  prompt="docs/codex-prompts/${slug}.md"
  if [ -f "$prompt" ]; then prompt_mark="あり"; else prompt_mark="**なし**"; fi

  # 状態判定（優先順: オープンPR > マージ済み(ログ一致/緩い一致) > ブランチのみ > Codex待ち > プロンプト未作成）
  status="spec のみ（プロンプト未作成）"
  if [ -f "$prompt" ]; then status="Codex 待ち（プロンプト作成済み）"; fi
  if [ -n "$(git log --oneline -n 1 --grep="$slug" main 2>/dev/null)" ]; then
    status="マージ済みらしい（ログ一致）"
  elif [ -n "$MERGED_BRANCHES_NORM" ] && echo "$MERGED_BRANCHES_NORM" | grep -qxF "$slug"; then
    status="マージ済みらしい（緩い一致）"
  fi
  if [ -n "$PR_JSON" ] && [ "$PR_JSON" != "[]" ] && echo "$PR_JSON" | grep -q "$slug"; then
    status="**PR オープン（レビュー待ち）**"
  elif echo "$REMOTE_BRANCHES" | grep -q "$slug" && [ "$status" != "マージ済みらしい（ログ一致）" ] && [ "$status" != "マージ済みらしい（緩い一致）" ]; then
    status="ブランチあり・PR なし（要確認）"
  fi

  echo "| ${slug} | ${prompt_mark} | ${status} |"
done < <(find specs -name '*.md' -mtime -"$DAYS" 2>/dev/null | sort)

if [ "$FOUND" = 0 ]; then
  echo "| （直近 ${DAYS} 日に更新された spec なし） | - | - |"
fi
echo

# --- 3. 集計 ---
echo "## 集計"
echo
echo "- spec 総数: $(ls specs/*.md 2>/dev/null | grep -cv README | tr -d ' ') / prompt 総数: $(ls docs/codex-prompts/*.md 2>/dev/null | wc -l | tr -d ' ')"
echo "- 直近 ${DAYS} 日の spec: $(find specs -name '*.md' -mtime -"$DAYS" 2>/dev/null | grep -cv README | tr -d ' ')"
