#!/usr/bin/env tsx
/**
 * 指定ユーザーの最新ツイートを取得する
 * Usage: pnpm tsx scripts/x-fetch-user-tweets.ts <username>
 */

export {};

const X_API_KEY = process.env.X_API_KEY ?? "";
const X_API_KEY_SECRET = process.env.X_API_KEY_SECRET ?? "";
const username = process.argv[2];

if (!username) {
  console.error("Usage: pnpm tsx scripts/x-fetch-user-tweets.ts <username>");
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
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function main() {
  const bearer = await getBearerToken();

  // ユーザーID取得
  const userRes = await fetch(
    `https://api.twitter.com/2/users/by/username/${username}?user.fields=public_metrics`,
    { headers: { Authorization: `Bearer ${bearer}` } },
  );
  if (!userRes.ok)
    throw new Error(
      `user lookup失敗: ${userRes.status} ${await userRes.text()}`,
    );
  const userData = (await userRes.json()) as {
    data: {
      id: string;
      name: string;
      public_metrics: { followers_count: number };
    };
  };
  const userId = userData.data.id;
  console.log(
    `@${username} (${userData.data.name}) フォロワー: ${userData.data.public_metrics.followers_count.toLocaleString()}\n`,
  );

  // ツイート取得（RT・返信除く）
  const params = new URLSearchParams({
    max_results: "10",
    "tweet.fields": "created_at,public_metrics",
    exclude: "retweets,replies",
  });
  const tweetsRes = await fetch(
    `https://api.twitter.com/2/users/${userId}/tweets?${params}`,
    { headers: { Authorization: `Bearer ${bearer}` } },
  );
  if (!tweetsRes.ok)
    throw new Error(
      `tweets取得失敗: ${tweetsRes.status} ${await tweetsRes.text()}`,
    );
  const tweetsData = (await tweetsRes.json()) as {
    data: Array<{
      id: string;
      text: string;
      created_at: string;
      public_metrics: {
        like_count: number;
        retweet_count: number;
        reply_count: number;
      };
    }>;
  };

  for (const tweet of tweetsData.data ?? []) {
    const { like_count, retweet_count, reply_count } = tweet.public_metrics;
    console.log(
      `[${tweet.created_at.slice(0, 10)}] ❤️${like_count} 🔁${retweet_count} 💬${reply_count}`,
    );
    console.log(tweet.text);
    console.log(`https://twitter.com/${username}/status/${tweet.id}`);
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
