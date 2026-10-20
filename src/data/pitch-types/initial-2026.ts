import templates from '../initial-2026/seibu/preview-templates.json' with { type: 'json' };
import { createPitchProfileConfig } from './profiles.ts';
import { PITCH_TYPES, type PitchTypeCode } from './index.ts';
import { initialCandidatePreviewConfig } from '../../../config/initial-candidate-preview.ts';
import { validatePitchProfiles } from '../../engine/pitch-profile-validation.ts';
import { ensure } from '../../engine/validation.ts';
import type { PitchProfileConfig, PitchProfile } from '../../engine/pitch-profile-types.ts';

/** 旧9球種の作成関数は変更せず、候補検証にだけ追加4球種を組み合わせる。 */
export function createInitial2026PitchProfiles(): PitchProfileConfig {
  const config = createPitchProfileConfig();
  for (const [code, template] of Object.entries(templates.templates)) {
    ensure(
      Object.hasOwn(PITCH_TYPES, code) && template.status === 'authored-not-measured',
      '追加球種の候補が不正です',
    );
    const norm = Math.hypot(...template.axisVector);
    ensure(norm > 0 && Number.isFinite(norm), '追加球種の軸が不正です');
    const [xPpm, yPpm, zPpm] = template.axisVector.map((v) => Math.round((v / norm) * 1000000) + 0);
    const profile: PitchProfile = {
      code: code as PitchTypeCode,
      name: PITCH_TYPES[code as PitchTypeCode].name,
      selection: { ...initialCandidatePreviewConfig.selection },
      delivery: {
        spinRateRpm: template.spinRateRpm,
        spinSpreadRpm: template.spinSpreadRpm,
        spinAxis: { xPpm: xPpm!, yPpm: yPpm!, zPpm: zPpm! },
        release: { ...initialCandidatePreviewConfig.templateRelease },
      },
    };
    config.profiles.push(profile);
  }
  validatePitchProfiles(config);
  return config;
}
