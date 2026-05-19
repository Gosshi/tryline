# PR #82 — 英語コンテンツ品質改善（チーム名・選手名・プロンプト強化）

## 背景

現状の英語生成コンテンツに以下の問題がある:

1. **チーム名・選手名が日本語のまま** — `assemble.ts` が日本語名を DB から取得し、そのまま LLM に渡すため
2. **bold 禁止を LLM が無視** — プロンプトの指示が弱い
3. **内容が薄い** — 英語プロンプトの構成指示が日本語版より大幅に少ない

## スコープ

対象:

- `supabase/migrations/<timestamp>_add_teams_english_name.sql`
- `lib/llm/types.ts`
- `lib/llm/stages/assemble.ts`
- `lib/llm/pipeline.ts`
- `lib/llm/stages/generate-narrative.ts`

対象外:

- 日本語コンテンツ生成への影響なし（`language = 'ja'` は変更しない）
- 既存生成済みコンテンツの再生成（別途手動対応）

---

## 1. マイグレーション — `teams.english_name` 追加

```sql
ALTER TABLE teams ADD COLUMN english_name text;

UPDATE teams SET english_name = 'Kubota Spears Funabashi Tokyo-Bay'                WHERE name = 'クボタスピアーズ船橋・東京ベイ';
UPDATE teams SET english_name = 'Kobelco Kobe Steelers'                            WHERE name = 'コベルコ神戸スティーラーズ';
UPDATE teams SET english_name = 'Toyota Verblitz'                                  WHERE name = 'トヨタヴェルブリッツ';
UPDATE teams SET english_name = 'Ricoh Black Rams Tokyo'                           WHERE name = 'リコーブラックラムズ東京';
UPDATE teams SET english_name = 'Mitsubishi Heavy Industries Sagamihara Dynaboars' WHERE name = '三菱重工相模原ダイナボアーズ';
UPDATE teams SET english_name = 'Mie Honda Heat'                                   WHERE name = '三重ホンダヒート';
UPDATE teams SET english_name = 'Saitama Panasonic Wild Knights'                   WHERE name = '埼玉パナソニックワイルドナイツ';
UPDATE teams SET english_name = 'Tokyo Suntory Sungoliath'                         WHERE name = '東京サントリーサンゴリアス';
UPDATE teams SET english_name = 'Toshiba Brave Lupus Tokyo'                        WHERE name = '東芝ブレイブルーパス東京';
UPDATE teams SET english_name = 'Yokohama Canon Eagles'                            WHERE name = '横浜キヤノンイーグルス';
UPDATE teams SET english_name = 'Urayasu D-Rocks'                                  WHERE name = '浦安D-Rocks';
UPDATE teams SET english_name = 'Shizuoka Blue Revs'                               WHERE name = '静岡ブルーレヴズ';
```

`english_name` は nullable。海外チーム（Leinster, Bath 等）は null のまま。

---

## 2. `lib/llm/types.ts` — `AssembledContentInput` に `english_name` 追加

```ts
home_team: {
  id: string;
  name: string;
  english_name: string | null; // 追加
  short_code: string | null;
  country: string;
} | null;
// away_team も同様
```

---

## 3. `lib/llm/stages/assemble.ts` — 英語用名前置換

### 3-1. 引数に `language` を追加

```ts
export async function assembleMatchContentInput(
  matchId: string,
  language: "ja" | "en" = "ja",
): Promise<AssembledContentInput>;
```

### 3-2. teams クエリに `english_name` を追加

```ts
home_team:teams!matches_home_team_id_fkey(id, name, english_name, short_code, country),
away_team:teams!matches_away_team_id_fkey(id, name, english_name, short_code, country)
```

### 3-3. 名前解決ヘルパー

```ts
function resolveTeamName(
  name: string,
  englishName: string | null,
  language: "ja" | "en",
): string {
  return language === "en" && englishName ? englishName : name;
}
```

`assembled.match.home_team.name` / `assembled.match.away_team.name` に適用する。

### 3-4. `recent_form` / `h2h_last_5` / `match_events` の team_name も置換

これらのクエリも `teams(name, english_name)` を取得し、`language = 'en'` のとき
`english_name ?? name` に差し替える。

対象フィールド:

- `recent_form.home[].home_team_name` / `away_team_name`
- `recent_form.away[].home_team_name` / `away_team_name`
- `h2h_last_5[].home_team_name` / `away_team_name`
- `match_events[].team_name`

---

## 4. `lib/llm/pipeline.ts` — language を assemble に渡す

```ts
const assembled = await assembleMatchContentInput(matchId, language);
```

---

## 5. `lib/llm/stages/generate-narrative.ts` — 英語プロンプト強化

`buildEnglishNarrativePrompt` を以下の方針で書き直す。

### 禁止事項（冒頭に明示）

```
HARD RULES — follow without exception:
- Never use bold markers (**text** or __text__). Not in headings, not in bullet points. Nowhere.
- Never use Japanese characters (hiragana, katakana, kanji). The output must be entirely in English.
- Do not invent player names, events, or details not present in the input data.
```

### 構成・字数指示（recap）

```
Structure for recap:
1) Match Overview — 300–400 words. Final score, flow of the match, decisive factor.
2) Turning Points — 350–450 words. Based ONLY on the match_events data. Walk through scoring events in order and explain momentum shifts.
3) Player of the Match — 200–300 words. Identify the standout performer with specific evidence from events. Omit this section if lineup data is missing.
4) What It Means Next — 200–300 words. Table implications, next fixture context, form trajectory for both teams.
Target: 1,200+ words total.
```

### 構成・字数指示（preview）

```
Structure for preview:
1) Team Context and Form — 300–400 words. Current table position, recent results from recent_form, momentum.
2) Tactical Themes — 400–500 words. Expected patterns of play, key positional battles, pressure points.
3) Key Players and Prediction — 200–300 words. If lineups present, name key individuals. Otherwise focus on likely patterns based on form and head-to-head data.
Target: 1,000+ words total.
```

### 選手名変換の指示

```
Player names in the input may be in Japanese katakana. Convert them to their standard romanized English form using common rugby name conventions.
Examples: チェスリン・コルビ → Cheslin Kolbe, 流大 → Yutaka Nagare, ケイレブ・トラスク → Caleb Trask.
If uncertain, produce a reasonable romanization rather than leaving any Japanese characters in the output.
```

### バージョン更新

`recap@2.1.0-en` → `recap@2.2.0-en`
`preview@1.9.0-en` → `preview@2.0.0-en`

---

## 完了の定義

- [ ] 英語生成コンテンツにカタカナ・漢字・ひらがなが含まれない
- [ ] bold (`**`) が出力に含まれない
- [ ] recap が 1,200 語以上、preview が 1,000 語以上
- [ ] `language = 'ja'` の生成結果に変化なし
- [ ] TypeScript エラーなし・`pnpm build` 通過
