import { useState } from 'react';
import {
  COMMON_ABILITIES,
  EXISTING_ABILITY_CODES,
  FIELD_POSITIONS,
  type CommonAbilityCode,
} from '../players/abilities.ts';
import {
  existingPlayerAbilities,
  playerBaseAbilities,
  playerDevelopment,
} from '../world/player-development.ts';
import type { WorldDefinitions } from '../world/types.ts';
import { AbilityRating } from './visuals/AbilityRating.tsx';

const GROUPS = {
  all: '全22項目',
  batting: '打撃',
  running: '走塁',
  fielding: '守備',
  catching: '捕手',
  physical: '身体',
  pitching: '投手',
};

export function PlayerAbilities({
  definitions,
  playerId,
}: {
  definitions: WorldDefinitions;
  playerId: string;
}) {
  const [group, setGroup] = useState('all');
  const full = playerBaseAbilities(definitions, playerId);
  const legacy = existingPlayerAbilities(definitions, playerId);
  const development = playerDevelopment(definitions, playerId);
  const codes: CommonAbilityCode[] = full
    ? (Object.keys(COMMON_ABILITIES) as CommonAbilityCode[])
    : [...EXISTING_ABILITY_CODES];
  const availableGroups = Object.entries(GROUPS).filter(
    ([key]) => key === 'all' || codes.some((code) => code.startsWith(key + '.')),
  );
  const activeGroup = availableGroups.some(([key]) => key === group) ? group : 'all';
  const displayed = codes.filter(
    (code) => activeGroup === 'all' || code.startsWith(activeGroup + '.'),
  );
  const values = full ?? legacy;
  const inUse = (code: CommonAbilityCode) =>
    (EXISTING_ABILITY_CODES as readonly string[]).includes(code);
  return (
    <div className="player-ability-catalog">
      <p>現在の基本能力です。調子・体力による試合時の一時補正とは区別します。</p>
      {full ? (
        <p className="hint">
          追加値は架空の動作確認用です。「未接続」の能力と適性・習熟は表示・保存のみで、試合へはまだ作用しません。
        </p>
      ) : (
        <p className="hint">
          旧保存：追加11能力・適性の記録はありません。保存内にある項目だけを表示します。
        </p>
      )}
      <label>
        能力の分野
        <select value={activeGroup} onChange={(event) => setGroup(event.target.value)}>
          {availableGroups.map(([key, label]) => (
            <option key={key} value={key}>
              {key === 'all' && !full ? '保存済みの項目' : label}
            </option>
          ))}
        </select>
      </label>
      <div className="world-table" role="region" aria-label="基本能力表の横スクロール" tabIndex={0}>
        <table aria-label="選手の基本能力">
          <thead>
            <tr>
              <th>項目</th>
              <th>現在値・評価</th>
              <th>成長上限</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((code) => {
              const value = values?.[code as keyof typeof values];
              return (
                <tr key={code} data-ability-code={code}>
                  <th scope="row">
                    {COMMON_ABILITIES[code]}
                    {!inUse(code) && <small className="ability-support">未接続</small>}
                  </th>
                  <td>
                    {value ? (
                      <AbilityRating valueMilli={value.valueMilli} label={COMMON_ABILITIES[code]} />
                    ) : (
                      '記録なし'
                    )}
                  </td>
                  <td
                    title={value ? `内部値 ${(value.ceilingMilli / 1000).toFixed(3)}` : undefined}
                  >
                    {value ? Math.floor(value.ceilingMilli / 1000) : '記録なし'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        評価はG〜SS、表示値は小数切り捨てです。内部値は数値にカーソルを合わせると確認できます。
      </p>
      {development && (
        <details className="player-position-skills">
          <summary>守備適性・習熟（9位置）</summary>
          <p className="hint">
            適性は向きやすさ、習熟は現在の技能です。固定の適性と成長上限を混同せず、DHは守備位置に加えません。計算への接続は準備中です。
          </p>
          <div
            className="world-table"
            role="region"
            aria-label="守備適性表の横スクロール"
            tabIndex={0}
          >
            <table aria-label="選手の守備適性・習熟">
              <thead>
                <tr>
                  <th>位置</th>
                  <th>適性</th>
                  <th>習熟</th>
                  <th>習熟上限</th>
                </tr>
              </thead>
              <tbody>
                {FIELD_POSITIONS.map((position) => {
                  const skill = development.positionSkills[position];
                  return (
                    <tr key={position}>
                      <th scope="row">{position}</th>
                      <td>
                        <AbilityRating
                          valueMilli={skill.aptitudeMilli}
                          label={`${position}の適性`}
                        />
                      </td>
                      <td>
                        <AbilityRating
                          valueMilli={skill.familiarity.valueMilli}
                          label={`${position}の習熟`}
                        />
                      </td>
                      <td>{Math.floor(skill.familiarity.ceilingMilli / 1000)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <h3>投手の適性</h3>
          <div className="player-growth-traits" aria-label="先発・救援の適性">
            <div>
              <span>先発</span>
              <AbilityRating
                valueMilli={development.pitchingAptitudes.starterMilli}
                label="先発適性"
              />
            </div>
            <div>
              <span>救援</span>
              <AbilityRating
                valueMilli={development.pitchingAptitudes.relieverMilli}
                label="救援適性"
              />
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
