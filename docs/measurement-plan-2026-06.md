# Tryline 計測ファースト設計（2026-06-10）

> `docs/growth-playbook-2026-06.md` Part 5（先行指標）の **実装・運用層**。  
> Codex が CTA クリック計測（`lib/analytics.ts` / `TrackedLink` / `checkout-success-tracker.tsx`）を実装したので、
> 「実際に発火している GA4 イベントをファネルにどう対応させ、毎週何を見て、どの穴を塞ぐか」をここで確定する。

---

## 1. 実装済み GA4 イベント（grep で確認した実体）

GA4 は `app/layout.tsx` で `NEXT_PUBLIC_GA_MEASUREMENT_ID` 経由で稼働。`trackEvent` は `window.gtag` があるときのみ発火（SSR/未設定時は no-op）。

| イベント名 | 発火箇所 | 主なパラメータ |
|-----------|---------|---------------|
| `page_view` | GA4 自動 | （標準） |
| `cta_click` | `trackCtaClick`（全 CTA 共通） | `cta_id`, `cta_location`, `destination`, `content_type`, `is_sample`, `match_id`, `language` |
| `sample_recap_cta_click` | `components/sample-recap-cta.tsx` | サンプル recap 専用の補助イベント |
| `purchase` | `components/checkout-success-tracker.tsx`（`?checkout=success` 着地時） | `currency: JPY`, `value: 980` |

### 実在する `cta_id`（全11種・grep 出典）

**→ /pricing or checkout（課金導線）**
`home_hero_pricing` / `home_sample_section_pricing` / `pricing_hero_checkout` / `pricing_sample_section_checkout` / `match_content_locked_pricing` / `paywall_pricing` / `premium_upsell_banner_pricing` / `sample_recap_pricing` / `mobile_header_pricing` / `site_header_pricing` / `user_menu_upgrade`

**→ サンプル recap（信頼醸成導線）**
`home_hero_sample_recap` / `home_sample_section_sample_recap` / `pricing_hero_sample_recap`

---

## 2. ファネル対応表

```
[流入] ──> [回遊/信頼] ──────> [課金意欲] ──────> [課金開始] ──> [課金完了]
page_view   sample_recap系     cta_click           cta_click       purchase
            cta_click          (*_pricing)         (*_checkout)    (¥980)
                               paywall_pricing
                               match_content_locked_pricing
```

| ステージ | 対応イベント | 見る指標 |
|---------|-------------|---------|
| 流入 | `page_view` | 訪問数・流入元・着地ページ |
| 回遊/信頼 | `*_sample_recap` 系 `cta_click` | サンプル recap クリック率 |
| 課金意欲 | `*_pricing` `cta_click`（特に `paywall_pricing`・`match_content_locked_pricing`） | ペイウォール→料金ページ遷移率 |
| 課金開始 | `*_checkout` `cta_click`（`pricing-form.tsx`） | 料金ページ→チェックアウト率 |
| 課金完了 | `purchase` | 最終 CVR |

---

## 3. ギャップ分析（重要度順）

### 🔴 GAP-1: 流入元の判別ができない（最重要）
X 投稿 URL は `lib/x/post.ts:248` で `https://www.trylinerugby.com/matches/${matchId}` を **UTM なし**で生成。
GA4 のデフォルト参照元判定（`t.co` → social）はあるが、**「どの reply」「note 経由」「SEO 経由」を分離できない**。
→ reply-first・SEO・note の効果を数字で比較できない＝**今回選んだ施策の成否が測れない**。これを最優先で塞ぐ。

UTM 規約:
- X / Discord 下書きの試合URL: `utm_source=x&utm_medium=social&utm_campaign=<preview|recap>&utm_content=<match_id>`
- note: `utm_source=note&utm_medium=referral&utm_campaign=<記事スラッグ or weekly-roundup>`
- X プロフィールリンク等の固定リンク: `utm_source=x&utm_medium=profile`

### 🟠 GAP-2: ペイウォール「表示」が未計測
`paywall_pricing` はクリックのみ。**ペイウォールが何回表示されたか**が無いので、ペイウォール CTR（表示→クリック）が出せない。
ロックコンテンツの訴求力を測る分母が欠けている。

### 🟡 GAP-3: `purchase` がクライアント依存で取りこぼす
`?checkout=success` 着地 + `gtag` ロード時のみ発火。Stripe タブを閉じた／戻らなかったユーザーの課金は **GA 上カウントされない**。
GA の CVR は過小評価される前提で見る。正値は Stripe ダッシュボード／Supabase を真とする。

### 🟡 GAP-4: 無料トライアル登録・サインアップが未計測
playbook の先行指標「無料トライアル登録率」に対応する GA イベントが無い（`sign_up` / `trial_start` 不在）。

---

## 4. 週次レビュー（GA4 で見る最小セット）

毎週月曜、直近7日で以下を確認（GA4 探索 or Looker Studio）:

| # | 見るもの | 健全性の目安（〜3ヶ月） |
|---|---------|----------------------|
| 1 | セッション数 × 流入元（Default channel group） | organic search が右肩上がり |
| 2 | `cta_click` 総数 と `cta_id` 別内訳 | どの導線が押されているか |
| 3 | サンプル recap クリック率（sample系 cta / 該当ページ page_view） | 信頼醸成導線の効き |
| 4 | `*_pricing` クリック → `*_checkout` クリック → `purchase` の段階減衰 | どこで落ちるか |
| 5 | `purchase` 件数（GA）と Stripe 実績の差 | GAP-3 の取りこぼし幅を把握 |

> 注: 先行指標（X フォロワー・GSC 表示/順位・note PV）は GA 外。playbook Part 5 の表で別途週次記録。

---

## 5. 2週間ベースライン → 判断ルール

**フェーズ0（今週〜来週）: GAP-1 を塞いでから計測開始**
UTM が無いまま2週間貯めても流入元が分離できず無価値。**先に GAP-1（UTM）を実装**し、それから計測を回す。

**フェーズ1（UTM 投入後の2週間）: ベースライン収集**
- 何も施策を増やさず、reply-first だけ継続して2週間データを取る
- 取るもの: 流入元別セッション、流入元別 `cta_click`、流入元別 `purchase`

**判断ルール（2週間後）:**
- X(social) 経由セッションが organic search を上回る → reply-first が効いている。継続＋強化
- organic search が伸びている → SEO 施策（playbook S2/S4）にリソース寄せる
- どちらも横ばい → 流入の絶対量が足りない。配信チャネル（note/Discord）を1つ増やす
- `*_pricing` クリックはあるが `purchase` が0 → 課金導線でなくオファー（価格・無料体験訴求）の問題。LP コピーを見直す

---

## 6. Codex 向け spec 候補

| spec 案 | 対応 GAP | 内容 | 優先 |
|---------|---------|------|------|
| `specs/feat-utm-attribution.md` | GAP-1 | `lib/x/` の URL に `utm_source=x&utm_medium=social&utm_campaign=<preview\|recap>` を付与。note 用 UTM の規約も定義。GA4 で channel group が分離されることを完了条件に | **最優先** |
| `specs/feat-paywall-impression-event.md` | GAP-2 | ペイウォール／ロックブロック表示時に `paywall_view`（`match_id`, `content_type`）を1回発火。CTR の分母を作る | 高 |
| `specs/feat-signup-trial-events.md` | GAP-4 | サインアップ完了で `sign_up`、無料トライアル開始で `trial_start` を発火 | 中 |
| （GAP-3） | GAP-3 | Stripe webhook → GA4 Measurement Protocol でサーバー側 `purchase` を補完。コスト高め、当面は Stripe 実績を真とし保留 | 低 |

---

## 7. Owner 判断事項
1. UTM 規約: `utm_campaign` を試合単位（match_id）まで細かくするか、コンテンツ種別（preview/recap）止まりにするか
2. note の UTM: 手動付与（Owner）か、note 記事テンプレに固定で埋め込むか
3. GA4 のレポート: 探索レポートを都度作るか、Looker Studio で固定ダッシュボードを作るか（後者は別途構築コスト）

## データ出典メモ
- イベント名・`cta_id`: `grep` による実コード確認（`lib/analytics.ts`, `components/*`, `app/*`）
- URL 構造: `lib/x/post.ts:248`（UTM なしを確認）
- GA4 設定: `app/layout.tsx`（`NEXT_PUBLIC_GA_MEASUREMENT_ID`）
