/* Всё движение сайта, кроме чисто наведённого — то живёт в css.
   Один файл на пять страниц: раньше этот код был вписан в каждую и
   расходился между ними.

   Общее правило на весь файл: при prefers-reduced-motion ничего не
   двигается, но всё остаётся видимым. Спрятать блок и не показать —
   худшее, что тут можно сделать. */
(function () {
  var reduced = window.matchMedia &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Заставка ──────────────────────────────────────────────────────── */

  /* Снимаем, когда страница догрузилась, но не раньше, чем через полсекунды
     от начала: на быстром соединении она иначе просто мигнёт. Если скрипт
     не отработает вовсе, заставку погасит своя анимация — см.
     loaderFailsafe в style.css. */
  var loader = document.getElementById('loader');
  if (loader) {
    var hide = function () {
      var passed = window.performance ? performance.now() : 500;
      setTimeout(function () {
        loader.classList.add('is-done');
      }, Math.max(0, 500 - passed));
    };
    if (document.readyState === 'complete') hide();
    else addEventListener('load', hide);
  }

  /* ── Шапка: тень и полоска прочитанного ────────────────────────────── */

  var header = document.querySelector('.top');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-stuck', scrollY > 8);

      // Сколько страницы позади. Знаменатель — то, что вообще можно
      // прокрутить; на короткой странице он нулевой, и делить нельзя.
      var runway = document.documentElement.scrollHeight - innerHeight;
      header.style.setProperty('--read', runway > 0 ? scrollY / runway : 0);
    };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
  }

  /* ── Блоки всплывают при прокрутке ─────────────────────────────────── */

  var items = [].slice.call(document.querySelectorAll('.reveal'));
  var showAll = function () {
    items.forEach(function (el) { el.classList.add('is-in'); });
  };

  if (!reduced && 'IntersectionObserver' in window) {
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        seen.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    items.forEach(function (el) {
      // Соседи в одном ряду трогаются друг за другом, но задержку копим
      // только внутри группы, иначе низ страницы ждал бы секунды
      var order = 0, prev = el.previousElementSibling;
      while (prev && prev.className === el.className) {
        order++;
        prev = prev.previousElementSibling;
      }
      el.style.setProperty('--delay', Math.min(order, 3) * 90 + 'ms');
      seen.observe(el);
    });
  } else {
    showAll();
  }

  if (reduced) return;

  /* Дальше идёт то, что считается на каждый кадр. Событий прокрутки и
     движения мыши приходит больше, чем кадров, поэтому каждый расчёт
     оборачиваем так, чтобы он выполнялся не чаще раза в кадр.

     Свой счётчик кадра у каждого расчёта не для красоты: с общим на всех
     наклон карточки и разъезд снимков вытесняли бы друг друга — кто
     первым занял кадр, тот и посчитался, а второй молча пропал. */
  var perFrame = function (fn) {
    var frame = null;
    return function () {
      if (frame) return;
      frame = requestAnimationFrame(function () {
        frame = null;
        fn();
      });
    };
  };

  /* ── Снимки разъезжаются ───────────────────────────────────────────── */

  /* Пока раздел подъезжает снизу, боковые снимки лежат под средним и
     расходятся в стороны. Доля пройденного пути (0…1) уходит в --p, а
     собственно раздвижку считает css. */
  var shots = document.querySelector('.shots');
  if (shots) {
    var spread = function () {
      var top = shots.getBoundingClientRect().top;

      // 0 — верх раздела только показался снизу экрана, 1 — он поднялся
      // до четверти экрана сверху. Считаем по верхнему краю, а не по
      // середине: снимки высокие, и до их середины пришлось бы листать
      // мимо всего раздела — разъезд закончился бы уже за экраном.
      var p = (innerHeight - top) / (innerHeight * .75);

      shots.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(3));
    };
    var onSpread = perFrame(spread);
    spread();
    addEventListener('scroll', onSpread, { passive: true });
    addEventListener('resize', onSpread);
  }

  /* ── Наклон карточек за курсором ───────────────────────────────────── */

  /* Наклон маленький нарочно: на пяти градусах это читается как отзыв
     карточки на курсор, на пятнадцати — как аттракцион. */
  var tilt = 5;
  var cards = [].slice.call(document.querySelectorAll('.card, .plan'));

  // Пальцем такое не наклонить, а на телефоне hover залипает — там не нужно
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    cards.forEach(function (card) {
      var x = 0, y = 0;
      var apply = perFrame(function () {
        card.style.setProperty('--ry', (x * tilt).toFixed(2) + 'deg');
        card.style.setProperty('--rx', (-y * tilt).toFixed(2) + 'deg');
      });
      card.addEventListener('mousemove', function (e) {
        var box = card.getBoundingClientRect();
        x = (e.clientX - box.left) / box.width - .5;
        y = (e.clientY - box.top) / box.height - .5;
        apply();
      });
      card.addEventListener('mouseleave', function () {
        card.style.setProperty('--ry', '0deg');
        card.style.setProperty('--rx', '0deg');
      });
    });

    /* Знак на первом экране чуть ходит за курсором */
    var art = document.querySelector('.hero-art-in');
    if (art) {
      var ax = 0, ay = 0;
      var move = perFrame(function () {
        art.style.transform =
          'translate3d(' + ax.toFixed(1) + 'px,' + ay.toFixed(1) + 'px,0)';
      });
      addEventListener('mousemove', function (e) {
        ax = (e.clientX / innerWidth - .5) * 22;
        ay = (e.clientY / innerHeight - .5) * 16;
        move();
      }, { passive: true });
    }
  }

  /* ── Цена набегает ─────────────────────────────────────────────────── */

  /* Считаем не саму цену, а долю от неё: в разметке цена написана словами
     («299 ₽ в месяц»), и трогать разрешено только первое число. */
  var prices = [].slice.call(document.querySelectorAll('.price'));
  if (prices.length && 'IntersectionObserver' in window) {
    var counter = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        counter.unobserve(entry.target);

        var node = entry.target.firstChild;
        if (!node || node.nodeType !== 3) return;

        var text = node.nodeValue;
        var target = parseInt(text, 10);
        if (isNaN(target) || target === 0) return;

        var tail = text.replace(/^\s*\d+/, '');
        var began = performance.now();
        var step = function (now) {
          var t = Math.min(1, (now - began) / 900);
          // Быстро разгоняется и мягко тормозит — иначе последние цифры
          // мелькают так, что их не прочесть
          var eased = 1 - Math.pow(1 - t, 3);
          node.nodeValue = Math.round(target * eased) + tail;
          if (t < 1) requestAnimationFrame(step);
        };
        node.nodeValue = '0' + tail;
        requestAnimationFrame(step);
      });
    }, { threshold: .5 });

    prices.forEach(function (el) { counter.observe(el); });
  }
})();
