import type { StorageInspection } from '../world/storage-inspection.ts';

const bytes = (value: number) => value.toLocaleString('ja-JP') + ' bytes';

export function StorageInspectionPanel({
  report,
  disabled,
  inspect,
}: {
  report: StorageInspection | null;
  disabled: boolean;
  inspect: () => void;
}) {
  return (
    <details>
      <summary>保存容量と履歴を確認</summary>
      <p className="hint">日程・球団運営の保存領域を調べます。データの削除は行いません。</p>
      <button className="secondary" disabled={disabled} onClick={inspect}>
        保存容量を診断
      </button>
      {report && (
        <div data-testid="storage-inspection">
          <p>
            保存履歴：{report.snapshots}件（保護対象：{report.protectedSnapshots}件）
          </p>
          <p>保存内容の容量：{bytes(report.payloadBytes)}</p>
          <p>共有データ：{report.blocks}件</p>
          {report.issues.length ? (
            <p role="alert">
              参照の不整合があるため整理候補を確定できません。{report.issues.join(' ')}
            </p>
          ) : (
            <>
              <p>未参照の履歴：{report.candidateSnapshotIds.length}件</p>
              <p>
                未参照の共有データ：{report.candidateBlockIds.length}件（
                {bytes(report.candidatePayloadBytes)}）
              </p>
            </>
          )}
          <p className="hint">
            診断時点の値です。容量は格納内容の合計で、ブラウザ全体の使用量・空き容量ではありません。共有データは一度だけ数えます。未参照の履歴は保存の確定時に自動整理します。参照に不整合がある場合は整理を見送ります。
          </p>
        </div>
      )}
    </details>
  );
}
