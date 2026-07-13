# recap の選手別統計QAガードがカタカナ表記とmatch_eventsのローマ字表記を照合できず偽陽性でrejectする不具合を修正

## 背景

`feat-recap-player-stat-verification.md`（PR実装済み）で導入された選手別統計の決定的照合ガードが、2026-07-12 の Nations Championship Round 2 recap 生成で**構造的な偽陽性**を起こしていることが判明した（本番調査で確認済み）。

**再現した実例**:
- `日本 20-36 アイルランド`（match_id: `d9f72ea3-17da-4eac-b20d-c6bfe0f185b4`）: recap本文「フローリーはコンバージョンを3本成功させ」。`match_events` を実際に集計すると Frawley（Ireland、9分・34分・50分）は実際にコンバージョン3本成功しており本文は完全に正しい。にもかかわらず `PLAYER_STAT_MISMATCH_ISSUE` が発生し `factual_grounding: 1` で reject された
- `オーストラリア 26-42 フランス`（match_id: `1acc900f-d1aa-4b94-90f2-0aa7c8fe93ea`）: 同様に得点内訳・分刻みの試合展開・「直近5試合平均41.4点」という集計統計まで全て実データと一致していたが、同じ issue で reject された

いずれも Owner とClaude Codeで本文を手動で match_events・過去5試合の実スコアと突き合わせ、事実誤認が無いことを確認した上で `status: published` に手動更新した（応急処置）。

**根本原因**: `lib/stats/player-stats.ts` の選手名照合が**文字体系（スクリプト）をまたいだ比較に対応していない**。

```ts
export function normalizePlayerNameForStatMatch(name: string): string {
  return name.replace(/[・.．'\s-]+/g, "").trim().toLocaleLowerCase();
}
```

- QAステージがrecap本文（日本語）から抽出する `statedPlayerStats[].playerName` は、本文中の表記どおり**カタカナ**（例:「フローリー」「ルク」）
- `match_events.metadata.player_name`（`buildPlayerStatsFromEvents` が読む実データ）は**英語のローマ字表記**（例: `"Frawley"`, `"Lucu"`）
- `normalizePlayerNameForStatMatch` は記号除去・小文字化のみで、カタカナ→ローマ字変換を一切行わない。したがって `"ふろーりー"` と `"frawley"` は**構造的に絶対一致しない**
- `findActualPlayerStats`（`lib/stats/player-stats.ts:83-94`）が `null` を返し、`lib/llm/stages/qa.ts:373-388` の `hasMismatch` が常に `true` になり、たとえ本文の数値主張が100%正しくても reject される

**なぜ今まで気づかなかったか**: `feat-recap-player-stat-verification.md` の受け入れ条件8で追加されたテスト（`tests/llm/stages/qa.test.ts` 491-537行目、539-582行目）は、いずれも**実際に矛盾があるべき（true positive）ケースのみ**を検証しており、「カタカナ表記の主張が正しいmatch_eventsと一致する（true negative、issueが出ないべき）」ケースが一件もテストされていなかった。539行目のテストは `playerName: "バートン"` とカタカナを使っているが、これは「バートンという選手のイベントが一件も存在しない」ケースであり、カタカナ↔ローマ字の変換可否は検証していない。

## スコープ

対象:
- QAステージが選手別統計を照合する際、**日本語（カタカナ）で書かれた選手名と英語（ローマ字）の `match_events.metadata.player_name` を正しく紐付けられる**ようにする
- 推奨する実装方針（後述）を採用する場合は `lib/llm/prompts/qa-content.ts` の `playerStatCheckBlock` と `buildQaContentPrompt` の引数を拡張する
- 修正後、日本戦・フランス戦（上記2件）を再現するテストケースで、正しい主張が reject されないことを確認する

対象外:
- 汎用的なローマ字↔カタカナ変換ライブラリの導入・大会横断チーム名マップ（`lib/format/japanese-names.ts`）の拡張。本 spec は選手名の照合ロジックに閉じる
- 人名グラウンディングゲート（`lib/llm/stages/verify-entities.ts`）自体の変更。役割分担を維持する（グラウンディングゲートは実在性、本ガードは統計の正確性を担当）
- 過去に誤って reject/draft のまま放置されている recap の一括洗い出し・再生成。本 spec はロジック修正のみを対象とし、既存コンテンツへの対応（見直し・再生成）は修正後に `content-qa` → `content-regen` の手順で別途行う（試し焼き必須）
- `players` テーブルへの日本語名カラム追加等のデータモデル変更

## データモデル変更

なし。

## API サーフェス

なし（LLMステージ内部の処理変更のみ）。

## 実装方針（推奨。詳細実装は Codex 判断）

汎用的なカタカナ→ローマ字の音写変換をコード側で実装するのは、外国人選手名の音写に一貫した規則性がなく（例: `Ntamack`→「ンタマック」、`O'Toole`→「オトゥール」）、精度・保守性の面で望ましくない。代わりに、**QAステージのLLM自身に英語表記への解決を担わせる**方式を推奨する:

1. `buildQaContentPrompt`（`lib/llm/prompts/qa-content.ts`）に、当該試合の `match_events` から得られる実際の得点者名一覧（英語表記、重複排除）を渡せるようにシグネチャを拡張する
2. `playerStatCheckBlock` の指示文を変更し、「本文中でカタカナ等の日本語表記で言及されている選手であっても、`statedPlayerStats[].playerName` には対応する英語表記（以下の実際の得点者一覧の中から選ぶこと）を出力すること。一覧のどの選手にも対応しないと判断した場合はその主張を含めないこと」という趣旨を追加する
3. `lib/llm/stages/qa.ts` 側で `evaluateNarrativeQuality` の呼び出し元（`assemble`/`generate` ステージ）から実際の得点者名一覧を渡せるようにする（既に `matchEvents` は渡されているため、そこから `buildPlayerStatsFromEvents` 相当で一覧を作れる）
4. `lib/stats/player-stats.ts` の決定的照合ロジック（`playerNamesLikelyMatch` 等）自体は変更不要（LLMが正しい英語表記を返せば既存の照合はそのまま機能する）想定だが、防御的に多少の表記揺れ（ミドルネーム省略等）を吸収する調整が必要であれば Codex の判断で行ってよい

この方針以外に、Codex がより保守性の高い代替案（例: 決定的な音写ライブラリの導入）を提案する場合は、理由とともに完了報告に明記すること。

## 受け入れ条件

1. `tests/llm/stages/qa.test.ts` に、カタカナ表記の選手名（例:「フローリー」）で正しい統計主張をした場合に `PLAYER_STAT_MISMATCH_ISSUE` が発生せず `verdict` が `publish` 相当になることを検証するテストを追加する（`d9f72ea3` の Frawley 3コンバージョンのケースを再現）
2. 既存のtrue-positiveテスト（491-537行目のマツナガ数値不一致ケース、539-582行目のバートン架空選手ケース）が引き続き issue を検出することを確認する（回帰なし）
3. `tests/llm/prompts/qa-content.test.ts` に、`playerStatCheckBlock` が実際の得点者名一覧をプロンプトに含めることを検証するテストを追加する
4. QAステージのLLM呼び出し回数が変更前後で変わらない（新規LLM呼び出しは追加しない。既存呼び出しのプロンプト拡張のみ）
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
6. 完了報告に、日本戦(`d9f72ea3-17da-4eac-b20d-c6bfe0f185b4`)・フランス戦(`1acc900f-d1aa-4b94-90f2-0aa7c8fe93ea`)の2件が既に手動で `published` に修正済みであることを踏まえ、再生成や既存コンテンツへの影響は本 spec のスコープ外である旨を明記する

## 未解決の質問

- 得点者名一覧をプロンプトに含めることで入力トークン数がわずかに増える（1試合あたり数十選手分程度）。コスト影響は軽微と想定されるが、Codex は実装後に概算トークン増分を完了報告に記載すること
- 過去に本バグの影響で不当に reject/draft のまま止まっている recap がどの程度あるかは未調査。修正後、`content-qa` スキルで対象範囲を洗い出すかは Owner が別途判断する
- `lib/stats/player-stats.ts` の `playerNamesLikelyMatch` を将来的に多言語対応させる必要が他の箇所（entity grounding gate 等）にもあるかは、本 spec の範囲外だが横展開の要否を Owner に確認したい
