# 旧モデルの互換性用データ

2026-09-23、変更前のコミット `3588781` の実装で生成したデータです。

- `completed-v1.json.gz`：seed 20260923の終了試合を旧StorageAdapterで保存し、IndexedDBの4ストアをJSON化してgzip圧縮したもの。payloadBytesはJSON配列です。架空選手のみを含みます。
- `v1-digests.json`：4種類のseedで、旧版の全GameRecordをcanonicalJson化したSHA-256です。

新しい実装から期待値を再生成すると互換性破壊を見逃すため、モデル調整時に上書きしません。保存時刻・UUIDは凍結した旧保存そのものの値です。

v2のcompleted-v2.json.gz・v2-digests.jsonは、変更前のb982a47で同じ手順により生成しました。seed20260923は9対1、235球です。v1と同様に、現在の実装から期待値を作り直しません。

v3のcompleted-v3.json.gz・v3-digests.jsonは、変更前の9688dcfで同じ手順により生成しました。seed20260923は星原2対青凪0、284球・76打席です。v1/v2と同様に、現在の実装から期待値を作り直しません。

v4のcompleted-v4.json.gz・v4-digests.jsonは、変更前の41be15dで同じ手順により生成しました。seed20260923は星原0対青凪7、334球・83打席です。v1～v3と同様に、現在の実装から期待値を作り直しません。
