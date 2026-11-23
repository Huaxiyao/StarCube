'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('../src/stats.js');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const record = (ms, penalty='ok') => ({ id:0, ms, penalty, scramble:'', at:'2026-10-25T00:00:00.000Z' });

check('Ao50 removes exactly three observations from each end', () => {
  const records = [...Array(3).fill(1000), ...Array(44).fill(10000), ...Array(3).fill(100000)].map(ms=>record(ms));
  assert.equal(S.aoN(records, 50), 10000);
});
check('Ao100 removes exactly five observations from each end', () => {
  const records = [...Array(5).fill(1000), ...Array(90).fill(10000), ...Array(5).fill(100000)].map(ms=>record(ms));
  assert.equal(S.aoN(records, 100), 10000);
});
for (const [n, allowed] of [[5,1],[12,1],[50,3],[100,5]]) {
  check('Ao'+n+' tolerates '+allowed+' DNF and rejects '+(allowed+1), () => {
    const records=Array.from({length:n-allowed},()=>record(10000)).concat(Array.from({length:allowed},()=>record(0,'dnf')));
    assert.equal(S.aoN(records,n),10000);
    records[0]=record(0,'dnf');
    assert.equal(S.aoN(records,n),'DNF');
  });
}
check('5% trim rounds upward at 21 observations', () => {
  const records=[record(1000),record(2000),...Array.from({length:17},()=>record(10000)),record(100000),record(200000)];
  assert.equal(S.aoN(records,21),10000);
});
check('Rolling Ao50 excludes earlier solves and includes +2 before trimming', () => {
  const records=[record(999999),...Array.from({length:50},()=>record(8000,'+2'))];
  assert.equal(S.aoN(records,50),10000);
});
check('Ao5 sorts effective results, not raw times', () => {
  assert.equal(S.aoN([record(10000,'+2'),record(11000),record(13000),record(14000),record(20000)],5),13000);
});
check('DNF session average, PB and best Ao5 keep their behavior', () => {
  const records=[record(10000),record(8000,'+2'),record(12000),record(14000),record(0,'dnf')];
  assert.equal(S.overallAverage(records),11500);
  assert.equal(S.personalBest(records).value,10000);
  assert.equal(S.bestAo5(records),12000);
});
for (const [elapsed,expected] of [[14999.999,'ok'],[15000,'+2'],[15000.001,'+2'],[16999.999,'+2'],[17000,'dnf'],[17000.001,'dnf']]) {
  check('Inspection '+elapsed+' ms is '+expected,()=>assert.equal(S.inspectionPenalty(elapsed,true),expected));
}
check('Inspection disabled and millisecond formatting are preserved',()=>{
  assert.equal(S.inspectionPenalty(999999,false),'ok');
  assert.equal(S.formatMs(62345),'1:02.345');
  assert.equal(S.formatResult(record(14567,'+2')),'16.567+');
});

// Independent 3D sticker oracle. It never reads cubejs facelet/move tables.
const faces=['U','R','F','D','L','B'];
const basis={
  U:{n:[0,1,0],right:[1,0,0],down:[0,0,1]},
  R:{n:[1,0,0],right:[0,0,-1],down:[0,-1,0]},
  F:{n:[0,0,1],right:[1,0,0],down:[0,-1,0]},
  D:{n:[0,-1,0],right:[1,0,0],down:[0,0,-1]},
  L:{n:[-1,0,0],right:[0,0,1],down:[0,-1,0]},
  B:{n:[0,0,-1],right:[-1,0,0],down:[0,-1,0]}
};
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const key=(p,n)=>p.join(',')+'|'+n.join(',');
function stickers(){
  return faces.flatMap(face=>Array.from({length:9},(_,i)=>{
    const {n,right,down}=basis[face];
    return {color:face,n:[...n],p:n.map((v,k)=>v+(i%3-1)*right[k]+(Math.floor(i/3)-1)*down[k])};
  }));
}
function rotate(v,axis){const c=cross(axis,v),d=dot(axis,v);return v.map((_,i)=>-c[i]+axis[i]*d);}
function independentFacelets(algorithm){
  const state=stickers();
  for(const token of algorithm.trim().split(/\s+/).filter(Boolean)){
    assert.match(token,/^[URFDLB](2|')?$/);
    const axis=basis[token[0]].n,turns=token.endsWith('2')?2:token.endsWith("'")?3:1;
    for(let i=0;i<turns;i++)for(const sticker of state)if(dot(sticker.p,axis)===1){sticker.p=rotate(sticker.p,axis);sticker.n=rotate(sticker.n,axis);}
  }
  const colors=new Map(state.map(s=>[key(s.p,s.n),s.color]));
  return stickers().map(s=>colors.get(key(s.p,s.n))).join('');
}

const bundle=fs.readFileSync(path.join(__dirname,'../src/solver.bundle.js'),'utf8');
const entry=fs.readFileSync(path.join(__dirname,'../src/worker-entry.js'),'utf8').trimEnd();
check('Bundle contains the exact editable worker entry',()=>assert.ok(bundle.includes(entry)));
const constructorMarker='var StarCubeBundledMin2Phase = module.exports && module.exports.solve ? module.exports : min2phase;';
assert.equal(bundle.split(constructorMarker).length,2,'Expected one explicit dependency wrapper');
const messages=[];
const sandbox={self:{postMessage:message=>messages.push(message)},console,crypto:globalThis.crypto};
vm.createContext(sandbox);
// In-memory test instrumentation exposes only the bundled dependency for controlled RNG & Search tests.
vm.runInContext(bundle.replace(constructorMarker,constructorMarker+'\nself.__testMin2Phase=StarCubeBundledMin2Phase;'),sandbox);
const min2phase=sandbox.self.__testMin2Phase;
const api=sandbox.self.StarCubeSolver;
const OriginalSearch=min2phase.Search;
for(const algorithm of ['',...faces.flatMap(face=>['',"'",'2'].map(suffix=>face+suffix))]) {
  check('Reject target distance <=1: '+(algorithm||'solved'),()=>{
    let solveCalls=0;
    min2phase.Search=function(){solveCalls++;return new OriginalSearch();};
    api._setRandomFacelets(()=>independentFacelets(algorithm));
    try{
      assert.throws(()=>api.scramble(),/过于简单/);
      assert.equal(solveCalls,0,'Must reject by target state before calling the solver');
    }finally{
      api._setRandomFacelets(null);
      min2phase.Search=OriginalSearch;
    }
  });
}
check('Worker init keeps the ready protocol',()=>{
  sandbox.self.onmessage({data:{cmd:'init'}});
  assert.equal(messages.at(-1).cmd,'ready');
  assert.equal(Object.keys(messages.at(-1)).length,1);
});
check('Worker success echoes its requestId',()=>{
  sandbox.self.onmessage({data:{cmd:'scramble',requestId:41}});
  const response=messages.at(-1);
  assert.equal(response.cmd,'scramble');
  assert.equal(response.requestId,41);
  assert.equal(response.facelets,independentFacelets(response.algorithm));
});
check('Worker failure echoes its requestId',()=>{
  api._setRandomFacelets(()=>{throw new Error('controlled RNG failure');});
  try{
    sandbox.self.onmessage({data:{cmd:'scramble',requestId:42}});
    const response=messages.at(-1);
    assert.equal(response.cmd,'error');
    assert.equal(response.requestId,42);
    assert.match(response.message,/controlled RNG failure/);
  }finally{
    api._setRandomFacelets(null);
  }
});
check('Two-move target remains eligible',()=>{
  api._setRandomFacelets(()=>independentFacelets('R U'));
  try{
    const result=api.scramble();
    assert.equal(result.facelets,independentFacelets('R U'));
    assert.equal(independentFacelets(result.algorithm),result.facelets);
  }finally{
    api._setRandomFacelets(null);
  }
});
check('Seeded scrambleBatch is deterministic and agrees with independent 3D rotations',()=>{
  sandbox.self.onmessage({data:{cmd:'scrambleBatch',requestId:43,seeds:['StarCube:daily:333:2026-11-22:solve-1','StarCube:daily:333:2026-11-22:solve-2']}});
  const r1=messages.at(-1);
  sandbox.self.onmessage({data:{cmd:'scrambleBatch',requestId:44,seeds:['StarCube:daily:333:2026-11-22:solve-1','StarCube:daily:333:2026-11-22:solve-2']}});
  const r2=messages.at(-1);
  assert.equal(r1.cmd,'scrambleBatch');
  assert.equal(r1.requestId,43);
  assert.equal(r1.results.length,2);
  assert.deepEqual(r1.results,r2.results);
  for(const item of r1.results)assert.equal(independentFacelets(item.algorithm),item.facelets);
});
check('20 generated scrambles agree with independent 3D rotations',()=>{
  const excluded=new Set(['',...faces.flatMap(face=>['',"'",'2'].map(suffix=>face+suffix))].map(independentFacelets));
  for(let i=0;i<20;i++){
    const result=api.scramble();
    assert.equal(independentFacelets(result.algorithm),result.facelets);
    assert.ok(!excluded.has(result.facelets));
    assert.ok(result.algorithm.split(' ').length<=21);
    for(const face of faces)assert.equal([...result.facelets].filter(c=>c===face).length,9);
  }
});

console.log('\n'+passed+' domain regression checks passed.');
