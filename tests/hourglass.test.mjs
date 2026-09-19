import test from 'node:test';
import assert from 'node:assert/strict';
import { HEIGHT, RADIUS, DEPTH, REPOSE, radiusAt, createBulbSamples,
  surfacePotential, solveLevel, flowRate } from '../assets/hourglass-physics.js';

const samples = createBulbSamples(4096);
const scratch = new Float32Array(samples.points.length);

test('continuous profile stays inside the glass and is symmetric', () => {
  let previous = radiusAt(0);
  for (let i=0;i<=10000;i++) {
    const y=HEIGHT*i/10000, r=radiusAt(y);
    assert.ok(r>0 && r<=RADIUS+1e-12);
    assert.equal(r,radiusAt(-y));
    assert.ok(Math.abs(r-previous)<0.0002);
    previous=r;
  }
});

test('volume reconstructed at upright, inverted, sideways and oblique orientations', () => {
  const ups=[{x:0,y:1,z:0},{x:0,y:-1,z:0},{x:1,y:0,z:0},
    {x:0,y:0,z:1},{x:0.6,y:0.8,z:0},{x:1/Math.sqrt(3),y:1/Math.sqrt(3),z:1/Math.sqrt(3)}];
  for (const up of ups) for(const sign of [-1,1]) for(const fraction of [0.01,0.15,0.47]) {
    const slope=(sign*up.y<0?REPOSE:-0.1)*up.y*up.y;
    const volume=samples.volume*fraction;
    const level=solveLevel(samples,sign,volume,up,slope,scratch);
    let integrated=0;
    for(const p of samples.points) {
      const potential=surfacePotential(p.x,sign*p.y,p.z,up,slope);
      integrated+=p.weight*Math.min(1,Math.max(0,(level-potential)/0.025+0.5));
    }
    assert.ok(Math.abs(integrated-volume)/samples.volume<0.0002,
      `volume mismatch: ${JSON.stringify({up,sign,fraction,integrated,volume})}`);
  }
});

test('sand level moves continuously with volume, without grid steps', () => {
  const up={x:0.3,y:Math.sqrt(0.91),z:0};
  let last=-Infinity;
  for(let i=10;i<=470;i++) {
    const level=solveLevel(samples,-1,samples.volume*i/1000,up,REPOSE,scratch);
    assert.ok(level>=last);
    if(Number.isFinite(last))assert.ok(level-last<0.01);
    last=level;
  }
});

test('horizontal neck and exposed neck stop flow; inversion reverses it symmetrically', () => {
  assert.equal(flowRate(0,true,1),0);
  assert.equal(flowRate(0.1,true,1),0);
  assert.equal(flowRate(1,false,1),0);
  assert.equal(flowRate(1,true,1),flowRate(-1,true,1));
  assert.ok(flowRate(0.5,true,1)<flowRate(1,true,1));
});

test('camera sphere contains the whole rotating model, including frame', () => {
  const bound=Math.hypot(RADIUS+0.07,1.02,0.59);
  assert.ok(bound<1.34);
  assert.ok(Math.hypot(RADIUS,HEIGHT,RADIUS*DEPTH)<1.34);
  for(const aspect of [0.6,1,1.5]) {
    const vertical=32*Math.PI/360;
    const angle=Math.min(vertical,Math.atan(Math.tan(vertical)*aspect));
    const distance=1.34/Math.sin(angle);
    assert.ok(Math.asin(bound/distance)<angle);
  }
});
