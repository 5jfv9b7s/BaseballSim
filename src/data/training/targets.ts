import { COMMON_ABILITIES } from '../../players/abilities.ts';
import type { TrainingTargetCatalog } from '../../world/training-types.ts';

/** 能力群の構成。保存内にコピーし、開始後の辞書編集を持ち込まない。 */
export function createTrainingTargetCatalog(): TrainingTargetCatalog {
  const codes = Object.keys(COMMON_ABILITIES) as (keyof typeof COMMON_ABILITIES)[];
  return {
    version: 'training-targets-v1',
    groups: [
      { groupId: 'balanced', label: '基本能力全体', members: codes },
      {
        groupId: 'contact',
        label: 'ミート全体（左右）',
        members: ['batting.contactVsRight', 'batting.contactVsLeft'],
      },
      {
        groupId: 'power',
        label: 'パワー全体（左右）',
        members: ['batting.powerVsRight', 'batting.powerVsLeft'],
      },
      ...(['batting', 'running', 'fielding', 'catching', 'physical', 'pitching'] as const).map(
        (scope, index) => ({
          groupId: scope,
          label: ['打撃全体', '走塁全体', '守備全体', '捕手全体', '身体全体', '投手技能全体'][
            index
          ]!,
          members: codes.filter((code) => code.startsWith(scope + '.')),
        }),
      ),
    ],
  };
}
