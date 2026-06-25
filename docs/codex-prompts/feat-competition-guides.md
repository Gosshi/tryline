# feat-competition-guides: 大会ガイド（family 別テーブル＋コンテンツ生成）

参照仕様書: `specs/feat-competition-guides.md`

PR #427 で `competitions.viewing_guide_ja`（シーズン別）を追加したが全件 null のまま。今回は family 単位の専用テーブルに移行し、LLM でコンテンツを生成して表示する。

---

## Task 1 — DB マイグレーション

### ファイル: `supabase/migrations/20260625010000_create_competition_guides.sql`（新規作成）

```sql
create table public.competition_guides (
  family text primary key,
  guide_ja text not null,
  updated_at timestamptz not null default now()
);

alter table public.competition_guides enable row level security;

create policy "competition_guides are publicly readable"
  on public.competition_guides for select using (true);

-- 全件 null のため安全に削除
alter table public.competitions drop column if exists viewing_guide_ja;
```

---

## Task 2 — コンテンツ生成スクリプト

### ファイル: `tools/generate-competition-guides.ts`（新規作成）

`gpt-4o` で 11 family 分のガイドを生成し、`supabase/seeds/competition-guides.sql` に出力する。実行後に Owner が内容を確認してから本番 DB に適用する。

```typescript
import * as fs from "fs";
import * as path from "path";

import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const FAMILIES: Array<{ family: string; nameJa: string }> = [
  { family: "six-nations", nameJa: "シックスネイションズ" },
  { family: "premiership", nameJa: "プレミアシップ" },
  { family: "urc", nameJa: "ユナイテッド・ラグビー・チャンピオンシップ（URC）" },
  { family: "top-14", nameJa: "トップ14" },
  { family: "super-rugby-pacific", nameJa: "スーパーラグビー・パシフィック" },
  { family: "rugby-championship", nameJa: "ラグビーチャンピオンシップ" },
  { family: "nations-championship", nameJa: "ネーションズチャンピオンシップ" },
  { family: "rwc", nameJa: "ラグビーワールドカップ" },
  { family: "autumn-nations", nameJa: "オータムネーションズシリーズ" },
  { family: "pnc", nameJa: "パシフィック・ネーションズカップ" },
  { family: "league-one", nameJa: "ジャパンラグビー リーグワン" },
];

async function generateGuide(family: string, nameJa: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    messages: [
      {
        role: "user",
        content: `あなたは海外ラグビーに詳しい日本語ライターです。
以下の大会について、日本のラグビーファン向けの簡潔なガイドを Markdown で書いてください。

大会: ${nameJa}（${family}）

以下のセクションを必ず含めること：
1. ## 大会概要（参加チーム数・形式・開催時期・決勝会場など 3〜5 文）
2. ## 歴代王者（直近 5〜8 シーズンをテーブル形式で: | シーズン | 優勝 |）
3. ## 注目の選手（現在または過去に在籍した世界的スター・日本代表選手を 3〜5 名、具体的なエピソードと共に）
4. ## 日本での視聴方法（DAZN・J SPORTS・WOWOW・NHK 等を箇条書きで）

制約:
- 全体で 400〜800 字
- 事実に基づく。不確かな情報には「〜とされています」を使う
- 視聴情報は 2026 年時点の内容で記載
- Markdown のみ出力（コードブロック不要、見出し・テーブル・箇条書きを使う）`,
      },
    ],
  });

  return response.choices[0]?.message?.content ?? "";
}

function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

async function main() {
  const inserts: string[] = [];

  for (const { family, nameJa } of FAMILIES) {
    console.log(`Generating: ${family}...`);
    const guide = await generateGuide(family, nameJa);
    inserts.push(
      `INSERT INTO competition_guides (family, guide_ja)\nVALUES ('${family}', '${escapeSql(guide)}')\nON CONFLICT (family) DO UPDATE SET guide_ja = EXCLUDED.guide_ja, updated_at = now();`,
    );
    console.log(`  Done (${guide.length} chars)`);
  }

  const outPath = path.join(process.cwd(), "supabase/seeds/competition-guides.sql");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, inserts.join("\n\n"), "utf-8");
  console.log(`\nSaved: ${outPath}`);
  console.log("Owner が内容を確認後、Supabase ダッシュボードで SQL を実行してください。");
}

main();
```

**実行方法（Owner が実行）:**

```bash
node --env-file=.env.production.local tools/run-ts.cjs tools/generate-competition-guides.ts
```

---

## Task 3 — DB クエリ変更

### ファイル: `lib/db/queries/competitions.ts`

#### 3-A. 型・マッピングから `viewingGuideJa` を削除

- `CompetitionRow` 型の `viewingGuideJa: string | null` を削除
- `CompetitionDbRow` 型の `viewing_guide_ja?: string | null` を削除
- `mapCompetitionRow` の `viewingGuideJa: row.viewing_guide_ja ?? null` を削除

#### 3-B. `getCompetitionGuide` を追加

```typescript
export async function getCompetitionGuide(
  family: string,
): Promise<string | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("competition_guides")
    .select("guide_ja")
    .eq("family", family)
    .maybeSingle();

  if (error) throw error;
  return data?.guide_ja ?? null;
}
```

---

## Task 4 — 大会ページ変更

### ファイル: `app/c/[competition]/page.tsx`

インポートに `getCompetitionGuide` を追加し、`latestSeason` 確定後にフェッチする。

```typescript
import {
  // ...既存インポート
  getCompetitionGuide,
} from "@/lib/db/queries/competitions";

// ページコンポーネント内
const guide = await getCompetitionGuide(latestSeason.family);

// JSX（変更）
// 変更前: <CompetitionViewingGuide markdown={latestSeason.viewingGuideJa} />
// 変更後:
<CompetitionViewingGuide markdown={guide} />
```

---

## Task 5 — コンポーネント見出し変更

### ファイル: `components/competition-viewing-guide.tsx`

```typescript
// 変更前
日本での視聴方法

// 変更後
大会ガイド
```

---

## 完了条件

- [ ] `supabase/migrations/20260625010000_create_competition_guides.sql` が存在する
- [ ] `tools/generate-competition-guides.ts` が実行でき `supabase/seeds/competition-guides.sql` が生成される
- [ ] `CompetitionRow` 型に `viewingGuideJa` が存在しない
- [ ] `getCompetitionGuide` がエクスポートされている
- [ ] `/c/league-one` でシード適用後に「大会ガイド」セクションが表示される（コンテンツ適用は Owner）
- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス

## ブランチ・PR

- ブランチ: `feat/competition-guides`
- PR タイトル: `Feat: competition guides (family-level table + generation script)`

## 変更しないこと

- `CompetitionViewingGuide` の描画ロジック（見出しテキストのみ変更）
- 他のページ（試合ページ・チームページ等）
- 既存 cron・ingestion パイプライン
