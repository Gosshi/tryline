import * as fs from "node:fs";
import * as path from "node:path";
import Exa from "exa-js";
import OpenAI from "openai";

const FAMILIES: Array<{ family: string; nameJa: string; context?: string }> = [
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
    context:
      "2026年7月に初開催される新大会。ティア1の12カ国（ニュージーランド・南アフリカ・イングランド・フランス・アイルランド・スコットランド・ウェールズ・イタリア・アルゼンチン・オーストラリア・日本・ジョージア）が参加し、既存のオータムネーションズシリーズ・シックスネイションズ・ラグビーチャンピオンシップを統合した年間大会。歴代王者はまだ存在しない。「伝説の名場面・選手」セクションでは、参加12カ国の代表チームで語り継がれる歴史的な名場面・名選手のエピソードを書くこと（クラブ所属ではなく代表での実績にフォーカスする）。",
  },
  { family: "rwc", nameJa: "ラグビーワールドカップ" },
  {
    family: "autumn-nations",
    nameJa: "オータムネーションズシリーズ",
    context:
      "テストシリーズのため総合優勝チームは存在しない。各国がホームでテストマッチを行う11月の国際マッチウィーク期間。見どころセクションではその意義（南半球チームとの対戦機会・ワールドカップへの強化）を説明すること。",
  },
  { family: "pnc", nameJa: "パシフィック・ネーションズカップ" },
  { family: "league-one", nameJa: "ジャパンラグビー リーグワン" },
];

async function searchContext(exa: Exa, nameJa: string): Promise<string> {
  const results = await exa.searchAndContents(
    `${nameJa} ラグビー 歴史 有名試合 伝説的選手 エピソード`,
    { numResults: 5, text: { maxCharacters: 1500 } },
  );
  return results.results
    .map((r) => `【${r.title}】\n${r.text ?? ""}`)
    .join("\n\n");
}

async function generateGuide(
  client: OpenAI,
  exa: Exa,
  family: string,
  nameJa: string,
  context?: string,
): Promise<string> {
  const webContext = await searchContext(exa, nameJa);
  const contextBlock = context ? `\n補足情報: ${context}\n` : "";
  const response = await client.chat.completions.create({
    messages: [
      {
        content: `あなたは海外ラグビーに詳しい日本語ライターです。
以下の大会について、日本のラグビーファン向けの読み応えのあるガイドを Markdown で書いてください。

大会: ${nameJa}（${family}）
${contextBlock}
以下の参照情報を事実の根拠として使うこと（情報が矛盾する場合は信頼できる方を採用）：
---
${webContext}
---

以下のセクションを含めること：
1. ## 大会概要（形式・参加チーム数・開催時期・その大会ならではの特有のルールや称号など、詳細を 4〜6 文で）
2. ## 見どころ（この大会固有の魅力・伝統的ライバル関係・特徴的なプレースタイル・舞台となるスタジアムの雰囲気など、どの大会にも当てはまる一般論を避けて 4〜6 文で書く）
3. ## 伝説の名場面・選手（この大会で語り継がれる歴史的な選手・試合・エピソードを 3〜5 つ。年号・スコア・具体的な状況を盛り込んで生き生きと書く）
4. ## 日本での視聴方法（DAZN・J SPORTS・WOWOW・NHK 等を箇条書きで、各サービスで見られる内容を一言添えて）

厳守事項:
- 歴代王者・優勝チーム一覧のテーブルは書かない
- 上記の参照情報に載っていない具体的なスコアや年号は書かない
- 全体で 600〜1200 字（読み応えのある分量を意識する）
- 視聴情報は 2026 年時点の内容で記載
- 出力は Markdown テキストのみ。コードブロック（\`\`\`）は絶対に使わない`,
        role: "user",
      },
    ],
    model: "gpt-4o",
    temperature: 0.3,
  });

  const raw = response.choices[0]?.message?.content ?? "";
  return raw
    .replace(/^```[^\n]*\n?/m, "")
    .replace(/```\s*$/m, "")
    .trim();
}

function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

async function main() {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const exa = new Exa(process.env.EXA_API_KEY);
  const inserts: string[] = [];

  for (const { family, nameJa, context } of FAMILIES) {
    console.log(`Generating: ${family}...`);
    const guide = await generateGuide(client, exa, family, nameJa, context);
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
