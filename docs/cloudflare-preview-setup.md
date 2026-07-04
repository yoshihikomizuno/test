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
| 公開/非公開 | **既定はすべて公開**。非公開にしたいフォルダだけ Cloudflare Access（パス単位）でサインイン必須にする |
| 非公開時の許可メール | `3aidmz@gmail.com` ／ `@mazareal.co.jp`（Zero Trust → Access で管理） |

- 各案件は**リポジトリ直下のフォルダ**。ルートの `index.html` が一覧ダッシュボード。
- ルートの `wrangler.jsonc`（assets: `./`）と `.assetsignore`（`.git` 等を除外）で配信を制御。

---

## 2. 日々の使い方

### 制作物を更新したいとき
どのブランチに push しても Cloudflare が自動でビルド＆デプロイ（1〜2分）。
- **制作中ブランチのまま確認**：`https://<ブランチ名>-test.mazareal.workers.dev/<フォルダ>/`（mainへのマージ不要）
- **確定版**：`main` にマージ → 本番URL `https://test.mazareal.workers.dev/<フォルダ>/` が更新
→ いずれも **同じURLを開き直すだけ**で最新になります（`git pull` もCloudflare操作も不要）。

> 方針：**既定はすべて公開**（本番・プレビュー・ブランチURLともサインイン不要で閲覧可）。
> 非公開にしたいフォルダだけ、§3 の手順で Access をかける。

### 新しい案件を追加するとき
1. `bash scripts/new-preview-project.sh <フォルダ名> "表示名"` で雛形作成
2. ルート `index.html` にカードを1枚追記
3. `main` に push → 数分後 `https://test.mazareal.workers.dev/<フォルダ名>/` で確認可
   （新フォルダは**既定で非公開**）

---

## 3. 公開/非公開の管理（既定＝公開。必要なものだけ非公開）

**既定はすべて公開**（本番URL・プレビュー/ブランチURLとも、サインイン不要で閲覧可）。
**新しいフォルダも自動的に公開**になります。非公開にしたいフォルダだけ、
**パス単位のAccessアプリ**でサインイン必須にします（Cloudflareは細かいパス指定を優先）。

### 特定フォルダだけ「非公開」にする
1. **Zero Trust → Access → Applications → Add an application → Self-hosted**
2. Application domain: `test.mazareal.workers.dev` / Path: `<フォルダ名>`
3. Policy: **Action = Allow**、**Include = Emails**（許可メール）
   - 社内一括なら **Emails ending in `@mazareal.co.jp`**
4. 保存 → そのフォルダだけサインイン必須、他は公開のまま

> ブランチ/コミットのプレビューURL（`<branch>-test.mazareal.workers.dev`）でも同じパスを非公開にしたい場合は、
> Application domain を **`*-test.mazareal.workers.dev`**（ワイルドカード）にした同内容のアプリも追加します。

### 逆に「基本は非公開」に戻したいとき
Worker の「ドメイン」設定で本番・プレビューを「制限」にし、公開したいパスに
**Action = Bypass / Everyone** を付ける（＝今と逆の設計）。

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
5. **アクセス方針**：当初は全体を「制限（非公開）」にして `3aidmz@gmail.com` を許可 →
   その後、運用方針を **「既定は公開・必要なものだけ非公開」** に変更（本番URLを公開に戻した）。
   非公開にしたいフォルダは §3 の手順で個別に Access をかける。

> ⚠️ Cloudflare API はこの制作環境（Claude Code）からは遮断されている（api.cloudflare.com が 403）。
> Cloudflare側の操作は、ダッシュボードで行うか、ユーザーのPCで cURL を実行する。

---

## 5. トラブル時メモ

- **ビルド失敗「register a workers.dev subdomain」**：サブドメイン未登録。上記4-3のAPIで登録。
- **URLが 404/空**：本番ブランチ `main` に中身が入っているか、`wrangler.jsonc` が `main` にあるか確認。
- **`.git` 等が配信される**：`.assetsignore` に除外パターンを追記。
