import { ensure, integer } from './validation.ts';
import type { PitchDelivery, PitchProfileConfig } from './pitch-profile-types.ts';

export function validateDelivery(d: PitchDelivery): void {
  ensure(d && typeof d === 'object' && d.spinAxis && d.release, '回転・リリースの入力が必要です');
  integer(d.spinRateRpm, 0, 5000, '回転数');
  integer(d.spinSpreadRpm, 0, 1000, '回転幅');
  ensure(d.spinSpreadRpm <= d.spinRateRpm, '回転幅が基本回転数を超えています');
  for (const value of [d.spinAxis.xPpm, d.spinAxis.yPpm, d.spinAxis.zPpm])
    integer(value, -1000000, 1000000, '回転軸');
  ensure(
    Math.abs(Math.hypot(d.spinAxis.xPpm, d.spinAxis.yPpm, d.spinAxis.zPpm) / 1000000 - 1) <=
      0.000002,
    '回転軸は単位ベクトルです',
  );
  integer(d.release.lateralMm, -1500, 1500, 'リリース左右');
  integer(d.release.heightMm, 500, 3000, 'リリース高');
  integer(d.release.extensionMm, 0, 3000, 'リリース前方');
}

export function validatePitchProfiles(config: PitchProfileConfig): void {
  ensure(config?.version === 'pitch-shape-v1', '未対応の球種特性モデルです');
  ensure(
    Array.isArray(config.profiles) && config.profiles.length > 0 && config.profiles.length <= 128,
    '球種特性の件数が不正です',
  );
  const codes = new Set<string>();
  for (const p of config.profiles) {
    ensure(
      p &&
        typeof p.code === 'string' &&
        /^[a-zA-Z][a-zA-Z0-9]*$/.test(p.code) &&
        !codes.has(p.code),
      '球種コードが不正または重複しています',
    );
    codes.add(p.code);
    ensure(
      typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 80,
      '球種名が必要です',
    );
    validateDelivery(p.delivery);
    for (const key of ['baseWeight', 'twoStrike', 'threeBall', 'oppositeSide'] as const) {
      const value = p.selection?.[key];
      ensure(
        Number.isFinite(value) && value > 0 && value <= 100,
        '配球の重みは0より大きく100以下です',
      );
    }
  }
  const m = config.movement;
  ensure(m && typeof m === 'object', '変化量の係数が必要です');
  integer(m.referenceVelocityCentiKph, 5000, 18000, '基準球速');
  for (const key of [
    'breakMmPerRpm',
    'recognitionBase',
    'recognitionDiscipline',
    'contactPenaltyPerMeter',
  ] as const)
    ensure(Number.isFinite(m[key]) && m[key] >= 0 && m[key] <= 1, '球種係数は0以上1以下です');
  ensure(m.recognitionBase + m.recognitionDiscipline <= 1, '認識割合は1以下です');
}
