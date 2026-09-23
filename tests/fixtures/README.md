# 旧モデルの互換性用データ

2026-09-23、変更前のコミット `3588781` の実装で生成したデータです。

- `completed-v1.json.gz`：seed 20260923の終了試合を旧StorageAdapterで保存し、IndexedDBの4ストアをJSON化してgzip圧縮したもの。payloadBytesはJSON配列です。架空選手のみを含みます。
- `v1-digests.json`：4種類のseedで、旧版の全GameRecordをcanonicalJson化したSHA-256です。

新しい実装から期待値を再生成すると互換性破壊を見逃すため、モデル調整時に上書きしません。保存時刻・UUIDは凍結した旧保存そのものの値です。

v2のcompleted-v2.json.gz・v2-digests.jsonは、変更前のb982a47で同じ手順により生成しました。seed20260923は9対1、235球です。v1と同様に、現在の実装から期待値を作り直しません。

v3のcompleted-v3.json.gz・v3-digests.jsonは、変更前の9688dcfで同じ手順により生成しました。seed20260923は星原2対青凪0、284球・76打席です。v1/v2と同様に、現在の実装から期待値を作り直しません。

v4のcompleted-v4.json.gz・v4-digests.jsonは、変更前の41be15dで同じ手順により生成しました。seed20260923は星原0対青凪7、334球・83打席です。v1～v3と同様に、現在の実装から期待値を作り直しません。

v5のcompleted-v5.json.gz・v5-digests.jsonは、変更前のe892d5bで同じ手順により生成しました。seed20260923は星原6対青凪2、362球・90打席です。旧版の互換性を検査するため、現在の実装から期待値を作り直しません。

v6のcompleted-v6.json.gz・v6-digests.jsonは、変更前の7ba1b2842a3889c9a8aa151a4a29c6374acfb482で固定しました。seed20260923は星原2対青凪3、326球・87打席です。v7の互換性試験用であり、現在の実装で期待値を再生成しません。

match-v7-baseline.jsonはv7追加時の試験用設定です。実行時のconfig/match.jsonを調整しても旧v6との同値性や固定プレーの試験を維持するために分離しています。旧版保存の期待値とは別物です。
