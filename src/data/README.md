# 選手・持ち球・球団の編集

新規の1試合v10、短期プレイ、年間プレイは、このフォルダの球団別データを共通で参照します。従来の基礎データは全4球団・60選手・36持ち球です。0.8.0の短期・年間プレイはfarm/の追加60人・36持ち球を結合し、全120選手・72持ち球を使います。他球団や控えの能力を実行時にコピー生成しません。

## 編集するファイル

| 球団           | 選手15人（控え3人を含む）                    | 持ち球9件                                            | 球団・初期編成                           |
| -------------- | -------------------------------------------- | ---------------------------------------------------- | ---------------------------------------- |
| 星原フォックス | [players/hoshihara.ts](players/hoshihara.ts) | [repertoires/hoshihara.ts](repertoires/hoshihara.ts) | [teams/hoshihara.ts](teams/hoshihara.ts) |
| 青凪ハーバーズ | [players/aonagi.ts](players/aonagi.ts)       | [repertoires/aonagi.ts](repertoires/aonagi.ts)       | [teams/aonagi.ts](teams/aonagi.ts)       |
| 湖白スワンズ   | [players/kohaku.ts](players/kohaku.ts)       | [repertoires/kohaku.ts](repertoires/kohaku.ts)       | [teams/kohaku.ts](teams/kohaku.ts)       |
| 朝霧フォックス | [players/asagiri.ts](players/asagiri.ts)     | [repertoires/asagiri.ts](repertoires/asagiri.ts)     | [teams/asagiri.ts](teams/asagiri.ts)     |

- `players`：固定ID、氏名、左右、各能力、投手の適性など。各選手を独立した値として編集できます。
- `repertoires`：投手ごとの持ち球、球速、制球、再現性。playerIdで選手に結び付けます。
- `teams`：squadId、球団IDと名前、初期打順9人と守備位置、投手の順番、控え候補ID。
- registrations/{hoshihara,aonagi,kohaku,asagiri}.ts：基礎60人の初期登録（first/farm）と外国人枠（subject/exempt）。選手追加時は同じplayerIdをここにも追加します。
- [world/registrations.ts](world/registrations.ts)：登録対応プレイの入口。規則は[config/registration.ts](../../config/registration.ts)を開始時に複製します。旧保存は保存内の値を使用します。
- [world/rosters.ts](world/rosters.ts)：全球団のファイルを結合し、開始時に複製する入口。
- [datasets/current.ts](datasets/current.ts)：同じデータから星原・青凪の1試合用名簿を作ります。
- [pitch-types/index.ts](pitch-types/index.ts)：球種の表示辞書。辞書追加と計算対応の追加は別です。
- [rating.ts](rating.ts)：能力値と上限を読みやすく指定する補助関数。

`away.ts`/`home.ts`の旧データ、`datasets/legacy-v1.ts`、旧世界の`world/teams.ts`は以前の実装の参照用として保持します。通常の編集先は上表と下記farm/です。過去モデルの凍結データや試験用保存を変更しないでください。

## 二軍対応で追加した選手・編成

farm/{hoshihara,aonagi,kohaku,asagiri}/に、各球団の追加15人を次の5ファイルへ分けています。

| ファイル         | 編集内容                                                             |
| ---------------- | -------------------------------------------------------------------- |
| players.ts       | 追加15人のID・氏名・全能力（投手3人、野手12人）                      |
| repertoires.ts   | 追加投手3人の持ち球9件                                               |
| team.ts          | 二軍squadId、共通clubId、表示名、理想打順9人、初期投手順             |
| registrations.ts | 初期first/farmと外国人資格。追加分は既定farm/exempt                  |
| roster-policy.ts | 追加15人の固定希望。入れ替えモードは球団共通のroster-policies/に置く |

world/farm.tsが基礎15人と追加15人を一つの球団名簿へ結合します。farm/は編集元の分類であり、固定的な出場階級ではありません。追加選手も一軍へ登録でき、元の選手も二軍で出場できます。昇降格でplayerId・能力をコピー生成しません。新しい能力値は既存試作値を複製して明示した未校正値です。

初期編成は9野手＋3投手＋3控えを一軍・二軍へ置き、試合成立用の余裕を持たせています。両方に野手9人・投手1人以上が必要です。二軍には別squadIdを使用し、clubIdは一軍と共通にします。選手を追加したら登録と固定希望も追加し、投手ならteam.tsの投手一覧・持ち球、野手なら初期打順または候補の区分を整合させます。

[config/farm.ts](../../config/farm.ts)で二軍のベンチ上限と年間日程を編集します。年度変更時はconfig/season.tsと二軍の開幕・終了日を併せて変更してください。短期日程はfarm/schedule.ts。いずれも新規世界だけに反映し、旧保存と1試合画面の基礎名簿は拡張しません。

## 能力・名前を変える

例えば [players/hoshihara.ts](players/hoshihara.ts) の汐見航を編集します。既存playerIdは改名・並べ替えで変更しません。

```ts
familyName: '汐見',
givenName: '航',
powerVsRight: rating(72000),        // 能力72.000、上限110.000
powerVsLeft: rating(70000, 115000), // 個別上限115.000
```

| 項目                                   | 意味                     |
| -------------------------------------- | ------------------------ |
| throwingHand / battingHand             | 投R/L、打R/L/S（両打ち） |
| batting.contactVsRight / contactVsLeft | 右/左投手へのミート      |
| batting.plateDiscipline                | 選球眼                   |
| swingAggressionMilli                   | 積極性、0〜100000        |
| powerVsRight / powerVsLeft             | 右/左投手へのパワー      |
| runningSpeed / fieldingRange           | 走力 / 守備範囲          |
| armStrength / fielding.catching        | 肩力 / 捕球能力          |

ratingは0〜120000の整数（表示値の1000倍）。第2引数は現在値以上〜120000の上限で、省略時110000です。控え・湖白・朝霧の初期能力は既存選手の複製に由来する未校正値ですが、現在は各ファイルの独立値です。片方の編集が別球団へ波及することはありません。

## 持ち球を変える

該当球団のrepertoiresファイルで編集します。

| 項目                     | 意味・範囲                               |
| ------------------------ | ---------------------------------------- |
| pitchId / playerId       | 持ち球固有ID / 所有選手ID                |
| pitchTypeCode            | 計算対応はfastball / slider / fork       |
| acquisitionProgressMilli | 習得進度0〜100000。100000だけ使用        |
| control / repeatability  | 制球 / 再現性（rating）                  |
| velocity.typicalCentiKph | 中心球速。14600＝146.00km/h、5000〜18000 |
| velocity.maxCentiKph     | 最大球速。中心球速以上〜20000            |
| velocity.spreadCentiKph  | 球速幅。450＝4.50km/h、0〜2000           |

各投手へ最低1つの習得済み球種を残してください。新しい球種名を辞書へ追加しただけでは現行モデルで投げられません。配球・物理モデル・設定・保存互換性を新モデル版で追加する必要があります。

## 選手・編成を追加変更する

1. playersへ固有playerIdの選手を追加します。
2. 野手はteamsのlineupかreserveBatterIdsへ、投手はpitcherIdsへ追加します。
3. 投手にはrepertoiresの持ち球も必要です。
4. `npm.cmd run data:check`で全選手・全球団・日程の整合性を確認します。

打順はlineupの順です。野手9人・守備8位置とDHを重複なく指定してください。reserveBatterIdsは野手候補の区分であり、一二軍登録やベンチ入り資格ではありません。旧0.5の控え上限は17人です。新しい登録対応世界は控え候補最大58人かつ球団所属合計70人以下を検査します。1試合画面では初期打順9人と投手を使用し、控え候補を直接試合名簿へ追加しません。日程画面では開始前に控えからスタメンを選べます。

球団追加時は上表と同じ3ファイルを作り、world/rosters.tsの結合一覧と日程を揃える必要があります。現在の同梱日程は4球団用です。IDを表示名として変更せず、参照している全ファイルを整合させてください。

## 入れ替え方針と固定希望

roster-policies/{hoshihara,aonagi,kohaku,asagiri}.tsに全4球団の方針と基礎60選手の希望を明示しています。追加60人の希望はfarm/の各球団へ分離しています。changeModeはmanual/auto、preferenceはfirstFixed/farmFixed/autoです。球団単位の設定で、実登録はregistrations/のデータとして別に編集します。

初期値は全球団手動・全選手おまかせ。自動は固定希望だけを反映する試作です。人数枠や再登録待ちに抵触する希望は保留されます。おまかせ選手の能力評価による昇降格はまだ行いません。編集後はnpm.cmd run data:checkで全選手分の欠損・重複・他球団参照を検査してください。

選手追加時は希望の行も追加します。球団を増やす場合はworld/roster-policies.tsの結合一覧、world/registrations.tsの登録一覧、名簿と日程を揃えます。開始済みの世界へファイル変更は反映せず、保存された方針・希望を使います。

## 日程と保存

[config/season.ts](../../config/season.ts)に年間の年度・開幕/終了日・総当たり回数・節の間隔（日）、[world/schedule.ts](world/schedule.ts)に短期日程を置いています。年日程は[world/annual.ts](world/annual.ts)で生成します。現実の正式日程の再現ではありません。

開始時に全入力を複製して保存します。ファイル編集は新しい試合/世界に反映し、開始済み世界や保存済み試合にはさかのぼりません。操作は[控え起用](../../ROSTER-IMPLEMENTATION.md)、年間進行は[進捗ガイド](../../V1.0-PROGRESS.md)を参照してください。

```powershell
npm.cmd run data:check
npm.cmd run check
npm.cmd run dev
```

画面を再読み込みして新規プレイを開始します。配信済みdistには再ビルドが必要です。意図したデータ編集で結果が変わる場合は、新規入力向けの期待値を根拠とともに更新してください。過去の保存・記録ハッシュ・凍結名簿は再生成せず互換性を守ります。

## 身体能力と開始時の体力・疲労（0.9.0）

`physical/{hoshihara,aonagi,kohaku,asagiri}.ts`に各球団30人、計120人を選手IDで明示しています。一軍・二軍を通じて一つの身体状態を使います。`physical.stamina`と`physical.recovery`はvalueMilli/ceilingMilli（0〜120000）、energyMilli/fatigueMilliは0〜100000です。調子・怪我モデルの未実装値は補いません。新しい選手を追加するときはこちらにも入力を追加してください。

消耗と回復の係数は`config/physical.ts`、式・単位・未校正の仮定は[身体状態ガイド](../../PHYSICAL-IMPLEMENTATION.md)です。設定と全身体入力は開始時に保存します。編集後は`npm.cmd run data:check`を実行し、新しい日程で確認してください。旧保存・既に開始した世界の値は変更しません。
