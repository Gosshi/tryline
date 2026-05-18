# PR60: X（Twitter）自動投稿

## 背景

レビューコンテンツ（`match_content.status = 'published'` かつ `content_type = 'recap'`）が
生成されたタイミングで自動的に X へ投稿する。
アカウント: @tryline_rugbyjp

## スコープ

対象:
- `supabase/migrations/<timestamp>_add_x_posted_at.sql` — カラム追加
- `lib/db/types.ts` — 型を再生成（`pnpm supabase gen types` 相当）
- `lib/x/post.ts` — X API v2 投稿ロジック
- `app/api/cron/post-to-x/route.ts` — cronルート
- `vercel.json` — cronスケジュール追加
- `.env.local.example`（あれば）— 新規環境変数を追記

対象外:
- プレビューコンテンツの投稿（まず recap のみ）
- `orchestrate` ルートへの組み込み（独立 cron とする）

---

## Part A: マイグレーション

```sql
ALTER TABLE match_content
  ADD COLUMN IF NOT EXISTS x_posted_at timestamptz;
```

ファイル名: `supabase/migrations/<timestamp>_add_x_posted_at.sql`
タイムスタンプは既存の最新マイグレーションより新しい値にすること。

---

## Part B: `lib/x/post.ts`

X API v2 でツイートを投稿するユーティリティ。
パッケージは `twitter-api-v2` を使用する（`pnpm add twitter-api-v2`）。

```typescript
import { TwitterApi } from "twitter-api-v2";

export type XPostParams = {
  awayScore: number | null;
  awayTeamName: string;
  competitionLabel: string;
  homeScore: number | null;
  homeTeamName: string;
  matchId: string;
  recapExcerpt: string;
};

export async function postMatchRecapToX(params: XPostParams): Promise<string> {
  const client = new TwitterApi({
    appKey: process.env.X_API_KEY!,
    appSecret: process.env.X_API_KEY_SECRET!,
    accessToken: process.env.X_ACCESS_TOKEN!,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET!,
  });

  const score =
    params.homeScore !== null && params.awayScore !== null
      ? `${params.homeScore} - ${params.awayScore}`
      : "vs";

  const matchUrl = `https://www.trylinerugby.com/matches/${params.matchId}`;
  const excerpt = params.recapExcerpt.slice(0, 100);

  const text = [
    `🏉 ${params.competitionLabel}`,
    `${params.homeTeamName} ${score} ${params.awayTeamName}`,
    "",
    `${excerpt}…`,
    "",
    `▶️ ${matchUrl}`,
    "",
    "#ラグビー #Rugby #観戦",
  ].join("\n");

  const { data } = await client.v2.tweet(text);
  return data.id;
}
```

### 環境変数（追加）

```
X_API_KEY=
X_API_KEY_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=
```

---

## Part C: `app/api/cron/post-to-x/route.ts`

既存の cron ルートのパターンに準拠する（`assertCronAuthorized` を使う）。

```typescript
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);

    const db = getSupabaseServerClient();

    // status='published', content_type='recap', x_posted_at IS NULL のコンテンツを最大5件取得
    const { data: contents, error } = await db
      .from("match_content")
      .select(`
        id,
        match_id,
        content_md_ja,
        matches (
          home_score,
          away_score,
          home_team:teams!matches_home_team_id_fkey ( name ),
          away_team:teams!matches_away_team_id_fkey ( name ),
          competition:competitions!matches_competition_id_fkey ( name, season )
        )
      `)
      .eq("status", "published")
      .eq("content_type", "recap")
      .is("x_posted_at", null)
      .order("generated_at", { ascending: true })
      .limit(5);

    if (error) throw error;

    const results = [];

    for (const content of contents ?? []) {
      const match = content.matches as any;
      if (!match) continue;

      const competitionLabel = [match.competition?.name, match.competition?.season]
        .filter(Boolean)
        .join(" ");

      // content_md_ja の冒頭テキストを抜粋（Markdownヘッダーや記号を除去）
      const recapExcerpt = content.content_md_ja
        .replace(/^#+\s.+$/gm, "")
        .replace(/[*_`]/g, "")
        .trim()
        .slice(0, 120);

      const tweetId = await postMatchRecapToX({
        awayScore: match.away_score,
        awayTeamName: match.away_team?.name ?? "Away",
        competitionLabel,
        homeScore: match.home_score,
        homeTeamName: match.home_team?.name ?? "Home",
        matchId: content.match_id,
        recapExcerpt,
      });

      await db
        .from("match_content")
        .update({ x_posted_at: new Date().toISOString() })
        .eq("id", content.id);

      results.push({ matchId: content.match_id, tweetId });
    }

    return NextResponse.json({ status: "ok", posted: results.length, results });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    console.error("[post-to-x] failed", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
```

---

## Part D: `vercel.json` への cron 追加

```json
{
  "crons": [
    {
      "path": "/api/cron/post-to-x",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

15分ごとに実行。月1500ツイート制限に対して 15分×24h×30日 = 最大 2880リクエストだが、
未投稿コンテンツがない場合は DB クエリのみで返るのでツイート数は問題ない。

既存の cron エントリがあれば配列に追記すること。現状 `vercel.json` は空オブジェクト `{}` なので
上記内容でそのまま置き換える。

---

## 受け入れ条件

- `match_content` テーブルに `x_posted_at` カラムが追加される
- `/api/cron/post-to-x` に `Authorization: Bearer <CRON_SECRET>` ヘッダー付きで POST すると
  未投稿の recap コンテンツが X に投稿される
- 投稿済みのコンテンツは `x_posted_at` が設定され、再投稿されない
- ツイート内容に試合 URL が含まれる
- X API 認証情報が未設定の場合はエラーをログして 500 を返す
- `pnpm build` でエラーなし

## 参考ファイル

- `app/api/cron/generate-content/route.ts` — cron ルートのパターン参照
- `lib/cron/auth.ts` — `assertCronAuthorized` の使い方
- `lib/db/queries/match-content.ts` — match_content クエリパターン
- `lib/env.ts` — 環境変数の取得パターン

## 事前準備（Owner が行う）

Codex 着手前に Owner が X Developer Portal で以下を取得して Vercel 環境変数に設定すること:
- `X_API_KEY`
- `X_API_KEY_SECRET`
- `X_ACCESS_TOKEN`（@tryline_rugbyjp のアカウントトークン）
- `X_ACCESS_TOKEN_SECRET`

権限: Read and Write（ツイート投稿に必要）
