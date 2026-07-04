---
name: preview-deploy
description: 制作中の静的サイト(HTML/CSS/JS)をCloudflareで手早くプレビューするための運用スキル。ユーザーが「プレビューを見たい/更新して/デプロイして/確認用URLを最新にして」「新しい制作案件をプレビューに追加したい」「このフォルダだけ公開/非公開にしたい」と言ったときに使う。案件ごとのCloudflare設定は不要で、リポジトリ直下にフォルダを置いてpushするだけで自動デプロイされる。既定はすべて公開・必要なものだけAccessで非公開にする運用。ユーザーはCloudflareを触らず・git pullもせず、URLを開くだけでよい状態を保つのが目的。
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
| 公開/非公開 | **既定はすべて公開**。非公開にしたいフォルダだけ **Cloudflare Access（パス単位）** でサインイン必須にする |
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
2. **制作中ブランチに push する**（main へ入れる必要はない）。
3. **各ブランチに固定のブランチプレビューURLが付く**：
   `https://<ブランチ名>-test.mazareal.workers.dev/<フォルダ>/`
   （例 `claude-mazareal-game-service-page-cooc4z-test.mazareal.workers.dev`）。1〜2分で最新化。
   → **main にマージしなくても、そのブランチのURLで確認できる**。日々の確認はこれが便利。
4. 確定したら `main` にマージ → 本番URL `https://test.mazareal.workers.dev/<フォルダ>/` が更新される。

> URL種別：本番 = `test.mazareal.workers.dev`（mainの内容）／ブランチ = `<branch>-test.mazareal.workers.dev`／コミット単位 = `<hash>-test.mazareal.workers.dev`。

### B. 新しい制作案件を追加

1. スキャフォルド：`bash scripts/new-preview-project.sh <フォルダ名> "表示名"`
2. ルート `index.html` にカードを1枚追記（`data-project` の `<article>` を複製して中身を差し替え）。
3. `main` に push。**Cloudflareの追加設定は不要**。数分後 `https://test.mazareal.workers.dev/<フォルダ名>/` で見られる。
4. 新フォルダは**既定で公開**。非公開にしたい場合のみ下記「公開/非公開の管理」を参照。

## 公開/非公開の管理（既定＝公開。必要なものだけ非公開）

**方針：既定はすべて公開**（本番URLも、ブランチ/コミットのプレビューURLも、サインイン不要で閲覧可）。
**非公開にしたいフォルダだけ**、Cloudflare Access のパス単位アプリでサインイン必須にする。
Cloudflareは**より細かいパス指定のアプリを優先**する。

- **特定フォルダだけ非公開にする**：Zero Trust → Access → Applications → Add application → Self-hosted →
  Application domain `test.mazareal.workers.dev` / Path `<フォルダ名>` →
  Policy **Action: Allow / Include: Emails**（許可メール。`Emails ending in @mazareal.co.jp` で社内一括も可）。
  → そのフォルダはサインイン必須、それ以外は公開のまま。
- **ブランチ/コミットのプレビューURLでも同じパスを非公開にしたい場合**：プレビューは別ホスト
  （`<branch>-test.mazareal.workers.dev`）なので、Application domain を **`*-test.mazareal.workers.dev`**（ワイルドカード）
  にした同内容のアプリも追加する。
- **運用を「基本非公開」に戻したい場合**：Worker の「ドメイン」設定で本番・プレビューを「制限」にし、
  公開したいパスに **Action: Bypass / Include: Everyone** を付ける（＝逆の設計）。

> ⚠️ これらのCloudflare側操作（Access・サブドメイン等）は **この実行環境からはAPIが遮断**されていて実行できない（api.cloudflare.com が 403）。
> 手順を提示して**ユーザーにダッシュボードで操作してもらう**こと。

## 初回セットアップ（済み）

完了済み。記録と再現手順は `docs/cloudflare-preview-setup.md` を参照
（GitHub連携／`mazareal` サブドメイン登録／`wrangler.jsonc`・`.assetsignore`／本番URL有効化／Accessで `3aidmz@gmail.com` を許可）。

## 注意

- ルート直下の `.claude/` `docs/` `scripts/` も静的配信され得るが、Accessで保護されるため問題なし。
- 大きな生成物・node_modules はコミットしない。
