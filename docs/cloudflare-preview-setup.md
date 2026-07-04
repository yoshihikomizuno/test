# 非公開プレビュー — 構成と運用ガイド（Cloudflare Workers）

このリポジトリの制作物を「一般には非公開のまま」ブラウザで確認するための環境です。
**初回セットアップは完了済み**。日々の運用は「フォルダを足して `main` に push → URLを開くだけ」です。

---

## 1. 確定した構成

| 項目 | 値 |
|---|---|
| ホスティング | Cloudflare Workers（静的アセット配信）、GitHub連携・本番ブランチ = `main` |
| サブドメイン（アカウント共通） | `mazareal`（= `mazareal.workers.dev`） |
| Worker 名 | `test` |
| ベースURL（一覧） | **https://test.mazareal.workers.dev/** |
| 各案件のURL | `https://test.mazareal.workers.dev/<フォルダ名>/` |
| 例：うちの子クエスト | https://test.mazareal.workers.dev/mazareal-kids-game/ |
| 非公開化 | Cloudflare Access（ドメイン全体が「制限」＝サインイン必須） |
| 閲覧許可 | `3aidmz@gmail.com`（Zero Trust → Access で管理） |

- 各案件は**リポジトリ直下のフォルダ**。ルートの `index.html` が一覧ダッシュボード。
- ルートの `wrangler.jsonc`（assets: `./`）と `.assetsignore`（`.git` 等を除外）で配信を制御。

---

## 2. 日々の使い方

### 制作物を更新したいとき
`main` に変更が入ると、Cloudflareが自動でビルド＆デプロイ（1〜2分）。
→ **同じURLを開き直すだけ**で最新になります（`git pull` もCloudflare操作も不要）。

### 新しい案件を追加するとき
1. `bash scripts/new-preview-project.sh <フォルダ名> "表示名"` で雛形作成
2. ルート `index.html` にカードを1枚追記
3. `main` に push → 数分後 `https://test.mazareal.workers.dev/<フォルダ名>/` で確認可
   （新フォルダは**既定で非公開**）

---

## 3. 公開/非公開の管理

ドメイン全体は既定で「制限（非公開）」＝**新しいフォルダも自動的に非公開**。
フォルダ単位で公開/非公開を混在させたいときは、**パス単位のAccessアプリ**を追加します
（Cloudflareは細かいパス指定のルールを優先します）。

### 特定フォルダだけ「公開」にする
1. **Zero Trust → Access → Applications → Add an application → Self-hosted**
2. Application domain: `test.mazareal.workers.dev` / Path: `<フォルダ名>`
3. Policy: **Action = Bypass**、**Include = Everyone**
4. 保存 → そのフォルダだけ全員閲覧可、他は非公開のまま

### 閲覧できる人を増やす
- 既定アプリのポリシーの **Emails** にアドレスを追加、または
- **Emails ending in `@mazareal.co.jp`** で社内ドメインを一括許可

---

## 4. 初回セットアップの記録（済み・再現用メモ）

1. **GitHub連携**：Workers & Pages →「アプリケーションを作成する」→ Import a repository → `yoshihikomizuno/test`
   （デプロイコマンド `npx wrangler deploy` / 本番ブランチ `main`）
2. **配信設定**：ルートに `wrangler.jsonc`（`{ "name": "test", "assets": { "directory": "./" } }`）と `.assetsignore` を追加
3. **workers.dev サブドメイン登録**：新UIに登録画面が出なかったため、API で登録（※ユーザーのPCで実行）
   ```bash
   curl -X PUT "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/workers/subdomain" \
     -H "Authorization: Bearer <API_TOKEN>" -H "Content-Type: application/json" \
     --data '{"subdomain":"mazareal"}'
   ```
   （トークンは「Edit Cloudflare Workers」テンプレートで作成。使用後は失効させる）
4. **本番URL有効化**：Worker `test` → ドメイン → 「プロダクション」トグルON
5. **非公開化**：同画面のアクセスを「制限」に → Zero Trust → Access で `3aidmz@gmail.com` を許可

> ⚠️ Cloudflare API はこの制作環境（Claude Code）からは遮断されている（api.cloudflare.com が 403）。
> Cloudflare側の操作は、ダッシュボードで行うか、ユーザーのPCで cURL を実行する。

---

## 5. トラブル時メモ

- **ビルド失敗「register a workers.dev subdomain」**：サブドメイン未登録。上記4-3のAPIで登録。
- **URLが 404/空**：本番ブランチ `main` に中身が入っているか、`wrangler.jsonc` が `main` にあるか確認。
- **`.git` 等が配信される**：`.assetsignore` に除外パターンを追記。
