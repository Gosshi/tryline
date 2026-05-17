# PR53: canonical 候補ペア検出スクリプト

## 背景

`players` テーブルに `player-{uuid}` スラグの選手が多数存在する。
これらは主に：
1. 日本語漢字名の選手（田村優 → `player-2a340978`）
2. 外国籍選手のカタカナ名（アーロン・スミス → `player-f2868d1e`）

であり、それぞれ英語名（`yu-tamura`、`aaron-smith` 等）の canonical エントリと
同一人物であるが `canonical_player_id` が未設定のまま分断されている。

本スクリプトは「uuid スラグ選手 × 英語名候補」のペアを名前類似度から自動生成し、
オーナーが確認後に一括 SQL を流せるようにする。

## スコープ

対象:
- `scripts/find-canonical-candidates.ts` — 新規作成
- `pnpm add -D wanakana` — カタカナ→ローマ字変換ライブラリを devDependency に追加

対象外:
- 実際の `canonical_player_id` 更新（スクリプト出力の SQL を手動で流す）
- 完全自動マージ（必ず人間レビューを挟む）

---

## 変更詳細

### 1. 依存追加

```bash
pnpm add -D wanakana
```

---

### 2. `scripts/find-canonical-candidates.ts`

#### 実行方法

```bash
NEXT_PUBLIC_SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=yyy \
  pnpm tsx scripts/find-canonical-candidates.ts > candidates.md
```

実際には `.env.local` を dotenv で読み込む形でも可。

#### 処理フロー

1. Supabase から全 `player-{uuid}` スラグ選手（canonical_player_id IS NULL）を取得
2. Supabase から全 canonical 候補選手（slug が `player-` 始まりでなく、canonical_player_id IS NULL）を取得
3. uuid 選手ごとに名前タイプを判定:
   - **カタカナ主体**（カタカナ文字が名前全体の 50% 以上）→ `wanakana.toRomaji()` でローマ字化
   - **漢字・ひらがな主体** → 読み推定不可のため未マッチ扱い
4. ローマ字化した名前をスラグ形式に正規化（小文字、スペース→ハイフン、非 ASCII 除去）
5. canonical 候補のスラグ一覧と Levenshtein 距離で類似度スコアを計算。スラグ末尾の `-2`、`-3` 等のサフィックスは比較前に除去する
6. スコア上位 3 件の候補を出力（0.5 未満は除外）
7. Markdown 形式でレポートを stdout に出力

#### 出力形式

```markdown
# canonical 候補レポート 2026-05-17

## 高信頼度（スコア 0.8 以上）

### アーロン・スミス → aaron-smith
- uuid スラグ: `player-f2868d1e` (トヨタヴェルブリッツ)
- 候補スラグ: `aaron-smith` (New Zealand)
- スコア: 0.91
- SQL: `UPDATE players SET canonical_player_id = '<canonical_id>' WHERE id = '<uuid_player_id>';`

...

## 中信頼度（スコア 0.5〜0.8）

...

## 未マッチ（カタカナ変換後も候補なし、または漢字名）

| 名前 | スラグ | チーム |
|------|--------|--------|
| 田村優 | player-2a340978 | 横浜キヤノンイーグルス |
```

#### 実装コード

```typescript
import { createClient } from "@supabase/supabase-js";
import { toRomaji } from "wanakana";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type PlayerRow = {
  id: string;
  name: string;
  slug: string;
  team: { name: string } | null;
};

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function similarity(a: string, b: string): number {
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (longer.length === 0) return 1.0;
  return (longer.length - levenshtein(longer, shorter)) / longer.length;
}

function isKatakanaDominant(name: string): boolean {
  const chars = name.replace(/[\s・]/g, "").split("");
  const katakana = chars.filter((c) => c >= "゠" && c <= "ヿ");
  return chars.length > 0 && katakana.length / chars.length > 0.5;
}

function toSlugCandidate(name: string): string {
  return toRomaji(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// スラグ末尾の重複サフィックス（-2, -3 等）を除去
function stripSuffix(slug: string): string {
  return slug.replace(/-\d+$/, "");
}

async function main() {
  const { data: uuidPlayers } = await supabase
    .from("players")
    .select("id, name, slug, team:teams!players_team_id_fkey(name)")
    .like("slug", "player-%")
    .is("canonical_player_id", null);

  const { data: canonicalPlayers } = await supabase
    .from("players")
    .select("id, name, slug, team:teams!players_team_id_fkey(name)")
    .not("slug", "like", "player-%")
    .is("canonical_player_id", null);

  if (!uuidPlayers || !canonicalPlayers) {
    console.error("DB fetch failed");
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const high: string[] = [];
  const mid: string[] = [];
  const unmatched: string[] = [];

  for (const player of uuidPlayers as PlayerRow[]) {
    const teamName = player.team?.name ?? "";

    if (!isKatakanaDominant(player.name)) {
      unmatched.push(`| ${player.name} | ${player.slug} | ${teamName} |`);
      continue;
    }

    const slugCandidate = toSlugCandidate(player.name);

    const scored = (canonicalPlayers as PlayerRow[])
      .map((cp) => ({
        cp,
        score: similarity(slugCandidate, stripSuffix(cp.slug)),
      }))
      .filter((x) => x.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (scored.length === 0) {
      unmatched.push(`| ${player.name} | ${player.slug} | ${teamName} |`);
      continue;
    }

    const best = scored[0];
    const cpTeamName = best.cp.team?.name ?? "";
    const block = [
      `### ${player.name} → ${best.cp.slug}`,
      `- uuid スラグ: \`${player.slug}\` (${teamName})`,
      `- 候補スラグ: \`${best.cp.slug}\` (${cpTeamName})`,
      `- スコア: ${best.score.toFixed(2)}`,
      `- SQL: \`UPDATE players SET canonical_player_id = '${best.cp.id}' WHERE id = '${player.id}';\``,
      "",
    ].join("\n");

    if (best.score >= 0.8) {
      high.push(block);
    } else {
      mid.push(block);
    }
  }

  const lines = [
    `# canonical 候補レポート ${today}`,
    "",
    `## 高信頼度（スコア 0.8 以上） — ${high.length} 件`,
    "",
    ...high,
    `## 中信頼度（スコア 0.5〜0.8） — ${mid.length} 件`,
    "",
    ...mid,
    `## 未マッチ（漢字名または候補なし） — ${unmatched.length} 件`,
    "",
    "| 名前 | スラグ | チーム |",
    "|------|--------|--------|",
    ...unmatched,
  ];

  console.log(lines.join("\n"));
}

main();
```

---

## 受け入れ条件

- `pnpm tsx scripts/find-canonical-candidates.ts > candidates.md` が完走する
- カタカナ名の uuid 選手（アーロン・スミス、ブロディ・レタリック 等）に対して対応する英語名スラグが高信頼度候補として出る
- 漢字名（田村優、流大 等）は「未マッチ」セクションに列挙される
- 各エントリに即実行可能な SQL `UPDATE` 文が含まれる
- `pnpm build` でエラーなし

## 参考ファイル

- `scripts/backfill-match-lineups.ts` — スクリプトの全体構造参考
- `scripts/import-league-one-full.ts` — Supabase クライアントの使い方参考
