# 選手プロフィールの編集

全120人の**架空の初期値**です。身長・体重・年齢と能力の関係は未モデル化で、入力値を試合結果の補正に使いません。実在選手を参照した値でも、校正済みの分布でもありません。

| ファイル                     | 対象                 |
| ---------------------------- | -------------------- |
| [hoshihara.ts](hoshihara.ts) | 星原・30人           |
| [aonagi.ts](aonagi.ts)       | 青凪・30人           |
| [kohaku.ts](kohaku.ts)       | 湖白・30人           |
| [asagiri.ts](asagiri.ts)     | 朝霧・30人           |
| [locations.ts](locations.ts) | 国・地域のIDと表示名 |

各ファイルは一軍・二軍を含む30人の独立した固定値です。計算時にIDから生成したり別選手を複製したりしません。氏名・投打・能力は従来のplayers/とfarm/、持ち球はrepertoires/を編集します。

| 項目                   | 単位・意味                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| playerId               | 名簿と共通の固定ID。改名・昇降格で変えない                                                                     |
| displayName            | 登録名の予約値。nullなら氏名。一覧と選手詳細で使用。登録名変更操作・過去試合への登録名スナップショットは未対応 |
| birthDate              | YYYY-MM-DD。年齢は保存せずゲーム内日付から導出                                                                 |
| birthplace             | countries/regionsのID。JPは都道府県必須。国外は地域null可。外国人資格は別データ                                |
| background             | highSchool / university / corporate / independent / overseas（出身区分）                                       |
| heightMm / weightGrams | mm / gの正の整数。表示はcm / kg                                                                                |
| primaryPosition        | P・C・1B・2B・3B・SS・LF・CF・RF・DH。代表位置であり守備適性ではない                                           |
| careerStage            | 現行名簿はactiveのみ。候補・引退への遷移は未実装                                                               |
| firstProYear           | 西暦の整数、未記録ならnull                                                                                     |
| firstJapanSeasonId     | 日本球界の初年度ID。現行は歴史年度を生成しないため全員null                                                     |
| generationBatchId      | 生成元識別。現行はinitial-profiles-2026-v1                                                                     |

例：身長178.5cmは`heightMm: 1785`、体重81.2kgは`weightGrams: 81200`です。国・地域の辞書は現行入力に必要な範囲だけで、全国・世界を網羅していません。追加時は同じIDを辞書へ加えます。検査範囲は [config/player-profiles.ts](../../../config/player-profiles.ts) に明記しています。これは不正入力防止用で、生成分布・推奨体格・人間の限界ではありません。同じ版の検査範囲を狭めると過去保存を読めなくなるため、構造や範囲を変更する場合は版を分けます。

`npm.cmd run data:check`で検査し、**新規プレイ**から適用します。初期定義v16以降（現行はv17）がプロフィールと辞書を複製して保存するため、編集中のファイルを変更しても既存プレイへは反映しません。旧定義v15以前は「記録なし」です。
