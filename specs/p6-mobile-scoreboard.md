# モバイル スコアボード チーム名省略修正

## 背景

375px のモバイルビューポートで試合詳細ページのスコアボードを表示すると、
チーム名が途中で切断されている（例:「Northampton…」「Harlequin…」）。
チーム名はユーザーが最初に確認する情報であり、切断は信頼感を損なう。

省略する場合は適切な略称（クラブ公式の 3 文字コードまたは都市名）を使うか、
2 行表示にして全体を見せるかのどちらかが必要である。

## スコープ

対象:
- 試合詳細ページのスコアボードコンポーネント（モバイル表示）

対象外:
- デスクトップ表示（1024px 以上は問題なし）
- 試合一覧カードのチーム名（別途評価）

## 変更内容

### 方針

短縮名（`short_name`）フィールドが `teams` テーブルに存在する場合はそれを使用する。
存在しない場合は CSS `word-break: break-word` + 2 行表示で全体を表示する。

### Option A: `short_name` フィールドを使用（推奨）

```sql
-- teams テーブルに short_name があるか確認
SELECT id, name, short_name FROM teams LIMIT 10;
```

`short_name` がある場合:

```tsx
// スコアボードコンポーネント
<span className="md:hidden">{team.short_name ?? team.name}</span>
<span className="hidden md:inline">{team.name}</span>
```

### Option B: 2 行表示（`short_name` がない場合）

```tsx
<span className="text-center leading-tight break-words max-w-[120px]">
  {team.name}
</span>
```

`text-ellipsis` / `truncate` クラスを削除し、`break-words` を追加する。

## 変更ファイル

- `components/match-scoreboard.tsx`（またはスコアボード相当コンポーネント）
- `lib/db/teams.ts`（`short_name` を SELECT に追加する場合）

## 受け入れ条件

- [ ] 375px 幅でチーム名が切断されずに表示される
- [ ] `short_name` を使用する場合は全大会のチームに値が存在する
- [ ] 2 行表示の場合はスコアと縦位置が整合している
- [ ] デスクトップ（1024px 以上）のスコアボード表示に変化がない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

1. `teams` テーブルに `short_name` フィールドが存在するか（DB 確認が必要）
2. 存在しない場合、マイグレーションでカラムを追加するか、CSS のみで対応するか
