/** 未校正の試作値。物理定数・実測値ではない。詳細は球種データのREADMEを参照。 */
export const pitchShapeConfig = {
  // 変化量の速度補正に使う基準。130.00 km/h、単位は0.01 km/h。
  referenceVelocityCentiKph: 13000,

  // 基準球速での1 rpm当たりの変化量（mm）。揚力係数の実測値ではない。
  breakMmPerRpm: 0.12,

  // 打者が読み取る変化の基本割合（0〜1）。
  recognitionBase: 0.35,

  // 選球眼0〜120の正規化値へ掛ける認識割合。上の値との合計は1以下。
  recognitionDiscipline: 0.5,

  // 読み残した到達点誤差1 m当たりの接触確率の減少量（0〜1）。
  contactPenaltyPerMeter: 0.22,
};
