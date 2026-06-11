# fix-event-block-team-link-matching

## 背景

`feat-anchorless-event-block-selection`（#410）の本番実行（2026-06-11）で、Autumn Nations 2025 の回収が **16/32 にとどまった**。

失敗原因を実ページで診断した結果: `findEventBlockByTeams` の「ブロック HTML 全体への部分一致」では、**レフェリー・タッチジャッジの国籍表記や脚注にもチーム名が一致**し、候補が爆発する（実測: England v Australia は16候補、Japan v Australia は8候補）。同日に複数試合がある日（11/22 等）は日付絞り込みでも一意にならず skip された。

**検証済みの解決策**: Wikipedia の vevent ブロックでは対戦チームが `{Team} national rugby union team` というリンク title で表記される。この文字列での厳密照合に変えると、**失敗していた全ペアを含む19ペア全てが候補1件に解決**することを実ページで確認済み。

## スコープ

対象:
- `scripts/fill-event-gaps.ts`: `findEventBlockByTeams` の照合ロジック改善

対象外:
- SRP 6試合(決勝シリーズ)の回収 — スコア整合ガードがイベント合計超過（+7〜11点）で正しくブロック中。原因はパーサのキック過剰計上疑いで別調査（ミスキック問題）
- South Africa v Japan（61-7）の +1 点超過 — 同上の調査に含める
- リーグワン6試合の 404 URL 修正 — データ修正タスク（URL が `2024-25_Japan_Rugby_League_One_–_Division_1` で 404。正しいページ名の調査が必要）

## 変更詳細

### `findEventBlockByTeams` — 2段階照合

```typescript
export function findEventBlockByTeams(
  html: string,
  homeTeamName: string,
  awayTeamName: string,
  kickoffDate: string,
): string | null {
  const $ = load(html);
  const blocks: string[] = [];

  $(".vevent").each((_, element) => {
    const block = $.html(element);
    if (block) {
      blocks.push(block);
    }
  });

  // 第1段階: ナショナルチームのリンク title による厳密照合
  // （レフェリー国籍等の誤マッチを排除できる）
  const strictCandidates = blocks.filter(
    (block) =>
      block.includes(`${homeTeamName} national rugby union team`) &&
      block.includes(`${awayTeamName} national rugby union team`),
  );

  if (strictCandidates.length === 1) {
    return strictCandidates[0] ?? null;
  }

  if (strictCandidates.length > 1) {
    const dateMatches = strictCandidates.filter((block) =>
      blockContainsDate(block, kickoffDate),
    );
    return dateMatches.length === 1 ? (dateMatches[0] ?? null) : null;
  }

  // 第2段階: 厳密照合0件（クラブチーム等）は従来の部分一致＋日付絞り込み
  const looseCandidates = blocks.filter(
    (block) => block.includes(homeTeamName) && block.includes(awayTeamName),
  );

  if (looseCandidates.length === 1) {
    return looseCandidates[0] ?? null;
  }

  const dateMatches = looseCandidates.filter((block) =>
    blockContainsDate(block, kickoffDate),
  );

  return dateMatches.length === 1 ? (dateMatches[0] ?? null) : null;
}
```

挙動の変更点は照合順序のみ。`blockContainsDate`・呼び出し側・ログ・スコア整合ガードは変更しない。

## 受け入れ条件

1. フィクスチャ: レフェリー国籍として第3国名（例: Australia）を含むブロックが、その国の試合の候補にならない（単体テスト）
2. ナショナルチームリンクを含まないブロック（クラブチーム想定）は第2段階の部分一致で従来どおり解決する（既存テストが通る）
3. 既存の `findEventBlockByTeams` テストが（必要なら title 形式のフィクスチャ修正の上で）全て通る
4. `pnpm test`・`pnpm tsc --noEmit` が通る

## 実行手順（マージ後・Owner）

```
pnpm tsx scripts/fill-event-gaps.ts --dry-run --limit=2000
pnpm tsx scripts/fill-event-gaps.ts --limit=2000
```

期待: Autumn 残り16試合が「resolved by team-name block selection」で回収される。

## 未解決の質問

なし（実装開始可能）
