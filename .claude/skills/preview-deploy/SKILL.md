---
name: preview-deploy
description: 制作中の静的サイト(HTML/CSS/JS)を「一般非公開のまま」Cloudflare Pagesでプレビューするための運用スキル。ユーザーが「プレビューを見たい/更新して/デプロイして/確認用URLを最新にして」、または「新しい制作案件をプレビューに追加したい」と言ったときに使う。案件ごとのCloudflare設定は不要で、リポジトリ直下にフォルダを置いてpushするだけで自動デプロイされる。ユーザーはCloudflareを触らず・git pullもせず、非公開URLを開くだけでよい状態を保つのが目的。
---

# preview-deploy — 非公開プレビュー運用スキル

制作物を「一般には非公開のまま」ブラウザで確認できる状態を、**案件をまたいで追加設定ゼロ**で維持するためのスキル。

## 仕組み(全体像)

```
Claude Codeが案件フォルダを編集 → git push
        ↓ (Cloudflare Pagesが自動検知)
   自動ビルド&デプロイ(1〜2分)
        ↓
  非公開プレビューURLが最新化 ← ユーザーは「開いて更新」するだけ
```

- ホスティング: **Cloudflare Pages**（このリポジトリを1つだけ接続。出力ディレクトリ=リポジトリのルート）
- 非公開化: **Cloudflare Access**（許可したメールでログインした人だけ閲覧可）
- 初回設定は `docs/cloudflare-preview-setup.md` に従って**一度だけ**。以降は不要。

## このリポジトリの約束(重要)

1. **1案件 = リポジトリ直下の1フォルダ**。例: `mazareal-kids-game/`。
2. 各案件フォルダには必ず `index.html` を置く（`css/` `js/` `img/` は任意）。
3. 依存は自己完結にする（相対パス参照。外部CDNに頼りすぎない）。
4. ルートの `index.html` は**プレビュー一覧(ダッシュボード)**。案件を足したらここにカードを1枚追記する。
5. デプロイのトリガーは**pushだけ**。Cloudflareの画面操作は初回以降しない。

## 使い方

### A. 既存案件を更新してプレビューに反映する

1. 対象フォルダ（例 `mazareal-kids-game/`）を編集する。
2. 可能なら Chromium でレンダリング確認（`run` スキルやスクショ）。
3. コミットして push:
   ```bash
   git add <案件フォルダ>
   git commit -m "<変更内容>"
   git push -u origin <現在のブランチ>
   ```
4. **push後、ユーザーには「1〜2分でプレビューURLが最新化されます」とだけ伝える**。URLは変わらない（同じURLを開き直すだけ）。

> ブランチごとに固定のプレビューURLが付く（`https://<ブランチ名>.<プロジェクト>.pages.dev/<案件フォルダ>/`）。本番相当は本番(Production)URL。

### B. 新しい制作案件をプレビューに追加する

1. スキャフォルドを使うと速い:
   ```bash
   bash scripts/new-preview-project.sh <案件フォルダ名> "案件の表示名"
   ```
   （手動なら `<案件フォルダ名>/index.html` を作るだけでよい）
2. ルート `index.html` のプロジェクト一覧に**カードを1枚追記**する（`data-project` の `<article>` を1つコピーして中身を差し替え）。
3. コミットして push。**Cloudflareの追加設定は不要**。数分後に
   `https://<プロジェクト>.pages.dev/<案件フォルダ名>/` で見られる。
4. ユーザーには「一覧ページ（ベースURL）を開けば、そこから新案件に入れます」と伝える。

## プレビューURLの伝え方

- ベース(一覧)URL: `docs/cloudflare-preview-setup.md` の「本番URL」に記録済みのものを使う。
- 各案件: ベースURL + `/<案件フォルダ名>/`。
- まだ初回接続が済んでいない場合は、先に `docs/cloudflare-preview-setup.md` の手順をユーザーに案内する（Cloudflare画面はユーザーが操作。こちらは値を提示して伴走する）。

## 初回だけ必要なこと

Cloudflare Pages への接続と Access(非公開化) は**一度だけ**。手順は `docs/cloudflare-preview-setup.md`。
- Build command: 空欄 / Build output directory: `/`（リポジトリのルート）
- Access: 許可メールを登録して限定公開にする。

## 代替: wrangler で直接デプロイ(任意・上級)

git連携を使わず Claude 側から直接デプロイしたい場合のみ。事前に Cloudflare APIトークンを
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` として環境に用意しておく:
```bash
npx wrangler pages deploy . --project-name=<プロジェクト名> --branch=<ブランチ>
```
※ 非公開化(Access)の設定は結局1回必要なので、通常はgit連携(push自動デプロイ)で十分。

## 注意

- 秘密情報（APIキー等）を案件フォルダに置かない。Pagesは静的配信なので誰でも取得可能（Accessは閲覧制限であって暗号化ではない）。
- 大きな生成物やnode_modulesはコミットしない。
- ルート直下には案件フォルダ以外に `.claude/` `docs/` `scripts/` `LICENSE` 等があるが、Accessで保護されるため配信されても問題ない。
