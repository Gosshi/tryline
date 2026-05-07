# fix-nations-cup-rename: Pacific Nations Cup → Nations Cup 名称更新

## 背景

2024年より大会名が "Pacific Nations Cup" から "Nations Cup" に変更された。
コード上の表示名とインポートスクリプトを更新する。

内部スラグ（`pacific-nations-cup`）と family（`pnc`）はそのまま維持する。
変更するのは **ユーザー向け表示名** のみ。

## 変更箇所（3ファイル）

### 1. `lib/format/competition.ts`

```typescript
// 変更前
"pacific-nations-cup": "Pacific Nations Cup",

// 変更後
"pacific-nations-cup": "Nations Cup",
```

### 2. `scripts/import-world-rugby-full.ts`

```typescript
// 変更前（65行目付近）
pnc: "Pacific Nations Cup",

// 変更後
pnc: "Nations Cup",
```

### 3. `lib/scrapers/world-rugby-schedule.ts`

```typescript
// 変更前（102行目付近）
if (normalized.includes("pacific nations cup")) {

// 変更後（後方互換のため両方にマッチさせる）
if (normalized.includes("nations cup") || normalized.includes("pacific nations cup")) {
```

## DB の既存データ更新

`competitions` テーブルに "Pacific Nations Cup" で登録済みの行がある場合、
以下の SQL を Supabase ダッシュボードで手動実行する（Codex は実行しないこと）:

```sql
UPDATE competitions
SET name = 'Nations Cup'
WHERE name = 'Pacific Nations Cup';
```

## 完了条件

- `pnpm tsc --noEmit` パス
- `lib/format/competition.ts` の表示名が "Nations Cup" になっている
- `import-world-rugby-full.ts` の competition 名が "Nations Cup" になっている
- `world-rugby-schedule.ts` が "nations cup" と "pacific nations cup" 両方にマッチする

## ブランチ・PR

- ブランチ: `fix/nations-cup-rename`
- PR タイトル: `Fix: rename Pacific Nations Cup to Nations Cup`
