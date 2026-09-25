/* Сценки в карточках «Что умеет приложение» — с ними можно играть.

   Ассистент разбирает фразу прямо в браузере: ищет в ней день, число и
   время, угадывает категорию и важность и собирает из этого карточку
   задачи. Это не настоящий ассистент приложения, а его набросок на
   десятке правил, — но показывает то же самое: пишешь как думаешь,
   получаешь задачу со сроком.

   Всё, что человек напечатал, попадает на страницу только через
   textContent: разметкой его текст не станет. */
(function () {
  var root = document.getElementById('features');
  if (!root) return;

  var reduced = window.matchMedia &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  var later = function (fn, ms) { return setTimeout(fn, reduced ? 0 : ms); };

  // Перезапуск анимации появления: снять класс, дать браузеру заметить, вернуть
  var pop = function (el, name) {
    name = name || 'is-pop';
    el.classList.remove(name);
    void el.offsetWidth;
    el.classList.add(name);
  };

  var chip = function (text, hot) {
    var i = document.createElement('i');
    i.textContent = text;
    if (hot) i.className = 'hot';
    return i;
  };

  /* ── Ассистент ─────────────────────────────────────────────────────── */

  // \b в регулярках js знает только латиницу, поэтому границу слова для
  // кириллицы пишем сами: до — начало строки или не буква, после — не буква
  var word = function (body) {
    return new RegExp('(?:^|[^а-яё])(?:' + body + ')(?![а-яё])');
  };
  var DAYS = [
    [word('понедельник[а-я]*|пн'), 'Пн'], [word('вторник[а-я]*|вт'), 'Вт'],
    [word('сред[аеуы]|ср'), 'Ср'], [word('четверг[а-я]*|чт'), 'Чт'],
    [word('пятниц[аеуы]|пт'), 'Пт'], [word('суббот[аеуы]|сб'), 'Сб'],
    [word('воскресень[еяю]|вс'), 'Вс']
  ];
  var MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var MONTH_RE = /(\d{1,2})\s+(январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*/;
  var TOPICS = [
    [/зач[её]т|экзам|сесси|лаб|реферат|курсов|доклад|эссе|контрольн|семинар|учеб|учёб|диплом|практик|информатик|математ|физик|хими|истори|философ|английск|матан|научрук/, 'Учёба'],
    [/купить|магазин|заказать|оплатить/, 'Покупки'],
    [/позвонить|написать|встреч|созвон|старост/, 'Дела'],
    [/зал|трениров|бег|пробежк|врач|спорт|йог/, 'Здоровье']
  ];
  var HOT = /срочно|важн|экзам|зач[её]т|курсов|диплом|дедлайн/;

  // Слова, которыми просьбу начинают, но в названии задачи им не место
  var LEAD = /^(поставь|создай|добавь|запиши|напомни|надо|нужно|мне нужно|задача)\s+(задачу\s+)?/;

  var cap = function (t) { return t.charAt(0).toUpperCase() + t.slice(1); };

  var parse = function (raw) {
    var text = raw.trim().replace(/\s+/g, ' ');
    var low = text.toLowerCase();
    var cut = [];
    var when = '';

    var m;
    if ((m = low.match(/послезавтра/))) { when = 'Послезавтра'; cut.push(m[0]); }
    else if ((m = low.match(/завтра/))) { when = 'Завтра'; cut.push(m[0]); }
    else if ((m = low.match(/сегодня/))) { when = 'Сегодня'; cut.push(m[0]); }
    else if ((m = low.match(MONTH_RE))) {
      var mi = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр']
        .findIndex(function (s) { return m[2].indexOf(s) === 0; });
      when = m[1] + ' ' + MONTHS[mi];
      cut.push(m[0]);
    } else {
      for (var d = 0; d < DAYS.length; d++) {
        if ((m = low.match(DAYS[d][0]))) { when = DAYS[d][1]; cut.push(m[0]); break; }
      }
    }

    // Время: «в 17», «в 17:30», «17 часов», «к 9 утра»
    var time = '';
    if ((m = low.match(/(?:(?:^|\s)(?:в|к|до))?\s*(\d{1,2})[:.](\d{2})/))) {
      time = m[1] + ':' + m[2]; cut.push(m[0]);
    } else if ((m = low.match(/(?:^|\s)(?:в|к)\s+(\d{1,2})(?![\d:])(?:\s*(час[а-я]*|утра|вечера|дня))?(?!\s*(январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр))/))) {
      var h = parseInt(m[1], 10);
      if (/вечера|дня/.test(m[2] || '') && h < 12) h += 12;
      if (h < 24) { time = h + ':00'; cut.push(m[0]); }
    } else if ((m = low.match(/(\d{1,2})\s*час[а-я]*/))) {
      time = m[1] + ':00'; cut.push(m[0]);
    }

    // Название — то, что осталось от фразы без срока и служебных слов
    var title = low;
    cut.forEach(function (c) { title = title.replace(c, ' '); });
    title = title
      .replace(LEAD, '')
      .replace(/^(к|в|во|до|на)\s+/, '')
      .replace(/\s+(к|в|во|до|на|по)\s*$/g, '')
      .replace(/\s+(к|в|во|до|на)\s+(?=(к|в|во|до|на)\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s+(к|в|во|до|на)$/, '');
    // Регистр берём из исходной фразы, а не из нижнего
    var start = low.indexOf(title);
    if (title && start >= 0) title = text.substr(start, title.length);
    // «по информатике» само по себе не задача — достраиваем
    if (/^по\s/i.test(title)) title = 'задача ' + title;
    title = cap(title || text);

    var topic = 'Личное';
    for (var t = 0; t < TOPICS.length; t++) {
      if (TOPICS[t][0].test(low)) { topic = TOPICS[t][1]; break; }
    }

    var due = when ? when + ', ' + (time || '23:59') : (time ? 'Сегодня, ' + time : 'Без срока');
    return { title: title, due: due, topic: topic, hot: HOT.test(low) };
  };

  var ai = root.querySelector('.demo-ai');
  if (ai) {
    var said = ai.querySelector('[data-ai="said"]');
    var made = ai.querySelector('[data-ai="made"]');
    var title = ai.querySelector('[data-ai="title"]');
    var chips = ai.querySelector('[data-ai="chips"]');
    var form = ai.querySelector('[data-ai="form"]');
    var input = form.querySelector('input');
    var busy = false;

    var ask = function (phrase) {
      phrase = phrase.trim();
      if (!phrase || busy) return;
      busy = true;
      said.textContent = phrase;
      pop(said);
      made.classList.add('is-thinking');
      pop(made);
      later(function () {
        var task = parse(phrase);
        title.textContent = task.title;
        chips.textContent = '';
        chips.appendChild(chip(task.due));
        chips.appendChild(chip(task.topic));
        if (task.hot) chips.appendChild(chip('Важно', true));
        made.classList.remove('is-thinking');
        pop(made);
        busy = false;
      }, 750);
    };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ask(input.value);
      input.value = '';
    });
    [].forEach.call(ai.querySelectorAll('.idea'), function (b) {
      b.addEventListener('click', function () { ask(b.textContent); });
    });

    // Силлабус: страница «сканируется», счётчик набегает до найденного
    var syl = ai.querySelector('[data-ai="syllabus"]');
    var count = ai.querySelector('[data-ai="count"]');
    syl.addEventListener('click', function () {
      if (syl.classList.contains('is-scan')) return;
      syl.classList.add('is-scan');
      var n = 0, total = 14;
      count.textContent = '0';
      var step = function () {
        n++;
        count.textContent = String(n);
        if (n < total) later(step, 60);
        else later(function () { syl.classList.remove('is-scan'); }, 300);
      };
      later(step, 500);
    });
  }

  /* ── Расписание ────────────────────────────────────────────────────── */

  var pairs = [].slice.call(root.querySelectorAll('.pair-item'));
  pairs.forEach(function (item) {
    var head = item.querySelector('.pair');
    head.addEventListener('click', function () {
      var open = !item.classList.contains('is-open');
      pairs.forEach(function (other) {
        other.classList.remove('is-open');
        other.querySelector('.pair').setAttribute('aria-expanded', 'false');
      });
      if (open) {
        item.classList.add('is-open');
        head.setAttribute('aria-expanded', 'true');
      }
    });
    var bell = item.querySelector('.bell');
    bell.addEventListener('click', function () {
      var on = bell.getAttribute('aria-pressed') !== 'true';
      bell.setAttribute('aria-pressed', on ? 'true' : 'false');
      bell.textContent = on ? 'Напомню в ' + bell.dataset.at : 'Напомнить';
      item.classList.toggle('has-bell', on);
      pop(bell);
    });
  });

  /* ── Задачи ────────────────────────────────────────────────────────── */

  [].forEach.call(root.querySelectorAll('.todo .box'), function (box) {
    box.addEventListener('click', function () {
      var row = box.closest('.todo');
      var done = !row.classList.contains('is-done');
      row.classList.toggle('is-done', done);
      box.setAttribute('aria-pressed', done ? 'true' : 'false');
      if (done) pop(box, 'is-tick');
    });
  });

  var wave = root.querySelector('.todo .wave');
  if (wave) {
    var clock = wave.querySelector('.wave-time');
    var timer = null;
    var stop = function () {
      clearInterval(timer);
      timer = null;
      wave.classList.remove('is-playing');
      wave.setAttribute('aria-pressed', 'false');
      clock.textContent = '0:04';
    };
    wave.addEventListener('click', function () {
      if (timer) { stop(); return; }
      var left = 4;
      wave.classList.add('is-playing');
      wave.setAttribute('aria-pressed', 'true');
      clock.textContent = '0:0' + left;
      timer = setInterval(function () {
        left--;
        if (left <= 0) stop();
        else clock.textContent = '0:0' + left;
      }, 1000);
    });
  }

  /* ── Комната ───────────────────────────────────────────────────────── */

  var room = root.querySelector('.demo-room');
  if (room) {
    var join = room.querySelector('.room-join');
    var faces = room.querySelector('.faces');
    join.addEventListener('click', function () {
      var inside = !room.classList.contains('is-in');
      room.classList.toggle('is-in', inside);
      join.setAttribute('aria-pressed', inside ? 'true' : 'false');
      join.textContent = inside ? 'Вы в комнате · выйти' : 'Войти в комнату';
      faces.setAttribute('aria-label', 'В комнате ' + (inside ? 9 : 8) + ' человек');
    });

    var code = room.querySelector('.room-code');
    var copied = room.querySelector('.room-copied');
    var hide = null;
    code.addEventListener('click', function () {
      try {
        if (navigator.clipboard) navigator.clipboard.writeText('K7F-29').catch(function () {});
      } catch (e) { /* буфер недоступен — подсказку всё равно покажем */ }
      copied.textContent = 'Скопировано';
      code.classList.add('is-copied');
      clearTimeout(hide);
      // Текст убираем уже после того, как плашка погасла, иначе на миг
      // осталась бы пустая
      hide = setTimeout(function () {
        code.classList.remove('is-copied');
        hide = setTimeout(function () { copied.textContent = ''; }, 250);
      }, 1400);
    });
  }

  /* ── Виджет ────────────────────────────────────────────────────────── */

  var widget = root.querySelector('.demo-widget');
  if (widget) {
    var mini = widget.querySelector('.mini');
    var swatches = [].slice.call(widget.querySelectorAll('.swatch'));
    swatches.forEach(function (sw) {
      sw.addEventListener('click', function () {
        swatches.forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
        sw.setAttribute('aria-pressed', 'true');
        // Выбор человека останавливает самостоятельное перекрашивание
        widget.classList.add('is-picked');
        mini.style.setProperty('--tint', sw.style.getPropertyValue('--c'));
        pop(mini);
      });
    });
  }

  /* ── Телеграм ──────────────────────────────────────────────────────── */

  var tg = root.querySelector('.demo-tg');
  if (tg) {
    var log = tg.querySelector('.tg-log');
    var tgForm = tg.querySelector('.tg-form');
    var tgInput = tgForm.querySelector('input');
    var bubble = function (text, who) {
      var b = document.createElement('span');
      b.className = 'bubble bubble-' + who + ' is-pop';
      b.textContent = text;
      log.appendChild(b);
      // Помним только последний обмен — карточка не должна расти
      while (log.children.length > 2) log.removeChild(log.firstChild);
      return b;
    };
    tgForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = tgInput.value.trim();
      if (!text) return;
      tgInput.value = '';
      bubble(text, 'me');
      var task = parse(text);
      later(function () {
        bubble('Готово: «' + task.title + '» — ' + task.due, 'bot');
      }, 600);
    });
  }
})();
