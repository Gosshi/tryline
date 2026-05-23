# SNS: 試合結果グラフィック画像の Discord 通知への追加

## 背景

X（Twitter）の投稿はテキストのみで、試合結果グラフィック画像が添付されていない。
画像付きツイートはテキストのみと比較してインプレッションが 30〜50% 高いとされており、
認知獲得フェーズの現在において最も即効性のある改善の一つ。

既に `app/api/og/route.tsx` に `@vercel/og` を使った OGP 画像生成が実装されており、
これを 16:9 比率の試合結果グラフィックとして転用・拡張する。

Discord の `notify-discord` cron が既にツイートドラフトを通知しているため、
この通知に **画像 URL** を追記することで Owner が X 投稿時に手動添付できる。

## スコープ

対象:
- `app/api/og/route.tsx` — `type=result` モードの追加（試合結果グラフィック用）
- `app/api/cron/notify-discord/route.ts` — Discord embed に `image.url` フィールドを追加

対象外:
- X API による自動投稿（手動投稿フローを維持する）
- 画像の自動添付（Discord に URL を表示し Owner が手動添付する）

## データモデル変更

なし

## API サーフェス

### `GET /api/og?type=result&home={homeTeam}&away={awayTeam}&hs={homeScore}&as={awayScore}&comp={competitionLabel}`

既存の `/api/og` ルートに `type=result` モードを追加。
**データは全てクエリパラメータで受け取る**（edge runtime の DB アクセス制限を回避）。

| パラメータ | 型 | 説明 |
|---|---|---|
| `type` | `"result"` | このモードを選択 |
| `home` | string | ホームチーム名（英語） |
| `away` | string | アウェイチーム名（英語） |
| `hs` | string | ホームスコア（null の場合は省略） |
| `as` | string | アウェイスコア（null の場合は省略） |
| `comp` | string | 大会名ラベル |

サイズ: `1200 × 675`（16:9 / X 推奨サイズ）

レイアウト例:
```
┌──────────────────────────────────────────┐
│ TRYLINE                    Six Nations   │
│                                          │
│   Ireland         22 — 17      France   │
│                                          │
│              2026-02-01                  │
└──────────────────────────────────────────┘
```

スコアが null の場合は `vs` と表示する。

### Discord 通知への画像フィールド追加

`app/api/cron/notify-discord/route.ts` の embed に `image` フィールドを追加:

```typescript
const resultImageUrl = new URL("https://www.trylinerugby.com/api/og");
resultImageUrl.searchParams.set("type", "result");
resultImageUrl.searchParams.set("home", homeDisplayName);
resultImageUrl.searchParams.set("away", awayDisplayName);
if (match.home_score !== null) resultImageUrl.searchParams.set("hs", String(match.home_score));
if (match.away_score !== null) resultImageUrl.searchParams.set("as", String(match.away_score));
resultImageUrl.searchParams.set("comp", competitionLabel);

const payload: DiscordPayload = {
  embeds: [{
    // 既存フィールド
    image: { url: resultImageUrl.toString() },  // ← 追加
  }],
};
```

recap（試合後）の通知にのみ `image` を付与する。preview には付与しない。

## UI サーフェス

なし（画像生成 API と Discord 通知の変更のみ）

## LLM 連携

なし

## 受け入れ条件

1. `GET /api/og?type=result&home=Ireland&away=France&hs=22&as=17&comp=Six+Nations` が
   1200×675 の PNG を返す
2. 画像にホームチーム名・スコア・アウェイチーム名・大会名が含まれる
3. Discord の recap 通知 embed に画像が表示される
4. preview 通知には画像が付与されない
5. 既存の OGP 画像（`/api/og?title=...` 等）が引き続き動作する（後方互換）
6. `tsc --noEmit` でビルドエラーなし

## 未解決の質問

- `app/api/og/route.tsx` の既存クエリパラメータのスキーマを確認し、
  `type=result` の条件分岐を追加する位置を決めること
- 日本語チーム名が渡される場合（JA コンテンツ）の文字幅・フォント対応を確認すること
