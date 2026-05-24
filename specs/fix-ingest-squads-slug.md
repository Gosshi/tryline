# ingest-squads slug NOT NULL エラー修正

## 背景

`ingest-squads` cron が新規プレーヤー（例: Luke Cowan-Dickie）を挿入しようとすると以下エラーで落ちる。

```
code: '23502'
message: 'null value in column "slug" of relation "players" violates not-null constraint'
```

**根本原因:** `app/api/cron/ingest-squads/route.ts` の batch オブジェクトに `slug` フィールドが含まれていない。`players.slug` は `20260517010000_add_player_slugs.sql` で NOT NULL + UNIQUE 制約が追加されたが、アプリ側の挿入コードは更新されていなかった。

## スコープ

**対象:** `app/api/cron/ingest-squads/route.ts` のみ

**対象外:**
- `lib/scrapers/wikipedia-squads.ts`
- DB スキーマ・マイグレーション

## 実装詳細

### slug 生成関数を追加

マイグレーション SQL と同じアルゴリズムを TypeScript で実装する。
`route.ts` 内のトップレベル（import の直後）に追加すること。

```typescript
import { createHash } from "crypto";

function generatePlayerSlug(name: string): string {
  // ASCII 文字を含む名前はケバブケース
  const cleaned = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/, "");
  if (cleaned) {
    return cleaned;
  }
  // 非 ASCII（日本語等）は name の SHA-256 先頭 8 文字
  return "player-" + createHash("sha256").update(name, "utf8").digest("hex").slice(0, 8);
}
```

### batch に `slug` を追加

**変更前（L44〜L53付近）:**
```typescript
const batch = players
  .filter((player) => player.team_slug === teamSlug)
  .map((player) => ({
    team_id: teamId,
    name: player.name,
    position: player.position,
    caps: player.caps,
    date_of_birth: player.date_of_birth,
    external_ids: {
      wikipedia_title: player.name,
    },
    updated_at: new Date().toISOString(),
  }));
```

**変更後:**
```typescript
const batch = players
  .filter((player) => player.team_slug === teamSlug)
  .map((player) => ({
    team_id: teamId,
    name: player.name,
    slug: generatePlayerSlug(player.name),
    position: player.position,
    caps: player.caps,
    date_of_birth: player.date_of_birth,
    external_ids: {
      wikipedia_title: player.name,
    },
    updated_at: new Date().toISOString(),
  }));
```

### upsert 動作について

既存プレーヤーへの upsert（`onConflict: "team_id,name"`）では slug も UPDATE されるが、ASCII 名の再計算値は既存値と同一のため副作用なし。

日本語名プレーヤーは今回のスクレイプ対象外（Wikipedia squad URL は海外チーム想定）のため影響なし。

## 変更ファイルまとめ

| ファイル | 変更内容 |
|----------|---------|
| `app/api/cron/ingest-squads/route.ts` | `createHash` import 追加、`generatePlayerSlug` 関数を追加、batch に `slug` フィールドを追加 |

## 受け入れ条件

1. `ingest-squads` cron を実行してもエラーが出ない
2. "Luke Cowan-Dickie" が `slug: "luke-cowan-dickie"` で挿入される
3. 既存プレーヤーの slug が上書きされても変化しない（ASCII ケバブケースは冪等）
4. TypeScript ビルドが通る

## 参考

- エラー発生プレーヤー: Luke Cowan-Dickie（Hooker）
- エラーコード: Postgres 23502
- 制約追加マイグレーション: `supabase/migrations/20260517010000_add_player_slugs.sql`
- slug 生成ロジック: ASCII→ケバブケース、非 ASCII→`player-<sha256 先頭 8 文字>`