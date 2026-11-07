import { Component, type ReactNode } from 'react';
import './loading.css';

/** 遅延読込に失敗しても、真っ白な画面のままにしない。自動で再実行しない。 */
export class ScreenErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="loading-screen" data-full-page="true">
        <div className="loading-content" role="alert">
          <p className="loading-title">画面を表示できませんでした</p>
          <p className="loading-detail">
            接続と開発サーバーの状態を確認してください。再読み込みすると未保存の操作は失われます。
          </p>
          <button className="loading-reload" onClick={() => location.reload()}>
            画面を再読み込み
          </button>
        </div>
      </div>
    );
  }
}
