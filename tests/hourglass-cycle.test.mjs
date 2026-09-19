import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as Three from '../assets/vendor/three.module.min.js';
import * as physics from '../assets/hourglass-physics.js';
const listeners = new Map();
const canvas = { clientWidth:440, clientHeight:440, setAttribute(){}, addEventListener(name,fn){listeners.set(name,fn)},
  getContext(){return {createRadialGradient(){return {addColorStop(){}}},fillRect(){}}} };
const stage={appendChild(){}};
const host={querySelector(){return stage},classList:{add(){},remove(){}}};
globalThis.document={querySelector(){return host},readyState:'loading',hidden:false,
 documentElement:{dataset:{theme:'light'}},createElement(){return canvas},addEventListener(){}};
globalThis.matchMedia=()=>({matches:false,addEventListener(){}});
globalThis.addEventListener=()=>{};
globalThis.devicePixelRatio=1;
globalThis.ResizeObserver=class{observe(){}};
globalThis.IntersectionObserver=class{observe(){}};
let next;
globalThis.requestAnimationFrame=fn=>{next=fn;return 1};
globalThis.cancelAnimationFrame=()=>{};
const T={...Three,WebGLRenderer:class{setPixelRatio(){}setSize(){}render(){}}};
let source=fs.readFileSync(new URL('../assets/hourglass.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
source=source.replace(/^import[\s\S]*?from '.\/hourglass-physics.js';/,'');
source=source.replace('  play();\n}',`  globalThis.inspectHourglass=()=>({volumes:[...volumes],pending:[...pending],grains,total,grainVolume,auto:!!autoTurn,q:clock.quaternion.clone(),front:front.clone(),returning});\n  play();\n}`);
new Function(...Object.keys(physics),'T',source+'\nbuild(T);')(...Object.values(physics),T);
let flips=0, wasAuto=false, exhausted=0;
for(let frame=1;frame<=5400;frame++){
 next(frame*1000/60);
 const s=inspectHourglass();
 const sum=s.volumes[0]+s.volumes[1]+s.pending[0]+s.pending[1]+s.grains*s.grainVolume;
 assert.ok(Math.abs(sum-s.total)<1e-10,'sand mass changed');
 if(s.auto&&!wasAuto){flips++;assert.ok(s.volumes.some(v=>v===0),'source did not empty');exhausted++;}
 wasAuto=s.auto;
}
assert.ok(flips>=3,`Only ${flips} flips in 90 seconds`);
console.log(`PASS: ${flips} automatic flips in 90 simulated seconds; each source fully emptied; total sand conserved every frame.`);

listeners.get('pointerenter')({pointerType:'mouse'});
for(let i=0;i<6;i++)listeners.get('keydown')({key:'ArrowRight',preventDefault(){}});
listeners.get('pointerleave')({});
for(let frame=5401;frame<=5410;frame++)next(frame*1000/60);
assert.ok(inspectHourglass().returning);
listeners.get('pointerenter')({pointerType:'mouse'});
for(let frame=5411;frame<=5590;frame++)next(frame*1000/60);
let state=inspectHourglass();
assert.ok(state.q.angleTo(state.front)<0.0001,'hover interrupted the return');
assert.equal(state.returning,false);
console.log('PASS: rapid pointer re-entry does not interrupt the return to the exact frontal pose.');
