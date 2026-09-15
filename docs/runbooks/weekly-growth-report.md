# 週次グロースレポート

毎週月曜 JST に、直近 7 日と前 7 日を同じ形式で比較する。raw 出力は `tmp/` にだけ置き、認証情報や API キーは読まない・記録しない。

## GA4

GA4 MCP の `run_report` で次を取得する。プロパティは `properties/538067713`。

- 全体: `sessions`、`activeUsers`、`engagedSessions`、`engagementRate`、`averageSessionDuration`
- 流入: `sessionSource` / `sessionMedium`、`landingPagePlusQueryString`、`deviceCategory`
- イベント: `cta_click`、`begin_checkout`、`trial_start`、`sign_up`、`newsletter_confirmed`、`paywall_view` の eventCount / activeUsers
- 分解: `cta_id`、`cta_location`、`paywall_location`、`viewer_type`、`is_sample`、`competition_slug`、`season`

| イベント | 意味 |
|---|---|
| `cta_click` | CTA を押した意図 |
| `begin_checkout` | 認証済みで Stripe Checkout POST を開始する直前 |
| `trial_start` | Checkout 成功後の無料トライアル開始 |
| `purchase` | 実売上の代用にしない。Stripe / Supabase が正 |

カスタムディメンションは登録日以後のイベントだけを評価する。

## Search Console

既存の read-only 手順（`docs/runbooks/gsc-analysis-setup.md`）に従い、ページ別 CTR を確認する。

```bash
node --env-file=.env.gsc.local tools/run-ts.cjs tools/gsc-pull.ts --range 28d --dims page
```

## Bing

既存の read-only 手順（`docs/runbooks/bing-analysis-setup.md`）に従う。

```bash
node --env-file=.env.bing.local tools/run-ts.cjs tools/bing-pull.ts --methods traffic,query,page
```

## 記録

`docs/growth-experiments.md` には、期間、比較期間、流入、検索 CTR、継続イベント、課金イベント、数値で支持される次の 1 施策だけを残す。母数が小さい場合は UI を連続変更せず「継続計測」とする。検索は絶対クリック数より CTR を中心に見て、試合数・大会開幕による変動と施策効果を混同しない。
