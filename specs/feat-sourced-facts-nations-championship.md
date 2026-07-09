# Nations Championshipにsourced_factsを拡大し、前回対戦の劇的な文脈を拾えるようにする

## 背景

2026-07-09、プレビュー生成の字数不足調査から、「スタメンではなく、プレビュー/レビューで使える情報・スタッツそのものを増やしたい」という要望が出た。具体例: 「前回のワラビーズはさよならPGを外してしまった」のような、試合の劇的な結末。

この種の情報は `match_events` には原理的に存在しない。`match_events` は**成功した得点イベントのみ**を記録しており、外したキック・惜しいプレー等の失敗イベントは記録されない。したがって、DBの構造化データをいくら増やしても拾えず、実際の試合レポート記事（成功も失敗も書かれている自然文）からの事実抽出が必要になる。

Tryline には既にこの仕組みが存在する: `lib/llm/sourced-facts/`（OpenAI `gpt-4o` + `web_search_preview` ツールによるWeb検索 + ドメイン許可リストによるフィルタ + `match_sourced_facts` テーブルへの24〜72時間キャッシュ）。許可ドメインリスト（`lib/llm/sourced-facts/allowlist.ts` の `SOURCED_FACT_ALLOWED_DOMAINS`）は `world.rugby`・`bbc.com`・`rugbypass.com`・`planetrugby.com`・`rugbychampionship.com` 等、既に国際ラグビー全般をカバーする汎用的な構成になっている。

しかし `isSourcedFactsEnabledForMatch()`（`lib/llm/sourced-facts/fetch.ts:76`）は `family === "league-one"` またはノックアウトラウンド（final/semi/quarter/playoff）のみを対象としており、**Nations Championshipのレギュラーラウンド（決勝以外）は対象外**になっている。つまり許可リストやWeb検索の基盤は既にNations Championshipで使える状態にあるのに、ゲート関数1つが門前払いしている状態。

本番DB実測: Nations Championship 2026シーズンは全36試合（2026-07-09時点で6試合終了）。

## スコープ

対象:
- `isSourcedFactsEnabledForMatch()` を拡張し、`family === "nations-championship"` を有効化する（ラウンド問わず全試合）
- プレビュー用の検索意図（`buildSearchPrompt` の `contentType !== "recap"` 分岐、`lib/llm/sourced-facts/fetch.ts:142-150`）に、「両チームの前回対戦がどう終わったか（僅差の決着・終盤の逆転・印象的な個人プレー等）」を検索する意図を追加する。ただしスコアや対戦日付自体は `matches`/`recent_form` テーブルがDB権威データとして既に持っているため、**スコア・日付そのものの再掲は求めず、スコアだけでは分からない文脈・ドラマ性に限定**するよう明記する
- `lib/llm/sourced-facts/allowlist.ts` の `RELATIVE_RECENCY_PATTERN` によるリジェクトロジックを見直す。現状はこのパターンにマッチする事実（"previous meeting" 等の表現を含むもの）を無条件でリジェクトしているが、これは「前回対戦の劇的な文脈」という今回欲しい情報も巻き込んで誤って弾いてしまう可能性がある。**スコアパターン（`SCORE_PATTERN`）を伴わない、純粋な文脈・ドラマ性の事実は許可し、スコア・日付の再掲を伴う事実のみリジェクトする**よう調整する（具体例は下記「実装詳細」参照）

対象外:
- Nations Championship以外の国際大会（Rugby Championship・Autumn Nations・Six Nations等）への拡大。本spec検証後の別specの候補とする
- `match_sourced_facts` テーブルのスキーマ変更
- 許可ドメインリストへの新規ドメイン追加（`nationschampionshiprugby.com` は robots.txt 確認が取れなかったため対象外。既存の `bbc.com`・`rugbypass.com`・`planetrugby.com`・`world.rugby` で十分カバーできる想定）
- レビュー（recap）用検索意図の変更（既存のスタッツ・MOM・怪我情報の検索意図で適切なため変更不要）

## データモデル変更

なし（既存 `match_sourced_facts` テーブルをそのまま使用）。

## API サーフェス

なし。既存の `lib/cron/orchestrate.ts` の `fetchSourcedFacts` 呼び出し経路（268行目: preview、287行目: recap）がそのまま対象試合を拾うようになる。

## LLM 連携

- 使用モデル: 既存の `MODELS.WEB_SEARCH`（`gpt-4o`、`lib/llm/models.ts` で集中管理、変更不要）
- **コスト見積もり**: Nations Championship 2026シーズン全36試合 × 最大2回（preview + recap、24〜72時間キャッシュあり） = 最大72回のWeb検索LLM呼び出し。シーズン全体で **$5〜8程度**の見込み（1回あたり概算 $0.07〜0.11: `web_search_preview` ツール利用料 + gpt-4oのトークン費用）

## 実装詳細

### 1. `isSourcedFactsEnabledForMatch` の拡張

```
family === "league-one" → true（既存）
family === "nations-championship" → true（新規追加）
knockout系ラウンド → true（既存、変更なし）
```

### 2. プレビュー検索意図への追加

`lib/llm/sourced-facts/fetch.ts:142-150` の配列に以下を追加する:

```
"- how the previous meeting between these two teams ended, focusing on narrative details a bare scoreline would not capture (e.g., a missed match-winning penalty, a last-minute momentum swing, a memorable individual play). Do NOT restate the final score or the date of that match — those are already known; only report contextual/dramatic details not captured by the score itself"
```

### 3. `RELATIVE_RECENCY_PATTERN` リジェクトロジックの調整

`lib/llm/sourced-facts/allowlist.ts` の `getDbAuthoritativeFactRejectionReason` を、以下の判定に変更する:
- `SCORE_PATTERN`（スコアらしき数字パターン）にマッチする事実 → 引き続きリジェクト（`db_authoritative_score`）
- `RELATIVE_RECENCY_PATTERN` にマッチし、かつ `SCORE_PATTERN` にもマッチする事実（例: 「前回対戦では45-21で勝利」） → リジェクト（`db_authoritative_relative_recency`）
- `RELATIVE_RECENCY_PATTERN` にマッチするが `SCORE_PATTERN` にはマッチしない事実（例: 「前回対戦では終了間際にペナルティゴールを外した」） → **許可する**（新しい振る舞い）

具体例（テストケースとして実装すること）:
- `"In their most recent meeting, South Africa won 45-21"` → リジェクト（スコアを含む）
- `"In their most recent meeting, the Wallabies missed a match-winning penalty in the final minute"` → 許可（スコアを含まない、ドラマ性のみ）
- `"The two sides last met in November 2025"` → リジェクト（日付情報、DB権威データと重複）

## 受け入れ条件

1. `isSourcedFactsEnabledForMatch()` に Nations Championship の試合（レギュラーラウンド含む）を渡すと `true` を返すユニットテストが追加されている
2. `getDbAuthoritativeFactRejectionReason`（または同等の判定ロジック）に対して、上記「実装詳細 3.」の3つの具体例をテストケースとして追加し、期待通りの許可/リジェクトになることを確認する
3. 実際のNations Championship試合1件（過去に終了した試合、例: 2026-07-04 South Africa vs England）に対して `node --env-file=.env.production.local tools/run-ts.cjs <検証スクリプトまたは既存cronルート>` を実行し、Web検索が実際に発火し、`match_sourced_facts` に結果が保存されることを確認する（保存された事実の内容も完了報告に記載する）
4. 既存の league-one・knockoutラウンドの sourced_facts 挙動に回帰がないことを確認する
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
6. 本spec自体はコード実装・個別確認までで完了とする。シーズン全36試合への一括適用（バックフィル的な再生成）は行わない。通常のプレビュー/レビュー生成サイクルが対象試合を自然に処理する

## 未解決の質問

- 検証で「スコアを含まないがDB権威データと重複する」ような境界ケース（例: 「先月対戦した」のような曖昧な時期表現）が見つかった場合の扱いは、Codexの実装時の判断に委ねる。迷う場合は完了報告で質問として提示する
- 他の国際大会（Rugby Championship・Autumn Nations・Six Nations）への拡大は、本spec検証後、コスト実績を見てOwnerが判断する
