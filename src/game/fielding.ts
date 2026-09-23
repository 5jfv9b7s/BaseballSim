import { usesFielding } from './model-registry.ts';
import { ensure } from '../engine/validation.ts';
import type {
  Defender,
  DefensivePosition,
  FieldingAction,
  GameEvent,
  GameFixture,
} from './types.ts';

/** v9以降の守備記録。試合結果・能力・乱数を変更せず、アウトと捕球失策を記録する。 */
export function recordFielding(event: GameEvent, fixture: GameFixture): void {
  ensure(event.pitch && usesFielding(event.simulationVersion), '守備記録の対象が不正です');
  ensure(!event.fieldingActions && !event.defensiveAlignment, '守備記録は二重適用できません');

  const team = fixture.teams[event.before.half === 'top' ? 'home' : 'away'];
  const alignment: Defender[] = [
    { playerId: event.pitch.pitcherId, position: 'P' },
    ...team.lineup
      .filter((slot) => slot.position !== 'DH')
      .map((slot) => ({
        playerId: slot.playerId,
        position: slot.position as DefensivePosition,
      })),
  ];
  ensure(team.pitcherIds.includes(event.pitch.pitcherId), '守備投手の参照が不正です');
  ensure(alignment.length === 9, '守備参加者が9人ではありません');
  event.defensiveAlignment = alignment;
  const actions: FieldingAction[] = [];
  event.fieldingActions = actions;

  const at = (position: DefensivePosition) => {
    const defender = alignment.find((slot) => slot.position === position);
    ensure(defender, '守備位置の参照が不正です');
    return defender;
  };
  const act = (
    defender: Defender,
    kind: FieldingAction['kind'],
    details: Partial<
      Pick<
        FieldingAction,
        'targetPlayerId' | 'targetBase' | 'outDecisionIndex' | 'assistedOutIndices'
      >
    > = {},
  ) => {
    actions.push({ ...defender, actionSeq: actions.length + 1, kind, ...details });
  };
  const putout = (defender: Defender, index: number, targetBase?: 1 | 2) => {
    const decision = event.outDecisions[index];
    ensure(decision?.countsTowardInning, '刺殺に対応するアウトがありません');
    act(defender, 'putout', {
      outDecisionIndex: index,
      targetPlayerId: decision.playerId,
      ...(targetBase ? { targetBase } : {}),
    });
  };
  const transfer = (
    from: Defender,
    to: Defender,
    targetBase: 1 | 2,
    assistedOutIndices: number[],
  ) => {
    act(from, 'throw', {
      targetPlayerId: to.playerId,
      targetBase,
      ...(assistedOutIndices.length ? { assistedOutIndices } : {}),
    });
    act(to, 'receive', { targetBase });
  };

  if (event.errorEvaluation?.occurred) {
    const error = event.errorEvaluation;
    const defender = alignment.find(
      (p) => p.playerId === error.playerId && p.position === error.position,
    );
    ensure(
      defender && event.outcome === 'reachedOnError' && !event.outDecisions.length,
      '失策とアウトの記録が一致しません',
    );
    act(defender, 'error');
  }

  if (event.outDecisions.length) {
    if (event.outcome === 'strikeout') {
      // 振り逃げ未対応の現モデルでは、捕手の捕球で三振アウトが成立する。
      const catcher = at('C');
      ensure(event.pitch.catcherId === catcher.playerId, '捕手の参照が不正です');
      act(catcher, 'catch');
      putout(catcher, 0);
    } else {
      const ball = event.battedBall;
      ensure(ball?.fielderId && ball.fieldingPosition !== 'DH', '打球アウトの守備記録がありません');
      const fielder = alignment.find((slot) => slot.playerId === ball.fielderId);
      ensure(
        fielder && fielder.position === ball.fieldingPosition,
        '捕球者と守備位置が一致しません',
      );
      const evaluation = event.fieldingEvaluation;
      const doublePlay = evaluation?.resolution === 'doublePlay';
      const choice = event.outcome === 'fieldersChoice';

      if (doublePlay || choice) {
        ensure(evaluation?.play === 'doublePlay', '併殺候補の記録がありません');
        const pivotActor = evaluation.participants.find((p) => p.role === 'pivot');
        const pivot = alignment.find((slot) => slot.playerId === pivotActor?.playerId);
        ensure(pivot && pivot.position === pivotActor?.position, '二塁カバーの参照が不正です');
        const receiver = at('1B');
        act(fielder, 'field');
        transfer(fielder, pivot, 2, doublePlay ? [0, 1] : [0]);
        putout(pivot, 0, 2);
        // 野選でも転送は記録するが、打者アウトを取れない送球に補殺は付けない。
        transfer(pivot, receiver, 1, doublePlay ? [1] : []);
        if (doublePlay) putout(receiver, 1, 1);
      } else if (ball.type === 'ground') {
        act(fielder, 'field');
        const receiver = at('1B');
        // 一塁手自身のゴロ処理は自ら一塁を踏む限定仮定。投手カバーは未対応。
        if (fielder.playerId !== receiver.playerId) transfer(fielder, receiver, 1, [0]);
        putout(receiver, 0, 1);
      } else {
        // fly / line / popupの直接捕球。犠飛も捕球者の刺殺で、返球には補殺を付けない。
        act(fielder, 'catch');
        putout(fielder, 0);
      }
    }
  }

  const credit = (defender: Defender, metricCode: string, amount = 1) => {
    if (!amount) return;
    event.credits.push({
      creditId: `${event.gameId}:credit:${event.eventSeq}:${event.credits.length + 1}`,
      playerId: defender.playerId,
      position: defender.position,
      clubId: team.clubId,
      category: 'fielding',
      metricCode,
      amount,
      sourceEventSeq: event.eventSeq,
      ruleRef: event.rulesetVersion,
    });
  };
  for (const action of actions.filter((action) => action.kind === 'error'))
    credit(action, 'errors');

  const outs = event.outDecisions.filter((out) => out.countsTowardInning).length;
  for (const defender of alignment) credit(defender, 'fieldingOuts', outs);

  const putouts = actions.filter((action) => action.kind === 'putout');
  ensure(putouts.length === outs, '刺殺と有効アウトの数が一致しません');
  const participants = new Map<string, Defender>();
  for (const action of putouts) {
    credit(action, 'putouts');
    participants.set(action.playerId, action);
  }
  // 複数アウトへ寄与しても、同じ一連のプレーの補殺は選手ごとに1件。
  const assists = new Map<string, Defender>();
  for (const action of actions) {
    if (action.kind === 'throw' && action.assistedOutIndices?.length)
      assists.set(action.playerId, action);
  }
  for (const defender of assists.values()) {
    credit(defender, 'assists');
    participants.set(defender.playerId, defender);
  }
  if (outs === 2)
    for (const defender of participants.values()) credit(defender, 'doublePlayParticipations');
}
