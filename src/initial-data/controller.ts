import { createSeibuCandidateDataset } from '../data/initial-2026/seibu/index.ts';
import { previewCandidatePitch, type CandidatePreviewRequest } from './preview.ts';

export type InitialDataRequest =
  { kind: 'query' } | ({ kind: 'preview' } & CandidatePreviewRequest);

/** 開発用の単球検証。world-worker/IndexedDB/正式名簿を更新しない。 */
export class InitialDataController {
  private readonly dataset = createSeibuCandidateDataset();
  handle(request: InitialDataRequest) {
    try {
      if (request.kind === 'query')
        return { ok: true as const, dataset: structuredClone(this.dataset), preview: null };
      if (request.kind === 'preview')
        return {
          ok: true as const,
          dataset: null,
          preview: previewCandidatePitch(this.dataset, request),
        };
      throw new Error('未対応の初期候補指示です');
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : '初期候補の処理に失敗しました',
      };
    }
  }
}
export type InitialDataResponse = ReturnType<InitialDataController['handle']>;
