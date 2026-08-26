# ニュースリンク収集の取りこぼしを直す

## 背景

`feat-news-link-digest.md`（PR #730）で収集機構を作り、2026-08-26 に本番で初回実行した。**動いたが、3つの欠陥が判明した。**

実行結果: `{"fetched":13,"matched":1,"notified":1,"status":"ok"}`

| ドメイン | フィード形式 | 実際に取れた | あるべき | 原因 |
|---|---|---:|---:|---|
| rnz.co.nz | RSS `<item>` | 12 | 12 | 正常 |
| **stuff.co.nz** | **Atom `<entry>`** | **0** | **30** | パーサが `<item>` しか見ていない |
| **nzherald.co.nz** | RSS `<item>` | **1** | 1 | **パーサは正常。フィード自体が1件しか返さない** |

さらに、**紐付けが13件中1件しか成立しなかった。**

### 本命の記事を取りこぼしている

RNZ から取得できていたのに紐付かなかった記事:

> `Springbok captain Siya Kolisi cleared to face All Blacks in second test` → `matched_match_id` が null

これは **8/30 の第2テストそのもの**を扱う記事で、この仕組みが最も拾うべきものである。

原因は、見出しが `Springbok` / `All Blacks` という**通称しか使っておらず**、`teams` にある `South Africa` / `New Zealand` を含まないこと。現行のフィルタは `teams.name` / `teams.english_name` の完全な部分一致に依存している（`lib/news-links.ts:83-94`）。

拾えた1件は、たまたま見出しに `Lions`（チーム名そのもの）が入っていたためで、しかも**既に終わった 8/25 の試合**に紐付いた。

Stuff の30件にも同種の記事が含まれている:

> `'Phenomenal': Flanker's red-hot performance blows All Blacks selection race wide open`

## スコープ

対象:
- `lib/news-links.ts` の `parseRss`（Atom 対応）
- `lib/news-links.ts` の `matchNewsLink`（通称辞書）
- `lib/news-links.ts` の `NEWS_FEEDS`（NZ Herald のフィード変更）
- 上記のテスト

対象外:
- **`news_links` のスキーマ変更**（不要）
- **設計の境界。** 記事本文の取得・保存・LLM への投入は引き続き行わない
- 収集した見出し・リンクをサイトに出すこと
- Discord 通知フォーマットの変更（**spec 2 が `match_id: <uuid>` の行に依存している**）
- 通知頻度の変更
- 新規ドメインの追加

## 1. Atom 形式に対応する

現行の実装は RSS 2.0 の `<item>` しか走査していない（`lib/news-links.ts:48-49`）。

```ts
export function parseRss(xml: string, sourceDomain: string): NewsLink[] {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap(
```

Atom には3つの差がある。**すべてに対応すること。**

| | RSS | Atom |
|---|---|---|
| 記事の要素 | `<item>` | **`<entry>`** |
| リンク | `<link>URL</link>`（テキストノード） | **`<link href="URL"/>`（属性）** |
| 日付 | `<pubDate>` | **`<published>` / `<updated>`** |

実データで確認済みの Atom の形（stuff.co.nz、2026-08-26）:

```xml
<link href="https://www.stuff.co.nz/sport/361024986/..."/>
<published>2026-08-26T00:00:00Z</published>
```

現行の `tag()` ヘルパ（`:41-46`）は開始タグと終了タグに挟まれたテキストを取る実装なので、**`<link href>` のような自己終了タグからは値を取れない**。属性値を取る処理を追加すること。

**RSS の既存動作を壊さないこと。** RNZ と NZ Herald は RSS で正常に動いている。

## 2. チームの通称辞書を追加する

`matchNewsLink`（`:83-94`）が `teams.name` / `teams.english_name` だけで照合しているため、通称で書かれた見出しを取りこぼす。

**チームスラッグに対する別名のリストを持つ。** DB のスキーマは変更せず、コード側の定数でよい。

最低限、以下を含めること（2026-08-26 時点で Tryline が扱う代表チーム）。

| slug | 通称 |
|---|---|
| `new-zealand` | All Blacks / All Black |
| `south-africa` | Springboks / Springbok / Boks |
| `australia` | Wallabies / Wallaby |
| `france` | Les Bleus |
| `argentina` | Pumas / Los Pumas |
| `italy` | Azzurri |
| `japan` | Brave Blossoms / ブレイブブロッサムズ |
| `fiji` | Flying Fijians |

**辞書に無いチームは従来どおり `teams` の名前だけで照合する。** 網羅を目的にせず、実際に見出しで使われる通称を入れる。

**単語境界に注意すること。** `All Black` が `All Blacks` にマッチするのは正しいが、部分一致の副作用で無関係な語を拾わないこと。特に `Boks` のような短い語は誤爆しやすい。

### 終わった試合に紐付けない

現行は「該当した試合のうちキックオフが最も近いもの」を選ぶが、**過去の試合も候補に含まれている**。実際に 8/25 の終わった試合に紐付いた。

**未来の試合を優先すること。** 未来の試合が該当すればその中で最も近いものを選び、未来が無い場合のみ直近の過去を選ぶ（試合直後のレビュー記事を拾うため）。

## 3. NZ Herald を Sport フィードに変更する

ラグビー専用フィードは**1記事しか返していない**（2026-08-26 実測）。より上位の Sport フィードに切り替える。

```
変更前: https://www.nzherald.co.nz/arc/outboundfeeds/rss/topic/rugby/?outputType=xml&_website=nzh
変更後: https://www.nzherald.co.nz/arc/outboundfeeds/rss/section/sport/?outputType=xml&_website=nzh
```

**Owner 判断（2026-08-26）**: ノイズは増えるが、フィルタが機械的に効くのでコストはほぼ変わらない（LLM に渡るのは該当したものだけ）。取りこぼしを減らす方を優先する。

**変更後の件数を実測し、PR 本文に記載すること。** Sport フィードも少なければ、NZ Herald 自体の要否を再検討する材料になる。

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

なし

## LLM 連携

変更なし。**LLM に渡るのは引き続き見出し1行のみ。**

## 受け入れ条件

1. `parseRss` が Atom（`<entry>`）を解析でき、`stuff.co.nz` のフィードから **20件以上**取得できる
2. Atom の `<link href="...">` からリンクを取得できる
3. Atom の `<published>` / `<updated>` から日時を取得できる
4. **RSS の既存動作が壊れていない。** `rnz.co.nz` から従来どおり取得できる
5. `Springbok captain Siya Kolisi cleared to face All Blacks in second test` が **8/30 の南アフリカ×ニュージーランド戦に紐付く**（実データでの検証）
6. `All Blacks` / `Springboks` / `Wallabies` を含む見出しが正しく紐付く
7. 通称辞書に無いチームは、従来どおり `teams` の名前で照合される
8. **未来の試合が優先される。** 未来と過去の両方が該当する場合、未来のうち最も近い試合が選ばれる
9. 未来の試合が該当しない場合のみ、直近の過去の試合に紐付く
10. NZ Herald が Sport フィードを参照し、**実測件数が PR 本文に記載されている**
11. Discord 通知フォーマットが変わっていない（**末尾の `match_id: <uuid>` の行を含む**）
12. `news_links` のスキーマに差分が無い
13. 記事本文・要約を取得・保存・LLM へ投入していない
14. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean

## 未解決の質問

- **通称辞書の保守。** チーム構成が変わるたびに手で足す必要がある。将来 Wikipedia 等から機械生成する余地はあるが、現時点では十数件なので手書きで足りる
- **NZ Herald の Sport フィードでも件数が少ない場合。** 実測して判断する。少なければ NZ Herald を外し、RNZ と Stuff の2本に絞る選択肢がある
- **誤爆の実績。** `Boks` のような短い通称や、`Lions`（ブリティッシュ&アイリッシュ・ライオンズ／URC のライオンズ／NRL のライオンズ）のような多義語で誤った紐付けが起きる可能性がある。**運用して実績を見る**
