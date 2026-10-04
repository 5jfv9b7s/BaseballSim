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

match-v7-baseline.jsonはv7追加時の試験用設定です。実行時のconfig/match.tsを調整しても旧v6との同値性や固定プレーの試験を維持するために分離しています。旧版保存の期待値とは別物です。

v7のcompleted-v7.json.gz・v7-digests.jsonは、v8の変更前の7ae4f1213931046255cc88e590a7977d76dd0688で固定しました。seed20260923は星原7対青凪9、403球・103打席、併殺2件です。旧版の実保存と4条件の全記録ハッシュを維持し、現在の実装で期待値を再生成しません。

v8のcompleted-v8.json.gz・v8-digests.jsonは、v9実装前の3a34a384957de2e7d8c73da5604f7b3ef5cdbb5aで固定しました。seed20260923は星原7対青凪9、403球・103打席、野選1件です。4seedの全記録ハッシュと実保存は現在のコードで再生成しません。

v9のcompleted-v9.json.gz・v9-digests.jsonは、v10実装前のe8ceceb141fb2082ff19a64d809edcb2958c826eで固定しました。seed20260923は星原7対青凪9、403球・103打席、守備刺殺の合計は24/27です。IndexedDBの4ストア実保存と4seedの全記録ハッシュを凍結し、v10の実装から旧期待値を再生成していません。

v10のcompleted-v10.json.gz・v10-digests.json・game-fixture-v2.jsonは、データ分離前の3506e3905f13fb089b99d4b1297eadad1bca7b5dで固定しました。seed20260923は星原2対青凪3、310球・81打席です。分離後に生成し直した期待値ではありません。v10の4seedハッシュは凍結した名簿で検証し、新規編集データと区別します。

world-v4-save.json.gzは登録管理追加前のa329c70で固定した途中世界です。当日オーダー指示1件と17イベントを含む正規化WorldRecordで、IndexedDB全ストアのダンプとは区別します。SHA-256: c628176527e11a77052d2fbb3eb4b5243ea2b0eadc610406761fbff94cdacc0f。登録実装後に期待値を再生成しません。

## 固定希望追加前の登録対応保存

world-v5-save.json.gzはf3e89ecの実装で、固定希望機能を編集する前に凍結したWorldRecordです。汐見航の抹消指示と17イベントを含みます。IndexedDB全ストアのダンプではありません。gzipファイル自体のSHA-256は6e75fa5f7ea4f1a7015fdb667502368d95662178bfd7ac68c588fe872c73092b。tests/roster-policy.test.tsで照合・保存読込・途中再開を検査し、新モデルから期待値を生成し直しません。

## 二軍追加前の固定希望対応保存

world-v6-save.json.gzはa62e804の実装で二軍対応を編集する前に凍結したWorldRecordです。固定希望による抹消と17イベントを含みます。gzipファイル自体のSHA-256は8edc2ece17637e68c1e7bbda50ee4a4529c33083987b6e9384b01629f6abb573。tests/farm.test.tsで保存読込・途中継続を照合します。IndexedDB全ストアのダンプとは区別し、期待値は再生成しません。

## world-v7-save.json.gz

0.8.0（develop 89e449d）を変更する前に生成したcanonicalJsonのgzipです。初日の一軍2試合完了後、二軍最初の試合を17イベント進めています。world-prototype-v7 / definitions-v6で、身体状態はありません。gzip自体のSHA-256は`1b3f472893d0ca00a549fa0847f7712298a4e815c2250996768f9e1f62874c8d`。tests/physical.test.tsで固定ハッシュ、保存・読込、旧版の続行一致を確認します。新実装に合わせて再生成しないでください。

## world-v8-save.json.gz

0.9.0（ee3f0ec）の変更前実装で、初日4試合と日次回復後、翌日の試合を17イベント進めたcanonicalJsonのgzipです。身体状態あり・休養方針なし。gzip SHA-256は`dcba625568874981ef41ff09fb87def8858295791ce2bc51bc5c66b36854d1d4`。tests/rest.test.tsで固定ハッシュ・旧版の再保存/読込・続行の一致を確認します。新しい起用結果に合わせて再生成しないでください。

## world-v9-save.json.gz

0.10.0（e5f0f4e）の変更前実装で初日4試合・日次回復後、翌日17イベントを進めたcanonicalJsonのgzipです。調子状態はありません。gzip SHA-256はe054eeca48c114fd1ee7213a03099ec0adf233ea9444f63c57ac33afee5ff2f3。tests/condition.test.tsで固定ハッシュ、旧版での保存読込・続行一致を検査します。新実装に合わせて再生成しないでください。

## world-v10-save.json.gz

0.11.0（3636447）の変更前実装で、初日4試合と日次後、翌日17イベントを進めたcanonicalJsonのgzip。調子あり・試合前補正なし。gzip SHA-256は660a11e6809d3443e582069d600ae29bf82c8aa004fdb2574bf98a8e30a36941。tests/performance.test.tsで固定ハッシュ・旧版保存読込・続行を確認します。期待値を再生成しないでください。

world-v11-save.json.gzは変更前d97a486のcreatePerformanceWorldで1日完了後、翌日17イベント進めた固定保存です。gzip SHA-256: 08858107d90fbd6f6f5e3e36e93e3c7dda1cb49db5bb096042301e5667cc0a1c。野手休養を後付けせず元の結果で続行する検証用で、通常は再生成しません。

## world-v12-save.json.gz

0.13.0（39069eeee34ed281fdef171d563c93271a827599）の変更前実装で初日完了・日次処理後、翌日17イベントを進めたcanonicalJsonのgzipです。野手休養あり・条件付き救援なし。gzip SHA-256はdfec43f80cd8b67cfe3f78f67115211d6500ea57c4525ac1a82d23e8146441dc。tests/relief.test.tsでハッシュ・旧版の保存読込・途中続行を照合します。IndexedDB全ストアのダンプとは区別し、期待値を再生成しません。

## world-v13-save.json.gz

0.14.0（1059d1f6690c14aad5c977c44c0e7cd1012ad4b0）の変更前実装で、初日完了・日次確定後、翌日17イベントを進めたWorldRecordをJSON.stringifyしてgzip化した固定保存です。条件付き救援あり・ブルペン準備なし。gzip SHA-256はb8f271a06e4d405369fdca370efd59561b5896b111e62cf21e0976e1d6c37c99。tests/bullpen.test.tsでハッシュ・旧版保存読込・途中続行を照合します。IndexedDB全ストアのダンプとは区別し、期待値は再生成しません。
