# Codex 指示: sourced facts の許可ドメインに springboks.rugby を追加

## 仕様書

`specs/feat-add-springboks-sourced-fact-domain.md` を読んでから着手すること。以下は補足であり、仕様の置き換えではない。

## やること（一文）

`lib/llm/sourced-facts/allowlist.ts` の **`OFFICIAL_DOMAINS` に `springboks.rugby` を 1 件足す。それだけ。**

## なぜ

2026-08-23 から南アフリカ vs ニュージーランドの 4 テストシリーズ（全 8 試合、9/13 まで）が始まる。しかし**許可ドメイン 11 件に両国の情報源が 1 つも無い。**

終了済み 3 試合で実際に採用されたのは `en.wikipedia.org` / `rugby-rp.com` / `stats.unitedrugby.com` / **`rugby.com.au`**。南アフリカ vs ニュージーランドの試合に**オーストラリア協会のサイト**が引かれている。引ける先が他に無いため。

## allblacks.com は追加してはいけない

**NZ 側も足したくなるが、`allblacks.com` は不可。** 2026-08-18 に利用規約を確認したところ、こうなっている。

> ...solely for your **personal, non-commercial use**

> you agree not to reproduce, **link to (via hyperlinks or otherwise)**, **scrape**, modify, ... or create derivative works of the Website

**`scrape` が名指しで禁止**され、商用利用も不可、リンクすら禁止。**robots.txt はクリーンだったが規約が禁じている。**

**robots.txt だけを見て判断しないこと。**

## springboks.rugby の確認結果（2026-08-18）

- **robots.txt**: `User-agent: *` / `Disallow: /admin` のみ。記事ページは許可。GPTBot / CCBot / anthropic-ai / ClaudeBot への個別規制なし
- **利用規約**: **存在しない。** フッターに法務リンクが無く、表示は `© 2026 SOUTH AFRICAN RUGBY | PICTURES © GALLO IMAGES` のみ

## 先に実読すべきファイル

| ファイル | 何を確認するか |
|---|---|
| `lib/llm/sourced-facts/allowlist.ts:8-15` | `OFFICIAL_DOMAINS`。ここに足す |
| 同 `:17-23` | `MEDIA_DOMAINS`。**触らない** |
| 同 `:35-37` | `stripLeadingWww`。`www.` 付き URL の扱い |
| 同 `:78` | `isOfficialDomain`。OFFICIAL に入れると判定が変わる |

## 絶対にやってはいけないこと

1. **`allblacks.com` を追加しない**（上記の理由）
2. **既存 11 ドメインを削除・変更しない。** 2026-08-18 の監査で実使用 7 件すべてが基準をクリア済み
3. **`MEDIA_DOMAINS` に入れない。** 協会公式なので `OFFICIAL_DOMAINS`
4. **`www.springboks.rugby` として登録しない。** `www.` なしの `springboks.rugby`（`https://www.springboks.rugby` は `http://springboks.rugby` へ 301 する）
5. `fetch.ts` の取得ロジック・プロンプトを変更しない
6. 許可ドメインを DB 管理へ移さない
7. 未監査の 3 件（`premiershiprugby.com` / `super.rugby` / `rugbyasia247.com`）に手を付けない。**Owner 判断で後回しと決定済み**

## テストで押さえる点

- `springboks.rugby` の URL が許可される
- **`www.springboks.rugby` の URL も許可される**（`stripLeadingWww` の既存挙動を実読して確認してから書くこと）
- **`allblacks.com` が拒否される**（誤って追加していないことの回帰テスト）
- 既存の許可済みドメインが従来どおり許可される
- 未許可ドメイン（`example.com` 等）が従来どおり拒否される

## 完了の定義

- `specs/feat-add-springboks-sourced-fact-domain.md` の受け入れ条件 1〜8 を満たす
- 変更ファイル: `lib/llm/sourced-facts/allowlist.ts` と対応するテスト
- `pnpm test` と型チェックが green
- **本番での収集実行はしない。** 受け入れ条件 9・10 は Owner が行う
- PR 本文に、`OFFICIAL_DOMAINS` に入れた理由（協会公式であること）を 1 行書くこと
