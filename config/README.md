# 試作モデルの設定

ゲームv0.1の**新規v7試合**は [match.ts](match.ts) を読み込みます。既存係数はv6と同値です。実在統計への校正は行っていません。

## 編集と確認

編集用設定は、日本語コメントが使えるTypeScript形式です。ファイル内を「配球」「狙い」「制球」「打者判断」「打球」「守備」「走塁」「併殺・犠飛」の順に整理しています。各値のすぐ上に意味と単位を記載しているため、通常の調整では説明書を往復せず数値を編集できます。

1. 終了した試合を保存してから `config/match.ts` の数値を編集します。項目名や階層は変更しません。`//`から始まる行は説明コメントで、試合計算や保存データには入りません。
2. `npm.cmd run check` を実行します。不足項目・未知項目・非有限数・範囲外・上下限の逆転を拒否します。
3. 開発画面を再読み込みし、「併殺・犠飛対応試作 v7」を選び「新しい試合を準備」で適用します。配信済みのdistへ反映するには再ビルドが必要です。開発中のファイル変更で画面が再起動することがあるため、未保存の試合を残したまま変更しないでください。
4. `npm.cmd run game -- 20260923 game-prototype-v7` でも確認できます。

同じseedでも設定が異なれば結果が変わります。開始時に設定全体を複製し、終了試合と定義ブロックへ保存します。保存読み込みは現在のファイルではなく、保存された設定を使用します。設定の識別には定義ブロックのSHA-256を使います。旧v1〜v6は従来の固定定義を使用し、このファイルの影響を受けません。

`game-prototype-v7` はアルゴリズム版、`match-config-v1` は設定構造の版です。**係数だけの変更は保存される設定内容で識別**します。式・分岐・設定項目・許容範囲を変える場合は新しい版を追加し、旧版の再実行を維持してください。固定の検査範囲は [config-schema.json](../src/game/config-schema.json)、項目間の条件は [config.ts](../src/game/config.ts) です。検査範囲は数値破綻防止の制約で、校正済みの推奨範囲ではありません。

## 単位と主な項目

| 区分       | 項目                                                              | 単位・意味                                                         |
| ---------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| pitch      | baseWeights / twoStrike / threeBall / oppositeSide                | 球種の相対重み。各0.01〜100                                        |
| pitch      | aimXMm / aimZMm、chaseAim*、threeBallAim*                         | 狙い座標。通常／2ストライク／3ボール。昇順のmm整数3個              |
| pitch      | positionErrorMinMm / positionErrorScaleMm                         | 制球から計算する位置誤差幅、mm                                     |
| pitch      | swing* / protect* / contact* / foul*                              | スイング・接触・ファウルの確率式の係数。最終確率は0〜1に制限       |
| pitch      | contactSpeedReferenceKph / contactSpeedPenaltyPerKph              | 接触率の基準球速km/hと1km/h当たりの減少量                          |
| pitch      | body* / avoidance* / deliveryDistanceMeters                       | 身体矩形mm・回避時間秒・移動速度m/s・投球距離m                     |
| battedBall | exitSpeed*                                                        | 基準・パワー・ノイズはkm/h、PitchFactorは無次元                    |
| battedBall | angleMinimumDegrees / angleModeDegrees / angleMaximumDegrees      | 三角分布の最小・最頻・最大角度（度）、最小 < 最頻 < 最大           |
| battedBall | protectExitSpeedPenaltyCentiKph / protectContactRecoveryCentiKph  | 2ストライク時の減速、0.01km/h。減速基準 >= ミート回復量            |
| battedBall | gravity* / airborneDragFactor / fence*                            | 重力m/s²、水平速度倍率、フェンス距離・高さm                        |
| battedBall | fielderReaction* / fielderAcceleration*                           | 守備反応秒、加速度m/s²                                             |
| battedBall | throwBaseMetersPerSecond / throwAbilityMetersPerSecond            | 送球速度の基準と能力寄与、m/s                                      |
| running    | runnerBaseMetersPerSecond / runnerAbilityMetersPerSecond          | 走速度の基準と能力寄与、m/s                                        |
| running    | runnerLeadMeters / runnerReactionSeconds / extraBaseSafetySeconds | リードm、反応秒、安打時追加進塁の安全余裕秒                        |
| plays      | transferSeconds / pivotSeconds                                    | 捕球から送球0.35秒、二塁からの転送0.25秒（新プレー用の未校正仮定） |
| plays      | tagUpReactionSeconds / tagUpSafetySeconds                         | 捕球後の走者反応0.2秒、本塁到達の安全余裕0.2秒                     |
| plays      | coverPreparationPitchFraction                                     | 投球飛行時間のうち塁カバー準備に使う割合。仮定1、許容0〜1          |

能力の正規化はRatingMilli/120000。塁間27.432m、守備初期位置、打球種類の角度境界、ゴロの減速、野手の最高移動速度式4+4×走力、回収0.8秒などは今回の編集対象外のアルゴリズム定数です。全定数を設定化したものではありません。

## 併殺・犠飛の試作式

捕球時間・地点を打球生成時に保存します。時刻は打球接触を0とする整数ms。判定の追加乱数は使いません。

- **併殺**：無死・一死、一塁走者あり、P/3B/SS/2Bが捕ったゴロが対象。2Bが捕ればSS、それ以外は2Bが二塁をカバーし、一塁手へ転送します。塁カバーは投球中から始める仮定とし、準備時間＝投球距離÷実球速×coverPreparationPitchFractionを守備反応＋加速移動時間から差し引きます。負にはしません。二塁到達＝max(捕球＋持替え＋送球距離÷肩速度、カバー到達)、一塁到達＝max(二塁到達＋転送＋塁間送球、一塁カバー到達)。一塁走者は反応＋(塁間−リード)÷走速度。両塁で走者より早く守備が到達する場合だけ、二塁フォース→打者一塁アウトを採用します。同時なら併殺を選びません。成立しなければ従来の打者一塁アウトです。
- **犠飛**：無死・一死、三塁走者あり、LF/CF/RFが捕ったflyが対象。走者は帰塁して捕球を待つ仮定です。走者到達＝捕球＋タッチアップ反応＋塁間÷走速度、返球到達＝捕球＋持替え＋捕球地点から本塁までの距離÷肩速度。走者到達＋安全余裕が返球より早い場合だけ生還します。2アウトからの捕球は得点を生みません。
- 成立判定だけでなく参加選手・役割・比較時刻・準備時間を版付きで保存します。アウト・走者移動の順を保持し、併殺は打数1・併殺打1・投手アウト2、犠飛は打席1・打数0・犠飛1・打点1です。得点は走者の責任投手へ帰属します。
- その他の走者は元の塁に留めます。併殺崩れ・野選・走塁死・中継やタッチの細分化・飛球併殺・ライナー/ポップの犠飛・犠飛失策・全守備成績（刺殺・補殺・守備回等）は未対応です。

これは実装した限定範囲と仮定の説明で、最終仕様の承認ではありません。資料の結果コードと成績項目を継承し、打席結果に独自のdoublePlayを追加せず、battedOutと2アウト・groundedIntoDoublePlaysで表しています。

確認用のseedと画面試験の期待値は同梱設定に対するものです。設定変更後は結果が変わるため、画面試験の新規v7の期待値は変更内容に応じて確認してください。旧版保存の期待値は再生成しません。計算の基準試験はtests/fixtures/match-v7-baseline.jsonを使用します。
