# fix-x-post-quality

## 背景

2026-07-01のX運用再開に伴うレビューで、Discord/X投稿ドラフトの品質に関わる独立した2つの不具合を発見した。原因レイヤーは異なるが、どちらも「X投稿ドラフトが実際の記事・サイト表示と乖離する」という同じ症状に現れるため、1つのspecにまとめて対応する。

- **Part 1**: Discord通知（`notify-discord` cron）が日本語投稿でもチーム名・大会名を英語のまま出力するコードバグ
- **Part 2**: プレビュー記事の「この試合の核心」冒頭文が特定パターンに収束し、複数試合を並べると文章が酷似して見える問題（過去の修正が不十分だった）

## スコープ

**対象:**
- `app/api/cron/notify-discord/route.ts`（Part 1）
- `lib/llm/prompts/generate-preview.ts`（Part 2）

**対象外:**
- `generate-recap.ts` のプロンプトロジック（Part 2 は preview のみ対象。recap は `fix-recap-opening-variety.md` で対応済み）
- QAプロンプト・スコアリングロジック

Part 1 と Part 2 は互いに依存しない。別々のPRで進めてよい。

---

## Part 1: Discord/X投稿のカタカナ表記バグ

### 症状

X運用レビュー中に発見。日本語プレビューのDiscordドラフトが以下のように出力される:

```
📋 Nations Championship 2026 プレビュー
#Australia vs #Ireland
```

サイト本体は既にカタカナ表記（オーストラリア/アイルランド、ネーションズチャンピオンシップ）になっているにもかかわらず、Discord/X投稿だけ英語のまま。

### 根本原因

`app/api/cron/notify-discord/route.ts` の2箇所:

**1) Supabaseクエリで `name_ja` を取得していない（L19-28, L254-256）**

```typescript
type TeamRow = {
  english_name: string | null;
  name: string | null;
};

type CompetitionRow = {
  family: string | null;
  name: string | null;
  season: string | null;
};
```

```typescript
home_team:teams!matches_home_team_id_fkey ( name, english_name ),
away_team:teams!matches_away_team_id_fkey ( name, english_name ),
competition:competitions!matches_competition_id_fkey ( name, season, family )
```

`teams.name_ja` / `competitions.name_ja` カラムが select句に含まれていない。

**2) 表示名の組み立てが日本語投稿でも `name`（英語）を使っている（L316-324, L432-438）**

```typescript
const competitionLabel = competition?.name ?? "";
const homeDisplayName =
  content.language === "en"
    ? (homeTeam?.english_name ?? homeTeam?.name ?? "Home")
    : (homeTeam?.name ?? "Home");   // ← 日本語投稿なのに英語の name を使用
const awayDisplayName =
  content.language === "en"
    ? (awayTeam?.english_name ?? awayTeam?.name ?? "Away")
    : (awayTeam?.name ?? "Away");   // ← 同上
```

さらに recap 用の `appendOfficialReplyFields` 呼び出し（L432-438）でも同じパターンが重複している:

```typescript
awayTeamNameJa: awayTeam?.name ?? "Away",   // ← "Ja" という名前なのに英語の name を使用
homeTeamNameJa: homeTeam?.name ?? "Home",   // ← 同上
```

### 実装詳細

**1) 型定義に `name_ja` を追加（L19-28）**

```typescript
type TeamRow = {
  english_name: string | null;
  name: string | null;
  name_ja: string | null;
};

type CompetitionRow = {
  family: string | null;
  name: string | null;
  name_ja: string | null;
  season: string | null;
};
```

**2) select句に `name_ja` を追加（L254-256）**

```typescript
home_team:teams!matches_home_team_id_fkey ( name, name_ja, english_name ),
away_team:teams!matches_away_team_id_fkey ( name, name_ja, english_name ),
competition:competitions!matches_competition_id_fkey ( name, name_ja, season, family )
```

**3) 表示名ロジックを修正（L316-324）**

```typescript
const competitionLabel =
  content.language === "en"
    ? (competition?.name ?? "")
    : (competition?.name_ja ?? competition?.name ?? "");
const homeDisplayName =
  content.language === "en"
    ? (homeTeam?.english_name ?? homeTeam?.name ?? "Home")
    : (homeTeam?.name_ja ?? homeTeam?.name ?? "Home");
const awayDisplayName =
  content.language === "en"
    ? (awayTeam?.english_name ?? awayTeam?.name ?? "Away")
    : (awayTeam?.name_ja ?? awayTeam?.name ?? "Away");
```

**4) `appendOfficialReplyFields` 呼び出しを修正（L432-438）**

```typescript
appendOfficialReplyFields(embed, {
  awayScore: match.away_score ?? 0,
  awayTeamNameEn: awayTeam?.english_name ?? awayTeam?.name ?? "Away",
  awayTeamNameJa: awayTeam?.name_ja ?? awayTeam?.name ?? "Away",
  competitionFamily: competition?.family ?? null,
  homeScore: match.home_score ?? 0,
  homeTeamNameEn: homeTeam?.english_name ?? homeTeam?.name ?? "Home",
  homeTeamNameJa: homeTeam?.name_ja ?? homeTeam?.name ?? "Home",
  tryScorers,
});
```

`competitionLabel` が `name_ja` を使うようになるため、`ネーションズチャンピオンシップ 2026` のような season 付き表記が必要な場合は既存の season 結合ロジック（あれば）と整合させること。season をラベルに含める処理が別途あるか確認し、なければ `${competition?.name_ja ?? competition?.name} ${competition?.season ?? ""}`.trim() の形に揃える。

### 受け入れ条件（Part 1）

1. TypeScript ビルドが通る
2. 日本語プレビュー/レビューのDiscordドラフトで、チーム名・大会名が `name_ja` を優先して表示される（`name_ja` が null のチーム・大会は既存通り `name` にフォールバック）
3. 英語投稿（`content.language === "en"`）の挙動は変更しない（`english_name` 優先のまま）
4. `appendOfficialReplyFields` に渡す `*TeamNameJa` が実際に日本語表記になる

---

## Part 2: プレビュー冒頭パターンの収束

### 背景

`specs/fix-preview-variety.md`（`preview@3.0.0→3.1.0`）で「この試合の核心」セクションに3パターン（数値対決型/フォーム型/大会文脈型）を提示する対応が既に実装済み。しかし2026-07-01時点で `PROMPT_VERSION` は `preview@3.4.0` まで進んでいるにもかかわらず、実際の出力は依然として数値対決型に強く偏っている。

**定量確認（2026-07-01）**: 直近の公開済み日本語プレビュー40件をサンプリングしたところ、約33件（82%）が「{チームA}の平均◯得点対{チームB}の平均◯失点——どちらが◯か」という構文にほぼ一致していた。特に Nations Championship 2026 開幕ラウンド（2026-07-04開催、同日生成の6試合）は**6試合全てが同一パターン**になった。

つまり `fix-preview-variety.md` の対策（LLMに3択を提示する）は不十分だった。

### 根本原因（前回の修正が効かなかった理由）

`coreQuestionBlock`（`lib/llm/prompts/generate-preview.ts:31-42`）は3パターンを「提示」しているだけで、どのパターンを使うかは LLM の自由選択に委ねている。しかし選択は実質的に自由ではない:

- **数値対決型**は `key_stats.home/away.avg_points_for_last_5` 等、常に埋まっているデータだけで書ける
- **フォーム型**は `key_stats.home/away.result_streak` が `"winning"` または `"losing"`（＝明確なストリークがある）でないと不自然になる。シーズン序盤や大会初戦では `"mixed"` になりやすい
- **大会文脈型**は `match_phase` がプレーオフ関連（`playoff_final` 等）でないと書きようがない。開幕戦や中盤の通常戦では `match_phase` が `null` になる

つまり「常に使える」のは数値対決型だけであり、LLM が3つから自由に選ぶ限り統計的に数値対決型へ収束するのは構造的必然。**「選ばせる」のをやめて、コード側で条件に応じて使うパターンを決定する**必要がある。

### データモデル変更

なし。既存の `assembled.key_stats.home/away.result_streak`（`"winning" | "losing" | "mixed" | null`）と `assembled.match_phase` を使う。

### LLM 連携

パイプライン Stage 3（ナラティブ生成、preview）のプロンプト組み立てロジックを変更する。コスト増なし（プロンプト長はほぼ変わらない。むしろ3パターン全例を毎回渡すのをやめるため若干減る）。

### 実装詳細

**1) `coreQuestionBlock` をコード側で決定論的に分岐させる**

変更前（L31-42、現状）:
```typescript
const coreQuestionBlock = [
  "## セクション0（必須、200字以内）: # この試合の核心",
  "この試合の本質的な争点を1文で表す問いを設定し、その根拠を数値・実績・文脈で示すこと。",
  "以下の3パターンのうち、この試合に最も合うものを選ぶこと（パターン名は出力しない）:",
  "【数値対決型】攻撃力・守備力・スクラム勝率など対照的な指標を対比する",
  "  例: 「Leinsterの平均31得点アタック対Saracensの平均14失点ディフェンス——どちらの実力値が本物か」",
  "【フォーム型】連勝/連敗ストリークや直近の状態変化を軸にする",
  "  例: 「5連勝中のBullsに、プレーオフ圏ギリギリのMunsterが土をつけられるか——フォームの差は数字ほど大きいか」",
  "【大会文脈型】プレーオフ進出・降格・Grand Slamなど大会的意味を軸にする",
  "  例: 「この一戦に勝てば自力でプレーオフ進出が決まるUlster——Glasgowの守備はその夢を断てるか」",
  "このセクションを最初に必ず出力すること。",
].join("\n");
```

変更後: LLM に「選ばせる」のではなく、`assembled` の実データから使用パターンを決定し、該当パターン**のみ**を指示する。

```typescript
type CorePatternType = "form" | "context" | "numeric";

function selectCorePattern(assembled: AssembledContentInput): CorePatternType {
  const phase = assembled.match_phase;
  if (
    phase === "playoff_final" ||
    phase === "playoff_semifinal" ||
    phase === "playoff_third_place" ||
    phase === "playoff_other"
  ) {
    return "context";
  }

  const homeStreak = assembled.key_stats.home.result_streak;
  const awayStreak = assembled.key_stats.away.result_streak;
  if (
    (homeStreak === "winning" || homeStreak === "losing") ||
    (awayStreak === "winning" || awayStreak === "losing")
  ) {
    return "form";
  }

  return "numeric";
}

const NUMERIC_AXES = [
  "攻撃力（平均得点）と守備力（平均失点）の対比",
  "得失点差（avg_score_diff_last_5）の対比",
  "直近5試合の勝率（win_rate_last_5）の対比",
] as const;

function buildCoreQuestionBlock(
  assembled: AssembledContentInput,
  matchId: string,
): string {
  const pattern = selectCorePattern(assembled);
  const base = "## セクション0（必須、200字以内）: # この試合の核心\nこの試合の本質的な争点を1文で表す問いを設定し、その根拠を数値・実績・文脈で示すこと。\n";

  if (pattern === "form") {
    return (
      base +
      "【フォーム型で書くこと】result_streak が winning/losing のチームについて、recent_form から具体的なストリーク数（何連勝/何連敗か）を数えて明示すること。\n" +
      '例: 「5連勝中のBullsに、プレーオフ圏ギリギリのMunsterが土をつけられるか——フォームの差は数字ほど大きいか」\n' +
      "このセクションを最初に必ず出力すること。"
    );
  }

  if (pattern === "context") {
    return (
      base +
      "【大会文脈型で書くこと】match_phase が示す大会的な意味（決勝/準決勝/3位決定戦/プレーオフ）を軸にすること。数値対比は補強材料に留める。\n" +
      "このセクションを最初に必ず出力すること。"
    );
  }

  // numeric: ストリークも大会文脈もない場合のみ。軸を match_id からハッシュで固定選択し、
  // 同一バッチ内で複数試合が数値対決型に落ちても軸が揃わないようにする。
  const axisIndex =
    [...matchId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) %
    NUMERIC_AXES.length;
  return (
    base +
    `【数値対決型で書くこと】${NUMERIC_AXES[axisIndex]}を軸にすること。\n` +
    '例: 「Leinsterの平均31得点アタック対Saracensの平均14失点ディフェンス——どちらの実力値が本物か」\n' +
    "このセクションを最初に必ず出力すること。"
  );
}

const coreQuestionBlock = buildCoreQuestionBlock(
  assembled,
  assembled.match.id,
);
```

`assembled.match.id` のフィールド名が異なる場合は既存の `AssembledContentInput` 型定義に合わせて調整すること（`matchId` 相当のフィールドを使う）。

**2) `PROMPT_VERSION` 更新**

```typescript
export const PROMPT_VERSION = "preview@3.5.0";
```

### 受け入れ条件（Part 2）

1. TypeScript ビルドが通る
2. `result_streak` が winning/losing のいずれかのチームを含む試合で、生成された「この試合の核心」が具体的な連勝/連敗数に言及している（手動確認、3件以上）
3. `match_phase` がプレーオフ系の試合で、大会文脈型の核心文が生成される（手動確認、可能であれば）
4. ストリークも大会文脈もない試合（開幕戦・シーズン中盤の通常戦）を同一バッチで5件以上生成した場合、`NUMERIC_AXES` の3軸が分散して使われる（全件が「平均得点対平均失点」に揃わない）
5. 既存のテスト（`tests/llm/*.ts`）が通る。`coreQuestionBlock` の文字列アサーションがある場合は更新すること

---

## 全体の受け入れ条件

- Part 1・Part 2 とも個別にビルド・型チェックが通ること
- 既存の関連テストが両方とも通ること
- 2つは同一PRでも別々のPRでもよい（依存なし）

## 未解決の質問

- `generate-recap.ts` にも Part 2 と同じ決定論的パターン選択を逆輸入すべきか（recap は既に十分分散しているため優先度は低いが、将来同じ問題が再発する可能性はある）。Owner判断。
- `NUMERIC_AXES` のハッシュ選択はバッチ内の分散を保証しない（同じ試合IDのハッシュ値が偶然同じ余りになる可能性はゼロではない）。真に確実な分散が必要なら、cron 実行単位で使用済み軸を記録する仕組みが要るが、複雑度が上がるため本specでは簡易ハッシュ方式に留めた。
- Part 1 の `competitionLabel` に season を含める既存ロジックの有無を実装前に確認すること（本specでは未確認のまま前提を置いている）。
