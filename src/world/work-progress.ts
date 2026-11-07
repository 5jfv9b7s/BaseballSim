/** 表示専用。ゲーム状態や保存形式へは追加しない。 */
export interface WorkProgress {
  stage: 'read' | 'decode' | 'validate' | 'project' | 'save';
  message: string;
  completed?: number;
  total?: number;
}
export type ReportWorkProgress = (progress: WorkProgress) => void;
export interface WorldWorkerProgress {
  kind: 'workProgress';
  operation: string;
  progress: WorkProgress;
}
