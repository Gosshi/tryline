# feat-competition-guides: 大会ガイド（family 別）

## 背景

各大会ページ（`/c/six-nations` 等）に「大会ガイド」セクションを追加し、初めて訪れたユーザーが大会の基本情報をすぐ把握できるようにする。また Google に対してコンテキストのある長文コンテンツを提供し、大会名クエリでの CTR 改善を狙う。

現在 `competitions.viewing_guide_ja` カラムが存在するが全件 null。シーズン別テーブルに置くのは設計上不適切なため、family 単位の専用テーブルに移す。

## スコープ

**対象:**
- `competition_guides` テーブルの新設と RLS
- `competitions.viewing_guide_ja` カラムの削除（全件 null のため安全）
- DB クエリの更新（`getCompetitionGuide(family)`）
- 大会ページの表示ロジック変更
- `CompetitionViewingGuide` 見出しを「日本での視聴方法」→「大会ガイド」に変更
- 11 family 分のガイドコンテンツ生成・INSERT（SQL seed）

**対象外:**
- ガイドの管理 UI（Codex や Owner が直接 DB 更新）
- 英語ガイド
- 大会ページ以外でのガイド表示

---

## データモデル

### 新テーブル: `competition_guides`

```sql
create table public.competition_guides (
  family text primary key,
  guide_ja text not null,
  updated_at timestamptz not null default now()
);

alter table public.competition_guides enable row level security;

create policy "competition_guides are publicly readable"
  on public.competition_guides for select using (true);
```

### `competitions` テーブルから削除

```sql
alter table public.competitions drop column if exists viewing_guide_ja;
```

---

## ガイドコンテンツ仕様

### 対象 family（11件）

`six-nations` / `premiership` / `urc` / `top-14` / `super-rugby-pacific` / `rugby-championship` / `nations-championship` / `rwc` / `autumn-nations` / `pnc` / `league-one`

### Markdown 構成（各 family 共通）

```markdown
## 大会概要
[参加チーム数・形式・開催時期・会場など 3〜5 文]

## 歴代王者
[直近 5〜8 シーズン分の優勝チームをテーブルまたはリスト形式で]

## 注目の選手
[現在または過去に在籍した海外スター・日本代表選手など 3〜5 名を具体的に紹介]

## 日本での視聴方法
[DAZN・J SPORTS・WOWOW・NHK 等、実際に加入できる視聴手段を箇条書き]
```

- 全体で 400〜800 字程度（簡潔に、読み切れる量）
- 事実ベース。LLM が不確かな場合は「〜とされています」等で曖昧さを示す
- 視聴方法は 2026 年時点の情報で記載

### コンテンツ生成方法

OpenAI `gpt-4o` を使い、各 family に対して以下のプロンプトで生成する。

```
あなたは海外ラグビーに詳しい日本語ライターです。
以下の大会について、日本のラグビーファン向けの簡潔なガイドを Markdown で書いてください。

大会: {family_name_ja}（{family}）

以下のセクションを含めること：
1. ## 大会概要（参加チーム・形式・開催時期）
2. ## 歴代王者（直近5〜8シーズン、テーブル形式）
3. ## 注目の選手（現在または過去の海外スター・日本代表選手を3〜5名）
4. ## 日本での視聴方法（DAZN・J SPORTS・WOWOW等）

全体で400〜800字。事実に基づき、不確かな情報には「〜とされています」を使う。
```

生成後は SQL の INSERT 文として `supabase/seeds/competition-guides.sql` に保存し、Supabase ダッシュボードまたは `supabase db push` で適用する。

---

## API サーフェス

### 新クエリ: `getCompetitionGuide(family: string): Promise<string | null>`

```typescript
// lib/db/queries/competitions.ts に追加
export async function getCompetitionGuide(
  family: string,
): Promise<string | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("competition_guides")
    .select("guide_ja")
    .eq("family", family)
    .maybeSingle();

  if (error) throw error;
  return data?.guide_ja ?? null;
}
```

### 削除: `CompetitionRow.viewingGuideJa`

`CompetitionRow` 型と `mapCompetitionRow` から `viewingGuideJa` を削除する。

---

## UI サーフェス

### `app/c/[competition]/page.tsx`

#### 変更前

```typescript
// latestSeason.viewingGuideJa を CompetitionViewingGuide に渡している
<CompetitionViewingGuide markdown={latestSeason.viewingGuideJa} />
```

#### 変更後

```typescript
// 大会ページのデータフェッチに追加
const guide = await getCompetitionGuide(latestSeason.family);

// JSX
<CompetitionViewingGuide markdown={guide} />
```

### `components/competition-viewing-guide.tsx`

見出しを変更する。

```typescript
// 変更前
<h2 ...>日本での視聴方法</h2>

// 変更後
<h2 ...>大会ガイド</h2>
```

---

## 受け入れ条件

1. `/c/league-one` を開くと「大会ガイド」セクションが表示され、リーグワンの概要・歴代王者・注目選手・視聴方法が読める
2. 11 family すべてでガイドが表示される
3. ガイドのない大会（将来の新規追加等）では `CompetitionViewingGuide` が非表示になる（`null` 時の既存ガード）
4. `competitions` テーブルに `viewing_guide_ja` カラムが存在しない
5. `pnpm tsc --noEmit` パス
6. `pnpm build` パス

---

## 未解決の質問

1. **歴代王者の正確性**: LLM 生成後に Owner が確認・修正する運用で良いか
2. **視聴方法の鮮度**: DAZN/J SPORTS の契約状況は毎年変わりうるため、更新タイミングをどうするか（年 1 回 Owner 更新で十分か）
