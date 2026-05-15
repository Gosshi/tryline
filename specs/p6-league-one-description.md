# League One 大会説明文追加

## 背景

`/c/league-one` ページには大会の説明が一切なく、
「League One」というタイトルと試合一覧のみが表示されている。

日本のラグビーファンにとって League One は馴染みが薄い大会名であり、
「どのリーグか」「どのレベルか」「どの国のリーグか」が直感的にわからない。
サービスの説明文にも League One が記載されていない場合、
ユーザーは大会の位置づけを理解できない。

## スコープ

対象:
- `/c/league-one` ページのヘッダーへの大会説明文追加
- ホームのサービス説明文への League One 記載

対象外:
- 試合データの追加
- 他大会の説明文変更

## 変更内容

### League One 大会ページへの説明文追加

大会ページのヘッダーに説明文を追加する。
コード内定数として管理するか、`competitions.description` カラムから取得するかは
DB のスキーマを確認してから決定する。

コード内定数の場合:

```tsx
// app/c/[family]/page.tsx またはヘッダーコンポーネント
const COMPETITION_DESCRIPTIONS: Record<string, string> = {
  'league-one':
    'ジャパンラグビー リーグワン（League One）は日本のプロラグビーリーグです。' +
    '国内最高峰のクラブが参加し、各シーズンを通じてリーグ優勝を争います。',
};

{COMPETITION_DESCRIPTIONS[family] && (
  <p className="mt-2 text-sm text-slate-500">
    {COMPETITION_DESCRIPTIONS[family]}
  </p>
)}
```

### ホームページの対応大会説明文の更新

```tsx
// 変更前（League One が未記載）
<p>Six Nations、Premiership、URC、Top 14、Rugby Championship をカバー</p>

// 変更後
<p>Six Nations、Premiership、URC、Top 14、Rugby Championship、
   ジャパンラグビー リーグワン をカバー</p>
```

## 変更ファイル

- `app/c/[family]/page.tsx`（または大会ページのヘッダーコンポーネント）
- `app/page.tsx`（ホームの対応大会説明文）

## 受け入れ条件

- [ ] `/c/league-one` ページに日本語の大会説明が表示される
- [ ] 説明文を読んだユーザーが League One の位置づけを理解できる
- [ ] ホームまたはサービス説明に League One が明記されている
- [ ] 他大会のページに意図しない説明文が追加されていない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

1. `competitions` テーブルに `description` カラムが存在するか（DB 確認が必要）
2. 説明文の内容は Owner が確認・承認する必要がある
