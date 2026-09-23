# 野球シミュレーション：1球の試作

ゲームv0.1「架空2チームの1試合自動進行・結果・保存」へ向けた最初の実装です。現時点では、配球→実投球→打者判断→接触までを確認できます。1試合完走・公式成績・保存はまだ実装していません。

## 起動と確認

Windows / PowerShell、Node.js **24.15.0**、npm **11.12.1**で確認しています。初回または別の環境では、このフォルダで依存を復元します。

```powershell
npm.cmd ci
npm.cmd run dev
```

表示されたURL（通常 `http://127.0.0.1:5173/`）をブラウザで開き、「1球進める」を押します。seed・開始カウントを変えた場合は「設定を適用してやり直す」を押してから投球してください。Ctrl+Cで開発サーバーを停止できます。

- 初期seed `20260923`、0ボール0ストライク：ストレート **146.59 km/h、空振り**。狙い `(-144, 600)`、実位置 `(-187, 675)` mm、処理後は0ボール1ストライク。
- 同じ設定でやり直せば、同じ投球を再現します。履歴、捕手視点の位置図、検証用JSONを確認できます。
- 四球・三振相当またはフェア接触では、未解決の後続処理を明示して停止します。得点・出塁・アウトを確定した意味ではありません。
- 「検証データを見る」の開閉は乱数を進めません。ページ再読み込みで試行は消えます。

画面を使わず1球の全結果を出す場合：

```powershell
npm.cmd run pitch -- 20260923
```

## 検証コマンド

```powershell
npm.cmd run check
npm.cmd run test:ui
```

`check` は型検査・Node標準テスト・ビルドを実行します。`test:ui` は**ビルド済みのdist**を一時的に4173番ポートで配信し、インストール済みMicrosoft Edgeをヘッドレスで起動します。事前に`check`または`build`を実行してください。ブラウザテストにはEdgeが必要です。ポートが使用中ならそのプロセスを確認してください。

| コマンド                | 用途                                             |
| ----------------------- | ------------------------------------------------ |
| `npm.cmd run typecheck` | TypeScript検査のみ                               |
| `npm.cmd test`          | エンジン試験10件（2,000乱数条件の検証を含む）    |
| `npm.cmd run build`     | 型検査後、静的配信用distを生成                   |
| `npm.cmd run preview`   | distをローカル確認                               |
| `npm.cmd run test:ui`   | 1280px / 390px幅で画面・Worker・再現・停止を確認 |

## 構成と設計

GitHubの接続先は [5jfv9b7s/BaseballSim](https://github.com/5jfv9b7s/BaseballSim) です。mainとdevelopを使用します。現在の.gitignoreではAGENTS.mdとDocs/はローカル保管で、GitHubへの同期対象に含めていません。別PCでは原資料を別途引き継いでください。

| 場所                  | 責任                                                      |
| --------------------- | --------------------------------------------------------- |
| `src/engine/`         | 型、境界検査、乱数、17区画、純粋な1球計算、指示の一括処理 |
| `src/data/fixture.ts` | 架空2球団・投手1人・捕手1人・打者1人の固定データ          |
| `src/worker.ts`       | 正本の状態を保持し、指示をエンジンへ渡す                  |
| `src/ui/`             | Reactの表示用コピーと入力。試合用乱数は消費しない         |
| `tests/`, `e2e/`      | 計算と実ブラウザの検証                                    |
| `knowledge/`          | quiz_appと同方式の現状・判断・知見・履歴                  |
| `Docs/`               | 最初からあった引き継ぎ一式。原文を保持                    |

TypeScriptの`Player`はSQLの「選手の行」に近く、`playerId`・`pitchId`で参照します。ただし今回は1球に必要な項目だけの**試作用の射影**で、正式な全選手・全世界セーブ形式ではありません。プロフィールや能力の未実装項目を0で埋めていません。

Reactは「1球進める」という指示をWorkerへ送り、Workerが状態・乱数・記録をまとめて更新します。重複指示は再適用せず、古い状態への指示は拒否します。計算処理はReact・DBから独立しているので、次は同じ処理を打席・イニング・試合へつなげます。

IndexedDB＋Dexieは資料どおり保存段階で導入します。今回、保存API・DB・StorageAdapterの空実装は追加していません。保存実装時には4物理ストア、版管理、正常保存の保護を維持します。通常プレイ用のNode/PostgreSQLサーバーは不要です。

## 仮定と採用版

計算式・係数・値域・乱数消費順・未対応分岐は[試作モデル](knowledge/prototype-model.md)、仕様の承認状態は[判断記録](knowledge/decisions.md)、検証と次作業は[現状](knowledge/current-state.md)を参照してください。

採用版はpackage.jsonとpackage-lock.jsonで固定しています：React / React DOM 19.3.0、Vite 8.3.0、Reactプラグイン6.1.1、TypeScript 7.0.2、Playwright 1.63.0。Node標準テストを使い、型定義もNode 24系に合わせています。

2026-09-23に互換性を公式資料と実際の導入・ビルドで確認しました。ViteのNode要件は20.19以上または22.12以上で、今回の24.15.0は範囲内です。[Vite公式](https://vite.dev/guide/)、[ReactのVite構成案](https://react.dev/learn/build-a-react-app-from-scratch)、[NodeのTypeScript実行](https://nodejs.org/api/typescript.html)、[Playwright公式](https://playwright.dev/docs/intro)。これは全ブラウザ・Androidでの動作保証ではありません。

## コードの整形

コード・設定・開発メモは2スペースでインデントし、1行100文字を目安に改行します。複数の処理を1行に詰めず、読みやすい書式を保ちます。

```powershell
npm.cmd run format
npm.cmd run format:check
```

formatは書式を揃え、format:checkは変更せず確認します。元資料Docs/、ローカルのAGENTS.md、生成物、package-lock.jsonは整形しません。設定は.prettierrc.json・.prettierignore・.editorconfigで管理します。ツールは[Prettier公式の導入手順](https://prettier.io/docs/install)を確認し、3.9.8で固定しました。
