# プロジェクト知識庫

quiz_appの `AGENTS.md` と `knowledge/README.md` を2026-09-23に確認し、同じ管理方式を採用しました。元のquiz_appは変更していません。

| ファイル | 用途 |
|---|---|
| [current-state.md](current-state.md) | 作業開始時に読む確認済みの現状・根拠・次作業 |
| [decisions.md](decisions.md) | 承認済み・試作採用・提案中などの判断と根拠 |
| [lessons.md](lessons.md) | 根拠のある知見候補。独立2件または明示承認で検証済みへ昇格 |
| [worklog.md](worklog.md) | 実質的な変更・実施した検証・未対応の簡潔な履歴 |
| [prototype-model.md](prototype-model.md) | 今回有効な未校正モデルの式・係数・範囲・版 |

最初にcurrent-stateを読み、`rg -n -i "キーワード|関連語" knowledge Docs src tests` で検索して、引用された原資料の関連節を確認します。毎ターン新規メモを増やさず、関係する既存項目を更新します。

`確認済み`は直接観測した事実、`承認済み`はユーザーの合意、`試作採用`は今回の許可範囲内で行った可逆的な実装判断です。`提案中`・`候補`を承認済みと混同しません。却下・差し替え時は履歴と後継参照を残します。秘密情報や未加工のログを収録しません。
