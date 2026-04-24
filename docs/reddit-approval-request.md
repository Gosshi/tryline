# Reddit API 承認申請テンプレート

Reddit Responsible Builder Policy（2025-11）により、Tryline は Reddit Developer Support へ事前承認申請が必要です。Owner が以下の英文テンプレートを Reddit の申請フォーム（<https://support.reddithelp.com/hc/en-us/requests/new>）に貼り付けて提出してください。

正直な申告（有料プランの存在、LLM 使用、商用扱いであること）が承認確率を高めます。ポリシー違反（商用の隠蔽、AI 学習への流用）は絶対に記載しないこと。

---

## 提出先

Reddit Help → Submit a request → Developer Platform / API access

## Subject

`API access request — Tryline (Japanese rugby commentary web app)`

## Body（英文テンプレート）

```
Hello Reddit Developer Support team,

I would like to request API access for a new project under the Responsible Builder Policy.

=== Application summary ===
Name: Tryline
Website: https://tryline.app (planned; not live yet)
Company / entity: Independent developer (solo), based in Japan
Contact: gn-eleven.zero-afgr.9594@mineo.jp

=== Use case ===
Tryline is a Japanese-language web app that helps Japanese rugby fans follow
international rugby competitions (Six Nations, Premiership, URC, Top 14,
Rugby Championship, Super Rugby Pacific, Rugby World Cup). For each match,
we generate a Japanese-language preview (before kickoff) and recap (after
the final whistle) using an OpenAI LLM, based on public match statistics
and editorial signals.

Reddit's r/rugbyunion is one of the highest-signal English-language rugby
discussion communities. We would like to read the official pre-match and
post-match threads for the matches we cover, have an LLM rank the tactical
value of comments, and use the top signals as one input among several to
generate our Japanese commentary.

=== Which subreddits we will interact with ===
Read-only access to r/rugbyunion only. We will not post, comment, vote,
message, or moderate. No write access needed.

=== Data we need ===
- submission objects and their top-level comments on designated match threads
- standard public metadata (score, author username, created_utc, body)

We do not need private messages, mod logs, user history, or any
non-public data.

=== Expected request volume ===
Approximately 30 match threads per month across all competitions we cover,
read roughly twice each (once around T-48h for the preview, once around
T+2h for the recap). Peak: ~30 match weekends per year × ~6 matches per
weekend × 2 reads = ~360 fetches at peak weekend. Average: under 100
requests per day.

We will honor all rate limits and back off aggressively on 429 / 5xx.

=== How we will handle Reddit content ===
- We store raw thread JSON temporarily (7 days maximum) for debugging,
  then delete it. A scheduled cron enforces this retention.
- We never re-publish raw Reddit text. Comments are used only as input to
  an LLM that produces an original Japanese summary, which is attributed
  with a distancing phrase such as "overseas fans have discussed that ...".
- No direct quotes longer than 15 words. No multiple quotes from the same
  post. No reposting of Reddit content in our UI.
- No Reddit usernames are displayed in the final product.
- Attribution link to the Reddit thread is shown where appropriate so
  readers can visit the original discussion on Reddit.

=== AI / ML usage ===
We use OpenAI's GPT-4o and GPT-4o-mini models at inference time only to
generate Japanese summaries. We do NOT train, fine-tune, or otherwise use
Reddit content to build or improve any machine learning model. Reddit
content never leaves the inference context and is not retained beyond the
7-day raw-data retention window.

=== Commercial use ===
Tryline operates a freemium model: a free tier with basic content and a
Premium tier at ¥980/month in Japan (approximately US$6.50) that unlocks
full-length commentary, unlimited AI chat, and additional competitions.
We acknowledge this is commercial use and are requesting commercial API
access under the Responsible Builder Policy.

=== Compliance ===
- We will respect robots.txt, rate limits, and the Reddit User Agreement.
- We will stop API access immediately upon request from Reddit.
- We will attribute Reddit as the source where applicable.
- We will not resell, sublicense, or redistribute raw Reddit data.

Thank you for your consideration. Happy to answer any additional
questions.

Best regards,
Gota Nakanishi
Tryline (independent)
```

## 補足（Owner 向けメモ）

- `website` は lovable な URL があれば差し替え。未公開なら `planned; not live yet` のままで可
- 会社化していなければ `Independent developer (solo)` のままで可
- メールアドレスは承認通知を受け取れるもの
- `expected request volume` は**絶対に過少申告しない**。月 30 試合程度は控えめな実数で、後で上方修正するより最初から余裕を持たせる
- 送信後、7 日前後で返答。追加質問が来ることがあるので受信箱を監視
- 承認が下りたら `.env.local` に `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` / `SCRAPER_USER_AGENT` を投入し、`specs/p1-reddit-ingestion.md` のバナーを外す別 PR を作成（D009 を supersede）
- 却下された場合、却下理由を Owner に共有。代替ソース（公式プレス等）の仕様書起票を検討
