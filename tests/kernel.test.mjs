import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { initialState, stepRange, maxError, stats } from '../web/kernel.js';

test('initial conditions are deterministic and finite',()=>{
  assert.deepEqual(initialState(17),initialState(17));
  assert.notDeepEqual(initialState(17,1),initialState(17,2));
  assert.ok([...initialState(17)].every(Number.isFinite));
});
test('partitioning changes no result, including uneven and empty chunks',()=>{
  for(const n of [1,2,3,17,63]){
    let state=initialState(n);
    for(let step=0;step<10;step++){
      const sequential=stepRange(state,0,n);
      for(const p of [1,2,4,8]){
        const parallel=new Float32Array(n*6);
        for(let k=0;k<p;k++){
          const start=Math.floor(k*n/p),end=Math.floor((k+1)*n/p);
          parallel.set(stepRange(state,start,end),start*6);
        }
        assert.equal(maxError(sequential,parallel),0);
      }
      state=sequential;
    }
  }
});
test('single stationary body and coincident bodies remain finite',()=>{
  for(const n of [1,17]){
    const state=new Float32Array(n*6);
    assert.deepEqual(stepRange(state,0,n),state);
  }
  assert.equal(maxError(new Float32Array([NaN]),new Float32Array([NaN])),Infinity);
});
test('browser scalar mirror matches the native reference arithmetic',()=>{
  for(const n of [1,2,17,63]){
    const initial=initialState(n);
    const header=Buffer.alloc(4);header.writeInt32LE(n);
    const result=spawnSync('./build/sequential',[],{input:Buffer.concat([header,Buffer.from(initial.buffer)])});
    assert.equal(result.status,0,result.stderr?.toString());
    let state=initial;
    for(let step=0;step<10;step++)state=stepRange(state,0,n);
    assert.deepEqual(Buffer.from(state.buffer),result.stdout);
  }
});
test('sample statistics use sample standard deviation',()=>{
  assert.deepEqual(stats([1,2,3]),{mean:2,stddev:1});
});
