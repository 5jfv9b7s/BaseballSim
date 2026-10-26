# 新規プレイ専用の架空新人プロフィール（0.42.0）

通常の架空120人のうち8人を、2026年プロ入りの固定入力例にします。実在選手や提供候補70人の査定ではありません。年齢からプロ1年目を推定せず、プロ入り年を明記します。

| ファイル       | プロ1年目にするID                        |
| -------------- | ---------------------------------------- |
| hoshihara.json | player-a-06、player-a-24                 |
| aonagi.json    | player-h-06、player-h-24                 |
| kohaku.json    | kohaku-player-a-11、kohaku-player-a-23   |
| asagiri.json   | asagiri-player-h-11、asagiri-player-h-23 |

各行は`playerId`と`firstProYear`です。元の球団別プロフィールTSは維持し、[新規定義の組み立て](../../world/rookie-development.ts)だけで差分を適用します。生成元は`initial-rookie-profiles-2026-v1`となります。新しいJSONを作る場合は、組み立てファイルの明示登録にも追加してください。

`npm.cmd run data:check`で参照・重複・登録漏れと入力を確認し、新規プレイで適用します。v23以下の旧プレイのプロ入り年・覚醒対象は置き換えません。nullは不明であり、日本球界の初年度から補いません。生年月日・出身・体格等は従来の[プロフィール](../README.md)、能力は[選手データの入口](../../README.md)です。確率/量は[config/awakening.ts](../../../../config/awakening.ts)で調整します。
