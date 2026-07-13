# QAの根拠fact生成がTop14TeamStatsの新フィールドを認識せず誤ってrejectする不具合修正

## 背景

2026-07-13、`feat-derive-team-stats-from-sourced-facts.md`（PR #554・マージ済み）適用後、日本 vs アイルランド戦のrecapを試し焼き再生成したところ、本文は正しく`team_stats`の新フィールド（`lineout_success_pct`・`scrum_success_pct`）を使って「スクラムやラインアウトでの成功率がアイルランドより劣っていた」のように記述したにもかかわらず、QAが`データに存在しない統計値を含む`（`UNSUPPORTED_STATISTIC_ISSUE`）でreject（`factual_grounding: 1`）した。

### 根本原因（特定済み）

`lib/llm/stages/qa.ts`の`buildFactsForSide()`（L90-153）は、`Top14TeamStats`の各フィールドをQA判定用の「根拠fact文字列」（例:「ホームチームのポゼッション率48%」）へ変換する関数だが、PR #554で`Top14TeamStats`に追加された4つの新フィールド（`lineout_success_pct`・`scrum_success_pct`・`turnovers`・`metres_gained`）を**一切処理していない**（既存の`possession_pct`・`territory_pct`・`lineouts_won`/`lineouts_total`・`scrums_won`/`scrums_total`・`tackles_made`・`tackles_missed`・`carries`・`penalties_conceded`・`yellow_cards`・`red_cards`・`errors`のみをフィールドごとに個別チェックするハードコード実装のため）。

この4フィールドは元々`match_sourced_facts`の自由記述fact（例:「Lineout success: Japan 85% - Ireland 90%」）として存在していたが、PR #554の`deriveTeamStatsFromSourcedFacts()`により`team_stats`へ解析・昇格され、**その際に元のsourced_facts配列からは除外（consumed）される**設計になっている（二重掲載防止のため）。

結果として、これら4フィールドの値は:
- LLMのナラティブ生成プロンプト（`teamStatsBlock`、`JSON.stringify(assembled.team_stats)`で丸ごと渡される）には**見えている**ため、本文に正しく反映される
- しかしQAの決定的ガード（`containsUnsupportedStatistic`、根拠は`buildTeamStatsFactStrings()`が生成する文字列のみ）には**見えていない**
- さらに元のsourced_facts側からも既に除外済みのため、そちらでも根拠を見つけられない

という「どこからも根拠を辿れない」状態になり、正しくグラウンディングされた記述が誤ってrejectされる。

## スコープ

対象:
- `lib/llm/stages/qa.ts`の`buildFactsForSide()`に、`lineout_success_pct`・`scrum_success_pct`・`turnovers`・`metres_gained`の4フィールドを処理する分岐を追加する

対象外:
- `deriveTeamStatsFromSourcedFacts()`（PR #554）自体の変更
- `buildFactsForSide()`の既存フィールド処理ロジックの変更（リグレッションさせない）
- QA判定プロンプト（`qa-content.ts`）自体の変更（`buildTeamStatsFactStrings()`の出力を`teamStatsBlock`として渡す既存の仕組みはそのまま使う）

## データモデル変更

なし。

## API サーフェス

なし。

## LLM 連携

パイプライン: QAステージ（`lib/llm/stages/qa.ts`）の決定的ガード。新規LLM呼び出しは追加しない。

### 実装方針

`buildFactsForSide()`（L90-153）の既存フィールド処理（L148「errors」の直前、または末尾のreturn直前）に追加:

```ts
if (typeof stats.lineout_success_pct === "number") {
  facts.push(
    `${label}チームのラインアウト成功率${formatPercent(stats.lineout_success_pct)}`,
  );
}
if (typeof stats.scrum_success_pct === "number") {
  facts.push(
    `${label}チームのスクラム成功率${formatPercent(stats.scrum_success_pct)}`,
  );
}
if (typeof stats.turnovers === "number") {
  facts.push(`${label}チームのターンオーバー${stats.turnovers}`);
}
if (typeof stats.metres_gained === "number") {
  facts.push(`${label}チームの獲得メートル${stats.metres_gained}`);
}
```

`formatPercent()`は既存のヘルパー関数（L86-88付近）をそのまま再利用する。

「ラインアウト成功率」「スクラム成功率」という文字列は、`containsUnsupportedStatistic`が検出する「成功率」シグナルを`factSupportsSignal()`の部分文字列一致で正しくグラウンディングする（`UNSUPPORTED_STATISTIC_PATTERN`・`STATISTIC_SIGNAL_ALIASES`は`fix-recap-penalty-fabrication-qa-gap.md`で導入済みの仕組みをそのまま利用でき、変更不要）。

## 受け入れ条件

1. `tests/llm/stages/qa.test.ts`（既存ファイルがあれば追加。`buildFactsForSide`または`buildTeamStatsFactStrings`のテストがある場所に追加）:
   - `team_stats`に`lineout_success_pct: 85`が設定されている場合、`buildTeamStatsFactStrings()`の戻り値に「ラインアウト成功率85%」を含む文字列が含まれる
   - 同様に`scrum_success_pct`・`turnovers`・`metres_gained`についても、それぞれの根拠fact文字列が生成される
   - 既存フィールド（`possession_pct`等）の出力にリグレッションがないこと
2. `containsUnsupportedStatistic("ラインアウトの成功率が高かった", buildTeamStatsFactStrings({ home: { lineout_success_pct: 85 }, away: null }))`が`false`を返すこと（誤検知が解消されたことの確認）
3. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通ること
4. 本spec自体は再生成を伴わない。日本 vs アイルランド戦を含む対象試合の再生成は、本specマージ後に別途`content-regen`手順で試す

## 未解決の質問

- `Top14TeamStats`に将来さらにフィールドが追加された場合、`buildFactsForSide()`のようなフィールドごとのハードコード方式では同じ見落としが再発しうる。`Object.entries(stats)`を汎用的にループしてfact文字列を生成する設計へのリファクタリングも考えられるが、フィールドごとに日本語ラベル・単位（%・回・m）が異なるため機械的な汎用化は難しい。本specではハードコード方式を維持し、将来の見落とし防止は「新フィールド追加時は必ずbuildFactsForSideも同時に更新する」という運用ルールに委ねる（`Top14TeamStats`型定義のコメントに一言添える等の軽量な対策はCodex実装時に検討してよい）
