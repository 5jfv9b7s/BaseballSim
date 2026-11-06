import { ensure } from '../engine/validation.ts';
import type {
  TradeInspectionProposal,
  TradeInspectionReport,
  TradePlayerImpact,
} from '../recruitment/trade-inspection-types.ts';
import { allWorldSquads } from './squads.ts';
import type { WorldRecord } from './types.ts';

/** Worker正本の読取検査。変更案の適用・乱数・採番・保存は行わない。 */
export function inspectWorldTrade(
  world: WorldRecord,
  context: Pick<TradeInspectionReport, 'requestId' | 'localWorldId' | 'stateRevision'>,
  proposal: TradeInspectionProposal,
): TradeInspectionReport {
  ensure(proposal && typeof proposal === 'object', 'トレード条件がありません');
  ensure(typeof proposal.partnerSquadId === 'string', '相手球団IDが不正です');
  for (const ids of [proposal.outgoingIds, proposal.incomingIds]) {
    ensure(
      Array.isArray(ids) && [...ids].every((id) => typeof id === 'string' && id.trim().length > 0),
      'トレードの選手IDが不正です',
    );
  }
  ensure(
    Number.isSafeInteger(proposal.cashYen) && proposal.cashYen >= 0,
    '提示金銭は円単位の0以上の安全な整数が必要です',
  );

  const blockers: TradeInspectionReport['blockers'] = [];
  const block = (
    code: TradeInspectionReport['blockers'][number]['code'],
    message: string,
    playerId?: string,
  ) => blockers.push({ code, message, ...(playerId ? { playerId } : {}) });
  const management = 'management' in world ? world.management : null;
  const own = world.definitions.squads.find((s) => s.squadId === management?.controlledSquadId);
  const partner = world.definitions.squads.find((s) => s.squadId === proposal.partnerSquadId);
  if (!own) block('selection', '担当球団の記録がありません。');
  if (!partner || own?.team.clubId === partner.team.clubId)
    block('selection', '相手には別の球団を選んでください。');
  const sides = [
    {
      squad: own,
      ids: proposal.outgoingIds,
      target: partner,
      receivedCount: proposal.incomingIds.length,
    },
    {
      squad: partner,
      ids: proposal.incomingIds,
      target: own,
      receivedCount: proposal.outgoingIds.length,
    },
  ];
  const selected = [...proposal.outgoingIds, ...proposal.incomingIds];
  if (new Set(selected).size !== selected.length)
    block('selection', '同じ選手を重複して指定できません。');
  if (!proposal.incomingIds.length || (!proposal.outgoingIds.length && proposal.cashYen === 0))
    block('selection', '獲得選手と、出す選手または提示金銭を指定してください。');
  for (const { squad, ids } of sides) {
    if (ids.some((id) => !squad?.players.some((p) => p.playerId === id)))
      block('selection', '選手の所属が現在の名簿と一致しません。選び直してください。');
  }
  const selectionValid = !blockers.length;
  // 指定の有無から開始状態を推測せず、一二軍すべての当日実試合も調べる。
  const todayGameIds = new Set([
    ...world.dayPlan.gameIds,
    ...world.definitions.schedule.filter((g) => g.date === world.currentDate).map((g) => g.gameId),
  ]);
  if (
    world.currentDate > world.definitions.endDate ||
    world.dayPlan.date !== world.currentDate ||
    world.dayPlan.cursor > 0 ||
    [...todayGameIds].some((id) => world.games[id])
  )
    block('dayUnavailable', '当日の試合開始後、または日程終了後は移籍を確定できません。');

  const players: TradePlayerImpact[] = [];
  const squads = allWorldSquads(world.definitions);
  if (selectionValid)
    for (const { squad, ids, target } of sides) {
      for (const playerId of ids) {
        const memberships =
          'registration' in world
            ? world.registration.memberships.filter(
                (m) =>
                  m.playerId === playerId && m.until === null && m.from.date <= world.currentDate,
              )
            : [];
        const registrations =
          'registration' in world
            ? world.registration.registrations.filter(
                (r) =>
                  r.playerId === playerId && r.until === null && r.from.date <= world.currentDate,
              )
            : [];
        const registration =
          registrations.length === 1 && registrations[0]!.clubId === squad!.team.clubId
            ? registrations[0]!
            : null;
        const membershipKnown =
          memberships.length === 1 && memberships[0]!.clubId === squad!.team.clubId;
        if (!membershipKnown)
          block('membershipUnavailable', '現在所属を履歴で確認できません。', playerId);
        if (!registration)
          block('registrationUnavailable', '現在登録を履歴で確認できません。', playerId);
        const preference =
          'rosterControl' in world
            ? (world.rosterControl.preferences.find(
                (p) => p.playerId === playerId && p.clubId === squad!.team.clubId,
              )?.preference ?? null)
            : null;
        const roles = squads
          .filter((s) => s.team.clubId === squad!.team.clubId)
          .map((s) => {
            const lineup = management?.idealLineups[s.squadId];
            const pitchers = management?.pitcherUsagePlans[s.squadId];
            return {
              squadId: s.squadId,
              squadName: s.team.name,
              battingSlots:
                lineup?.battingOrder.filter((b) => b.playerId === playerId).map((b) => b.slotNo) ??
                [],
              positions:
                lineup?.defense.filter((d) => d.playerId === playerId).map((d) => d.positionCode) ??
                [],
              rotationSlots:
                pitchers?.rotationSlots
                  .filter((p) => p.playerId === playerId)
                  .map((p) => p.slotNo) ?? [],
              relief: pitchers?.reliefRoles.some((p) => p.playerId === playerId) ?? false,
            };
          })
          .filter(
            (r) =>
              r.battingSlots.length || r.positions.length || r.rotationSlots.length || r.relief,
          );
        const futureGameIds = world.definitions.schedule
          .filter((g) => {
            if (g.date < world.currentDate || world.games[g.gameId]) return false;
            if (
              !squads.some(
                (s) =>
                  s.team.clubId === squad!.team.clubId &&
                  (s.squadId === g.awaySquadId || s.squadId === g.homeSquadId),
              )
            )
              return false;
            const lineup = 'gameLineups' in world ? world.gameLineups[g.gameId] : undefined;
            // benchOverridesは担当球団の指定だけ。他球団の同一試合へ誤帰属させない。
            const bench =
              own?.team.clubId === squad!.team.clubId && 'registration' in world
                ? world.registration.benchOverrides[g.gameId]
                : undefined;
            return (
              management?.starterOverrides[g.gameId] === playerId ||
              lineup?.battingOrder.some((b) => b.playerId === playerId) ||
              lineup?.defense.some((d) => d.playerId === playerId) ||
              bench?.includes(playerId)
            );
          })
          .map((g) => g.gameId);
        players.push({
          playerId,
          fromClubId: squad!.team.clubId,
          toClubId: target!.team.clubId,
          membershipKnown,
          registration: registration
            ? {
                category: registration.category,
                nextFirstEligibleOn: registration.nextFirstEligibleOn,
              }
            : null,
          preference,
          roles,
          futureGameIds,
        });
      }
    }
  if (players.length)
    block(
      'formationRequired',
      '移籍先の登録先・固定希望と、両球団の補充後の編成を指定する必要があります。',
    );
  block('contractsUnavailable', 'このプレイには年俸・契約の記録がなく、給与負担を審査できません。');
  block('budgetUnavailable', 'このプレイには資金・予算の記録がなく、支払可能額を審査できません。');
  block('negotiationUnavailable', '交渉の評価・返答・承認と、移籍の保存は未接続です。');
  return {
    modelVersion: 'trade-inspection-v1',
    ...context,
    worldId: world.worldId,
    currentDate: world.currentDate,
    status: 'blocked',
    blockers,
    counts: selectionValid
      ? sides.map(({ squad, ids, receivedCount }) => ({
          clubId: squad!.team.clubId,
          before: squad!.players.length,
          after: squad!.players.length - ids.length + receivedCount,
        }))
      : null,
    players,
  };
}
