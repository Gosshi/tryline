# Codex プロンプト: fix-mobile-status-labels

**tryline-mobile リポジトリ**で貼る（仕様書はコピー設置済み: `docs/specs/fix-mobile-status-labels.md`）。

---

`docs/specs/fix-mobile-status-labels.md` の仕様を実装してください。

コンテキスト:
- `AGENTS.md` を読む
- 変更対象は小さい: ステータスラベル関数の新設＋表示 2〜3 箇所の差し替え＋`.gitignore` 追加のみ
- `match.status` の表示箇所は `git grep "match.status\|\.status" src app` で漏れなく洗う

エッジケース:
- 未知のステータス値はそのまま表示（クラッシュ・空文字にしない）
- tracked 済みの `expo-env.d.ts` は `git rm --cached` で index から外す（ワーキングツリーからは消さない）

完了の定義: 受け入れ条件 1〜4、CI green。スコープ外の文言・レイアウト変更をしない。
