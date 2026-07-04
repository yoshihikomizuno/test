#!/usr/bin/env bash
# ------------------------------------------------------------
# 新しいプレビュー案件フォルダを作るスキャフォルド
# 使い方: bash scripts/new-preview-project.sh <folder-name> "表示名"
# 例:     bash scripts/new-preview-project.sh sample-lp "サンプルLP"
# 実行後: ルート index.html にカードを1枚追記して commit & push
# ------------------------------------------------------------
set -euo pipefail

slug="${1:-}"
title="${2:-新規案件}"

if [ -z "$slug" ]; then
  echo "使い方: bash scripts/new-preview-project.sh <folder-name> \"表示名\"" >&2
  exit 1
fi

# リポジトリのルートで実行する想定
root="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
dir="$root/$slug"

if [ -e "$dir" ]; then
  echo "エラー: '$slug' は既に存在します。" >&2
  exit 1
fi

mkdir -p "$dir/css" "$dir/js"

cat > "$dir/index.html" <<HTML
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>ここから制作を始めます。</p>
  </main>
  <script src="js/main.js"></script>
</body>
</html>
HTML

cat > "$dir/css/style.css" <<'CSS'
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; line-height: 1.7; }
main { max-width: 880px; margin: 0 auto; padding: 48px 20px; }
CSS

cat > "$dir/js/main.js" <<'JS'
// このファイルに動きを追加していきます
JS

echo "作成しました: $slug/"
echo ""
echo "次のステップ:"
echo "  1) ルートの index.html にこの案件のカードを1枚追記する"
echo "  2) git add $slug index.html && git commit -m \"add preview: $title\""
echo "  3) git push  → 数分後 <ベースURL>/$slug/ でプレビュー可能"
