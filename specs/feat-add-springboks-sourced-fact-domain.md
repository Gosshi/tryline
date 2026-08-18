# sourced facts の許可ドメインに springboks.rugby を追加する

## 背景

2026-08-23〜09-13 に **南アフリカ vs ニュージーランドの 4 テストシリーズ**（Greatest Rivalry Tour 2026、全 8 試合）がある。

現在の許可ドメイン 11 件には、**南アフリカ・ニュージーランド両国の情報源が 1 つも無い**（`lib/llm/sourced-facts/allowlist.ts:8-23`）。

```
OFFICIAL: premiershiprugby.com(英) / unitedrugby.com / super.rugby
          league-one.jp(日) / rugby-japan.jp(日) / rugby.com.au(豪)
MEDIA:    rugbyasia247.com / rugby-rp.com / onrugby.it(伊)
          therugbypaper.co.uk(英) / wikipedia.org
```

### 実測（2026-08-18、本番 DB）

同シリーズで終了済みの 3 試合で実際に採用されたドメイン。

| 試合 | facts | 採用ドメイン |
|---|---|---|
| ストーマーズ vs NZ（8/7） | 13 | en.wikipedia.org, rugby-rp.com |
| シャークス vs NZ（8/11） | 5 | en.wikipedia.org, stats.unitedrugby.com |
| ブルズ vs NZ（8/15） | 11 | en.wikipedia.org, **rugby.com.au** |

**収集自体は動いている。**しかし Wikipedia 頼みで、南アフリカ vs ニュージーランドの試合に**オーストラリア協会のサイト**が引かれている。引ける先が他に無いためである。

## 事前監査の結果（2026-08-18 実施）

許可ドメイン追加にあたり、robots.txt **と利用規約の両方**を確認した。判定基準は Owner 決定により以下のとおり。

- **A 型（除外）**: 契約でスクレイピング等の**行為そのもの**を禁止しているもの。著作権と無関係に成立するため、事実抽出・書き直しでは解消しない
- **B 型（許容）**: **著作権に基づく**制限。事実は著作物でないため、Tryline の「事実を抽出し日本語で書き直し出典を明示する」運用で説明がつく

### `springboks.rugby`（南アフリカラグビー協会 公式）→ **追加可**

**robots.txt**

```
User-agent: *
Disallow: /admin
```

記事ページは許可。**GPTBot / CCBot / anthropic-ai / ClaudeBot への個別規制なし。**

**利用規約**

**存在しない。** フッターに法務リンクが無く、表示は著作権表示のみ。

```
© 2026 SOUTH AFRICAN RUGBY  |  PICTURES © GALLO IMAGES
```

privacy-policy ページからも利用規約へのリンクは無い。**A 型条項なし。**

### `allblacks.com`（ニュージーランドラグビー協会 公式）→ **追加不可**

robots.txt はクリーンだったが、**利用規約が A 型だった。**

> ...solely for your **personal, non-commercial use**

> you agree not to reproduce, **link to (via hyperlinks or otherwise)**, **scrape**, modify, rent, copy, lease, loan, sell, distribute, mirror, frame, syndicate, cache, store, record, publish, download, transmit, display or create derivative works of the Website

**`scrape` を名指しで禁止**しており、商用利用も不可、**ハイパーリンクを張ることすら禁じている。本 spec の対象から外す。**

> **教訓**: robots.txt がクリーンでも規約で禁止されている実例。**今後ドメインを追加する際は robots.txt だけで判断しないこと。**

## スコープ

対象:
- `lib/llm/sourced-facts/allowlist.ts` の `OFFICIAL_DOMAINS` に `springboks.rugby` を 1 件追加
- 対応するテスト

対象外:
- **`allblacks.com` の追加**（A 型のため不可。上記参照）
- **既存 11 ドメインの削除・変更**（2026-08-18 の監査で実使用 7 件すべてが A 型基準をクリア済み。触らない）
- 未監査の 3 件（`premiershiprugby.com` / `super.rugby` / `rugbyasia247.com`、いずれも使用実績 0）の扱い。**Owner 判断で後回しと決定済み**
- `MEDIA_DOMAINS` への追加
- `fetch.ts` の取得ロジック・プロンプトの変更
- 許可ドメインを DB 管理へ移すこと

## データモデル変更

**なし。** コード定数のみ。

## API サーフェス

**なし。**

## UI サーフェス

**なし。** ただし記事内の出典リンクとして表示されうる。

## LLM 連携

パイプライン **2 段階目の手前（sourced facts 収集）** に影響する。

`fetch.ts:244` が許可ドメイン一覧をプロンプトに埋め込む（`allowedDomains.join(", ")`）。**1 件増えてプロンプトがわずかに伸びるだけで、呼び出し回数は変わらない。**コスト増はほぼゼロ。

各国協会の**公式サイト**なので、`MEDIA_DOMAINS` ではなく **`OFFICIAL_DOMAINS`** に入れること（`isOfficialDomain`、`allowlist.ts:78` の判定に効く）。

## 受け入れ条件

1. `OFFICIAL_DOMAINS` に `springboks.rugby` が追加されている
2. **`www.` を付けずに** `springboks.rugby` として登録されている（`https://www.springboks.rugby` は `http://springboks.rugby` へ 301 する）
3. **既存 11 ドメインが 1 件も削除・変更されていない**
4. `MEDIA_DOMAINS` は変更されていない
5. **`allblacks.com` を追加していない**
6. ドメイン判定が `springboks.rugby` と `www.springboks.rugby` の両方の URL を許可する（`stripLeadingWww`、`allowlist.ts:35-37` の既存挙動を実読して確認すること）
7. 許可されていないドメイン（例: `example.com`、`allblacks.com`）が従来どおり拒否される
8. `pnpm test` と型チェックが通る

### 検証（Owner）

9. デプロイ後、`match_sourced_facts.source_domain` に `springboks.rugby` が現れるかを確認する
10. 現れなくても**ドメイン追加の失敗とは限らない**（LLM が引かなかっただけの可能性）。facts 件数と内容を併せて見る

## 未解決の質問

1. **ソースが南アフリカ側に偏る。** ニュージーランド側は `allblacks.com` が A 型で使えないため、オールブラックスの情報は Wikipedia 頼みのまま残る。**スプリングボクス視点に寄った事実が集まる可能性**があり、記事の中立性に影響しうる。運用しながら観測が必要
2. ニュージーランド側の代替ソース（`nzherald.co.nz` / `stuff.co.nz` 等のメディア）を探すかは別途判断。本 spec では扱わない
3. 未監査の 3 件（`premiershiprugby.com` / `super.rugby` / `rugbyasia247.com`）。**`premiershiprugby.com` はプレミアシップ開幕（9 月）までに監査しておきたい**。使用実績 0 は「使えない」ではなくオフシーズンのためとみられる
