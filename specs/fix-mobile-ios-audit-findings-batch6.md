# fix-mobile-ios-audit-findings-batch6: 再監査で見つかったP1不具合4件

対象リポジトリ: **tryline-mobile**のみ。`fix-mobile-ios-audit-findings-batch1`〜`batch5`の後続。API・データモデル変更は不要。

## 背景

2026-07-25、`feat-mobile-growth-sharing`等5specの実装後、外部GPTに再監査を依頼した。うち1件は「修正したはずが実機で再現する」バグ、3件は今回の一連の変更で新たに見つかった問題。

## スコープ

対象:
1. **共有シート表示中も自動送りが進む(再発)**: `feat-mobile-growth-sharing`で`shareCurrentStory`に`setPaused(true)`→`try/finally`→`setPaused(false)`を実装したが、再監査で「PREVIEWから共有シートを開いたままNEWS、RESULTまで進行する」ことが確認された。`src/stories/MatchStoriesSection.tsx`の`AppState`監視(384行目付近)は`"background"`遷移のみをpaused判定に使っており、共有シートのような一時的なシステムUIが被さる際にiOSが送る`"inactive"`状態を扱っていない。`Share.share`のPromise解決タイミングに依存する現在の実装だけでは不十分な可能性がある
2. **大会一覧で大会名が省略される**: `app/(tabs)/competitions/index.tsx`の大会名`Text`が`numberOfLines={1}`固定のため、画面幅368pt程度では主要大会の名前の多くが省略記号で切れる
3. **試合詳細のヘッダー下に無目的な空白がある**: `src/matches/MatchDetailScreen.tsx`のmasthead(`styles.masthead`)は`marginHorizontal`で横方向だけ画面端まで伸ばしているが、縦方向は伸ばしていない。Safe Area分の余白がそのまま残り、ヘッダーとmastheadの間に約70ptの空白ができている
4. **オンボーディングの戻るループ**: `app/onboarding/quiz.tsx`の「一覧から直接選ぶ」(結果画面)・「診断をスキップして一覧から選ぶ」(設問画面)がどちらも`router.push("/onboarding")`を使っている。診断(`/onboarding/quiz`)は常に`/onboarding`からのみ遷移するため、ナビゲーションスタックの直下は必ず`/onboarding`である。`push`のたびに新しい`/onboarding`インスタンスが積み重なり、設定タブ経由で入った利用者が診断→一覧→戻る→診断→一覧→…と行き来してもスタックが伸び続け、実質的なループに見える

対象外:
- チーム選択候補ロジック([[project_mobile_team_candidate_bug]]、Owner対応待ち)
- 診断の設問・配点ロジック(変更しない)

## UI サーフェス

### 共有中の一時停止を堅牢化(`src/stories/MatchStoriesSection.tsx`)

- 既存の`AppState`監視(`nextState === "background"`で一時停止、復帰で再開)に加えて、`nextState === "inactive"`でも一時停止するようにする(`appState.current === "background" || appState.current === "inactive"`だった場合に`"active"`へ戻ったら再開、という判定に拡張する)
- `shareCurrentStory`内の明示的な`setPaused(true)`/`finally`の`setPaused(false)`はそのまま維持する(二重の安全網とする)

### 大会名の折返し許容(`app/(tabs)/competitions/index.tsx`)

- `numberOfLines={1}`を`numberOfLines={2}`に変更する
- 2行になった場合でも試合数表示(`match_count MATCHES`)とのレイアウトが崩れないことを確認する(`groupHeader`が`flexDirection: row`のため、大会名側に`flexShrink`等が必要か確認・調整する)

### mastheadの縦方向フルブリード(`src/matches/MatchDetailScreen.tsx`)

- `styles.masthead`に、横方向の`marginHorizontal: -spacing.lg`に加えて、縦方向にも上端まで届くような負のマージン(またはSafe Area分を打ち消す手段)を追加し、ヘッダー直下から暗色背景が始まるようにする
- `Screen`コンポーネント側の`SafeAreaView`・`ScrollView`のpadding構造は変更しない(この画面固有の調整として`MatchDetailScreen.tsx`側のスタイルで対応する)

### オンボーディング戻るループの解消(`app/onboarding/quiz.tsx`)

- 「一覧から直接選ぶ」・「診断をスキップして一覧から選ぶ」の`onPress`を、`router.push("/onboarding")`から`router.back()`に変更する(診断は常に`/onboarding`からのみ到達するため、スタックの直下は必ず`/onboarding`であることを前提にできる)

## データモデル変更 / API サーフェス / LLM 連携

なし。

## 受け入れ条件

1. `AppState`が`"inactive"`に遷移したときも一時停止状態になり、`"active"`に戻ったら再開することを確認するテスト
2. 大会一覧の大会名が2行まで折り返せることを確認するテスト(`numberOfLines`の値を直接確認する)
3. `MatchDetailScreen`のmastheadスタイルに縦方向のフルブリードに対応するスタイルが含まれることを確認するテスト(具体的な値のアサーションでなくてよい、負のマージンまたは同等の対応が入っていることを確認する)
4. `quiz.tsx`の「一覧から直接選ぶ」・「診断をスキップして一覧から選ぶ」が`router.push`ではなく`router.back()`を呼ぶことを確認するテスト
5. TypeScript strict・lint・test green
6. **Owner目視**: TestFlightビルドで、共有シート表示中にストーリーが進まないこと、大会名が省略されず2行まで表示されること、試合詳細のヘッダー直下からmastheadが始まること、設定→チーム選択→診断→スキップ→一覧→戻るを繰り返しても診断画面に戻り続けないことを確認する

## 未解決の質問

なし。
