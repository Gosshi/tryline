# recapの「ゼロ」断定が実際のteam_stats数値と矛盾していても検出できない不具合修正

## 背景

2026-07-13、`fix-recap-penalty-fabrication-qa-gap.md`（PR #551）で「反則」トピックに関する統計捏造ガードを追加した後も、日本 vs アイルランド戦のrecap再生成で**同種の捏造が2回再発**した:

1. 1回目（PR #551適用直後）: 「日本は反則が多かった」（実際は日本9・アイルランド9で互角）→ QAが正しくreject
2. 2回目（`fix-recap-team-stats-underutilization.md` PR #556適用後）: 「アイルランドは反則を犯さず、規律あるプレーで日本の攻撃を封じ込めた」（実際はアイルランドも9回）→ **QAが`issues: []` `factual_grounding: 5`で見逃しpublishした**

### 根本原因（特定済み）

`lib/content/fabrication-guard.ts`の`containsUnsupportedStatistic()`は「本文が『反則』というトピックに触れているとき、そのトピックを裏付けるfactが存在するか」だけを判定する**トピック存在チェック**であり、**主張の中身（ゼロという断定が実数と矛盾していないか）までは検証していない**。

具体的には、`match_sourced_facts`の「Penalties conceded: Japan 9 - Ireland 9」が`feat-derive-team-stats-from-sourced-facts.md`（PR #554）により`team_stats.penalties_conceded`（両チームとも9）へ解析・格納され、`lib/llm/stages/qa.ts`の`buildFactsForSide()`がこれを「◯◯チームのペナルティ9」という根拠fact文字列に変換する。本文が「反則を犯さず」と書いた場合、`extractStatisticSignals()`が「反則」を検出し、`factSupportsSignal()`が「ペナルティ9」という文字列に含まれる"ペナルティ"というエイリアスでマッチしてしまうため、**「反則というトピックには根拠がある」と誤ってpassする**。実際の数字が0ではなく9であることは一切チェックされない。

### データ構造自体は既に0と未取得を区別できている（確認済み）

`deriveTeamStatsFromSourcedFacts()`（PR #554）は、sourced_factsに明示的な数値（0を含む）が存在すればその値をそのまま`team_stats`のフィールドに格納し、factが存在しなければキー自体を設定しない（`Top14TeamStats`の各フィールドは`number`型のoptionalプロパティ）。つまり**「確認済みの0」と「未取得（データなし）」はTypeScript上のオブジェクト構造として既に区別可能**であり、データモデル自体の変更は不要。問題は以下の2点:

1. **生成プロンプト側**が、この「キーが存在する＝確認済みの値」「キーが存在しない＝未取得」という区別をLLMに明示的に指示していない。そのため、`team_stats`に実際の値（例: `penalties_conceded: 9`）が存在するにもかかわらず、LLMが検算せず「勝者=規律的」という学習済みの先入観で「反則なし」と書いてしまう
2. **QAの決定的ガードが反則（`penalties_conceded`）専用の1パターンしか想定しておらず、同種の「実数があるのにゼロと断定する」誤りは、ターンオーバー・タックルミス・エラー・イエロー/レッドカード等、他のカウント系スタッツでも起こり得るのに汎用化されていない**

ラグビーの試合スタッツはポゼッション率・テリトリー率・タックル数・キャリー数・ラインアウト成功率・スクラム成功率・ターンオーバー・獲得メートル・反則数・カード数・エラー数という**既知・有限の語彙**であるため、個別パターンを都度追加するのではなく、この既知の語彙に対して汎用的な「ゼロ断定 vs 実数」矛盾検出の仕組みを一度作るべきである。

## スコープ

対象:
- `lib/content/fabrication-guard.ts`に、「ゼロ」系の断定表現と`team_stats`の対応フィールドの実数値が矛盾している場合を検出する**汎用**関数を追加する（反則専用ではなく、ターンオーバー・タックルミス・エラー・イエローカード・レッドカードを含むカウント系スタッツ全般が対象）
- `lib/llm/stages/qa.ts`の`applyDeterministicQaGuards()`に、上記の新規チェックを組み込み、矛盾があれば`factual_grounding`をhard blockする
- `lib/llm/prompts/generate-recap.ts`の`teamStatsBlock`に、「team_statsにキーが存在しない項目には一切言及しないこと。数値が0として明示されている項目のみ、実際に0だったと書いてよい」という一文を追加する（生成側での予防）

対象外:
- `containsUnsupportedStatistic()`の既存ロジック変更（トピック存在チェックとしての役割はそのまま維持。今回追加するのは別の専用チェック）
- ポゼッション率・テリトリー率・ラインアウト成功率・スクラム成功率等の**パーセンテージ系**スタッツへの「ゼロ断定」チェック拡張（「ポゼッション0%」等は実際の試合でほぼ起こらず、自然言語での「ゼロ」断定パターンも一般的でないため対象外。今回はカウント系＝反則・ターンオーバー・タックルミス・エラー・カードに限定する）
- 「反則が多い/少ない」等、ゼロ以外の相対的な断定表現の矛盾検出（本specはゼロ断定に絞る。「未解決の質問」に記載）
- `Top14TeamStats`型自体の変更（optionalな`number`のままで、0と未取得の区別に必要な情報は既に揃っているため型変更は不要）

## データモデル変更

なし（背景セクションの通り、既存の型構造で0と未取得の区別は表現可能）。

## API サーフェス

なし。

## LLM 連携

パイプライン: Stage 3（プロンプト予防）＋ QAステージ（決定的ガード）の両方。新規LLM呼び出しは追加しない。

### 実装方針

1. `lib/content/fabrication-guard.ts`に新規エクスポート追加。反則専用ではなく、カウント系スタッツ全般を対象にした汎用関数にする:

```ts
export const CONTRADICTED_ZERO_STAT_CLAIM_ISSUE =
  "ゼロという断定が実際のteam_statsの数値と矛盾";

// 対象はカウント系スタッツのみ（パーセンテージ系は対象外）。
// derive-team-stats.ts の STAT_FIELD_BY_NAME と語彙を揃えること。
const ZERO_CLAIM_STAT_FIELDS: Record<string, "penalties_conceded" | "turnovers" | "tackles_missed" | "errors" | "yellow_cards" | "red_cards"> = {
  "反則": "penalties_conceded",
  "ペナルティ": "penalties_conceded",
  "ターンオーバー": "turnovers",
  "タックルミス": "tackles_missed",
  "エラー": "errors",
  "イエローカード": "yellow_cards",
  "レッドカード": "red_cards",
};

function buildZeroClaimPattern(label: string): RegExp {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}(?:なし|ゼロ|を犯さ(?:ず|ない)|0(?:回)?)`);
}

export function containsContradictedZeroStatClaim(
  text: string,
  teamStats: {
    away?: Partial<Record<string, number>> | null;
    home?: Partial<Record<string, number>> | null;
  } | null | undefined,
): boolean {
  if (!teamStats) {
    return false;
  }

  for (const [label, field] of Object.entries(ZERO_CLAIM_STAT_FIELDS)) {
    if (!buildZeroClaimPattern(label).test(text)) {
      continue;
    }

    const homeValue = teamStats.home?.[field];
    const awayValue = teamStats.away?.[field];

    if (
      (typeof homeValue === "number" && homeValue > 0) ||
      (typeof awayValue === "number" && awayValue > 0)
    ) {
      return true;
    }
  }

  return false;
}
```

どちらのチームについての「ゼロ」断定かを本文から厳密に特定するのは困難なため、**home/awayいずれかの実際の値が1以上であれば矛盾とみなす**（安全側に倒す）。同一カテゴリ内で複数の語（「反則」「ペナルティ」等）がヒットしても、最初に矛盾が見つかった時点で`true`を返せばよい。

2. `lib/llm/stages/qa.ts`の`applyDeterministicQaGuards()`（既存の`containsUnsupportedStatistic`呼び出しの近く）に追加:

```ts
if (
  containsContradictedZeroStatClaim(
    options.narrative,
    options.matchContext.teamStats,
  )
) {
  guarded = {
    ...guarded,
    issues: appendIssue(guarded.issues, CONTRADICTED_ZERO_STAT_CLAIM_ISSUE),
    scores: {
      ...guarded.scores,
      factual_grounding: 1,
    },
  };
}
```

`options.matchContext.teamStats`は既存の`QaMatchContext`型に既に含まれるフィールドで、新規に渡す配線は不要。

3. `isFactualGroundingHardBlock()`（`qa.ts`）に`CONTRADICTED_ZERO_STAT_CLAIM_ISSUE`を追加し、他の捏造issueと同様にreject/retry対象にする。

4. `lib/llm/prompts/generate-recap.ts`の`teamStatsBlock`に一文追加（生成側での予防、`fix-recap-team-stats-underutilization.md`で追加した2文の後ろに追加）:

```
"team_statsのJSONにキーが存在しない項目については、その統計について一切言及しないこと。「◯◯はゼロだった」「◯◯を犯さなかった」等、ゼロを明示的に主張してよいのは、そのJSON内で該当フィールドの値が実際に0として明示されている場合のみである。"
```

## 受け入れ条件

1. `tests/content/fabrication-guard.test.ts`に新規テストケースを追加:
   - `containsContradictedZeroStatClaim("アイルランドは反則を犯さず、規律あるプレーで日本を封じ込めた", { home: { penalties_conceded: 9 }, away: { penalties_conceded: 9 } })`が`true`を返す
   - `containsContradictedZeroStatClaim("日本はターンオーバーなしで試合を進めた", { home: { turnovers: 5 }, away: { turnovers: 3 } })`が`true`を返す（反則以外のカウント系スタッツでも矛盾検出できることの確認）
   - `containsContradictedZeroStatClaim("日本は反則が多かった", {...})`が`false`を返す（「ゼロ」断定パターンに一致しないため対象外）
   - 実際に反則0-0（または該当スタッツが実際に0-0）の試合であれば`true`を返さない（矛盾していないケースの回帰）
   - `team_stats`が存在しない場合（`null`）は`false`を返す
2. `tests/llm/stages/qa.test.ts`に統合テストを追加:
   - 「反則を犯さず」を含む本文＋`team_stats.penalties_conceded>0`の入力が`reject`または`retry`になること（既存の`isFactualGroundingHardBlock`のテストパターンに倣う）
3. `tests/llm/prompts/generate-recap.test.ts`に、`teamStatsBlock`が「キーが存在しない項目については...言及しないこと」（または実装した具体的な表現）を含むことを確認するテストを追加
4. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通ること
5. 本spec自体は再生成を伴わない。日本 vs アイルランド戦を含む対象試合の再生成は、本specマージ後に別途`content-regen`手順で試し焼きする

## 未解決の質問

- 「反則が多い/少ない」等、ゼロ以外の相対的な誤断定（例: 実際は互角なのに「多かった」と書く）の検出は本specの対象外とした。再発するようなら同じ汎用パターンで拡張する
- home/awayどちらのチームについての断定かを区別せず「どちらかが1以上なら矛盾」という粗い判定にしている点。将来的に文の主語（チーム名）を特定して厳密化する余地はあるが、実装コストと安全側優先の観点から本specでは見送る
- ポゼッション率・テリトリー率等のパーセンテージ系スタッツについて、将来「ポゼッション0%」のような極端な断定が観測された場合は、同じ関数を拡張する形で対応する
