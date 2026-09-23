# 旧モデルの互換性用データ

2026-09-23、変更前のコミット `3588781` の実装で生成したデータです。

- `completed-v1.json.gz`：seed 20260923の終了試合を旧StorageAdapterで保存し、IndexedDBの4ストアをJSON化してgzip圧縮したもの。payloadBytesはJSON配列です。架空選手のみを含みます。
- `v1-digests.json`：4種類のseedで、旧版の全GameRecordをcanonicalJson化したSHA-256です。

新しい実装から期待値を再生成すると互換性破壊を見逃すため、モデル調整時に上書きしません。保存時刻・UUIDは凍結した旧保存そのものの値です。
