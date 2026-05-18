# PR54: canonical 候補スクリプトに web 検索モードを追加

## 背景

PR53 の `find-canonical-candidates.ts` で、カタカナ名の外国籍選手 139 件が
Levenshtein スコア 0.5 未満のため「未マッチ」になった。
これらはカタカナ→ローマ字変換の精度限界（例: "スミス" → "sumisu" ≠ "smith"）が原因。

`--search` フラグを追加し、未マッチのカタカナ名を Exa API で web 検索して
正しい英語名を取得し、canonical 候補を再マッチさせる。

## スコープ

対象:
- `scripts/find-canonical-candidates.ts` — `--search` モードを追加
- `pnpm add -D exa-js` — Exa API クライアントを devDependency に追加

対象外:
- 漢字名・ひらがな名の選手（英語エントリ自体が DB に存在しない可能性が高い）
- 自動 UPDATE の実行（出力 SQL は必ず人間が確認してから流す）

## 実行方法

```bash
EXA_API_KEY=xxx \
NEXT_PUBLIC_SUPABASE_URL=xxx \
SUPABASE_SERVICE_ROLE_KEY=yyy \
pnpm tsx scripts/find-canonical-candidates.ts --search >> candidates-search.md
```

通常モードで生成した candidates.md とは別ファイルに追記する想定。

---

## 変更詳細

### 1. 依存追加

```bash
pnpm add -D exa-js
```

### 2. `scripts/find-canonical-candidates.ts` への追記

#### フラグ判定

```typescript
const useSearch = process.argv.includes("--search");
```

#### EXA_API_KEY の検証

```typescript
if (useSearch && !process.env.EXA_API_KEY) {
  console.error("EXA_API_KEY is required for --search mode");
  process.exit(1);
}
```

#### web 検索用関数

```typescript
import Exa from "exa-js";

async function findEnglishName(japaneseName: string): Promise<string | null> {
  const exa = new Exa(process.env.EXA_API_KEY!);
  const result = await exa.search(`${japaneseName} rugby player`, {
    numResults: 3,
    type: "neural",
  });

  for (const r of result.results ?? []) {
    // Wikipedia タイトルパターン: "First Last - Wikipedia"
    const m = (r.title ?? "").match(/^([A-Z][a-zA-Z''\-]+(?: [A-Z][a-zA-Z''\-]+)+)/);
    if (m) {
      return m[1];
    }
  }

  return null;
}
```

#### `main()` への --search 処理追加

通常モードで「未マッチ」になったカタカナ主体の選手に対してのみ実行する。
`main()` の末尾、`console.log(lines.join("\n"))` の後に追加する。

```typescript
if (!useSearch) return;

const searchLines: string[] = [
  "",
  "## web 検索補完（--search モード）",
  "",
];

// unmatched players のうちカタカナ主体のみ対象
// ※ unmatched 配列は main() 内で構築済み。検索用に PlayerRow[] として別途保持する
for (const player of unmatchedKatakanaPlayers) {
  const englishName = await findEnglishName(player.name);
  if (!englishName) continue;

  const slugCandidate = toSlugCandidate(englishName);
  const scored = candidates
    .map((cp) => ({
      player: cp,
      score: similarity(slugCandidate, stripSuffix(cp.slug)),
    }))
    .filter(({ score }) => score >= 0.7) // 通常より閾値を高く設定して誤マッチを抑制
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  if (scored.length === 0) continue;

  const best = scored[0]!;
  searchLines.push(
    `### [検索] ${player.name} → ${best.player.slug}`,
    `- 英語名（検索結果）: ${englishName}`,
    `- uuid スラグ: \`${player.slug}\` (${teamNameFor(player)})`,
    `- 候補スラグ: \`${best.player.slug}\` (${teamNameFor(best.player)})`,
    `- スコア: ${best.score.toFixed(2)}`,
    `- SQL: \`UPDATE players SET canonical_player_id = '${best.player.id}' WHERE id = '${player.id}';\``,
    "",
  );
}

console.log(searchLines.join("\n"));
```

#### `unmatchedKatakanaPlayers` の保持

`unmatched` 配列（Markdown 文字列）とは別に、`PlayerRow[]` 型で未マッチのカタカナ選手を保持する変数を追加する。

```typescript
// main() 内、unmatched 配列の宣言と同じ箇所に追加
const unmatchedKatakanaPlayers: PlayerRow[] = [];

// カタカナ判定で未マッチになった際に追加
if (!isKatakanaDominant(player.name)) {
  unmatched.push(...);
} else if (scored.length === 0) {
  unmatched.push(...);
  unmatchedKatakanaPlayers.push(player); // ← 追加
}
```

---

## 受け入れ条件

- `--search` フラグなしの通常動作は変わらない
- `--search` フラグありで実行すると、未マッチのカタカナ名 139 件に対して web 検索が走る
- サム・ケイン → `sam-cane`、ジェラード・カウリートゥイオティ → `gerard-cowley-tuioti` 等の選手が正しくマッチする
- スコア閾値を 0.7 以上とし、誤マッチを抑制する
- `EXA_API_KEY` が未設定の場合は明確なエラーメッセージを出して終了する
- `pnpm build` でエラーなし

## 参考ファイル

- `scripts/find-canonical-candidates.ts` — PR53 で作成済み（追記対象）
- `exa-js` npm パッケージのドキュメントを参照して API 呼び出し方法を確認すること
