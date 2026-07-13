# sourced_facts 取得対象を全大会・全試合に拡大

## 背景

`lib/llm/sourced-facts/fetch.ts`の`isSourcedFactsEnabledForMatch()`は現状、以下の試合にのみsourced_facts取得（LLM web検索によるポゼッション・タックル数・反則数・負傷・カード等の実データ取得）を許可している:

```ts
export function isSourcedFactsEnabledForMatch(match: MatchForSourcedFacts): boolean {
  const family = match.competition?.family;
  if (family === "league-one") return true;
  if (family === "nations-championship") return true;

  const roundName = getRoundName(match);
  return (
    roundName.includes("final") ||
    roundName.includes("semi") ||
    roundName.includes("quarter") ||
    roundName.includes("playoff") ||
    roundName.includes("knockout")
  );
}
```

Tryline は11大会（`competitions.family`実測: `autumn-nations` `league-one` `nations-championship` `pnc` `premiership` `rugby-championship` `rwc` `six-nations` `super-rugby-pacific` `top-14` `urc`）を扱っているが、上記の対象は事実上「League One」「ネーションズチャンピオンシップ」「各大会の決勝/準決勝/準々決勝」に限られ、Premiership・URC・Top 14・Super Rugby Pacific・Six Nations・Rugby Championship・PNC等の**通常シーズン戦（レギュラーラウンド）は対象外**。

2026-07-13、`fix-recap-penalty-fabrication-qa-gap.md`・`fix-sourced-facts-stale-prompt-version-cache.md`（本specの前提となる2件）の対応中に判明: sourced_factsが取得できていれば、recapが「反則なし」のような定性的統計捏造をせず、実データ（反則数・カード・タックル数等）で正確に書けることを確認済み。現状は対象試合が限定的なため、この恩恵をTrylineの試合の大半（レギュラーシーズン戦）が受けられていない。

## スコープ

対象:
- `isSourcedFactsEnabledForMatch()`を、大会・ラウンドによる制限を撤廃し、全試合で`true`を返すようにする
- 既存の`shouldUseCachedFacts()`のキャッシュ制御（recap: 一度取得したら再利用、preview: キックオフ72時間前以内は24時間ごとに再取得）と、`fix-sourced-facts-stale-prompt-version-cache.md`のバージョン不一致時再取得ロジックは、対象拡大後もそのままコスト上限として機能する

対象外:
- `lib/llm/sourced-facts/allowlist.ts`のドメイン許可リスト変更（別spec `feat-expand-sourced-facts-allowlist.md`の管轄）
- `MAX_STORED_FACTS`（1試合あたり保存件数上限8件）の変更
- previewの時間ベースキャッシュ間隔（`PREVIEW_REFRESH_WINDOW_HOURS` `PREVIEW_FRESHNESS_HOURS`）の調整

## データモデル変更

なし。

## API サーフェス

なし。

## LLM 連携

パイプライン: sourced-facts取得ステージ（`fetch.ts`）。`isSourcedFactsEnabledForMatch()`の条件分岐を撤廃し、常に`true`を返す（または関数自体を削除し呼び出し元のガード節を外す。Codexの実装判断に委ねるが、将来また特定条件で無効化したくなる可能性を考え、関数は残して`return true;`にするだけの最小差分を推奨）。

### コスト見積もり

`web_search_preview`ツール呼び出しは$25/1,000回（OpenAI 2026年料金）＋トークン課金（gpt-4o、1回あたり数千トークン程度）で、1回あたり概算$0.03〜0.06。

DB実測（2026年1〜5月、22週間・計310試合、`status='finished'`）:
- 週平均 約14試合、ピーク週（2月下旬〜5月上旬のSix Nations/欧州クラブシーズン重複期）は最大23試合

対象拡大後、全試合でpreview・recap各1回ずつ取得すると仮定:

| シナリオ | 週あたり呼び出し（試合数×2） | 月額概算（×4.3週） |
|---|---|---|
| 平均週（14試合） | 28回 | 約$3.6〜7.2 |
| ピーク週（23試合） | 46回 | 約$5.9〜11.9 |

**恒常コストとして月$4〜12程度**（幅は1回あたりトークン数の不確実性による）。既存のキャッシュ制御により、同一試合への重複課金は発生しない設計。

### 段階展開の推奨（未解決の質問1参照）

一度に全大会へ適用する前に、まず1大会（例: 直近開幕するPremiershipまたはURC）のレギュラーシーズンで1週間分試し、実際のトークン消費量とfactの質（反則数等が実際に正しく取得できるか）を確認してから全大会へ展開することを推奨する。実装自体は一度に全試合で`true`を返す形にするが、**デプロイ後の最初の1週間はOwnerが`match_sourced_facts`を目視確認**し、想定外の高コストや低品質な結果が出ていないかチェックする運用とする（コード上のフラグは不要、運用上の確認ステップ）。

## 受け入れ条件

1. `tests/llm/sourced-facts.test.ts`の`describe("isSourcedFactsEnabledForMatch", ...)`ブロック（既存テスト「enables Nations Championship regular-round matches」「keeps League One and knockout-round behavior enabled」「keeps non-target regular-round matches disabled」の近く）を更新:
   - 既存の「keeps non-target regular-round matches disabled」テスト（Premiership等の通常シーズン戦が無効化されることを確認する既存テスト）を、**有効化されることを確認するテストに書き換える**（意図的な仕様変更のため、既存テストの反転が必要）
   - `family`が`premiership` `urc` `top-14` `super-rugby-pacific` `six-nations` `rugby-championship` `pnc` `autumn-nations` `rwc`いずれの通常シーズン戦でも`true`を返すことを確認
2. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通ること
3. 本spec自体は既存試合への一括fetch実行を伴わない。対象拡大後、新規に生成・再生成されるcontentから自然にsourced_facts取得が発生する

## 未解決の質問

1. **段階展開するか一括展開するか**: 本specは実装自体は一括（全試合で`true`）としているが、Owner判断で「まず1大会だけ」といった環境変数ベースの段階展開ロジックを別途求める場合は、実装方針の見直しが必要
2. `fix-sourced-facts-stale-prompt-version-cache.md`との適用順序: 本specは対象拡大のみでキャッシュロジックには触れないため、順序はどちらが先でも技術的に問題ないが、**キャッシュ無効化specを先にマージしてからこちらを適用する方が、対象拡大直後から最新プロンプト（反則数等を含む）で正しく取得される**ため推奨
3. コスト上限（例: 月$20を超えたらアラート等）を設けるか。本spec単体では実装しない（監視の仕組みは別issue）
