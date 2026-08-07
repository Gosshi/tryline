# 規約違反ドメイン由来の sourced facts の除去と許可リストの是正

## 背景

2026-08-07、許可ドメインの拡大可否を調べるため既存13ドメインを1件ずつ精査したところ、2つの問題が判明した。

### 問題1: 除外済みドメインのデータが DB に残り、いまも記事生成に使われている

`fix-sourced-facts-allowlist-compliance.md` と `fix-sourced-facts-allowlist-robots-txt-gptbot.md` は、利用規約違反および robots.txt の GPTBot ブロックを理由に複数ドメインを許可リストから除外した。しかし**除外したのは新規収集だけで、既存行を削除していない**。前者の対象外にも「既に `match_sourced_facts` テーブルに保存済みの、削除対象ドメイン由来の行のデータ削除（遡及的なクリーンアップは別途 Owner 判断）」と明記されており、本 spec がその積み残しにあたる。

パイプラインは `match_sourced_facts` を `match_id` で読み出し、読み出し時にドメインで絞り込まない。許可判定は書き込み時にしか働かないため、**除外済みドメイン由来の事実が現在も記事生成の材料として使われ続けている**。再生成を行うたびに、規約が禁じているコンテンツ由来の情報が記事に流れ込む。

2026-08-07 時点の実測では、`match_sourced_facts` 全154件のうち **114件（74%）が除外済みドメイン由来**である。

| ドメイン | 件数 | 除外理由 |
|---|---:|---|
| `rugbypass.com` | 47 | 規約で AI 訓練・データマイニング禁止 |
| `skysports.com` | 36 | robots.txt で GPTBot を `Disallow: /` |
| `planetrugby.com` | 13 | 規約違反 |
| `bbc.co.uk` | 7 | 規約違反 |
| `espn.com` | 5 | 規約違反 |
| `news.yahoo.co.jp` | 3 | robots.txt で GPTBot ブロック |
| `nbcsports.com` | 2 | 規約違反 |
| `sports.yahoo.com` | 1 | 規約違反 |

### 問題2: 許可リストに残っている3ドメインが規約違反だった

過去の監査はキーワードに `spider` を含めておらず、また規約ページの URL をパス推測で探していたため到達できていなかった。今回はレンダリング後のページからリンクを抽出する方式に変え、実際の規約本文を確認した。

| ドメイン | 該当条項 |
|---|---|
| `englandrugby.com` | 「**No text or data mining, or web scraping**」という見出しを立て、「You shall not conduct, facilitate, authorise or permit any text or data mining or web scraping in relation to our website」と明示（`/the-rfu/policies/website-terms-of-use`） |
| `allblacks.com` | 「you agree not to reproduce, link to, **scrape**, modify...」＋利用許諾が「solely for your **personal, non-commercial use**」に限定（`/terms`） |
| `lnr.fr` | 「サイトにアクセスする際に提供されたインターフェース以外の方法でアクセスすることは禁止」＋複製は「usage personnel et strictement privé」に限定（`/mentions-legales`） |

これら3件の現存データは `allblacks.com` 3件・`englandrugby.com` 1件・`lnr.fr` 0件と少なく、除去の実損は小さい。

### 監査で分かった構造

英国・ニュージーランド・フランス系のラグビー統括団体は、`spider` / `scraping` / `text and data mining` を明示禁止する共通の法務テンプレートを使っている（World Rugby・スコットランド協会・ウェールズ協会・イングランド協会・オールブラックス・LNR の6件で確認）。**「公式サイトだから安全」という前提は成り立たない。**

一方で `rugby.com.au`・`unitedrugby.com`・`league-one.jp`・`rugby-rp.com`・`rugbyasia247.com` には該当条項がなく、これらは維持できる。

## スコープ

対象:
- 規約違反3ドメインを `SOURCED_FACT_ALLOWED_DOMAINS` から除去する
- 除外済み全ドメイン由来の既存 `match_sourced_facts` 行を削除する
- 読み出し時にも許可ドメインで絞り込み、将来同じ乖離が起きないようにする

対象外:
- 新規ドメインの追加（監査の結果、追加できる候補が見つからなかった。代替供給源は別 spec）
- 灰色判定ドメイン（`rugby-japan.jp`・`premiershiprugby.com`・`super.rugby`・`onrugby.it`・`therugbypaper.co.uk`）の扱い（未解決の質問へ）
- 削除対象の事実を使って生成された既存記事の再生成・取り下げ（未解決の質問へ）
- プレビュー・レビューのプロンプト、生成ロジック、QA の変更

## データモデル変更

**スキーマ変更なし。マイグレーション不要。** `match_sourced_facts` からの行削除のみ。

削除は `DELETE FROM` を伴うため、**Claude Code は実行しない**。Owner 自身が実行するか、スクリプトとして実装したうえで Owner が起動する（CLAUDE.md の危険コマンド規約）。

## API サーフェス

### 1. 許可リストの是正

`lib/llm/sourced-facts/allowlist.ts` の `OFFICIAL_DOMAINS` から次を削除する。

- `englandrugby.com`
- `allblacks.com`
- `lnr.fr`

### 2. 読み出し時のフィルタ

`match_sourced_facts` を記事生成のために読み出す箇所で、`source_domain` が現在の許可リストに含まれる行のみを使うようにする。書き込み時のみの検査だと、許可リストを縮めても過去のデータが残り続けるという今回の問題が再発する。

除外された行があった場合は件数をログに出す。

### 3. 既存データの削除スクリプト

`scripts/` に、許可リストに含まれない `source_domain` を持つ `match_sourced_facts` 行を削除するスクリプトを追加する。

- `--dry-run` を既定とし、削除対象の件数をドメイン別に表示する
- 実削除には明示的なフラグを要求する（既存の `scripts/regenerate-overseas-content.ts` の `--confirm-owner-approved` と同じ形）
- 許可リストを唯一の判定基準とし、削除対象ドメインをスクリプト内にハードコードしない

## UI サーフェス

なし。

## LLM 連携

なし。本 spec はデータの適合性のみを扱う。

## 受け入れ条件

1. `SOURCED_FACT_ALLOWED_DOMAINS` に `englandrugby.com`・`allblacks.com`・`lnr.fr` が含まれない。
2. 上記3ドメインが `isAllowedSourcedFactDomain` で `false` を返すネガティブテストがある。
3. 記事生成のための読み出し経路で、許可リスト外の `source_domain` を持つ行が使われない。テストで検証されている。
4. 除外された行がある場合、件数がログに出る。
5. 削除スクリプトが `--dry-run` を既定とし、ドメイン別の削除対象件数を表示する。
6. 削除スクリプトの判定基準が `SOURCED_FACT_ALLOWED_DOMAINS` であり、対象ドメインがハードコードされていない。許可リストを1件増減させると削除対象も変わることをテストで担保する。
7. サブドメインが正しく扱われる（`en.rugby-japan.jp` は `rugby-japan.jp` が許可されていれば残る。`stats.unitedrugby.com` も同様）。
8. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean。

## 未解決の質問

1. **灰色判定5ドメインをどうするか。** `rugby-japan.jp` は規約が「使用には事前に当協会の許諾を必要とします」と包括的な許諾を要求し、営利目的の行為を禁じている。自動収集の明示禁止ではないが、厳しく読めば該当する。しかも現在最大の供給源（16件）で、外すと日本代表戦の材料がほぼ失われる。`premiershiprugby.com`・`super.rugby`・`onrugby.it`・`therugbypaper.co.uk` は規約本文を取得できず未確定。Owner 判断が要る。

2. **削除対象の事実を使って生成された既存記事をどうするか。** 114件の事実は既に公開済みの記事に反映されている可能性がある。再生成すると材料が減って記事が薄くなり、取り下げれば公開コンテンツが消える。実務的には「今後は使わない」で足りるかもしれないが、判断が要る。

3. **`en.wikipedia.org` が9件存在する。** 許可リストに含まれないのに収集されている。経路の確認が必要。ただし Wikipedia は CC BY-SA で、ライセンス上は最も安全な供給源になりうる。別 spec で正式な供給源として追加する価値がある。

4. **本 spec の実施後、材料はさらに枯渇する。** 154件から40件程度に減る見込みで、プレビューの薄さは悪化する。ラインナップ・試合イベント・Wikipedia など、規約の制約を受けない材料への転換が別途必要になる。
