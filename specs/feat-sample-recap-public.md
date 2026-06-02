# サンプル recap の公開（非ペイウォール化）— O2

## 背景

0→1 のボトルネックは配布（distribution）と転換（[[project-growth-strategy]]）。現状 recap は全件ペイウォール（`PremiumRecapSection` が `/api/me/premium` を見てクライアント側でゲート）で、**未課金ユーザー・クローラ・SNS には全文が見えない**。これが2つの障壁を生む:

1. **転換障壁**: 「課金前に品質を確かめられない」。
2. **配布障壁**: ペイウォール recap は X/note で**シェアしても中身が見えない**＝拡散資産にならない。

直近のコンテンツ品質作業で **recap は捏造ゼロ＋URC/SRP も網羅**となり、**自信を持って公開できる**状態になった。少数の良質 recap を「無料サンプル」として全文公開すれば、転換（try-before-buy）と配布（シェア可能な資産）を同時に解消できる。

## スコープ

**対象:**
- **「無料サンプル試合」を指定する仕組み**: 少数（例 5〜15 試合）の match を「サンプル」として指定する。実装は下記「データモデル」の方針 A か B。
- **サンプル試合の recap をサーバーサイドで全文レンダリング**: 該当試合では `PremiumRecapSection`（クライアントゲート）を経由せず、`MatchContentSection` 等で recap 本文を**初期 HTML に全文出力**（ログアウト/未課金でも見える・クローラ/OGP に載る）。preview は従来どおり。
- **サンプル明示＋CTA**: 全文の末尾に「これは無料サンプルです。他の全試合のレビューは Premium（¥980/月・7日間無料トライアル）で」という導線（既存 `components/paywall.tsx` / pricing への CTA を流用、ただし**本文を隠さない**バナー型）。
- **計測**: サンプル recap 経由のトライアル登録/Premium 遷移を GA で追えるようにする（既存 GA イベント方式に合わせる）。

**対象外:**
- 全 recap の無料化（収益毀損）。あくまで**少数の固定サンプル**。
- preview の扱い（既に無料・`pr100-preview-always-free`）。
- 料金ページの SAMPLE（別実装 `fix-pricing-sample-content` / `p9-sample-recap-markdown-strip`。本 spec はサンプルを**実 match ページ**で公開する点が異なる。料金ページ SAMPLE とサンプル試合を**同一 match に揃える**かは未解決質問へ）。

## データモデル変更

**方針 A（推奨・マイグレーション無し）**: サンプル match_id を**設定値**（`lib/` の定数 or 環境変数 `SAMPLE_MATCH_IDS`）で管理。`isSampleMatch(matchId)` ヘルパーで判定。少数・固定なら最小コスト。Owner がサンプルを差し替えるにはデプロイ要。

**方針 B（DB フラグ）**: `matches` に `is_free_sample boolean default false` を追加（マイグレーション）。Owner が SQL/管理で随時切替可、デプロイ不要。柔軟だがマイグレーション要。

MVP は **方針 A** を推奨（YAGNI）。将来サンプルを動的に増やすなら B へ移行。どちらにするかは未解決質問へ。

## API サーフェス

- 新規ルートは不要。`app/matches/[id]/page.tsx`（および `/en`）でサンプル判定を行い、recap を全文 SSR するか従来のペイウォールにするか分岐。
- `/api/og` 動的 OGP・canonical は既存流用（サンプルも非サンプルも match ページとして同じ）。

## UI サーフェス

- **サンプル試合**: recap 全文 + 末尾に「無料サンプル」明示バナー + Premium/トライアル CTA。本文は隠さない。
- **非サンプル試合**: 従来どおり（teaser + paywall）。
- 見た目の一貫性: 既存 `MatchContentSection` の recap レンダリングを流用し、ゲートだけ外す。

## LLM 連携

なし（既存 recap を表示するだけ）。

## 受け入れ条件

1. サンプル指定された match の `/matches/[id]` で、**ログアウト状態でも recap 全文が初期 HTML に含まれる**（`curl -s <url> | grep <本文の一節>` で確認可能）。
2. 非サンプル match は従来どおりペイウォール（未課金で全文が出ない）。
3. サンプル recap 末尾に「無料サンプル」明示と Premium/トライアル CTA があり、**本文は隠れない**。
4. サンプル recap の OGP/canonical が正しく、X/LINE 共有でカード表示される（既存 `/api/og` 流用）。
5. サンプル経由のトライアル/Premium 遷移が GA で計測できる。
6. サンプル match の選定リスト（方針 A なら定数/env、B ならフラグ）が1箇所で管理され、容易に差し替え可能。

## 確定（2026-06-02・Owner 決定）

- **方針 A（定数/env・マイグレーション無し）** で実装。`lib/` に定数 `SAMPLE_MATCH_IDS`（または env）＋ `isSampleMatch(matchId)` ヘルパー。
- **無料の範囲 = recap 全文公開**（配布資産としてシェア先で完結させる）。
- **サンプル試合 8件（match_id 固定・全て2026年5月＝直近）**。今日(2026-06-02)から数日〜2週間以内の現行シーズン試合を選定（配布の鮮度重視）。海外厚め＋JP関心の League One を2件:

| 大会 | 試合 | 日付 | match_id |
|------|------|------|----------|
| Premiership | Northampton 36-32 Gloucester | 2026-05-30 | `a06219be-9d24-486b-92a5-7f9f88ef8826` |
| Premiership | Sale 33-47 Leicester | 2026-05-17 | `2f2463af-e5d4-4503-ae41-292e961dc6cc` |
| Premiership | Northampton 94-33 Bristol | 2026-05-15 | `040cdb1a-74b6-41b1-906a-70ea06f2ad1c` |
| Super Rugby Pacific | Chiefs 59-34 Blues | 2026-05-30 | `9b219d0d-7c5a-40e2-98cc-4deae50e4160` |
| Super Rugby Pacific | Crusaders 47-14 Hurricanes | 2026-05-29 | `e68ed3e7-d374-4f57-9dca-72148fa129cb` |
| Super Rugby Pacific | Hurricanes 45-28 Highlanders | 2026-05-23 | `41a8d58e-9a3f-45fc-b8db-a3e6130b695a` |
| League One | 埼玉ワイルドナイツ 24-26 クボタ | 2026-05-31 | `f74d5e5b-de8f-4bb9-a53a-7d0b8726319f` |
| League One | サントリー 40-35 リコー | 2026-05-23 | `2cbc8b44-2404-42c0-8ea3-6e96cf4ac3f6` |

> 注: サンプルは固定。シーズン進行で陳腐化したら定数を差し替える（方針 A）。運用として**月1で最新の好試合に入れ替える**のが望ましい。

## 未解決の質問（Owner 判断・任意）

1. **料金ページ SAMPLE と統一するか**: 料金ページのショーケース recap を、上記サンプル試合の1つ（例: England 15-16 South Africa）に揃えると一貫性が出る。任意。
2. **EN ページ**: 上記 match の `/matches/[id]/en` も同様にサンプル公開するか（英語 recap がある試合のみ）。

## 補足: Codex 向け参考パターン
- ゲートの外し方: `components/premium-recap-section.tsx`（client ゲート）を、サンプル時は使わず recap を直接 `MatchContentSection`（`isPremium=true` 相当で全文）で SSR。
- 分岐は `app/matches/[id]/page.tsx`（recap レンダリング箇所 L310 付近 `PremiumRecapSection`）と `/en` 版の双方。
- CTA バナーは `components/paywall.tsx` / `premium-upsell-banner.tsx` を「本文を隠さない」形に流用。
- canonical/OGP は既存 match ページ実装を流用（変更不要）。
