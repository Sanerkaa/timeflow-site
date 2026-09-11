/* Трёхмерные песочные часы на первом экране.

   Раньше здесь лежал png со знаком. Знак остаётся в разметке и никуда не
   девается: он показывается, пока грузится сцена, и остаётся насовсем, если
   трёхмерность не завелась — нет WebGL, человек попросил не двигать
   страницу, старый браузер. Сцена появляется поверх него и только когда
   готова, поэтому первый экран никогда не бывает пустым.

   Песок здесь не нарисованная анимация, а расчёт. У каждой колбы своя
   сетка столбиков с объёмом песка, песок пересыпается по закону откоса
   (насыпь не может быть круче ~32°), утекает в горловину и падает
   отдельными песчинками. Поэтому при перевороте он ведёт себя как песок:
   в боковом положении струйка замирает, насыпь оползает, а не
   проворачивается целиком вместе с колбой.

   Три.js лежит рядом в vendor, а не берётся из сети: сайт и так открывают
   из России, лишний чужой домен на первом экране — лишний шанс, что часы
   не покажутся вовсе. Подтягивается он динамическим import и только после
   того, как страница догрузилась: 670 КБ не должны стоять в очереди
   перед текстом и снимками экрана.
*/

/* ── Размеры ─────────────────────────────────────────────────────────────

   Всё в условных единицах: половина высоты часов — примерно 1. Ось —
   Y, горловина в нуле, s ниже — расстояние от горловины вдоль оси.

   Профиль колбы взят с фирменного знака: от горловины стенка идёт крутым
   конусом (песок по такой съезжает сам), выше расходится и у самого края
   встаёт почти вертикально — в знаке у стекла тоже прямые боковые
   стороны, а не шар. */
const PROFILE = [
  [0.000, 0.052], [0.070, 0.104], [0.160, 0.182], [0.270, 0.272],
  [0.400, 0.366], [0.540, 0.454], [0.680, 0.528], [0.800, 0.575],
  [0.880, 0.597], [0.920, 0.600],
];

const R = 0.600;   // самый широкий радиус полости
const NECK = 0.052; // радиус горловины
const HY = 0.920;  // от горловины до донца колбы

/* ── Настройки ───────────────────────────────────────────────────────────

   Всё, что имеет смысл крутить руками, собрано здесь. Рядом с каждым
   числом — что оно делает и в каких пределах разумно. Менять можно прямо
   тут, ничего больше не трогая: остальной код читает эти имена.

   Размеры выше (R, NECK, HY) и профиль колбы PROFILE — это уже форма
   часов, а не настройка: их менять стоит вместе с оглядкой на рисунок. */

// Песок
const FILL = 0.46;        // какую долю колбы занимает песок: 0.3 — на треть, 0.6 — почти доверху
const DRAIN_SECONDS = 15; // за сколько секунд пересыпается полная колба
const REPOSE = 0.62;      /* тангенс угла откоса насыпи: 0.5 — 27°, 0.62 — 32°, 0.9 — 42°.
                             Пока сверху сыплется, склон выходит немного круче
                             заданного: насыпь всё время подсыпают, и оползание
                             не успевает довести её до предела. */
const FLOW = 1.1;         // как прытко оползает насыпь: 0.3 — вязко, 1.5 — как вода
const PASSES = 3;         // сколько раз за шаг пересчитывать оползание (дороже всего)
const GRID = 52;          // мелкость сетки столбиков: 36 дешевле, 64 глаже, растёт как квадрат
const THIN = 0.0015;      // тоньше этого слой песка считается отсутствующим
const SMOOTH = 3;         /* сколько раз сглаживать поверхность при отрисовке.
                             Расчёт не трогает, только вид: 0 — как есть, по
                             клеткам; 3 — спад у подошвы растянут на три
                             клетки, и край сходит на ноль незаметно. */

// Песчинки
const GRAIN_COUNT = 16000; // на сколько песчинок делится колба: чем больше, тем ровнее ложится
const GRAINS = 1200;       // сколько песчинок может лететь одновременно
const GRAIN_SIZE = 0.036;  // размер песчинки на вид
const FALL = 3.6;          // ускорение падения

// Движение часов
const SPRING = 44;   // жёсткость пружины переворота: больше — резче
const DAMP = 7.2;    // трение пружины: меньше — сильнее перебег и качание
const WHIRL = 13;    // предел скорости вращения, рад/с (примерно два оборота)
const SLIP = 1.4;    // трение свободного вращения вбок: меньше — дольше крутится
const REST = 1.8;    // сколько секунд пустые часы стоят до самопереворота
const LEAN = 0.38;   // наклон за курсором вбок, радианы
const NOD = 0.24;    // наклон за курсором вверх-вниз
const BOB = 0.03;    // покачивание на месте

const CELL = 2 * R / GRID;

/* Таблица профиля в обе стороны: радиус по высоте и высота по радиусу.
   Нужны обе — первая рисует стекло, вторая говорит, на какой высоте
   столбик песка упирается в стенку воронки. */
const STEPS = 160;
const rByS = new Float32Array(STEPS + 1);
const sByR = new Float32Array(STEPS + 1);

(function buildTables() {
  for (let i = 0; i <= STEPS; i++) rByS[i] = lerpProfile(0, 1, (i / STEPS) * HY);
  for (let i = 0; i <= STEPS; i++) {
    const r = NECK + (R - NECK) * (i / STEPS);
    sByR[i] = lerpProfile(1, 0, r);
  }
})();

/* Линейная протяжка по точкам профиля. from=0 — ищем радиус по высоте,
   from=1 — наоборот. Точек мало, поиск прямым перебором, зато без
   сюрпризов на краях. */
function lerpProfile(from, to, value) {
  const a = from, b = to;
  for (let i = 1; i < PROFILE.length; i++) {
    const p = PROFILE[i - 1], q = PROFILE[i];
    if (value <= q[a] || i === PROFILE.length - 1) {
      const span = q[a] - p[a];
      const t = span > 1e-6 ? Math.min(1, Math.max(0, (value - p[a]) / span)) : 0;
      return p[b] + (q[b] - p[b]) * t;
    }
  }
  return PROFILE[PROFILE.length - 1][b];
}

/* Радиус полости на высоте s от горловины */
function radiusAt(s) {
  const t = Math.min(1, Math.max(0, s / HY)) * STEPS;
  const i = Math.min(STEPS - 1, Math.floor(t));
  return rByS[i] + (rByS[i + 1] - rByS[i]) * (t - i);
}

/* Высота, на которой стенка воронки имеет радиус r, — донце столбика
   в пересыпающей колбе */
function floorAt(r) {
  if (r <= NECK) return 0;
  const t = Math.min(1, (r - NECK) / (R - NECK)) * STEPS;
  const i = Math.min(STEPS - 1, Math.floor(t));
  return sByR[i] + (sByR[i + 1] - sByR[i]) * (t - i);
}

/* ── Цвета под обе темы ──────────────────────────────────────────────── */

const THEMES = {
  light: {
    frame: 0x6f4694, sand: 0xc3a9dd, glass: 0xf3edfc,
    sky: 0xe6dcf6, ground: 0xb492d2, key: 1.45, rim: 0.5, hemi: 0.3, bounce: 0.4,
    env: ['#ece4f6', '#c6b4dd', '#6d5988'], shade: 0.15, exposure: 1,
  },
  dark: {
    frame: 0x8058ad, sand: 0xc2a4e2, glass: 0xe4d8f5,
    sky: 0x6d52a0, ground: 0x241b35, key: 1.7, rim: 1.05, hemi: 0.5, bounce: 0.75,
    env: ['#453263', '#241a36', '#0d0a15'], shade: 0.34, exposure: 1.05,
  },
};

/* ── Запуск ──────────────────────────────────────────────────────────── */

const host = document.querySelector('.hero-art');
if (host && !matchMedia('(prefers-reduced-motion: reduce)').matches && hasWebGL()) {
  /* Библиотеку тянем после того, как страница догрузилась, и в свободную
     минуту браузера: часы — украшение первого экрана, и ни одного
     мегабайта до того, как показан текст и картинки, они не стоят.

     Ждать появления коробки на экране незачем: она и так на первом
     экране, и только на главной. А вот считать сцену в неактивной
     вкладке нельзя — за это отвечает play() ниже, он же и покажет часы,
     когда на вкладку вернутся. */
  const soon = () => {
    if (window.requestIdleCallback) requestIdleCallback(load, { timeout: 1500 });
    else setTimeout(load, 200);
  };
  if (document.readyState === 'complete') soon();
  else addEventListener('load', soon);
}

function hasWebGL() {
  try {
    const probe = document.createElement('canvas');
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch (e) {
    return false;
  }
}

async function load() {
  let THREE;
  try {
    THREE = await import('./vendor/three.module.min.js');
  } catch (e) {
    return; // остаётся знак из разметки
  }
  try {
    build(THREE);
  } catch (e) {
    /* Если сцена почему-то не собралась, показываем знак и молчим: часы
       на первом экране — украшение, ронять из-за них страницу нельзя */
    host.classList.remove('is-3d');
    if (window.console) console.warn('Часы не запустились:', e);
  }
}

/* ── Сцена ───────────────────────────────────────────────────────────── */

function build(THREE) {
  const canvas = document.createElement('canvas');
  canvas.className = 'hero-glass';
  canvas.setAttribute('aria-hidden', 'true');
  (host.querySelector('.hero-stage') || host).appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
  camera.position.set(0, 0.06, 4.7);

  /* Часы висят в двух вложенных группах, и это не для красоты.

     Внешняя (spinner) поворачивает их вбок и наклоняет за курсором —
     это движения «от экрана», и они должны считаться в мировых осях.
     Внутренняя (clock) переворачивает.

     Будь всё в одной группе, после переворота на 180° ось поворота
     вбок смотрела бы в другую сторону, и часы крутились бы зеркально:
     тянешь вправо — они влево. Внешняя группа от переворота не
     зависит, поэтому направление всегда одно.

     Подсветка и тень остаются в сцене и не крутятся. */
  const spinner = new THREE.Group();
  scene.add(spinner);
  const clock = new THREE.Group();
  spinner.add(clock);

  let theme = THEMES[document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'];
  renderer.toneMappingExposure = theme.exposure;

  /* Свет: главный сверху слева, встречный сзади справа — он обводит
     стекло по краю, без него колбы сливаются с фоном */
  const key = new THREE.DirectionalLight(0xffffff, theme.key);
  key.position.set(2.4, 3.1, 2.6);
  const rim = new THREE.DirectionalLight(0xd9b8ff, theme.rim);
  rim.position.set(-2.6, 0.7, -2.0);
  const hemi = new THREE.HemisphereLight(theme.sky, theme.ground, theme.hemi);
  const bounce = new THREE.DirectionalLight(0xb794e6, theme.bounce);
  bounce.position.set(-0.8, -2.4, 1.8);
  scene.add(key, rim, hemi, bounce);

  /* Окружение для отражений собираем сами из градиента: без него у стекла
     нечего отражать и оно выглядит серым пластиком */
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  const applyEnv = () => {
    const tex = new THREE.CanvasTexture(gradientCanvas(theme.env));
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const next = pmrem.fromEquirectangular(tex);
    tex.dispose();
    if (envRT) envRT.dispose();
    envRT = next;
    scene.environment = next.texture;
  };
  applyEnv();

  /* ── Стекло ─────────────────────────────────────────────────────────

     Одна замкнутая оболочка, а не две стенки: так у колбы есть внутренняя
     и внешняя поверхность, и блики ложатся как на стекле.

     Стекло здесь обычное прозрачное, без преломления. Преломление
     (transmission) в three считается по отдельному проходу отрисовки, и в
     этом проходе лежит только сцена — страницы в нём нет, а за часами в
     сцене пусто. Преломлять оказывалось нечего, и колбы выходили молочной
     заливкой, за которой не видно песка. Обычная прозрачность
     смешивается с тем, что уже нарисовано: с песком и со страницей
     сквозь холст. */
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: theme.glass,
    metalness: 0,
    roughness: 0.05,
    ior: 1.46,
    envMapIntensity: 1.45,
    transparent: true,
    opacity: 0.24,
    specularIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    side: THREE.DoubleSide,
    /* Стекло не пишет глубину: иначе передняя стенка закрывала бы
       заднюю и песок за ней, а так обе стенки складываются, и у колбы
       появляется толщина */
    depthWrite: false,
  });
  const glass = new THREE.Mesh(new THREE.LatheGeometry(glassProfile(THREE), 84), glassMat);
  clock.add(glass);

  /* ── Рамка ──────────────────────────────────────────────────────────
     Две пластины со скруглёнными углами и четыре стойки по углам. В знаке
     рамка — скруглённый прямоугольник, и спереди эта сборка читается так
     же, а в повороте у неё появляется объём. */
  const frameMat = new THREE.MeshPhysicalMaterial({
    color: theme.frame, roughness: 0.34, metalness: 0.12,
    clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 0.75,
  });

  const plate = new THREE.ExtrudeGeometry(roundedSquare(THREE, 0.665, 0.25), {
    depth: 0.042, bevelEnabled: true, bevelSize: 0.016, bevelThickness: 0.016,
    bevelSegments: 3, curveSegments: 10,
  });
  plate.rotateX(-Math.PI / 2);
  plate.center();

  const top = new THREE.Mesh(plate, frameMat);
  top.position.y = HY + 0.05;
  const bottom = new THREE.Mesh(plate, frameMat);
  bottom.position.y = -(HY + 0.05);
  clock.add(top, bottom);

  const post = new THREE.CapsuleGeometry(0.028, 2 * (HY + 0.04), 4, 12);
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Mesh(post, frameMat);
    leg.position.set(i < 2 ? 0.47 : -0.47, 0, i % 2 ? 0.47 : -0.47);
    clock.add(leg);
  }

  /* ── Тень ───────────────────────────────────────────────────────────
     Мягкое тёмное пятно под часами — то же, что у знака-картинки давал
     drop-shadow. Без него часы висят в пустоте. */
  const shadeTex = new THREE.CanvasTexture(radialCanvas('rgba(58,32,80,.9)', 'rgba(58,32,80,0)'));
  shadeTex.colorSpace = THREE.SRGBColorSpace;
  const shade = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 0.44),
    new THREE.MeshBasicMaterial({
      map: shadeTex, transparent: true, opacity: theme.shade, depthWrite: false,
    })
  );
  shade.position.set(0, -1.1, -0.2);
  scene.add(shade);

  /* ── Песок ──────────────────────────────────────────────────────────

     Каждая колба разбита на сетку столбиков, в столбике хранится объём
     песка. Поверхность считается из объёма и формы колбы: в пересыпающей
     песок лежит на стенке воронки, в принимающей — на донце.

     Такое хранение (объём, а не высота) нужно ровно для переворота:
     объём от поворота не меняется, а донце у столбика становится другим —
     и насыпь сама оказывается там, где должна. */
  const CELLS = GRID * GRID;
  const inside = new Uint8Array(CELLS);
  const px = new Float32Array(CELLS);
  const pz = new Float32Array(CELLS);
  const cFloor = new Float32Array(CELLS);  // высота стенки воронки
  const cCap = new Float32Array(CELLS);    // сколько песка столбик держит
  const edge = new Uint8Array(CELLS);      // столбик у самого стекла

  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const c = j * GRID + i;
      const x = -R + (i + 0.5) * CELL;
      const z = -R + (j + 0.5) * CELL;
      const r = Math.hypot(x, z);
      px[c] = x; pz[c] = z;
      inside[c] = r <= R - 0.004 ? 1 : 0;
      cFloor[c] = floorAt(r);
      cCap[c] = Math.max(0.02, HY - cFloor[c]);
    }
  }
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const c = j * GRID + i;
      if (!inside[c]) continue;
      const out = (i === 0 || !inside[c - 1]) || (i === GRID - 1 || !inside[c + 1]) ||
        (j === 0 || !inside[c - GRID]) || (j === GRID - 1 || !inside[c + GRID]);
      edge[c] = out ? 1 : 0;
    }
  }

  /* Наклон стенки воронки по клеткам. Нужен для освещения дна насыпи, а
     форма колбы не меняется — значит считается один раз. */
  const fdx = new Float32Array(CELLS);
  const fdz = new Float32Array(CELLS);
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const c = j * GRID + i;
      if (!inside[c]) continue;
      const left = i > 0 && inside[c - 1] ? c - 1 : c;
      const right = i < GRID - 1 && inside[c + 1] ? c + 1 : c;
      const back = c >= GRID && inside[c - GRID] ? c - GRID : c;
      const front = c + GRID < CELLS && inside[c + GRID] ? c + GRID : c;
      fdx[c] = (cFloor[right] - cFloor[left]) / (((right - left) || 1) * CELL);
      fdz[c] = (cFloor[front] - cFloor[back]) / ((((front - back) / GRID) || 1) * CELL);
    }
  }

  let bulbVolume = 0;
  for (let c = 0; c < CELLS; c++) if (inside[c]) bulbVolume += cCap[c] * CELL * CELL;
  const sandVolume = bulbVolume * FILL;

  const vol = [new Float32Array(CELLS), new Float32Array(CELLS)];
  fillLevel(vol[0], sandVolume);

  /* Насыпать «под уровень»: ищем высоту, при которой ровная поверхность
     даёт нужный объём. Так часы в начале выглядят так же, как через
     минуту после переворота, а не как нарочно уложенная горка. */
  function fillLevel(target, volume) {
    let lo = 0, hi = HY;
    for (let step = 0; step < 40; step++) {
      const mid = (lo + hi) / 2;
      let sum = 0;
      for (let c = 0; c < CELLS; c++) {
        if (inside[c]) sum += Math.max(0, mid - cFloor[c]) * CELL * CELL;
      }
      if (sum < volume) lo = mid; else hi = mid;
    }
    for (let c = 0; c < CELLS; c++) {
      target[c] = inside[c] ? Math.max(0, (lo + hi) / 2 - cFloor[c]) * CELL * CELL : 0;
    }
  }

  /* Поверхность песка — сетка из тех же столбиков. Клетки, целиком
     лежащие внутри колбы, известны заранее; какие из них рисовать,
     решается на каждом кадре — см. shape(). */
  const vertexOf = new Int32Array(CELLS).fill(-1);
  let vertices = 0;
  for (let c = 0; c < CELLS; c++) if (inside[c]) vertexOf[c] = vertices++;

  const quads = [];
  for (let j = 0; j < GRID - 1; j++) {
    for (let i = 0; i < GRID - 1; i++) {
      const a = j * GRID + i, b = a + 1, d = a + GRID, e = d + 1;
      if (!inside[a] || !inside[b] || !inside[d] || !inside[e]) continue;
      quads.push(a, b, d, e);
    }
  }
  const quadCount = quads.length / 4;
  const cells = new Int32Array(quads);

  /* Песок непрозрачный, и это важно: стекло рисуется после него и с ним
     смешивается. Край насыпи держится не на прозрачности, а на сетке. */
  const sandMat = new THREE.MeshStandardMaterial({
    color: theme.sand, roughness: 0.88, metalness: 0.02,
    side: THREE.DoubleSide, envMapIntensity: 0.5,
  });
  /* Крупинки: ровная заливка читается как пластилин. Рябь считается от
     положения точки на самой поверхности, поэтому держится за песок, а не
     ползёт по экрану. */
  sandMat.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 vGrain;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vGrain = transformed;'
    );
    shader.fragmentShader = 'varying vec3 vGrain;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n' +
      '  vec3 gq = floor(vGrain * 190.0);\n' +
      '  float gs = fract(sin(dot(gq, vec3(12.9898, 78.233, 37.719))) * 43758.5453);\n' +
      '  diffuseColor.rgb *= 0.86 + 0.28 * gs;'
    );
  };

  const sandMesh = [0, 1].map(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(quadCount * 6), 1));
    g.setDrawRange(0, 0);
    const mesh = new THREE.Mesh(g, sandMat);
    mesh.frustumCulled = false;
    clock.add(mesh);
    return mesh;
  });

  /* Дно насыпи: в пересыпающей колбе это стенка воронки, в принимающей —
     донце. Клетки те же, что у верхней поверхности, поэтому указатель
     на них общий — свой набор треугольников для дна не нужен. */
  const sandFloor = [0, 1].map((ch) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
    g.setIndex(sandMesh[ch].geometry.index);
    g.setDrawRange(0, 0);
    const mesh = new THREE.Mesh(g, sandMat);
    mesh.frustumCulled = false;
    clock.add(mesh);
    return mesh;
  });

  /* Летящие песчинки. Их немного: это струйка, а не вся масса песка —
     масса живёт в столбиках. */
  const grainPos = new Float32Array(GRAINS * 3);
  const grainVel = new Float32Array(GRAINS * 3);
  const grainAge = new Float32Array(GRAINS).fill(-1);
  const grainGeo = new THREE.BufferGeometry();
  grainGeo.setAttribute('position', new THREE.BufferAttribute(grainPos, 3));
  grainGeo.setDrawRange(0, 0);
  const grainMat = new THREE.PointsMaterial({
    size: GRAIN_SIZE, sizeAttenuation: true, alphaTest: 0.45,
    map: grainTexture(THREE), color: theme.sand,
  });
  const stream = new THREE.Points(grainGeo, grainMat);
  stream.frustumCulled = false;
  clock.add(stream);

  const grainVolume = sandVolume / GRAIN_COUNT;
  let pending = 0;

  /* ── Пересыпание ────────────────────────────────────────────────────

     Один шаг расчёта. Порядок важен: сначала песок оползает под текущим
     наклоном, потом утекает в горловину, потом летят песчинки. */

  const holes = [];
  for (let c = 0; c < CELLS; c++) if (inside[c] && cFloor[c] < 0.001) holes.push(c);

  /* Соседи для оползания — восемь, вместе с наклонными.

     С четырьмя песок мог течь только по осям сетки, и насыпь вырастала
     не конусом, а четырёхгранной пирамидой: угол откоса соблюдался по
     осям, а по диагонали склон выходил круче ровно в корень из двух
     (замерено: 0.82 против 0.59 при заданных 0.62). Отсюда и ребра, и
     ступени на склонах. С восемью соседями растекание почти одинаково
     во все стороны, и насыпь получается конусом.

     Расстояние до наклонного соседа больше в корень из двух — и порог
     угла откоса, и порция песка считаются с поправкой на это. */
  const STEP_I = [1, -1, 0, 0, 1, 1, -1, -1];
  const STEP_J = [0, 0, 1, -1, 1, -1, 1, -1];
  const STEP_D = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

  const phi = new Float32Array(CELLS);   // высота с поправкой на уклон
  const surf = new Float32Array(CELLS);  // поверхность песка для отрисовки
  const thick = new Float32Array(CELLS); // толщина слоя в столбике
  const soft = new Float32Array(CELLS);  // она же, сглаженная по соседям
  const blur = new Float32Array(CELLS);  // промежуточный слой сглаживания
  const brimX = new Float32Array(CELLS); // куда сдвинута вершина на границе
  const brimZ = new Float32Array(CELLS);
  const area = CELL * CELL;
  let grains = 0;                        // сколько песчинок сейчас в полёте

  function simulate(dt, gx, gy, gz) {
    for (let ch = 0; ch < 2; ch++) slide(ch, gx, gy, gz);
    drain(dt, gy);
    fly(dt, gx, gy, gz);
  }

  /* Оползание. Песок перетекает к соседу, если между ними круче угла
     откоса. Уклон считается не по высоте, а по ней же с поправкой: к
     высоте добавлена боковая часть силы тяжести, поделённая на осевую, —
     поэтому в наклонённых часах насыпь съезжает набок, а в лежащих на
     боку почти не двигается. */
  function slide(ch, gx, gy, gz) {
    const v = vol[ch];
    const dir = ch === 0 ? 1 : -1;
    const gAx = gy * dir;
    const draining = gAx < 0;
    const axial = Math.abs(gAx);
    /* Боковой наклон входит в уклон делением на осевую часть силы
       тяжести — и у лежащих на боку часов это деление на почти ноль.
       Поэтому наклон ограничен сверху: больше 45° уклон всё равно
       означает «песок едет вниз», а без ограничения он превращался в
       перекос на всю колбу и сваливал песок к стеклу целыми столбиками.

       По той же причине в боковом положении почти останавливается и сам
       поток: в жизни песок там держат стенки колбы, а в расчёте стенок
       поперёк оси нет — есть только столбики. */
    const lean = Math.min(1.1, 1 / Math.max(0.3, axial));
    const flow = 0.65 * Math.min(1, axial * 1.6);
    const limit = REPOSE * CELL;

    for (let c = 0; c < CELLS; c++) {
      if (!inside[c]) continue;
      const t = v[c] / area;
      phi[c] = (draining ? cFloor[c] + t : t) - (gx * px[c] + gz * pz[c]) * lean;
    }

    for (let pass = 0; pass < PASSES; pass++) {
      for (let j = 0; j < GRID; j++) {
        for (let i = 0; i < GRID; i++) {
          const c = j * GRID + i;
          if (!inside[c] || v[c] <= 0) continue;
          for (let k = 0; k < 8; k++) {
            const ni = i + STEP_I[k];
            const nj = j + STEP_J[k];
            if (ni < 0 || ni >= GRID || nj < 0 || nj >= GRID) continue;
            const d = nj * GRID + ni;
            if (!inside[d]) continue;
            const over = phi[c] - phi[d] - limit * STEP_D[k];
            if (over <= 0) continue;
            /* В столбик, набитый до стекла, песок не лезет. Без этой
               проверки перетекание шло по одним высотам и не знало, что
               у кромки колба сужается и держать там нечего: песок
               толкали туда и дальше, столбики набивались выше
               возможного, а потом торчали шипами. */
            const space = cCap[d] * area - v[d];
            if (space <= 0) continue;
            const move = Math.min(v[c] * 0.15, over * area * flow / STEP_D[k], space);
            if (move <= 0) continue;
            v[c] -= move; v[d] += move;
            phi[c] -= move / area; phi[d] += move / area;
          }
        }
      }
    }

    /* Столбик не может быть выше, чем позволяет колба: у стекла она
       сужается, и там столбик держит сущие капли. Лишнее отдаётся тому
       соседу, у кого есть место, и ровно столько, сколько влезает.

       Раньше лишнее уходило «самому низкому соседу» — при боковом
       перекосе это оказывался сосед ещё ближе к стеклу, где места ещё
       меньше. Столбики у кромки набивались в десятки раз выше
       возможного и потом торчали шипами. Что не влезло никуда, остаётся
       на месте: на следующем шаге соседи расступятся, а объём песка при
       этом не теряется. */
    for (let round = 0; round < 2; round++) {
      for (let c = 0; c < CELLS; c++) {
        if (!inside[c] || v[c] <= 0) continue;
        const room = cCap[c] * area;
        if (v[c] <= room) continue;
        const i = c % GRID, j = (c - i) / GRID;
        let best = -1, most = 0;
        for (let k = 0; k < 8; k++) {
          const ni = i + STEP_I[k], nj = j + STEP_J[k];
          if (ni < 0 || ni >= GRID || nj < 0 || nj >= GRID) continue;
          const d = nj * GRID + ni;
          if (!inside[d]) continue;
          const free = cCap[d] * area - v[d];
          if (free > most) { most = free; best = d; }
        }
        if (best < 0) continue;
        const extra = Math.min(v[c] - room, most);
        v[c] -= extra;
        v[best] += extra;
      }
    }
  }

  /* Утекание в горловину. Скорость не зависит от того, сколько песка
     осталось сверху, — этим песочные часы и отмеряют время (закон
     Беверлоо). Зависит она от наклона и от того, есть ли над горловиной
     песок: если там пусто, струйка ждёт, пока насыпь оползёт. */
  function drain(dt, gy) {
    if (Math.abs(gy) < 0.05) return;
    const v = vol[gy < 0 ? 0 : 1];
    const want = (sandVolume / DRAIN_SECONDS) * Math.sqrt(Math.abs(gy)) * dt;
    const share = want / holes.length;
    for (let n = 0; n < holes.length; n++) {
      const take = Math.min(v[holes[n]], share);
      if (take <= 0) continue;
      v[holes[n]] -= take;
      pending += take;
    }
  }

  /* Песчинки. Каждая уносит свой объём и возвращает его в ту ячейку, где
     упала, — поэтому песка не становится ни больше, ни меньше. Живут они
     в начале массива вплотную: отлетавшая заменяется последней, и рисовать
     можно одним куском, без дырок. */
  function fly(dt, gx, gy, gz) {
    while (pending >= grainVolume && grains < GRAINS) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * NECK * 0.7;
      const k = grains * 3;
      /* Разбег внутри шага расчёта. Без него все песчинки одного шага
         вылетают из одной точки с одной скоростью и падают ровными
         рядами — струйка выглядит лесенкой. */
      const head = Math.random();
      const speed = 0.12 + Math.random() * 0.22;
      grainPos[k] = Math.cos(a) * rr;
      grainPos[k + 1] = (gy < 0 ? -0.03 : 0.03) + gy * speed * head * 0.03;
      grainPos[k + 2] = Math.sin(a) * rr;
      grainVel[k] = gx * 0.2 + (Math.random() - 0.5) * 0.12;
      grainVel[k + 1] = gy * speed;
      grainVel[k + 2] = gz * 0.2 + (Math.random() - 0.5) * 0.12;
      grainAge[grains] = 0;
      grains++;
      pending -= grainVolume;
    }

    for (let n = grains - 1; n >= 0; n--) {
      const k = n * 3;
      grainVel[k] += gx * FALL * dt;
      grainVel[k + 1] += gy * FALL * dt;
      grainVel[k + 2] += gz * FALL * dt;
      grainPos[k] += grainVel[k] * dt;
      grainPos[k + 1] += grainVel[k + 1] * dt;
      grainPos[k + 2] += grainVel[k + 2] * dt;
      grainAge[n] += dt;

      let x = grainPos[k];
      const y = grainPos[k + 1];
      let z = grainPos[k + 2];
      const dir = y >= 0 ? 1 : -1;
      const ch = dir > 0 ? 0 : 1;
      const s = Math.abs(y);

      // Стенка колбы: за неё песчинку не пускаем, боковую скорость гасим
      const wall = s < 0.07 ? NECK * 0.85 : radiusAt(s) * 0.965;
      const r = Math.hypot(x, z);
      if (r > wall && r > 1e-5) {
        const f = wall / r;
        grainPos[k] = x *= f;
        grainPos[k + 2] = z *= f;
        grainVel[k] *= 0.3;
        grainVel[k + 2] *= 0.3;
      }

      const c = cellAt(x, z);
      const t = vol[ch][c] / area;
      const gAx = gy * dir;
      const top = gAx < 0 ? cFloor[c] + t : HY - t;
      const landed = gAx < 0 ? s <= top + 0.012 : s >= top - 0.012;

      if (landed || grainAge[n] > 6 || s > HY + 0.06) {
        settle(ch, c, grainVolume);
        const last = (grains - 1) * 3;
        grainPos[k] = grainPos[last];
        grainPos[k + 1] = grainPos[last + 1];
        grainPos[k + 2] = grainPos[last + 2];
        grainVel[k] = grainVel[last];
        grainVel[k + 1] = grainVel[last + 1];
        grainVel[k + 2] = grainVel[last + 2];
        grainAge[n] = grainAge[grains - 1];
        grains--;
      }
    }
  }

  /* Упавшая песчинка ложится не в одну ячейку, а мазком три на три.

     Иначе видно, как заполняется колба: своя порция песка у песчинки
     невелика, но в пересчёте на один столбик это заметная ступенька, и
     насыпь росла на глазах квадратиками. Мазком та же порция
     размазывается по девяти столбикам, и ступенька выходит на порядок
     ниже. Сумма веса — единица, песка не прибавляется и не убывает; то,
     что не влезло у стенки, остаётся в самой ячейке. */
  const SPOT_I = [0, 1, -1, 0, 0, 1, 1, -1, -1];
  const SPOT_J = [0, 0, 0, 1, -1, 1, -1, 1, -1];
  const SPOT_W = [0.25, 0.125, 0.125, 0.125, 0.125, 0.0625, 0.0625, 0.0625, 0.0625];

  function settle(ch, c, amount) {
    const v = vol[ch];
    const i = c % GRID, j = (c - i) / GRID;
    let placed = 0;
    for (let k = 0; k < 9; k++) {
      const ni = i + SPOT_I[k], nj = j + SPOT_J[k];
      if (ni < 0 || ni >= GRID || nj < 0 || nj >= GRID) continue;
      const d = nj * GRID + ni;
      if (!inside[d]) continue;
      v[d] += amount * SPOT_W[k];
      placed += SPOT_W[k];
    }
    if (placed < 1) v[c] += amount * (1 - placed);
  }

  function cellAt(x, z) {
    let i = Math.min(GRID - 1, Math.max(0, Math.floor((x + R) / CELL)));
    let j = Math.min(GRID - 1, Math.max(0, Math.floor((z + R) / CELL)));
    let c = j * GRID + i;
    // Съехали на кромку — идём к середине, пока не попадём в колбу
    for (let n = 0; n < 6 && !inside[c]; n++) {
      x *= 0.9; z *= 0.9;
      i = Math.min(GRID - 1, Math.max(0, Math.floor((x + R) / CELL)));
      j = Math.min(GRID - 1, Math.max(0, Math.floor((z + R) / CELL)));
      c = j * GRID + i;
    }
    return inside[c] ? c : holes[0];
  }

  /* ── Поверхность песка в геометрию ──────────────────────────────────── */

  const brim = new Uint8Array(CELLS);

  function shape(ch, gy) {
    const v = vol[ch];
    const dir = ch === 0 ? 1 : -1;
    const draining = gy * dir < 0;
    const face = draining ? 1 : -1;
    const geo = sandMesh[ch].geometry;
    const pos = geo.attributes.position.array;
    const nor = geo.attributes.normal.array;
    const idx = geo.index.array;
    const low = sandFloor[ch].geometry;
    const lowPos = low.attributes.position.array;
    const lowNor = low.attributes.normal.array;

    for (let c = 0; c < CELLS; c++) {
      if (!inside[c]) continue;
      /* Толщина зажата вместимостью столбика. Это страховка: расчёт и
         так не даёт столбику перерасти колбу, но если однажды даст,
         пусть это будет ошибка в полмиллиметра, а не шип сквозь
         стекло. */
      thick[c] = Math.min(v[c] / area, cCap[c]);
      brim[c] = 0;
    }

    /* Сглаживание толщины — только для отрисовки, объёмы не трогаются.

       Нужно оно вот для чего: у подошвы горки склон круче клетки. Песок
       сходит на ноль быстрее, чем сетка успевает это показать, и граница
       рисовалась рядом треугольников в клетку шириной. Сглаживание
       растягивает спад на две-три клетки — перепад между соседями у
       края падает в разы, и край сходит на ноль незаметно.

       Проходов несколько (SMOOTH): один спад почти не растягивает, три
       дают заметно более гладкий край и слегка закругляют вершину
       горки — песку это идёт. */
    for (let c = 0; c < CELLS; c++) soft[c] = thick[c];

    for (let pass = 0; pass < SMOOTH; pass++) {
      for (let c = 0; c < CELLS; c++) {
        if (!inside[c]) continue;
        const i = c % GRID;
        const l = i > 0 && inside[c - 1] ? c - 1 : c;
        const r = i < GRID - 1 && inside[c + 1] ? c + 1 : c;
        const b = c >= GRID && inside[c - GRID] ? c - GRID : c;
        const f = c + GRID < CELLS && inside[c + GRID] ? c + GRID : c;
        blur[c] = (2 * soft[c] + soft[l] + soft[r] + soft[b] + soft[f]) / 6;
      }
      for (let c = 0; c < CELLS; c++) if (inside[c]) soft[c] = blur[c];
    }

    for (let c = 0; c < CELLS; c++) {
      if (!inside[c]) continue;
      surf[c] = draining ? cFloor[c] + soft[c] : HY - soft[c];
    }

    /* Граница песка.

       Толщина слоя задана в серединах клеток, а граница насыпи проходит
       между ними — там, где слой сходит на ноль. Раньше граница шла по
       клеткам: клетка либо в сетке, либо нет. Отсюда зубцы по подошве
       горки и волнистая линия у стекла.

       Теперь вершина пустой клетки, у которой есть сосед с песком,
       сдвигается вдоль отрезка к этому соседу ровно туда, где толщина
       переходит через порог. Точка перехода считается по значениям в
       обеих серединах, поэтому едет плавно, а не прыгает по клеткам —
       граница получается кривой, и поверхность сходит в ноль ровно на
       ней.

       Это заодно убрало две прежние заплатки: поднятие кромки на уровень
       песка и вынос её к стенке по радиусу. Обе делали то же самое, но
       грубо, и от них оставалась то полка выше горловины, то бахрома. */
    for (let c = 0; c < CELLS; c++) {
      if (!inside[c] || soft[c] >= THIN) continue;
      const i = c % GRID;
      let sx = 0, sz = 0, hits = 0;
      for (let k = 0; k < 4; k++) {
        if (k === 0 && i === GRID - 1) continue;
        if (k === 1 && i === 0) continue;
        const d = k === 0 ? c + 1 : k === 1 ? c - 1 : k === 2 ? c + GRID : c - GRID;
        if (d < 0 || d >= CELLS || !inside[d]) continue;
        if (soft[d] < THIN) continue;
        // Доля пути от соседа с песком до этой клетки, на которой слой
        // становится тоньше порога
        const span = soft[d] - soft[c];
        const u = span > 1e-9 ? Math.min(1, Math.max(0, (soft[d] - THIN) / span)) : 1;
        sx += px[d] + (px[c] - px[d]) * u;
        sz += pz[d] + (pz[c] - pz[d]) * u;
        hits++;
      }
      if (!hits) continue;
      brim[c] = 1;
      brimX[c] = sx / hits;
      brimZ[c] = sz / hits;
      /* На границе толщина ровно пороговая. В пересыпающей колбе
         донцем служит стенка воронки, и её высоту надо взять уже на
         новом месте вершины, а не в середине клетки. */
      surf[c] = draining
        ? floorAt(Math.hypot(brimX[c], brimZ[c])) + THIN
        : HY - THIN;
    }

    for (let c = 0; c < CELLS; c++) {
      if (!inside[c]) continue;
      const i = c % GRID;
      const left = i > 0 && inside[c - 1] ? c - 1 : c;
      const right = i < GRID - 1 && inside[c + 1] ? c + 1 : c;
      const back = c >= GRID && inside[c - GRID] ? c - GRID : c;
      const front = c + GRID < CELLS && inside[c + GRID] ? c + GRID : c;
      const spanX = (right - left) * CELL || CELL;
      const spanZ = ((front - back) / GRID) * CELL || CELL;
      const dx = (surf[right] - surf[left]) / spanX;
      const dz = (surf[front] - surf[back]) / spanZ;

      let x = px[c], z = pz[c];
      if (brim[c]) {
        // Вершина на границе песка стоит не в середине клетки
        x = brimX[c];
        z = brimZ[c];
      } else if (edge[c]) {
        /* Крайний столбик дотягиваем до стекла: сетка кончается за
           полклетки до стенки, и без этого между песком и стеклом
           оставалась бы щель */
        const r = Math.hypot(x, z);
        const w = radiusAt(surf[c]) * 0.99;
        if (w > r && r > 1e-5) { x *= w / r; z *= w / r; }
      }

      const vi = vertexOf[c] * 3;
      pos[vi] = x;
      pos[vi + 1] = dir * surf[c];
      pos[vi + 2] = z;

      const nx = -face * dx, ny = dir * face, nz = -face * dz;
      const len = Math.hypot(nx, ny, nz) || 1;
      nor[vi] = nx / len;
      nor[vi + 1] = ny / len;
      nor[vi + 2] = nz / len;

      /* Дно. На линии песка (brim) верх и низ — одна и та же точка:
         толщина там ноль, и масса замыкается без боковой стенки. */
      if (brim[c]) {
        lowPos[vi] = x;
        lowPos[vi + 1] = pos[vi + 1];
        lowPos[vi + 2] = z;
      } else {
        lowPos[vi] = px[c];
        lowPos[vi + 1] = dir * (draining ? cFloor[c] : HY);
        lowPos[vi + 2] = pz[c];
      }

      // Дно смотрит в другую сторону, чем верх: прочь от массы песка
      const bx = face * (draining ? fdx[c] : 0);
      const bz = face * (draining ? fdz[c] : 0);
      const by = -dir * face;
      const blen = Math.hypot(bx, by, bz) || 1;
      lowNor[vi] = bx / blen;
      lowNor[vi + 1] = by / blen;
      lowNor[vi + 2] = bz / blen;
    }

    /* Клетка рисуется, если песок есть во всех четырёх углах. Углы на
       линии песка (brim) тоже считаются песком — они и держат край. */
    let at = 0;
    for (let q = 0; q < quadCount; q++) {
      const k = q * 4;
      const a = cells[k], b = cells[k + 1], d = cells[k + 2], e = cells[k + 3];
      if (!wet(a) || !wet(b) || !wet(d) || !wet(e)) continue;
      idx[at++] = vertexOf[a]; idx[at++] = vertexOf[d]; idx[at++] = vertexOf[b];
      idx[at++] = vertexOf[b]; idx[at++] = vertexOf[d]; idx[at++] = vertexOf[e];
    }
    geo.setDrawRange(0, at);
    low.setDrawRange(0, at);

    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.index.needsUpdate = true;
    low.attributes.position.needsUpdate = true;
    low.attributes.normal.needsUpdate = true;
  }

  function wet(c) {
    return brim[c] !== 0 || soft[c] >= THIN;
  }

  /* ── Переворот, наклон, покачивание ─────────────────────────────────

     Переворот — не проигрывание анимации, а пружина: у угла есть
     скорость, жёсткость и трение. Поэтому часы доворачиваются с
     перебегом и мягко встают на место, а если крутить их мышью, они
     продолжают вращение по инерции и притягиваются к ближайшему
     ровному положению — как настоящие в подставке.

     Сила тяжести для песка берётся из поворота группы: вниз по миру
     переводится в свои координаты часов. Отсюда сразу всё остальное —
     струйка замирает в боковом положении и меняет направление после
     переворота, а насыпь слегка съезжает вместе с наклоном за курсором. */

  /* Предел скорости вращения (WHIRL в настройках) нужен из-за того, как
     считается скорость протяжки: путь мыши делится на время кадра, и
     если вся протяжка пришла одним событием, получались сотни радиан в
     секунду — часы уходили в юлу на десяток оборотов от одного движения
     рукой. */
  let flip = 0, flipVel = 0, target = 0, still = 0;
  let yaw = 0, yawVel = 0, yawDelta = 0;
  let leanX = 0, leanY = 0, wantX = 0, wantY = 0;
  let dragging = false, dragDelta = 0, dragged = 0;
  let lastY = 0, lastX = 0, byFinger = false;

  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* Протяжка. Вбок — свободное вращение вокруг своей оси: часы можно
     развернуть и разглядеть с любой стороны, и они докручиваются по
     инерции, пока не остановит трение. Вверх-вниз — переворот, он
     притягивается к ровному положению пружиной.

     Пальцем крутится только вбок: вертикаль остаётся странице, иначе
     часы на первом экране перехватывали бы прокрутку. Это уже описано
     в css как touch-action: pan-y — браузер отдаёт нам боковые жесты, а
     на вертикальных присылает pointercancel. */
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    byFinger = e.pointerType !== 'mouse';
    // Мышью — чтобы протяжка не выделяла текст первого экрана
    if (!byFinger) e.preventDefault();
    dragged = 0; dragDelta = 0; yawDelta = 0;
    lastY = e.clientY;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    dragged += Math.abs(dx) + Math.abs(dy);

    // Тянем вправо — часы поворачиваются вправо: ближняя к нам сторона
    // уезжает вправо вместе с курсором
    const spin = (dx / Math.max(80, canvas.clientWidth)) * Math.PI * 2.2;
    yaw += spin;
    yawDelta += spin;

    if (byFinger) return;
    const turn = (dy / Math.max(80, canvas.clientHeight)) * Math.PI * 1.8;
    flip += turn;
    dragDelta += turn;
  });

  const drop = (tookOver) => {
    if (!dragging) return;
    dragging = false;
    // Прокрутку страницы забрал браузер — часы тут ни при чём
    if (tookOver) return;
    // Дёрнули и отпустили, почти не сдвинув — это нажатие, а не вращение
    if (dragged < 5 && !byFinger) {
      target = Math.round(flip / Math.PI) * Math.PI + Math.PI;
      return;
    }
    const whirl = Math.max(-WHIRL, Math.min(WHIRL, flipVel));
    target = Math.round((flip + whirl * 0.22) / Math.PI) * Math.PI;
  };
  canvas.addEventListener('pointerup', () => drop(false));
  canvas.addEventListener('pointercancel', () => drop(true));

  // На телефоне переворачивает касание — но только касание, а не
  // протяжка, которой часы разворачивают вбок
  canvas.addEventListener('click', () => {
    if (fine || dragged > 6) return;
    if (Math.abs(flipVel) < 0.5) target = Math.round(flip / Math.PI) * Math.PI + Math.PI;
  });

  /* ── Наведение ──────────────────────────────────────────────────────

     Курсор над часами определяется не событиями pointerenter и
     pointerleave, а своей проверкой: попадает ли точка в рамку холста.

     Причина — событиям входа тут верить нельзя. Их присылают не только
     когда курсор приехал: холст с часами появляется под неподвижным
     курсором сам, уже после загрузки; меняется размер окна — снова
     вход; в некоторых окружениях они идут пачками просто так. Часы от
     этого переворачивались сами, и не по одному разу.

     Своя проверка ловит именно то, что нужно: курсор был снаружи, потом
     оказался внутри и проехал по часам хотя бы несколько пикселей.
     Одно наведение — один переворот; пока часы ещё крутятся, переворот
     не засчитывается и ждёт следующего движения, а не требует убрать
     курсор и навести заново.

     Рамку холста держим в памяти и забываем при прокрутке и изменении
     размера: читать её на каждое движение мыши — это заставлять браузер
     пересчитывать раскладку десятки раз в секунду. */
  const REACH = 6;
  let box = null, within = false, used = false, travel = 0, wasAt = null;
  const forget = () => { box = null; };
  addEventListener('scroll', forget, { passive: true });

  if (fine) {
    addEventListener('mousemove', (e) => {
      wantY = (e.clientX / innerWidth - 0.5) * LEAN;
      wantX = (e.clientY / innerHeight - 0.5) * NOD;

      if (!box) box = canvas.getBoundingClientRect();
      const now = e.clientX >= box.left && e.clientX <= box.right &&
        e.clientY >= box.top && e.clientY <= box.bottom;

      if (!now) { within = false; used = false; travel = 0; wasAt = null; return; }
      if (!within) { within = true; travel = 0; wasAt = [e.clientX, e.clientY]; return; }

      if (wasAt) travel += Math.hypot(e.clientX - wasAt[0], e.clientY - wasAt[1]);
      wasAt = [e.clientX, e.clientY];
      if (used || travel < REACH || dragging) return;

      if (Math.abs(flipVel) < 0.5 && Math.abs(target - flip) < 0.1) {
        target += Math.PI;
        used = true;
      }
    }, { passive: true });
  }

  /* ── Тема ───────────────────────────────────────────────────────────
     Цвета не подменяются рывком, а переезжают за треть секунды: смена
     темы на странице тоже плавная, и часы не должны мигать. */

  const paint = (t) => ({
    frame: new THREE.Color(t.frame), sand: new THREE.Color(t.sand),
    glass: new THREE.Color(t.glass), sky: new THREE.Color(t.sky),
    ground: new THREE.Color(t.ground),
  });

  let was = paint(theme), now = paint(theme), mix = 1;

  function setTheme(name) {
    const next = THEMES[name] || THEMES.light;
    if (next === theme) return;
    was = {
      frame: frameMat.color.clone(), sand: sandMat.color.clone(),
      glass: glassMat.color.clone(), sky: hemi.color.clone(),
      ground: hemi.groundColor.clone(),
    };
    was.key = key.intensity; was.rim = rim.intensity; was.hemi = hemi.intensity;
    was.bounce = bounce.intensity;
    was.shade = shade.material.opacity; was.exposure = renderer.toneMappingExposure;
    theme = next;
    now = paint(theme);
    mix = 0;
    applyEnv();
  }

  document.addEventListener('tf:theme', (e) => setTheme(e.detail));

  /* ── Кадр ───────────────────────────────────────────────────────────── */

  /* Пересыпалось всё — часы переворачиваются сами, немного постояв.
     Настоящие так не умеют, но на первом экране сайта часы, которые
     больше не идут, — это остановившееся время: пришедший через минуту
     увидит мёртвую картинку вместо песка. Пауза перед переворотом
     нужна, чтобы было видно, что песок кончился, а не чтобы часы
     вертелись без остановки. */
  function spent(gy) {
    const v = vol[gy < 0 ? 0 : 1];
    let left = 0;
    for (let c = 0; c < CELLS; c++) left += v[c];
    return left < sandVolume * 0.004;
  }

  const down = new THREE.Vector3();
  const flipped = new THREE.Quaternion();
  const STEP = 1 / 90;
  let raf = 0, prev = 0, acc = 0, time = 0, onScreen = true, shown = false;

  function tick(stamp) {
    raf = requestAnimationFrame(tick);
    /* Шаг времени зажат с двух сторон. Сверху — чтобы после возврата на
       вкладку песок не прыгнул на секунду вперёд. Снизу это не
       перестраховка: метка кадра иногда приходит раньше предыдущей (в
       том числе когда кадры идут из двух источников), и на отрицательном
       шаге пружина переворота не тормозит, а раскачивается — часы
       улетали в бесконечное вращение за полсекунды. */
    const dt = prev ? Math.min(0.05, Math.max(0, (stamp - prev) / 1000)) : 1 / 60;
    prev = stamp;
    time += dt;

    if (dragging) {
      // Пока тянут, скорость берём из самого движения мыши
      flipVel = dt > 0 ? Math.max(-WHIRL, Math.min(WHIRL, dragDelta / dt)) : 0;
      yawVel = dt > 0 ? Math.max(-WHIRL, Math.min(WHIRL, yawDelta / dt)) : 0;
      dragDelta = 0;
      yawDelta = 0;
    } else {
      flipVel += (SPRING * (target - flip) - DAMP * flipVel) * dt;
      flip += flipVel * dt;
      /* Вращение вбок ничего не притягивает: у песочных часов нет
         «правильной» стороны, и они просто докручиваются, пока не
         остановит трение. */
      yawVel *= Math.exp(-SLIP * dt);
      yaw += yawVel * dt;
      if (Math.abs(yawVel) < 0.002) yawVel = 0;
    }

    const ease = Math.min(1, dt * 5);
    leanX += (wantX - leanX) * ease;
    leanY += (wantY - leanY) * ease;

    spinner.rotation.y = yaw + leanY + Math.sin(time * 0.32) * 0.06 + flipVel * 0.03;
    spinner.rotation.x = leanX;
    clock.rotation.x = flip;
    clock.rotation.z = Math.sin(time * 0.5) * 0.018;
    clock.position.y = Math.sin(time * 0.75) * BOB;

    if (mix < 1) {
      mix = Math.min(1, mix + dt * 3);
      frameMat.color.lerpColors(was.frame, now.frame, mix);
      sandMat.color.lerpColors(was.sand, now.sand, mix);
      grainMat.color.copy(sandMat.color);
      glassMat.color.lerpColors(was.glass, now.glass, mix);
      hemi.color.lerpColors(was.sky, now.sky, mix);
      hemi.groundColor.lerpColors(was.ground, now.ground, mix);
      key.intensity = was.key + (theme.key - was.key) * mix;
      rim.intensity = was.rim + (theme.rim - was.rim) * mix;
      hemi.intensity = was.hemi + (theme.hemi - was.hemi) * mix;
      bounce.intensity = was.bounce + (theme.bounce - was.bounce) * mix;
      shade.material.opacity = was.shade + (theme.shade - was.shade) * mix;
      renderer.toneMappingExposure = was.exposure + (theme.exposure - was.exposure) * mix;
    }

    /* Куда для песка «вниз» в своих координатах часов. Берём поворот с
       учётом внешней группы: вращение вбок песку безразлично (он вокруг
       той же оси, что и сила тяжести), а наклон за курсором — нет, и
       насыпь от него слегка съезжает. */
    spinner.updateMatrixWorld(true);
    clock.getWorldQuaternion(flipped);
    down.set(0, -1, 0).applyQuaternion(flipped.invert());

    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 4) {
      simulate(STEP, down.x, down.y, down.z);
      acc -= STEP;
      steps++;
    }
    if (acc > STEP * 4) acc = 0;

    const settled = Math.abs(flipVel) < 0.2 && Math.abs(target - flip) < 0.05 &&
      Math.abs(yawVel) < 0.2;
    if (!dragging && settled && grains === 0) {
      still += dt;
      if (still > REST && spent(down.y)) { target += Math.PI; still = 0; }
    } else {
      still = 0;
    }

    shape(0, down.y);
    shape(1, down.y);
    grainGeo.attributes.position.needsUpdate = true;
    grainGeo.setDrawRange(0, grains);

    renderer.render(scene, camera);

    if (!shown) { shown = true; host.classList.add('is-3d'); }
  }

  const play = () => {
    if (raf || !onScreen || document.hidden) return;
    prev = 0;
    raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  };

  function resize() {
    forget();
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else addEventListener('resize', resize);
  resize();

  /* Часы считаются каждый кадр, поэтому за экраном и в неактивной
     вкладке расчёт останавливается совсем — это не украшение, а
     обещание не греть телефон в кармане */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
      if (onScreen) play(); else stop();
    }, { rootMargin: '120px' }).observe(canvas);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else play();
  });

  play();
}

/* ── Заготовки ───────────────────────────────────────────────────────── */

/* Обвод стекла для вращения: донце со скруглённой кромкой, профиль колбы,
   перехват, вторая колба зеркально. Точки идут снизу вверх — LatheGeometry
   вращает такой обвод вокруг оси Y. */
function glassProfile(THREE) {
  /* Скругление кромки маленькое нарочно: на него уходит расстояние от
     дна полости (где лежит песок) до плоского дна стекла, и при большом
     скруглении насыпь висела над донцем в воздухе. */
  const lip = 0.022;
  const wall = 0.02;
  const rim = R + wall;
  const end = HY + lip;
  const pts = [new THREE.Vector2(0, -end)];

  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(rim - lip + Math.sin(a) * lip, -end + (1 - Math.cos(a)) * lip));
  }
  for (let i = 1; i <= 44; i++) {
    const s = HY * (1 - i / 44);
    pts.push(new THREE.Vector2(radiusAt(s) + wall, -s));
  }
  for (let i = 1; i <= 44; i++) {
    const s = HY * (i / 44);
    pts.push(new THREE.Vector2(radiusAt(s) + wall, s));
  }
  for (let i = 5; i >= 0; i--) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(rim - lip + Math.sin(a) * lip, end - (1 - Math.cos(a)) * lip));
  }
  pts.push(new THREE.Vector2(0, end));
  return pts;
}

/* Пластина рамки — скруглённый прямоугольник, как в знаке */
function roundedSquare(THREE, half, radius) {
  const h = half, r = radius;
  const s = new THREE.Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return s;
}

/* Окружение для отражений: небо сверху, пол снизу и мягкое световое
   пятно слева вверху — чтобы по стеклу шёл блик, а не серая заливка */
function gradientCanvas(stops) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, stops[0]);
  grad.addColorStop(0.55, stops[1]);
  grad.addColorStop(1, stops[2]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);

  const spot = g.createRadialGradient(70, 26, 2, 70, 26, 58);
  spot.addColorStop(0, 'rgba(255,255,255,.55)');
  spot.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = spot;
  g.fillRect(0, 0, 256, 128);
  return c;
}

function radialCanvas(inner, outer) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.22, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
}

/* Песчинка: кружок с подсветкой слева сверху. Плоский круг в полёте
   выглядит пылью, а с подсветкой — крупинкой. */
function grainTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(26, 24, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(236,226,248,.95)');
  grad.addColorStop(0.85, 'rgba(190,170,215,.5)');
  grad.addColorStop(1, 'rgba(190,170,215,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
