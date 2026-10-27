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

## backup-store.zip

Python 3.13の標準zipfileで作成したSTORE形式の独立検体です。manifest.jsonの内容は{}と改行だけで、ゲーム保存ではありません。tests/backup.test.tsでZIP読取の互換性を確認します。ZIP日時は2020-01-01 00:00:00に固定。自動試験の実行にPythonは不要です。

## world-v14-pitch-baseline.json.gz

球種特性導入前の0.24.1、コミット464a85f980c6629e21b9d8c7e1501771b9540630の`src/`と`config/`を`git archive`で取得し、そのコードで`advanceWorld(createBullpenWorld(), 25)`を実行したWorldRecordです。canonicalJsonのUTF-8をgzip化しました。球種特性は含みません。

**展開後canonicalJsonのSHA-256**は`ca924b070286c3a14db2b9ad971c43cfdf20a4e2e0c6764093eff0dc626aaea0`です。`tests/pitch-profiles.test.ts`で全状態の一致、旧版の保存読み込み、続行を確認します。IndexedDBの全ストアダンプとは区別し、現行計算に合わせて期待値を再生成しません。

圧縮ファイル自体のSHA-256は`7d82a01fea364551420dc0e4e940756ae035b13922fda7c873b850d3aeef0079`です。展開後のハッシュと区別します。

## world-v15-individual-baseline.json.gz

個人別データ導入前の0.25.0（a6a01026b8c548aa4454bdce68ba66749b4fb792）で `advanceWorld(createPitchProfileWorld(), 25)` を実行したcanonicalJsonのgzipです。世界v15・定義v14、個人別deliveryは未設定です。変更前ソースから生成した後、実装に着手しました。

展開後canonicalJsonのSHA-256は `f2d9e35b4c3b1f69fdbadf713dd33109f68545a6be329889b8a4fa58dfeff700`。tests/individual-pitches.test.tsで全状態・保存復元・日次続行を検証します。現行データに合わせて期待値を再生成しません。

## world-v16-training-baseline.json.gz

0.38.0（a0bd8e01fb3ffd2b927284ee6391c0685245b226）の変更前ソースで、seed 31の`createDailyTrainingWorld`を短期最終日まで25イベント単位で進め、各日の`completeDay`を実行した固定検体です。4日10試合・2026-09-28、世界v16/定義v21/成長daily-training-v1。canonicalJsonのUTF-8をgzip化し、年間成長総括の実装前に保存しました。IndexedDB全ストアのダンプではありません。

展開後canonicalJson SHA-256は`64218a64ca155e8ed9f1b0d64bc72550fb711800504dad2924a920adf9a6e8ce`、gzip自体は`22d53d484ca207e21865177def075c5598f4c9711e37f260d75e5175cae18daa`。`tests/season-growth.test.ts`で全状態の再現・既存v017保存/バックアップ・成長表示を検証します。将来のモデルに合わせて再生成しないでください。

## world-v16-in-progress.json.gz

0.39.0（4ad6d23ef29f09cb531276a80d272a20cab2f7ea）の変更前ソースで、seed 31の`createDailyTrainingWorld`を初日の全4試合・日次確定まで進め、翌日を17イベント進めた固定検体です。2026-09-25・世界v16/定義v21/daily-training-v1。canonicalJsonをgzip化したWorldRecordで、IndexedDB全ストアのダンプではありません。

展開後canonicalJson SHA-256は`056c94bcdd0cc32987f372457472550119e9659bca42c03e7cff924a2b8a863a`、gzip自体は`aa2606f8638ee0fea3f249285a3ee1da0d5a677124e88b6a162fd2c027a5f516`。`tests/experience.test.ts`で旧v017保存・読込・バックアップと途中再開を確認し、終了時の全状態を変更前の`world-v16-training-baseline.json.gz`と照合します。実戦経験モデルに合わせて再生成しません。

## world-v17-in-progress.json.gz

年齢変化を導入する前の0.40.0（c6554ac43f217c9ed1245b83785a96bce6e447c8）で、seed31の`advanceWorld(createDevelopmentWorld(31), 17)`を実行した途中検体です。世界v17/定義v22/daily-development-v2。canonicalJsonのUTF-8をgzip化したWorldRecordで、DB全体のダンプではありません。変更前ソースで固定してから実装に着手しました。

展開後canonicalJson SHA-256は`060b02af676e0f690a87239293487136eb96cdce757862d17cc5c0d16d684eef`、gzip自体は`4f6ebc395545e87f3c3f68d82b1e953188a1fbd4d6ba768f0423a7064b8e79e3`。初日を完了して日次確定した全状態のSHA-256は`b26aae8f960576a418f259e491de0477f03055e35751d0e9ef75fcc333ae6727`です。tests/aging.test.tsで旧v018保存/復元/バックアップと継続を照合し、将来のモデルに合わせて再生成しません。

## 0.41.0の途中v18保存（0.42.0の互換性検査）

`world-v18-in-progress.json.gz`は変更前99badc502d2fe3ea0c1e969502aaf7975b8efb9bで、seed31のcreateAgeDevelopmentWorldを17ステップ進めて固定しました。再生成しません。tests/rookie-awakening.test.tsで旧v019の実保存・復元・バックアップと1日終了までの続行を確認します。

- canonical JSON SHA-256: `5e43e8cf65ff531b725211ddff407a9c11fa262b5ca68f4dc55454e6b2dc82e8`
- gzip SHA-256: `7d706e6c27fdb3307a5aad9902ffbfe1c2ac503664ee0d9da00f2dc0e68242f4`
- 1日終了の全状態SHA-256: `976068daf1fd36fedddc11ae07eaff40ee338b1082948209e9e8f2289cb0ec2e`

## world-v19-in-progress.json.gz（固定・0.42.0）

HEAD 8a895b8からseed31・短期の17球進行時点を保存したv19検体です。互換性を確認するため、キャンプ実装後に再生成しません。

- gzip SHA256: `48c8138be6117e7279ae58a861c4d81886099d454c14c2ccf1364b4eddfc619f`
- 正規JSON SHA256: `d5d3ffb05563f11e039dbea7c5625673a73341a94deeaae2741ad6e7b815a823`
- 初日確定後 SHA256: `82da14a894766886e523f9ab355843173aa1bb0e515c723225695516c180695c`

`tests/camp.test.ts`で旧v020のDB保存・復元・バックアップ・続行とハッシュを検査します。

## world-v20-initial.json.gz

0.44.0（e07541ef）の変更前実装から `createCampDevelopmentWorld(7)` を採取。正規化world SHA-256は `86daf2d96b05c169de87d9c072778d53cc765c1988a5e742b4a172c9b430c5d4`。旧v20初期保存の固定基準。以後再生成しません。

続行基準：e07541efコミットを独立した一時フォルダへgit archiveし、旧v20を1日進めた全world SHA-256は `5d7a0c4f83df81622f120b6afd5a945f2699de27e40610484f8a4c9aab9a90c4`。初期の固定検体を現行の旧モデルで続行して照合する。固定検体の再生成・置換は行わない。

キャンプ初日の2日後world SHAも `93af616b09a69dd3eac6f5067050efe19d9b01cda57fe3c8f3607d3d21a44c36` と一致させる。
