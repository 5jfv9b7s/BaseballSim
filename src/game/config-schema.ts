/**
 * match-config-v1：設定値に許される範囲
 *
 * 各項目を config/match.ts と同じ順序で記載しています。
 * min＝含めてよい最小値、max＝含めてよい最大値。現在の設定値ではありません。
 * items＝配列の各要素の範囲、length＝必要な要素数です。
 *
 * 通常の係数調整は config/match.ts で行います。
 * このファイルの範囲は保存済み設定の検査にも使うため、変更時には版の見直しが必要です。
 * 項目間の関係（最小角度 < 最頻角度 < 最大角度など）は config.ts で検査します。
 */
export interface NumberRule {
  min: number;
  max: number;
}

export interface ArrayRule {
  items: NumberRule;
  length: number;
}

export type Rule = NumberRule | ArrayRule | { [key: string]: Rule };

const configSchema = {
  // ── 投球・配球・打者判断 ──
  pitch: {
    // 配球：球種を選ぶ相対重み
    // 値は割合そのものではなく重みです。fastball＝直球、slider＝スライダー、fork＝フォーク。
    // 基本の選択重み
    baseWeights: {
      fastball: { min: 0.01, max: 100 },
      slider: { min: 0.01, max: 100 },
      fork: { min: 0.01, max: 100 },
    },
    // 2ストライク時に掛ける倍率
    twoStrike: {
      fastball: { min: 0.01, max: 100 },
      slider: { min: 0.01, max: 100 },
      fork: { min: 0.01, max: 100 },
    },
    // 3ボール時に掛ける倍率
    threeBall: {
      fastball: { min: 0.01, max: 100 },
      slider: { min: 0.01, max: 100 },
      fork: { min: 0.01, max: 100 },
    },
    // 投手と打者の左右が異なる場合に掛ける倍率
    oppositeSide: {
      fastball: { min: 0.01, max: 100 },
      slider: { min: 0.01, max: 100 },
      fork: { min: 0.01, max: 100 },
    },

    // 狙う位置（mm）
    // 各配列から1つを選びます。x＝左右、z＝高さ。数値は小さい順に3個。
    // 通常時：左右の狙い
    aimXMm: { items: { min: -1000, max: 1000 }, length: 3 },
    // 通常時：高さの狙い
    aimZMm: { items: { min: 0, max: 3000 }, length: 3 },
    // 2ストライク時：左右の狙い
    chaseAimXMm: { items: { min: -1000, max: 1000 }, length: 3 },
    // 2ストライク時：高さの狙い
    chaseAimZMm: { items: { min: 0, max: 3000 }, length: 3 },
    // 3ボール時：左右の狙い（2ストライクより優先）
    threeBallAimXMm: { items: { min: -1000, max: 1000 }, length: 3 },
    // 3ボール時：高さの狙い（2ストライクより優先）
    threeBallAimZMm: { items: { min: 0, max: 3000 }, length: 3 },

    // ストライクゾーンと投球のばらつき
    // 位置誤差の半幅＝最小幅＋追加幅×(1−制球/120000)。
    // ゾーンの左端・右端・下端・上端（mm）
    zone: {
      leftMm: { min: -1000, max: 1000 },
      rightMm: { min: 0, max: 3000 },
      bottomMm: { min: 0, max: 3000 },
      topMm: { min: 0, max: 3000 },
    },
    // 制球が最大でも残る位置誤差の半幅（mm）
    positionErrorMinMm: { min: 0, max: 3000 },
    // 制球が低いほど加わる誤差の半幅（mm）
    positionErrorScaleMm: { min: 0, max: 3000 },
    // 球速のばらつきを再現性能力で減らす最大割合（0〜1）
    velocityRepeatabilityReduction: { min: 0, max: 1 },

    // 打者判断：振る確率
    // 以下は確率式に足す・引く係数です。最終確率は0〜1に制限します。
    // ゾーン内：基準値
    swingInBase: { min: 0, max: 1 },
    // ゾーン内：積極性による加算係数
    swingInAggression: { min: 0, max: 1 },
    // ゾーン内：選球眼による加算係数
    swingInDiscipline: { min: 0, max: 1 },
    // ゾーン外：基準値
    swingOutBase: { min: 0, max: 1 },
    // ゾーン外：積極性による加算係数
    swingOutAggression: { min: 0, max: 1 },
    // ゾーン外：選球眼による減算係数
    swingOutDiscipline: { min: 0, max: 1 },
    // 2ストライク時：ゾーン内で追加する値
    protectInside: { min: 0, max: 1 },
    // 2ストライク時：ゾーン外で追加する値
    protectOutside: { min: 0, max: 1 },
    // 3ボールかつ2ストライク未満で差し引く値
    threeBallPatience: { min: 0, max: 1 },

    // 打者判断：バットに当たる確率
    // 左右別ミート能力、球速、ゾーン内外、ストライク数から計算します。
    // 接触確率の基準値
    contactBase: { min: 0, max: 1 },
    // ミート能力による加算係数
    contactAbility: { min: 0, max: 1 },
    // 速球による減算を始める基準球速（km/h）
    contactSpeedReferenceKph: { min: 0, max: 200 },
    // 基準球速を1km/h超えるごとの減算量
    contactSpeedPenaltyPerKph: { min: 0, max: 0.1 },
    // ゾーン外で差し引く値
    contactOutsidePenalty: { min: 0, max: 1 },
    // 2ストライク時に追加する基準値
    contactProtectBase: { min: 0, max: 1 },
    // 2ストライク時にミート能力で追加する係数
    contactProtectAbility: { min: 0, max: 1 },
    // 接触確率の下限（0〜1）
    contactMin: { min: 0, max: 1 },
    // 接触確率の上限（0〜1）
    contactMax: { min: 0, max: 1 },

    // 打者判断：接触した球がファウルになる確率
    // 接触が成立した後に使います。
    // ファウル確率の基準値
    foulBase: { min: 0, max: 1 },
    // ミート能力による減算係数
    foulAbilityReduction: { min: 0, max: 1 },
    // ゾーン外で追加する値
    foulOutside: { min: 0, max: 1 },
    // 2ストライク時に追加する値
    foulTwoStrike: { min: 0, max: 1 },

    // 身体の位置と死球回避
    // 身体は矩形で近似する試作です。回避は見送った球だけで評価します。
    // 身体中心の左右距離。打席の左右に応じて符号を反転（mm）
    bodyCenterMm: { min: 0, max: 3000 },
    // 身体矩形の横幅の半分（mm）
    bodyHalfWidthMm: { min: 0, max: 3000 },
    // 身体矩形の下端の高さ（mm）
    bodyBottomMm: { min: 0, max: 3000 },
    // 身体矩形の上端の高さ（mm）
    bodyTopMm: { min: 0, max: 3000 },
    // 投球の飛行時間を計算する距離（m）。併殺のカバー準備にも使用
    deliveryDistanceMeters: { min: 10, max: 25 },
    // 回避の基本反応時間（秒）
    avoidanceReactionSeconds: { min: 0, max: 5 },
    // 選球眼によって短縮する最大反応時間（秒）
    avoidanceDisciplineReductionSeconds: { min: 0, max: 5 },
    // 不意を突かれた場合に加わる最大時間（秒）
    avoidanceSurpriseSeconds: { min: 0, max: 5 },
    // 身体を逃がす移動速度（m/s）
    avoidanceSpeedMetersPerSecond: { min: 0, max: 20 },
    // 身体を逃がせる距離の上限（mm）
    avoidanceMaxShiftMm: { min: 0, max: 1000 },
  },

  // ── 打球・球場・守備 ──
  battedBall: {
    // 打球の初速（km/h）
    // 初速＝基準＋パワー寄与＋投球速度寄与＋乱数の揺れ−接触優先の減速。
    // 打球速度の基準値（km/h）
    exitSpeedBaseKph: { min: 0, max: 200 },
    // パワー能力による最大加算速度（km/h）
    exitSpeedPowerKph: { min: 0, max: 200 },
    // 投球速度に掛けて加える倍率
    exitSpeedPitchFactor: { min: 0, max: 1 },
    // 乱数の揺れ幅（km/h）。この値の半分を上下に加減
    exitSpeedNoiseKph: { min: 0, max: 200 },

    // 2ストライク時の接触優先
    // 減速＝基準減速−回復量×左右ミート/120000。100で1km/h。
    // 接触を優先したときの基準減速（0.01km/h）
    protectExitSpeedPenaltyCentiKph: { min: 0, max: 3000 },
    // ミート能力によって取り戻せる最大速度（0.01km/h）
    protectContactRecoveryCentiKph: { min: 0, max: 3000 },

    // 打球角度の三角分布（度）
    // 最小 < 最頻 < 最大。最頻値付近が出やすくなります。
    // 最小角度
    angleMinimumDegrees: { min: -80, max: 80 },
    // 最も出やすい角度
    angleModeDegrees: { min: -80, max: 80 },
    // 最大角度
    angleMaximumDegrees: { min: -80, max: 80 },

    // 飛行と球場
    // 距離・高さはm。実在球場の再現値ではありません。
    // 重力加速度（m/s²）
    gravityMetersPerSecond2: { min: 1, max: 20 },
    // 空中の水平速度に掛ける減速倍率
    airborneDragFactor: { min: 0.1, max: 1 },
    // センター方向のフェンスまでの距離（m）
    fenceCenterMeters: { min: 60, max: 160 },
    // 両翼方向のフェンスまでの距離（m）
    fenceCornerMeters: { min: 60, max: 160 },
    // フェンスの高さ（m）
    fenceHeightMeters: { min: 0, max: 20 },

    // 野手の反応・移動・送球
    // 守備範囲能力は反応時間、肩能力は送球速度へ反映します。
    // 守備の基本反応時間（秒）
    fielderReactionBaseSeconds: { min: 0, max: 5 },
    // 守備範囲能力によって短縮する最大時間（秒）
    fielderReactionReductionSeconds: { min: 0, max: 5 },
    // 停止状態から走り出す加速度（m/s²）
    fielderAccelerationMetersPerSecond2: { min: 1, max: 20 },
    // 送球速度の基準値（m/s）
    throwBaseMetersPerSecond: { min: 1, max: 40 },
    // 肩能力による最大加算速度（m/s）
    throwAbilityMetersPerSecond: { min: 0, max: 20 },
  },

  // ── 走塁 ──
  running: {
    // 走速度
    // 走速度＝基準＋能力寄与×走力/120000。
    // 走速度の基準値（m/s）
    runnerBaseMetersPerSecond: { min: 1, max: 40 },
    // 走力能力による最大加算速度（m/s）
    runnerAbilityMetersPerSecond: { min: 0, max: 20 },

    // リードと追加進塁
    // 犠飛のタッチアップではリードを使いません。
    // 既存走者のリード距離（m）
    runnerLeadMeters: { min: 0, max: 10 },
    // 既存走者がスタートするまでの反応時間（秒）
    runnerReactionSeconds: { min: 0, max: 5 },
    // 安打時に追加進塁するための安全余裕（秒）
    extraBaseSafetySeconds: { min: 0, max: 5 },
  },

  // ── 併殺・犠牲フライ ──
  plays: {
    // 捕球後の送球と併殺
    // 以下も未校正の仮定です。
    // 捕球から送球までの持ち替え時間（秒）。通常の一塁送球にも使用
    transferSeconds: { min: 0, max: 5 },
    // 二塁フォース後、一塁へ転送するまでの時間（秒）
    pivotSeconds: { min: 0, max: 5 },
    // 投球の飛行時間のうち、塁カバー準備に使う割合（0〜1）
    coverPreparationPitchFraction: { min: 0, max: 1 },

    // 犠飛のタッチアップ
    // 捕球を待って走り出し、返球より十分早く到達できる場合に生還します。
    // 捕球後、三塁走者が走り始めるまでの時間（秒）
    tagUpReactionSeconds: { min: 0, max: 5 },
    // 本塁到達に必要な安全余裕（秒）
    tagUpSafetySeconds: { min: 0, max: 5 },
  },
} satisfies Record<string, Rule>;

export default configSchema;
