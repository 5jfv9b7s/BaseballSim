import type { Count, PitchStep, PrototypeState } from './types.ts';
import { createInitialState, FIXTURE } from '../data/fixture.ts';
import { simulatePitch } from './pitch.ts';
import { ensure, id, integer, validateCount } from './validation.ts';

export type Command = {
  commandId: string; localWorldId: 'pitch-lab-local'; expectedStateRevision: number;
} & ({ kind: 'reset'; payload: { seed: number; count: Count } } | { kind: 'advance'; payload: null });
export interface View { revision: number; state: PrototypeState; steps: PitchStep[] }
/** Workerが唯一保持する正本。返却するViewはコピー。再送は二重適用しない。 */
export class PitchSession {
  private view: View = { revision: 0, state: createInitialState(), steps: [] };
  private processed = new Map<string, { fingerprint: string; result: View }>();

  query(): View { return structuredClone(this.view); }

  dispatch(command: Command): View {
    id(command.commandId);
    ensure(command.localWorldId === 'pitch-lab-local', '別のローカル世界への指示です');
    integer(command.expectedStateRevision, 0, Number.MAX_SAFE_INTEGER - 1, '状態版');
    ensure(command.kind === 'reset' || command.kind === 'advance', '未知の指示です');
    if (command.kind === 'reset') { integer(command.payload.seed, 1, 0xffffffff, 'seed'); validateCount(command.payload.count); }
    else ensure(command.payload === null, 'advanceのpayloadはnullです');
    const fingerprint = JSON.stringify([command.localWorldId, command.expectedStateRevision, command.kind,
      command.kind === 'reset' ? [command.payload.seed, command.payload.count.balls, command.payload.count.strikes] : null]);
    const previous = this.processed.get(command.commandId);
    if (previous) { ensure(previous.fingerprint === fingerprint, '同じ指示IDに異なる内容が届きました'); return structuredClone(previous.result); }
    ensure(command.expectedStateRevision === this.view.revision, '古い状態への指示です');
    ensure(this.processed.size < 1000, '試作の指示上限1000件です。ページを再読み込みしてください');
    let next: View;
    if (command.kind === 'reset') next = { revision: this.view.revision + 1, state: createInitialState(command.payload.seed, command.payload.count), steps: [] };
    else {
      ensure(this.view.steps.length < 100, '試作の投球上限100球です。新しい試行を開始してください');
      const step = simulatePitch(this.view.state, FIXTURE, command.commandId);
      next = { revision: this.view.revision + 1, state: step.state, steps: [...this.view.steps, step] };
    }
    this.processed.set(command.commandId, { fingerprint, result: structuredClone(next) });
    this.view = next;
    return this.query();
  }
}
