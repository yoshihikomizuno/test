/* ============================================================
   うちの子クエスト - スクリプト
   依存ライブラリなし (Vanilla JS)
   ※ WordPress移行時: wp_enqueue_script でそのまま読み込めます
============================================================ */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------
     1. スクロール出現アニメーション (.reveal → .is-visible)
  ------------------------------------------------------------ */
  var revealTargets = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !prefersReducedMotion) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    revealTargets.forEach(function (el, i) {
      // 同一グリッド内で少しずつ遅延させ、順番に現れるように
      el.style.transitionDelay = (i % 3) * 0.12 + 's';
      revealObserver.observe(el);
    });
  } else {
    revealTargets.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ------------------------------------------------------------
     2. 経験値バー風スクロール進行ゲージ
  ------------------------------------------------------------ */
  var xpBar = document.getElementById('xpBar');
  function updateXpBar() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var ratio = max > 0 ? (window.scrollY / max) : 0;
    xpBar.style.width = (ratio * 100).toFixed(2) + '%';
  }
  window.addEventListener('scroll', updateXpBar, { passive: true });
  updateXpBar();

  /* ------------------------------------------------------------
     3. ヘッダー: 下スクロールで隠し、上スクロールで再表示
  ------------------------------------------------------------ */
  var header = document.getElementById('siteHeader');
  var lastY = window.scrollY;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    if (y > lastY && y > 240) {
      header.classList.add('is-hidden');
    } else {
      header.classList.remove('is-hidden');
    }
    lastY = y;
  }, { passive: true });

  /* ------------------------------------------------------------
     4. 料金カウントアップ (画面に入ったら 0 → 価格へ)
  ------------------------------------------------------------ */
  var counters = document.querySelectorAll('.price-num[data-count]');
  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (prefersReducedMotion || !('requestAnimationFrame' in window)) {
      el.textContent = target.toLocaleString('ja-JP');
      return;
    }
    var duration = 900;
    var start = null;
    function tick(ts) {
      if (start === null) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      // easeOutCubic
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(target * eased).toLocaleString('ja-JP');
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  if ('IntersectionObserver' in window) {
    var countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          countObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { countObserver.observe(el); });
  } else {
    counters.forEach(animateCount);
  }

  /* ------------------------------------------------------------
     5. タイプライター演出 (RPGのメッセージ窓風)
        [data-typewriter] のテキストを1文字ずつ表示
  ------------------------------------------------------------ */
  var typeTarget = document.querySelector('[data-typewriter]');
  if (typeTarget && !prefersReducedMotion && 'IntersectionObserver' in window) {
    var fullText = typeTarget.textContent;
    typeTarget.textContent = '';
    typeTarget.style.minHeight = '1em';

    var typeObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        typeObserver.unobserve(entry.target);
        var i = 0;
        (function typeNext() {
          if (i <= fullText.length) {
            typeTarget.textContent = fullText.slice(0, i);
            i++;
            setTimeout(typeNext, 55);
          }
        })();
      });
    }, { threshold: 0.8 });
    typeObserver.observe(typeTarget);
  }

  /* ------------------------------------------------------------
     6. コインのおまけ演出: クリックすると +1 が飛び出す
  ------------------------------------------------------------ */
  document.querySelectorAll('.pixel-coin').forEach(function (coin) {
    coin.style.cursor = 'pointer';
    coin.addEventListener('click', function () {
      var pop = document.createElement('span');
      pop.textContent = '+1';
      pop.setAttribute('aria-hidden', 'true');
      pop.style.cssText = [
        'position:absolute',
        'left:' + coin.style.left,
        'bottom:200px',
        'left:' + (coin.offsetLeft - 4) + 'px',
        'bottom:' + (parseInt(getComputedStyle(coin).bottom, 10) + 30) + 'px',
        'font-family:"DotGothic16",monospace',
        'color:#ffd93d',
        'font-size:20px',
        'pointer-events:none',
        'transition:transform .8s ease, opacity .8s ease',
        'z-index:3'
      ].join(';');
      coin.parentElement.appendChild(pop);
      requestAnimationFrame(function () {
        pop.style.transform = 'translateY(-46px)';
        pop.style.opacity = '0';
      });
      setTimeout(function () { pop.remove(); }, 900);
    });
  });
})();
