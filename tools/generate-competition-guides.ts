import * as fs from "node:fs";
import * as path from "node:path";
import OpenAI from "openai";

const FAMILIES: Array<{ family: string; nameJa: string }> = [
  { family: "six-nations", nameJa: "シックスネイションズ" },
  { family: "premiership", nameJa: "プレミアシップ" },
  {
    family: "urc",
    nameJa: "ユナイテッド・ラグビー・チャンピオンシップ（URC）",
  },
  { family: "top-14", nameJa: "トップ14" },
  {
    family: "super-rugby-pacific",
    nameJa: "スーパーラグビー・パシフィック",
  },
  {
    family: "rugby-championship",
    nameJa: "ラグビーチャンピオンシップ",
  },
  {
    family: "nations-championship",
    nameJa: "ネーションズチャンピオンシップ",
  },
  { family: "rwc", nameJa: "ラグビーワールドカップ" },
  {
    family: "autumn-nations",
    nameJa: "オータムネーションズシリーズ",
  },
  { family: "pnc", nameJa: "パシフィック・ネーションズカップ" },
  { family: "league-one", nameJa: "ジャパンラグビー リーグワン" },
];

async function generateGuide(
  client: OpenAI,
  family: string,
  nameJa: string,
): Promise<string> {
  const response = await client.chat.completions.create({
    messages: [
      {
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
        role: "user",
      },
    ],
    model: "gpt-4o",
    temperature: 0.3,
  });

  return response.choices[0]?.message?.content ?? "";
}

function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

async function main() {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const inserts: string[] = [];

  for (const { family, nameJa } of FAMILIES) {
    console.log(`Generating: ${family}...`);
    const guide = await generateGuide(client, family, nameJa);
    inserts.push(
      `INSERT INTO competition_guides (family, guide_ja)\nVALUES ('${family}', '${escapeSql(guide)}')\nON CONFLICT (family) DO UPDATE SET guide_ja = EXCLUDED.guide_ja, updated_at = now();`,
    );
    console.log(`  Done (${guide.length} chars)`);
  }

  const outPath = path.join(
    process.cwd(),
    "supabase/seeds/competition-guides.sql",
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, inserts.join("\n\n"), "utf-8");
  console.log(`\nSaved: ${outPath}`);
  console.log(
    "Owner が内容を確認後、Supabase ダッシュボードで SQL を実行してください。",
  );
}

void main();
