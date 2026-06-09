#!/usr/bin/env tsx
/**
 * X APIで日本語ラグビーツイートを検索し、replyターゲット候補を出力する
 * Usage: pnpm tsx scripts/x-find-reply-targets.ts
 */

export {};

const X_API_KEY = process.env.X_API_KEY ?? "";
const X_API_KEY_SECRET = process.env.X_API_KEY_SECRET ?? "";

if (!X_API_KEY || !X_API_KEY_SECRET) {
  console.error("X_API_KEY / X_API_KEY_SECRET が未設定です");
  process.exit(1);
}

async function getBearerToken(): Promise<string> {
  const credentials = Buffer.from(`${X_API_KEY}:${X_API_KEY_SECRET}`).toString(
    "base64",
  );
  const res = await fetch("https://api.twitter.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok)
    throw new Error(`Bearer token取得失敗: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

interface Tweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  public_metrics: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    impression_count: number;
  };
}

interface User {
  id: string;
  name: string;
  username: string;
  public_metrics: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
  };
}

async function searchTweets(
  bearer: string,
  query: string,
): Promise<{ tweets: Tweet[]; users: User[] }> {
  const params = new URLSearchParams({
    query,
    max_results: "100",
    "tweet.fields": "created_at,public_metrics,author_id",
    expansions: "author_id",
    "user.fields": "public_metrics,name,username",
  });

  const res = await fetch(
    `https://api.twitter.com/2/tweets/search/recent?${params}`,
    {
      headers: { Authorization: `Bearer ${bearer}` },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`検索失敗: ${res.status} ${body}`);
  }

  const data = (await res.json()) as {
    data?: Tweet[];
    includes?: { users?: User[] };
  };

  return {
    tweets: data.data ?? [],
    users: data.includes?.users ?? [],
  };
}

async function main() {
  console.log("Bearer token 取得中...");
  const bearer = await getBearerToken();

  const queries = [
    // 大会別
    "ラグビー URC lang:ja -is:retweet",
    "ラグビー Premiership lang:ja -is:retweet",
    "ラグビー Six Nations lang:ja -is:retweet",
    "ラグビー Super Rugby lang:ja -is:retweet",
    "ラグビー Top14 lang:ja -is:retweet",
    "ラグビーチャンピオンシップ lang:ja -is:retweet",
    // 略称・日本語大会名
    "プレミアシップ ラグビー lang:ja -is:retweet",
    "シックスネイションズ lang:ja -is:retweet",
    "スーパーラグビー lang:ja -is:retweet",
    // 総称
    "海外ラグビー lang:ja -is:retweet",
  ];

  const userMap = new Map<string, User>();
  const tweetsByUser = new Map<string, Tweet[]>();

  for (const query of queries) {
    console.log(`\n検索中: ${query}`);
    try {
      const { tweets, users } = await searchTweets(bearer, query);
      console.log(`  ${tweets.length}件取得`);

      for (const user of users) {
        userMap.set(user.id, user);
      }

      for (const tweet of tweets) {
        const existing = tweetsByUser.get(tweet.author_id) ?? [];
        existing.push(tweet);
        tweetsByUser.set(tweet.author_id, existing);
      }

      // レート制限対策
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error(`  エラー: ${e}`);
    }
  }

  // フォロワー200〜50000人のアクティブアカウントに絞る
  const candidates = [...tweetsByUser.entries()]
    .map(([authorId, tweets]) => {
      const user = userMap.get(authorId);
      if (!user) return null;
      const { followers_count } = user.public_metrics;
      if (followers_count < 200 || followers_count > 50000) return null;

      const totalEngagement = tweets.reduce(
        (s, t) =>
          s +
          t.public_metrics.like_count +
          t.public_metrics.retweet_count +
          t.public_metrics.reply_count,
        0,
      );

      return {
        username: user.username,
        name: user.name,
        followers: followers_count,
        tweetCount: tweets.length,
        totalEngagement,
        sampleTweet: tweets
          .sort(
            (a, b) => b.public_metrics.like_count - a.public_metrics.like_count,
          )[0]
          ?.text.slice(0, 80),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.totalEngagement - a!.totalEngagement);

  console.log("\n=== reply ターゲット候補（エンゲージメント順）===\n");
  for (const c of candidates.slice(0, 20)) {
    if (!c) continue;
    console.log(`@${c.username} (${c.name})`);
    console.log(
      `  フォロワー: ${c.followers.toLocaleString()} / 該当ツイート: ${c.tweetCount}件 / エンゲージメント: ${c.totalEngagement}`,
    );
    console.log(`  例: ${c.sampleTweet}`);
    console.log();
  }

  console.log(`合計候補数: ${candidates.length}件`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
