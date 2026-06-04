# 残タスク整理 — 2026-06-04

> このセッション（index bloat / 捏造修正 / イベント回収 / O2 / note 立ち上げ / 放送情報 / ラグビーAI 構想）の未完・保留・将来タスクの整理。次セッションの起点。

## ✅ 完了（本番反映済み）
- **index bloat 修正**: 薄い選手ページ noindex・`/teams` canonical 統一・sitemap 整理（#359-361）
- **捏造修正（recap）**: live published 捏造 = 0（予防#344＋match-id再生成＋draft降格）
- **イベント回収**: URC 3%→88%（専用パーサ backfill #362）・SRP 11%→100%（fill-event-gaps URL正規化）・recap 53→129 復活
- **O2 サンプルrecap公開**: 8試合を全文無料・SSR（#363）
- **pricing 無料導線**: 「無料で記事を読む」を primary サンプルへ
- **X スパム掃除**: 5/23 自動投稿9件を API 削除
- **note 立ち上げ**: 自己紹介＋週末まとめ＋プレビュー記事（3本公開）

---

## 1. 今週の運用（すぐ・Owner）
- [ ] **明日(6/5): 決勝記事**（神戸×クボタ・人間ドラマ裏取りして公開・6/7決勝）
- [ ] **X で note 告知**（メイン投稿＋リンクは1st reply）
- [ ] note プロフィールに**自己紹介を固定**／**bio に note リンク**
- [ ] (任意) URC の JP 放送局を確認 → 記事に追記

## 2. 検証・観察（データ待ち）
- [ ] **GSC 週次**（〜1週間後）: 登録済み383の推移＝index bloat修正＋recap復活の効果判定
- [ ] note: PV・Tryline流入（GA `note.com` referral）
- [ ] X: フォロワー・プロフィールアクセス（**reply 制限は約2週間後に再確認**）
- [ ] **broadcast情報の価値検証**（📺入りnoteの反応）

## 3. コンテンツ品質の残課題
- [ ] **【新】3位決定戦が「決勝」と誤表記**（spec: `specs/fix-league-one-playoff-stage-labeling.md` / codex-prompt 済）。真因＝`league-one-live.ts` が決勝と3位決定戦の両方に同一 round_name `"3rd place match/Final"` を付与→`deriveMatchPhase` が両方 playoff_final。**手動 SQL は同期で上書きされ無効**＝Codex 修正必須。暫定: 3位決定戦(`96863688`) preview ja+en を **draft 降格済**（誤表記を LIVE から除去）。決勝(`0fd7d8e6`)は正しいので影響なし。
- [ ] **プレビュー捏造12件（レガシー・5/29前）のクリーンアップ** ← recap は live 0 にしたが **preview は未処理＝まだ live に12件捏造**。再生成 or draft降格（recap と同手法）。post-5/29 の新規 preview は捏造ゼロ確認済み。
- [ ] プレビュープロンプトの**ゼロ値断定**見直し（penalty_count=0 を「反則ゼロ」と事実化する soft リスク・小）
- [ ] (任意) draft 残17件（イベント無しrecap）の扱い

## 4. Codex 実装 / 要spec（優先度順）
- [ ] **broadcast_jp_url: UI表示＋データ投入**。現状 1054試合中 0件・UIに参照ゼロ（完全未着手）。手動検証で効くと確認後に spec化。リーグワン=J SPORTS+DAZN / SRP=WOWOW は確定、URC/Premiership は要確認。高価値・高メンテ（番組表が毎週変わる）。まず手動→UI＋手動投入→自動化の順。
- [ ] (任意) **O2 pipeline self-heal**: `lib/llm/pipeline.ts` の0イベントskip経路で既存publishedをdraft降格＝将来の再生成が自己回復。
- [ ] **(将来) 選手・ロースター文脈データレイヤー**: 引退/移籍/退団/けが/キャプテン等。news/クラブ発表から LLM 抽出→構造化。**コンテンツ（人間ドラマ）＋AIチャット両方に効く本命**。「サントリーのレジェンド引退」のような story を自動で持てるように。
- [ ] **(将来) ラグビーAIチャット RAG**: 現状チャットは1試合context（`assembleMatchContext`）＋gpt-4o-mini。設計＝**層1: tool-use over Supabase**（form/standings/player/h2h を引く・データ既存・効果大）→**層2: vector KB（pgvector）**で安定知識（ルール/用語/リーグワン背景）。**fine-tuningはやらない**（事実は RAG・捏造リスク）。grounding規律必須。

## 5. 片付け（hygiene）
- [ ] **今セッションの docs/specs/codex-prompts をコミット**（未追跡: `docs/note-owned-media-playbook.md`・`docs/distribution-launch-content.md`・`docs/remaining-tasks-2026-06.md`・`specs/feat-urc-srp-match-events.md`・`specs/feat-sample-recap-public.md`・各 codex-prompt 等）
- [ ] 一時スクリプト削除（`scripts/generate-match-preview.ts`・`scripts/delete-x-spam-tweets.ts`）
- [ ] `fabricated-ids.txt` はコミット除外

## 6. 決定済み・記録（蒸し返さない）
- 英語＝**リーグワンのみ・将来枠**（[[project_english_niche]]）
- X＝5/23残りで**reply制限・時間で回復**（青バッジ/電話認証済み・打てる手は打った・深追いしない）。メイン投稿は正常。
- **distribution が本丸**（note/SEO 主力・X はリハビリ）。プロダクト土台は完成。

---

## 優先トップ3
1. **明日の決勝記事**（今週の山場）
2. **プレビュー捏造12件の掃除**（「live 捏造ゼロ」の整合）
3. **GSC 観察**（1週間後・index bloat の効果を測る最初のデータ）

その他（broadcast本格化・選手文脈レイヤー・ラグビーAI）は**価値検証 or distribution が立ってから**。

## note 運用の完成形（テンプレ）
「**人間ドラマ＋実フォームデータ＋無料リンク＋📺放送**」。重複回避＝要約+送客（全文は転載しない）。捏造禁止＝得点経過・実在選手のみ、possession/tackle等は書かない。週次: 金プレビュー / 月まとめ。
