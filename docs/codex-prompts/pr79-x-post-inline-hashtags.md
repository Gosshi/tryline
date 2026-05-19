# PR #79 — X 投稿のインラインハッシュタグ化とチーム名データ修正

## 背景

現状の X 投稿はチーム名をプレーンテキストで出力し、固定ハッシュタグ行に `#観戦` や `#ラグビー #リーグワン`（英語アカウント）を含んでいる。

改善方針:
- 試合行のチーム名をそのままハッシュタグ化（`#チーム名 vs #チーム名`）して視認性とリーチを向上
- 不要・不適切なハッシュタグを削除してスリム化
- 誤ったチーム名「東京ブラックラムズ」を公式チーム名称「リコーブラックラムズ東京」へ修正（他 11 チームはスポンサー名込みの公式名称で統一済み）

## スコープ

対象:
- `lib/x/post.ts`
- `supabase/migrations/` — チーム名修正マイグレーション

対象外:
- ハッシュタグ生成ロジックの抽象化・汎用化（YAGNI）
- 他チームのデータ修正（公式サイト照合済み。誤りは「東京ブラックラムズ」の 1 件のみ）

## 変更内容

### 1. `lib/x/post.ts` — 試合行のインラインハッシュタグ

ハッシュタグ変換ヘルパーを追加する。X のハッシュタグはスペースで切れるため、チーム名のスペースを除去してから `#` を付ける:

```ts
function toHashtag(name: string): string {
  return `#${name.replace(/\s+/g, "")}`;
}
```

現状:
```ts
`${params.homeTeamName} ${score} ${params.awayTeamName}`
```

変更後:
```ts
`${toHashtag(params.homeTeamName)} ${score} ${toHashtag(params.awayTeamName)}`
```

fixedText の組み立て（`getPostWeightedLength` 用）と実際の投稿テキスト組み立ての **両方** を変更すること。フォールバック用の短縮テキスト（hashtagLine を省いた 5 行版）も同様に変更する。

日本語チーム名はスペースなしのため変換前後で同一になる（副作用なし）。

### 2. `lib/x/post.ts` — ハッシュタグ行の整理

現状:
```ts
const hashtagLine =
  params.language === "en"
    ? "#LeagueOne #Rugby #JapanRugby #ラグビー #リーグワン"
    : "#ラグビー #Ruby #観戦";
```

変更後:
```ts
const hashtagLine =
  params.language === "en"
    ? "#LeagueOne #Rugby #JapanRugby"
    : "#ラグビー #Rugby";
```

- 日本語: `#観戦` を削除（汎用すぎて価値なし）
- 英語: `#ラグビー #リーグワン` を削除（英語アカウントに日本語タグ不要）

### 3. マイグレーション — チーム名修正

```sql
UPDATE teams
SET name = 'リコーブラックラムズ東京'
WHERE name = '東京ブラックラムズ';
```

ファイル名: `supabase/migrations/<timestamp>_fix_black_rams_tokyo_name.sql`

> **注意**: `teams` テーブルを参照している外部キー制約やビューが存在する場合でも、チーム名（`name` カラム）は表示用文字列であり ID ではないため、`UPDATE` のみで問題ない。

## 投稿イメージ（変更後）

### 日本語プレビュー
```
📋 League One 2025-26 プレビュー
#東京サントリーサンゴリアス vs #リコーブラックラムズ東京

今節の注目カードはサンゴリアスとブラックラムズ東京の東京ダービー。サンゴリアスは連勝中の勢いそのままに...

▶️ https://www.trylinerugby.com/matches/xxx

#ラグビー #Rugby
```

### 日本語レビュー
```
🏉 League One 2025-26
#東京サントリーサンゴリアス 34 - 21 #リコーブラックラムズ東京

後半20分のターンオーバーを起点に3連続トライ。サンゴリアスが終盤に突き放し...

▶️ https://www.trylinerugby.com/matches/xxx

#ラグビー #Rugby
```

### 英語プレビュー
```
📋 League One 2025-26 Preview
#TokyoSuntorySungoliath vs #RicohBlackRamsTokyo

The Tokyo derby headlines this weekend's fixtures. Sungoliath enter on a four-match winning run...

▶️ https://www.trylinerugby.com/matches/xxx/en

#LeagueOne #Rugby #JapanRugby
```

## 文字数への影響

インラインハッシュタグ化で `#` が 2 文字追加される（各 1 ウェイト）。
日本語ハッシュタグ削除で `#観戦` 3 文字（6 ウェイト）が減る。
英語ハッシュタグ削除で `#ラグビー #リーグワン` が減る（各 CJK=2）。

ネットで文字数に余裕が生まれるため、excerpt の表示可能文字数は若干増える。
`fixedText` / `fixedLength` の再計算は既存ロジックが自動で処理するので、手動調整不要。

## テスト対象

既存テストがあれば以下を更新:
- `post.ts` に対するユニットテストで matchLine のスナップショット確認
- `hashtagLine` の ja/en 両パターンの確認

既存テストがない場合は新規作成しなくてよい（この PR のスコープ外）。

## 完了の定義

- [ ] `#チーム名 vs #チーム名` 形式が日英両方で出力される
- [ ] 日本語: `#ラグビー #Rugby` のみ（`#観戦` なし）
- [ ] 英語: `#LeagueOne #Rugby #JapanRugby` のみ（日本語タグなし）
- [ ] DB の「東京ブラックラムズ」が「リコーブラックラムズ東京」に変更されている
- [ ] TypeScript エラーなし・`pnpm build` 通過
