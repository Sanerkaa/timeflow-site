/* Раздел «Что умеет приложение»: телефон, который листается, и экраны в
   нём, с которыми можно играть.

   Экраны — html-копии приложения, и задачи у них общие: созданное у
   ассистента или в Телеграме появляется в списке, в планировщике и в
   виджете, отмеченное в виджете — отмечено везде. Ассистент и бот
   разбирают фразу прямо в браузере, на десятке правил: это не настоящий
   ассистент, но показывает то же самое — пишешь как думаешь, получаешь
   задачу со сроком.

   Всё, что человек напечатал, попадает на страницу только через
   textContent: разметкой его текст не станет. */
(function () {
  var root = document.getElementById('features');
  if (!root) return;

  var reduced = window.matchMedia &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  var later = function (fn, ms) { return setTimeout(fn, reduced ? 0 : ms); };

  // Перезапуск анимации: снять класс, дать браузеру заметить, вернуть
  var pop = function (node, name) {
    name = name || 'is-pop';
    node.classList.remove(name);
    void node.offsetWidth;
    node.classList.add(name);
  };

  var el = function (tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  var btn = function (cls, text) {
    var b = el('button', cls, text);
    b.type = 'button';
    return b;
  };
  var SVG = 'http://www.w3.org/2000/svg';
  var icon = function (name) {
    var svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'ic');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(SVG, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  };
  var $ = function (sel) { return root.querySelector(sel); };

  var plural = function (n, one, few, many) {
    var a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
  };
  var cap = function (t) { return t.charAt(0).toUpperCase() + t.slice(1); };

  /* ── Даты ──────────────────────────────────────────────────────────

     Сроки считаются от настоящего сегодняшнего дня: снимок с датой
     через месяц выглядел бы забытым. Задача хранит не дату, а сдвиг в
     днях от сегодня — так проще и сравнивать, и подписывать. */

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var dayAt = function (off) {
    var d = new Date(today);
    d.setDate(d.getDate() + off);
    return d;
  };
  var offsetOf = function (d) { return Math.round((d - today) / 864e5); };

  var WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  var WD_ON = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];
  var WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  var MONTH_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var MONTH = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  var longDate = function (d) { return cap(WD[d.getDay()]) + ', ' + d.getDate() + ' ' + MONTH_OF[d.getMonth()]; };

  // Срок так, как его подписывает приложение: «Сегодня», «Пт», «15 дек»
  var label = function (off) {
    if (off === null) return 'Без срока';
    if (off === 0) return 'Сегодня';
    if (off === 1) return 'Завтра';
    if (off === -1) return 'Вчера';
    var d = dayAt(off);
    if (off > 1 && off < 7) return cap(WD_SHORT[d.getDay()]);
    return d.getDate() + ' ' + MON[d.getMonth()];
  };
  // Тот же срок внутри фразы: «на завтра», «на пятницу», «на 15 декабря»
  var onDay = function (off) {
    if (off === 0) return 'на сегодня';
    if (off === 1) return 'на завтра';
    var d = dayAt(off);
    if (off > 1 && off < 7) return 'на ' + WD_ON[d.getDay()];
    return 'на ' + d.getDate() + ' ' + MONTH_OF[d.getMonth()];
  };

  [].forEach.call(root.querySelectorAll('[data-date="long"]'), function (n) { n.textContent = longDate(today); });
  [].forEach.call(root.querySelectorAll('[data-date="short"]'), function (n) {
    n.textContent = WD_SHORT[today.getDay()] + ', ' + today.getDate() + ' ' + MONTH_OF[today.getMonth()];
  });

  /* ── Разбор фразы ──────────────────────────────────────────────────── */

  // \b в регулярках js знает только латиницу, поэтому границу слова для
  // кириллицы пишем сами: до — начало строки или не буква, после — не буква
  var word = function (body) {
    return new RegExp('(?:^|[^а-яё])(?:' + body + ')(?![а-яё])');
  };
  var DAYS = [
    [word('понедельник[а-я]*|пн'), 1], [word('вторник[а-я]*|вт'), 2],
    [word('сред[аеуы]|ср'), 3], [word('четверг[а-я]*|чт'), 4],
    [word('пятниц[аеуы]|пт'), 5], [word('суббот[аеуы]|сб'), 6],
    [word('воскресень[еяю]|вс'), 0]
  ];
  var STEMS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
  var MONTH_RE = /(\d{1,2})\s+(январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*/;
  var TOPICS = [
    [/зач[её]т|экзам|сесси|лаб|реферат|курсов|доклад|эссе|контрольн|семинар|учеб|учёб|диплом|практик|информатик|математ|физик|хими|истори|философ|английск|матан|научрук/, 'учёба'],
    [/купить|магазин|заказать|оплатить|ватман|тетрад/, 'покупки'],
    [/позвонить|написать|встреч|созвон|старост/, 'дела'],
    [/зал|трениров|бег|пробежк|врач|спорт|йог/, 'здоровье']
  ];
  var HOT = /срочно|важн|экзам|зач[её]т|курсов|диплом|дедлайн/;

  // Слова, которыми просьбу начинают, но в названии задачи им не место
  var LEAD = /^(поставь|создай|добавь|запиши|напомни|надо|нужно|мне нужно|задача)\s+(задачу\s+)?/;

  var parse = function (raw) {
    var text = raw.trim().replace(/\s+/g, ' ');
    var low = text.toLowerCase();
    var cut = [];
    var off = null;

    var m;
    if ((m = low.match(/послезавтра/))) { off = 2; cut.push(m[0]); }
    else if ((m = low.match(/завтра/))) { off = 1; cut.push(m[0]); }
    else if ((m = low.match(/сегодня/))) { off = 0; cut.push(m[0]); }
    else if ((m = low.match(MONTH_RE))) {
      var mi = STEMS.findIndex(function (s) { return m[2].indexOf(s) === 0; });
      var d = new Date(today.getFullYear(), mi, parseInt(m[1], 10));
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      off = offsetOf(d);
      cut.push(m[0]);
    } else {
      for (var i = 0; i < DAYS.length; i++) {
        if ((m = low.match(DAYS[i][0]))) {
          off = (DAYS[i][1] - today.getDay() + 7) % 7;
          cut.push(m[0]);
          break;
        }
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
    if (off === null && time) off = 0;

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

    var cat = 'личное';
    for (var t = 0; t < TOPICS.length; t++) {
      if (TOPICS[t][0].test(low)) { cat = TOPICS[t][1]; break; }
    }
    return { title: title, off: off, time: time, cat: cat, hot: HOT.test(low) };
  };

  /* ── Задачи: одни на все экраны ────────────────────────────────────── */

  var CAT = {
    'учёба': '#2f86eb', 'семинар': '#e5b32b', 'покупки': '#26b8c9',
    'дела': '#e09a3e', 'здоровье': '#57b35b', 'личное': '#9a91ff'
  };
  var seq = 0;
  var make = function (title, cat, off, time, extra) {
    var t = { id: ++seq, title: title, cat: cat, off: off, time: time || '', done: false, hot: false };
    for (var k in extra) t[k] = extra[k];
    return t;
  };
  // Ватман из переписки с ботом — на ближайшую среду, но не на сегодня
  var wednesday = (3 - today.getDay() + 7) % 7 || 7;
  var tasks = [
    make('Сдать реферат по истории', 'семинар', -2, '', { hot: true }),
    make('Лабораторная №3', 'учёба', 0, '9:00', { done: true }),
    make('Информатика', 'учёба', 0, '17:00'),
    make('Эссе по философии', 'учёба', 1, '', { voice: true, photo: true, repeat: true }),
    make('Купить ватман', 'покупки', wednesday, ''),
    make('Английский', 'учёба', 4, '')
  ];
  var byId = function (id) {
    id = +id;
    for (var i = 0; i < tasks.length; i++) if (tasks[i].id === id) return tasks[i];
    return null;
  };
  var due = function (t) { return label(t.off) + (t.time ? ', ' + t.time : ''); };
  var sortKey = function (t) {
    var hm = t.time ? t.time.split(':') : [99, 0];
    return (t.off === null ? 9999 : t.off) * 1e4 + (+hm[0]) * 60 + (+hm[1]);
  };
  var add = function (p) {
    var t = make(p.title, p.cat, p.off, p.time, { hot: p.hot });
    tasks.push(t);
    changed();
    return t;
  };

  var toastEl = $('[data-toast]');
  var toastTimer = null;
  var toast = function (text) {
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 1900);
  };

  /* ── Мои задачи ────────────────────────────────────────────────────── */

  var tList = $('[data-t="list"]');
  var filter = 'all';
  var opened = {};

  var taskItem = function (t) {
    var item = el('div', 't-item' + (t.done ? ' is-done' : '') + (opened[t.id] ? ' is-open' : ''));
    item.dataset.id = t.id;
    var under = el('div', 't-swipe');
    under.setAttribute('aria-hidden', 'true');
    under.appendChild(icon('check'));
    item.appendChild(under);

    var card = el('div', 't-card');
    card.style.setProperty('--c', CAT[t.cat]);
    card.appendChild(el('i', 't-bar'));
    var main = el('div', 't-main');
    main.appendChild(el('b', null, t.title));
    var meta = el('span', 't-meta');
    meta.appendChild(el('span', 'cat', t.cat));
    meta.appendChild(document.createTextNode('·'));
    meta.appendChild(el('span', t.off !== null && t.off < 0 && !t.done ? 'late' : '', due(t)));
    if (t.hot) meta.appendChild(el('span', 'hot', 'Важно'));
    if (t.voice) meta.appendChild(icon('mic'));
    if (t.photo) meta.appendChild(icon('image'));
    if (t.repeat) meta.appendChild(icon('repeat'));
    main.appendChild(meta);
    card.appendChild(main);

    var more = btn('t-more');
    more.dataset.act = 'open';
    more.setAttribute('aria-label', 'Подробнее: ' + t.title);
    more.setAttribute('aria-expanded', opened[t.id] ? 'true' : 'false');
    more.appendChild(icon('down'));
    card.appendChild(more);

    var extra = el('div', 't-extra');
    if (t.voice) {
      var v = btn('t-voice');
      v.dataset.act = 'voice';
      v.setAttribute('aria-label', 'Голосовая заметка, 4 секунды');
      v.appendChild(icon('play'));
      for (var i = 0; i < 5; i++) v.appendChild(el('b'));
      v.appendChild(el('time', null, '0:04'));
      extra.appendChild(v);
    }
    if (t.photo) {
      var photo = el('span', 't-photo');
      photo.setAttribute('aria-label', 'Фото к задаче');
      photo.appendChild(icon('image'));
      extra.appendChild(photo);
    }
    if (t.repeat) {
      var rep = el('span', 'a-chip', 'Каждую неделю');
      rep.insertBefore(icon('repeat'), rep.firstChild);
      extra.appendChild(rep);
    }
    var done = btn('a-chip' + (t.done ? ' is-done' : ''), t.done ? 'Выполнено' : 'Готово');
    done.dataset.act = 'done';
    done.insertBefore(icon('check'), done.firstChild);
    extra.appendChild(done);
    if (!t.done && t.off !== 1) {
      var move = btn('a-chip', 'На завтра');
      move.dataset.act = 'tomorrow';
      extra.appendChild(move);
    }
    card.appendChild(extra);
    item.appendChild(card);
    return item;
  };

  var renderTasks = function () {
    var shown = tasks.filter(function (t) {
      return filter === 'all' || (filter === 'done') === t.done;
    }).sort(function (a, b) { return sortKey(a) - sortKey(b); });
    var groups = [
      ['Просрочено', 'is-late', function (t) { return t.off !== null && t.off < 0 && !t.done; }],
      ['Сегодня', '', function (t) { return t.off === 0; }],
      ['Позже', '', function (t) { return t.off === null || t.off > 0; }],
      ['Сделано раньше', '', function (t) { return t.off !== null && t.off < 0 && t.done; }]
    ];
    var keep = tList.scrollTop;
    tList.textContent = '';
    groups.forEach(function (g) {
      var list = shown.filter(g[2]);
      if (!list.length) return;
      tList.appendChild(el('div', 't-group ' + g[1], g[0]));
      list.forEach(function (t) { tList.appendChild(taskItem(t)); });
    });
    if (!tList.children.length) {
      tList.appendChild(el('div', 't-empty', filter === 'done' ? 'Пока ничего не выполнено' : 'Все задачи сделаны'));
    }
    tList.scrollTop = keep;

    var todays = tasks.filter(function (t) { return t.off === 0; });
    var made = todays.filter(function (t) { return t.done; }).length;
    var left = todays.length - made;
    $('[data-t="ring"]').style.setProperty('--v', todays.length ? made / todays.length : 1);
    $('[data-t="ringText"]').textContent = made + '/' + todays.length;
    $('[data-t="sumTitle"]').textContent = left
      ? plural(left, 'Осталась ', 'Осталось ', 'Осталось ') + left + ' ' + plural(left, 'задача', 'задачи', 'задач')
      : 'Сегодня всё сделано';
    var late = tasks.filter(function (t) { return t.off !== null && t.off < 0 && !t.done; }).length;
    var lateEl = $('[data-t="late"]');
    lateEl.hidden = !late;
    lateEl.lastChild.textContent = 'Просрочено: ' + late;
  };

  var setDone = function (t, done) {
    t.done = done;
    changed();
    toast(done ? 'Задача выполнена' : 'Задача снова в работе');
  };

  // Голосовая заметка «играет» четыре секунды
  var voiceTimer = null;
  var playVoice = function (v) {
    var clock = v.querySelector('time');
    clearInterval(voiceTimer);
    if (v.classList.contains('is-playing')) {
      v.classList.remove('is-playing');
      clock.textContent = '0:04';
      return;
    }
    var left = 4;
    v.classList.add('is-playing');
    voiceTimer = setInterval(function () {
      left--;
      clock.textContent = '0:0' + Math.max(left, 0);
      if (left <= 0) {
        clearInterval(voiceTimer);
        v.classList.remove('is-playing');
        clock.textContent = '0:04';
      }
    }, 1000);
  };

  var dragged = false;
  tList.addEventListener('click', function (e) {
    var item = e.target.closest('.t-item');
    if (!item) return;
    var t = byId(item.dataset.id);
    var act = e.target.closest('[data-act]');
    if (!act && e.target.closest('.t-extra')) return;
    var what = act ? act.dataset.act : (dragged ? '' : 'open');
    dragged = false;
    if (what === 'open') {
      opened[t.id] = !opened[t.id];
      renderTasks();
    } else if (what === 'done') {
      setDone(t, !t.done);
    } else if (what === 'tomorrow') {
      t.off = 1;
      changed();
      toast('Перенесено на завтра');
    } else if (what === 'voice') {
      playVoice(act);
    }
  });

  // Смахнуть вправо — выполнить, как в приложении. Палец и мышь — одно и
  // то же через pointer-события; вертикальную прокрутку не трогаем:
  // у карточки touch-action: pan-y, и браузер отдаёт нам только сдвиг вбок.
  var drag = null;
  tList.addEventListener('pointerdown', function (e) {
    var card = e.target.closest('.t-card');
    dragged = false;
    if (!card || e.target.closest('button, .t-extra') || e.button > 0) return;
    drag = { card: card, x: e.clientX, dx: 0, id: e.pointerId };
  });
  tList.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    // Телефон может быть уменьшен — сдвиг пальца переводим в его пиксели
    drag.dx = Math.max(0, (e.clientX - drag.x) / scale());
    if (drag.dx > 6 && !drag.card.classList.contains('is-drag')) {
      drag.card.classList.add('is-drag');
      try { drag.card.setPointerCapture(e.pointerId); } catch (err) {}
    }
    if (drag.card.classList.contains('is-drag')) {
      drag.card.style.transform = 'translateX(' + Math.min(drag.dx, 160) + 'px)';
    }
  });
  var dropDrag = function () {
    if (!drag) return;
    var d = drag;
    drag = null;
    if (!d.card.classList.contains('is-drag')) return;
    dragged = true;
    d.card.classList.remove('is-drag');
    var t = byId(d.card.closest('.t-item').dataset.id);
    if (d.dx > 70) {
      d.card.style.transform = 'translateX(110%)';
      later(function () { setDone(t, !t.done); }, 220);
    } else {
      d.card.style.transform = '';
    }
  };
  tList.addEventListener('pointerup', dropDrag);
  tList.addEventListener('pointercancel', dropDrag);

  var filters = [].slice.call(root.querySelectorAll('.t-filters [data-f]'));
  filters.forEach(function (f) {
    f.addEventListener('click', function () {
      filter = f.dataset.f;
      filters.forEach(function (o) {
        o.classList.toggle('is-on', o === f);
        o.setAttribute('aria-pressed', o === f ? 'true' : 'false');
      });
      tList.scrollTop = 0;
      renderTasks();
    });
  });

  // Быстрое добавление
  var sheet = $('[data-t="sheet"]');
  var sheetInput = sheet.querySelector('input');
  var sheetDay = 0;
  var sheetDays = [].slice.call(sheet.querySelectorAll('[data-day]'));
  $('[data-t="add"]').addEventListener('click', function () {
    sheet.hidden = !sheet.hidden;
    if (!sheet.hidden) sheetInput.focus({ preventScroll: true });
  });
  sheetDays.forEach(function (b) {
    b.addEventListener('click', function () {
      sheetDay = +b.dataset.day;
      sheetDays.forEach(function (o) {
        o.classList.toggle('is-on', o === b);
        o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
      });
    });
  });
  sheet.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = sheetInput.value.trim();
    if (!text) { sheetInput.focus({ preventScroll: true }); return; }
    var p = parse(text);
    p.title = cap(text);
    p.off = sheetDay;
    p.time = '';
    add(p);
    sheetInput.value = '';
    sheet.hidden = true;
    filter = 'all';
    filters.forEach(function (o) { o.classList.toggle('is-on', o.dataset.f === 'all'); });
    renderTasks();
    toast('Задача добавлена');
  });
  sheet.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') sheet.hidden = true;
  });

  /* ── Расписание ────────────────────────────────────────────────────── */

  var SLOTS = [null, ['9:00', '10:30'], ['10:40', '12:10'], ['12:40', '14:10'], ['14:20', '15:50']];
  var NOW = 10 * 60 + 52;   // столько показывают часы в строке состояния
  // Четыре разных дня, по группам и дням недели они ходят по кругу
  var DAY_PLANS = [
    [[1, 'Матанализ', 'Лекция', 'Иванова Е. А.', '3-214'], [2, 'История', 'Семинар', 'Петров А. В.', '5-610'], [3, 'Английский', 'Практика', 'Смирнова О. Н.', '2-105']],
    [[2, 'Разработка программных приложений', 'Лабораторная', 'Терещенко С. Н.', '5-720'], [3, 'Разработка программных приложений', 'Лабораторная', 'Терещенко С. Н.', '5-720'], [4, 'Проектирование инф. систем', 'Лекция', 'Пашков П. М.', '5-711']],
    [[1, 'Базы данных', 'Лекция', 'Ким Д. С.', '4-302'], [2, 'Философия', 'Семинар', 'Орлова Т. И.', '1-112'], [3, 'Физкультура', 'Практика', 'Кафедра физвоспитания', 'спортзал']],
    [[2, 'Матанализ', 'Практика', 'Иванова Е. А.', '3-214'], [3, 'Экономика', 'Лекция', 'Белова Н. Ю.', '6-201'], [4, 'Базы данных', 'Лабораторная', 'Ким Д. С.', '4-302']]
  ];
  var GROUPS = ['ПИ402.2', 'ПИ402.1'];
  var group = 0;
  var todayIdx = (today.getDay() + 6) % 7;   // понедельник — 0
  var sDay = todayIdx;
  var bells = {};
  var notes = {};
  var openPair = null;

  var minutes = function (hm) { var p = hm.split(':'); return +p[0] * 60 + +p[1]; };
  var pairsOf = function (g, idx) { return idx === 6 ? [] : DAY_PLANS[(idx + g * 2) % 4]; };

  // Четность недели — как в вузовском расписании: первая или вторая
  var week = (function () {
    var d = new Date(today);
    d.setDate(d.getDate() + 3 - todayIdx);
    var jan = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - jan) / 864e5 - 3 + (jan.getDay() + 6) % 7) / 7);
  })();
  $('[data-s="week"]').textContent = (week % 2 ? 1 : 2) + ' неделя (текущая)';

  var sDays = $('[data-s="days"]');
  var sList = $('[data-s="list"]');
  var renderSchedule = function () {
    var monday = dayAt(-todayIdx);
    sDays.textContent = '';
    for (var i = 0; i < 7; i++) {
      var d = new Date(monday);
      d.setDate(d.getDate() + i);
      var b = btn((i === sDay ? 'is-on' : '') + (i === todayIdx ? ' is-today' : ''));
      b.dataset.day = i;
      b.setAttribute('aria-pressed', i === sDay ? 'true' : 'false');
      b.setAttribute('aria-label', longDate(d));
      b.appendChild(document.createTextNode(d.getDate()));
      b.appendChild(el('small', null, WD_SHORT[d.getDay()]));
      sDays.appendChild(b);
    }
    var day = new Date(monday);
    day.setDate(day.getDate() + sDay);
    $('[data-s="dayName"]').textContent = cap(WD[day.getDay()]);

    sList.textContent = '';
    var pairs = pairsOf(group, sDay);
    if (!pairs.length) sList.appendChild(el('div', 's-free', 'Пар нет — можно выдохнуть'));
    pairs.forEach(function (p) {
      var key = group + ':' + sDay + ':' + p[0];
      var slot = SLOTS[p[0]];
      var now = sDay === todayIdx && NOW >= minutes(slot[0]) && NOW < minutes(slot[1]);
      var box = el('div', 's-pair' + (now ? ' is-now' : '') + (openPair === key ? ' is-open' : ''));
      box.dataset.key = key;

      var top = el('div', 's-top');
      top.appendChild(el('span', 's-num', p[0]));
      top.appendChild(document.createTextNode(slot[0] + ' - ' + slot[1]));
      if (now) top.appendChild(el('span', 's-now', 'сейчас'));
      top.appendChild(el('span', 's-type', p[2]));
      var bell = btn('s-bell');
      bell.dataset.act = 'bell';
      bell.setAttribute('aria-pressed', bells[key] ? 'true' : 'false');
      bell.setAttribute('aria-label', 'Напомнить о паре «' + p[1] + '»');
      bell.appendChild(icon('bell'));
      top.appendChild(bell);
      box.appendChild(top);

      var info = btn('s-open');
      info.dataset.act = 'note';
      info.setAttribute('aria-expanded', openPair === key ? 'true' : 'false');
      info.appendChild(el('b', null, p[1]));
      info.appendChild(el('span', null, p[3]));
      info.appendChild(el('span', null, 'ауд. ' + p[4]));
      if (notes[key]) {
        var noted = el('span', 's-noted');
        noted.appendChild(icon('note'));
        noted.appendChild(document.createTextNode(notes[key]));
        info.appendChild(noted);
      }
      box.appendChild(info);

      if (now) {
        var bar = el('div', 's-bar');
        var fill = el('i');
        fill.style.setProperty('--fill', Math.round((NOW - minutes(slot[0])) / (minutes(slot[1]) - minutes(slot[0])) * 100) + '%');
        bar.appendChild(fill);
        box.appendChild(bar);
      }

      var note = el('label', 's-note');
      note.appendChild(icon('note'));
      var input = el('input');
      input.type = 'text';
      input.maxLength = 50;
      input.placeholder = 'Заметка к паре';
      input.value = notes[key] || '';
      input.setAttribute('aria-label', 'Заметка к паре «' + p[1] + '»');
      note.appendChild(input);
      box.appendChild(note);
      sList.appendChild(box);
    });
  };

  // Ближайшая пара — она же в сводке на главной
  (function () {
    var next = pairsOf(0, todayIdx).filter(function (p) { return minutes(SLOTS[p[0]][1]) > NOW; })[0];
    $('[data-t="next"]').textContent = next
      ? p2(next)
      : 'Сегодня пар больше нет';
    function p2(p) {
      var slot = SLOTS[p[0]];
      return NOW >= minutes(slot[0])
        ? p[1] + ' · идёт до ' + slot[1] + ' · ауд. ' + p[4]
        : p[1] + ' · в ' + slot[0] + ' · ауд. ' + p[4];
    }
  })();

  sDays.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    sDay = +b.dataset.day;
    openPair = null;
    renderSchedule();
  });
  $('[data-s="today"]').addEventListener('click', function () {
    sDay = todayIdx;
    openPair = null;
    renderSchedule();
  });
  sList.addEventListener('click', function (e) {
    var act = e.target.closest('[data-act]');
    if (!act) return;
    var key = act.closest('.s-pair').dataset.key;
    if (act.dataset.act === 'bell') {
      bells[key] = !bells[key];
      act.setAttribute('aria-pressed', bells[key] ? 'true' : 'false');
      pop(act);
      toast(bells[key] ? 'Напомню за 10 минут до пары' : 'Напоминание снято');
    } else {
      openPair = openPair === key ? null : key;
      renderSchedule();
      var input = sList.querySelector('.is-open input');
      if (input) input.focus({ preventScroll: true });
    }
  });
  sList.addEventListener('change', function (e) {
    var box = e.target.closest('.s-pair');
    if (!box) return;
    notes[box.dataset.key] = e.target.value.trim();
    renderSchedule();
    if (notes[box.dataset.key]) toast('Заметка сохранена');
  });
  sList.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches('input')) e.target.blur();
  });

  var groupBtns = [].slice.call(root.querySelectorAll('.s-group'));
  groupBtns.forEach(function (g) {
    g.addEventListener('click', function () {
      group = +g.dataset.g;
      groupBtns.forEach(function (o) {
        o.classList.toggle('is-on', o === g);
        o.setAttribute('aria-pressed', o === g ? 'true' : 'false');
      });
      $('[data-s="group"]').textContent = GROUPS[group];
      openPair = null;
      renderSchedule();
      wPair = upcoming();
      renderWidget();
    });
  });
  var sync = $('[data-s="sync"]');
  sync.addEventListener('click', function () {
    pop(sync, 'is-spin');
    later(function () {
      $('[data-s="synced"]').textContent = 'только что';
      toast('Расписание обновлено');
    }, 700);
  });

  /* ── Планировщик ───────────────────────────────────────────────────── */

  var pSel = 0;    // выбранный день — сдвиг от сегодня
  var pDays = $('[data-p="days"]');
  var pList = $('[data-p="list"]');
  var renderPlanner = function () {
    var sel = dayAt(pSel);
    var monday = new Date(sel);
    monday.setDate(monday.getDate() - (sel.getDay() + 6) % 7);
    var mid = new Date(monday);
    mid.setDate(mid.getDate() + 3);
    $('[data-p="month"]').textContent = MONTH[mid.getMonth()] + ' ' + mid.getFullYear();

    pDays.textContent = '';
    for (var i = 0; i < 7; i++) {
      var d = new Date(monday);
      d.setDate(d.getDate() + i);
      var off = offsetOf(d);
      var has = tasks.some(function (t) { return t.off === off; });
      var b = btn((off === pSel ? 'is-on' : '') + (off === 0 ? ' is-today' : '') + (has ? ' has-dot' : ''));
      b.dataset.off = off;
      b.setAttribute('aria-pressed', off === pSel ? 'true' : 'false');
      b.setAttribute('aria-label', longDate(d) + (has ? ', есть задачи' : ''));
      b.appendChild(el('small', null, WD_SHORT[d.getDay()].toUpperCase()));
      b.appendChild(document.createTextNode(d.getDate()));
      pDays.appendChild(b);
    }

    var list = tasks.filter(function (t) { return t.off === pSel; })
      .sort(function (a, b) { return sortKey(a) - sortKey(b); });
    $('[data-p="dayName"]').textContent = longDate(sel);
    $('[data-p="count"]').textContent = list.length + ' ' + plural(list.length, 'задача', 'задачи', 'задач');

    pList.textContent = '';
    if (!list.length) pList.appendChild(el('div', 's-free', pSel < 0 ? 'В этот день ничего не было' : 'Свободный день'));
    list.forEach(function (t) {
      var box = el('div', 'p-task' + (t.done ? ' is-done' : ''));
      box.dataset.id = t.id;
      var row = el('div', 'p-row');
      row.style.setProperty('--c', CAT[t.cat]);
      row.appendChild(el('i', 't-bar'));
      var text = el('div');
      text.appendChild(el('b', null, t.title));
      text.appendChild(el('span', null, (t.time ? t.time + ' • ' : '') + t.cat));
      row.appendChild(text);
      box.appendChild(row);

      var acts = el('div', 'p-acts');
      var done = btn('p-act' + (t.done ? ' is-done' : ''), 'Готово');
      done.dataset.act = 'done';
      done.setAttribute('aria-pressed', t.done ? 'true' : 'false');
      done.insertBefore(icon('check'), done.firstChild);
      acts.appendChild(done);
      [[0, 'Сегодня'], [1, 'Завтра']].forEach(function (m) {
        var b = btn('p-act', m[1]);
        b.dataset.act = 'move';
        b.dataset.to = m[0];
        b.disabled = t.off === m[0];
        acts.appendChild(b);
      });
      box.appendChild(acts);
      pList.appendChild(box);
    });
  };

  pDays.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    pSel = +b.dataset.off;
    renderPlanner();
  });
  $('[data-p="prev"]').addEventListener('click', function () { pSel -= 7; renderPlanner(); });
  $('[data-p="next"]').addEventListener('click', function () { pSel += 7; renderPlanner(); });
  $('[data-p="today"]').addEventListener('click', function () { pSel = 0; renderPlanner(); });
  pList.addEventListener('click', function (e) {
    var act = e.target.closest('[data-act]');
    if (!act) return;
    var t = byId(act.closest('.p-task').dataset.id);
    if (act.dataset.act === 'done') {
      setDone(t, !t.done);
    } else {
      t.off = +act.dataset.to;
      t.done = false;
      changed();
      toast(t.off ? 'Перенесено на завтра' : 'Перенесено на сегодня');
    }
  });

  /* ── Комната ───────────────────────────────────────────────────────── */

  // Как в приложении: у задачи статус, исполнитель, автор и реакции.
  // «Я» — это вы, реакция — [эмодзи, сколько, есть ли среди них ваша].
  var STATUS = ['Ждёт', 'В работе', 'Готово'];
  var room = [
    { t: 'Собрать литературу', st: 1, who: 'Я', by: 'Аня', com: 2, re: [] },
    { t: 'Написать введение', st: 0, who: '', by: 'Миша', com: 0, re: [['✅', 1, true], ['👍', 1, true], ['😊', 1, false]] },
    { t: 'Сверстать презентацию', st: 1, who: 'Вика', by: 'Миша', com: 0, re: [] },
    { t: 'Согласовать тему с научруком', note: 'Научрук одобрил, пишем', st: 2, who: '', by: 'Миша', com: 0, re: [['❤️', 1, false], ['👍', 1, true], ['😊', 1, true]] },
    { t: 'Посчитать экономику проекта', st: 0, who: '', by: 'Вика', com: 0, re: [] }
  ];
  var REACTIONS = ['👍', '❤️', '😊', '✅'];
  var rList = $('[data-r="list"]');
  var rSheet = $('[data-r="sheet"]');
  var rInput = rSheet.querySelector('input');
  var small = function (cls, name, label) {
    var b = btn(cls);
    b.appendChild(icon(name));
    b.setAttribute('aria-label', label);
    return b;
  };
  var renderRoom = function () {
    var done = room.filter(function (r) { return r.st === 2; }).length;
    $('[data-r="stat"]').textContent = 'В сети: 1 из 3 · готово ' + done + ' из ' + room.length;
    $('[data-r="bar"]').style.setProperty('--fill', (room.length ? done / room.length * 100 : 0) + '%');

    rList.textContent = '';
    room.forEach(function (r, i) {
      var row = el('div', 'r-task' + (r.st === 2 ? ' is-done' : ''));
      row.dataset.i = i;

      var top = el('div', 'r-top');
      var check = small('r-check', 'check', 'Выполнено: ' + r.t);
      check.dataset.act = 'done';
      check.setAttribute('aria-pressed', r.st === 2 ? 'true' : 'false');
      top.appendChild(check);

      var main = el('div', 'r-main');
      main.appendChild(el('b', null, r.t));
      if (r.note) main.appendChild(el('span', 'r-note', r.note));
      var chips = el('div', 'r-chips');
      var st = btn('r-st', STATUS[r.st]);
      st.dataset.act = 'status';
      st.dataset.st = r.st;
      st.setAttribute('aria-label', 'Статус «' + STATUS[r.st] + '», сменить');
      chips.appendChild(st);
      if (r.who === 'Я') {
        var me = btn('r-who', 'Я');
        me.insertBefore(el('i'), me.firstChild);
        me.dataset.act = 'drop';
        me.setAttribute('aria-label', 'Отказаться от задачи «' + r.t + '»');
        chips.appendChild(me);
      } else if (r.who) {
        var who = el('span', 'r-who', r.who);
        who.insertBefore(el('i'), who.firstChild);
        chips.appendChild(who);
      } else {
        var take = btn('r-take', 'Взять');
        take.insertBefore(icon('user-plus'), take.firstChild);
        take.dataset.act = 'take';
        take.setAttribute('aria-label', 'Взять себе задачу «' + r.t + '»');
        chips.appendChild(take);
      }
      chips.appendChild(el('span', 'r-by', 'общее · ' + r.by));
      main.appendChild(chips);
      top.appendChild(main);
      var more = el('span', 'r-more');
      more.appendChild(icon('dots'));
      top.appendChild(more);
      row.appendChild(top);

      var bottom = el('div', 'r-bottom');
      var up = small('r-move', 'chev-up', 'Поднять выше');
      up.dataset.act = 'up';
      up.disabled = i === 0;
      var down = small('r-move', 'down', 'Опустить ниже');
      down.dataset.act = 'down';
      down.disabled = i === room.length - 1;
      bottom.appendChild(up);
      bottom.appendChild(down);
      r.re.forEach(function (x, k) {
        var re = btn('r-re' + (x[2] ? ' is-mine' : ''));
        re.dataset.act = 're';
        re.dataset.k = k;
        re.setAttribute('aria-pressed', x[2] ? 'true' : 'false');
        re.setAttribute('aria-label', x[0] + ' ' + x[1]);
        re.appendChild(el('em', null, x[0]));
        re.appendChild(document.createTextNode(x[1]));
        bottom.appendChild(re);
      });
      var react = small('r-react', 'smile-plus', 'Поставить реакцию');
      react.dataset.act = 'react';
      bottom.appendChild(react);
      var tools = el('span', 'r-tools');
      tools.appendChild(icon('clip'));
      var com = el('span', null, r.com ? String(r.com) : null);
      com.insertBefore(icon('msg'), com.firstChild);
      tools.appendChild(com);
      bottom.appendChild(tools);
      row.appendChild(bottom);
      rList.appendChild(row);
    });
  };
  rList.addEventListener('click', function (e) {
    var act = e.target.closest('[data-act]');
    if (!act) return;
    var i = +act.closest('.r-task').dataset.i;
    var r = room[i];
    var a = act.dataset.act;
    var moved = -1;
    if (a === 'done' || a === 'status') {
      r.st = a === 'status' ? (r.st + 1) % 3 : r.st === 2 ? (r.who ? 1 : 0) : 2;
      if (r.st === 2) toast('Группа увидит, что задача готова');
    } else if (a === 'take') {
      r.who = 'Я';
      if (!r.st) r.st = 1;
      toast('Задача ваша — остальные это видят');
    } else if (a === 'drop') {
      r.who = '';
    } else if (a === 'up' || a === 'down') {
      moved = a === 'up' ? i - 1 : i + 1;
      room[i] = room[moved];
      room[moved] = r;
    } else if (a === 're') {
      var x = r.re[+act.dataset.k];
      x[1] += x[2] ? -1 : 1;
      x[2] = !x[2];
      if (!x[1]) r.re.splice(+act.dataset.k, 1);
    } else {
      // Новая реакция — первая из тех, что вы ещё не ставили
      var next = REACTIONS.filter(function (em) {
        return !r.re.some(function (y) { return y[0] === em && y[2]; });
      })[0];
      if (!next) return;
      var have = r.re.filter(function (y) { return y[0] === next; })[0];
      if (have) { have[1]++; have[2] = true; } else r.re.push([next, 1, true]);
    }
    renderRoom();
    if (moved >= 0) pop(rList.children[moved]);
  });
  $('[data-r="add"]').addEventListener('click', function () {
    rSheet.hidden = !rSheet.hidden;
    if (!rSheet.hidden) rInput.focus({ preventScroll: true });
  });
  rSheet.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = rInput.value.trim();
    if (!text) { rInput.focus({ preventScroll: true }); return; }
    rInput.value = '';
    rSheet.hidden = true;
    room.unshift({ t: cap(text), st: 0, who: '', by: 'вы', com: 0, re: [] });
    renderRoom();
    rList.scrollTop = 0;
    pop(rList.firstChild);
    toast('Задача появилась у всей комнаты');
  });
  rSheet.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') rSheet.hidden = true;
  });
  $('[data-r="code"]').addEventListener('click', function () {
    try {
      if (navigator.clipboard) navigator.clipboard.writeText('TF4R2M').catch(function () {});
    } catch (err) { /* буфер недоступен — подсказку всё равно покажем */ }
    toast('Код TF4R2M скопирован — отправьте его группе');
  });

  /* ── Виджет ────────────────────────────────────────────────────────── */

  // Виджет расписания: группа, сегодняшняя дата и ближайшая пара.
  // Под каждые обои — свои цвета частей, как их подбирает приложение.
  // Выбранный руками цвет части сильнее подобранного и переживает смену обоев.
  var WALLS = [
    { bg: '#1c1c1f', card: '#2d2d32', text: '#f2f2f5', num: '#cbbcff' },
    { bg: '#26163a', card: '#3a2752', text: '#f6efff', num: '#e2b6ff' },
    { bg: '#fff3e2', card: '#f5dcc1', text: '#4a2a12', num: '#e48f5c' }
  ];
  var home = $('[data-scr="widget"]');
  var wBox = $('[data-w="box"]');
  var wall = 0;
  var part = 'bg';
  var own = {};
  // Цифра на плашке номера пары — тёмная на светлом, белая на тёмном
  var ink = function (hex) {
    var n = parseInt(hex.slice(1), 16);
    return (n >> 16) * .299 + (n >> 8 & 255) * .587 + (n & 255) * .114 > 150 ? '#1b1622' : '#fff';
  };
  var swatches = [].slice.call(root.querySelectorAll('.h-swatches button'));
  var paint = function () {
    ['bg', 'card', 'text', 'num'].forEach(function (p) {
      wBox.style.setProperty('--w-' + p, own[p] || WALLS[wall][p]);
    });
    wBox.style.setProperty('--w-ink', ink(own.num || WALLS[wall].num));
    swatches.forEach(function (s) {
      s.setAttribute('aria-pressed', (own[part] || '') === s.dataset.c ? 'true' : 'false');
    });
  };
  // Сначала виджет показывает пару, которая идёт или будет следующей;
  // нажатие листает сегодняшние пары по кругу
  var wPair = 0;
  var upcoming = function () {
    var pairs = pairsOf(group, todayIdx);
    for (var i = 0; i < pairs.length; i++) if (minutes(SLOTS[pairs[i][0]][1]) > NOW) return i;
    return 0;
  };
  var renderWidget = function () {
    $('[data-w="title"]').textContent = GROUPS[group] + ', ' + today.getDate() + ' ' + MONTH_OF[today.getMonth()] + ', ' + WD[today.getDay()];
    var pairs = pairsOf(group, todayIdx);
    var p = pairs[wPair % (pairs.length || 1)];
    $('[data-w="empty"]').hidden = !!p;
    wBox.querySelector('.w-time').hidden = !p;
    wBox.querySelector('.w-card').hidden = !p;
    if (!p) return;
    $('[data-w="num"]').textContent = p[0];
    $('[data-w="time"]').textContent = SLOTS[p[0]].join(' - ');
    $('[data-w="name"]').textContent = p[1];
    $('[data-w="type"]').textContent = p[2];
    $('[data-w="room"]').textContent = 'ауд. ' + p[4];
  };
  wBox.addEventListener('click', function () {
    if (!pairsOf(group, todayIdx).length) return;
    wPair++;
    renderWidget();
    pop(wBox.querySelector('.w-card'));
  });
  var parts = [].slice.call(root.querySelectorAll('.h-parts button'));
  parts.forEach(function (b) {
    b.addEventListener('click', function () {
      part = b.dataset.part;
      parts.forEach(function (o) {
        o.classList.toggle('is-on', o === b);
        o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
      });
      paint();
    });
  });
  swatches.forEach(function (s) {
    s.addEventListener('click', function () {
      if (s.dataset.c) own[part] = s.dataset.c;
      else delete own[part];
      paint();
      pop(wBox);
    });
  });
  $('[data-w="wall"]').addEventListener('click', function () {
    wall = (wall + 1) % WALLS.length;
    home.dataset.wall = wall;
    paint();
    toast(Object.keys(own).length ? 'Обои новые, ваши цвета остались' : 'Виджет подстроился под обои');
  });

  /* ── Ассистент ─────────────────────────────────────────────────────── */

  var aiLog = $('[data-ai="log"]');
  var aiForm = $('[data-ai="form"]');
  var aiInput = aiForm.querySelector('input');
  var mic = $('[data-ai="mic"]');
  var busy = false;

  // Помним только последние сообщения — лента не должна расти бесконечно
  var say = function (node) {
    aiLog.appendChild(node);
    while (aiLog.children.length > 6) aiLog.removeChild(aiLog.firstChild);
    pop(node);
    return node;
  };
  var typing = function () {
    var n = el('div', 'msg msg-bot is-typing');
    n.setAttribute('aria-label', 'Ассистент печатает');
    for (var i = 0; i < 3; i++) n.appendChild(el('span'));
    return say(n);
  };
  var taskCard = function (t) {
    var card = btn('msg-card');
    card.dataset.go = 'tasks';
    card.dataset.id = t.id;
    card.setAttribute('aria-label', 'Открыть задачу «' + t.title + '»');
    card.style.setProperty('--c', CAT[t.cat]);
    card.appendChild(el('i', 't-bar'));
    var body = el('span');
    body.appendChild(el('b', null, t.title));
    var tags = el('span', 'tags');
    tags.appendChild(el('i', null, due(t)));
    tags.appendChild(el('i', 'cat', t.cat));
    if (t.hot) tags.appendChild(el('i', 'hot', 'Важно'));
    body.appendChild(tags);
    card.appendChild(body);
    card.appendChild(icon('right'));
    return card;
  };
  var answer = function (t) {
    var when = t.off === null ? '' : ' ' + onDay(t.off) + (t.time ? ' в ' + t.time : '');
    var msg = el('div', 'msg msg-bot', 'Задача «' + t.title + '» добавлена' + when);
    msg.appendChild(taskCard(t));
    return msg;
  };
  var greet = function () {
    aiLog.textContent = '';
    say(el('div', 'msg msg-bot', 'Привет! Я помогу разложить дела по задачам в TimeFlow. Расскажи, что нужно сделать?'));
  };
  greet();
  say(el('div', 'msg msg-me', 'Поставь задачу по информатике на 17:00'));
  say(answer(tasks[2]));

  var ask = function (phrase) {
    phrase = phrase.trim();
    if (!phrase || busy) return;
    busy = true;
    say(el('div', 'msg msg-me', phrase));
    var dots = typing();
    later(function () {
      dots.remove();
      say(answer(add(parse(phrase))));
      busy = false;
    }, 800);
  };
  aiForm.addEventListener('submit', function (e) {
    e.preventDefault();
    ask(aiInput.value);
    aiInput.value = '';
  });
  [].forEach.call(root.querySelectorAll('[data-say]'), function (b) {
    b.addEventListener('click', function () { ask(b.textContent); });
  });
  $('[data-ai="clear"]').addEventListener('click', function () {
    if (!busy) greet();
  });

  // Микрофон: полторы секунды «слушает», потом отправляет фразу
  var VOICE = ['Позвонить старосте завтра в 12', 'Купить тетради сегодня', 'Лабораторная по физике в четверг'];
  var spoken = 0;
  mic.addEventListener('click', function () {
    if (busy || mic.classList.contains('is-on')) return;
    mic.classList.add('is-on');
    aiInput.placeholder = 'Слушаю…';
    later(function () {
      mic.classList.remove('is-on');
      aiInput.placeholder = 'Сообщение...';
      ask(VOICE[spoken++ % VOICE.length]);
    }, 1500);
  });

  // Силлабус: файл уходит в чат, в ответ — сколько дедлайнов нашлось
  $('[data-ai="syllabus"]').addEventListener('click', function () {
    if (busy) return;
    busy = true;
    var file = el('div', 'msg msg-me msg-file');
    file.appendChild(icon('file'));
    var name = el('span', null, 'Силлабус_осень.pdf');
    name.appendChild(el('small', null, '2,4 МБ'));
    file.appendChild(name);
    say(file);
    var dots = typing();
    later(function () {
      dots.remove();
      var msg = el('div', 'msg msg-bot', 'Нашёл в силлабусе ');
      var count = el('b', null, '0');
      msg.appendChild(count);
      msg.appendChild(document.createTextNode(' дедлайнов на семестр. Ближайшие:'));
      var list = el('ul', 'msg-found');
      var dec15 = new Date(today.getFullYear(), 11, 15);
      if (dec15 < today) dec15.setFullYear(dec15.getFullYear() + 1);
      [['Коллоквиум по матанализу', 9], ['Контрольная по экономике', 23], ['Курсовая', offsetOf(dec15)]]
        .sort(function (a, b) { return a[1] - b[1]; })
        .forEach(function (d) {
          var li = el('li', null, d[0]);
          li.appendChild(el('span', null, label(d[1])));
          list.appendChild(li);
        });
      msg.appendChild(list);
      say(msg);
      var n = 0;
      var step = function () {
        count.textContent = String(++n);
        if (n < 14) later(step, 45);
        else busy = false;
      };
      later(step, 200);
    }, 1100);
  });

  /* ── Телеграм ──────────────────────────────────────────────────────── */

  var gLog = $('[data-g="log"]');
  var gForm = $('[data-g="form"]');
  var gInput = gForm.querySelector('input');
  var tg = function (text, who, t) {
    var msg = el('div', 'g-msg g-' + who, text);
    msg.appendChild(el('time', null, '10:52'));
    if (t) {
      var open = btn('g-open', 'Открыть в TimeFlow');
      open.dataset.go = 'tasks';
      open.dataset.id = t.id;
      msg.appendChild(open);
    }
    gLog.appendChild(msg);
    while (gLog.children.length > 6) gLog.removeChild(gLog.firstChild);
    pop(msg);
  };
  var botReply = function (t) {
    return (t.off === null ? 'Записал «' + t.title + '» без срока.' : 'Записал «' + t.title + '» ' + onDay(t.off) + (t.time ? ' в ' + t.time : '') + '.') +
      ' Задача уже в TimeFlow.';
  };
  tg('/start', 'me');
  tg('Готово, бот привязан к вашему TimeFlow. Пишите задачи как обычно.', 'bot');
  tg('купить ватман к среде', 'me');
  tg(botReply(tasks[4]), 'bot', tasks[4]);

  gForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = gInput.value.trim();
    if (!text) return;
    gInput.value = '';
    tg(text, 'me');
    later(function () {
      var t = add(parse(text));
      tg(botReply(t), 'bot', t);
    }, 650);
  });

  /* ── Всё, что зависит от задач, перерисовывается разом ─────────────── */

  var changed = function () {
    renderTasks();
    renderPlanner();
  };
  changed();
  renderSchedule();
  renderRoom();
  wPair = upcoming();
  renderWidget();
  paint();

  /* ── Экраны и прокрутка ────────────────────────────────────────────── */

  var steps = [].slice.call(root.querySelectorAll('.fx-step'));
  var order = steps.map(function (s) { return s.dataset.s; });
  var screen = $('.ph-screen');
  var ph = $('.ph');
  var stage = $('.fx-stage');
  var dots = [].slice.call(root.querySelectorAll('.fx-dots button'));
  var screens = {};
  [].forEach.call(root.querySelectorAll('.scr'), function (s) { screens[s.dataset.scr] = s; });
  var current = 'ai';
  var hide = function (node, off) {
    node.inert = off;
    if (off) node.setAttribute('aria-hidden', 'true');
    else node.removeAttribute('aria-hidden');
  };
  Object.keys(screens).forEach(function (k) { hide(screens[k], k !== current); });

  var show = function (name) {
    if (name === current || !screens[name]) return;
    var from = screens[current];
    var to = screens[name];
    screen.style.setProperty('--dir', order.indexOf(name) >= order.indexOf(current) ? 1 : -1);
    if (from.contains(document.activeElement)) document.activeElement.blur();
    from.classList.remove('is-on');
    from.classList.add('is-out');
    hide(from, true);
    to.classList.remove('is-out');
    to.classList.add('is-on');
    hide(to, false);
    setTimeout(function () { if (!from.classList.contains('is-on')) from.classList.remove('is-out'); }, 450);
    steps.forEach(function (s) { s.classList.toggle('is-active', s.dataset.s === name); });
    dots.forEach(function (d) {
      var on = d.dataset.go === name;
      d.classList.toggle('is-on', on);
      if (on) d.setAttribute('aria-current', 'true');
      else d.removeAttribute('aria-current');
    });
    toastEl.classList.remove('is-on');
    sheet.hidden = true;
    rSheet.hidden = true;
    current = name;
  };

  var narrow = matchMedia('(max-width: 900px)');
  var scale = function () { return parseFloat(ph.style.getPropertyValue('--k')) || 1; };

  // Телефон в своём размере 300×630 и уменьшается под окно. На узком
  // экране под ним должен оставаться текст возможности.
  var fit = function () {
    var k = narrow.matches
      ? Math.min((innerHeight - 68 - 250) / 660, (innerWidth - 48) / 300)
      : Math.min(1, (innerHeight - 68 - 60) / 630);
    ph.style.setProperty('--k', Math.max(.5, Math.min(1, k)).toFixed(3));
  };

  // Линия, на которой возможность считается текущей: середина окна, а
  // на узком экране — верхняя часть того, что видно под телефоном
  var line = function () {
    if (!narrow.matches) return innerHeight / 2;
    var bottom = stage.getBoundingClientRect().bottom;
    return bottom + (innerHeight - bottom) * .3;
  };
  var anchor = function (s) {
    var box = s.getBoundingClientRect();
    return narrow.matches ? box.top + 40 : box.top + box.height / 2;
  };
  // Где мы среди возможностей, дробно: 2.5 — ровно между третьей и четвёртой
  var where = function () {
    var y = line();
    var a = steps.map(anchor);
    if (y <= a[0]) return 0;
    for (var i = 0; i < a.length - 1; i++) {
      if (y < a[i + 1]) return i + (y - a[i]) / (a[i + 1] - a[i]);
    }
    return a.length - 1;
  };

  // Переход по нажатию: экран меняется сразу, страница доезжает следом.
  // Пока она едет, промежуточные возможности экран не дёргают.
  var lock = -1;
  var lockTimer = null;
  var goTo = function (name, id) {
    var i = order.indexOf(name);
    if (i < 0) return;
    show(name);
    lock = i;
    clearTimeout(lockTimer);
    lockTimer = setTimeout(function () { lock = -1; onScroll(); }, 1500);
    scrollTo({ top: scrollY + anchor(steps[i]) - line(), behavior: reduced ? 'auto' : 'smooth' });
    if (name === 'tasks' && id) {
      if (filter !== 'all') filters[0].click();
      var item = tList.querySelector('[data-id="' + id + '"]');
      if (item) {
        tList.scrollTop = Math.max(0, item.offsetTop - 60);
        later(function () { pop(item.querySelector('.t-card'), 'is-flash'); }, 350);
      }
    }
  };
  root.addEventListener('click', function (e) {
    var go = e.target.closest('[data-go]');
    if (go) goTo(go.dataset.go, go.dataset.id);
  });
  var release = function () { lock = -1; };
  addEventListener('wheel', release, { passive: true });
  addEventListener('touchstart', release, { passive: true });

  /* Поворот. При прокрутке телефон стоит в спокойном полуобороте и не
     крутится. Под курсором выпрямляется, чтобы было удобно нажимать, и
     только чуть-чуть ходит за мышью. Углы не ставятся сразу, а догоняют
     цель — так поворот мягкий. */
  var aim = { rx: 4, ry: -10, rz: 0 };
  var cur = { rx: 4, ry: -10, rz: 0 };
  var hover = null;
  var touchTimer = null;
  var frame = null;
  var aimAt = function () {
    aim.rx = hover ? -hover.y * 6 : 4;
    aim.ry = hover ? hover.x * 8 : -10;
    aim.rz = 0;
  };
  var tick = function () {
    frame = null;
    var moving = false;
    ['rx', 'ry', 'rz'].forEach(function (p) {
      var d = aim[p] - cur[p];
      if (Math.abs(d) > .02) { cur[p] += d * .14; moving = true; }
      else cur[p] = aim[p];
    });
    ph.style.setProperty('--rx', cur.rx.toFixed(2) + 'deg');
    ph.style.setProperty('--ry', cur.ry.toFixed(2) + 'deg');
    ph.style.setProperty('--rz', cur.rz.toFixed(2) + 'deg');
    ph.style.setProperty('--gx', cur.ry.toFixed(2));
    if (moving) frame = requestAnimationFrame(tick);
  };
  var kick = function () {
    if (reduced) return;
    aimAt();
    if (!frame) frame = requestAnimationFrame(tick);
  };

  // На телефоне при наборе браузер сам подвигает страницу к полю, и это
  // не должно уводить экран. Уводит только настоящая прокрутка — тогда
  // поле теряет фокус.
  var typed = null;
  root.addEventListener('focusin', function (e) {
    if (e.target.matches('.ph input')) typed = { y: scrollY, at: performance.now() };
  });
  root.addEventListener('focusout', function () { typed = null; });

  var scheduled = null;
  var onScroll = function () {
    scheduled = null;
    var i = Math.round(where());
    if (lock === i) lock = -1;
    if (typed && narrow.matches) {
      var far = Math.abs(scrollY - typed.y) > 160 && performance.now() - typed.at > 900;
      if (far) document.activeElement.blur();
      else return;
    }
    if (lock < 0) show(order[i]);
  };
  var soon = function () { if (!scheduled) scheduled = requestAnimationFrame(onScroll); };

  if (!reduced) {
    ph.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var box = ph.getBoundingClientRect();
      hover = { x: (e.clientX - box.left) / box.width - .5, y: (e.clientY - box.top) / box.height - .5 };
      kick();
    });
    ph.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse') return;
      hover = null;
      kick();
    });
    // Пальцем: пока человек трогает экран, телефон стоит ровно
    ph.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      hover = { x: 0, y: 0 };
      kick();
      clearTimeout(touchTimer);
      touchTimer = setTimeout(function () { hover = null; kick(); }, 3000);
    });
  }

  fit();
  onScroll();
  kick();
  addEventListener('scroll', soon, { passive: true });
  addEventListener('resize', function () { fit(); soon(); });
})();
