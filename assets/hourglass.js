import { HEIGHT, RADIUS, DEPTH, REPOSE, radiusAt, channelAt, COLLAR, createBulbSamples,
  solveLevel, surfacePotential, flowRate } from './hourglass-physics.js';

// The glass is continuous, not a stack of cells. Sand is a closed implicit
// solid cut by a gravity-aligned granular surface, with a conserved volume.
const host = document.querySelector('[data-hourglass]');
// In the scroll section the page scroll turns the clock, not the pointer.
const scrollMode = !!(host && host.dataset && 'scroll' in host.dataset);
const section = scrollMode ? host.closest('.glass-scroll') : null;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const COLORS = {
  light: { frame: 0x75458f, sand: 0xc0a0d3, glass: 0xeaddf2, thick: 0xb99bd0, ambient: 0.95 },
  dark: { frame: 0x9d71be, sand: 0xd0b0e6, glass: 0xc5abdf, thick: 0x8d6aaf, ambient: 1.15 },
};

if (host && !reduced.matches) {
  const start = () => load();
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
}

async function load() {
  try {
    const THREE = await import('./vendor/three.module.min.js');
    build(THREE);
  } catch (error) {
    host.classList.remove('is-3d');
    host.querySelector('.hero-glass')?.remove();
    console.warn('TimeFlow: 3D hourglass unavailable', error);
  }
}

function build(T) {
  const stage = host.querySelector('.hero-stage') || host;
  const coarse = matchMedia('(pointer: coarse), (max-width: 760px)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'hero-glass';
  canvas.setAttribute('role', 'img');
  if (scrollMode) {
    canvas.setAttribute('aria-label', 'Песочные часы TimeFlow переворачиваются при прокрутке страницы.');
  } else {
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Песочные часы. Вращайте перетаскиванием или стрелками. После отпускания часы возвращаются лицевой стороной.');
  }
  stage.appendChild(canvas);
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true,
    powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.4 : 1.75));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(32, 1, 0.1, 30);
  const clock = new T.Group();
  scene.add(clock);
  const front = new T.Quaternion(); // Upright, facing the viewer.

  const frameMat = new T.MeshPhysicalMaterial({ color: COLORS.light.frame,
    roughness: 0.30, metalness: 0.08, clearcoat: 0.7 });
  const glassMat = new T.MeshPhysicalMaterial({ color: COLORS.light.glass,
    roughness: 0.12, metalness: 0.0, transparent: true, opacity: 0.15,
    side: T.DoubleSide, depthWrite: false, clearcoat: 1, specularIntensity: 0.8 });
  const key = new T.DirectionalLight(0xfff6ff, 2.4);
  key.position.set(-3, 4, 5);
  const rim = new T.DirectionalLight(0xe1c0ff, 1.6);
  rim.position.set(3, 1, -3);
  const ambient = new T.HemisphereLight(0xf4eaff, 0x695074, 0.95);
  scene.add(key, rim, ambient);

  // Rounded, pinched purple outline of the actual mark; no rectangular cage.
  const profile = [];
  profile.push(new T.Vector2(0, -HEIGHT));
  for (let i = 0; i <= 160; i++) {
    const y = -HEIGHT + 2 * HEIGHT * i / 160;
    profile.push(new T.Vector2(radiusAt(y) + 0.013, y));
  }
  profile.push(new T.Vector2(0, HEIGHT));
  const glass = new T.Mesh(new T.LatheGeometry(profile, coarse ? 64 : 96), glassMat);
  glass.scale.z = DEPTH;
  glass.renderOrder = 3;
  clock.add(glass);

  // Solid glass around the bore: a closed ring between the outer wall and
  // the narrow channel. Instead of a costly transmission pass, the glass is
  // shaded by its thickness and a Fresnel rim, fading out where it thins.
  const collarMat = new T.ShaderMaterial({ transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new T.Color(COLORS.light.thick) } },
    vertexShader: `
    varying vec3 vNormal, vView;
    varying float vY;
    void main() {
      vY = position.y;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`, fragmentShader: `
    uniform vec3 uColor;
    varying vec3 vNormal, vView;
    varying float vY;
    void main() {
      float t = clamp(abs(vY) / ${COLLAR.toFixed(3)}, 0.0, 1.0);
      float thick = 1.0 - t*t*(3.0-2.0*t);
      float facing = abs(dot(normalize(vNormal), normalize(vView)));
      float rim = pow(1.0 - facing, 1.6);
      // Thick glass reads by contrast: a lilac body, a dark refraction band
      // towards the edge and a bright glint right at it, as in a real neck.
      float band = smoothstep(0.18, 0.4, rim) * (1.0 - smoothstep(0.5, 0.7, rim));
      float glint = smoothstep(0.6, 0.85, rim);
      vec3 color = mix(uColor, uColor * vec3(0.62, 0.52, 0.7), band);
      color = mix(color, vec3(1.0), glint);
      gl_FragColor = vec4(color, min(0.95, thick * (0.6 + 0.3*band + 0.4*glint)));
      #include <colorspace_fragment>
    }` });
  const collarProfile = [];
  for (let i = 0; i <= 60; i++) {
    const y = -COLLAR + 2 * COLLAR * i / 60;
    collarProfile.push(new T.Vector2(radiusAt(y) + 0.013, y));
  }
  for (let i = 60; i >= 0; i--) {
    const y = -COLLAR + 2 * COLLAR * i / 60;
    collarProfile.push(new T.Vector2(channelAt(y) + 0.008, y));
  }
  collarProfile.push(collarProfile[0].clone());
  const collar = new T.Mesh(new T.LatheGeometry(collarProfile, coarse ? 48 : 72), collarMat);
  collar.scale.z = DEPTH;
  collar.renderOrder = 4;
  clock.add(collar);

  // Round end caps and rounded meridian rails, rather than a deep
  // extruded silhouette: the glass remains circular from every direction.
  const capProfile = [
    new T.Vector2(0, 0.936), new T.Vector2(0.46, 0.936),
    new T.Vector2(0.52, 0.938), new T.Vector2(0.552, 0.947),
    new T.Vector2(0.571, 0.963), new T.Vector2(0.577, 0.981),
    new T.Vector2(0.571, 0.999), new T.Vector2(0.552, 1.013),
    new T.Vector2(0.52, 1.018), new T.Vector2(0, 1.018),
  ];
  const capGeometry = new T.LatheGeometry(capProfile, coarse ? 64 : 96);
  for (const sign of [-1, 1]) {
    const cap = new T.Mesh(capGeometry, frameMat);
    if (sign < 0) cap.rotation.x = Math.PI;
    clock.add(cap);
    const points = [];
    for (let i = 0; i <= 100; i++) {
      const y = -0.974 + 1.948 * i / 100;
      points.push(new T.Vector3(sign * (radiusAt(Math.min(HEIGHT, Math.abs(y))) + 0.052), y, 0));
    }
    const rail = new T.TubeGeometry(new T.CatmullRomCurve3(points), 160, 0.042, 12, false);
    clock.add(new T.Mesh(rail, frameMat));
  }
  const samples = createBulbSamples(coarse ? 1024 : 1536);
  const total = samples.volume * 0.47;
  const volumes = [total, 0];
  const scratch = new Float32Array(samples.points.length);
  const up = new T.Vector3(0, 1, 0);
  const realUp = up.clone();
  const slopes = [-0.10, REPOSE];
  const levels = [0, -2];
  const inverse = new T.Quaternion();
  const gravityTurn = new T.Quaternion();
  const stepTurn = new T.Quaternion();
  const identity = new T.Quaternion();
  const eye = new T.Vector3();
  const light = new T.Vector3();

  const uniforms = {
    uEye: { value: eye }, uUp: { value: up },
    uLevel: { value: new T.Vector2(0, -2) },
    uFlow: { value: new T.Vector2(0, 0) },
    uSlope: { value: new T.Vector2(-0.1, REPOSE) },
    uColor: { value: new T.Color(COLORS.light.sand) },
    uLight: { value: light },
  };
  // Analytic intersection instead of a height-grid mesh: no stair-step edges,
  // cracks, or sudden columns when the clock is turned onto its side.
  const sandMat = new T.ShaderMaterial({ uniforms, vertexShader: `
    varying vec3 vLocal;
    void main() {
      vLocal = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`, fragmentShader: `
    precision highp float;
    varying vec3 vLocal;
    uniform mat4 projectionMatrix, modelViewMatrix;
    uniform vec3 uEye, uUp, uColor, uLight;
    uniform vec2 uLevel, uSlope, uFlow;
    float radius(float y) {
      float t = clamp(abs(y) / 0.73, 0.0, 1.0);
      float cap = max(0.0, (abs(y) - 0.86) / 0.08);
      return 0.045 + 0.475 * t*t*(3.0-2.0*t) - 0.055*cap*cap;
    }
    float smin(float a, float b, float k) {
      float m = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
      return mix(b, a, m) - k*m*(1.0-m);
    }
    // Narrow bore through the thick glass of the neck (channelAt in physics).
    float channel(float y) {
      float t = clamp(abs(y) / 0.2, 0.0, 1.0);
      return radius(y) - 0.035 * (1.0 - t*t*(3.0-2.0*t));
    }
    float field(vec3 p) {
      float h = dot(p, uUp);
      float radial = sqrt(max(0.0, dot(p,p)-h*h) + 0.0009);
      float r = length(p.xz);
      // Sand touches the glass (the bore in the neck, the rails elsewhere);
      // without the offset a gap showed between sand and frame.
      float wall = (r - channel(p.y) - 0.008) * 0.45;
      float envelope = max(wall, abs(p.y)-0.94);
      // Union of two continuous chamber fields. Switching the distance at
      // y=0 could step OVER the sand in the other bulb at oblique angles.
      // While sand runs, the draining bulb stays full down through the neck
      // and leaves it as one thin solid thread along gravity, as in a real
      // hourglass: no flat cut at the neck and no drop hanging out of it.
      float plugU = -p.y - 0.008*uFlow.x;
      float plugL =  p.y - 0.008*uFlow.y;
      float upper = max(min(-p.y, plugU), (h + uSlope.x*radial - uLevel.x) / 1.2);
      float lower = max(min( p.y, plugL), (h + uSlope.y*radial - uLevel.y) / 1.2);
      float axis = sqrt(max(0.0, dot(p,p) - h*h));
      // Leaves the bore at its full width and thins out gradually below it.
      float thinU = mix(0.017, 0.0055, smoothstep(0.0, 0.16, -h));
      float thinL = mix(0.017, 0.0055, smoothstep(0.0, 0.16, h));
      float threadU = max((axis - thinU*uFlow.x + 0.0008) * 0.9, max(h, p.y));
      float threadL = max((axis - thinL*uFlow.y + 0.0008) * 0.9, max(-h, -p.y));
      // The thread narrows out of the neck in a short fillet.
      upper = smin(upper, threadU, 0.03);
      lower = smin(lower, threadL, 0.03);
      return max(envelope, min(upper, lower));
    }
    float hash(vec3 p) {
      p = fract(p * 123.34);
      p += dot(p, p.yzx + 34.45);
      return fract((p.x+p.y)*p.z);
    }
    void main() {
      vec3 ray = normalize(vLocal-uEye);
      vec3 p = vLocal;
      bool hit = false;
      for (int i=0; i<180; i++) {
        float d = field(p);
        if (d < 0.00035) { hit = true; break; }
        p += ray * max(d * 0.8, 0.0002);
        if (abs(p.x)>0.59 || abs(p.y)>1.01 || abs(p.z)>0.59) break;
      }
      if (!hit) discard;
      vec2 e = vec2(0.001, 0.0);
      vec3 n = normalize(vec3(field(p+e.xyy)-field(p-e.xyy),
        field(p+e.yxy)-field(p-e.yxy), field(p+e.yyx)-field(p-e.yyx)));
      float diffuse = max(0.0, dot(n, uLight));
      float grain = hash(floor(p * 470.0));
      // Grain contrast fades below a screen pixel; no moire on phones.
      float detail = 1.0 - smoothstep(0.001, 0.008, length(fwidth(p)));
      vec3 color = uColor * (0.68 + 0.47 * diffuse);
      color *= 1.0 + (grain-0.5) * 0.19 * detail;
      gl_FragColor = vec4(color, 1.0);
      vec4 clip = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      gl_FragDepth = (clip.z/clip.w)*0.5+0.5;
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }` });
  const sand = new T.Mesh(new T.BoxGeometry(1.16, 2.0, 1.16), sandMat);
  sand.frustumCulled = false;
  clock.add(sand);

  const MAX_GRAINS = 300;
  const positions = new Float32Array(MAX_GRAINS * 3);
  const velocities = new Float32Array(MAX_GRAINS * 3);
  const ages = new Float32Array(MAX_GRAINS);
  const grainVolume = total / 9000;
  let grains = 0;
  const pending = [0, 0];
  const flowing = [0, 0]; // Current neck flow per chamber, 0..1 of upright rate.
  const grainGeo = new T.BufferGeometry();
  grainGeo.setAttribute('position', new T.BufferAttribute(positions, 3));
  grainGeo.setDrawRange(0, 0);
  const dotCanvas = document.createElement('canvas');
  dotCanvas.width = dotCanvas.height = 32;
  const ctx = dotCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(16,16,1,16,16,15);
  gradient.addColorStop(0,'white'); gradient.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,32,32);
  const grainMat = new T.PointsMaterial({ color: COLORS.light.sand,
    size: 0.018, map: new T.CanvasTexture(dotCanvas), transparent: true,
    alphaTest: 0.12, depthWrite: false });
  const stream = new T.Points(grainGeo, grainMat);
  stream.frustumCulled = false;
  stream.renderOrder = 2;
  clock.add(stream);

  function solveSurfaces() {
    for (let ch = 0; ch < 2; ch++) {
      const sign = ch === 0 ? 1 : -1;
      const receiving = sign * up.y < 0;
      const target = (receiving ? REPOSE : -0.10) * Math.pow(Math.abs(up.y), 2);
      slopes[ch] += (target - slopes[ch]) * 0.16;
      levels[ch] = solveLevel(samples, sign, volumes[ch], up, slopes[ch], scratch);
    }
    uniforms.uLevel.value.set(...levels);
    uniforms.uSlope.value.set(...slopes);
  }

  function simulate(dt) {
    const source = realUp.y >= 0 ? 0 : 1;
    // The smoothed volume solver has a finite kernel near an empty neck.
    // Upright bulbs must drain their final grains even below that kernel.
    const aligned = Math.abs(realUp.y) > 0.96 && realUp.dot(up) > 0.99;
    const covered = aligned || levels[source] > surfacePotential(0,0,0,up,slopes[source]) + 0.008;
    const rate = flowRate(realUp.y, covered, total);
    const take = Math.min(volumes[source], rate * dt);
    flowing[source] = volumes[source] > 0 ? Math.min(1, rate / (total / 18)) : 0;
    flowing[1 - source] = 0;
    volumes[source] -= take;
    pending[source] += take;
    for (let ch = 0; ch < 2; ch++) {
      while (pending[ch] >= grainVolume && grains < MAX_GRAINS) {
        const i = grains * 3;
        positions[i] = (Math.random()-0.5) * 0.014;
        // Spawn inside the opening so the stream overlaps the bulk, rather
        // than adding an independent solid tip aligned to world gravity.
        positions[i+1] = (ch === 0 ? 1 : -1) * 0.004 - realUp.y * Math.random() * 0.008;
        positions[i+2] = (Math.random()-0.5) * 0.010;
        const speed = 0.18 + Math.random()*0.16;
        velocities[i] = -realUp.x*speed + (Math.random()-0.5)*0.035;
        velocities[i+1] = -realUp.y*speed;
        velocities[i+2] = -realUp.z*speed;
        ages[grains++] = 0;
        pending[ch] -= grainVolume;
      }
      // A remainder smaller than one display particle still carries mass.
      // Deposit it when the source is empty instead of leaving it in the neck.
      if (volumes[ch] === 0 && pending[ch] > 0 && pending[ch] < grainVolume) {
        volumes[1-ch] += pending[ch];
        pending[ch] = 0;
      }
    }
    for (let n = grains-1; n >= 0; n--) {
      const i = n*3;
      ages[n] += dt;
      velocities[i] -= realUp.x*3.5*dt;
      velocities[i+1] -= realUp.y*3.5*dt;
      velocities[i+2] -= realUp.z*3.5*dt;
      for (let k=0;k<3;k++) positions[i+k] += velocities[i+k]*dt;
      const y = positions[i+1];
      const ch = y >= 0 ? 0 : 1;
      const radial = Math.hypot(positions[i],positions[i+2]/DEPTH);
      const wall = channelAt(Math.min(HEIGHT,Math.abs(y))) - 0.004;
      if (radial > wall) {
        positions[i] *= wall/radial; positions[i+2] *= wall/radial;
        velocities[i] *= 0.2; velocities[i+2] *= 0.2;
      }
      const potential = surfacePotential(positions[i], y, positions[i+2], up, slopes[ch]);
      if ((ages[n]>0.05 && potential <= levels[ch]+0.004) || Math.abs(y)>=HEIGHT-0.009 || ages[n]>1.5) {
        volumes[ch] += grainVolume;
        grains--;
        positions.copyWithin(i, grains*3, grains*3+3);
        velocities.copyWithin(i, grains*3, grains*3+3);
        ages[n] = ages[grains];
      }
    }
    grainGeo.setDrawRange(0,grains);
    grainGeo.attributes.position.needsUpdate = true;
  }

  // A virtual trackball rotates around any screen axis, including roll.
  const omega = new T.Vector3();
  const axis = new T.Vector3();
  const before = new T.Vector3(), after = new T.Vector3();
  const delta = new T.Quaternion();
  let autoTurn = null, emptyTime = 0;
  let pointer = null, lastPointerTime = 0;
  let hovered = false, returning = false;
  canvas.addEventListener('pointerenter', e => {
    if (e.pointerType === 'mouse') hovered = true;
  });
  canvas.addEventListener('pointerleave', () => { hovered = false; returning = true; });
  addEventListener('blur', () => {
    hovered = false; returning = true;
    const old = pointer;
    pointer = null;
    omega.set(0,0,0);
    if (old !== null && canvas.hasPointerCapture(old)) canvas.releasePointerCapture(old);
  });
  // Scroll pose: one full roll (a flip and back upright) plus a turn and a
  // slight tilt, so the rails show depth. Sand physics follows gravity.
  const scrollPose = new T.Quaternion();
  const poseRoll = new T.Quaternion(), poseYaw = new T.Quaternion(), poseTilt = new T.Quaternion();
  const AXIS_X = new T.Vector3(1,0,0), AXIS_Y = new T.Vector3(0,1,0), AXIS_Z = new T.Vector3(0,0,1);
  function readScroll() {
    const p = parseFloat(section?.style.getPropertyValue('--p')) || 0;
    const r = Math.max(0, Math.min(1, (p - 0.22) / 0.7));
    const k = r*r*(3-2*r);
    poseRoll.setFromAxisAngle(AXIS_Z, -k * Math.PI * 2);
    poseYaw.setFromAxisAngle(AXIS_Y, k * Math.PI * 2);
    poseTilt.setFromAxisAngle(AXIS_X, Math.sin(k * Math.PI) * 0.35);
    return scrollPose.copy(poseTilt).multiply(poseRoll).multiply(poseYaw);
  }
  function project(x,y,out) {
    const box = canvas.getBoundingClientRect();
    const scale = Math.min(box.width,box.height)*0.45;
    out.set((x-box.left-box.width/2)/scale, -(y-box.top-box.height/2)/scale,0);
    const length = out.x*out.x+out.y*out.y;
    out.z = length <= 0.5 ? Math.sqrt(1-length) : 0.5/Math.sqrt(length);
    return out.normalize();
  }
  canvas.addEventListener('pointerdown',e => {
    if (scrollMode) return;
    if (pointer !== null || (e.pointerType==='mouse' && e.button!==0)) return;
    e.preventDefault(); pointer=e.pointerId; autoTurn=null; emptyTime=0; returning=false;
    omega.set(0,0,0); lastPointerTime=e.timeStamp;
    project(e.clientX,e.clientY,before);
    canvas.setPointerCapture(pointer);
  });
  canvas.addEventListener('pointermove',e => {
    if (e.pointerId!==pointer) return;
    project(e.clientX,e.clientY,after);
    delta.setFromUnitVectors(before,after);
    clock.quaternion.premultiply(delta).normalize();
    const angle=2*Math.acos(Math.min(1,Math.abs(delta.w)));
    axis.set(delta.x,delta.y,delta.z).normalize();
    const speed=Math.min(5,angle/Math.max(0.008,(e.timeStamp-lastPointerTime)/1000));
    omega.copy(axis).multiplyScalar(speed);
    before.copy(after); lastPointerTime=e.timeStamp;
  });
  function release(e) {
    if (e.pointerId!==pointer) return;
    const old=pointer; pointer=null;
    if (canvas.hasPointerCapture(old)) canvas.releasePointerCapture(old);
    if (e.type==='pointercancel' || e.timeStamp-lastPointerTime>90) omega.set(0,0,0);
    const box = canvas.getBoundingClientRect();
    hovered = e.pointerType === 'mouse' && e.type === 'pointerup' &&
      e.clientX >= box.left && e.clientX <= box.right &&
      e.clientY >= box.top && e.clientY <= box.bottom;
    if (!hovered) returning = true;
  }
  canvas.addEventListener('pointerup',release);
  canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('lostpointercapture',e=>{ if(e.pointerId===pointer){pointer=null;returning=true;omega.set(0,0,0);} });
  canvas.addEventListener('keydown',e=>{
    const arrows={ArrowLeft:[0,-1,0],ArrowRight:[0,1,0],ArrowUp:[-1,0,0],ArrowDown:[1,0,0]};
    if(scrollMode || !arrows[e.key])return;
    e.preventDefault();
    delta.setFromAxisAngle(axis.fromArray(arrows[e.key]),0.18);
    clock.quaternion.premultiply(delta);
  });

  function paint() {
    const theme=COLORS[document.documentElement.dataset.theme==='dark'?'dark':'light'];
    frameMat.color.set(theme.frame);glassMat.color.set(theme.glass);collarMat.uniforms.uColor.value.set(theme.thick);
    uniforms.uColor.value.set(theme.sand);grainMat.color.set(theme.sand);
    ambient.intensity=theme.ambient;
  }
  document.addEventListener('tf:theme',paint);paint();

  // Fit a bounding sphere, not the upright rectangle. Every orientation fits.
  function resize() {
    const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
    renderer.setSize(w,h,false);camera.aspect=w/h;
    const vertical=T.MathUtils.degToRad(camera.fov/2);
    const horizontal=Math.atan(Math.tan(vertical)*camera.aspect);
    camera.position.set(0,0,1.34/Math.sin(Math.min(vertical,horizontal)));
    camera.lookAt(0,0,0);camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);resize();
  solveSurfaces();
  let raf=0, previous=0, visible=true, accumulator=0, rendered=false;
  function tick(now) {
    raf=requestAnimationFrame(tick);
    if(coarse && previous && now-previous<30)return;
    const dt=previous?Math.min(0.05,(now-previous)/1000):1/60;
    previous=now;
    if (scrollMode) {
      // Smoothed chase of the scroll pose: steady even with coarse wheel steps.
      clock.quaternion.slerp(readScroll(), 1-Math.exp(-9*dt));
    } else if (autoTurn) {
      autoTurn.elapsed += dt;
      const t = Math.min(1, autoTurn.elapsed / 1.35);
      clock.quaternion.slerpQuaternions(autoTurn.from, front, t*t*(3-2*t));
      if (t === 1) autoTurn = null;
    } else if (pointer === null && (returning || !hovered)) {
      // Frame-rate independent shortest-arc return, without an end snap.
      omega.set(0,0,0);
      clock.quaternion.slerp(front, 1-Math.exp(-4*dt));
      if (clock.quaternion.angleTo(front) < 0.0001) {
        clock.quaternion.copy(front);
        returning = false;
      }
    } else if(pointer===null && omega.lengthSq()>0.00001) {
      const speed=omega.length();
      delta.setFromAxisAngle(axis.copy(omega).normalize(),speed*dt);
      clock.quaternion.premultiply(delta).normalize();omega.multiplyScalar(Math.exp(-3.2*dt));
    }
    inverse.copy(clock.quaternion).invert();
    realUp.set(0,1,0).applyQuaternion(inverse);
    gravityTurn.setFromUnitVectors(up,realUp);
    stepTurn.copy(identity).slerp(gravityTurn,1-Math.exp(-7*dt));
    up.applyQuaternion(stepTurn).normalize();
    accumulator+=dt;
    while(accumulator>=1/90){simulate(1/90);accumulator-=1/90;}
    solveSurfaces();
    const ease = 1 - Math.exp(-8*dt);
    const flow = uniforms.uFlow.value;
    flow.x += (flowing[0] - flow.x) * ease;
    flow.y += (flowing[1] - flow.y) * ease;
    const source = realUp.y >= 0 ? 0 : 1;
    const empty = volumes[source] === 0 && pending[0] === 0 && pending[1] === 0 && grains === 0;
    if (!scrollMode && !autoTurn && pointer === null && Math.abs(realUp.y) > 0.96 &&
        omega.lengthSq() < 0.001 && empty) emptyTime += dt;
    else emptyTime = 0;
    if (emptyTime > 0.9) {
      // Alternating frontal poses preserve the automatic cycle when the
      // pointer leaves: returning to the old pose would undo the flip.
      front.setFromAxisAngle(axis.set(0,0,1), source === 0 ? Math.PI : 0);
      autoTurn = { from: clock.quaternion.clone(), elapsed: 0 };
      omega.set(0,0,0);
      emptyTime = 0;
    }
    clock.updateMatrixWorld(true);
    eye.copy(camera.position);clock.worldToLocal(eye);
    light.set(-0.4,0.75,0.8).normalize().applyQuaternion(inverse);
    renderer.render(scene,camera);
    if(!rendered){host.classList.add('is-3d');rendered=true;}
  }
  function play(){if(!raf && visible && !document.hidden && !reduced.matches){previous=0;raf=requestAnimationFrame(tick);}}
  function stop(){cancelAnimationFrame(raf);raf=0;previous=0;}
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)play();else stop();},
    {rootMargin:'80px'}).observe(stage);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else play();});
  reduced.addEventListener('change',()=>{
    if(reduced.matches){stop();host.classList.remove('is-3d');}else{host.classList.add('is-3d');play();}
  });
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();stop();host.classList.remove('is-3d');});
  canvas.addEventListener('webglcontextrestored',()=>{rendered=false;paint();resize();play();});
  play();
}
