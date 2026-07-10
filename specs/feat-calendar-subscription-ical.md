# Google/Apple Calendar向けのiCalカレンダー購読機能を追加する

## 背景

2026-07-10、Codex（新モデル）による集客分析で「再訪力が高い」と評価された施策。Trylineの独自価値である「海外大会横断・日本時間表示」は、iCal形式でのカレンダー購読と特に相性が良い。ユーザーが一度購読すれば、Google/Apple Calendarに自動で試合予定が反映され続け、継続的な再訪動機になる。

## スコープ

対象:
- 大会別（例: Nations Championship 2026）・全大会横断の2種類のiCalフィード（`.ics`形式）を生成するエンドポイントを追加する
- 各カレンダーイベントには、対戦カード・キックオフ日時（JST）・試合ページへのリンクを含める
- `/calendar` ページに「カレンダーに追加（Google/Apple対応）」のボタン・購読URLを追加する

対象外:
- カレンダーアプリからのリマインダー通知等、iCal標準仕様を超えるカスタム機能
- チーム別のカレンダーフィード（大会別・全体の2種類に留める。将来的な拡張候補として完了報告に記載してよい）

## API サーフェス

- `GET /api/calendar/[competitionSlug].ics`: 指定大会の試合予定をiCal形式で返す
- `GET /api/calendar/all.ics`: 全大会横断の試合予定をiCal形式で返す

## UI サーフェス

`/calendar` ページに、上記エンドポイントへの購読リンク（`webcal://` スキームまたは通常のURLコピー）を追加する。

## 受け入れ条件

1. `/api/calendar/all.ics` にアクセスすると、今後開催予定の試合を含む有効なiCalファイルが返る（Google Calendar・Apple Calendarで実際に読み込めることを確認する）
2. 大会別エンドポイント（例: `/api/calendar/nations-championship.ics`）が該当大会の試合のみを返す
3. 各イベントの日時が正しくJSTで表示される（タイムゾーン変換に誤りがない）
4. `/calendar` ページに購読導線がある
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
6. 本番デプロイはOwner承認後に別途行う

## 未解決の質問

- iCal生成に既存ライブラリ（`ical-generator`等）を使うか自前実装するかはCodexの判断に委ねる。軽量な依存追加は許容する
