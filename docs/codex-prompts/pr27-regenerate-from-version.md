# feat: regenerate-overseas-content に --from-version フラグ追加

## 背景

`scripts/regenerate-overseas-content.ts` は現在、`prompt_version !== currentVersion`
のコンテンツをすべて再生成する。バージョン管理が細かくなると過去の古いバージョンも
巻き込んで再生成されるリスクがある。

`--from-version=recap@1.8.0` を指定できるようにすることで、
「ちょうどこのバージョンのコンテンツだけを再生成する」という外科的な絞り込みを可能にする。
指定なしの場合は従来どおり `currentVersion` 以外すべてを対象とする。

---

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `scripts/regenerate-overseas-content.ts` | `--from-version` フラグ追加 |
| `tests/scripts/regenerate-overseas-content.test.ts`（存在する場合） | テスト追加 |

---

## 変更内容

### 1. `CliOptions` 型に `fromVersion` を追加

```typescript
type CliOptions = {
  contentType: ContentType;
  dryRun: boolean;
  family: string | null;
  fromVersion: string | null;  // 追加
};
```

### 2. `parseArgs` 関数に `--from-version` 引数を追加

既存の `--family` 引数と同じパターンで実装する。

```typescript
export function parseArgs(argv: string[]): CliOptions {
  let contentType: ContentType = "recap";
  let dryRun = false;
  let family: string | null = null;
  let fromVersion: string | null = null;  // 追加

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    // ...既存の --content-type, --family, --dry-run 処理...

    if (arg === "--from-version") {
      fromVersion = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--from-version=")) {
      fromVersion = arg.slice("--from-version=".length) || null;
      continue;
    }
  }

  return { contentType, dryRun, family, fromVersion };  // fromVersion 追加
}
```

### 3. `buildTargetRows` のシグネチャと本体を更新

`fromVersion` パラメータを追加し、指定がある場合は `prompt_version === fromVersion` の行だけを対象にする。

```typescript
function buildTargetRows(params: {
  contentRows: ContentRow[];
  currentVersion: string;
  family: string | null;
  fromVersion: string | null;  // 追加
}) {
  const counters = {
    skippedCurrentVersion: 0,
    skippedFamily: 0,
    skippedFromVersion: 0,  // 追加
    skippedLeagueOne: 0,
  };

  // ...既存のループ内...

  // 既存の currentVersion スキップ（変更なし）
  if (row.prompt_version === params.currentVersion) {
    counters.skippedCurrentVersion += 1;
    continue;
  }

  // fromVersion 指定がある場合は、それ以外の古いバージョンをスキップ
  if (params.fromVersion !== null && row.prompt_version !== params.fromVersion) {
    counters.skippedFromVersion += 1;
    continue;
  }

  targets.push({ ... });
}
```

戻り値に `skippedFromVersion` を含める。

### 4. `RunDeps` 型に `fromVersion` を追加

```typescript
type RunDeps = {
  contentType: ContentType;
  currentVersion?: string;
  db: SupabaseClient<Database>;
  dryRun: boolean;
  family: string | null;
  fromVersion: string | null;  // 追加
  generateContent: (matchId: string, contentType: ContentType) => Promise<PipelineResult>;
  logger?: Logger;
};
```

### 5. `runRegenerateOverseasContent` から `buildTargetRows` へ `fromVersion` を渡す

```typescript
const { skippedCurrentVersion, skippedFamily, skippedFromVersion, skippedLeagueOne, targets } =
  buildTargetRows({
    contentRows,
    currentVersion,
    family,
    fromVersion,  // 追加
  });
```

`RegenerateOverseasContentResult` 型と `result` オブジェクトに `skippedFromVersion` を追加する。

### 6. ログに `fromVersion` を表示

```typescript
logger.log(
  `Overseas ${contentType} regeneration targets: total=${contentRows.length} target=${targets.length} currentVersion=${currentVersion} fromVersion=${fromVersion ?? "any"}`,
);
```

### 7. `main` 関数から `fromVersion` を渡す

スクリプト末尾の `runRegenerateOverseasContent` 呼び出しに `fromVersion: options.fromVersion` を追加する。

---

## 使用例

```bash
# recap@1.8.0 のコンテンツだけを再生成（他の古いバージョンは触らない）
set -a; source .env.production.local; set +a; \
  pnpm tsx scripts/regenerate-overseas-content.ts \
    --content-type=recap \
    --from-version=recap@1.8.0 \
    --dry-run

# family を絞ってさらに外科的に実行
set -a; source .env.production.local; set +a; \
  pnpm tsx scripts/regenerate-overseas-content.ts \
    --content-type=recap \
    --family=urc \
    --from-version=recap@1.8.0

# --from-version 省略時は従来どおり（currentVersion 以外すべて対象）
set -a; source .env.production.local; set +a; \
  pnpm tsx scripts/regenerate-overseas-content.ts \
    --content-type=recap \
    --family=premiership
```

---

## 完了条件

- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス
- [ ] `parseArgs(["--from-version=recap@1.8.0"])` が `{ fromVersion: "recap@1.8.0", ... }` を返す
- [ ] `--from-version` 指定時、対象バージョン以外の古いコンテンツが `skippedFromVersion` としてカウントされる
- [ ] `--from-version` 未指定時の動作が従来と変わらない（後方互換）
- [ ] `parseArgs` 単体テストに `--from-version` のケースが追加されている（テストファイルが存在する場合）

---

## 参照ファイル

| ファイル | 参照目的 |
|---------|---------|
| `scripts/regenerate-overseas-content.ts` | 変更対象（`parseArgs`, `buildTargetRows`, `RunDeps`, `runRegenerateOverseasContent`） |
| `tests/scripts/regenerate-overseas-content.test.ts` | テスト追加対象（存在する場合） |
