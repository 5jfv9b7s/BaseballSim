# Cloudflareテスト公開手順

2026-10-20 / キット v1.0 / Windows PowerShell用

対象は最新のローカル開発版です。リポジトリのAGENTS.mdを読み、現状のブランチ・未コミット変更を確認してください。これまでの開発ブランチは `develop`。公開のために既存変更を破棄したり、古い共有版へ差し替えたりしません。

## このリポジトリでの実行コマンド

キットの導入は済んでいるため、`install.mjs`の再実行は不要です。ゲーム版は **0.34.0** のままです。Wrangler **4.151.3**を開発依存とロックファイルへ追加しています。ゲームの計算・セーブ形式・選手データの変更は含みません。

| コマンド                         | 処理                                                               |
| -------------------------------- | ------------------------------------------------------------------ |
| `npm.cmd run test:cloudflare`    | 配信物生成・改変検出・リンク拒否・再生成の7試験                    |
| `npm.cmd run cloudflare:prepare` | 最新の通常ビルド → テスト配信物の生成 → 照合                       |
| `npm.cmd run cloudflare:check`   | 配信目録・通常dist・テスト専用設定の照合                           |
| `npm.cmd run cloudflare:dry-run` | 照合 → 指定設定で公開なしのWrangler検査                            |
| `npm.cmd run cloudflare:dev`     | 照合 → `http://127.0.0.1:8787`のローカル配信                       |
| `npm.cmd run test:cloudflare:ui` | Wranglerを起動してHTTPとEdgeの1280/390pxを確認し、試験終了時に停止 |

通常は`cloudflare:prepare`、`cloudflare:dry-run`、`test:cloudflare:ui`の順で確認します。実公開は後述の手動工程です。生成し直すときは、先にローカル配信を終了してください。

## 1. 依存関係とキットの検証

Nodeはプロジェクトのengines（24.15.0以上・25未満）に合わせます。Wranglerは導入済みで、別環境の初回セットアップではロックファイルから依存を復元します。

```powershell
node --version
npm.cmd ci
npm.cmd run test:cloudflare
```

Wrangler追加とロックファイルはソース管理の対象です。既存のビルド依存`source-map-js`は、許容範囲内の1.2.1から[修正版1.2.2](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2)へ限定更新し、導入後のnpm監査は0件でした。ゲームの直接依存とWranglerの固定版は維持しています。

`dist-cloudflare-test/`、`.wrangler/`、互換用の`.cloudflare-test-stage-*/`はGitとPrettierの対象外です。Wrangler用の`.dev.vars`・`.dev.vars.*`もGit除外し、配信物への混入を拒否します。設定・スクリプト・この手順書を管理し、生成物とログイン情報を入れません。

## 2. ビルドと公開前確認

```powershell
npm.cmd run build
node cloudflare-test/prepare.mjs
node cloudflare-test/check.mjs
npx.cmd wrangler deploy --dry-run --config wrangler.test.jsonc
```

各コマンドが成功したことを確認してから次へ進みます。`build` が失敗した場合は、以前のdistを使って続行しません。

- 通常の `dist` は変更せず、`dist-cloudflare-test` を生成します。OSの専用一時フォルダで組み立て、配信先へファイル単位でコピーし、全ファイルをハッシュ照合します。古いアセットは取り除き、目録は最後に書きます。生成中のフォルダを配信・公開しないでください。
- index.htmlのタブ名に `[テスト版]` を付け、noindexを指定します。画面内のゲームUIは変更しません。
- `X-Robots-Tag: noindex, nofollow` と `Cache-Control: no-cache` などを付けます。
- JS・CSS・画像・ゲーム用Web Workerは同じ内容をコピーします。
- 生成目録に版とSHA-256を記録します。絶対パスや作成時刻は載せません。
- `check` は元のdistと公開対象を照合します。環境設定ファイル、セーブ、DBファイル、ソース管理フォルダなどの混入も止めます。ビルドに埋め込まれた値の秘密性まで判定するものではありません。

この `wrangler.test.jsonc` はコメントなしのJSONとして書いてあります。`.prettierrc.json`の専用設定で末尾カンマを付けないようにしています。`check` がJSONとして読むため、編集時もその形式を保ってください。名前を変えるときは必ず `-test` で終わるテスト専用名にします。

既存の `_headers` がdistに入る構成では、prepareは停止します。既存設定との統合を確認してから利用してください。

## 3. ローカルで配信確認

```powershell
npx.cmd wrangler dev --config wrangler.test.jsonc --ip 127.0.0.1 --port 8787 --local
```

表示されたローカルURLを開きます。終了はCtrl+Cです。

- 初期画面、新規ゲーム作成、ホーム、日程、編成を開く。
- 日付を進め、Web Workerを使う処理が完了することを確認する。
- 手動セーブ・再読み込み・再開を確認する。新規プレイの再開では「保存済みプレイ」と「手動」の保存枠を選び、「選んだプレイを開く」を使う。
- `.bssave` の書き出しと読み込みを確認する。
- タブ名がテスト版で、コンソールに起動時エラーがないことを確認する。

このローカルURLも、いつもの開発URLや後述のCloudflare URLとは別のセーブ領域です。

## 4. Cloudflareへ初回公開するとき

ここから先は実際に公開する工程です。CloudflareアカウントとWorkers Freeプランを用意し、公開する版を確認して実行します。アプリのコードへトークンを埋め込みません。

```powershell
npx.cmd wrangler login
npx.cmd wrangler whoami
node cloudflare-test/check.mjs
npx.cmd wrangler deploy --config wrangler.test.jsonc
```

ブラウザでログインし、whoamiで目的のアカウントを確認します。複数のアカウントがある場合は、対象を確定してからdeployしてください。必要なら設定に `account_id` を追加できます。

初回にworkers.devのサブドメイン設定を求められたら、Cloudflareの案内に沿って設定します。公開後に表示された実URLを記録してください。以下は例です。

`https://baseball-sim-test.<account-subdomain>.workers.dev`

`preview_urls` は無効です。毎回のテストは同じWorker名・同じworkers.dev URLで行います。本番用のWorkerや独自ドメインはこの設定へ追加せず、一般公開前に別途決めます。

## 5. 公開URLでの受け入れ確認

| 確認項目         | 合格条件                                         |
| ---------------- | ------------------------------------------------ |
| PCブラウザで起動 | 初期画面から新規ゲームを開始できる               |
| 日程と進行       | 日付を進め、試合結果が表示される                 |
| 編成             | 選手変更が保存・再開後も保たれる                 |
| 手動保存と再開   | 同じURL・同じブラウザで再開できる                |
| バックアップ     | 書き出した.bssaveを読み込んで再開できる          |
| 更新             | 同じURLを再読み込みすると新しい版を取得できる    |
| 更新前セーブ     | バックアップした既存セーブを新しい版で読み込める |
| Android          | 対象端末で画面と操作を確認できる                 |
| 配信             | JS・CSS・ゲームWorkerが正しいMIMEで取得できる    |
| 検索表示抑制     | HTMLメタとレスポンスヘッダーにnoindexがある      |

このキットはService Worker、PWA、自動リロード、ゲーム内の保存形式変換を追加しません。実行中の古いタブは再読み込みまで古い版で動くことがあります。検証中のデータは、更新前にバックアップを書き出してください。

## 6. 更新

まず同じ手順で最新ゲームをビルドし直し、prepare・check・dry-runを通します。その後、同じ設定ファイルでdeployします。初回は手動公開とし、Git連携の自動公開はテストが安定してから検討します。

削除を伴うロールバックやセーブ形式変更は、この公開設定とは別に判断します。Cloudflare上の配信版を戻しても、利用者の端末のセーブは巻き戻りません。

実際の確認記録には、ゲーム版、配信目録のbuildHash、公開URL、確認日、ブラウザ・端末、合否を残してください。

## 7. この開発版での確認記録（2026-10-20）

| 項目              | 確認結果                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| ゲーム / Wrangler | 0.34.0 / 4.151.3                                                                                     |
| Node / OS         | 24.15.0 / Windows 11（build 22631）                                                                  |
| ブラウザ          | Edge Headless 155.0.4283.62 / Playwright 1.63.0                                                      |
| インストーラー    | 提供キットの2件成功。既存ファイルとの競合停止と再実行を検査                                          |
| 配信準備          | 現行スクリプト7件成功、失敗・中止・スキップ0                                                         |
| ビルド / dry-run  | 成功。実際のログイン・デプロイなし                                                                   |
| HTTP / ブラウザ   | 専用3件成功。全配信アセットのMIME/ハッシュ/ヘッダー、トップ/深いパス、目録、`_headers`非公開を確認   |
| 進行と保存        | 1280/390pxで新規プレイ、9/24→9/25、手動保存と再読込、独立したブラウザ保存領域へ`.bssave`を渡して復元 |
| コンソール / 幅   | pageerror 0、ホームの横方向はみ出しなし。画像も確認                                                  |
| 元のゲームと設定  | 導入前のsrc/config/index/Vite設定443ファイルのSHA-256と一致                                          |
| 公開URL / 実機    | 未取得。workers.dev上とAndroid実機の確認は未実施                                                     |

公開候補のbuildHash:

```text
da19404d19515a705d5f19a89962d7cf2f6a170c82e5edab604944f1a3d74539
```

配信目録は16件（HTML・14アセット・配信ヘッダー）で、目録JSON自体は別に1ファイルあります。公開するアセットは最新の通常distと同じ内容です。ヘッダー設定ファイルそのものはHTTP配信されません。ソースの最新性はハッシュだけでは保証しないので、必ず成功した最新ビルドから生成してください。

提供キットからの環境適合は、Windowsのjunctionによるリンク拒否試験、削除パスの確認、`.dev.vars`の混入拒否、目録のゲーム版/プロジェクト名照合、厳密JSON用の整形指定、ファイル単位での生成物更新と全件照合です。この環境でのディレクトリの移動・再帰削除の権限問題を避けるため、プロジェクト内に生成用ディレクトリを作って入れ替える方式は使いません。元のキットはDocs内に保管しています。

通常の`npm.cmd run check`も終了0で、型検査・Node377件（失敗/中止/スキップ0、約40.0分）・最終ビルドが成功しました。変更ファイルの整形/差分検査、入力443ファイルの維持、npm監査0件も確認しています。

今回の確認はテスト公開の準備です。実公開、アカウント選択、Cloudflare URLでの更新後再開、Android実機、最新版のブラウザでの年間完走は後続の確認です。通常の全回帰試験の結果は[V1.0-PROGRESS.md](V1.0-PROGRESS.md)とローカル作業記録へ記載します。

参考：[Static Assets](https://developers.cloudflare.com/workers/static-assets/)、[ヘッダーの仕様](https://developers.cloudflare.com/workers/static-assets/headers/)、[Wranglerのコマンド](https://developers.cloudflare.com/workers/wrangler/commands/workers/)。

初回の生成・診断で作成した一部の旧一時フォルダは、この実行環境の権限問題により削除完了を確認できていません。Git・配信対象外です。現行の生成処理では使用せず、ACLや所有者を変更する処置も行っていません。
