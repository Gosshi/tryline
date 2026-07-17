# Codex プロンプト: feat-match-stories（マッチストーリーズ v1）

> 仕様書 `specs/feat-match-stories.md` は確定済み（2026-07-17 Owner 承認）。
>
> **2 部構成・貼る順番厳守**: 必ず **プロンプト A（tryline）→ マージ・デプロイ後に → プロンプト B（tryline-mobile)** の順で貼る。B は A の API が本番に存在することを前提にする（push 通知実装時に B を先行させて手戻りした教訓）。

---

## プロンプト A（tryline リポジトリに貼る）

```
specs/feat-match-stories.md の Phase 1 のうち、Web 側（tryline）を実装してください。

- AGENTS.md の規約に従うこと
- 仕様書と実環境に食い違いがあれば、その場で実装を停止して Owner に確認すること（実装後に末尾で質問しない）
- スコープ対象外（仕様書 §3）は実装しないこと

### 実装対象

1. `GET /api/v1/stories` — 仕様書 §9・§10。新規テーブル・マイグレーションなし
2. `app/api/og/route.tsx` への `type=story` 追加 — 仕様書 §11
3. `lib/api/v1/types.ts` への V1StoryItemType / V1StoryItem / V1MatchStories / V1StoriesData 追加（snake_case・ABC順フィールド）

### 参考にすべき既存パターン

- ルート実装・パラメータ検証・キャッシュ定数: `app/api/v1/calendar/route.ts`、`lib/api/v1/response.ts`
- ペイウォール分割（locked 本文の除外）: `app/api/v1/matches/[id]/content/route.ts`、`lib/match-content/markdown.ts` の `splitRecapForPaywall`
- 週レンジ: `lib/format/week.ts`（`getCurrentJstWeekRangeUtc` / `formatJstWeekRangeLabel`）
- 試合取得: `lib/db/queries/matches.ts` の `getMatchesInRange`、コンテンツ状態: `lib/db/queries/match-content.ts`
- OG 描画・フォント読み込み: `app/api/og/route.tsx` の既存 type=result / type=calendar ブロック

### 入出力例

`GET /api/v1/stories`（今週に「日本 vs フランス」= finished 27-31、preview/recap published がある場合）:

{
  "data": {
    "week": { "from": "2026-07-13", "to": "2026-07-19", "label": "7月13日〜7月19日" },
    "matches": [
      {
        "match": { ...V1CalendarMatch... },
        "updated_at": "2026-07-19T02:10:00.000Z",
        "items": [
          { "id": "<uuid>:preview", "type": "preview", "title": "プレビュー｜日本 vs フランス",
            "summary": "…先頭段落から120字…", "published_at": "2026-07-16T21:05:00.000Z",
            "image": { "landscape_url": "/api/og?type=story&match=<uuid>&item=preview&orientation=landscape&v=1784322300",
                       "portrait_url": "/api/og?type=story&match=<uuid>&item=preview&orientation=portrait&v=1784322300" },
            "destination": { "type": "match", "url": "https://www.trylinerugby.com/matches/<uuid>" },
            "premium_required": false, "contains_result": false },
          { "id": "<uuid>:result", "type": "result", ... "contains_result": true },
          { "id": "<uuid>:recap", ... "premium_required": true, "contains_result": true }
        ]
      }
    ]
  },
  "error": null, "success": true
}

### エッジケース（必ずテストで押さえる）

- preview も recap もなく finished でもない試合 → matches に含めない
- finished だが片方のスコアが null → result Item を作らない
- cancelled → 試合ごと除外 / postponed → preview があるときのみ preview 1 件
- recap の summary が freeMd のみ由来であること（lockedMd の固有文字列が漏れない）
- サンプル試合（lib/sample-matches.ts）の recap は premium_required=false
- Authorization ヘッダの有無でレスポンスが変わらない
- og type=story: 存在しない match UUID → 200 の汎用ブランドカード / preview・recap 画像にスコア数字なし
- 週の試合が 12 件超 → kickoff 昇順で 12 件に打ち切り

### 完了の定義

- 仕様書 §19 の Web 側受け入れ条件 1〜11 を満たす
- `tests/` 配下の既存構成に倣い、上記エッジケースのテストを追加
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
- og type=story の portrait / landscape 出力のスクリーンショット（preview・result 各 1 枚）を PR に添付する。配色は app/globals.css のトークンと整合させ、スコアの誤描画がないことを目視できるようにする
```

---

## プロンプト B（tryline-mobile リポジトリに貼る。A のマージ・本番デプロイ後）

```
docs/specs/feat-match-stories.md の Phase 1 のうち、iOS 側（tryline-mobile）を実装してください。

- AGENTS.md の規約に従うこと
- 仕様書と実環境に食い違いがあれば、その場で実装を停止して Owner に確認すること
- スコープ対象外（仕様書 §3）は実装しないこと。特に新規依存パッケージの追加は禁止

### 実装対象

1. ホーム（app/(tabs)/index.tsx）の週ナビ直下に「今週のマッチストーリーズ」横スクロールセクション — 仕様書 §7
2. 全画面ビューアー（操作仕様は §8、A11y は §15、エラー/フォールバックは §14）
3. iOS share sheet 共有（React Native 標準の Share API。portrait 画像＋UTM 付き URL）— §8・§16
4. ローカル既読管理（SecureStore、週キー・プルーニング）— §13
5. API クライアント: src/api/client.ts に stories 取得を追加。型は reference/api-types.ts のスナップショットに従う

### 参考にすべき既存パターン

- 画面・状態表示: app/(tabs)/index.tsx、src/components/States.tsx、src/components/MatchCard.tsx
- チーム表示: src/components/TeamIdentity.tsx / スコアマスク文言: src/components/ScoreText.tsx
- spoiler guard・revealedMatchIds・SecureStore: src/settings/SettingsProvider.tsx
- テーマトークン: src/theme/tokens.ts / 週レンジ: src/api/dates.ts の getJstWeekRange

### エッジケース（必ずテストで押さえる）

- 未知の Story Item type を含むレスポンス → クラッシュせず読み飛ばす
- spoilerGuard ON・未開示 finished 試合 → result/recap がマスクされ、マスク中は該当画像 URL への fetch が発生しない（テストで検証）
- 開示操作が revealedMatchIds を経由し、試合詳細・カレンダーのマスクも同時解除される
- locked recap: 価格・購入導線・購読勧誘文言を一切表示しない（ログイン案内のみ。審査 3.1.1）
- 画像取得失敗 → テキスト＋ブランド背景で成立、共有は URL のみに縮退
- Reduce Motion / VoiceOver 有効時は自動送り無効

### 完了の定義

- 仕様書 §19 の iOS 側受け入れ条件 12〜20 を満たす
- 既存 Jest 構成に倣いテストを追加。typecheck / lint / test が通る
- ビューアーとホームセクションのスクリーンショット（マスク状態・開示状態・locked 状態の 3 パターン）を PR に添付。src/theme/tokens.ts のトークンを使い、テンプレ的な白カード羅列を避け、編集紙面路線（feat-mobile-editorial-polish）と整合させること。最終的なデザイン承認は Owner の実機目視で行う
```

---

## Owner 向け運用メモ

- A のマージ時: 新テーブルなしなのでマイグレーション先行は不要。ただしマージ後に `lib/api/v1/types.ts` → `tryline-mobile/reference/api-types.ts` の手動同期を忘れない（確立済み運用）
- B を貼る前に: A が本番で `GET /api/v1/stories` 200 を返すことを確認
- 実装が返ってきたら `codex-review` スキルでレビュー（spoiler 漏れ・locked 漏れ・IAP 文言を重点チェック）
