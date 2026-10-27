import { currentCommonAbilities, growthAbilityKey } from './growth-basis.ts';
import type { GameFixture } from '../game/types.ts';
import type { WorldRecord } from './types.ts';

/** 複製済みの試合入力へ現在の基本能力を渡す。初期定義と過去試合を変更しない。 */
export function applyGrowthFixture(world: WorldRecord, fixture: GameFixture): void {
  if (!('growth' in world)) return;
  for (const player of fixture.players) {
    const abilities = currentCommonAbilities(world, player.playerId)!;
    player.batting.contactVsRight = abilities['batting.contactVsRight'];
    player.batting.contactVsLeft = abilities['batting.contactVsLeft'];
    player.powerVsRight = abilities['batting.powerVsRight'];
    player.powerVsLeft = abilities['batting.powerVsLeft'];
    player.batting.plateDiscipline = abilities['batting.plateDiscipline'];
    player.runningSpeed = abilities['running.speed'];
    player.fieldingRange = abilities['fielding.range'];
    player.fielding!.catching = abilities['fielding.catching'];
    player.armStrength = abilities['fielding.armStrength'];
  }
  for (const pitch of fixture.pitches) {
    if (world.version === 'world-prototype-v21')
      pitch.acquisitionProgressMilli =
        world.growth.state.acquisition[pitch.pitchId]?.progressMilli ??
        pitch.acquisitionProgressMilli;
    const values = world.growth.state.players[pitch.playerId]!.values;
    for (const code of ['control', 'repeatability'] as const)
      pitch[code] = {
        ...pitch[code],
        valueMilli: values[growthAbilityKey({ scope: 'pitch', pitchId: pitch.pitchId, code })]!,
      };
  }
}
