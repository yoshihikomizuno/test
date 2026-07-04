---
name: preview-deploy
description: 制作中の静的サイト(HTML/CSS/JS)を「一般非公開のまま」Cloudflareでプレビューするための運用スキル。ユーザーが「プレビューを見たい/更新して/デプロイして/確認用URLを最新にして」「新しい制作案件をプレビューに追加したい」「このフォルダだけ公開/非公開にしたい」と言ったときに使う。案件ごとのCloudflare設定は不要で、リポジトリ直下にフォルダを置いて main にpushするだけで自動デプロイされる。ユーザーはCloudflareを触らず・git pullもせず、非公開URLを開くだけでよい状態を保つのが目的。
---

# preview-deploy — 非公開プレビュー運用スキル

制作物を「一般には非公開のまま」ブラウザで確認できる状態を、**案件をまたいで追加設定ゼロ**で維持する。

## 確定した構成（このリポジトリの実環境）

| 項目 | 値 |
|---|---|
| ホスティング | **Cloudflare Workers（静的アセット配信）**、GitHub連携・本番ブランチ = `main` |
| アカウントのサブドメイン | **`mazareal`**（＝ `mazareal.workers.dev`） |
| Worker 名 | **`test`** |
| ベースURL | **`https://test.mazareal.workers.dev/`** |
| 各案件のURL | `https://test.mazareal.workers.dev/<フォルダ名>/` |
| 非公開化 | **Cloudflare Access**。ドメイン全体が「制限（サインイン必須）」＝**既定で全案件が非公開** |
| 設定ファイル | ルートの `wrangler.jsonc`（assets: `./`）、`.assetsignore`（`.git` 等を除外） |

デプロイの流れ：
```
案件フォルダを編集 → main に push → Cloudflareが自動ビルド(1〜2分) → 同じURLが最新化
                                                     ↓
                              ユーザーは Access にサインイン済みのブラウザで「URLを開くだけ」
```

## このリポジトリの約束

1. **1案件 = リポジトリ直下の1フォルダ**（例 `mazareal-kids-game/`）。必ず `index.html` を置く。
2. ルートの `index.html` は**プレビュー一覧ダッシュボード**。案件を足したらカードを1枚追記する。
3. デプロイのトリガーは **main への push だけ**。Cloudflare画面の操作は不要。
4. 秘密情報（APIキー等）は置かない。Accessは閲覧制限であって暗号化ではない。

## 使い方

### A. 既存案件を更新してプレビューに反映

1. 対象フォルダを編集（可能なら Chromium でレンダリング確認）。
2. `main` に push する（このセッションの designated ブランチが main でない場合は、変更を main に反映する＝PRをマージ、または main に直接コミット）。
3. **1〜2分で `https://test.mazareal.workers.dev/<フォルダ>/` が最新化**。ユーザーには「同じURLを開き直すだけ」と伝える。URLは不変。

> 補足：制作中ブランチを push すると、Cloudflareは `<version>-test.mazareal.workers.dev` という**バージョン別の一時URL**も作る。恒久リンクは main→本番URL。

### B. 新しい制作案件を追加

1. スキャフォルド：`bash scripts/new-preview-project.sh <フォルダ名> "表示名"`
2. ルート `index.html` にカードを1枚追記（`data-project` の `<article>` を複製して中身を差し替え）。
3. `main` に push。**Cloudflareの追加設定は不要**。数分後 `https://test.mazareal.workers.dev/<フォルダ名>/` で見られる。
4. 新フォルダは**既定で非公開**（ドメイン全体がAccess制限のため）。公開したい場合は下記「公開/非公開の管理」を参照。

## 公開/非公開の管理（フォルダ単位で混在可）

ドメイン全体は既定で「制限（非公開）」。**パス単位のAccessアプリ**で例外を作る。
Cloudflareは**より細かいパス指定のアプリを優先**する。

- **特定フォルダだけ公開**：Zero Trust → Access → Applications → Add application → Self-hosted →
  domain `test.mazareal.workers.dev` / path `<フォルダ名>` → Policy **Action: Bypass / Include: Everyone**。
- **特定フォルダだけ非公開（他は公開の場合）**：同様に対象パスへ **Action: Allow / Include: Emails**（許可メール）。
- **閲覧できる人を増やす**：既定アプリのポリシーの Emails に追加、または **Emails ending in `@mazareal.co.jp`** で社内一括許可。

> ⚠️ これらのCloudflare側操作（Access・サブドメイン等）は **この実行環境からはAPIが遮断**されていて実行できない（api.cloudflare.com が 403）。
> 手順を提示して**ユーザーにダッシュボードで操作してもらう**か、ユーザーのPCで叩く**cURLコマンドを渡す**こと。

## 初回セットアップ（済み）

完了済み。記録と再現手順は `docs/cloudflare-preview-setup.md` を参照
（GitHub連携／`mazareal` サブドメイン登録／`wrangler.jsonc`・`.assetsignore`／本番URL有効化／Accessで `3aidmz@gmail.com` を許可）。

## 注意

- ルート直下の `.claude/` `docs/` `scripts/` も静的配信され得るが、Accessで保護されるため問題なし。
- 大きな生成物・node_modules はコミットしない。
