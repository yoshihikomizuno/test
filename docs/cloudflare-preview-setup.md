# 非公開プレビューの初回セットアップ（Cloudflare Pages）

このリポジトリを **Cloudflare Pages** につなぎ、**一般には非公開のまま**プレビューできる状態を作る手順です。
**設定するのは最初の1回だけ**。以降は Claude Code が `git push` するたびに自動でプレビューが最新化されます。
新しい制作案件も、フォルダを足して push するだけ（Cloudflareの再設定は不要）。

---

## 前提

- GitHub リポジトリ: `yoshihikomizuno/test`
- 各案件は**リポジトリ直下のフォルダ**（例: `mazareal-kids-game/`）
- ルートの `index.html` が**プレビュー一覧ページ**

---

## STEP 1. リポジトリを接続（約3分）

> Cloudflareの新UIでは「Workers & Pages」は **「コンピュート」** に名称変更され、
> Workers と Pages が統合されています。以下は新UIの手順（旧UIなら Workers & Pages → Create → Pages）。

1. [https://dash.cloudflare.com](https://dash.cloudflare.com) にログイン（無料アカウントでOK）
2. ホームの **「Ship something new」カードの ［Create app］** を押す
   （または左メニュー **「コンピュート」→ 右上「Create」**）
3. **「Import a repository」**（Gitから取り込み）を選ぶ
   - ⚠️ 「Drop a folder, or a zip」は選ばない（＝Zip手動アップロードなので今回の目的に反する）
4. **GitHub を連携**（初回は Connect GitHub → 認可）し、リポジトリ **`yoshihikomizuno/test`** を選択
5. ビルド設定を次のように入力：

   | 項目 | 値 |
   |---|---|
   | プロジェクト名 | 任意（例: `mazareal-preview`）※これがURLの一部になる |
   | Production branch | `main`（または普段の確定用ブランチ） |
   | Framework preset | **None** |
   | Build command | **空欄**（静的サイトなのでビルド不要） |
   | Build output directory（デプロイ/アセットのディレクトリ） | **`/`**（リポジトリのルート） |

6. **Save and Deploy / Create and Deploy** を押す → 数分で初回デプロイ完了

> 新UIでは静的サイトが「Worker（静的アセット付き）」として作成される場合があるが、
> 「pushで自動デプロイ」「プレビューURL」「Accessで非公開」はすべて同様に機能する。
> 重要なのは **①Gitから取り込む ②Build output＝`/`** の2点。

完了すると本番URLが発行されます（例）:
- 一覧ページ: `https://mazareal-preview.pages.dev/`
- 今回の案件: `https://mazareal-preview.pages.dev/mazareal-kids-game/`

> ブランチごとのプレビューURLも自動で付きます：
> `https://<ブランチ名>.mazareal-preview.pages.dev/mazareal-kids-game/`
> （制作中ブランチの確認はこちらが便利）

---

## STEP 2. 非公開にする（Cloudflare Access／約3分）

このままだとURLを知る人は誰でも見られるので、**閲覧を自分たちだけに制限**します。

1. Pages プロジェクト → **Settings** → **General** の下の方、または **Access policy** の項目へ
   （もしくは左メニュー **Zero Trust** → **Access** → **Applications**）
2. このプロジェクトに **Access ポリシーを有効化 / Add application（Self-hosted）**
3. ポリシー設定：
   - **Application**: このPagesのドメイン（`*.mazareal-preview.pages.dev` を含める）
   - **Policy name**: 例 `社内のみ`
   - **Action**: **Allow**
   - **Include** → **Emails**：閲覧を許可するメールアドレスを追加（例: `3aidmz@gmail.com`、社内メンバー分も）
4. 保存

以降、URLを開くと**メール確認コードでのログイン**が求められ、**許可したメールの人だけ**プレビューを見られます。一般には非公開のままです。

> ⚠️ Access は「閲覧制限」であって暗号化ではありません。パスワードやAPIキーなど秘密情報はプレビューに置かないでください。

---

## STEP 3. 発行されたURLを控える

セットアップ後、本番の一覧URLをこのファイルの下に記録しておくと、以後の案内が楽になります。

- **本番URL（一覧ページ）**: `https://__ここに記入__.pages.dev/`
- **Cloudflare プロジェクト名**: `__ここに記入__`

（Claude に「本番URLは ○○ です」と一言伝えてもらえれば、以後こちらで案内に使います）

---

## これで完了。以降の運用

- **更新を見たいとき** … Claude が push → 1〜2分後、**同じURLを開き直すだけ**で最新
- **新しい案件** … Claude がフォルダを追加して push → `一覧URL` を開けばそこから入れる
- **あなたがやること** … Cloudflareの再設定も `git pull` も不要。**URLを開くだけ**

困ったら Claude に「preview-deploy スキルで」と伝えれば、この運用に沿って進めます。
