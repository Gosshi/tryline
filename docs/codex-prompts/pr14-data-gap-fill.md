# chore: データ欠損を検出して補完するスクリプト・Cron

## 目的

試合結果（`status = 'finished'`）はあるが、
得点イベント（`match_events`）が 0 件の試合を検出し、
Wikipedia からイベントデータを自動補完する。
既存の Wikipedia スクレイパーとイベント upsert ロジックを再利用する。

**必ず `design.md` を最初に読んでから実装すること（UI 変更はないが確認として）。**

---

## 参照すべきファイル

- `scripts/backfill-match-events.ts` — 既存バックフィルロジックのパターンを踏襲する
- `lib/scrapers/wikipedia-match-events.ts` — `parseMatchEventsFromVeventHtml`
- `lib/ingestion/events.ts` — `upsertMatchEvents`
- `lib/scrapers/index.ts` — `fetchWithPolicy`
- `app/api/cron/orchestrate/route.ts` — cron ルートの認証パターン参照

---

## 実装

### 1. `scripts/fill-event-gaps.ts` を新規作成

```ts
/**
 * 得点イベントが欠損している試合を検出し Wikipedia から補完する。
 *
 * Usage:
 *   pnpm tsx scripts/fill-event-gaps.ts [--dry-run] [--limit=50]
 */

import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { fetchWithPolicy } from "@/lib/scrapers";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";

type CliOptions = { dryRun: boolean; limit: number };

function parseOptions(argv: string[]): CliOptions {
  let dryRun = false;
  let limit = 50;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") { dryRun = true; continue; }
    if (argv[i]?.startsWith("--limit=")) {
      limit = parseInt(argv[i].slice("--limit=".length), 10);
    }
  }
  return { dryRun, limit };
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function main() {
  const opts = parseOptions(process.argv.slice(2));
  const client = getSupabaseServerClient();

  // events が 0 件かつ wikipedia URL を持つ試合を取得
  const { data: matches, error } = await client
    .from("matches")
    .select(
      `id, external_ids,
       home_team:teams!matches_home_team_id_fkey(name),
       away_team:teams!matches_away_team_id_fkey(name),
       match_events(id)`,
    )
    .eq("status", "finished")
    .limit(opts.limit);

  if (error) throw error;

  const gaps = (matches ?? []).filter(
    (m) =>
      m.match_events.length === 0 &&
      typeof (m.external_ids as Record<string, unknown>)?.wikipedia === "string",
  );

  console.log(`Found ${gaps.length} matches with missing events`);
  if (opts.dryRun) {
    for (const m of gaps) {
      console.log(`[dry-run] ${m.home_team?.name} vs ${m.away_team?.name} (${m.id})`);
    }
    return;
  }

  let filled = 0;
  for (const m of gaps) {
    const url = (m.external_ids as Record<string, unknown>).wikipedia as string;
    console.log(`Fetching ${url} ...`);
    try {
      const html = await fetchWithPolicy(url);
      const events = parseMatchEventsFromVeventHtml(html, m.id);
      if (events.length === 0) {
        console.log(`  → no events parsed, skipping`);
        continue;
      }
      await upsertMatchEvents(m.id, events);
      console.log(`  → upserted ${events.length} events`);
      filled++;
    } catch (err) {
      console.error(`  → error: ${String(err)}`);
    }
    await sleep(2000);
  }

  console.log(`Done. Filled ${filled}/${gaps.length} matches.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

---

### 2. `app/api/cron/fill-event-gaps/route.ts` を新規作成

同処理を cron として呼び出せるルート。1 回の実行で最大 20 件処理する。

```ts
import { assertCronAuthorized } from "@/lib/auth/cron";
import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { fetchWithPolicy } from "@/lib/scrapers";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";

export const runtime = "nodejs";
export const maxDuration = 60;

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function POST(request: Request) {
  assertCronAuthorized(request);

  const client = getSupabaseServerClient();
  const { data: matches, error } = await client
    .from("matches")
    .select(
      `id, external_ids,
       match_events(id)`,
    )
    .eq("status", "finished")
    .limit(20);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const gaps = (matches ?? []).filter(
    (m) =>
      m.match_events.length === 0 &&
      typeof (m.external_ids as Record<string, unknown>)?.wikipedia === "string",
  );

  let filled = 0;
  const errors: string[] = [];

  for (const m of gaps) {
    const url = (m.external_ids as Record<string, unknown>).wikipedia as string;
    try {
      const html = await fetchWithPolicy(url);
      const events = parseMatchEventsFromVeventHtml(html, m.id);
      if (events.length > 0) {
        await upsertMatchEvents(m.id, events);
        filled++;
      }
    } catch (err) {
      errors.push(`${m.id}: ${String(err)}`);
    }
    await sleep(1500);
  }

  return Response.json({ gaps: gaps.length, filled, errors });
}
```

---

### 3. `.github/workflows/cron-fill-event-gaps.yml` を新規作成

毎週日曜 UTC 06:00（JST 15:00）に実行。

```yaml
name: Cron — Fill Event Gaps

on:
  schedule:
    - cron: '0 6 * * 0'   # 毎週日曜 JST 15:00
  workflow_dispatch:

jobs:
  fill-event-gaps:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger fill-event-gaps
        run: |
          curl -f -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://tryline-six.vercel.app/api/cron/fill-event-gaps
```

---

## 変更・作成するファイル

- `scripts/fill-event-gaps.ts`（新規作成）
- `app/api/cron/fill-event-gaps/route.ts`（新規作成）
- `.github/workflows/cron-fill-event-gaps.yml`（新規作成）

## 変更しないこと

- 既存の `scripts/backfill-match-events.ts`
- `lib/scrapers/wikipedia-match-events.ts`
- `lib/ingestion/events.ts`
- 既存ルート・クエリ

## 完了条件

- `pnpm tsx scripts/fill-event-gaps.ts --dry-run` が動作すること
- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- cron ルートが `Authorization` ヘッダーなしで 401 を返すこと
- `workflow_dispatch` で手動実行できること

## ブランチ・PR

- ブランチ: `chore/fill-event-gaps`
- PR タイトル: `Chore: add fill-event-gaps script and cron route`
