# sourced_facts のチームスタッツをmatch_team_stats相当の構造化データへ昇格

## 背景

2026-07-13、日本 vs アイルランド戦（match_id: `d9f72ea3-17da-4eac-b20d-c6bfe0f185b4`）recapを新パイプライン（`fix-recap-penalty-fabrication-qa-gap.md`・`fix-sourced-facts-stale-prompt-version-cache.md`・`feat-expand-sourced-facts-match-coverage.md`適用後）で再生成したところ、`match_sourced_facts`にポゼッション48-52%・テリトリー45-55%・タックル数120-110・キャリー95-105・ラインアウト成功85-90%・スクラム成功80-85%・ターンオーバー12-10・獲得メートル350-400mという豊富な実データが存在するにもかかわらず、生成された本文はこれらを**一切引用しなかった**（スコア・分数・反則数以外の数値が本文に登場しない）。

### 根本原因（特定済み）

`lib/llm/prompts/generate-recap.ts`には、同じ「チームスタッツ」を扱う2つの異なるプロンプトブロックが存在し、扱いに大きな差がある:

1. **`teamStatsBlock`**（`assembled.team_stats`由来）: 「スクラム・ラインアウト・タックル・キャリー・ペナルティ等の差は、戦術描写の具体化に**積極的に使うこと**」という強い指示
2. **`sourcedFactsBlock`**（`assembled.sourced_facts`由来）: 「本文の根拠として**使ってよい**」という任意の弱い指示。加えて「**同一ソースから複数引用しないこと**」という制約があり、ポゼッション〜獲得メートルまでの8件がほぼ同一ソースURL（rugby-japan.jpの同一記事）から来ているため、実質1件しか採用されない構造になっている

`assembled.team_stats`（`MatchTeamStats`型、実体は`Top14TeamStats`型）は`lib/llm/stages/assemble.ts`の`loadTeamStats()`（L518-565）で`match_team_stats`テーブルから読み込まれるが、**このテーブルは`competitionFamily !== "top-14"`の場合、問答無用で`null`を返す**（L524）:

```ts
async function loadTeamStats(args: {...}): Promise<MatchTeamStats> {
  if (args.competitionFamily !== "top-14") {
    return null;
  }
  ...
}
```

`match_team_stats`テーブル自体もTop 14公式サイト専用のスクレイパ（`scripts/backfill-top14-team-stats.ts`）でのみ書き込まれる（`feat-top14-team-stats.md`参照）。つまり**Top 14以外の大会では、どれだけ良質なチームスタッツが`sourced_facts`にあっても、強い指示を伴う`team_stats`経路には絶対に載らない**。

`feat-expand-sourced-facts-match-coverage.md`により、今後は全大会でsourced_facts取得が有効化されるため、この「宝の持ち腐れ」状態は今後さらに広範囲で発生する見込み。

## スコープ

対象:
- `assembled.sourced_facts`に含まれる、規則的な「`{スタッツ名}: {チームA} {値A} - {チームB} {値B}`」形式の数値ファクトを解析し、`Top14TeamStats`相当の構造化データへ変換する純粋関数を新設する
- `lib/llm/stages/assemble.ts`で、`loadTeamStats()`（Top 14専用パス）が`null`を返した場合のフォールバックとして、上記の解析結果を`team_stats`として使う
- 解析に成功したfactは、二重掲載を避けるため`sourced_facts`（プロンプトへ渡す配列）から除外する
- `Top14TeamStats`型に、sourced_facts側で頻出するがTop14の生スクレイプデータには無いフィールドを追加する: `turnovers?: number`、`metres_gained?: number`、`lineout_success_pct?: number`、`scrum_success_pct?: number`（Top14公式データは`lineouts_won`/`lineouts_total`という実数カウントだが、sourced_factsのweb検索結果は「成功率85%」という割合形式で返ってくるため、両方を受け付けられるようにする）

対象外:
- `Top14TeamStats`型・変数名のリネーム（本specでは型名はそのまま維持し、他大会にも使われる点は「未解決の質問」に記載するのみ）
- `match_team_stats`テーブルへの書き込み（本specは読み込み時の動的導出のみ。DBへの永続化は行わない）
- Top 14の既存スクレイパ・`backfill-top14-team-stats.ts`の変更
- sourced_facts検索プロンプト（`buildSearchPrompt`）自体の変更（既に「stat name: TeamA X - TeamB Y」形式を明示的に指示済みで、そのままパース対象にできる）
- `qa-content.ts`のQA判定プロンプト側の変更（team_statsとして扱われる以上、既存の`teamStatsBlock`ロジックがそのまま適用されQA上も有利になる想定。動作確認は受け入れ条件でカバー）

## データモデル変更

`lib/llm/types.ts`の`Top14TeamStats`に以下を追加（すべてoptional、既存フィールドとの後方互換を維持）:

```ts
export type Top14TeamStats = {
  carries?: number;
  errors?: number;
  lineouts_total?: number;
  lineouts_won?: number;
  lineout_success_pct?: number;   // 追加
  metres_gained?: number;          // 追加
  penalties_conceded?: number;
  possession_pct?: number;
  red_cards?: number;
  scrums_total?: number;
  scrums_won?: number;
  scrum_success_pct?: number;      // 追加
  tackles_made?: number;
  tackles_missed?: number;
  territory_pct?: number;
  turnovers?: number;               // 追加
  yellow_cards?: number;
};
```

DBマイグレーション不要（`match_team_stats`テーブル自体は変更しない。今回追加するフィールドはDB由来ではなく、sourced_facts解析結果としてのみ生成される、実行時オブジェクトの拡張）。

## API サーフェス

なし。

## LLM 連携

パイプライン: assembleステージ（`lib/llm/stages/assemble.ts`）。新規LLM呼び出しは追加しない（既に取得済みのsourced_factsをコード側で解析するのみ）。

### 実装方針

1. 新規関数（例: `lib/llm/sourced-facts/derive-team-stats.ts`）:

```ts
export function deriveTeamStatsFromSourcedFacts(
  sourcedFacts: SourcedFactInput[],
  homeTeamNames: string[],  // name + english_name
  awayTeamNames: string[],
): { teamStats: Top14TeamStats | null; away: Top14TeamStats | null; home: Top14TeamStats | null; consumedFactIndexes: number[] }
```

2. パース対象のfactパターン: `/^([A-Za-z ]+):\s*(.+?)\s+([\d.]+)(%|m)?\s*[-–]\s*(.+?)\s+([\d.]+)(%|m)?$/`（実データ例に基づく。前後の表記ゆれをCodex実装時に確認・調整すること）

3. スタッツ名 → フィールド名のマッピング表:

| sourced_facts上の表記 | Top14TeamStatsフィールド |
|---|---|
| Possession | possession_pct |
| Territory | territory_pct |
| Tackle counts / Tackles made | tackles_made |
| Tackles missed | tackles_missed |
| Carries | carries |
| Penalties conceded | penalties_conceded |
| Red cards | red_cards |
| Yellow cards | yellow_cards |
| Lineout success | lineout_success_pct（新フィールド） |
| Scrum success | scrum_success_pct（新フィールド） |
| Turnovers | turnovers（新フィールド） |
| Metres gained | metres_gained（新フィールド） |

未知のスタッツ名は無視し、`sourced_facts`側にそのまま残す（削除しない）。

4. チーム名マッチング: fact内の「Japan」「Ireland」等の英語表記と、`match.home_team.name`/`english_name`（大小文字無視・部分一致）を照合し、home/awayを判定する。曖昧な場合（どちらにもマッチしない、両方にマッチする等）はそのfactの解析をスキップし、`sourced_facts`側に残す（安全側に倒す）。

5. `assemble.ts`の統合ポイント（L781-800付近、`Promise.all`直後）:

```ts
const derivedFromSourcedFacts = !teamStats
  ? deriveTeamStatsFromSourcedFacts(sourcedFacts, homeTeamNames, awayTeamNames)
  : null;
const resolvedTeamStats = teamStats ?? derivedFromSourcedFacts?.teamStats ?? null;
const remainingSourcedFacts = derivedFromSourcedFacts
  ? sourcedFacts.filter((_, i) => !derivedFromSourcedFacts.consumedFactIndexes.includes(i))
  : sourcedFacts;
```

以降、`team_stats: resolvedTeamStats`・`sourced_facts: remainingSourcedFacts.map(...)`を最終的な`AssembledContentInput`に使う（既存のL945-946付近を変更）。

## 受け入れ条件

1. `deriveTeamStatsFromSourcedFacts()`のユニットテスト（新規テストファイル、例: `tests/llm/sourced-facts/derive-team-stats.test.ts`）:
   - 日本 vs アイルランド戦の実際の8件のfact文字列（本specの背景に記載した実例）を入力すると、`home`/`away`それぞれに`possession_pct`・`territory_pct`・`tackles_made`・`carries`・`lineout_success_pct`・`scrum_success_pct`・`turnovers`・`metres_gained`が正しく埋まった`Top14TeamStats`を返す
   - チーム名が判定できないfactはスキップされ、`consumedFactIndexes`に含まれないこと
   - 未知のスタッツ名（マッピング表に無いもの）は無視されること
2. `tests/llm/stages/assemble.test.ts`に統合テストを追加:
   - `competitionFamily`がTop14以外で`match_team_stats`が空でも、パース可能なsourced_factsがあれば`assembled.team_stats`が非nullになること
   - 解析に使われたfactが`assembled.sourced_facts`から除外されていること（同じfactが二重に本文へ渡らないこと）
   - Top14で`match_team_stats`にデータがある場合は、従来通りそちらが優先され、sourced_facts解析は行われないこと（リグレッションなし）
3. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通ること
4. 本spec適用後、日本 vs アイルランド戦のrecapを試し焼きで再生成し、本文にポゼッション・タックル数等の具体的な数値が反映されることを目視確認する（`content-regen`スキルの手順に従う。Owner承認・コスト提示の上で実施）

## 未解決の質問

- `Top14TeamStats`という型名が、Top14以外の大会にも使われるようになる点。本specでは型名を維持するが、将来的なリネーム（例: `MatchTeamStatsEntry`）は別途クリーンアップ候補として残す
- パース対象のfact文字列フォーマットは`buildSearchPrompt()`の指示文言（`lib/llm/sourced-facts/fetch.ts` L159）に依存する。将来そちらの文言が変わった場合、本specのパース正規表現も追随が必要になる可能性がある
- チーム名マッチングの精度（略称・愛称等での表記ゆれにどこまで対応するか）はCodex実装時に既存の`japanese_name_glossary`等の仕組みで代用できないか確認すること
