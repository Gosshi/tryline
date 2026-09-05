# Tryline 全方位監査依頼（GPT-6）

**対象サイト: https://www.trylinerugby.com/**
**対象リポジトリ: https://github.com/Gosshi/tryline （public）**

作成日: 2026-09-05 / 作成: Claude Code（実測データ取得済み）
依頼者: Tryline Owner（個人開発、実装は Codex に委譲、設計・判断は Owner）

---

## 0. あなたへの依頼

Tryline というプロダクトの **全方位監査** を行い、改善提案を出してほしい。
監査領域は A〜E の5つ。**すべての領域・すべてのサブ項目について所見を出すこと。省略は禁止**。
問題が無いと判断した項目も「問題なし + そう判断した根拠」を必ず書くこと。「主要なものだけ」「代表例として」といった要約的な逃げは禁止。

このドキュメントには Claude Code が 2026-09-05 に実測したデータが入っている。**その数値を出発点にすること**。ただし、あなた自身が一次情報（公開リポジトリ・本番サイト）を読んで検算・追加調査することを強く推奨する。

---

## 1. プロダクト概要

**Tryline** — 海外ラグビーを日本語で追う Web メディア/アプリ。

- **対象ユーザー**: 日本語で海外ラグビー（Six Nations / Premiership / URC / Top 14 / Super Rugby Pacific / Nations Championship / RWC / リーグワン 等）を追いたいファン全般。DAZN/J SPORTS/WOWOW 加入者に限定しない。
- **提供価値**: 試合データを集約し、LLM で日本語のプレビュー（試合前）・レビュー（試合後）を生成、試合ごとの AI チャット。
- **収益**: フリーミアム。Premium ¥980/月（Stripe / iOS は RevenueCat 経由 IAP）。**現時点で有料購読者は実質ゼロ**。
- **North Star**: RWC 2027（2027年10〜11月、オーストラリア開催）までの有料購読者数。
- **体制**: Owner 1人（判断・プロンプト作成）+ Claude Code（設計・仕様書・レビュー）+ Codex（実装）。**Claude Code は実装コードを書かない運用**。

### 技術スタック
- Next.js 15.5 (App Router, RSC) / React 19 / TypeScript strict
- Supabase (Postgres + Auth + RLS)
- OpenAI API（モデル ID は `lib/llm/models.ts` に集中管理。現在: CHAT=`gpt-4o-mini`, FAST=`gpt-5.6-luna`, NARRATIVE=`gpt-5.6-terra`, WEB_SEARCH=`gpt-5.6-terra`）
- Stripe / Vercel（ホスティング）/ GitHub Actions（cron の大半）
- Tailwind CSS + shadcn/ui
- iOS アプリ: 別リポジトリ `tryline-mobile`（Expo / React Native、**private のため本監査では対象外**）

---

## 2. 参照すべき一次情報

### 2.1 公開リポジトリ（全ファイル読める）
**https://github.com/Gosshi/tryline** （public / default branch: `main`）

重要ディレクトリ:
| パス | 内容 |
|---|---|
| `app/` | Next.js ルート（ページ 30本 + API 58本） |
| `components/` | React コンポーネント 64ファイル |
| `lib/llm/` | LLM パイプライン（プロンプト・ステージ・sourced facts）計 6,912行 |
| `lib/scrapers/` | ソース別クローラ |
| `lib/db/` | Supabase クエリ |
| `specs/` | Codex 向け仕様書（**約400本**。権威ある文書） |
| `docs/decisions.md` | 意思決定記録 D001〜D025（728行）。**提案前に必ず読むこと** |
| `docs/design/` | デザイン監査レポート・モックHTML 17本 |
| `design.md` | デザインシステム定義（185行、2026-08-25/08-31 に実装へ合わせて書き直し済み） |
| `.claude/skills/` | **監査対象B: プロジェクト固有スキル 26本** |
| `.claude/agents/` | サブエージェント定義 3本 |
| `.github/workflows/` | cron 19本 |

### 2.1.1 リポジトリに反映されていないローカル作業（**GitHub からは見えない。以下を前提として扱うこと**）

`main` にはまだ入っていないが、既に存在し方針として確定しているものがある。GitHub 上の `docs/decisions.md` は **D025 までしか無い**。

**未追跡ファイル**
| パス | 内容 |
|---|---|
| `docs/chatgpt-prompts/README.md` + `thu-preview-facts.md` / `fri-preview-facts.md` / `mon-recap-facts.md` | ChatGPT による試合事実の調査運用（週3回）。D027 の置き換え先 |
| `specs/fix-retire-news-link-pipeline.md` | ニュースリンク収集の完全停止（D027 の実装仕様） |
| `specs/feat-tuesday-recap-refresh.md` | 火曜のレビュー再生成（手動投入した事実のある試合だけを対象） |
| `specs/fix-refresh-workflow-scale-and-failure-visibility.md` | リフレッシュ処理のスケールと失敗可視化 |
| `app/api/cron/matches-with-recent-manual-facts/route.ts`（112行）+ `tests/api/matches-with-recent-manual-facts.test.ts`（224行） | 火曜再生成の対象抽出 API（実装済み・未コミット） |

**D026 — 出典 URL の存在確認は robots.txt を参照しない**（2026-09-04、Owner 承認済み。CLAUDE.md のクロール規定に対する限定的な例外）
- Discord の `/research-fact-entry` で、保存前に出典 URL へリクエストを投げ 200 でなければ拒否する。これが機能の中核
- 根拠は記録に残る失敗2回（2026-07-27 の「今週のニュース」draft 2件が捏造・URL 404、2026-07-29 の RUGBY DESK 見送り）。**どちらも失敗の形が「出典 URL が 404」だった**
- `fetchWithPolicy`（robots 強制）を使うと、robots で AI ボットを拒否する媒体の URL が検証段階で弾かれ入力できない。実測で `rnz.co.nz` `stuff.co.nz` は ChatGPT 系を `Disallow: /`、**`nzherald.co.nz` は拒否していない**
- 決定: 素の fetch で存在確認のみ。**レスポンスボディを1バイトも読まない**。HEAD → 405等なら GET フォールバック。リダイレクトは追い最終 200 で合格。`source_url` には入力値を保存
- **例外の範囲は `app/api/discord/interactions/route.ts` の出典 URL 検証に限る。** `lib/scrapers/` と `fetchSourcedFactsForMatch` は従来どおり robots.txt と allowlist を厳格適用
- **潰せるのは「存在しない URL」という最も粗い失敗だけ。** 200 でもその記事がその事実を書いている保証は無く、数字・選手名・負傷の詳細は Owner の目視に依存する
- 併せて整理し直した点: **allowlist は「Tryline が自動取得してよいか」の基準であって「Owner が調べた事実を入れてよいか」の基準ではない。** 両者を混同していた

**D027 — ニュースリンク収集と Discord 通知を停止する**（2026-09-04、Owner 承認済み。2026-08-26 の設計を置き換える）
- Discord 通知が **1日13〜25件**に達し Owner が読み切れなくなった
- 決定打: **収集ソース3つがすべてニュージーランドの媒体だった**（`rnz.co.nz` / `nzherald.co.nz` / `stuff.co.nz`）。**欧州の媒体がゼロ**。9/25 開幕の **URC 144試合・プレミアシップ90試合**、進行中の **Top 14** を1件も拾えない。**商品の中心である大会をこの仕組みはカバーしていなかった**
- 加えてリンク1件ごとに `translateNewsTitle`（`MODELS.FAST`）で見出しを翻訳しており、1日4回の LLM コストが常時発生
- `news_links` はサイトに一切出ていない（RNZ の RSS が再配信禁止のため意図的）
- 決定: cron・収集コード・RSS ユーティリティ・テストを削除。コンテキストメニュー経由の事実入力も引退。**スラッシュコマンド経由の入力は残す**。`news_links` テーブルは削除しない。`DISCORD_WEBHOOK_OPS` は消さない（`lib/llm/notify.ts` が生成失敗通知に使用）
- 前提条件: `feat-discord-research-fact-entry` がマージされ本番で1件以上成功していること（**先に停止すると事実を入れる経路が一時的にゼロになる**）
- トレードオフ: **NZ のテストマッチ週に自動シグナルが無くなる。** ChatGPT 経路は週3回なので、その間に出た情報は次回まで拾われない
- 教訓: **取れるソースから設計を始めると、必要なカバレッジと噛み合わない。** 稼働9日で役目を終えた

**ChatGPT 調査運用（D027 の置き換え先、`docs/chatgpt-prompts/`）**
| 実行 | 対象 | 入力の締切 | 締切の根拠 |
|---|---|---|---|
| 木 18:00 | 木・金・土キックオフ | **木 21:05** | `cron-weekend-preview-refresh`（`5 12 * * 4`） |
| 金 18:00 | 日・月未明キックオフ＋土の更新分 | **金 21:05** | `cron-weekend-preview-refresh`（`5 12 * * 5`） |
| 月 20:00 | 週末に終わった試合 | **火 09:05** | `cron-post-match-recap-refresh` の火曜の回（未実装） |

- 締切がある理由: `lib/cron/orchestrate.ts` の `live-pipeline` は **既存コンテンツがある試合を除外する**（`EXISTING_CONTENT_STATUSES = ["draft","published"]`）。プレビュー窓はキックオフの48〜12時間前で、**一度生成されたら作り直さない**。作り直す経路は上の3本のリフレッシュだけ
- 手動投入した事実は消えない: `entry_method = "manual"` の行は削除対象から除外され（`lib/llm/sourced-facts/fetch.ts:109`）、**allowlist 外ドメインでも読み取り時に例外扱いされる**（同 `:400`）
- 量の目安: **1回あたり10〜12ブロック（Discord への送信10〜12回）、週3回で30〜36回**
- **9/25 に URC 144試合とプレミアシップ90試合が開幕すると対象試合が週20〜30増える。運用として「全部は回りません」と明記されている**

### 2.2 本番サイト（すべての URL）
**サイト: https://www.trylinerugby.com/**
（`trylinerugby.com` は `www.trylinerugby.com` へ正規化される。sitemap の `<loc>` はすべて `www` 付き）
sitemap.xml に載る URL は **1,664 件**。内訳は `/matches/` 1,096 / `/c/` 274 / `/h2h/` 200 / `/teams/` 91 / 静的3。**以下はサイトマップからの完全な列挙**（`/matches/` のみ UUID のため代表例＋列挙方法を示す）。
#### 2.2.1 静的ページ・sitemap 収録
| URL |
|---|
| https://www.trylinerugby.com/ |
| https://www.trylinerugby.com/calendar |
| https://www.trylinerugby.com/pricing |

#### 2.2.2 sitemap には無いが必ず確認すべきページ
| URL | 備考 |
|---|---|
| https://www.trylinerugby.com/en | 英語版トップ |
| https://www.trylinerugby.com/support | サポート・問い合わせ |
| https://www.trylinerugby.com/legal/privacy | プライバシーポリシー（PV 7 / 28日） |
| https://www.trylinerugby.com/legal/terms | 利用規約（PV 7・直帰率 57%） |
| https://www.trylinerugby.com/legal/tokusho | 特定商取引法に基づく表記 |
| https://www.trylinerugby.com/newsletter/confirmed | ニュースレター確認完了（PV 5） |
| https://www.trylinerugby.com/newsletter/expired | 確認リンク期限切れ |
| https://www.trylinerugby.com/newsletter/invalid-link | 不正な確認リンク |
| https://www.trylinerugby.com/newsletter/unsubscribed | 配信停止完了 |
| https://www.trylinerugby.com/auth/login | ログイン（PV 3） |
| https://www.trylinerugby.com/c/rwc/2027/bracket | RWC2027 トーナメント表 |
| https://www.trylinerugby.com/c/lipovitan-challenge-cup-2026 | 専用ルート（`/c/lipovitan-challenge-cup/2026` とは別実装） |
| https://www.trylinerugby.com/rss.xml | RSS（直近30本のレビュー） |
| https://www.trylinerugby.com/sitemap.xml | サイトマップ |
| https://www.trylinerugby.com/robots.txt | `User-Agent: * / Allow: /` + sitemap のみ |
| https://www.trylinerugby.com/存在しないパス | 404 ページの確認用 |

#### 2.2.3 大会ハブ `/c/*` — 全 274 URL
**Bing 流入の 86% が着地する面。事業上の最重要面であり、A-4 の監査対象。**

**`autumn-nations` — オータムネーションズシリーズ（6 URL）**

- https://www.trylinerugby.com/c/autumn-nations
- https://www.trylinerugby.com/c/autumn-nations/2021
- https://www.trylinerugby.com/c/autumn-nations/2022
- https://www.trylinerugby.com/c/autumn-nations/2024
- https://www.trylinerugby.com/c/autumn-nations/2025
- https://www.trylinerugby.com/c/autumn-nations/2026

**`greatest-rivalry` — グレイテスト・ライバルリー・ツアー（2 URL）**

- https://www.trylinerugby.com/c/greatest-rivalry
- https://www.trylinerugby.com/c/greatest-rivalry/2026

**`league-one` — ジャパンラグビー リーグワン（39 URL）**

- https://www.trylinerugby.com/c/league-one
- https://www.trylinerugby.com/c/league-one/2024-25
- https://www.trylinerugby.com/c/league-one/2024-25/round/1
- https://www.trylinerugby.com/c/league-one/2024-25/round/2
- https://www.trylinerugby.com/c/league-one/2024-25/round/3
- https://www.trylinerugby.com/c/league-one/2024-25/round/4
- https://www.trylinerugby.com/c/league-one/2024-25/round/5
- https://www.trylinerugby.com/c/league-one/2024-25/round/6
- https://www.trylinerugby.com/c/league-one/2024-25/round/7
- https://www.trylinerugby.com/c/league-one/2024-25/round/8
- https://www.trylinerugby.com/c/league-one/2024-25/round/9
- https://www.trylinerugby.com/c/league-one/2024-25/round/10
- https://www.trylinerugby.com/c/league-one/2024-25/round/11
- https://www.trylinerugby.com/c/league-one/2024-25/round/12
- https://www.trylinerugby.com/c/league-one/2024-25/round/13
- https://www.trylinerugby.com/c/league-one/2024-25/round/14
- https://www.trylinerugby.com/c/league-one/2024-25/round/15
- https://www.trylinerugby.com/c/league-one/2024-25/round/16
- https://www.trylinerugby.com/c/league-one/2024-25/round/17
- https://www.trylinerugby.com/c/league-one/2024-25/round/18
- https://www.trylinerugby.com/c/league-one/2025-26
- https://www.trylinerugby.com/c/league-one/2025-26/round/1
- https://www.trylinerugby.com/c/league-one/2025-26/round/2
- https://www.trylinerugby.com/c/league-one/2025-26/round/3
- https://www.trylinerugby.com/c/league-one/2025-26/round/4
- https://www.trylinerugby.com/c/league-one/2025-26/round/5
- https://www.trylinerugby.com/c/league-one/2025-26/round/6
- https://www.trylinerugby.com/c/league-one/2025-26/round/7
- https://www.trylinerugby.com/c/league-one/2025-26/round/8
- https://www.trylinerugby.com/c/league-one/2025-26/round/9
- https://www.trylinerugby.com/c/league-one/2025-26/round/10
- https://www.trylinerugby.com/c/league-one/2025-26/round/11
- https://www.trylinerugby.com/c/league-one/2025-26/round/12
- https://www.trylinerugby.com/c/league-one/2025-26/round/13
- https://www.trylinerugby.com/c/league-one/2025-26/round/14
- https://www.trylinerugby.com/c/league-one/2025-26/round/15
- https://www.trylinerugby.com/c/league-one/2025-26/round/16
- https://www.trylinerugby.com/c/league-one/2025-26/round/17
- https://www.trylinerugby.com/c/league-one/2025-26/round/18

**`lipovitan-challenge-cup` — リポビタンDチャレンジカップ（2 URL）**

- https://www.trylinerugby.com/c/lipovitan-challenge-cup
- https://www.trylinerugby.com/c/lipovitan-challenge-cup/2026

**`nations-championship` — ネーションズチャンピオンシップ（3 URL）**

- https://www.trylinerugby.com/c/nations-championship
- https://www.trylinerugby.com/c/nations-championship/2026
- https://www.trylinerugby.com/c/nations-championship/2026/standings

**`pnc` — パシフィック・ネーションズカップ（27 URL）**

- https://www.trylinerugby.com/c/pnc
- https://www.trylinerugby.com/c/pnc/2022
- https://www.trylinerugby.com/c/pnc/2024
- https://www.trylinerugby.com/c/pnc/2024/round/1
- https://www.trylinerugby.com/c/pnc/2024/round/2
- https://www.trylinerugby.com/c/pnc/2024/round/3
- https://www.trylinerugby.com/c/pnc/2024/round/4
- https://www.trylinerugby.com/c/pnc/2024/round/5
- https://www.trylinerugby.com/c/pnc/2024/round/6
- https://www.trylinerugby.com/c/pnc/2024/round/7
- https://www.trylinerugby.com/c/pnc/2024/round/8
- https://www.trylinerugby.com/c/pnc/2024/round/9
- https://www.trylinerugby.com/c/pnc/2024/round/10
- https://www.trylinerugby.com/c/pnc/2024/round/11
- https://www.trylinerugby.com/c/pnc/2025
- https://www.trylinerugby.com/c/pnc/2025/round/1
- https://www.trylinerugby.com/c/pnc/2025/round/2
- https://www.trylinerugby.com/c/pnc/2025/round/3
- https://www.trylinerugby.com/c/pnc/2025/round/4
- https://www.trylinerugby.com/c/pnc/2025/round/5
- https://www.trylinerugby.com/c/pnc/2025/round/6
- https://www.trylinerugby.com/c/pnc/2025/round/7
- https://www.trylinerugby.com/c/pnc/2025/round/8
- https://www.trylinerugby.com/c/pnc/2025/round/9
- https://www.trylinerugby.com/c/pnc/2025/round/10
- https://www.trylinerugby.com/c/pnc/2025/round/11
- https://www.trylinerugby.com/c/pnc/2026

**`premiership` — プレミアシップ（42 URL）**

- https://www.trylinerugby.com/c/premiership
- https://www.trylinerugby.com/c/premiership/2024-25
- https://www.trylinerugby.com/c/premiership/2024-25/round/1
- https://www.trylinerugby.com/c/premiership/2024-25/round/2
- https://www.trylinerugby.com/c/premiership/2024-25/round/3
- https://www.trylinerugby.com/c/premiership/2024-25/round/4
- https://www.trylinerugby.com/c/premiership/2024-25/round/5
- https://www.trylinerugby.com/c/premiership/2024-25/round/6
- https://www.trylinerugby.com/c/premiership/2024-25/round/7
- https://www.trylinerugby.com/c/premiership/2024-25/round/8
- https://www.trylinerugby.com/c/premiership/2024-25/round/9
- https://www.trylinerugby.com/c/premiership/2024-25/round/10
- https://www.trylinerugby.com/c/premiership/2024-25/round/11
- https://www.trylinerugby.com/c/premiership/2024-25/round/12
- https://www.trylinerugby.com/c/premiership/2024-25/round/13
- https://www.trylinerugby.com/c/premiership/2024-25/round/14
- https://www.trylinerugby.com/c/premiership/2024-25/round/15
- https://www.trylinerugby.com/c/premiership/2024-25/round/16
- https://www.trylinerugby.com/c/premiership/2024-25/round/17
- https://www.trylinerugby.com/c/premiership/2024-25/round/18
- https://www.trylinerugby.com/c/premiership/2025-26
- https://www.trylinerugby.com/c/premiership/2025-26/round/1
- https://www.trylinerugby.com/c/premiership/2025-26/round/2
- https://www.trylinerugby.com/c/premiership/2025-26/round/3
- https://www.trylinerugby.com/c/premiership/2025-26/round/4
- https://www.trylinerugby.com/c/premiership/2025-26/round/5
- https://www.trylinerugby.com/c/premiership/2025-26/round/6
- https://www.trylinerugby.com/c/premiership/2025-26/round/7
- https://www.trylinerugby.com/c/premiership/2025-26/round/8
- https://www.trylinerugby.com/c/premiership/2025-26/round/9
- https://www.trylinerugby.com/c/premiership/2025-26/round/10
- https://www.trylinerugby.com/c/premiership/2025-26/round/11
- https://www.trylinerugby.com/c/premiership/2025-26/round/12
- https://www.trylinerugby.com/c/premiership/2025-26/round/13
- https://www.trylinerugby.com/c/premiership/2025-26/round/14
- https://www.trylinerugby.com/c/premiership/2025-26/round/15
- https://www.trylinerugby.com/c/premiership/2025-26/round/16
- https://www.trylinerugby.com/c/premiership/2025-26/round/17
- https://www.trylinerugby.com/c/premiership/2025-26/round/18
- https://www.trylinerugby.com/c/premiership/2025-26/standings
- https://www.trylinerugby.com/c/premiership/2026-27
- https://www.trylinerugby.com/c/premiership/2026-27/standings

**`puma-trophy` — プーマ・トロフィー（2 URL）**

- https://www.trylinerugby.com/c/puma-trophy
- https://www.trylinerugby.com/c/puma-trophy/2026

**`rugby-championship` — ザ・ラグビーチャンピオンシップ（9 URL）**

- https://www.trylinerugby.com/c/rugby-championship
- https://www.trylinerugby.com/c/rugby-championship/2025
- https://www.trylinerugby.com/c/rugby-championship/2025/round/1
- https://www.trylinerugby.com/c/rugby-championship/2025/round/2
- https://www.trylinerugby.com/c/rugby-championship/2025/round/3
- https://www.trylinerugby.com/c/rugby-championship/2025/round/4
- https://www.trylinerugby.com/c/rugby-championship/2025/round/5
- https://www.trylinerugby.com/c/rugby-championship/2025/round/6
- https://www.trylinerugby.com/c/rugby-championship/2026

**`rwc` — ラグビーワールドカップ（14 URL）**

- https://www.trylinerugby.com/c/rwc
- https://www.trylinerugby.com/c/rwc/2023
- https://www.trylinerugby.com/c/rwc/2023/round/1
- https://www.trylinerugby.com/c/rwc/2023/round/2
- https://www.trylinerugby.com/c/rwc/2023/round/3
- https://www.trylinerugby.com/c/rwc/2023/round/4
- https://www.trylinerugby.com/c/rwc/2023/round/5
- https://www.trylinerugby.com/c/rwc/2023/round/6
- https://www.trylinerugby.com/c/rwc/2023/round/7
- https://www.trylinerugby.com/c/rwc/2023/round/8
- https://www.trylinerugby.com/c/rwc/2023/standings
- https://www.trylinerugby.com/c/rwc/2027
- https://www.trylinerugby.com/c/rwc/2027/bracket
- https://www.trylinerugby.com/c/rwc/2027/standings

**`six-nations` — シックスネイションズ（51 URL）**

- https://www.trylinerugby.com/c/six-nations
- https://www.trylinerugby.com/c/six-nations/2020
- https://www.trylinerugby.com/c/six-nations/2020/round/1
- https://www.trylinerugby.com/c/six-nations/2020/round/2
- https://www.trylinerugby.com/c/six-nations/2020/round/3
- https://www.trylinerugby.com/c/six-nations/2020/round/4
- https://www.trylinerugby.com/c/six-nations/2020/round/5
- https://www.trylinerugby.com/c/six-nations/2020/standings
- https://www.trylinerugby.com/c/six-nations/2021
- https://www.trylinerugby.com/c/six-nations/2021/round/1
- https://www.trylinerugby.com/c/six-nations/2021/round/2
- https://www.trylinerugby.com/c/six-nations/2021/round/3
- https://www.trylinerugby.com/c/six-nations/2021/round/4
- https://www.trylinerugby.com/c/six-nations/2021/round/5
- https://www.trylinerugby.com/c/six-nations/2021/standings
- https://www.trylinerugby.com/c/six-nations/2022
- https://www.trylinerugby.com/c/six-nations/2022/round/1
- https://www.trylinerugby.com/c/six-nations/2022/round/2
- https://www.trylinerugby.com/c/six-nations/2022/round/3
- https://www.trylinerugby.com/c/six-nations/2022/round/4
- https://www.trylinerugby.com/c/six-nations/2022/round/5
- https://www.trylinerugby.com/c/six-nations/2022/standings
- https://www.trylinerugby.com/c/six-nations/2023
- https://www.trylinerugby.com/c/six-nations/2023/round/1
- https://www.trylinerugby.com/c/six-nations/2023/round/2
- https://www.trylinerugby.com/c/six-nations/2023/round/3
- https://www.trylinerugby.com/c/six-nations/2023/round/4
- https://www.trylinerugby.com/c/six-nations/2023/round/5
- https://www.trylinerugby.com/c/six-nations/2023/standings
- https://www.trylinerugby.com/c/six-nations/2024
- https://www.trylinerugby.com/c/six-nations/2024/round/1
- https://www.trylinerugby.com/c/six-nations/2024/round/2
- https://www.trylinerugby.com/c/six-nations/2024/round/3
- https://www.trylinerugby.com/c/six-nations/2024/round/4
- https://www.trylinerugby.com/c/six-nations/2024/round/5
- https://www.trylinerugby.com/c/six-nations/2024/standings
- https://www.trylinerugby.com/c/six-nations/2025
- https://www.trylinerugby.com/c/six-nations/2025/round/1
- https://www.trylinerugby.com/c/six-nations/2025/round/2
- https://www.trylinerugby.com/c/six-nations/2025/round/3
- https://www.trylinerugby.com/c/six-nations/2025/round/4
- https://www.trylinerugby.com/c/six-nations/2025/round/5
- https://www.trylinerugby.com/c/six-nations/2025/standings
- https://www.trylinerugby.com/c/six-nations/2026
- https://www.trylinerugby.com/c/six-nations/2026/round/1
- https://www.trylinerugby.com/c/six-nations/2026/round/2
- https://www.trylinerugby.com/c/six-nations/2026/round/3
- https://www.trylinerugby.com/c/six-nations/2026/round/4
- https://www.trylinerugby.com/c/six-nations/2026/round/5
- https://www.trylinerugby.com/c/six-nations/2027
- https://www.trylinerugby.com/c/six-nations/2027/standings

**`super-rugby-pacific` — スーパーラグビー・パシフィック（40 URL）**

- https://www.trylinerugby.com/c/super-rugby-pacific
- https://www.trylinerugby.com/c/super-rugby-pacific/2025
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/1
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/2
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/3
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/4
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/5
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/6
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/7
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/8
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/9
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/10
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/11
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/12
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/13
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/14
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/15
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/16
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/17
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/18
- https://www.trylinerugby.com/c/super-rugby-pacific/2025/round/19
- https://www.trylinerugby.com/c/super-rugby-pacific/2026
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/round/1
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/round/2
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/round/3
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/round/4
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/round/5
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/round/6
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/round/7
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/round/8
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/round/9
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/round/10
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/round/11
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/round/12
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/round/13
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/round/14
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/round/15
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/round/16
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/round/17
- https://www.trylinerugby.com/c/super-rugby-pacific/2026/standings

**`top-14` — トップ14（9 URL）**

- https://www.trylinerugby.com/c/top-14
- https://www.trylinerugby.com/c/top-14/2024-25
- https://www.trylinerugby.com/c/top-14/2024-25/round/0
- https://www.trylinerugby.com/c/top-14/2024-25/round/1
- https://www.trylinerugby.com/c/top-14/2024-25/round/2
- https://www.trylinerugby.com/c/top-14/2024-25/round/3
- https://www.trylinerugby.com/c/top-14/2025-26
- https://www.trylinerugby.com/c/top-14/2025-26/standings
- https://www.trylinerugby.com/c/top-14/2026-27

**`urc` — ユナイテッド・ラグビー・チャンピオンシップ（28 URL）**

- https://www.trylinerugby.com/c/urc
- https://www.trylinerugby.com/c/urc/2024-25
- https://www.trylinerugby.com/c/urc/2024-25/round/1
- https://www.trylinerugby.com/c/urc/2024-25/round/2
- https://www.trylinerugby.com/c/urc/2024-25/round/3
- https://www.trylinerugby.com/c/urc/2025-26
- https://www.trylinerugby.com/c/urc/2025-26/round/1
- https://www.trylinerugby.com/c/urc/2025-26/round/2
- https://www.trylinerugby.com/c/urc/2025-26/round/3
- https://www.trylinerugby.com/c/urc/2025-26/round/4
- https://www.trylinerugby.com/c/urc/2025-26/round/5
- https://www.trylinerugby.com/c/urc/2025-26/round/6
- https://www.trylinerugby.com/c/urc/2025-26/round/7
- https://www.trylinerugby.com/c/urc/2025-26/round/8
- https://www.trylinerugby.com/c/urc/2025-26/round/9
- https://www.trylinerugby.com/c/urc/2025-26/round/10
- https://www.trylinerugby.com/c/urc/2025-26/round/11
- https://www.trylinerugby.com/c/urc/2025-26/round/12
- https://www.trylinerugby.com/c/urc/2025-26/round/13
- https://www.trylinerugby.com/c/urc/2025-26/round/14
- https://www.trylinerugby.com/c/urc/2025-26/round/15
- https://www.trylinerugby.com/c/urc/2025-26/round/16
- https://www.trylinerugby.com/c/urc/2025-26/round/17
- https://www.trylinerugby.com/c/urc/2025-26/round/18
- https://www.trylinerugby.com/c/urc/2025-26/round/100
- https://www.trylinerugby.com/c/urc/2025-26/standings
- https://www.trylinerugby.com/c/urc/2026-27
- https://www.trylinerugby.com/c/urc/2026-27/standings

#### 2.2.4 チームページ `/teams/*` — 全 91 URL
**注: `/t/[team]` という別の URL 体系も併存している**（例: https://www.trylinerugby.com/t/japan ）。両方を確認し、重複の是非を判定すること。sitemap に載るのは `/teams/` のみ。

- https://www.trylinerugby.com/teams/argentina
- https://www.trylinerugby.com/teams/australia
- https://www.trylinerugby.com/teams/bath
- https://www.trylinerugby.com/teams/bayonne
- https://www.trylinerugby.com/teams/benetton
- https://www.trylinerugby.com/teams/blues
- https://www.trylinerugby.com/teams/bordeaux-begles
- https://www.trylinerugby.com/teams/bristol-bears
- https://www.trylinerugby.com/teams/brumbies
- https://www.trylinerugby.com/teams/bulls
- https://www.trylinerugby.com/teams/canada
- https://www.trylinerugby.com/teams/canon-eagles
- https://www.trylinerugby.com/teams/cardiff
- https://www.trylinerugby.com/teams/castres
- https://www.trylinerugby.com/teams/chiefs
- https://www.trylinerugby.com/teams/chile
- https://www.trylinerugby.com/teams/clermont
- https://www.trylinerugby.com/teams/connacht
- https://www.trylinerugby.com/teams/crusaders
- https://www.trylinerugby.com/teams/dragons
- https://www.trylinerugby.com/teams/edinburgh
- https://www.trylinerugby.com/teams/england
- https://www.trylinerugby.com/teams/exeter-chiefs
- https://www.trylinerugby.com/teams/fiji
- https://www.trylinerugby.com/teams/fijian-drua
- https://www.trylinerugby.com/teams/force
- https://www.trylinerugby.com/teams/france
- https://www.trylinerugby.com/teams/georgia
- https://www.trylinerugby.com/teams/glasgow-warriors
- https://www.trylinerugby.com/teams/gloucester
- https://www.trylinerugby.com/teams/grenoble
- https://www.trylinerugby.com/teams/harlequins
- https://www.trylinerugby.com/teams/highlanders
- https://www.trylinerugby.com/teams/honda-heat
- https://www.trylinerugby.com/teams/hong-kong-china
- https://www.trylinerugby.com/teams/hurricanes
- https://www.trylinerugby.com/teams/ireland
- https://www.trylinerugby.com/teams/italy
- https://www.trylinerugby.com/teams/japan
- https://www.trylinerugby.com/teams/kobelco-kobe-steelers
- https://www.trylinerugby.com/teams/kubota-spears
- https://www.trylinerugby.com/teams/la-rochelle
- https://www.trylinerugby.com/teams/leicester-tigers
- https://www.trylinerugby.com/teams/leinster
- https://www.trylinerugby.com/teams/lions
- https://www.trylinerugby.com/teams/lyon
- https://www.trylinerugby.com/teams/mitsubishi-dynaboars
- https://www.trylinerugby.com/teams/moana-pasifika
- https://www.trylinerugby.com/teams/montpellier
- https://www.trylinerugby.com/teams/munster
- https://www.trylinerugby.com/teams/namibia
- https://www.trylinerugby.com/teams/new-zealand
- https://www.trylinerugby.com/teams/newcastle-falcons
- https://www.trylinerugby.com/teams/northampton-saints
- https://www.trylinerugby.com/teams/ospreys
- https://www.trylinerugby.com/teams/pau
- https://www.trylinerugby.com/teams/perpignan
- https://www.trylinerugby.com/teams/portugal
- https://www.trylinerugby.com/teams/racing-92
- https://www.trylinerugby.com/teams/rebels
- https://www.trylinerugby.com/teams/reds
- https://www.trylinerugby.com/teams/ricoh-black-rams
- https://www.trylinerugby.com/teams/romania
- https://www.trylinerugby.com/teams/saitama-wild-knights
- https://www.trylinerugby.com/teams/sale-sharks
- https://www.trylinerugby.com/teams/samoa
- https://www.trylinerugby.com/teams/saracens
- https://www.trylinerugby.com/teams/scarlets
- https://www.trylinerugby.com/teams/scotland
- https://www.trylinerugby.com/teams/sharks
- https://www.trylinerugby.com/teams/shizuoka-blue-revs
- https://www.trylinerugby.com/teams/south-africa
- https://www.trylinerugby.com/teams/spain
- https://www.trylinerugby.com/teams/stade-francais
- https://www.trylinerugby.com/teams/stormers
- https://www.trylinerugby.com/teams/tokyo-suntory-sungoliath
- https://www.trylinerugby.com/teams/tonga
- https://www.trylinerugby.com/teams/toshiba-brave-lupus
- https://www.trylinerugby.com/teams/toulon
- https://www.trylinerugby.com/teams/toulouse
- https://www.trylinerugby.com/teams/toyota-verblitz
- https://www.trylinerugby.com/teams/ulster
- https://www.trylinerugby.com/teams/urayasu-d-rocks
- https://www.trylinerugby.com/teams/uruguay
- https://www.trylinerugby.com/teams/us-montauban
- https://www.trylinerugby.com/teams/usa
- https://www.trylinerugby.com/teams/vannes
- https://www.trylinerugby.com/teams/wales
- https://www.trylinerugby.com/teams/waratahs
- https://www.trylinerugby.com/teams/zebre
- https://www.trylinerugby.com/teams/zimbabwe

#### 2.2.5 H2H ページ `/h2h/*` — 全 200 URL
SEO 資産として 200 ページ生成されている。GA4 上位に入るのは `new-zealand-vs-south-africa`（6PV）、`japan-vs-usa`（4PV）、`australia-vs-japan`（3PV）、`ireland-vs-new-zealand`（2PV）の4件のみ。**中身が薄くないか、index bloat になっていないかを A-5 で判定すること。**

- https://www.trylinerugby.com/h2h/argentina-vs-australia
- https://www.trylinerugby.com/h2h/australia-vs-japan
- https://www.trylinerugby.com/h2h/australia-vs-new-zealand
- https://www.trylinerugby.com/h2h/bath-vs-bristol-bears
- https://www.trylinerugby.com/h2h/bath-vs-exeter-chiefs
- https://www.trylinerugby.com/h2h/bath-vs-gloucester
- https://www.trylinerugby.com/h2h/bath-vs-harlequins
- https://www.trylinerugby.com/h2h/bath-vs-leicester-tigers
- https://www.trylinerugby.com/h2h/bath-vs-newcastle-falcons
- https://www.trylinerugby.com/h2h/bath-vs-northampton-saints
- https://www.trylinerugby.com/h2h/bath-vs-sale-sharks
- https://www.trylinerugby.com/h2h/bath-vs-saracens
- https://www.trylinerugby.com/h2h/benetton-vs-cardiff
- https://www.trylinerugby.com/h2h/benetton-vs-edinburgh
- https://www.trylinerugby.com/h2h/benetton-vs-glasgow-warriors
- https://www.trylinerugby.com/h2h/benetton-vs-leinster
- https://www.trylinerugby.com/h2h/benetton-vs-lions
- https://www.trylinerugby.com/h2h/benetton-vs-munster
- https://www.trylinerugby.com/h2h/benetton-vs-ospreys
- https://www.trylinerugby.com/h2h/benetton-vs-stormers
- https://www.trylinerugby.com/h2h/benetton-vs-ulster
- https://www.trylinerugby.com/h2h/benetton-vs-zebre
- https://www.trylinerugby.com/h2h/blues-vs-chiefs
- https://www.trylinerugby.com/h2h/blues-vs-crusaders
- https://www.trylinerugby.com/h2h/blues-vs-hurricanes
- https://www.trylinerugby.com/h2h/blues-vs-moana-pasifika
- https://www.trylinerugby.com/h2h/bristol-bears-vs-exeter-chiefs
- https://www.trylinerugby.com/h2h/bristol-bears-vs-gloucester
- https://www.trylinerugby.com/h2h/bristol-bears-vs-harlequins
- https://www.trylinerugby.com/h2h/bristol-bears-vs-leicester-tigers
- https://www.trylinerugby.com/h2h/bristol-bears-vs-newcastle-falcons
- https://www.trylinerugby.com/h2h/bristol-bears-vs-northampton-saints
- https://www.trylinerugby.com/h2h/bristol-bears-vs-sale-sharks
- https://www.trylinerugby.com/h2h/bristol-bears-vs-saracens
- https://www.trylinerugby.com/h2h/brumbies-vs-force
- https://www.trylinerugby.com/h2h/brumbies-vs-hurricanes
- https://www.trylinerugby.com/h2h/brumbies-vs-reds
- https://www.trylinerugby.com/h2h/brumbies-vs-waratahs
- https://www.trylinerugby.com/h2h/bulls-vs-cardiff
- https://www.trylinerugby.com/h2h/bulls-vs-connacht
- https://www.trylinerugby.com/h2h/bulls-vs-dragons
- https://www.trylinerugby.com/h2h/bulls-vs-edinburgh
- https://www.trylinerugby.com/h2h/bulls-vs-glasgow-warriors
- https://www.trylinerugby.com/h2h/bulls-vs-leinster
- https://www.trylinerugby.com/h2h/bulls-vs-lions
- https://www.trylinerugby.com/h2h/bulls-vs-munster
- https://www.trylinerugby.com/h2h/bulls-vs-ospreys
- https://www.trylinerugby.com/h2h/bulls-vs-sharks
- https://www.trylinerugby.com/h2h/bulls-vs-stormers
- https://www.trylinerugby.com/h2h/canada-vs-fiji
- https://www.trylinerugby.com/h2h/canon-eagles-vs-kobelco-kobe-steelers
- https://www.trylinerugby.com/h2h/canon-eagles-vs-mitsubishi-dynaboars
- https://www.trylinerugby.com/h2h/canon-eagles-vs-shizuoka-blue-revs
- https://www.trylinerugby.com/h2h/canon-eagles-vs-toshiba-brave-lupus
- https://www.trylinerugby.com/h2h/canon-eagles-vs-toyota-verblitz
- https://www.trylinerugby.com/h2h/canon-eagles-vs-urayasu-d-rocks
- https://www.trylinerugby.com/h2h/cardiff-vs-connacht
- https://www.trylinerugby.com/h2h/cardiff-vs-dragons
- https://www.trylinerugby.com/h2h/cardiff-vs-edinburgh
- https://www.trylinerugby.com/h2h/cardiff-vs-glasgow-warriors
- https://www.trylinerugby.com/h2h/cardiff-vs-munster
- https://www.trylinerugby.com/h2h/cardiff-vs-ospreys
- https://www.trylinerugby.com/h2h/cardiff-vs-scarlets
- https://www.trylinerugby.com/h2h/cardiff-vs-stormers
- https://www.trylinerugby.com/h2h/chiefs-vs-crusaders
- https://www.trylinerugby.com/h2h/chiefs-vs-highlanders
- https://www.trylinerugby.com/h2h/chiefs-vs-hurricanes
- https://www.trylinerugby.com/h2h/chiefs-vs-moana-pasifika
- https://www.trylinerugby.com/h2h/chiefs-vs-reds
- https://www.trylinerugby.com/h2h/connacht-vs-dragons
- https://www.trylinerugby.com/h2h/connacht-vs-glasgow-warriors
- https://www.trylinerugby.com/h2h/connacht-vs-leinster
- https://www.trylinerugby.com/h2h/connacht-vs-lions
- https://www.trylinerugby.com/h2h/connacht-vs-munster
- https://www.trylinerugby.com/h2h/connacht-vs-ospreys
- https://www.trylinerugby.com/h2h/connacht-vs-sharks
- https://www.trylinerugby.com/h2h/connacht-vs-ulster
- https://www.trylinerugby.com/h2h/crusaders-vs-highlanders
- https://www.trylinerugby.com/h2h/crusaders-vs-hurricanes
- https://www.trylinerugby.com/h2h/dragons-vs-glasgow-warriors
- https://www.trylinerugby.com/h2h/dragons-vs-lions
- https://www.trylinerugby.com/h2h/dragons-vs-ospreys
- https://www.trylinerugby.com/h2h/dragons-vs-scarlets
- https://www.trylinerugby.com/h2h/dragons-vs-sharks
- https://www.trylinerugby.com/h2h/dragons-vs-stormers
- https://www.trylinerugby.com/h2h/dragons-vs-ulster
- https://www.trylinerugby.com/h2h/edinburgh-vs-glasgow-warriors
- https://www.trylinerugby.com/h2h/edinburgh-vs-leinster
- https://www.trylinerugby.com/h2h/edinburgh-vs-munster
- https://www.trylinerugby.com/h2h/edinburgh-vs-sharks
- https://www.trylinerugby.com/h2h/edinburgh-vs-zebre
- https://www.trylinerugby.com/h2h/england-vs-france
- https://www.trylinerugby.com/h2h/england-vs-italy
- https://www.trylinerugby.com/h2h/england-vs-scotland
- https://www.trylinerugby.com/h2h/england-vs-wales
- https://www.trylinerugby.com/h2h/exeter-chiefs-vs-gloucester
- https://www.trylinerugby.com/h2h/exeter-chiefs-vs-harlequins
- https://www.trylinerugby.com/h2h/exeter-chiefs-vs-leicester-tigers
- https://www.trylinerugby.com/h2h/exeter-chiefs-vs-newcastle-falcons
- https://www.trylinerugby.com/h2h/exeter-chiefs-vs-northampton-saints
- https://www.trylinerugby.com/h2h/exeter-chiefs-vs-sale-sharks
- https://www.trylinerugby.com/h2h/exeter-chiefs-vs-saracens
- https://www.trylinerugby.com/h2h/fiji-vs-spain
- https://www.trylinerugby.com/h2h/fijian-drua-vs-force
- https://www.trylinerugby.com/h2h/fijian-drua-vs-reds
- https://www.trylinerugby.com/h2h/fijian-drua-vs-waratahs
- https://www.trylinerugby.com/h2h/force-vs-reds
- https://www.trylinerugby.com/h2h/force-vs-waratahs
- https://www.trylinerugby.com/h2h/france-vs-ireland
- https://www.trylinerugby.com/h2h/france-vs-italy
- https://www.trylinerugby.com/h2h/france-vs-japan
- https://www.trylinerugby.com/h2h/france-vs-scotland
- https://www.trylinerugby.com/h2h/glasgow-warriors-vs-leinster
- https://www.trylinerugby.com/h2h/glasgow-warriors-vs-sharks
- https://www.trylinerugby.com/h2h/glasgow-warriors-vs-stormers
- https://www.trylinerugby.com/h2h/glasgow-warriors-vs-zebre
- https://www.trylinerugby.com/h2h/gloucester-vs-harlequins
- https://www.trylinerugby.com/h2h/gloucester-vs-leicester-tigers
- https://www.trylinerugby.com/h2h/gloucester-vs-newcastle-falcons
- https://www.trylinerugby.com/h2h/gloucester-vs-northampton-saints
- https://www.trylinerugby.com/h2h/gloucester-vs-sale-sharks
- https://www.trylinerugby.com/h2h/gloucester-vs-saracens
- https://www.trylinerugby.com/h2h/harlequins-vs-leicester-tigers
- https://www.trylinerugby.com/h2h/harlequins-vs-newcastle-falcons
- https://www.trylinerugby.com/h2h/harlequins-vs-northampton-saints
- https://www.trylinerugby.com/h2h/harlequins-vs-sale-sharks
- https://www.trylinerugby.com/h2h/harlequins-vs-saracens
- https://www.trylinerugby.com/h2h/highlanders-vs-hurricanes
- https://www.trylinerugby.com/h2h/highlanders-vs-moana-pasifika
- https://www.trylinerugby.com/h2h/honda-heat-vs-kubota-spears
- https://www.trylinerugby.com/h2h/honda-heat-vs-ricoh-black-rams
- https://www.trylinerugby.com/h2h/honda-heat-vs-tokyo-suntory-sungoliath
- https://www.trylinerugby.com/h2h/honda-heat-vs-toshiba-brave-lupus
- https://www.trylinerugby.com/h2h/honda-heat-vs-toyota-verblitz
- https://www.trylinerugby.com/h2h/hurricanes-vs-moana-pasifika
- https://www.trylinerugby.com/h2h/ireland-vs-scotland
- https://www.trylinerugby.com/h2h/ireland-vs-wales
- https://www.trylinerugby.com/h2h/italy-vs-south-africa
- https://www.trylinerugby.com/h2h/italy-vs-wales
- https://www.trylinerugby.com/h2h/japan-vs-usa
- https://www.trylinerugby.com/h2h/kobelco-kobe-steelers-vs-kubota-spears
- https://www.trylinerugby.com/h2h/kobelco-kobe-steelers-vs-ricoh-black-rams
- https://www.trylinerugby.com/h2h/kobelco-kobe-steelers-vs-shizuoka-blue-revs
- https://www.trylinerugby.com/h2h/kobelco-kobe-steelers-vs-tokyo-suntory-sungoliath
- https://www.trylinerugby.com/h2h/kobelco-kobe-steelers-vs-toshiba-brave-lupus
- https://www.trylinerugby.com/h2h/kubota-spears-vs-ricoh-black-rams
- https://www.trylinerugby.com/h2h/kubota-spears-vs-saitama-wild-knights
- https://www.trylinerugby.com/h2h/kubota-spears-vs-tokyo-suntory-sungoliath
- https://www.trylinerugby.com/h2h/kubota-spears-vs-toshiba-brave-lupus
- https://www.trylinerugby.com/h2h/kubota-spears-vs-toyota-verblitz
- https://www.trylinerugby.com/h2h/leicester-tigers-vs-newcastle-falcons
- https://www.trylinerugby.com/h2h/leicester-tigers-vs-northampton-saints
- https://www.trylinerugby.com/h2h/leicester-tigers-vs-sale-sharks
- https://www.trylinerugby.com/h2h/leicester-tigers-vs-saracens
- https://www.trylinerugby.com/h2h/leinster-vs-lions
- https://www.trylinerugby.com/h2h/leinster-vs-munster
- https://www.trylinerugby.com/h2h/leinster-vs-scarlets
- https://www.trylinerugby.com/h2h/leinster-vs-stormers
- https://www.trylinerugby.com/h2h/leinster-vs-ulster
- https://www.trylinerugby.com/h2h/leinster-vs-zebre
- https://www.trylinerugby.com/h2h/lions-vs-munster
- https://www.trylinerugby.com/h2h/lions-vs-scarlets
- https://www.trylinerugby.com/h2h/lions-vs-sharks
- https://www.trylinerugby.com/h2h/lions-vs-stormers
- https://www.trylinerugby.com/h2h/lions-vs-ulster
- https://www.trylinerugby.com/h2h/mitsubishi-dynaboars-vs-shizuoka-blue-revs
- https://www.trylinerugby.com/h2h/mitsubishi-dynaboars-vs-toshiba-brave-lupus
- https://www.trylinerugby.com/h2h/mitsubishi-dynaboars-vs-urayasu-d-rocks
- https://www.trylinerugby.com/h2h/munster-vs-ospreys
- https://www.trylinerugby.com/h2h/munster-vs-sharks
- https://www.trylinerugby.com/h2h/munster-vs-stormers
- https://www.trylinerugby.com/h2h/munster-vs-ulster
- https://www.trylinerugby.com/h2h/new-zealand-vs-south-africa
- https://www.trylinerugby.com/h2h/newcastle-falcons-vs-northampton-saints
- https://www.trylinerugby.com/h2h/newcastle-falcons-vs-sale-sharks
- https://www.trylinerugby.com/h2h/newcastle-falcons-vs-saracens
- https://www.trylinerugby.com/h2h/northampton-saints-vs-sale-sharks
- https://www.trylinerugby.com/h2h/northampton-saints-vs-saracens
- https://www.trylinerugby.com/h2h/ospreys-vs-scarlets
- https://www.trylinerugby.com/h2h/ospreys-vs-stormers
- https://www.trylinerugby.com/h2h/ospreys-vs-zebre
- https://www.trylinerugby.com/h2h/portugal-vs-uruguay
- https://www.trylinerugby.com/h2h/reds-vs-waratahs
- https://www.trylinerugby.com/h2h/ricoh-black-rams-vs-saitama-wild-knights
- https://www.trylinerugby.com/h2h/ricoh-black-rams-vs-tokyo-suntory-sungoliath
- https://www.trylinerugby.com/h2h/ricoh-black-rams-vs-toyota-verblitz
- https://www.trylinerugby.com/h2h/saitama-wild-knights-vs-tokyo-suntory-sungoliath
- https://www.trylinerugby.com/h2h/saitama-wild-knights-vs-urayasu-d-rocks
- https://www.trylinerugby.com/h2h/sale-sharks-vs-saracens
- https://www.trylinerugby.com/h2h/samoa-vs-usa
- https://www.trylinerugby.com/h2h/scarlets-vs-sharks
- https://www.trylinerugby.com/h2h/scarlets-vs-ulster
- https://www.trylinerugby.com/h2h/scarlets-vs-zebre
- https://www.trylinerugby.com/h2h/sharks-vs-stormers
- https://www.trylinerugby.com/h2h/sharks-vs-zebre
- https://www.trylinerugby.com/h2h/shizuoka-blue-revs-vs-toshiba-brave-lupus
- https://www.trylinerugby.com/h2h/shizuoka-blue-revs-vs-urayasu-d-rocks
- https://www.trylinerugby.com/h2h/tokyo-suntory-sungoliath-vs-toyota-verblitz
- https://www.trylinerugby.com/h2h/toshiba-brave-lupus-vs-urayasu-d-rocks
- https://www.trylinerugby.com/h2h/ulster-vs-zebre

#### 2.2.6 試合ページ `/matches/*` — 1096 URL
UUID のため全列挙はしない。**完全な一覧は https://www.trylinerugby.com/sitemap.xml から取得できる**（`<loc>` を grep）。大会別の一覧は公開 API `https://www.trylinerugby.com/api/v1/competitions/{slug}/matches` で取れる。

**必ず個別に確認すべき試合ページ**（GA4 実測・既知バグ・状態の網羅で選定）:

| URL | 選定理由 |
|---|---|
| https://www.trylinerugby.com/matches/f01f68e2-bdd6-47c8-8910-0ea37a382b0a | **イベント汚染バグの実例**（豪 56–17 日、8/15）。レビュー本文・得点推移グラフ・イベント一覧の3つが互いに矛盾。PV 29・1PVあたり60秒でサイト最長級。D-2-a の検証対象 |
| https://www.trylinerugby.com/matches/63b2d83f-db46-42f0-a1ed-59c2d8a39ec7 | **試合前の状態**（日本 対 カナダ、9/5 14:50 JST）。プレビューのみ・レビュー無し。スポイラーガードの挙動確認用 |
| https://www.trylinerugby.com/matches/d6d5b1ab-58ec-44c8-a31d-54fadc0a662e | PV 21（2位）・直帰率 29.4% |
| https://www.trylinerugby.com/matches/2c276057-bb3a-4617-a5b1-b7742e65f034 | PV 14・直帰率 38.5%（試合ページ中で最も高い） |
| https://www.trylinerugby.com/matches/12d74f1b-0032-4288-a8f8-cd11f3a5bd9f | PV 10・**ユーザー10人（PV=ユーザーで全員が1回だけ）** |
| https://www.trylinerugby.com/matches/a076d36c-eab6-4b0f-ad41-28d8c15a17cf | PV 5・総エンゲージ286秒（1PVあたり57秒） |
| https://www.trylinerugby.com/matches/c5e5b9d7-25c1-44d3-a8ed-5c2245851caa | PV 5・**直帰率 60%・1PVあたり2秒**（最も読まれていない） |
| https://www.trylinerugby.com/matches/3f75cf5c-2323-411d-b1f3-47efbb4963b7 | PV 7・1PVあたり3秒 |
| https://www.trylinerugby.com/matches/f01f68e2-bdd6-47c8-8910-0ea37a382b0a/en | **英語版の試合ページ**。日本語版との差分を確認 |

#### 2.2.7 公開 API（読み取り専用・認証不要）
ページを目視するだけでなく、**データ側と表示側の矛盾を検出するために必ず叩くこと**（D-2-a のイベント汚染はこの方法で発見された）。

| エンドポイント | 用途 |
|---|---|
| https://www.trylinerugby.com/api/v1/competitions | 全 38 大会シーズンの一覧と試合数 |
| https://www.trylinerugby.com/api/v1/competitions/{slug}/matches | 大会別の試合一覧 |
| https://www.trylinerugby.com/api/v1/competitions/{slug}/standings | 順位表 |
| https://www.trylinerugby.com/api/v1/calendar | 今週の試合 |
| https://www.trylinerugby.com/api/v1/matches/{id} | 試合の詳細＋イベント一覧（**本文との矛盾検出に使う**） |
| https://www.trylinerugby.com/api/v1/matches/{id}/content | プレビュー／レビュー本文 |
| https://www.trylinerugby.com/api/v1/stories | マッチストーリーズ |
| https://www.trylinerugby.com/api/v1/rwc2027-status | RWC2027 の状態 |
| https://www.trylinerugby.com/api/calendar/{feed} | iCal フィード |
| https://www.trylinerugby.com/api/og | OG 画像生成 |
| https://www.trylinerugby.com/api/health | ヘルスチェック |

#### 2.2.8 確認方法の指定
- **必ず 320 / 375 / 768 / 1024 / 1440 / 1920 の各幅で確認すること。読者の 59〜63% は Windows デスクトップである。モバイルだけ見て判断してはならない。**
- 大会ハブは **family ページ（`/c/premiership`）と season ページ（`/c/premiership/2026-27`）の両方**を開き、役割分担とカニバリズムを判定すること。
- **試合数ゼロの大会シーズン**（`/c/autumn-nations/2026`、`/c/rugby-championship/2026`）を必ず開き、空ハブの表示を確認すること。
- ラウンドページは同一大会で**複数のラウンドを開いて比較**すること（例: `/c/premiership/2026-27/round/5` と `/round/6`）。
- 順位表ページは **`/c/nations-championship/2026/standings`（sitemap 収録の唯一の standings）** と、他大会で同じパスが引けるかを確認すること。

---

### 2.3 外部アカウント
- X: **@tryline_rugbyjp**
- note: **@tryline_rugbyjp**
- Discord: 運用サーバーあり（ops 通知 Webhook + スラッシュコマンド 2本）

---

## 3. 実測データ（2026-09-05 取得）

### 3.1 GA4（プロパティ 538067713 "Tryline"、タイムゾーン Asia/Tokyo）

#### 月次推移（GA4 計測は 2026-06 開始。それ以前のデータは存在しない）
| 月 | セッション | ユーザー | 新規 | PV | 平均セッション時間 | エンゲージメント率 |
|---|---:|---:|---:|---:|---:|---:|
| 2026-06 | 115 | 82 | 80 | 205 | 160.2s | 37.4% |
| 2026-07 | 394 | 233 | 228 | 756 | 169.3s | 55.1% |
| 2026-08 | 290 | 198 | 196 | 558 | 177.6s | 61.4% |
| 2026-09（1〜4日） | 48 | 41 | 36 | 90 | 171.6s | 68.8% |

#### チャネル / 流入元（2026-08-08〜09-04 の28日間）
| チャネル | ソース | セッション | ユーザー | 新規 | エンゲージ済 | 平均滞在 | PV |
|---|---|---:|---:|---:|---:|---:|---:|
| Organic Search | **bing** | 96 | **89** | 87 | 84 | 170.0s | 168 |
| Direct | (direct) | 56 | 54 | 53 | 23 | 102.7s | 85 |
| Organic Search | **google** | 28 | **23** | 23 | 16 | 79.8s | 44 |
| Organic Social | x | 27 | **1** | 0 | 18 | 452.4s | 69 |
| Organic Social | t.co | 22 | **12** | 11 | 8 | 123.3s | 33 |
| Organic Search | search.google.com | 16 | 1 | 0 | 9 | 193.7s | 37 |
| Unassigned | home | 12 | 5 | 0 | 7 | 56.3s | 27 |
| Organic Search | yahoo | 10 | 8 | 8 | 5 | 147.7s | 43 |
| Unassigned | x | 5 | 3 | 2 | 4 | 864.4s | 16 |
| Unassigned | competition | 3 | 3 | 0 | 2 | 1364.5s | 12 |
| Organic Search | cn.bing.com | 2 | 2 | 2 | 2 | 29.2s | 4 |
| Organic Search | ecosia.org | 2 | 2 | 2 | 1 | 8.3s | 2 |
| AI Assistant | copilot.com | 1 | 1 | 1 | 1 | 148.8s | 1 |
| Organic Search | ask / duckduckgo | 各1 | 各1 | 各1 | 0〜1 | — | — |
| Referral | echonimo.com / gopher.com / topsy.com / trooker.com | 各1 | 各1 | 各1 | **0** | 5〜6s | 各1 |
| Unassigned | calendar | 1 | 1 | 0 | 1 | 13.4s | 2 |

**note.com からの流入は 0 セッション / 0 ユーザー（3ヶ月連続）。**
**referral 4件（echonimo/gopher/topsy/trooker）は滞在5〜6秒・エンゲージ0 で、スパム referral と考えられる。**

#### ページ別（2026-08-08〜09-04、上位）
| ページ | PV | ユーザー | 総エンゲージ秒 | 直帰率 |
|---|---:|---:|---:|---:|
| `/` | 85 | 33 | 791 | 27.8% |
| `/c/greatest-rivalry/2026` | 49 | 34 | **2170** | 10.5% |
| `/calendar` | 38 | 12 | 173 | 18.5% |
| `/matches/f01f68e2…`（AUS-JPN 8/15） | 29 | 7 | **1735** | 5.6% |
| `/c/lipovitan-challenge-cup/2026` | 24 | 21 | 428 | 4.8% |
| `/c/pnc/2026` | 24 | 17 | 500 | 23.8% |
| `/matches/d6d5b1ab…` | 21 | 5 | 352 | 29.4% |
| `/c/nations-championship/2026` | 18 | 14 | 616 | 14.3% |
| `/c/urc/2025-26` | 15 | 7 | 43 | 22.2% |
| `/matches/2c276057…` | 14 | 9 | 108 | 38.5% |
| `/c/six-nations/2027` | 13 | 7 | 250 | 11.1% |
| `/c/premiership/2026-27` | 11 | 2 | 61 | 20.0% |
| `/c/rwc/2027` | 9 | 5 | 182 | 20.0% |
| `/legal/privacy` | 7 | 4 | 37 | 28.6% |
| `/legal/terms` | 7 | 3 | 3 | 57.1% |
| `/pricing` | **計測上位40に入らず（PV 2未満）** | | | |

（全107ページ。長い尾は試合ページと H2H）

#### デバイス × OS × 新規/再訪（28日）
| デバイス | OS | 区分 | セッション | ユーザー | PV | 平均滞在 |
|---|---|---|---:|---:|---:|---:|
| desktop | Windows | new | **129** | **129** | 200 | 123.8s |
| desktop | Macintosh | returning | 56 | 8 | 147 | 435.7s |
| mobile | iOS | new | 23 | 23 | 66 | 64.4s |
| desktop | Macintosh | new | 22 | 22 | 51 | 242.8s |
| mobile | iOS | returning | 20 | 5 | 42 | 194.6s |
| mobile | Android | new | 14 | 14 | 22 | 36.2s |
| desktop | Windows | returning | 11 | 10 | 14 | 133.2s |
| desktop | Linux | new | 5 | 5 | 4 | 25.4s |
| その他 | | | 8 | 7 | 5 | — |

**Windows デスクトップ新規が全体の59%（129/218セッション）。Macintosh returning の 8ユーザー・56セッションは Owner 自身とみられる。実質的な再訪ユーザーは iOS 5人 + Windows 10人程度。**

#### イベント（28日）
| イベント名 | 発生数 | ユーザー |
|---|---:|---:|
| page_view | 551 | 200 |
| session_start | 287 | 200 |
| user_engagement | 213 | 128 |
| first_visit | 195 | 195 |
| scroll | 117 | 84 |
| **newsletter_view** | **77** | **49** |
| click | 12 | 11 |
| cta_click | 9 | 5 |
| return_visit | 5 | 2 |
| form_start | 1 | 1 |
| **newsletter_confirmed** | **1** | **1** |

**存在しないイベント（=28日間で1件も発火していない）**: `newsletter_subscribe`、`sign_up`、`login`、`paywall_view`、`trial_start`、`purchase`、`begin_checkout`、`chat_*`、`favorite_*`。
→ **ニュースレター表示49人 → 確認完了1人（2.0%）。有料導線（paywall/trial/purchase）は28日間で一度も発火していない。**

### 3.2 サイト実測（2026-09-05、curl）

| ページ | HTTP | TTFB | 総時間 | HTMLサイズ | x-vercel-cache | cache-control | h1 | h2 | 内部リンク | JSON-LD |
|---|---|---:|---:|---:|---|---|---:|---:|---:|---:|
| `/` | 200 | 0.383s | 0.407s | 227 KB | **HIT** | public, max-age=0, must-revalidate（prerender, stale-time 300） | 1 | 8 | 305 | 2 |
| `/calendar` | 200 | **2.366s** | 2.658s | 200 KB | **MISS** | **private, no-cache, no-store** | 1 | 3 | 249 | **0** |
| `/c/nations-championship/2026` | 200 | 0.770s | 0.798s | 366 KB | HIT | 同上 prerender | 1 | 14 | 316 | 4 |
| `/c/premiership/2026-27` | 200 | 0.568s | 0.596s | **520 KB** | HIT | 同上 prerender | 1 | 23 | 380 | 4 |
| `/pricing` | 200 | 0.283s | 0.302s | 132 KB | — | — | 1 | 7 | 268 | 4 |
| `/matches/f01f68e2…` | 200 | 0.535s | 0.552s | 197 KB | HIT | 同上 prerender | 1 | 12 | 276 | 2 |

`robots.txt`: `User-Agent: * / Allow: /` + sitemap 指定のみ。

### 3.3 コンテンツ在庫

**sitemap.xml = 1,664 URL**
| セクション | URL数 |
|---|---:|
| `/matches/*` | 1,096 |
| `/c/*` | 274 |
| `/h2h/*` | 200 |
| `/teams/*` | 91 |
| `/pricing` `/calendar` `/`（トップ） | 各1 |

**RSS（`/rss.xml`）= 直近30本のレビュー。最新は 2026-08-31。**

**大会カバレッジ（`/api/v1/competitions` 実測、38 competition-season）**
| family | シーズン数 | 総試合数 | 最新シーズン |
|---|---:|---:|---|
| urc | 3 | 301 | 2026-27 |
| premiership | 3 | 255 | 2026-27 |
| league-one | 2 | 228 | 2025-26 |
| super-rugby-pacific | 2 | 166 | 2026 |
| six-nations | 8 | 120 | 2027 |
| autumn-nations | 5 | 94 | **2026（0試合）** |
| rwc | 2 | 84 | 2027 |
| nations-championship | 1 | 36 | 2026 |
| top-14 | 3 | **32** | 2026-27 |
| pnc | 4 | 30 | 2026 |
| rugby-championship | 2 | 12 | **2026（0試合）** |
| greatest-rivalry | 1 | 8 | 2026 |
| lipovitan-challenge-cup | 1 | 4 | 2026 |
| puma-trophy | 1 | 2 | 2026 |

**試合数ゼロの大会シーズンが2件存在する**: `autumn-nations-2026`、`rugby-championship-2026`。

### 3.4 コード規模
| 対象 | 数 |
|---|---:|
| `app/` ページルート | 30 |
| `app/api/` ルート | 58（うち cron 21） |
| `components/` | 64ファイル |
| `lib/` TypeScript | 182ファイル |
| `lib/llm/` | 26ファイル / 6,912行 |
| `tests/` テストファイル | 283 |
| `scripts/` | 48 |
| `specs/` | 約400本 |
| `.claude/skills/` | 26（計 1,301行） |
| `.github/workflows/` | 20（cron 19） |
| dependencies | 21（devDeps 20） |

**`lib/llm/` 内訳（行数）**: `stages/assemble.ts` 1060 / `pipeline.ts` 916 / `stages/qa.ts` 742 / `sourced-facts/fetch.ts` 591 / `prompts/qa-content.ts` 432 / `prompts/generate-recap.ts` 362 / `stages/generate-narrative.ts` 354 / `sourced-facts/allowlist.ts` 348 / `types.ts` 286 / `prompts/generate-preview.ts` 281 / `notify.ts` 269 / `stages/derived-stats.ts` 257 / 他

### 3.5 cron スケジュール（全19本、UTC 表記）
| ワークフロー | schedule (UTC) | JST |
|---|---|---|
| cron-live-pipeline | `0 0,6,12,18 * * *` | 09/15/21/03 |
| cron-collect-news-links | `0 0,6,12,18 * * *` | 09/15/21/03 |
| cron-send-content-notifications | `*/30 * * * *` | 30分毎 |
| cron-send-prematch-notifications | `0 * * * *` | 毎時 |
| cron-cleanup-raw-data | `0 4 * * *` | 13:00 |
| cron-ingest-broadcasts | `15 3 * * *` | 12:15 |
| cron-post-to-x | `0 3 * * *` / `0 13 * * *` / `0 16 * * 6,0` | 12:00 / 22:00 / 土日 01:00 |
| cron-prekickoff-readiness-audit | `5 13 * * *` | 22:05 |
| cron-weekend-preview-refresh | `5 12 * * 4` / `5 12 * * 5` | 木金 21:05 |
| cron-post-match-recap-refresh | `5 0 * * 1` | 月 09:05 |
| cron-ingest-fixtures | `0 2 * * 1` | 月 11:00 |
| cron-ingest-standings | `30 3 * * 1` | 月 12:30 |
| cron-ingest-world-rankings | `0 3 * * 1` | 月 12:00 |
| cron-ingest-squads | `0 2 * * 0` | 日 11:00 |
| cron-fill-event-gaps | `0 6 * * 0` | 日 15:00 |
| cron-audit-data-integrity | `30 3 * * 0` | 日 12:30 |
| Vercel cron: `/api/cron/weekly-digest` | `0 12 * * 1` | 月 21:00 |
| （手動のみ）cron-fill-league-one-playoff-events / cron-ingest-league-one-lineups / manual-ingest-lineups | — | — |

**GitHub Actions の cron は実測で1〜10時間遅れる**（`docs/chatgpt-prompts/README.md` に運用上の注意として明記）。締切設計はこの遅れを当てにしていない。

### 3.6 取得できなかったデータ（あなたが前提を置く際に注意）
- **Google Search Console**: 本セッションでは認証情報にアクセスできず未取得。リポジトリに `tools/gsc-pull.ts` と `docs/runbooks/gsc-analysis-setup.md` があり、Owner は取得可能。**GSC が必要な結論を出す場合は「要 GSC 検証」と明示すること。**
- **Bing Webmaster Tools**: 同上（`docs/runbooks/bing-analysis-setup.md` あり）。**Bing が最大流入源なのに、その検索クエリ実態は未計測**。
- **Supabase 本番DB**: 直接クエリ不可。`match_team_stats` の行数、`sourced_facts` の件数分布、published/draft の内訳などは未取得。
- **X アナリティクス CSV**: 未取得。D019 は「この問いに答えられるのは自アカウントの X アナリティクス CSV だけ」と結論している。
- **iOS アプリ（tryline-mobile）**: private リポジトリのため対象外。

---

## 4. 監査スコープ

### A. Web ページのデザイン改善

**すべての面について、以下の観点を1つずつ埋めること。**

#### A-1. トップページ `/`
実測で得られている現状（テキスト抽出結果、上から順）:
```
ヘッダー: Tryline / 試合 / 大会▾ / カレンダー / 料金 / ログイン
ヒーロー: "Rugby Analysis in Japanese" → "今週の海外ラグビーを、日本時間で追う。"
          "PNC、Six Nations、Premiership、URC。週末に重なる試合を、日程・結果・順位・日本語レビューまでひとつの流れで確認できます。"
          CTA: [今週の試合を見る] [Premium無料体験]
セクション: "Matchday Board" (8月第5週) → 試合カード群
セクション: 週次ニュースレター登録フォーム
セクション: "注目大会 / Featured Competition" → リポビタンDチャレンジカップ2026
セクション: "今後の試合 / 注目の次戦"
セクション: "最近のレビュー / 無料で読めるレビュー" → Sample（RWC2023 NZ vs RSA）
セクション: 大会別の最新節カード（Greatest Rivalry / Puma Trophy …）
セクション: "最近レビューのある大会"（4件）
セクション: "大会アーカイブ"（15件、すべて「最新シーズン」バッジ付き）
フッター
```
検証すべき点（すべて回答すること）:
1. **情報の階層**: セクションが9個以上並ぶ。初回訪問者（=全体の89%が新規）が3秒で「これは何のサイトか」を理解できるか。スクロール深度は `scroll` イベントが84ユーザー/200ユーザー（42%）しか発火していない。下部セクションは見られているのか。
2. **ラベルの言語混在**: "Rugby Analysis in Japanese" / "Matchday Board" / "Featured Competition" / "Sample" と、日本語見出しが混在している。これは意図的なデザイン言語として成立しているか、それとも一貫性の欠如か。判断と根拠を書くこと。
3. **大会名の表記ゆれ**: 同一ページ内に「リポビタンDチャレンジカップ2026」（日本語）と "Lipovitan-D Challenge Cup 2026"（英語）、「Greatest Rivalry」（英語）と「グレイテスト・ライバルリー・ツアー オールブラックス 南アフリカ遠征 2026」（日本語・37文字）が同時に存在する。カード上でこの長さの大会名が扱えているか。
4. **ヒーローのコピーと実態のずれ**: ヒーローは「PNC、Six Nations、Premiership、URC」を挙げるが、注目大会はリポビタンDチャレンジカップ、最近のレビューは Greatest Rivalry / Puma Trophy。ユーザーの期待と着地がずれていないか。
5. **「大会アーカイブ」15件が全部「最新シーズン」バッジ**: 差別化されていない。オータムネーションズシリーズ 2025 / ザ・ラグビーチャンピオンシップ 2025 が「最新シーズン」として並ぶが、前者は 2026 が0試合、後者は Nations Championship に統合済みで 2026 は存在しない。この面をどう再設計すべきか。
6. **無料サンプルの位置と質**: 唯一の「無料で読めるレビュー」が RWC2023 NZ vs RSA（3年前の試合）。本文冒頭は「3分のペナルティゴールが決勝点となり、南アフリカがニュージーランドを12対11で下した。試合は南アフリカのペナルティゴールによる得点が鍵となり…両チームの得点力の差が試合を決定づけ…南アフリカはラグビーワールドカップ2023での優位性を示した。」——**1点差の試合に対して「得点力の差が決定づけた」という記述が成立するか、あなたの判断を書くこと**。プロダクトの品質を代表する唯一のショーケースがこれでよいか。
7. **ニュースレターフォームの位置**: `newsletter_view` は49ユーザー（訪問者の25%）に届いているが確認完了は1人。フォームの配置・文言・摩擦を評価すること。
8. **CTA の優先順位**: [今週の試合を見る] と [Premium無料体験] が並列。有料導線イベントが28日間ゼロである事実と照らして、この2択が正しいか。
9. デザイントークン（`design.md`）との整合。余白リズム・タイポの階層・カードの密度。
10. デスクトップ 1440px での情報密度（読者の59%が Windows デスクトップ）。`design.md` は「223 の `sm:` に対し `lg:` は26しかない」と自己申告している。トップはどうか。

#### A-2. カレンダー `/calendar`
実測での現状:
- **TTFB 2.366s / x-vercel-cache MISS / cache-control: private, no-cache, no-store**（他ページは HIT・0.3〜0.8s）
- JSON-LD が **0個**（他ページは2〜4個）
- 同じ週のデータが**2回レンダリングされている**: 上部のコンパクトな時刻順テーブル（`14:50 JPN – CAN / 00:10 RSA – NZL / 02:05 CAS – VAN …`）と、下部の曜日別カードリスト（`土 5 9月 1試合 → 日本 対 カナダ …`）。
- 大会名の表記が行ごとに英日混在: "Lipovitan-D Challenge Cup 2026" / "Greatest Rivalry 2026" / "トップ14 2026-27" / "Puma Trophy 2026"
- フィルタ「大会別に見る」チップと、下部の「リポビタンD / Greatest Rivalry / Top 14 / Puma Trophy」の凡例が別物として存在
- 「日程掲載状況」通知: 「プレミアシップ 2026-27 の日程には、現在表示できない節があります。」
- 末尾に「カレンダー購読 / iCal URL」「週次ニュースレター」「iPhone・iPad アプリ」の3ブロック

検証すべき点:
1. **二重レンダリングは意図的か冗長か**。GA4 では `/calendar` は PV 38 / 12ユーザー / 総エンゲージ173秒 = 1PVあたり4.6秒。トップ（791秒/85PV=9.3秒）や大会ハブ（2170秒/49PV=44秒）と比べ極端に短い。**滞在が短いのは設計の失敗か、それとも「見て離脱する」正しい使われ方か**。判断と根拠を書くこと。
2. 週ナビゲーション（前週/今週/翌週）の発見性。
3. 「日程掲載状況」の欠落通知が、信頼を高めているか不安を与えているか。
4. JSON-LD ゼロ。カレンダーは `Event` / `SportsEvent` 構造化データの最有力候補では。
5. iCal 購読導線の位置と訴求。
6. デスクトップ週ボード（`components/calendar/week-schedule.tsx`、`design.md` が density.desktop の参照実装と明記）の実効性を 1440px で評価すること。
7. 決定 D020〜D023（週ボード採用、B2案、略称主・正式名従、1日開催週も週ボード維持、幅は試合数から計算）が実装に反映されているか、そして**その決定自体が正しかったか**を再評価すること。

#### A-3. 試合詳細 `/matches/[id]`
実測での現状（`/matches/f01f68e2-bdd6-47c8-8910-0ea37a382b0a`、AUS 56–17 JPN）のセクション順:
```
パンくず/大会名 → 試合ヘッダー（チーム名・スコア・WIN バッジ・JST/現地時刻・会場）
→ 視聴方法（確認日・放送・配信・YouTube ハイライト検索）
→ 両者の対戦成績（H2H リンク）
→ この試合の核心（レビュー冒頭）
→ Tryline 編集部・2分で読める・レビュー
→ この試合の要点（前半の最大リード: オーストラリア 7点差）
→ レビュー本文（試合全体像 …）
→ 次のセクション: ターニングポイント →
→ 「週末の注目試合と無料サンプルは X / note で更新中」+ フォローする / note
→ 更新日時
→ この記事の根拠（出典: rugby-japan.jp）
→ 得点推移グラフ
→ すべての得点・カード（イベントタイムライン）
→ 「試合前のプレビューを表示 +」→ プレビュー全文（この試合の核心 / 本文3セクション）
→ この記事の根拠（出典3件）
→ Next / 次に見る（両チームの次戦カード + 「このチームを追う」）
→ 今週の全試合を見る
→ AI CHAT「この試合について質問する」
→ フッター
```
検証すべき点:
1. **セクション数が多すぎないか**。1PVあたり60秒（1735秒/29PV）と滞在は長いが、これは読了か迷子か。
2. **「この試合の核心」という見出しがレビューとプレビューの両方に出る**。同一ページに同じ見出しが2回。混乱しないか。
3. **AI CHAT が最下部**。プロダクトの差別化機能が最も見られない位置にある。有料転換の唯一の武器がここでよいか。
4. **「この記事の根拠」が本文の後ろに2回出る**。信頼担保としての効果的な位置は。
5. **イベントタイムラインが英語表記**（`Itō / Matsunaga / Potter / Lonergan / Wright / Makisi / Jorgensen / Ueda / McReight / Tupou / Donaldson / Dearns`）なのに、本文は日本語表記（`タニエラ・トゥポウ / 齋藤 直人 / 松永 拓朗 / ディラン・ライリー`）。**同一ページで同じ選手が2つの表記で出る**。
6. **本文内の日本語選手名の表記ゆれ**: 「齋藤 直人」「松永 拓朗」（姓名間スペースあり）vs「木田晴斗」「上ノ坊駿介」「矢崎由高」（スペースなし）。
7. 「2分で読める」「4分で読める」の読了時間表示の妥当性。
8. 得点推移グラフの可読性（軸ラベル `0 / 31 / 61` と `0' / 20' / 40' / 60' / 80'`）。
9. プレビューがアコーディオンで畳まれている設計の是非。
10. スポイラーガード（`components/spoiler-score.tsx`）の挙動を試合前ページ `/matches/63b2d83f-…` で確認すること。
11. 有料導線（paywall）の位置と、`paywall_view` イベントが28日間ゼロである事実の関係。

#### A-4. 大会ハブ `/c/[competition]` と `/c/[competition]/[season]`
実測での現状:
- `/c/nations-championship/2026`: h2 14個 / HTML 366KB / JSON-LD 4 / 内部リンク 316
- `/c/premiership/2026-27`: h2 **23個** / HTML **520KB** / JSON-LD 4 / 内部リンク 380
- title: 「ネーションズチャンピオンシップ 2026 最新結果・次戦・日程・順位 | Tryline」／「プレミアシップ 2026-27 日程・見どころ | Tryline」——**大会の状態によってタイトル型が変わる設計**（D関連の decisions を参照）
- description: 「ネーションズチャンピオンシップ 2026 の最新結果・次戦・日程・順位を掲載。」——テンプレート丸出し
- family ページ `/c/premiership` と season ページ `/c/premiership/2026-27` が別に存在

検証すべき点:
1. **大会ハブは Bing 流入の86%が着地する面であり、事業上の最重要面**（後述 5.3）。1PVあたり滞在は Greatest Rivalry で44秒、NC で34秒とサイト内最長。**それでも再訪はほぼゼロ**。何が足りないか。
2. h2 が23個、HTML 520KB。情報量が多すぎないか / 構造化されているか。
3. meta description がテンプレート。Bing/Google の CTR に直結する。大会ごとに書き分けるべきか、自動生成の質を上げるべきか。
4. family ページと season ページの役割分担。ユーザーはどちらに着地し、どちらを見るべきか。カニバリズムはないか。
5. 大会ごとの視覚的差別化（`specs/feat-competition-hub-visual-differentiation.md` / `specs/fix-hub-hero-scrim-and-pool-labels.md` で実装済み）が機能しているか。実際にヒーロー画像とスクリムを見て評価すること。
6. **0試合の大会シーズン**（`autumn-nations-2026`、`rugby-championship-2026`）のハブがどう表示されるか確認し、対処を提案すること。
7. 順位表ページ `/c/[comp]/[season]/standings`、ラウンドページ `/round/[n]` との導線。
8. 「視聴方法」（放送情報）の掲載状態と鮮度。
9. RWC 2027 ハブ `/c/rwc/2027` — North Star に直結する面。開幕1年前として十分か。

#### A-5. その他のページ（すべて評価すること）
- `/pricing` — h2 7 / JSON-LD 4（FAQ schema）。有料転換ゼロの現状で何が問題か
- `/h2h/[pair]` — 200ページある。SEO 資産として機能しているか / 中身は薄くないか
- `/t/[team]` と `/teams/[slug]` — **2つの URL 体系が併存**。91チーム
- `/players/[slug]` — noindex 化済み（index bloat 対策）。存在意義を再評価すべきか
- `/en` と `/matches/[id]/en` — 英語版。事業上の位置づけ
- `/legal/*`（privacy 7PV / terms 7PV・直帰率57%）、`/support`
- `/newsletter/*`（confirmed / expired / invalid-link / unsubscribed）— 4ページの体験
- 404 ページ
- OG 画像（`/api/og`、`specs/feat-calendar-og-image.md` 等）

#### A-6. 横断
1. `design.md`（185行）と実装の乖離。**2026-08-25 に「実装を文書に寄せない」方針で書き直し済み**なので、今度は「文書が実装を追認しただけで、デザインとして良いのか」を問うこと。
2. ダークモード**非対応**。読者の59%が Windows デスクトップである前提で、必要か。
3. アクセシビリティ（`design.md` にコントラスト計算値の記載あり、`prefers-reduced-motion` 実装済み）。**過去の a11y 指摘は全件解決済みなので、解決済み項目を蒸し返さず、新規の問題だけ挙げること**。
4. パフォーマンス（Core Web Vitals）。HTML が 200〜520KB ある点、フォント（Zen Maru Gothic 3ウェイト + Outfit 2ウェイト）の読み込み。
5. 「AI」というラベルの扱い。方針として UI 文言から "AI" を外す（「AI解説」→「解説/プレビュー/レビュー」）が決まっているが、`AI CHAT` は残っている。

---

### B. スキルの改善

**対象: `.claude/skills/` の26本すべて + `.claude/agents/` の3本すべて。1本ずつ所見を出すこと。**

#### 現状インベントリ（行数は SKILL.md の行数）
| # | スキル | 行数 | 用途 |
|---:|---|---:|---|
| 1 | backlink-outreach | 32 | 被リンク獲得 |
| 2 | biz-strategy | 34 | 事業戦略の壁打ち |
| 3 | codex-handoff | 31 | Codex へのプロンプト作成 |
| 4 | codex-review | 31 | Codex 実装のレビュー |
| 5 | competitor-watch | 39 | 競合調査 |
| 6 | content-plan | 33 | サイト内コンテンツ企画 |
| 7 | content-qa | 41 | 公開コンテンツの品質監査 |
| 8 | content-regen | 38 | LLM コンテンツ再生成 |
| 9 | decision-log | 40 | decisions.md への記録 |
| 10 | discord-ops | 32 | Discord 配信・運用 |
| 11 | funnel-audit | 38 | 動線・CVR 監査 |
| 12 | growth-analysis | 35 | SEO・集客分析 |
| 13 | hub-audit | 42 | 大会ハブ監査 |
| 14 | image-gen | 54 | 生成画像プロンプト |
| 15 | incident-postmortem | 37 | 事故の振り返り |
| 16 | **note-weekly** | **158** | note 記事ドラフト |
| 17 | pr-merge | 50 | PR マージと後処理 |
| 18 | prod-investigation | 33 | 本番 DB 調査 |
| 19 | rugby-news | 36 | ラグビーニュース調査 |
| 20 | rwc2027 | 41 | RWC2027 長期構築 |
| 21 | site-audit | 45 | 本番サイト実測監査 |
| 22 | spec-writing | 33 | 仕様書作成 |
| 23 | **today** | **88** | 毎朝の司令塔 |
| 24 | weekly-ops | 41 | 週次運用ルーティン |
| 25 | **x-post** | **165** | X の自発ポスト |
| 26 | x-reply | 54 | X の reply 運用 |
| | **合計** | **1,301** | |

**補助ファイルは1つも無い**（全スキルが SKILL.md 単体。`references/` `scripts/` `assets/` を持つスキルはゼロ）。

エージェント3本: `tryline-site-auditor`（34行、Playwright 系ツール付与）/ `tryline-spec-checker`（40行）/ `tryline-web-researcher`（30行、WebSearch+WebFetch）。

#### 検証すべき点（26本すべてについて答えること）
1. **1本ずつ**: そのスキルは (a) 今も必要か (b) 記述が実態と合っているか (c) 30〜50行という分量で目的を果たせているか (d) 他スキルと重複していないか (e) 廃止・統合・分割すべきか。
2. **重複の検出**: `growth-analysis` / `funnel-audit` / `biz-strategy` / `weekly-ops` / `today` は責務が重なっていないか。`content-qa` / `content-regen` / `content-plan` も同様。`site-audit` と `hub-audit` は。
3. **陳腐化の検出**: D017（note 週次B型停止）、D019（X を獲得チャネルから外す）、D027（ニュース収集の停止決定、リポジトリ未反映）が各スキルに反映されているか。**特に `note-weekly`（158行）と `x-post`（165行）は方針変更の直撃を受けている**。
4. **一度も起動されていないスキルの推定**: git 履歴と decisions.md から、実運用で使われた形跡があるかを推定し、休眠スキルを特定すること。
5. **欠けているスキル**: 現状のスキル群でカバーされていない反復作業は何か。実測データから示唆されるもの（例: Bing 分析、メール配信検品、デザイン監査、パフォーマンス監査、有料転換の実験設計）を具体的に挙げること。
6. **補助ファイルの不在**: 全スキルが SKILL.md 単体。チェックリスト・テンプレート・スクリプトを `references/` に切り出すべきスキルはどれか。
7. **書き方の質**: description（起動トリガー）が具体的か。「〜と言われたら起動」という形式は機能しているか。本文が「手順」になっているか「心構え」で終わっていないか。
8. **エージェント3本**: 使われているか。ツール権限は適切か。`tryline-site-auditor` は Playwright MCP に依存するが、既知の制約として「Playwright MCP は Vercel プレビューに SSO で弾かれる」。本番監査には使えるか。
9. **ユーザーレベルのスキル汚染**: `~/.claude/skills/` に56本のスキルが入っており、その大半が Kotlin / Laravel / Django / C++ / Dart / Spring Boot など **Tryline（Next.js + TypeScript）と無関係**。さらにプラグイン由来のスキルが数百本ロードされている。この状態が (a) スキル選択の精度を下げていないか (b) 何を削るべきか を提案すること。
10. **スキルと `CLAUDE.md` の関係**: `CLAUDE.md` は「Claude Code は実装コードを書かない」「Codex に委譲する」を規定している。スキル群がこの役割分担を強化しているか、抜け道を作っていないか。

---

### C. 集客・X・note の方針改善

#### C-1. 現状の確定事実（これを覆す提案をする場合は根拠を示すこと）

**流入構造（28日、実測）**
- 検索合計 **123ユーザー**（bing 89 + google 23 + yahoo 8 + その他3）
- **Bing が Google の 3.9倍**。しかも Bing は新規率 98%（87/89）
- X 起点の実流入 = `t.co` **12ユーザー**（`x/social` 27セッション・1ユーザー、`x/profile` 5セッション・3ユーザーは Owner の回遊とみなす基準が D019 で確立済み）
- **note.com からの流入 0ユーザー（3ヶ月連続）**
- Direct 54ユーザー（うちエンゲージ23 = 43%。他チャネルより低い）
- referral 4件はスパム

**デバイス**
- Windows デスクトップ新規 **129ユーザー**（全体の59%）
- iOS モバイル新規 23ユーザー（11%）
- **Bing = デスクトップ / Google = モバイル で流入が完全に分離**

**着地面**
- Bing 流入の **86% が大会ハブ**（`/c/*`）に着地
- 大会ハブの1PVあたり滞在: Greatest Rivalry 44秒 / NC 34秒 / PNC 21秒
- トップの1PVあたり滞在: 9.3秒
- **カレンダーの1PVあたり滞在: 4.6秒**

**再訪**
- 実質的な再訪ユーザーは iOS 5人 + Windows 10人程度（Mac の8ユーザー56セッションは Owner）
- `return_visit` イベント: 5回 / 2ユーザー

**転換**
- `newsletter_view` 49ユーザー → `newsletter_confirmed` **1ユーザー**（2.0%）
- `sign_up` / `paywall_view` / `trial_start` / `purchase` は **28日間で0件**
- 有料購読者は実質ゼロ

**過去の決定（変更提案は decisions.md を読んだ上で）**
- **D017**（2026-08-15）: note 週次B型を停止。X の漏斗は各段の転換率は正常で「壊れているのは母数」（インプレッション115）。時間を大会ハブ整備へ振り替え
- **D019**（2026-08-28）: X を獲得チャネルから外し、「信頼の担保」「試合日の実況接点」「ニュースへの応答」の3役割に限定。撤退はしない。90日判定は 2026年10月第1週、指標は `t.co` ユーザー数/28日（現在12、目標20超）
- **D027**（2026-09-04、リポジトリ未反映）: ニュース収集パイプラインを完全停止。RSS の3ソースが全部ニュージーランド系で URC/Premiership/Top 14 を1件も拾えていなかった

**ピークシーズン未経験**: GA4 データは 2026-06 以降のみ。**シーズン本番（秋〜春）を一度も計測していない**。2026年11月の日本代表欧州遠征に集中する方針が 2026-08-06 に決まっている。

#### C-2. 答えるべき問い（すべて）
1. **Bing 偏重をどう扱うか**。Bing が Google の3.9倍という状態は、(a) 好機（競合が最適化していない領域）(b) リスク（Google に評価されていない兆候）のどちらか。Bing 特化施策として何をすべきか。**Bing Webmaster Tools の実クエリが未計測である点を踏まえ、まず何を計測すべきかも書くこと**。
2. **Google が伸びない原因の仮説**を、実測（google 23ユーザー / モバイル中心 / 平均滞在79.8秒＝全チャネル最短）から立てること。
3. **大会ハブが商品である**という現状認識（Bing の86%が着地、滞在最長）を前提に、大会ハブをどう強化すれば流入と再訪が増えるか。具体的な施策を優先順位つきで。
4. **記事1,096本が集客に寄与していない**問題。sitemap の66%が試合ページなのに、GA4 上位の試合ページは29PVが最大。この在庫をどう活かすか、あるいは畳むか。
5. **note を継続すべきか**。3ヶ月連続で外部流入ゼロ。D017 は A型（日本代表戦翌日の深掘り）のみ継続としているが、11月の欧州遠征を前に方針を確定すべきタイミング。**A型をサイト本体に移すべきか、note に残すべきか**を、SEO・被リンク・読者接点の観点から論じること。
6. **X の3役割（信頼担保 / 試合日接点 / ニュース応答）は正しいか**。D019 の90日判定（10月第1週）を前に、判定基準（`t.co` 20ユーザー/28日）が妥当か、そもそも判定して何を決めるのかを整理すること。
7. **ニュースレターの 2.0% 転換**（49 view → 1 confirmed）。ダブルオプトインの確認メールで落ちている可能性が高い。どこを直すべきか。**`newsletter_subscribe` イベントが存在しないため、view → submit → confirm のどこで落ちているか計測できていない点も指摘すること**。
8. **再訪の受け皿**。iOS アプリ（16%しか届かない）、メール（週次配信は 2026-08-27 に修正済み）、Web Push（未着手）。Windows デスクトップ59%という読者構成に対して、**Web Push が最も理にかなうのではないか**。検証すること。
9. **Direct 54ユーザーの正体**。エンゲージ率43%と低い。ブックマーク再訪か、計測漏れか、ボットか。切り分け方法を提案すること。
10. **被リンク**。日本語で海外ラグビーを継続的に扱う個人メディアはほぼ存在しないと調査済み（追加探索は凍結）。この前提でどう権威を作るか。
11. **11月の日本代表欧州遠征**に向けた 60日計画。今（9月）から何を積むべきか、週次で。
12. **RWC 2027 まで14ヶ月**。North Star が「RWC2027 までの有料購読者数」であることに対し、今の集客構造で到達可能か。**到達不可能だと判断するなら、そう言うこと**。
13. **有料転換が28日間ゼロ**という事実に対する構造的診断。価格（¥980）、提供価値、導線、タイミングのどれが原因か。仮説を優先順位つきで。
14. **英語版 `/en`** の位置づけ。Reddit/Medium への英語配信を試みた経緯がある。継続すべきか。
15. **計測の穴**: `newsletter_subscribe` / `sign_up` / `paywall_view` の各イベントが存在しない。実装すべきイベント設計を具体的に列挙すること。

---

### D. Discord 連携と記事生成の方針改善（**最重要課題: 情報の深みがない**）

#### D-1. 現状のパイプライン

**4段階**（`specs/p1-content-pipeline.md`）: 集約 → 事実抽出 → ナラティブ生成 → 品質チェック（QA）

**入力データ（`lib/llm/types.ts` の `AssembledContentInput`）**:
- `match_events`（得点イベント: 分・種別・選手名・チーム）
- `score_timeline`（前半終了時スコア、全得点時点の累計、リード変化、決勝点）
- `derived_stats`（連続得点、最大リード、逆転幅、無得点時間帯、コンバージョン成功率、得点内訳、カード、トライスコアラー、後半得点）
- `competition_standings`（順位表）
- `projected_lineups`（予想/確定ラインアップ）
- `sourced_facts`（allowlist ドメインから抽出した出典付き事実）
- `additional_signals`（source: `reddit` | `official_press` | `editorial`）
- `tactical_points`（tactical_dimension / home_situation / away_situation / matchup_implication / match_impact）
- `team_stats`（**`Top14TeamStats` 型**: possession_pct, territory_pct, carries, metres_gained, tackles_made/missed, lineouts_won/total, scrums_won/total, turnovers, errors, penalties_conceded, cards）

**sourced_facts の allowlist ドメイン（12件）**: `league-one.jp` / `onrugby.it` / `premiershiprugby.com` / `rugby-japan.jp` / `rugby-rp.com` / `rugby.com.au` / `rugbyasia247.com` / `springboks.rugby` / `super.rugby` / `therugbypaper.co.uk` / `unitedrugby.com` / `wikipedia.org`

**QA のルーブリック（`lib/llm/prompts/qa-content.ts` / `lib/llm/stages/qa.ts`）**: 4指標を1〜5で採点
- `information_density` / `japanese_quality` / `factual_grounding` / `tactical_depth`
- **publish 条件: 全指標 ≥3 かつ `information_density` ≥4（`DENSITY_PUBLISH_MIN = 4`）**
- `tactical_depth` ≤2 で retry、リトライ2回で reject
- `tactical_depth` のルーブリック: 5=一般論が皆無 / 4=軽微な一般論1〜2箇所 / **3=数値や具体描写はあるが「好調」「重要」等の一般論も目立つ** / 2=表層的な記述が支配的 / 1=ほぼ一般論
- **→ `tactical_depth = 3`（＝一般論が目立つ）は publish される**

**recap プロンプト**（`lib/llm/prompts/generate-recap.ts`、`PROMPT_VERSION = "recap@4.19.0"`、362行）: データ充足度で3分岐（ラインアップあり / データ希薄 / 中間）。セクション見出しと字数を厳密に指定（例: 「ターニングポイント 900-1,100字」「全体2,000字以上」）。

**Discord 連携**（`lib/llm/notify.ts` 269行 / `app/api/discord/interactions/route.ts` 708行）:
- ops 通知: Webhook `DISCORD_WEBHOOK_OPS` へ。コンテンツ reject 時に診断情報（本文長・下限・ラインアップ数・sourced_facts 件数・決定論ガードの検出）を送信。**2000文字で切り詰め**
- スラッシュコマンド **2本**: `/fact-entry`（手動で sourced fact を投入）、`/research-fact-entry`（調査由来の fact を投入、confidence: high/medium/low、source_url 必須）
- `/api/cron/notify-discord`、`/api/cron/collect-news-links`（**D027 で停止決定済み**）

#### D-2. 実測で確認した重大な欠陥（**必ず検証し、原因と対策を書くこと**）

**D-2-a. 公開中のレビューと、同じページに表示されるイベントデータが完全に矛盾している**

対象: `/matches/f01f68e2-bdd6-47c8-8910-0ea37a382b0a`（オーストラリア 56 – 17 日本、2026-08-15、`status: finished`）

`/api/v1/matches/f01f68e2-…` が返すイベント19件:
```
12' try Itō        → team_id c8053648 (= オーストラリア, home)
13' conversion Matsunaga  → c8053648 (オーストラリア)
15' try Potter     → team_id b2445801 (= 日本, away)
16' conversion Lonergan   → b2445801 (日本)
26' try Wright     → b2445801 (日本)
27' conversion Lonergan   → b2445801 (日本)
34' try Makisi     → c8053648 (オーストラリア)
35' conversion Matsunaga  → c8053648 (オーストラリア)
42' try Jorgensen  → b2445801 (日本)
43' conversion Lonergan   → b2445801 (日本)
45' try Ueda       → c8053648 (オーストラリア)
49' try McReight   → b2445801 (日本)
50' conversion Lonergan   → b2445801 (日本)
53' penalty_goal Matsunaga → c8053648 (オーストラリア)
59' penalty_goal Matsunaga → c8053648 (オーストラリア)
70' try Tupou      → b2445801 (日本)
71' conversion Donaldson  → b2445801 (日本)
78' try Dearns     → c8053648 (オーストラリア)
79' conversion Matsunaga  → c8053648 (オーストラリア)
```
問題は3重:
1. **チーム帰属が反転している**。Itō / Matsunaga / Makisi / Ueda / Dearns（日本の選手）がオーストラリアに、Potter / Lonergan / Wright / Jorgensen / McReight / Tupou / Donaldson（オーストラリアの選手）が日本に紐付いている。
2. **イベントの合計得点が表示スコアと一致しない**。イベントから算出すると 33–32。表示スコアは 56–17。**別の試合のイベントが紐付いている**（8月8日の第1戦と推定）。
3. **レビュー本文はイベントと全く別の内容を書いている**。本文は「5分、ハリー・ホッキングスのトライで0–5と先制」「26分に齋藤 直人がトライ」「34分のライリーのトライで14–17と逆転」「39分のトゥポウが19–17へ引き戻し」「51分にアンガス・ベル、58分にマッシモ・デ・ルティース」「73分のチャーリー・ケイル、75分のハリー・ウィルソン、81分のブランドン・パエンガ＝アモサ」と記述。**イベントリストに存在する選手・分と一致するものが1つもない**。

つまり、**同一ページ上で「レビュー本文」「得点推移グラフ」「すべての得点・カード」の3つが互いに矛盾したまま公開されている**。「捏造しないこと」を存在意義とするプロダクトにとって、これは最も重い信頼毀損である。

検証・回答すべきこと:
- なぜ QA の `factual_grounding`（5=スコア・選手名・戦術がすべて入力データと一致 / 2=入力データと矛盾する記述がある）を通過したのか。QA はイベントと本文を突き合わせているはずである（`eventsBlock` がプロンプトに含まれる）。**どこが機能していないか**。
- なぜ「イベント合計 ≠ 表示スコア」を検出する決定論的ゲートが働いていないか（`specs/fix-score-event-integrity-check.md`、`specs/fix-derived-stats-event-integrity-gate.md` が存在する）。
- チーム帰属反転を検出する仕組みは作れるか。
- **公開済み全レビューに同種の汚染がどれだけあるか**を検出する方法を設計すること（`specs/fix-contaminated-match-events.md` の既存アプローチを踏まえて）。
- 表示側の防御: 3つの表示要素が矛盾する場合、どれを出しどれを隠すべきか。

**D-2-b. 「深みがない」の構造的原因**

同じページのプレビュー本文（4分で読める、3セクション）で使われている数値は事実上2つだけ:
- 「オーストラリアの直近5試合平均36.4得点 / 日本の平均29.2失点」
- 「日本の直近5試合平均得点23.8点 / オーストラリア36.4点、差12.6点」「平均失点は日本29.2 / オーストラリア33」
- 「直近5試合の平均得点と平均失点を単純に重ねると、オーストラリアは約33点、日本は約28点」

**3セクションすべてが同じ2つの平均値を言い換えているだけ**。セクション見出しは「35対32の再戦で問われる日本の継続得点」「再構成されたオーストラリアのパックと日本の先発8人」「33対28の平均値をどうひっくり返すか」だが、中身は同じ統計の再提示。

レビュー本文も同様に、スコア推移の言い換え＋「トライ後の加点を8本すべて決め、トライを得点へ取り切る連続性を保った」といった、得点イベントから機械的に導ける記述に留まる。**ポゼッション、テリトリー、ラインアウト成功率、スクラム、タックル成功率、ブレイクダウン、キック数といったラグビーの分析に不可欠な指標が一切出てこない**。

検証・回答すべきこと:
1. **`Top14TeamStats` 型は possession/territory/lineout/scrum/tackles を定義しているのに、Top 14 以外では埋まっていない**。この供給不足が深みの上限を決めている。**どの大会について、どのソースから、どの指標を取れるか**を具体的に調査し、提案すること（allowlist の12ドメイン、および追加候補）。
2. **プロンプトが字数（2,000字以上、ターニングポイント900-1,100字）で縛られている**。データが足りない状態で字数を要求すれば、水増しが起きる。**字数制約と情報量制約のどちらを優先すべきか**、設計として答えること。
3. **QA の publish 閾値（`tactical_depth ≥3`）が「一般論も目立つ」を許容している**。閾値を上げるべきか。上げた場合に publish 率がどうなるか、代わりに何が必要か。
4. **`tactical_points`（fact-extraction 段階の出力）が本文にどう反映されているか**を追跡し、この中間表現が深みに寄与しているかを評価すること。
5. **`additional_signals` の `reddit` ソースは D009 で停止中**（Responsible Builder Policy 承認待ち）。再開すべきか、別の代替があるか。
6. **選手個人スタッツが無い**。「注目選手」セクションがあるのに、選手のトライ数以上の情報が無い。どこから取るか。
7. **プレビューとレビューで同じ数字を使い回している**問題。プレビューの「直近5試合平均」がレビューにも出るなら、両者の差別化が消える。
8. **「深み」の定義そのもの**を提案すること。何が満たされれば「深い」のか、測定可能な形で。
9. **モデル選択**: 現在 NARRATIVE=`gpt-5.6-terra`、FAST=`gpt-5.6-luna`、CHAT=`gpt-4o-mini`。GPT-6 世代への移行で深みは改善するか、それとも入力データの問題で頭打ちか。**あなた自身の能力を過大評価せず、率直に答えること**。
10. **コスト制約**: LLM 生成コンテンツは試合単位でキャッシュ（ユーザー単位ではない）。1試合の直列再生成に約2.1分かかる実測がある。深みを増す施策のコスト影響を必ず併記すること。

**D-2-c. Discord 連携の改善**

現状は (1) ops アラート（reject 通知）と (2) 手動 fact 投入コマンド2本のみ。**§2.1.1 の D026 / D027 / ChatGPT 調査運用を必ず読んでから答えること。**

直近（2026-09-04）に方針が大きく動いている:
- **RSS によるニュース自動収集は D027 で完全停止決定**。ソース3つが全部ニュージーランドで、商品の中心（URC / プレミアシップ / Top 14）を1件も拾えていなかった。稼働9日で終了
- 置き換え先は **Owner が ChatGPT に調べさせ、Discord のスラッシュコマンドで手入力する週3回の運用**（木/金/月、1回10〜12ブロック、週30〜36回）
- 出典 URL の存在確認は **D026 で robots.txt 参照の例外**を認めた。ただし潰せるのは「404 の URL」だけで、記事がその事実を書いているかは Owner の目視依存

検証・回答すべきこと:
1. **`/fact-entry` `/research-fact-entry` は、深みの供給不足に対する解として十分か**。Owner が手作業で fact を入れる運用はスケールするか。週何試合を想定すべきか。**運用ドキュメント自身が「9/25 に URC 144試合とプレミアシップ90試合が開幕すると対象が週20〜30増える。全部は回りません」と認めている。この破綻を前提に、何を捨て何を自動化すべきかを設計すること。**
1-b. **「既存の事実が少ない試合に絞る」という現在の優先ルールは正しいか。** 事実が薄い試合に足すのと、読まれている試合（大会ハブ経由で着地する試合）に厚くするのと、どちらが事業指標に効くか。GA4 の実測（試合ページの上位は29PV、大会ハブは滞在44秒）を踏まえて答えること。
1-c. **締切設計の脆さ**: 入力が木21:05 / 金21:05 / 火09:05 を過ぎると「DB に入るだけで記事に反映されない」。しかも GitHub Actions の cron は実測1〜10時間遅れる。この設計は運用として持続するか。代替（生成トリガーを時刻でなく事実の到着に紐付ける等）を検討すること。
1-d. **火曜の再生成は未実装**（`specs/feat-tuesday-recap-refresh.md` + `app/api/cron/matches-with-recent-manual-facts/route.ts` がローカルにあるのみ）。月曜夜の入力が現時点でどこにも反映されない状態。優先度を判定すること。
2. **Discord を「読者コミュニティ」として使う可能性**。現状は運用通知チャンネル。読者接点として使うべきか、それとも使うべきでないか。読者59%が Windows デスクトップという構成と Discord の相性。
3. **ops 通知の質**。2000文字切り詰め、reject 時のみ通知。**「クレジット切れで LLM が全滅しても GitHub Actions が success を返し、丸1日気づかなかった」という実際の事故（2026-09-05）が起きている**。通知設計をどう直すか。
4. **成功時・部分失敗時の可視性**。現状は失敗のみ通知。運用者が「今週いくつ生成され、いくつ落ちたか」を把握できるか。
5. Discord Bot を使った他の自動化（生成待ちキュー、承認フロー、fact のクラウドソース等）の是非。
6. **一次情報の取得を人力で回す設計そのもの**の評価。ChatGPT 調査を週3回（木21:05 / 金21:05 / 火09:05 の再生成 cron から逆算）走らせる運用が既にある。この人力ループを自動化すべきか、人力のまま質を上げるべきか。

---

### E. その他（改善できそうなことは何でも）

**必ず1つ以上の所見を出すこと。「特になし」は禁止。** 以下は着眼点の例であって、これに限定されない。

1. **データパイプラインの信頼性**。cron 19本。GitHub Actions が `failure=8` でも success を返す事故が起きている。可観測性をどう作るか。
2. **開幕（2026-09-25）のスケール問題**。8試合の直列再生成に16分35秒。GitHub Actions の30分 timeout に収まらない見込み。並列化・分割の設計。
3. **specs が約400本**ある。運用可能な量か。棚卸しすべきか。索引（`specs/README.md`）は機能しているか。
4. **`lib/llm/stages/assemble.ts` が1,060行、`pipeline.ts` が916行**。ユーザーのコーディング規約は「200〜400行典型、800行上限」。分割すべきか。
5. **テスト283ファイル**。カバレッジと、実際にバグを防いでいるか。過去に「CI green でもテスト0件」の事故がある。
6. **URL 体系の重複**: `/t/[team]` と `/teams/[slug]`、`/c/[competition]` と `/competitions/[slug]`。整理すべきか。
7. **RSS のタイトル生成バグ**: 「フィジー 対 スコットランド — Nations Championship 2026 2026」「オーストラリア 対 日本 — リポビタンDチャレンジカップ2026 2026」——**年が二重に付く**。かつ大会名が英日混在。
8. **大会名 `name_ja`** の権威がコード側定数にあり、DB を直しても6時間で戻る設計。
9. **選手の日本語表記が 23/2,456人** しか無い。ツールは完成済み。全件やるか、記事に出る選手に絞るか未決。
10. **iOS アプリ**（別リポジトリ、審査中）と Web の役割分担。読者の16%しか iOS に届かない。
11. **Supabase のコスト**（Free 枠超過で全断 → Pro $34.81/月へ移行済み）。egress スパイクの原因は未調査。
12. **セキュリティ**: CSP、RLS、公開 API（`/api/v1/*`）のレート制限、Stripe/RevenueCat Webhook の検証。
13. **法務・著作権**: sourced_facts の allowlist 運用（A型=行為禁止は除外 / B型=著作権ベースは許容 の基準が確立済み）。15語超の直接引用禁止。この運用が守られているか。
14. **`CLAUDE.md` の役割分担（Claude Code は実装しない）** が、開発速度のボトルネックになっていないか。
15. **プロダクトの根本的な問い**: 「日本語で海外ラグビーを追いたいファン」向けに、LLM 生成のプレビュー/レビューを月¥980で売るというモデルは成立するか。成立しないと考えるなら、代替のモデルを提案すること。

---

## 5. 前提として扱うこと（再発見・蒸し返し不要）

以下は既に判明・解決済み。**指摘を繰り返す必要はない**。ただし、あなたの提案がこれらと矛盾する場合は、その旨を明示して論じてよい。

### 5.1 既に修正済み・解決済み
- アクセシビリティ指摘（コントラスト、reduced-motion）は全件解決済み
- `design.md` と実装の乖離は 2026-08-25（D018）・08-31（D020）で解消済み
- 本文の日付が UTC で1日ずれる問題は修正・デプロイ済み（公開中2件の手修正のみ未了）
- ホーム/大会ハブ/試合詳細の `no-store` 問題は解消済み（PR #606・#623）
- 週次ニュースレター cron の GET/POST 不一致は修正済み（PR #734、2026-08-27）
- iOS/メールの再訪受け皿の配信ゼロ問題は修正済み。**環境変数は全て設定済みで原因ではない**
- チーム名の `name_ja` は 91/91 チームが保有済み（「78/90が英語」は古い数字）
- Rugby Championship は Nations Championship に統合済み。2026 は独立大会として存在しない

### 5.2 既知だが未着手（**指摘ではなく、優先度と解き方を提案してほしい**）
- **`/calendar` の `no-store` バグ**: 原因は `app/calendar/page.tsx:129` の `await getUser()`。`export const revalidate = 1800` があるのに `cookies()` 呼び出しで動的化している。ホーム等で修正済みの `components/user-state-provider.tsx` パターンが未適用。**原因は特定済みなので、再診断は不要**
- **Web Push が未着手**（再訪受け皿3つのうち唯一）
- **プレビュー生成 cron の窓に穴**: 日曜キックオフは金曜の1回きり、水曜は0回
- **ラインアップとプレビュー生成のタイミングずれ**: spec 3本作成済み・Codex 未着手
- **イベントギャップ 28件残存**: `fill-event-gaps` は limit を先に適用する構造欠陥でほぼ検出不能
- **Top 14 が節単位取得のため未来が1節先までしか見えず、カレンダーから消える**（D024。フルバックフィルは却下済み）
- **大会ハブの日程がサーバー HTML に出ていない**: 静的生成＋`useSearchParams` が原因。spec 作成済み
- **選手ページは noindex 化済み**（index bloat 対策として意図的）
- **note の週次B型は停止済み**（D017）。クラウド routine の停止が必要
- **ニュース収集は D027 で完全停止決定**（2026-09-04）。spec `fix-retire-news-link-pipeline.md` と codex-prompt はローカルに存在、**Codex 未着手・未コミット**
- **出典 URL 検証の robots.txt 例外は D026 で承認済み**（2026-09-04）。`/research-fact-entry` は実装・マージ済み（PR #755）
- **火曜のレビュー再生成が未実装**。`specs/feat-tuesday-recap-refresh.md` と `app/api/cron/matches-with-recent-manual-facts/route.ts`（112行、テスト224行）はローカルにあるが未コミット。**月曜夜に入れた事実が現時点でどこにも反映されない**
- **リフレッシュ処理のスケールと失敗可視化が未着手**。`specs/fix-refresh-workflow-scale-and-failure-visibility.md` がローカルにあるのみ。9/25 開幕でこれが効く

### 5.3 判断の基準として確立済み（覆すなら根拠が必要）
- **referral はセッション数でなくユーザー数で見る**（note 28セッションが全部 Owner 1人だった事故に由来）
- **商品は記事でなく大会ハブとカレンダー**（ハブ107秒・カレンダー120秒に対し試合ページ3.6秒という過去実測）
- **AI 生成の架空の顔だけを理由に画像を差し戻さない**（Owner 判断）
- **UI 文言から "AI" を外す**（「敵は AI でなく間違い」）
- **ダークモードを自動採用しない**。プロダクトが求める方向を選ぶ

---

## 6. 提案が違反してはいけない不変条件

以下は交渉不可。**これに反する提案をする場合は、その旨を明示し、なぜ不変条件を変えるべきかを別立てで論じること**。

1. **試合中心のデータモデル**。すべてのコンテンツ（プレビュー、レビュー、チャットコンテキスト）は `match_id` に紐付く
2. **LLM 生成コンテンツは試合単位でキャッシュ**し、ユーザー単位ではない。ユーザー数が増えてもコストは増えない（AI チャットを除く）
3. **スクレイプした生テキストを決して再配信しない**。LLM で日本語に書き直してから配信する
4. **robots.txt を常に尊重**。parser を使い、レート制限を守り、積極的にキャッシュする
5. **著作権への配慮**: 15語を超える直接引用なし、同一ソースから複数引用なし、原則として言い換える
6. **モバイルファーストの PWA**。ただし読者の59%は Windows デスクトップである（この2つの整合も論点として扱ってよい）
7. **LLM プロバイダは OpenAI**（`OPENAI_API_KEY`）。Claude/Gemini 等への移行提案は不変条件違反として扱う
8. **実装は Codex に委譲**。あなたの提案は「仕様」として書かれるべきで、コードそのものではない

---

## 7. 出力形式

以下の構成で出力すること。**A〜E すべてを必ず含めること。長さを理由に省略してはならない。**

```
# Tryline 監査レポート 2026-09-05

## 0. エグゼクティブサマリー
- 最も重い問題 3件（それぞれ1行 + 根拠となる実測値）
- 30日以内に着手すべきこと 5件
- やめるべきこと 3件

## A. Web デザイン
### A-1 トップページ  … 観点1〜10すべてに回答
### A-2 カレンダー     … 観点1〜7すべてに回答
### A-3 試合詳細       … 観点1〜11すべてに回答
### A-4 大会ハブ       … 観点1〜9すべてに回答
### A-5 その他のページ … 列挙された全ページ
### A-6 横断           … 観点1〜5すべてに回答

## B. スキル
### B-1 26本の個別所見（表形式: スキル名 / 現状評価 / 判定[維持|改稿|統合|廃止] / 理由 / 具体的な改稿内容）
### B-2 重複と責務の再設計
### B-3 陳腐化の検出結果
### B-4 欠けているスキルの提案
### B-5 エージェント3本の所見
### B-6 ユーザーレベル/プラグインのスキル汚染への対処

## C. 集客・X・note
### C-1 問い1〜15すべてに回答
### C-2 60日計画（11月の日本代表欧州遠征まで、週単位）
### C-3 RWC2027 までの到達可能性の判定

## D. Discord 連携と記事生成
### D-1 イベント汚染バグの原因分析と対策
### D-2 「深みがない」の構造的原因と、供給側・生成側・検査側それぞれの対策
### D-3 Discord 連携の改善（問い1〜6すべてに回答）
### D-4 「深い」の定義（測定可能な形で）

## E. その他
（15の着眼点すべてに所見。加えて、あなたが発見した項目）

## F. 優先度付き実行計画
| # | 施策 | 領域 | 期待効果 | 実装コスト | 前提/依存 | 判定に使う指標 |
（30件以上。すべて「なぜその順序か」を1行で添えること）

## G. 私が確認できなかったこと / 追加で必要なデータ
（GSC、Bing Webmaster、Supabase、X アナリティクス等。何を取れば結論が変わるかを明示）
```

### 各所見の書き方
- **必ず根拠を示す**。「〜だと思う」ではなく「〜という実測値/コード/決定があるので〜」
- **推測は推測と明示する**。実測で裏が取れていない主張には「要検証」と付けること
- **数値を出すときは出典を明示**（本ドキュメントの実測値か、あなたが取得したものか）
- 改善案は「何をどう変えるか」まで具体的に。「改善する」「最適化する」だけの記述は禁止

---

## 8. 禁止事項

1. **省略・要約による逃げ**。「主要なものを挙げると」「他にも多数ありますが」は禁止。すべて列挙すること
2. **一般論**。「ユーザー体験を向上させましょう」「SEO を強化すべきです」のような、このプロダクト固有でない助言は禁止
3. **数値の捏造**。本ドキュメントにない数値を、出典なしに書かないこと。**捏造統計を敵とするプロダクトの監査で捏造をしてはならない**
4. **既に解決済みの項目（§5.1）の蒸し返し**
5. **不変条件（§6）への無自覚な違反**
6. **実装コードを書くこと**。仕様・方針として書くこと
7. **§5.2 の既知課題を「発見」として提示すること**。優先度と解き方だけを述べること
