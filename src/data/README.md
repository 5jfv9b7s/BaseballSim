# 選手・持ち球・球団の編集

新規の1試合v10、短期プレイ、年間プレイは、このフォルダの球団別データを共通で参照します。全4球団・全60選手・全36件の持ち球を明示した架空データです。他球団や控えの能力を実行時にコピー生成しません。

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
- [world/rosters.ts](world/rosters.ts)：全球団のファイルを結合し、開始時に複製する入口。
- [datasets/current.ts](datasets/current.ts)：同じデータから星原・青凪の1試合用名簿を作ります。
- [pitch-types/index.ts](pitch-types/index.ts)：球種の表示辞書。辞書追加と計算対応の追加は別です。
- [rating.ts](rating.ts)：能力値と上限を読みやすく指定する補助関数。

`away.ts`/`home.ts`の旧データ、`datasets/legacy-v1.ts`、旧世界の`world/teams.ts`は以前の実装の参照用として保持します。通常の編集先は上表です。過去モデルの凍結データや試験用保存を変更しないでください。

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

打順はlineupの順です。野手9人・守備8位置とDHを重複なく指定してください。reserveBatterIdsは野手候補の区分であり、一二軍登録やベンチ入り資格ではありません。試作上限は控え候補17人です。1試合画面では初期打順9人と投手を使用し、控え候補を直接試合名簿へ追加しません。日程画面では開始前に控えからスタメンを選べます。

球団追加時は上表と同じ3ファイルを作り、world/rosters.tsの結合一覧と日程を揃える必要があります。現在の同梱日程は4球団用です。IDを表示名として変更せず、参照している全ファイルを整合させてください。

## 日程と保存

[config/season.ts](../../config/season.ts)に年間の年度・開幕/終了日・総当たり回数・節の間隔（日）、[world/schedule.ts](world/schedule.ts)に短期日程を置いています。年日程は[world/annual.ts](world/annual.ts)で生成します。現実の正式日程の再現ではありません。

開始時に全入力を複製して保存します。ファイル編集は新しい試合/世界に反映し、開始済み世界や保存済み試合にはさかのぼりません。操作は[控え起用](../../ROSTER-IMPLEMENTATION.md)、年間進行は[進捗ガイド](../../V1.0-PROGRESS.md)を参照してください。

```powershell
npm.cmd run data:check
npm.cmd run check
npm.cmd run dev
```

画面を再読み込みして新規プレイを開始します。配信済みdistには再ビルドが必要です。意図したデータ編集で結果が変わる場合は、新規入力向けの期待値を根拠とともに更新してください。過去の保存・記録ハッシュ・凍結名簿は再生成せず互換性を守ります。
