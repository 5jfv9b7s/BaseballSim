import { APP_VERSION, RELEASE_NOTES } from './release-notes.ts';
import './app-info.css';

/** 表示だけの案内。開閉でWorkerの指示や保存処理を発生させない。 */
export function AppInfo() {
  return (
    <aside className="app-info" aria-label="バージョンと利用案内">
      <details>
        <summary>開発版 {APP_VERSION}・利用案内</summary>
        <div className="app-info-content">
          <h2>この開発版について</h2>
          <p>
            架空の球団・選手で遊ぶ野球シミュレーションです。v1.0に向けて開発中で、計算の係数は調整前です。
          </p>
          <h3>保存して続きを遊ぶ</h3>
          <p>
            「日程・球団運営」は、1日分の結果を確定すると翌日の状態を自動保存します。途中で終える場合は、一時停止して「世界を手動保存」を押し、保存完了の表示を確認してください。
          </p>
          <p>
            次に開いたときは「世界の保存」で自動保存または手動保存を読み込みます。読み込み後は停止しているので、続けるときに進行ボタンを押してください。
          </p>
          <p>
            保存先は、この端末のこのブラウザです。ブラウザのサイトデータを削除すると保存も消えます。端末やブラウザ、アクセスするURLを変える前に、「世界の保存」のファイル書き出しを使ってください。
          </p>
          <p>
            ファイルに入るのは選んだ枠の保存済みデータです。今の作業も含める場合は先に手動保存します。取り込み後は「保存済みプレイ」から開くプレイを選べます。
          </p>
          <h3>最近の更新</h3>
          <ul className="release-notes">
            {RELEASE_NOTES.map((release) => (
              <li key={release.version}>
                <h4>{release.version}</h4>
                {release.changes.map((change) => (
                  <p key={change}>{change}</p>
                ))}
                <p className="hint">保存への影響：{release.saveImpact}</p>
              </li>
            ))}
          </ul>
          <h3>不具合を伝えるとき</h3>
          <p>
            開発版 {APP_VERSION}
            、使っているブラウザ、行った操作、画面に表示されたエラーを控えてください。問い合わせ窓口は公開準備中です。
          </p>
        </div>
      </details>
    </aside>
  );
}
