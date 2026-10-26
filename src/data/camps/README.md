# キャンプ入力（0.43.0・試作）

[short.json](short.json)と[annual.json](annual.json)は、既存日程内で確認する架空の期間です。開始日・終了日を含み、世界の開始〜終了内、重複なしで1〜8回にします。正式な春季キャンプ日程や係数は未決定です。

[index.ts](index.ts)のDEFAULT_CAMP_TRAININGが全選手の初期指定、CAMP_PLAYER_OVERRIDESが固定選手IDごとの差分です。通常練習は[src/data/training/](../training/README.md)へ分けて保持します。保存には各期間・全120人の入力を複製します。ID追加時には既存名簿/球種参照に合わせてください。

共通係数は[config/camp.ts](../../../config/camp.ts)。対象群の定義は通常練習と同じ辞書を使い、持ち球の制球・再現性は本人の球種だけ指定できます。編集後は`npm.cmd run data:check`と新規プレイで確認します。既存の保存は変更しません。[式・操作・互換性](../../../TRAINING-IMPLEMENTATION.md#0430キャンプ専用メニューと成長)。
