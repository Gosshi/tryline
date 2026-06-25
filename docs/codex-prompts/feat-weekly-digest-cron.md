# Codex 指示: 週次ラグビーまとめ自動生成 cron

仕様書: `specs/feat-weekly-digest-cron.md`

## やること

1. `app/api/cron/weekly-digest/route.ts` を新規作成する
2. `lib/env.ts` に環境変数を追加する
3. `vercel.json` に cron スケジュールを追加する

---

## 1. `app/api/cron/weekly-digest/route.ts`

### 参考にする既存ファイル

- `app/api/cron/notify-discord/route.ts` — Discord への POST パターン、`assertCronAuthorized`、`getServerEnv` の使い方
- `app/api/cron/generate-content/route.ts` — Supabase クエリパターン
- `lib/llm/models.ts` — `NARRATIVE_MODEL` のインポート方法
- `lib/db/server.ts` — `getSupabaseServerClient` の使い方
- `lib/cron/auth.ts` — `assertCronAuthorized`, `CronUnauthorizedError`

### route の骨格

```ts
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);

    const { DISCORD_WEBHOOK_WEEKLY_DIGEST } = getServerEnv();
    if (!DISCORD_WEBHOOK_WEEKLY_DIGEST) {
      return NextResponse.json({ skipped: true, reason: 'no_webhook' });
    }

    // 1. 先週土〜日（JST）の試合を取得
    // 2. 0件ならスキップ
    // 3. GPT-4o でまとめ原稿生成
    // 4. Discord に送信（2000文字超は分割）
    // 5. 正常レスポンス
  } catch (error) {
    // 既存の notify-discord と同じエラーハンドリングパターン
  }
}
```

### 先週土〜日の日時計算

JST = UTC+9。月曜 UTC 12:00（JST 21:00）実行。

```ts
const now = new Date();
// 先週土曜 00:00 JST = 土曜 UTC 15:00 = 月曜実行の 2日+9時間前
const lastSatStart = new Date(now);
lastSatStart.setUTCDate(now.getUTCDate() - 2);
lastSatStart.setUTCHours(15, 0, 0, 0); // 土曜 00:00 JST

// 先週日曜 23:59 JST = 日曜 UTC 14:59 = 月曜実行の 1日-前
const lastSunEnd = new Date(now);
lastSunEnd.setUTCDate(now.getUTCDate() - 1);
lastSunEnd.setUTCHours(14, 59, 59, 999); // 日曜 23:59 JST
```

### Supabase クエリ

```ts
const { data: rawMatches, error } = await db
  .from('matches')
  .select(`
    id,
    home_score,
    away_score,
    kickoff_at,
    home_team:teams!matches_home_team_id_fkey ( name ),
    away_team:teams!matches_away_team_id_fkey ( name ),
    competition:competitions!matches_competition_id_fkey ( family, name_ja )
  `)
  .not('home_score', 'is', null)
  .not('away_score', 'is', null)
  .gte('kickoff_at', lastSatStart.toISOString())
  .lte('kickoff_at', lastSunEnd.toISOString())
  .order('kickoff_at', { ascending: true });

// league-one は JS 側でフィルタ（リレーションフィルタが効かない場合の保険）
const matches = (rawMatches ?? []).filter(
  (m) => firstRelation(m.competition)?.family !== 'league-one'
);
```

### LLM 呼び出し

`lib/llm/models.ts` の `NARRATIVE_MODEL` を使う。既存の `lib/llm/` 配下のクライアントラッパーがあればそれを使う。なければ `openai` パッケージの `chat.completions.create` を直接呼ぶ。

**システムプロンプト:**
```
あなたはラグビーメディア「Tryline」の日本語編集者です。
提供された先週末の試合データをもとに、note.com への投稿原稿を生成してください。

出力形式:
- Markdown形式（# タイトル, ## 見出し, ### 小見出し, **太字**, [text](url) リンク）
- 構成: タイトル → リード文（2〜3文） → 大会別セクション → フッター
- 各試合に Tryline のレビューリンクを「→ [試合レビュー（日本語）](URL)」形式で付ける
- タイトルに「【今週の海外ラグビーまとめ】」を必ず含める。末尾に「（YYYY.M.D–M.D）」の期間を付ける

制約:
- スコア・選手名・開催地は提供データのみ使う（推測・捏造厳禁）
- ラグビー一般知識（チームの特徴、大会説明、ライバル関係）は活用してよい
- 語尾は「でした」「です」等の丁寧体で統一
- 末尾に必ず「👉 [trylinerugby.com](https://www.trylinerugby.com)」を入れる
```

**ユーザープロンプト（動的生成）:**
```
以下の試合データをもとに、今週末のまとめ原稿を書いてください。

【期間】{YYYY年M月D日（土）〜 M月D日（日）}

【試合結果】
大会: {competition.name_ja}
{home_team.name} {home_score}–{away_score} {away_team.name}
日付: {kickoff_at を "M月D日（曜日） HH:MM JST" 形式に変換}
レビューURL: https://www.trylinerugby.com/matches/{id}

（試合ごとに空行区切り）
```

### Discord 送信

```ts
async function postToDiscord(webhookUrl: string, content: string): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Discord webhook failed: ${res.status}`);
}

function splitIntoChunks(text: string, maxLen = 1900): string[] {
  const lines = text.split('\n');
  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    const candidate = current ? current + '\n' + line : line;
    if (candidate.length > maxLen && current) {
      chunks.push(current.trim());
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// 送信
const chunks = splitIntoChunks(digest);
for (let i = 0; i < chunks.length; i++) {
  const content = i === 0 ? `📋 note 原稿（コピペ用）\n\n${chunks[i]}` : chunks[i]!;
  await postToDiscord(webhookUrl, content);
  if (i < chunks.length - 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
```

---

## 2. `lib/env.ts` への追加

`serverEnvSchema` に追加:

```ts
DISCORD_WEBHOOK_WEEKLY_DIGEST: z.string().url().optional(),
```

---

## 3. `.github/workflows/cron-weekly-digest.yml` の新規作成

既存のcronは `cron-post-to-x.yml` 等のパターンで全てGitHub ActionsからcurlでVercel APIを叩く。同じパターンで追加する。

```yaml
name: Cron — Weekly Digest

on:
  schedule:
    - cron: '0 12 * * 1'
  workflow_dispatch:

jobs:
  weekly-digest:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger weekly-digest
        run: |
          curl -f -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://www.trylinerugby.com/api/cron/weekly-digest
```

`vercel.json` は変更しない（現在空 `{}` のまま）。

---

## 完了の定義

- `pnpm tsc --noEmit` がエラーなく通る
- `pnpm build` が成功する
- `.github/workflows/cron-weekly-digest.yml` が存在する
- `lib/env.ts` に `DISCORD_WEBHOOK_WEEKLY_DIGEST` が追加されている
- `app/api/cron/weekly-digest/route.ts` が存在する

---

## 注意事項

- `DISCORD_WEBHOOK_WEEKLY_DIGEST` は **Vercel ダッシュボードの環境変数** と **`.env.local`** に設定する。コードにハードコードしない
- GitHub Secrets への登録は不要（GHAはcurlを叩くだけで、webhook URLはVercel側で使う）
- LLM 呼び出しは1回のみ（ループ内での呼び出し禁止）
- Supabase への書き込みは不要（読み取りのみ）
