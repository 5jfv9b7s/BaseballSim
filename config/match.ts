/**
 * ゲームv0.1 / 試作モデルv7〜v9共通の設定
 *
 * 編集するのは各項目の数値です。説明はすべて日本語コメントで付けています。
 * 係数は未校正の仮定です。今回の整理では数値・式・保存形式を変更していません。
 * 能力値は原則として120000で割って0〜1に換算します。
 * 詳しい式・許容範囲・変更後の確認手順は同じフォルダのREADME.mdを参照。
 */
const matchConfig = {
  // ── 投球・配球・打者判断 ──
  pitch: {
    // 配球：球種を選ぶ相対重み
    // 値は割合そのものではなく重みです。fastball＝直球、slider＝スライダー、fork＝フォーク。
    // 基本の選択重み
    baseWeights: { fastball: 50, slider: 30, fork: 20 },
    // 2ストライク時に掛ける倍率
    twoStrike: { fastball: 0.8, slider: 1.2, fork: 1.4 },
    // 3ボール時に掛ける倍率
    threeBall: { fastball: 1.4, slider: 0.8, fork: 0.6 },
    // 投手と打者の左右が異なる場合に掛ける倍率
    oppositeSide: { fastball: 1, slider: 0.9, fork: 1.1 },

    // 狙う位置（mm）
    // 各配列から1つを選びます。x＝左右、z＝高さ。数値は小さい順に3個。
    // 通常時：左右の狙い
    aimXMm: [-190, 0, 190],
    // 通常時：高さの狙い
    aimZMm: [550, 800, 1050],
    // 2ストライク時：左右の狙い
    chaseAimXMm: [-245, 0, 245],
    // 2ストライク時：高さの狙い
    chaseAimZMm: [460, 800, 1140],
    // 3ボール時：左右の狙い（2ストライクより優先）
    threeBallAimXMm: [-100, 0, 100],
    // 3ボール時：高さの狙い（2ストライクより優先）
    threeBallAimZMm: [650, 800, 950],

    // ストライクゾーンと投球のばらつき
    // 位置誤差の半幅＝最小幅＋追加幅×(1−制球/120000)。
    // ゾーンの左端・右端・下端・上端（mm）
    zone: { leftMm: -216, rightMm: 216, bottomMm: 500, topMm: 1100 },
    // 制球が最大でも残る位置誤差の半幅（mm）
    positionErrorMinMm: 35,
    // 制球が低いほど加わる誤差の半幅（mm）
    positionErrorScaleMm: 300,
    // 球速のばらつきを再現性能力で減らす最大割合（0〜1）
    velocityRepeatabilityReduction: 0.7,

    // 打者判断：振る確率
    // 以下は確率式に足す・引く係数です。最終確率は0〜1に制限します。
    // ゾーン内：基準値
    swingInBase: 0.36,
    // ゾーン内：積極性による加算係数
    swingInAggression: 0.3,
    // ゾーン内：選球眼による加算係数
    swingInDiscipline: 0.12,
    // ゾーン外：基準値
    swingOutBase: 0.24,
    // ゾーン外：積極性による加算係数
    swingOutAggression: 0.2,
    // ゾーン外：選球眼による減算係数
    swingOutDiscipline: 0.24,
    // 2ストライク時：ゾーン内で追加する値
    protectInside: 0.28,
    // 2ストライク時：ゾーン外で追加する値
    protectOutside: 0,
    // 3ボールかつ2ストライク未満で差し引く値
    threeBallPatience: 0.12,

    // 打者判断：バットに当たる確率
    // 左右別ミート能力、球速、ゾーン内外、ストライク数から計算します。
    // 接触確率の基準値
    contactBase: 0.48,
    // ミート能力による加算係数
    contactAbility: 0.46,
    // 速球による減算を始める基準球速（km/h）
    contactSpeedReferenceKph: 130,
    // 基準球速を1km/h超えるごとの減算量
    contactSpeedPenaltyPerKph: 0.004,
    // ゾーン外で差し引く値
    contactOutsidePenalty: 0.18,
    // 2ストライク時に追加する基準値
    contactProtectBase: 0.08,
    // 2ストライク時にミート能力で追加する係数
    contactProtectAbility: 0.08,
    // 接触確率の下限（0〜1）
    contactMin: 0.05,
    // 接触確率の上限（0〜1）
    contactMax: 0.98,

    // 打者判断：接触した球がファウルになる確率
    // 接触が成立した後に使います。
    // ファウル確率の基準値
    foulBase: 0.5,
    // ミート能力による減算係数
    foulAbilityReduction: 0.15,
    // ゾーン外で追加する値
    foulOutside: 0.1,
    // 2ストライク時に追加する値
    foulTwoStrike: 0.03,

    // 身体の位置と死球回避
    // 身体は矩形で近似する試作です。回避は見送った球だけで評価します。
    // 身体中心の左右距離。打席の左右に応じて符号を反転（mm）
    bodyCenterMm: 410,
    // 身体矩形の横幅の半分（mm）
    bodyHalfWidthMm: 75,
    // 身体矩形の下端の高さ（mm）
    bodyBottomMm: 400,
    // 身体矩形の上端の高さ（mm）
    bodyTopMm: 1500,
    // 投球の飛行時間を計算する距離（m）。併殺のカバー準備にも使用
    deliveryDistanceMeters: 18.44,
    // 回避の基本反応時間（秒）
    avoidanceReactionSeconds: 0.18,
    // 選球眼によって短縮する最大反応時間（秒）
    avoidanceDisciplineReductionSeconds: 0.06,
    // 不意を突かれた場合に加わる最大時間（秒）
    avoidanceSurpriseSeconds: 0.28,
    // 身体を逃がす移動速度（m/s）
    avoidanceSpeedMetersPerSecond: 0.9,
    // 身体を逃がせる距離の上限（mm）
    avoidanceMaxShiftMm: 220,
  },

  // ── 打球・球場・守備 ──
  battedBall: {
    // 打球の初速（km/h）
    // 初速＝基準＋パワー寄与＋投球速度寄与＋乱数の揺れ−接触優先の減速。
    // 打球速度の基準値（km/h）
    exitSpeedBaseKph: 70,
    // パワー能力による最大加算速度（km/h）
    exitSpeedPowerKph: 55,
    // 投球速度に掛けて加える倍率
    exitSpeedPitchFactor: 0.16,
    // 乱数の揺れ幅（km/h）。この値の半分を上下に加減
    exitSpeedNoiseKph: 24,

    // 2ストライク時の接触優先
    // 減速＝基準減速−回復量×左右ミート/120000。100で1km/h。
    // 接触を優先したときの基準減速（0.01km/h）
    protectExitSpeedPenaltyCentiKph: 1200,
    // ミート能力によって取り戻せる最大速度（0.01km/h）
    protectContactRecoveryCentiKph: 600,

    // 打球角度の三角分布（度）
    // 最小 < 最頻 < 最大。最頻値付近が出やすくなります。
    // 最小角度
    angleMinimumDegrees: -45,
    // 最も出やすい角度
    angleModeDegrees: 5,
    // 最大角度
    angleMaximumDegrees: 75,

    // 飛行と球場
    // 距離・高さはm。実在球場の再現値ではありません。
    // 重力加速度（m/s²）
    gravityMetersPerSecond2: 9.81,
    // 空中の水平速度に掛ける減速倍率
    airborneDragFactor: 0.72,
    // センター方向のフェンスまでの距離（m）
    fenceCenterMeters: 120,
    // 両翼方向のフェンスまでの距離（m）
    fenceCornerMeters: 100,
    // フェンスの高さ（m）
    fenceHeightMeters: 3,

    // 野手の反応・移動・送球
    // 守備範囲能力は反応時間、肩能力は送球速度へ反映します。
    // 守備の基本反応時間（秒）
    fielderReactionBaseSeconds: 0.65,
    // 守備範囲能力によって短縮する最大時間（秒）
    fielderReactionReductionSeconds: 0.25,
    // 停止状態から走り出す加速度（m/s²）
    fielderAccelerationMetersPerSecond2: 8,
    // 送球速度の基準値（m/s）
    throwBaseMetersPerSecond: 20,
    // 肩能力による最大加算速度（m/s）
    throwAbilityMetersPerSecond: 15,
  },

  // ── 走塁 ──
  running: {
    // 走速度
    // 走速度＝基準＋能力寄与×走力/120000。
    // 走速度の基準値（m/s）
    runnerBaseMetersPerSecond: 5,
    // 走力能力による最大加算速度（m/s）
    runnerAbilityMetersPerSecond: 4,

    // リードと追加進塁
    // 犠飛のタッチアップではリードを使いません。
    // 既存走者のリード距離（m）
    runnerLeadMeters: 3,
    // 既存走者がスタートするまでの反応時間（秒）
    runnerReactionSeconds: 0.2,
    // 安打時に追加進塁するための安全余裕（秒）
    extraBaseSafetySeconds: 0.8,
  },

  // ── 併殺・犠牲フライ ──
  plays: {
    // 捕球後の送球と併殺
    // 以下も未校正の仮定です。
    // 捕球から送球までの持ち替え時間（秒）。通常の一塁送球にも使用
    transferSeconds: 0.35,
    // 二塁フォース後、一塁へ転送するまでの時間（秒）
    pivotSeconds: 0.25,
    // 投球の飛行時間のうち、塁カバー準備に使う割合（0〜1）
    coverPreparationPitchFraction: 1,

    // 犠飛のタッチアップ
    // 捕球を待って走り出し、返球より十分早く到達できる場合に生還します。
    // 捕球後、三塁走者が走り始めるまでの時間（秒）
    tagUpReactionSeconds: 0.2,
    // 本塁到達に必要な安全余裕（秒）
    tagUpSafetySeconds: 0.2,
  },
};

export default matchConfig;
