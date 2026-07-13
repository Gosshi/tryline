# sourced_facts の検索意図にカード・退場等の試合中インシデントを追加する

## 背景

2026-07-11 のフィジー vs イングランド戦（match_id: `8f6999d0-7827-4856-95c1-ac63d063b7b4`）で、フィジーのSH（スクラムハーフ）シミオネ・クルヴォリが前半終了間際にレッドカードで退場していたことが判明した（Owner確認）。この事実は recap に一切反映されていなかった。

**原因の切り分け**: Wikipedia側（`2026_Nations_Championship_Southern_Hemisphere_Series`）のrugbyboxテンプレートにはこの試合に「Red card:」等のカード欄自体が存在せず（本文確認済み）、`match_events` にカード情報が無いのは構造的にやむを得ない（ソース側の欠落）。

一方、この試合の `match_sourced_facts` 生成に実際に使われたレポート記事（`https://www.rugbypass.com/news/henry-pollock-scores-hat-trick-as-england-end-losing-run-with-demolition-of-fiji/`、Wikipediaのrugbyboxが参照する公式レポートURL）を直接確認したところ、同ページ内に **「Fiji's Simione Kuruvoli gets rare permanent red card for 'pretty disgusting' act」という関連記事見出しが存在**していた（本文確認済み）。つまり**情報はsourced_facts取得に使われるのと同じ情報源の射程内に存在していたが、抽出されなかった**。

`lib/llm/sourced-facts/fetch.ts` の `buildSearchPrompt()`（125-185行目）を確認したところ、recap向けの検索意図（`searchIntent`, 136-144行目）は次のカテゴリのみを明示的に指示している:

```
- official post-match statistics: possession %, territory %, tackle counts, carries, metres gained, lineout/scrum success, turnovers, penalty counts
- the official Player of the Match / Man of the Match award
- notable records or milestones set in this match
- significant injuries sustained during the match
- brief post-match comments from head coaches or captains
```

**カード・退場・出場停止に繋がるインシデントは検索意図に一切含まれていない**。Web検索ベースのLLM抽出はプロンプトが明示的に指示したカテゴリに強く引きずられるため、指示が無ければ情報源の射程内にあっても拾われない、というのが今回の欠落の直接原因と考えられる。

**League One の類似ケースとの違い**: `feat-league-one-substitutions-cards.md`（実装済み）は League One の構造化ソース（league-one.jp print ページ）に交代・カードの専用セクションがあるため、`match_events` への直接構造化取込で対応している。Nations Championship 等 Wikipedia 系大会はソース側にその構造が無いため、同じアプローチは使えない。本 spec は sourced_facts（Web検索・非構造化テキストからの事実抽出）という別レイヤーで同種の情報を拾う。

## スコープ

対象:
- `lib/llm/sourced-facts/fetch.ts` の `buildSearchPrompt()` の recap 用 `searchIntent`（136-144行目）に、カード・退場・出場停止等の試合中インシデントを検索対象カテゴリとして明示的に追加する
- 追加するカテゴリの例: イエロー/レッドカード（対象選手名・可能であれば分数）、シンビン、退場に伴う出場停止処分の発表（試合後に判明するもの含む）
- 既存の `contentTypeRules`（数値統計の表記ルール等、155-160行目）や confidence 判定ルール（170-179行目）は変更しない。新カテゴリも同じ confidence/出典ルールに従う

対象外:
- preview 用の `searchIntent`（145-154行目）の変更。カード情報は試合結果に付随する事後情報のため recap のみで十分（プレビュー時点では未発生）
- Wikipedia rugbybox パーサへのカード欄追加（対象試合のソース自体にカード欄が無いため、パーサ側での対応は不可能）
- League One の `match_events` 構造化カード取込との統合。役割分担を維持する（Wikipedia系はsourced_facts、League Oneはmatch_events）
- 過去に既に生成・公開済みのrecapへの遡及的な反映（本件のフィジー戦を含む）。本 spec は今後の生成に対する恒久対応のみを対象とし、既存コンテンツへの反映は別途 Owner が `content-regen` の手順で判断する

## データモデル変更

なし。既存の `match_sourced_facts` テーブル・スキーマをそのまま使う。

## API サーフェス

なし。

## LLM 連携

`lib/llm/sourced-facts/fetch.ts` の `fetchSourcedFactsForMatch()` が使う既存のWeb検索LLM呼び出し（`MODELS.WEB_SEARCH`、`createWebSearchJsonResponse`）のプロンプト文言を拡張するのみ。**新規LLM呼び出しは発生しない**（既存呼び出しの指示を1カテゴリ追加するだけ）。出力トークン数への影響は無視できる規模。

## 受け入れ条件

1. `buildSearchPrompt()` の recap 用 `searchIntent` に、カード・退場関連のインシデントを検索するカテゴリが追加されている
2. `tests/llm/sourced-facts/fetch.test.ts`（または相当する既存テストファイル）に、生成されたプロンプト文字列に新カテゴリの指示が含まれることを検証するテストを追加する
3. 既存のsourced_facts関連テスト（allowlist・confidence判定・DB権威スコープ除外等）が回帰しないことを確認する
4. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
5. 完了報告に、この変更が新規LLM呼び出しを追加しないこと（既存呼び出しのプロンプト拡張のみ）を明記する

## 未解決の質問

- 今回発見したフィジー戦のレッドカード事実を、この修正後に該当試合だけ手動でsourced_factsに追加・recap再生成するかは Owner 判断（本 spec のスコープ外）
- カード情報が「試合中に一時退出しただけ（シンビン→復帰）」なのか「永久退場」なのかの区別をLLMがどこまで正確に抽出できるかは実装後の実データで様子を見る必要がある。誤って軽微な事象を誇張しないよう、既存の「Do not invent, infer, or summarize unsupported claims」ルールの範囲内で十分と考えるが、Codex は実装時に必要であれば追加のルール文言を検討してよい
