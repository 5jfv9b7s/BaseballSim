import { currentCommonAbilities, growthAbilityKey } from './growth-basis.ts';
import type { GameFixture } from '../game/types.ts';
import type { WorldRecord } from './types.ts';
import type { GrowthState } from './growth-types.ts';

/** 複製済みの試合入力へ現在の基本能力を渡す。初期定義と過去試合を変更しない。 */
export function applyGrowthFixture(world: WorldRecord, fixture: GameFixture): void {
  if (!('growth' in world)) return;
  applyGrowthValues(world, fixture, world.version === 'world-prototype-v21');
}

/** 所属の解決と独立した能力の投影。受取済みの試合入力だけを書き換える。 */
export function applyGrowthValues(
  world: Pick<WorldRecord, 'definitions'> & { growth: GrowthState },
  fixture: GameFixture,
  includeAcquisition: boolean,
): void {
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
    if (includeAcquisition && world.growth.version === 'daily-development-v6')
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
