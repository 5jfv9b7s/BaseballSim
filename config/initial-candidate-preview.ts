/** 候補の単球検証だけに使う仮条件。選手の査定値・正式試合の初期方針ではない。 */
export const initialCandidatePreviewConfig = {
  version: 'initial-candidate-pitch-preview-v1',
  swingAggressionMilli: 50000,
  // 既存の共通投球テンプレートと同じ仮リリース。候補の個人deliveryが優先する。
  templateRelease: { lateralMm: -450, heightMm: 1800, extensionMm: 1700 },
  // 単球を指定する検証用の中立値。個人配球割合の接続・校正は別工程。
  selection: { baseWeight: 1, twoStrike: 1, threeBall: 1, oppositeSide: 1 },
} as const;
