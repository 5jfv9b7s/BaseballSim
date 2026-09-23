import { usesMatchConfig, usesFieldersChoice, type GameModelVersion } from './model-registry.ts';
import { ensure } from '../engine/validation.ts';
import type {
  BattingLine,
  GameFixture,
  GameRecord,
  GameResult,
  PitchingLine,
  FieldingLine,
} from './types.ts';

function battingLine(playerId: string, version?: GameModelVersion): BattingLine {
  return {
    playerId,
    ...(usesMatchConfig(version) ? { sacrificeFlies: 0, groundedIntoDoublePlays: 0 } : {}),
    ...(usesFieldersChoice(version) ? { fieldersChoices: 0 } : {}),
    plateAppearances: 0,
    atBats: 0,
    hits: 0,
    doubles: 0,
    triples: 0,
    homeRuns: 0,
    runs: 0,
    runsBattedIn: 0,
    walks: 0,
    hitByPitch: 0,
    strikeouts: 0,
  };
}
function pitchingLine(playerId: string): PitchingLine {
  return {
    playerId,
    pitches: 0,
    battersFaced: 0,
    outsRecorded: 0,
    hitsAllowed: 0,
    homeRunsAllowed: 0,
    strikeouts: 0,
    walks: 0,
    hitBatters: 0,
    runsAllowed: 0,
    earnedRuns: 0,
  };
}

export function aggregateResult(record: GameRecord): GameResult {
  ensure(record.state.phase === 'gameComplete', '正常終了していない試合は成績確定できません');
  const fixture = record.fixture;
  const batting = ['away', 'home'].flatMap((side) =>
    fixture.teams[side as 'away' | 'home'].lineup.map((p) =>
      battingLine(p.playerId, record.state.simulationVersion),
    ),
  );
  const pitching = ['away', 'home'].flatMap((side) =>
    fixture.teams[side as 'away' | 'home'].pitcherIds.map((p) => pitchingLine(p)),
  );
  const fielding: FieldingLine[] | undefined =
    record.state.simulationVersion === 'game-prototype-v9' ? [] : undefined;
  const credits = new Set<string>();
  let pitchCount = 0;
  let appearanceCount = 0;
  for (const [index, event] of record.events.entries()) {
    ensure(
      event.eventSeq === index + 1 && event.gameId === record.state.gameId,
      'イベント順が不正です',
    );
    if (fielding && event.pitch) {
      ensure(
        event.defensiveAlignment?.length === 9 && event.fieldingActions,
        '守備記録が不足しています',
      );
      for (const defender of event.defensiveAlignment) {
        if (
          !fielding.some(
            (line) => line.playerId === defender.playerId && line.position === defender.position,
          )
        )
          fielding.push({
            ...defender,
            gamesAtPosition: 1,
            fieldingOuts: 0,
            putouts: 0,
            assists: 0,
            doublePlayParticipations: 0,
          });
      }
    }
    if (event.pitch) pitchCount++;
    if (event.outcome) appearanceCount++;
    for (const credit of event.credits) {
      ensure(!credits.has(credit.creditId), '成績帰属が重複しています');
      credits.add(credit.creditId);
      ensure(Number.isSafeInteger(credit.amount) && credit.amount >= 0, '成績量が不正です');
      const line =
        credit.category === 'batting'
          ? batting.find((p) => p.playerId === credit.playerId)
          : credit.category === 'pitching'
            ? pitching.find((p) => p.playerId === credit.playerId)
            : fielding?.find(
                (p) => p.playerId === credit.playerId && p.position === credit.position,
              );
      ensure(
        line &&
          Object.hasOwn(line, credit.metricCode) &&
          typeof (line as unknown as Record<string, unknown>)[credit.metricCode] === 'number',
        '未対応の成績帰属です',
      );
      const counters = line as unknown as Record<string, number>;
      counters[credit.metricCode]! += credit.amount;
    }
  }
  const teamSum = (
    fixture: GameFixture,
    side: 'away' | 'home',
    metric: keyof Omit<BattingLine, 'playerId'>,
  ) =>
    batting
      .filter((p) => fixture.teams[side].lineup.some((s) => s.playerId === p.playerId))
      .reduce((sum, p) => sum + (p[metric] ?? 0), 0);
  for (const side of ['away', 'home'] as const) {
    ensure(
      teamSum(fixture, side, 'runs') === record.state.score[side],
      '得点と走者記録が一致しません',
    );
    ensure(
      record.state.innings[side].reduce<number>((sum, runs) => sum + (runs ?? 0), 0) ===
        record.state.score[side],
      '回別得点が一致しません',
    );
    const opponent = side === 'home' ? 'away' : 'home';
    const allowed = pitching
      .filter((p) => fixture.teams[side].pitcherIds.includes(p.playerId))
      .reduce((sum, p) => sum + p.runsAllowed, 0);
    ensure(allowed === record.state.score[opponent], '責任投手別失点と得点が一致しません');
    if (fielding) {
      const club = fixture.clubs.find((club) => club.clubId === fixture.teams[side].clubId)!;
      const lines = fielding.filter((line) => club.playerIds.includes(line.playerId));
      const outs = pitching
        .filter((p) => fixture.teams[side].pitcherIds.includes(p.playerId))
        .reduce((sum, p) => sum + p.outsRecorded, 0);
      ensure(
        lines.reduce((sum, line) => sum + line.putouts, 0) === outs,
        '刺殺と投球アウトが一致しません',
      );
      ensure(
        lines.reduce((sum, line) => sum + line.fieldingOuts, 0) === outs * 9,
        '守備アウトと守備人数が一致しません',
      );
    }
  }
  for (const line of batting) {
    ensure(
      line.plateAppearances ===
        line.atBats + line.walks + line.hitByPitch + (line.sacrificeFlies ?? 0),
      '打席と打数の内訳が不正です',
    );
    ensure(
      line.hits <= line.atBats && line.doubles + line.triples + line.homeRuns <= line.hits,
      '安打内訳が不正です',
    );
  }
  ensure(
    pitchCount === record.state.totalPitches &&
      pitching.reduce((s, p) => s + p.pitches, 0) === pitchCount,
    '投球数が不正です',
  );
  ensure(
    batting.reduce((s, p) => s + p.plateAppearances, 0) === appearanceCount,
    '打席数が不正です',
  );
  const actualOuts = record.events.reduce((s, e) => s + e.outDecisions.length, 0);
  ensure(pitching.reduce((s, p) => s + p.outsRecorded, 0) === actualOuts, '投球アウト数が不正です');
  return {
    gameId: record.state.gameId,
    resultRevision: 1,
    winner:
      record.state.score.home === record.state.score.away
        ? 'draw'
        : record.state.score.home > record.state.score.away
          ? 'home'
          : 'away',
    score: { ...record.state.score },
    innings: structuredClone(record.state.innings),
    batting,
    pitching,
    ...(fielding ? { fielding } : {}),
    totalPitches: pitchCount,
    completedAppearances: appearanceCount,
    contributionKey: `${record.state.gameId}:attempt:1:result:1`,
  };
}

/** 確定結果は一度だけ作る。再呼出しでカウンタへ再加算しない。 */
export function finalizeGame(record: GameRecord): GameResult {
  if (record.result) return record.result;
  const result = aggregateResult(record);
  record.result = result;
  record.kind = `completed-${record.state.simulationVersion ?? 'game-prototype-v1'}`;
  return result;
}

export const inningsPitched = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;
export const battingAverage = (hits: number, atBats: number) =>
  atBats === 0 ? '-' : (hits / atBats).toFixed(3);
export const earnedRunAverage = (runs: number, outs: number) =>
  outs === 0 ? (runs === 0 ? '-' : '上限') : ((27 * runs) / outs).toFixed(2);
