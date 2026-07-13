# sourced_facts のキャッシュがプロンプトバージョン更新後も無効化されない不具合修正

## 背景

2026-07-13、日本 vs アイルランド戦（match_id: `d9f72ea3-17da-4eac-b20d-c6bfe0f185b4`）recapの再生成中、LLMが「反則なし」「クリーンなプレー」という捏造を繰り返した（`fix-recap-penalty-fabrication-qa-gap.md`参照）。調査の過程で、rugbypass.comから実際の反則数（日本9・アイルランド9、互角）を手動確認できたが、**この試合の`match_sourced_facts`には反則数のfactが一件も存在しなかった**。

`lib/llm/sourced-facts/fetch.ts`の`buildSearchPrompt()`（139行目）を確認すると、現在の`SEARCH_PROMPT_VERSION`（`"sourced-facts@1.3.0"`）は検索意図に明示的に**"penalty counts"を含んでいる**。つまりプロンプト上は反則数を取得しようとしているはずなのに、なぜこの試合では取れていなかったのか。

### 根本原因（特定済み）

`shouldUseCachedFacts()`（`fetch.ts` L96-123）:

```ts
function shouldUseCachedFacts(params: {...}): boolean {
  if (!params.fetchedAt) {
    return false;
  }

  if (params.contentType === "recap") {
    return true;  // ← 一度でも fetchedAt があれば、内容やプロンプトバージョンを問わず常にキャッシュ再利用
  }
  ...
}
```

日本vsアイルランド戦のsourced_factsは`metadata.prompt_version: "sourced-facts@1.2.0"`という**古いバージョン**で取得されていた（`prompt_version@1.2.0`時点ではおそらく反則数を明示的に要求していなかった、または要求していても取得できなかった）。しかし`contentType === "recap"`の場合、`shouldUseCachedFacts()`は`fetchedAt`が存在しさえすれば無条件で`true`を返すため、**プロンプトが`1.3.0`へアップグレードされ反則数を明示的に要求するようになった後も、この試合は古いバージョンで取得した不完全なキャッシュを使い続けていた**。

DB実測（2026-07-13時点）:
- `match_sourced_facts`に記録がある試合はDB全体でわずか17試合（recap用9件・preview用8件）
- うち`recap`用9件の内訳: `sourced-facts@1.1.0`が2件、`sourced-facts@1.2.0`が4件、`prompt_version`欠落（NULL、さらに古い形式）が3件
- **現行の`sourced-facts@1.3.0`で取得された recap 用 fact は0件**。つまり現状、recap生成に使われているsourced_factsは全件、最新プロンプトでは一度も再取得されていない

このバグは今回発覚した「反則」だけでなく、**将来`buildSearchPrompt()`に新しい検索意図（例: 負傷情報の粒度向上、新しい統計カテゴリ追加等）を追加しても、既存試合のrecapには一切反映されない**という構造的な問題を持つ。

## スコープ

対象:
- `lib/llm/sourced-facts/fetch.ts`の`shouldUseCachedFacts()`に、キャッシュされたfactの`prompt_version`が現行の`SEARCH_PROMPT_VERSION`と一致するかのチェックを追加する
- 一致しない場合は再取得（`force`相当の動作）する
- 既存の17試合（recap用9件・preview用8件）は、本修正のデプロイ後、該当試合のrecap/preview再生成時に自然に最新版へ移行する（本specでは強制バックフィルは行わない）

対象外:
- `isSourcedFactsEnabledForMatch()`の対象拡大（League One・ネーションズチャンピオンシップ・決勝/準決勝/準々決勝以外の通常シーズン戦への適用は、恒常的なLLM web検索コスト増を伴う別判断。本specでは扱わない。Owner判断が必要なら別途specを起票する）
- `PREVIEW_REFRESH_WINDOW_HOURS`・`PREVIEW_FRESHNESS_HOURS`など、previewの時間ベースキャッシュ失効ロジックの変更（現状維持）
- 過去17試合のsourced_facts一括再取得スクリプト（本specはロジック修正のみ。再取得は該当試合のcontent再生成時に自然発生させる）

## データモデル変更

なし（`match_sourced_facts.metadata.prompt_version`は既存のJSONBフィールドで新規カラム不要）。

## API サーフェス

なし（内部関数のロジック変更のみ）。

## LLM 連携

パイプライン: sourced-facts取得ステージ（`fetch.ts`）。

### 実装方針

`shouldUseCachedFacts()`の呼び出し元（`fetchSourcedFactsForMatch()`、L300-321）で、`cachedFacts`から`metadata.prompt_version`を読み取り、`SEARCH_PROMPT_VERSION`（現行値）と比較する処理を追加する:

```ts
// 概念コード（Codexが実装時に既存の型定義・命名規約に合わせて調整）
const cachedPromptVersion = cachedFacts[0]?.metadata?.prompt_version;
const isStalePromptVersion = cachedPromptVersion !== SEARCH_PROMPT_VERSION;

if (
  !options.force &&
  cachedFacts.length > 0 &&
  !isStalePromptVersion &&
  shouldUseCachedFacts({...})
) {
  // キャッシュ使用
}
// isStalePromptVersion が true なら再取得へフォールスルー
```

`shouldUseCachedFacts()`自体のシグネチャを変えるか、呼び出し元で事前にバージョン比較して結果をAND条件にするかはCodexの実装判断に委ねるが、**`contentType === "recap"`の無条件キャッシュ再利用という既存動作は、プロンプトバージョンが一致する場合のみ**に限定すること。

### コスト影響

- 新規LLM呼び出しの追加ではなく、**既存の再取得ロジック（`createWebSearchJsonResponse`、`MODELS.WEB_SEARCH`）を、より適切なタイミングで発火させるだけ**
- 影響範囲: 現在キャッシュされている17試合（recap 9件・preview 8件）が、次回のcontent再生成時に一度だけ再取得される。それ以降は`SEARCH_PROMPT_VERSION`が変わらない限り再取得は発生しない（無限ループや繰り返し課金にはならない）
- 単価は`lib/llm/pricing.ts`・`WEB_SEARCH`モデル（`gpt-4o`）のweb検索呼び出し1回分。17件全体の再取得が発生しても軽微

## 受け入れ条件

1. ユニットテスト（`tests/llm/sourced-facts.test.ts`の`describe("fetchSourcedFactsForMatch", ...)`ブロックに追加。既存テスト「uses cached facts without calling web search inside the freshness window」の近くに配置する）:
   - キャッシュされたfactの`metadata.prompt_version`が現行`SEARCH_PROMPT_VERSION`と**異なる**場合、`contentType: "recap"`でも`shouldUseCachedFacts`相当のロジックが`false`相当の挙動になる（再取得が発生する）ことを確認
   - **一致する**場合は、既存通りキャッシュが再利用されること（リグレッションなし）
   - `contentType: "preview"`の既存の時間ベースキャッシュ失効ロジック（`PREVIEW_REFRESH_WINDOW_HOURS`等）に変更がないこと
2. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通ること
3. 本spec自体は既存試合のsourced_facts再取得やrecap再生成を伴わない（自然発生に任せる）

## 未解決の質問

- `metadata.prompt_version`がNULL（さらに古い形式、DB実測で3件recap用に存在）の場合の扱い: 「バージョン不一致」として扱い再取得対象にするのが自然だが、Codex実装時に既存の型（`SourcedFact`/`StoredSourcedFact`、`lib/llm/sourced-facts/types.ts`）でNULL許容がどう扱われているか確認し、null安全に比較すること
- `isSourcedFactsEnabledForMatch()`の対象拡大（Premiership/URC/Top 14/SRP等の通常シーズン戦への適用）は、本spec適用後に効果測定（対象試合でsourced_factsが実際に反則数等を拾えているか）した上で、Owner判断で別specとして起票する候補
