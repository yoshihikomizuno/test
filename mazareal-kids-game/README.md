# うちの子クエスト — ランディングページ

「自分の子どもにオリジナルゲームをプレゼントしたい親」向けサービスのランディングページです。
株式会社マザリアル ( https://mazareal.co.jp ) の世界観(ドット絵 × レトロゲーム × コドモゴコロ)に合わせて、HTML / CSS / JavaScript のみで制作しています。

## ファイル構成

```
mazareal-kids-game/
├── index.html   … ページ本体 (セマンティックHTML + JSON-LD構造化データ)
├── css/style.css … スタイル (ドット絵世界観・アニメーション・レスポンシブ)
├── js/main.js    … スクリプト (依存ライブラリなしのVanilla JS)
└── README.md     … このファイル
```

ブラウザで `index.html` を開くだけで動作確認できます。外部依存は Google Fonts (DotGothic16 / M PLUS Rounded 1c) のみです。

## SEO / AIO 対応の内容

- **セマンティックHTML**: `header / nav / main / section / article / footer`、見出しは h1→h2→h3 の階層を厳守
- **構造化データ (JSON-LD)**: `Organization` / `Service` / `FAQPage` / `BreadcrumbList` を `@graph` で定義
- **AIO (AI検索最適化)**: 冒頭に「何のサービスか」を一文で定義する段落を配置。FAQは本文と JSON-LD で内容を完全一致
- **meta**: title / description / canonical / OGP / Twitter Card 設定済み
- **アクセシビリティ**: `aria-label` / `aria-labelledby`、装飾要素は `aria-hidden`、`prefers-reduced-motion` 対応

## アニメーション一覧

| 演出 | 実装 |
|---|---|
| 星の瞬き・流れる雲・浮かぶ月 | CSS keyframes |
| 歩くドット絵の主人公・回転コイン・ゴール旗 | CSS box-shadow ドット絵 + keyframes |
| キャッチコピーの段階表示 | CSS animation-delay |
| スクロール出現 (各セクション) | IntersectionObserver + `.reveal` |
| 画面上部の経験値バー (読了ゲージ) | JS scroll 連動 |
| 料金のカウントアップ | IntersectionObserver + rAF |
| RPG風メッセージ窓のタイプライター | JS (1文字ずつ表示) |
| コインクリックで「+1」 | JS おまけ演出 |

`prefers-reduced-motion: reduce` 設定時はすべての動きが自動で無効になります。

## WordPress 移行時の手順

1. **固定ページ化**: `index.html` の `<main>` 内をページ本文へ。`<header>` / `<footer>` はテーマの `header.php` / `footer.php` に統合(HTML内のコメントで区切りを明記)
2. **CSS**: `css/style.css` を `wp_enqueue_style` で読み込み (子テーマ推奨)
3. **JS**: `js/main.js` を `wp_enqueue_script` で読み込み (`in_footer: true`)
4. **JSON-LD**: `<head>` 内の `<script type="application/ld+json">` をそのまま移設、または SEO プラグインに転記
5. **差し替えが必要な箇所**:
   - `canonical` / `og:url` / JSON-LD 内の URL → 実際の公開URLへ
   - `og:image` → アップロードした OGP 画像の URL へ
   - お問い合わせボタンのリンク先 → 実フォーム (Contact Form 7 等) へ
   - **料金プランの金額は仮の参考価格です。公開前に必ず正式価格へ差し替えてください**
