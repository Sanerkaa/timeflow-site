/* Сценка в телефоне на первом экране.

   Сюжет по кругу: в чате с ассистентом печатается фраза, она уходит
   сообщением, ассистент «печатает» и отвечает карточкой задачи; палец
   жмёт «Главную», новая задача въезжает в список; палец ставит галочку,
   и кольцо прогресса дорисовывается. Потом всё гаснет и начинается
   заново.

   Вся раскладка и движение — в css, здесь только смена состояний на
   #demo по времени. Шаги ждут, пока телефон виден: за экраном и в
   фоновой вкладке сценка стоит, а не крутится впустую. */
(function () {
  var demo = document.getElementById('demo');
  if (!demo) return;

  var el = function (name) { return demo.querySelector('[data-el="' + name + '"]'); };
  var typed = el('typed');
  var finger = el('finger');
  var PHRASE = 'Сдать реферат по истории к пятнице';

  var reduced = window.matchMedia &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Кому движение мешает — показываем итог сценки неподвижно
  if (reduced) {
    demo.dataset.scene = 'home';
    demo.classList.add('is-task');
    return;
  }

  var visible = true;
  var wake = null;
  var ready = function () {
    return visible && !document.hidden;
  };
  var resume = function () {
    if (wake && ready()) { var go = wake; wake = null; go(); }
  };

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      resume();
    }).observe(demo);
  }
  document.addEventListener('visibilitychange', resume);

  // Пауза, которая не кончается, пока телефон не на экране
  var wait = function (ms) {
    return new Promise(function (done) {
      setTimeout(function () {
        if (ready()) done();
        else wake = done;
      }, ms);
    });
  };

  var on = function (name) { demo.classList.add(name); };

  // Палец едет к середине элемента. Считаем по раскладке, а не по экрану:
  // телефон может быть сдвинут за курсором, а нам нужен сдвиг внутри него.
  var point = function (target) {
    var x = target.offsetWidth / 2, y = target.offsetHeight / 2;
    for (var n = target; n && n !== demo; n = n.offsetParent) {
      x += n.offsetLeft;
      y += n.offsetTop;
    }
    finger.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
  };

  var tap = function (target) {
    point(target);
    on('is-finger');
    return wait(520).then(function () {
      on('is-press');
      return wait(180);
    }).then(function () {
      demo.classList.remove('is-press');
    });
  };

  // Сброс в начало без проезда: переходы на миг выключены, а сценка
  // в этот момент погашена и проявляется уже с чистого листа
  var reset = function () {
    demo.className = 'app is-out is-snap';
    demo.dataset.scene = 'chat';
    typed.textContent = '';
    el('count').textContent = '0/2';
    el('left').textContent = 'Осталось 2 задачи';
    el('made').textContent = 'Сделано 0 из 2';
    void demo.offsetWidth;
    demo.classList.remove('is-snap');
    return wait(60).then(function () { demo.classList.remove('is-out'); });
  };

  var type = function (i) {
    if (i > PHRASE.length) return Promise.resolve();
    typed.textContent = PHRASE.slice(0, i) + '\u200E';
    // Пробел печатается чуть дольше — так набор похож на живой
    return wait(PHRASE.charAt(i - 1) === ' ' ? 95 : 48).then(function () {
      return type(i + 1);
    });
  };

  var play = function () {
    reset()
      .then(function () { return wait(900); })
      .then(function () { on('is-typing'); return type(1); })
      .then(function () { return wait(350); })
      .then(function () { return tap(el('send')); })
      .then(function () {
        typed.textContent = '';
        demo.classList.remove('is-typing');
        on('is-sent');
        return wait(450);
      })
      .then(function () { on('is-dots'); return wait(1300); })
      .then(function () { on('is-reply'); return wait(1900); })
      .then(function () { return tap(el('tab-home')); })
      .then(function () {
        demo.classList.remove('is-finger');
        demo.dataset.scene = 'home';
        return wait(550);
      })
      .then(function () { on('is-task'); return wait(1500); })
      .then(function () { return tap(el('check')); })
      .then(function () {
        on('is-done');
        el('count').textContent = '1/2';
        el('left').textContent = 'Осталась 1 задача';
        el('made').textContent = 'Сделано 1 из 2';
        return wait(600);
      })
      .then(function () { demo.classList.remove('is-finger'); return wait(2200); })
      .then(function () { on('is-out'); return wait(450); })
      // Новый круг не возвращается в цепочку: иначе каждый круг ждал бы
      // следующего, и цепочка обещаний росла бы без конца
      .then(function () { play(); });
  };

  play();
})();
