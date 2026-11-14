/* Independent application regressions. No product source is instrumented.
 * Run: node tests/test-app-regression.cjs
 * A minimal DOM/clock/Worker controls external events and observes DOM/storage.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const ALGORITHMS = ["R R'", "U U'", "F F'"];
const STAT_IDS = ['ao5','ao12','ao50','ao100','avg','count','pb','bestAo5'];

function record(index, ms = 10000 + index) {
  return {id:index + 1,ms,penalty:'ok',scramble:ALGORITHMS[0],at:new Date(Date.UTC(2026,9,25,0,0,index)).toISOString()};
}

function harness(options = {}) {
  let now = 1000, sequence = 1;
  const timers = new Map(), rafs = new Map(), nodes = new Map(), allNodes = [], workers = [], warnings = [];
  let writeFailure = null, urlSequence = 0;
  const blobUrls = new Map(), downloads = [];
  const entries = options.sharedEntries || new Map(options.storageEntries || []);
  const sessionEntries = new Map(options.sessionEntries || []);
  if (!entries.has('starcube.settings.v1')) entries.set('starcube.settings.v1',JSON.stringify({inspection:!!options.inspection}));
  if (options.records) entries.set('starcube.records.v1',JSON.stringify(options.records));
  const storage = {
    get length(){return entries.size;}, key(index){return [...entries.keys()][index] ?? null;},
    getItem(key){return entries.has(String(key)) ? entries.get(String(key)) : null;},
    setItem(key,value){if(writeFailure&&writeFailure(String(key),String(value))){const error=new Error('Storage quota exceeded in regression fixture');error.name='QuotaExceededError';throw error;}entries.set(String(key),String(value));}, removeItem(key){entries.delete(String(key));}, clear(){entries.clear();}
  };
  function eventTarget() {
    const listeners = new Map();
    return {addEventListener(type,callback){const list=listeners.get(type)||[];list.push(callback);listeners.set(type,list);},
      removeEventListener(type,callback){listeners.set(type,(listeners.get(type)||[]).filter(fn=>fn!==callback));},
      dispatch(type,props={}){const event=Object.assign({type,cancelable:true,repeat:false,pointerType:'touch',pointerId:1,button:0,preventDefault(){this.defaultPrevented=true;},stopPropagation(){}},props);for(const callback of listeners.get(type)||[])callback(event);return event;}};
  }
  function element(tag='div',id='') {
    let content = '', className = '';
    const captured = new Set();
    const node=Object.assign(eventTarget(),{tagName:tag.toUpperCase(),id,hidden:false,disabled:false,open:false,style:{},dataset:{},children:[],attributes:{},scrollTop:0,textWrites:0,replacements:0,focusCalls:[],
      classList:{toggle(){},add(){},remove(){},contains(){return false;}},
      appendChild(child){this.children.push(child);child.parentNode=this;return child;},
      append(...children){for(const child of children)this.appendChild(child);},
      replaceChildren(...children){this.replacements++;for(const child of this.children)child.parentNode=null;this.children=[];for(const child of children){if(child.tagName==='#FRAGMENT')for(const item of child.children)this.appendChild(item);else this.appendChild(child);}},
      remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);},
      setAttribute(key,value){this.attributes[key]=String(value);},getAttribute(key){return this.attributes[key] ?? null;},
      setPointerCapture(id){captured.add(id);},releasePointerCapture(id){if(captured.delete(id))this.dispatch('lostpointercapture',{pointerId:id});},hasPointerCapture(id){return captured.has(id);},
      click(){if(this.tagName==='A')downloads.push({name:this.download,blob:blobUrls.get(this.href)});this.dispatch('click',{target:this});},focus(options){this.focusCalls.push(options||null);document.activeElement=this;},querySelectorAll(selector){return descendants(this).filter(child=>selector===child.tagName.toLowerCase());},
      closest(selector){const match=/^\[([^\]]+)\]$/.exec(selector);if(match&&this.getAttribute(match[1])!==null)return this;return this.parentNode?.closest(selector)||null;},
      showModal(){this.open=true;},close(){if(this.open){this.open=false;this.dispatch('close',{target:this});}},
      getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth||760,height:236};}});
    Object.defineProperty(node,'isConnected',{get(){return !!this.id || !!this.parentNode?.isConnected;}});
    Object.defineProperty(node,'textContent',{get(){return content || this.children.map(child=>child.textContent).join('');},set(value){content=String(value);this.children=[];this.textWrites++;}});
    Object.defineProperty(node,'className',{get(){return className;},set(value){className=String(value);}});
    if(id==='solver-src') content='/*'+'solver placeholder '.repeat(100)+'*/';
    allNodes.push(node);return node;
  }
  function descendants(node){return node.children.flatMap(child=>[child,...descendants(child)]);}
  const document=Object.assign(eventTarget(),{hidden:false,
    getElementById(id){if(!nodes.has(id))nodes.set(id,element('div',id));return nodes.get(id);},
    createElement:tag=>element(tag),createElementNS:(ns,tag)=>element(tag),createDocumentFragment:()=>element('#fragment')});
  document.body=element('body');
  const window=Object.assign(eventTarget(),{innerWidth:options.width || 1440,scrollX:0,scrollY:0,scrollCalls:[],scrollTo(x,y){this.scrollX=x;this.scrollY=y;this.scrollCalls.push({x,y});},localStorage:storage,sessionStorage:{getItem:k=>sessionEntries.get(k)||null,setItem:(k,v)=>sessionEntries.set(k,v)},location:{protocol:'file:',href:'file:///test/starcube.html'},confirm:()=>true});
  class Worker {
    constructor(){this.requests=[];workers.push(this);}
    postMessage(message){this.requests.push(JSON.parse(JSON.stringify(message)));}
    terminate(){this.terminated=true;}
    deliver(data){this.onmessage({data});}
  }
  const quietConsole={warn(...args){warnings.push(args.join(' '));},error(...args){warnings.push(args.join(' '));},log(){}};
  const context={window,self:window,document,localStorage:storage,Worker,performance:{now:()=>now},console:quietConsole,
    setTimeout(callback,delay){const id=sequence++;timers.set(id,{callback,at:now+(delay||0)});return id;},clearTimeout(id){timers.delete(id);},
    requestAnimationFrame(callback){const id=sequence++;rafs.set(id,callback);return id;},cancelAnimationFrame(id){rafs.delete(id);},
    Blob:class{constructor(parts,settings){this.parts=parts;this.type=settings&&settings.type;}},URL:{createObjectURL(blob){const url='blob:test-app-regression-'+(++urlSequence);blobUrls.set(url,blob);return url;},revokeObjectURL(url){blobUrls.delete(url);}},Date,Math,JSON,String,Array,Object,Number,Map,Set,Infinity,isFinite};
  vm.createContext(context);
  for(const name of ['stats.js','review.js','store.js','audio.js','backup.js','app.js']) {
    const file=path.join(__dirname,'../src',name);
    if(name==='store.js'&&!fs.existsSync(file))continue;
    if(name==='app.js'&&options.audioFactory)window.StarCubeAudio={create:options.audioFactory};
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:name});
    if(name==='store.js'&&options.importedRecords)window.StarCubeStore.create({storage}).importRecords(options.importedRecords);
  }
  function advance(milliseconds){const end=now+milliseconds;while(true){let next=null;for(const [id,timer] of timers)if(timer.at<=end&&(!next||timer.at<next[1].at))next=[id,timer];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].callback();}now=end;const frames=[...rafs.values()];rafs.clear();for(const callback of frames)callback(now);}
  const worker=workers[0];assert.ok(worker,'Worker was created');worker.deliver({cmd:'ready'});
  function requests(){return worker.requests.filter(message=>message.cmd==='scramble');}
  function respond(request,algorithm=ALGORITHMS[0]){assert.ok(request,'a matching scramble request exists');worker.deliver({cmd:'scramble',requestId:request.requestId,algorithm,facelets:SOLVED});}
  const initialRequest=requests().at(-1);respond(initialRequest);
  const key=(type,key=' ',props={})=>window.dispatch(type,Object.assign({key,code:key===' '?'Space':key},props));
  const pointer=(type,id=1)=>document.getElementById('pad').dispatch(type,{pointerId:id});
  const click=id=>document.getElementById(id).click();
  const text=id=>document.getElementById(id).textContent;
  function readRecords(){const api=window.StarCubeStore;if(api)return api.create({storage}).load().records;return JSON.parse(storage.getItem('starcube.records.v1')||'[]');}
  const metrics=()=>({statWrites:STAT_IDS.reduce((sum,id)=>sum+document.getElementById(id).textWrites,0),historyReplacements:document.getElementById('historyList').replacements,historyItemsCreated:allNodes.filter(node=>node.className==='history-item').length});
  const failWrites=predicate=>{writeFailure=predicate;};
  const exportedPayloads=()=>downloads.map(download=>JSON.parse(download.blob.parts.join('')));
  return {advance,key,pointer,click,text,readRecords,requests,respond,initialRequest,worker,window,document,nodes,allNodes,storage,entries,sessionEntries,warnings,metrics,descendants,failWrites,exportedPayloads};
}

let failures=0,passed=0;
function test(name,callback){try{callback();passed++;console.log('PASS '+name);}catch(error){failures++;console.error('FAIL '+name+'\n'+error.stack);}}
function status(h){return h.text('status');}
function hold(h){h.key('keydown');h.advance(300);assert.equal(status(h),'按住');h.key('keyup');assert.equal(status(h),'计时中');}
function finish(h,elapsed=1000){h.advance(elapsed);h.key('keydown');h.key('keyup');assert.equal(h.text('count'),'1');}
function hueName(hex){const s=hex.replace('#','');const rgb=[0,2,4].map(offset=>parseInt(s.slice(offset,offset+2),16)/255);const max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min;if(delta<0.08)return max>0.8?'white':'neutral';let hue=max===rgb[0]?(rgb[1]-rgb[2])/delta:max===rgb[1]?2+(rgb[2]-rgb[0])/delta:4+(rgb[0]-rgb[1])/delta;hue=(hue*60+360)%360;return hue<18||hue>=345?'red':hue<38?'orange':hue<78?'yellow':hue<175?'green':hue<275?'blue':'other';}

test('Solved net has 54 distinct cells and complete 12 by 9 cross',()=>{
  const h=harness();const rects=h.descendants(h.document.getElementById('net')).filter(node=>node.tagName==='RECT');assert.equal(rects.length,54);
  const values=rects.map(node=>({x:Number(node.getAttribute('x')),y:Number(node.getAttribute('y')),fill:node.getAttribute('fill')}));
  assert.equal(new Set(values.map(cell=>cell.x+','+cell.y)).size,54,'Every facelet must occupy a distinct location');
  const xs=[...new Set(values.map(cell=>cell.x))].sort((a,b)=>a-b),ys=[...new Set(values.map(cell=>cell.y))].sort((a,b)=>a-b);assert.equal(xs.length,12);assert.equal(ys.length,9);
  const byGrid=new Map(values.map(cell=>[xs.indexOf(cell.x)+','+ys.indexOf(cell.y),cell]));
  const faces=[{x:3,y:0,color:'white'},{x:0,y:3,color:'orange'},{x:3,y:3,color:'green'},{x:6,y:3,color:'red'},{x:9,y:3,color:'blue'},{x:3,y:6,color:'yellow'}];
  for(const face of faces)for(let row=0;row<3;row++)for(let col=0;col<3;col++){const cell=byGrid.get((face.x+col)+','+(face.y+row));assert.ok(cell,'Complete 3 by 3 face');assert.equal(hueName(cell.fill),face.color);}
});
test('300 ms hold ignores repeated Space and release starts; next press stops',()=>{
  const h=harness();h.key('keydown');h.advance(150);h.key('keydown',' ',{repeat:true});h.advance(149);assert.notEqual(status(h),'按住');h.advance(1);assert.equal(status(h),'按住');h.key('keyup');h.advance(1234);h.key('keydown');h.key('keyup');assert.equal(h.readRecords()[0].ms,1234);
});
test('Inspection initiating press cannot arm until released and pressed again',()=>{
  const h=harness({inspection:true});h.key('keydown');h.advance(700);assert.equal(status(h),'观察中');h.key('keyup');hold(h);finish(h);assert.equal(h.readRecords()[0].penalty,'ok');
});
test('N during pending hold cannot replace or enqueue a new scramble',()=>{
  const h=harness();const count=h.requests().length;h.key('keydown');h.advance(100);h.key('keydown','n');assert.equal(h.requests().length,count);assert.equal(h.text('scrambleText'),ALGORITHMS[0]);h.advance(200);h.key('keyup');assert.equal(status(h),'计时中');finish(h);assert.equal(h.readRecords()[0].scramble,ALGORITHMS[0]);
});
test('Timed out A cannot satisfy retried B or overwrite its eventual result',()=>{
  const h=harness();h.key('keydown','n');const requestA=h.requests().at(-1);assert.ok(requestA.requestId!==undefined,'Protocol identifies each request');h.advance(5000);assert.equal(status(h),'生成失败');h.key('keydown','n');const requestB=h.requests().at(-1);assert.notEqual(requestA.requestId,requestB.requestId);h.respond(requestA,ALGORITHMS[1]);assert.equal(status(h),'生成中…');h.advance(4999);assert.equal(status(h),'生成中…');h.respond(requestB,ALGORITHMS[2]);assert.equal(h.text('scrambleText'),ALGORITHMS[2]);h.respond(requestA,ALGORITHMS[1]);assert.equal(h.text('scrambleText'),ALGORITHMS[2]);
});
test('Ignoring stale A preserves B timeout and ignores stale errors',()=>{
  const h=harness();h.key('keydown','n');const a=h.requests().at(-1);h.advance(5000);h.key('keydown','n');h.respond(a,ALGORITHMS[1]);h.worker.deliver({cmd:'error',requestId:a.requestId,message:'obsolete failure'});assert.equal(status(h),'生成中…');h.advance(5000);assert.equal(status(h),'生成失败','B still owns an active timeout');
});
test('Unsolicited and duplicate replies cannot change inspection or running scramble',()=>{
  const h=harness({inspection:true});h.key('keydown');h.key('keyup');const count=h.requests().length;h.key('keydown','n');assert.equal(h.requests().length,count);h.respond(h.initialRequest,ALGORITHMS[1]);assert.equal(status(h),'观察中');assert.equal(h.text('scrambleText'),ALGORITHMS[0]);hold(h);h.respond(h.initialRequest,ALGORITHMS[2]);assert.equal(h.text('scrambleText'),ALGORITHMS[0]);finish(h);assert.equal(h.readRecords()[0].scramble,ALGORITHMS[0]);
});
test('Penalty keys ignore repeat while a new physical press toggles once',()=>{
  const h=harness();hold(h);finish(h);h.key('keydown','1');assert.equal(h.readRecords()[0].penalty,'+2');h.key('keydown','1',{repeat:true});assert.equal(h.readRecords()[0].penalty,'+2');h.key('keyup','1');h.key('keydown','1');assert.equal(h.readRecords()[0].penalty,'ok');h.key('keydown','2');h.key('keydown','2',{repeat:true});assert.equal(h.readRecords()[0].penalty,'dnf');
});
test('Reloaded latest result is immediately editable and deletable',()=>{
  const h=harness({records:[record(0,12000)]});assert.equal(h.text('count'),'1');assert.equal(h.document.getElementById('actions').hidden,false);h.key('keydown','1');assert.equal(h.readRecords()[0].penalty,'+2');h.key('keydown','2');assert.equal(h.readRecords()[0].penalty,'dnf');h.click('deleteLatest');assert.equal(h.readRecords().length,0);assert.equal(h.text('count'),'0');
});
test('Touch arming cancelled by blur does not block a later touch',()=>{
  const h=harness();h.pointer('pointerdown',1);h.advance(300);assert.equal(status(h),'按住');h.window.dispatch('blur');assert.notEqual(status(h),'按住');h.pointer('pointerdown',2);h.advance(300);assert.equal(status(h),'按住');h.pointer('pointerup',2);assert.equal(status(h),'计时中');
});
test('Secondary touch cancels preparation and all contacts must end before the next touch',()=>{
  const h=harness();h.pointer('pointerdown',1);h.advance(150);h.pointer('pointerdown',2);h.pointer('pointercancel',2);h.advance(150);assert.equal(status(h),'就绪');h.pointer('pointercancel',1);h.pointer('pointerdown',3);h.advance(300);h.pointer('pointerup',3);assert.equal(status(h),'计时中');
});
test('Stats and hidden history do not rebuild on hold/start/frame/scramble-only updates',()=>{
  const h=harness({records:[record(0,12000)]});const before=h.metrics();hold(h);h.advance(1000);const during=h.metrics();assert.equal(during.statWrites,before.statWrites,'No statistics writes without data changes');assert.equal(during.historyReplacements,before.historyReplacements,'No history replacement without data changes');h.key('keydown');h.key('keyup');assert.equal(h.text('count'),'2');const afterSave=h.metrics();assert.ok(afterSave.statWrites>before.statWrites);h.respond(h.requests().at(-1),ALGORITHMS[1]);const afterScramble=h.metrics();assert.equal(afterScramble.statWrites,afterSave.statWrites);assert.equal(afterScramble.historyReplacements,afterSave.historyReplacements);
});
test('Collapsed mobile history is not built, and first expansion shows at most 50 rows',()=>{
  const h=harness({width:390,records:Array.from({length:120},(_,index)=>record(index))});assert.equal(h.metrics().historyItemsCreated,0,'Collapsed history avoids record DOM construction');h.click('navReview');assert.equal(h.metrics().historyItemsCreated,0);h.click('historyToggle');const list=h.document.getElementById('historyList');const rows=h.descendants(list).filter(node=>node.className==='history-item');assert.equal(rows.length,50);assert.equal(h.text('count'),'120','Pagination must preserve complete data');
});
test('Load more reveals subsequent history pages without changing statistics or data',()=>{
  const h=harness({records:Array.from({length:120},(_,index)=>record(index))});h.click('navReview');const list=h.document.getElementById('historyList');const rows=()=>h.descendants(list).filter(node=>node.className==='history-item');assert.equal(rows().length,50);const writes=h.metrics().statWrites;h.click('historyMore');assert.equal(rows().length,100);h.click('historyMore');assert.equal(rows().length,120);assert.equal(h.document.getElementById('historyMore').hidden,true);assert.equal(h.metrics().statWrites,writes);assert.equal(h.readRecords().length,120);
});
test('Cross-tab storage changes refresh idle data but wait until active timing completes',()=>{
  const idle=harness({records:[record(0,12000)]});const api=idle.window.StarCubeStore;assert.ok(api,'Real store module is loaded');const peer=api.create({storage:idle.storage});const added=peer.put(Object.assign(record(1,17000),{uid:'external-idle'}));idle.window.dispatch('storage',{key:api.keys.itemPrefix+added.uid});idle.advance(40);assert.equal(idle.text('count'),'2');assert.equal(idle.readRecords().length,2);
  const active=harness({records:[record(0,12000)]});hold(active);const peerActive=active.window.StarCubeStore.create({storage:active.storage});const other=peerActive.put(Object.assign(record(1,17000),{uid:'external-running'}));active.window.dispatch('storage',{key:active.window.StarCubeStore.keys.itemPrefix+other.uid});active.advance(40);assert.equal(status(active),'计时中');assert.equal(active.text('count'),'1','Active timing postpones data presentation changes');active.advance(1000);active.key('keydown');active.key('keyup');assert.equal(active.text('count'),'3');assert.equal(active.readRecords().length,3,'Neither this solve nor the other tab result is lost');
});
test('Next scramble can arrive while the stopping key is still held',()=>{
  const h=harness();hold(h);h.advance(1000);h.key('keydown');assert.equal(h.text('count'),'1');const next=h.requests().at(-1);assert.notEqual(next.requestId,h.initialRequest.requestId);h.respond(next,ALGORITHMS[1]);assert.equal(h.text('scrambleText'),ALGORITHMS[1],'A suppressed stop press must not discard the next valid response');h.advance(5000);assert.equal(h.text('scrambleText'),ALGORITHMS[1],'Accepted response must clear its generation timeout');h.key('keyup');hold(h);h.advance(500);h.key('keydown');h.key('keyup');assert.equal(h.text('count'),'2');assert.equal(h.readRecords()[1].scramble,ALGORITHMS[1]);
});
for(const mode of ['message','error-event'])test('Worker '+mode+' failure is displayed while the stopping key remains held',()=>{
  const h=harness();hold(h);h.advance(1000);h.key('keydown');const pending=h.requests().at(-1);if(mode==='message')h.worker.deliver({cmd:'error',requestId:pending.requestId,message:'test generation failure'});else h.worker.onerror({preventDefault(){}});assert.equal(status(h),'生成失败',mode+' must not wait for the 5-second timeout');assert.equal(h.document.getElementById('retryBtn').hidden,false);h.key('keyup');h.key('keydown','n');const retry=h.requests().at(-1);assert.notEqual(retry.requestId,pending.requestId);h.respond(retry,ALGORITHMS[2]);assert.equal(h.text('scrambleText'),ALGORITHMS[2]);
});
test('Importing a valid maximum safe display id still permits a later solve to save',()=>{
  const imported=Object.assign(record(0,12000),{id:Number.MAX_SAFE_INTEGER});const h=harness({importedRecords:[imported]});assert.equal(h.text('count'),'1');assert.equal(h.readRecords()[0].id,Number.MAX_SAFE_INTEGER);hold(h);h.advance(900);h.key('keydown');h.key('keyup');assert.equal(h.text('count'),'2');const saved=h.readRecords();assert.equal(saved.length,2);assert.ok(saved.every(item=>Number.isSafeInteger(item.id)&&item.id>0),'All subsequently saved display ids stay valid');assert.doesNotMatch(h.text('storageBanner'),/不会被保存|写入失败/);
});
test('A result kept in memory after write failure is included in backup export',()=>{
  const h=harness({records:[record(0,12000)]});hold(h);const prefix=h.window.StarCubeStore.keys.itemPrefix;h.failWrites(key=>key.startsWith(prefix));h.advance(1400);h.key('keydown');h.key('keyup');assert.equal(h.text('count'),'2','The unsaved solve remains visible in memory');assert.equal(h.readRecords().length,1,'Fixture really prevented the second record write');assert.equal(h.document.getElementById('storageBanner').hidden,false);assert.match(h.text('storageBanner'),/不会被保存|写入失败/);h.click('exportData');const payload=h.exportedPayloads().at(-1);assert.ok(payload,'Export produced a real JSON Blob download');assert.equal(payload.records.length,2);assert.ok(payload.records.some(item=>item.ms===1400),'The backup contains the unsaved solve');
});

function select(h,id) { const node=h.document.getElementById('groupSelect'); node.value=id; node.dispatch('change'); }
function createGroup(h,name) {
  h.click('groupNew'); h.document.getElementById('groupName').value=name;
  h.document.getElementById('groupForm').dispatch('submit');
  return h.document.getElementById('groupSelect').value;
}
function groupData() {
  return {format:'starcube',version:3,groups:[{id:'a',origin:'origin-a',name:'A'},{id:'b',origin:'origin-b',name:'B'}],
    records:[...Array.from({length:100},(_,i)=>({...record(i,10000),uid:'a'+i,groupId:'a'})),...Array.from({length:100},(_,i)=>({...record(i,20000),uid:'b'+i,groupId:'b'}))]};
}

test('all statistics and paged history are scoped while global PB spans all groups',()=>{
  const h=harness({importedRecords:groupData()});h.click('navReview');
  for(const [id,expected] of [['a','10.000'],['b','20.000']]) {
    select(h,id); assert.equal(h.text('count'),'100'); assert.equal(h.text('globalPb'),'10.000');
    for(const stat of ['ao5','ao12','ao50','ao100','avg','pb','bestAo5'])assert.equal(h.text(stat),expected,stat);
    assert.equal(h.document.getElementById('historyList').children.length,50);
    h.click('historyMore');assert.equal(h.document.getElementById('historyList').children.length,100);
  }
  select(h,'default');assert.equal(h.text('count'),'0');assert.equal(h.text('timer'),'0.000');assert.equal(h.text('pb'),'—');
  assert.equal(h.document.getElementById('actions').hidden,true);assert.equal(h.document.getElementById('historyList').children.length,0);
  h.key('keydown','1');h.click('deleteLatest');assert.equal(h.readRecords().length,200);
});

test('new, trim, rename, empty group and refresh keep stable identities and selection',()=>{
  const h=harness();const id=createGroup(h,'  今晚练习  ');assert.notEqual(id,'default');
  assert.equal(h.window.StarCubeStore.create({storage:h.storage}).load().groups.find(g=>g.id===id).name,'今晚练习');
  h.click('groupRename');h.document.getElementById('groupName').value='N 1 2';h.document.getElementById('groupForm').dispatch('submit');
  assert.equal(h.document.getElementById('groupSelect').value,id);
  const reloaded=harness({storageEntries:h.entries,sessionEntries:h.sessionEntries});assert.equal(reloaded.document.getElementById('groupSelect').value,id);assert.equal(reloaded.text('count'),'0');
  h.click('groupNew');h.document.getElementById('groupName').value='   ';h.document.getElementById('groupForm').dispatch('submit');assert.match(h.text('groupError'),/1–40/);h.click('groupCancel');
  const second=createGroup(h,'N 1 2');assert.notEqual(second,id);
});

test('latest penalty and delete never act on another group',()=>{
  const h=harness({importedRecords:groupData()});select(h,'a');h.key('keydown','1');
  assert.equal(h.readRecords().find(r=>r.uid==='a99').penalty,'+2');assert.equal(h.readRecords().find(r=>r.uid==='b99').penalty,'ok');
  h.key('keydown','2');assert.equal(h.readRecords().find(r=>r.uid==='a99').penalty,'dnf');
  h.click('deleteLatest');assert.equal(h.text('count'),'99');assert.equal(h.readRecords().filter(r=>r.groupId==='b').length,100);
});

for(const inspection of [false,true])test('group and scramble remain fixed through hold, inspection and run '+inspection,()=>{
  const h=harness({inspection});const a=createGroup(h,'A'),b=createGroup(h,'B');select(h,a);
  h.key('keydown');select(h,b);assert.equal(h.document.getElementById('groupSelect').value,a);assert.equal(h.document.getElementById('groupSelect').disabled,true);
  if(inspection){h.key('keyup');h.key('keydown');}
  h.advance(300);select(h,b);assert.equal(h.document.getElementById('groupSelect').value,a);h.key('keyup');
  const api=h.window.StarCubeStore.create({storage:h.storage});api.put({...record(0,9000),uid:'cross-page',groupId:b});
  h.window.dispatch('storage',{key:api.keys?.itemPrefix||'starcube.records.v2.item.cross-page'});h.advance(50);select(h,b);
  assert.equal(h.document.getElementById('groupSelect').value,a);assert.equal(h.text('scrambleText'),ALGORITHMS[0]);
  finish(h,1000);const saved=h.readRecords().find(r=>r.uid!=='cross-page');assert.equal(saved.groupId,a);assert.equal(saved.scramble,ALGORITHMS[0]);
});

test('editable name, select and contenteditable keys do not trigger timer or shortcuts',()=>{
  const h=harness({records:[record(0)]});const before=h.requests().length;
  h.click('groupNew');
  for(const target of [{tagName:'INPUT'},{tagName:'SELECT'},{tagName:'DIV',isContentEditable:true}])for(const key of [' ','N','1','2']){
    const down=h.key('keydown',key,{target});h.key('keyup',key,{target});assert.ok(!down.defaultPrevented);h.advance(400);
  }
  assert.equal(h.requests().length,before);assert.equal(h.readRecords()[0].penalty,'ok');assert.equal(h.text('status'),'就绪');
});

test('import in progress disables grouping and new timing even with synthetic change events',()=>{
  const h=harness();const a=createGroup(h,'A');select(h,'default');
  const file=h.document.getElementById('importFile');file.files=[{size:100,text:()=>new Promise(()=>{})}];file.dispatch('change');
  assert.equal(h.document.getElementById('groupSelect').disabled,true);select(h,a);assert.equal(h.document.getElementById('groupSelect').value,'default');
  h.key('keydown');h.advance(400);h.key('keyup');assert.equal(h.text('count'),'0');
});

test('two pages keep separate selections and preserve independent new solves',()=>{
  const shared=new Map();const a=harness({sharedEntries:shared});const ga=createGroup(a,'A'),gb=createGroup(a,'B');select(a,ga);
  const b=harness({sharedEntries:shared});select(b,gb);hold(a);hold(b);finish(a,1000);finish(b,1300);
  a.window.dispatch('storage',{key:'starcube.records.v2.item.any'});a.advance(40);
  assert.equal(a.document.getElementById('groupSelect').value,ga);assert.equal(b.document.getElementById('groupSelect').value,gb);
  assert.equal(a.text('count'),'1');assert.equal(b.text('count'),'1');assert.equal(a.readRecords().length,2);
});

test('memory-only groups and solves survive switching and are included in full export',()=>{
  const h=harness();h.failWrites(()=>true);const a=createGroup(h,'未保存 A');hold(h);finish(h,1111);h.respond(h.requests().at(-1));
  const b=createGroup(h,'未保存 B');hold(h);finish(h,2222);select(h,a);assert.equal(h.text('timer'),'1.111');
  h.window.dispatch('storage',{key:'starcube.records.v2.item.other'});h.advance(40);h.click('exportData');
  const payload=h.exportedPayloads().at(-1);assert.equal(payload.version,3);assert.equal(payload.records.length,2);
  assert.deepEqual(new Set(payload.records.map(r=>r.groupId)),new Set([a,b]));assert.equal(payload.groups.length,3);
});

function chooseReviewRecord(h,uid) {
  const picker=h.document.getElementById('reviewRecord');picker.value=uid;picker.dispatch('change');
}
function openHistoryRecord(h,uid) {
  const list=h.document.getElementById('historyList');
  const button=h.descendants(list).find(node=>node.getAttribute('data-record-uid')===uid);
  assert.ok(button,'The selected result has a history detail button');
  list.dispatch('click',{target:button});return button;
}

test('review uses only the last 50 or 100 solves while retaining preceding Ao5 context',()=>{
  const h=harness({records:Array.from({length:120},(_,i)=>record(i,(i+1)*1000))});
  const picker=h.document.getElementById('reviewRecord');
  assert.equal(picker.children.length,0,'Collapsed review creates no point options');
  h.click('navReview');
  assert.match(h.text('reviewSummary'),/第 71–120 次 · 有效 50/);
  assert.equal(h.text('reviewAverage'),'1:35.500');assert.equal(h.text('reviewBest'),'1:11.000');
  assert.equal(picker.children.length,50);assert.match(picker.children[0].textContent,/#71 · 1:11.000 · Ao5 1:09.000/);
  const range=h.document.getElementById('reviewRange');range.value='100';range.dispatch('change');
  assert.match(h.text('reviewSummary'),/第 21–120 次 · 有效 100/);
  assert.equal(h.text('reviewAverage'),'1:10.500');assert.equal(h.text('reviewBest'),'21.000');
  assert.equal(picker.children.length,100);assert.match(picker.children[0].textContent,/#21 · 21.000 · Ao5 19.000/);
  assert.equal(h.text('count'),'120');assert.equal(h.readRecords().length,120);
});

test('review caches data while visible and releases DOM while hidden or collapsed',()=>{
  const h=harness({records:[record(0,12000),record(1,14000)]});h.click('navReview');
  const chart=h.document.getElementById('reviewChart'),picker=h.document.getElementById('reviewRecord');
  const before={chart:chart.replacements,picker:picker.replacements};
  h.click('inspectionToggle');h.click('inspectionToggle');assert.equal(chart.replacements,before.chart);assert.equal(picker.replacements,before.picker);
  h.click('navTimer');assert.equal(chart.children.length,0);assert.equal(picker.children.length,0);
  const hidden={chart:chart.replacements,picker:picker.replacements};
  hold(h);h.advance(1000);
  assert.equal(chart.replacements,hidden.chart);assert.equal(picker.replacements,hidden.picker);
  h.key('keydown');h.key('keyup');assert.equal(h.text('count'),'3');
  assert.equal(chart.replacements,hidden.chart);assert.equal(picker.children.length,0);
  h.respond(h.requests().at(-1));assert.equal(chart.replacements,hidden.chart);
  h.click('navReview');assert.equal(picker.children.length,3);
  h.click('reviewToggle');assert.equal(chart.children.length,0);assert.equal(picker.children.length,0);
  h.click('navTimer');h.click('penaltyPlus');assert.equal(chart.children.length,0,'Collapsed review stays unrendered after an edit');
  h.click('navReview');assert.equal(chart.children.length,0,'The explicit collapse choice survives switching views');
  h.click('reviewToggle');assert.match(picker.children.at(-1).textContent,/#3 · 3.000\+/);
  assert.match(h.text('reviewSelected'),/#2 · 14.000/,'The selected existing solve remains selected after a new solve');
});

test('review selection and empty state follow the current group without leaking old points',()=>{
  const h=harness({importedRecords:groupData()});select(h,'a');h.click('navReview');chooseReviewRecord(h,'a55');
  assert.match(h.text('reviewSelected'),/#56 · 10.000/);
  select(h,'b');assert.equal(h.document.getElementById('reviewRecord').value,'b99');
  assert.equal(h.text('reviewAverage'),'20.000');
  assert.ok(h.document.getElementById('reviewRecord').children.every(node=>node.value.startsWith('b')));
  select(h,'default');assert.equal(h.document.getElementById('reviewEmpty').hidden,false);
  assert.equal(h.document.getElementById('reviewContent').hidden,true);assert.equal(h.document.getElementById('reviewChart').children.length,0);
  assert.equal(h.document.getElementById('reviewRecord').children.length,0);assert.equal(h.text('reviewSelected'),'');
  assert.equal(h.document.getElementById('reviewInspect').disabled,true);h.click('reviewInspect');
  assert.equal(h.document.getElementById('recordDialog').open,false);
});

test('review charts leave a gap for DNF and have finite geometry for identical or all-DNF solves',()=>{
  for(const penalties of [['ok','dnf','ok'],['dnf','dnf','dnf'],['ok','ok','ok']]) {
    const h=harness({records:penalties.map((penalty,i)=>({...record(i,10000),penalty}))});h.click('navReview');
    const chart=h.document.getElementById('reviewChart');
    const single=chart.children.find(node=>node.getAttribute('data-series')==='value').getAttribute('d');
    if(penalties[0]==='dnf'){assert.equal(single,'');assert.equal(h.text('reviewAverage'),'—');assert.equal(h.text('reviewBest'),'—');}
    else if(penalties[1]==='dnf'){assert.equal((single.match(/M/g)||[]).length,2);assert.equal((single.match(/L/g)||[]).length,0);}
    for(const node of chart.children)for(const value of Object.values(node.attributes))assert.doesNotMatch(value,/NaN|Infinity/);
    assert.equal(chart.children.filter(node=>node.getAttribute('data-dnf')!==null).length,penalties.filter(p=>p==='dnf').length);
  }
});

test('history details edit the chosen old solve and update averages without changing the latest solve',()=>{
  const h=harness({records:Array.from({length:5},(_,i)=>record(i,(i+1)*10000))});h.click('navReview');
  const saved=h.readRecords(),old=saved[1],latest=saved[4];
  openHistoryRecord(h,old.uid);assert.equal(h.document.getElementById('recordDialog').open,true);
  assert.equal(h.text('recordTitle'),'第 2 次成绩');assert.equal(h.text('recordRaw'),'20.000');assert.equal(h.text('recordAo5'),'—');
  h.click('recordPlus');
  assert.equal(h.readRecords().find(r=>r.uid===old.uid).penalty,'+2');
  assert.equal(h.readRecords().find(r=>r.uid===latest.uid).penalty,'ok');
  assert.equal(h.text('recordResult'),'22.000+');assert.equal(h.text('recordRaw'),'20.000');
  assert.equal(h.text('avg'),'30.400');assert.equal(h.text('reviewAverage'),'30.400');assert.equal(h.text('ao5'),'30.667');
  assert.equal(h.document.getElementById('recordPlus').getAttribute('aria-pressed'),'true');
  h.click('recordPlus');assert.equal(h.text('recordResult'),'22.000+','Details choose an explicit penalty rather than toggling it');
  h.click('recordDnf');assert.equal(h.text('recordResult'),'DNF');assert.equal(h.text('reviewAverage'),'32.500');assert.equal(h.text('ao5'),'40.000');
  h.click('recordOk');assert.equal(h.text('recordResult'),'20.000');assert.equal(h.text('ao5'),'30.000');
  h.click('recordClose');assert.equal(h.document.getElementById('recordDialog').open,false);
  assert.equal(h.document.activeElement,h.document.getElementById('historyToggle'),'Replaced history trigger falls back to its heading');
});

test('review detail opens the selected solve, shows its rolling Ao5 and restores a live trigger',()=>{
  const h=harness({records:Array.from({length:6},(_,i)=>record(i,(i+1)*1000))});h.click('navReview');
  chooseReviewRecord(h,h.readRecords()[4].uid);h.click('reviewInspect');
  assert.equal(h.text('recordTitle'),'第 5 次成绩');assert.equal(h.text('recordAo5'),'3.000');
  h.document.getElementById('recordDialog').dispatch('cancel');
  assert.equal(h.document.getElementById('recordDialog').open,false);
  assert.equal(h.document.activeElement,h.document.getElementById('reviewInspect'));
  h.click('navTimer');hold(h);assert.equal(status(h),'计时中','Returning from review restores timer availability');
});

test('an open detail blocks timer, latest shortcuts, grouping and import through handler checks',()=>{
  const h=harness({importedRecords:groupData()});select(h,'a');h.click('navReview');chooseReviewRecord(h,'a55');h.click('reviewInspect');
  const count=h.requests().length,previous=JSON.stringify(h.readRecords());
  for(const key of [' ','N','1','2']){h.key('keydown',key);h.advance(400);h.key('keyup',key);}
  h.pointer('pointerdown');h.advance(400);h.pointer('pointerup');
  h.click('penaltyPlus');h.click('penaltyDnf');h.click('deleteLatest');h.click('newScramble');
  select(h,'b');assert.equal(h.document.getElementById('groupSelect').value,'a');
  assert.equal(h.document.getElementById('importData').disabled,true);
  const file=h.document.getElementById('importFile');let read=false;
  file.files=[{size:100,text:()=>{read=true;return Promise.resolve('{}');}}];file.dispatch('change');assert.equal(read,false);
  assert.equal(status(h),'就绪');assert.equal(h.requests().length,count);assert.equal(JSON.stringify(h.readRecords()),previous);
  h.click('recordClose');assert.equal(h.document.getElementById('groupSelect').disabled,false);
});

for(const inspection of [false,true])test('detail cannot open during preparation, inspection or timing '+inspection,()=>{
  const h=harness({inspection,records:[record(0,12000)]});
  const uid=h.readRecords()[0].uid;
  const list=h.document.getElementById('recentList');
  const button=h.descendants(list).find(node=>node.getAttribute('data-record-uid')===uid);
  assert.equal(button.disabled,false);
  h.key('keydown');h.click('reviewInspect');list.dispatch('click',{target:button});
  assert.equal(h.document.getElementById('recordDialog').open,false);assert.equal(h.document.getElementById('reviewInspect').disabled,true);
  assert.equal(button.disabled,true,'Recent detail is disabled without requiring a data-version change');
  if(inspection){h.key('keyup');h.click('reviewInspect');assert.equal(h.document.getElementById('recordDialog').open,false);h.key('keydown');}
  h.advance(300);h.key('keyup');assert.equal(status(h),'计时中');
  h.click('reviewInspect');list.dispatch('click',{target:button});h.click('recordDnf');
  assert.equal(h.document.getElementById('recordDialog').open,false);assert.equal(h.readRecords()[0].penalty,'ok');assert.equal(button.disabled,true);
});

test('history details disable during group editing and import, then reenable after editing',()=>{
  const h=harness({records:[record(0,12000)]});h.click('navReview');
  const buttons=()=>h.descendants(h.document.getElementById('historyList')).filter(node=>node.getAttribute('data-record-uid')!==null);
  assert.ok(buttons().every(button=>!button.disabled));h.click('groupNew');assert.ok(buttons().every(button=>button.disabled));
  h.click('groupCancel');assert.ok(buttons().every(button=>!button.disabled));
  const file=h.document.getElementById('importFile');file.files=[{size:100,text:()=>new Promise(()=>{})}];file.dispatch('change');
  assert.ok(buttons().every(button=>button.disabled));
});

test('Space stops a running touch timer even when a button retains keyboard focus',()=>{
  const h=harness({records:[record(0,12000)]});
  const button={tagName:'BUTTON'};
  h.pointer('pointerdown');h.advance(300);h.pointer('pointerup');assert.equal(status(h),'计时中');
  h.advance(1234);h.key('keydown',' ',{target:button,repeat:true});assert.equal(status(h),'计时中','Repeated key does not stop');
  h.key('keydown',' ',{target:button,isComposing:true});assert.equal(status(h),'计时中','IME composition does not stop');
  h.key('keydown',' ',{target:button});h.key('keyup',' ',{target:button});
  assert.notEqual(status(h),'计时中');assert.equal(h.readRecords().at(-1).ms,1234);
  assert.equal(h.readRecords().length,2);
});

test('focused review controls and historical result buttons do not trigger global timer shortcuts',()=>{
  const h=harness({records:[record(0,12000)]});h.click('navReview');const before=h.requests().length;
  for(const target of [{tagName:'SELECT'},{tagName:'BUTTON'}])for(const key of [' ','N','1','2']){
    const down=h.key('keydown',key,{target});h.advance(400);h.key('keyup',key,{target});assert.ok(!down.defaultPrevented);
  }
  assert.equal(status(h),'就绪');assert.equal(h.requests().length,before);assert.equal(h.readRecords()[0].penalty,'ok');
});

test('a concurrent deletion closes open details and cannot be revived by a stale penalty action',()=>{
  for(const deliverEvent of [false,true]) {
    const h=harness({records:[record(0,12000),record(1,15000)]});h.click('navReview');const uid=h.readRecords()[0].uid;openHistoryRecord(h,uid);
    const peer=h.window.StarCubeStore.create({storage:h.storage});peer.remove(uid);
    if(deliverEvent){h.window.dispatch('storage',{key:'starcube.records.v2.deleted.'+uid});h.advance(40);}
    h.click('recordPlus');assert.equal(h.document.getElementById('recordDialog').open,false);
    assert.equal(h.readRecords().length,1);assert.equal(h.readRecords()[0].ms,15000);
    assert.equal(h.text('count'),'1');assert.match(h.text('dataFeedback'),/详情已关闭/);
    assert.equal(h.readRecords().some(r=>r.uid===uid),false);
  }
});

test('detail editing reads concurrent updates before saving and review refreshes on storage events',()=>{
  const h=harness({records:[record(0,12000),record(1,15000)]});h.click('navReview');
  const old=h.readRecords()[0];openHistoryRecord(h,old.uid);
  const peer=h.window.StarCubeStore.create({storage:h.storage});peer.put({...old,ms:18000,scramble:ALGORITHMS[2]});
  h.click('recordPlus');const updated=h.readRecords().find(r=>r.uid===old.uid);
  assert.equal(updated.ms,18000);assert.equal(updated.scramble,ALGORITHMS[2]);assert.equal(updated.penalty,'+2');
  assert.equal(h.text('recordResult'),'20.000+');assert.equal(h.text('reviewAverage'),'17.500');
  peer.put({...updated,ms:21000,penalty:'ok'});h.window.dispatch('storage',{key:'starcube.records.v2.item.'+old.uid});h.advance(40);
  assert.equal(h.text('recordResult'),'21.000');assert.equal(h.text('reviewAverage'),'18.000');
});

test('failed historical edits remain in memory, update review and survive group switching and export',()=>{
  const h=harness({importedRecords:groupData()});select(h,'a');h.click('navReview');chooseReviewRecord(h,'a55');h.click('reviewInspect');
  h.failWrites(key=>key.startsWith('starcube.records.v2.item.'));h.click('recordPlus');
  assert.equal(h.readRecords().find(r=>r.uid==='a55').penalty,'ok','Persistent record really remained unchanged');
  assert.equal(h.text('recordResult'),'12.000+');assert.match(h.text('recordFeedback'),/本页修改/);
  assert.equal(h.text('reviewAverage'),'10.040');h.click('recordClose');select(h,'b');select(h,'a');
  assert.equal(h.text('reviewAverage'),'10.040');
  h.window.dispatch('storage',{key:'starcube.records.v2.item.a55'});h.advance(40);assert.equal(h.text('reviewAverage'),'10.040');
  h.click('exportData');assert.equal(h.exportedPayloads().at(-1).records.find(r=>r.uid==='a55').penalty,'+2');
});

test('view switching preserves the same worker, scramble, group and stored records',()=>{
  const h=harness({importedRecords:groupData()});select(h,'b');
  const worker=h.worker,requests=h.requests().length,raw=JSON.stringify([...h.entries]),scramble=h.text('scrambleText');
  assert.equal(h.document.getElementById('timerView').hidden,false);assert.equal(h.document.getElementById('reviewView').hidden,true);
  h.click('navReview');assert.equal(h.document.getElementById('app').dataset.view,'review');
  assert.equal(h.document.getElementById('navReview').getAttribute('aria-pressed'),'true');
  assert.equal(h.document.activeElement,h.document.getElementById('reviewView'));
  h.click('navTimer');assert.equal(h.document.activeElement,h.document.getElementById('pad'));
  assert.equal(h.document.getElementById('groupSelect').value,'b');assert.equal(h.text('scrambleText'),scramble);
  assert.equal(h.worker,worker);assert.equal(h.requests().length,requests);assert.equal(JSON.stringify([...h.entries]),raw);
});

for(const inspection of [false,true])test('both navigation controls and handler guards lock throughout an active solve '+inspection,()=>{
  const h=harness({inspection});
  function assertLocked(){
    for(const id of ['navTimer','navReview','recentReview']){assert.equal(h.document.getElementById(id).disabled,true);h.click(id);}
    assert.equal(h.document.getElementById('app').dataset.view,'timer');
  }
  h.key('keydown');assertLocked();
  if(inspection){h.key('keyup');assertLocked();h.key('keydown');}
  h.advance(300);assertLocked();h.key('keyup');assert.equal(status(h),'计时中');assertLocked();
  h.advance(1000);h.key('keydown');assertLocked();h.key('keyup');
  assert.equal(h.document.getElementById('navReview').disabled,false);h.click('navReview');
  assert.equal(h.document.getElementById('app').dataset.view,'review');assert.equal(h.text('count'),'1');
});

test('navigation locks during group editing, a modal and pending import on either view',()=>{
  for(const view of ['timer','review']) {
    const h=harness({records:[record(0)]});if(view==='review')h.click('navReview');
    const stay=()=>{h.click(view==='timer'?'navReview':'navTimer');assert.equal(h.document.getElementById('app').dataset.view,view);};
    h.click('groupNew');assert.equal(h.document.getElementById('navReview').disabled,true);stay();h.click('groupCancel');
    if(view==='review')h.click('reviewInspect');else {
      const list=h.document.getElementById('recentList');list.dispatch('click',{target:h.descendants(list).find(n=>n.getAttribute('data-record-uid')!==null)});
    }
    assert.equal(h.document.getElementById('recordDialog').open,true);stay();h.click('recordClose');
    const file=h.document.getElementById('importFile');file.files=[{size:100,text:()=>new Promise(()=>{})}];file.dispatch('change');
    assert.equal(h.document.getElementById('navTimer').disabled,true);assert.equal(h.document.getElementById('navReview').disabled,true);stay();
  }
});

test('review background keyboard and hidden timer handlers cannot start or change a solve',()=>{
  const h=harness({records:[record(0)]});h.click('navReview');const raw=JSON.stringify(h.readRecords()),requests=h.requests().length;
  for(const name of [' ','N','1','2']){const down=h.key('keydown',name);h.advance(400);h.key('keyup',name);assert.ok(!down.defaultPrevented);}
  h.pointer('pointerdown');h.advance(400);h.pointer('pointerup');h.click('penaltyPlus');h.click('deleteLatest');h.click('newScramble');
  assert.equal(status(h),'就绪');assert.equal(JSON.stringify(h.readRecords()),raw);assert.equal(h.requests().length,requests);
  h.click('navTimer');hold(h);assert.equal(status(h),'计时中');
});

test('core summaries and five recent records follow group changes and historical UID edits',()=>{
  const h=harness({importedRecords:groupData()});select(h,'b');
  const list=h.document.getElementById('recentList');assert.equal(list.children.length,5);assert.equal(h.text('timerGroupName'),'B');
  for(const [a,b] of [['coreAo5','ao5'],['coreAo12','ao12'],['corePb','pb'],['coreCount','count'],['coreGlobalPb','globalPb']])assert.equal(h.text(a),h.text(b));
  const target=h.descendants(list).find(n=>n.getAttribute('data-record-uid')==='b97');list.dispatch('click',{target});h.click('recordPlus');
  assert.equal(h.readRecords().find(r=>r.uid==='b97').penalty,'+2');assert.equal(h.readRecords().find(r=>r.uid==='b99').penalty,'ok');
  h.click('recordClose');assert.equal(h.document.activeElement,h.document.getElementById('pad'));
  assert.equal(h.text('coreAo5'),h.text('ao5'));assert.equal(h.text('coreGlobalPb'),'10.000');
  h.click('navReview');select(h,'a');h.click('navTimer');assert.equal(h.text('timerGroupName'),'A');
  assert.ok(h.descendants(list).filter(n=>n.getAttribute('data-record-uid')!==null).every(n=>n.getAttribute('data-record-uid').startsWith('a')));
  select(h,'default');assert.equal(list.children.length,0);assert.equal(h.document.getElementById('recentEmpty').hidden,false);
});

test('recent rows and statistics stay cached during every timing frame',()=>{
  const h=harness({records:[record(0)]});const list=h.document.getElementById('recentList'),before=list.replacements,stats=h.metrics().statWrites;
  hold(h);for(let i=0;i<60;i++)h.advance(16);
  assert.equal(list.replacements,before);assert.equal(h.metrics().statWrites,stats);
  h.key('keydown');h.key('keyup');assert.equal(list.children.length,2);assert.equal(list.replacements,before+1);
});

test('hidden history releases DOM and restores its pagination and collapse choice',()=>{
  const h=harness({records:Array.from({length:120},(_,i)=>record(i))});const list=h.document.getElementById('historyList');
  assert.equal(list.children.length,0);h.click('navReview');h.click('historyMore');assert.equal(list.children.length,100);
  h.click('navTimer');assert.equal(list.children.length,0);h.click('navReview');assert.equal(list.children.length,100);
  h.click('historyToggle');assert.equal(list.children.length,0);h.click('navTimer');h.click('navReview');assert.equal(list.children.length,0);
  h.click('historyToggle');assert.equal(list.children.length,100);
});

test('first review reveal and resize use the visible chart dimensions only',()=>{
  const h=harness({records:[record(0)]});const chart=h.document.getElementById('reviewChart');
  chart.clientWidth=960;chart.clientHeight=280;h.window.dispatch('resize');assert.equal(chart.children.length,0);
  h.click('navReview');assert.equal(chart.getAttribute('viewBox'),'0 0 960 280');
  chart.clientWidth=320;chart.clientHeight=236;h.window.dispatch('resize');assert.equal(chart.getAttribute('viewBox'),'0 0 320 236');
  h.click('navTimer');const replacements=chart.replacements;h.window.dispatch('resize');assert.equal(chart.replacements,replacements);
  chart.clientWidth=720;h.click('navReview');assert.equal(chart.getAttribute('viewBox'),'0 0 720 236');
});

test('ready inspection communicates +2 and DNF thresholds while the key stays held',()=>{
  const h=harness({inspection:true});h.key('keydown');h.key('keyup');h.advance(14500);h.key('keydown');h.advance(300);
  assert.equal(h.document.getElementById('pad').dataset.state,'ready');assert.doesNotMatch(h.text('subStatus'),/\+2|DNF/);
  h.advance(200);assert.match(h.text('subStatus'),/\+2/);assert.equal(h.document.getElementById('pad').dataset.penalty,'+2');
  h.advance(2000);assert.match(h.text('subStatus'),/DNF/);assert.equal(h.document.getElementById('pad').dataset.penalty,'dnf');
  h.key('keyup');finish(h);assert.equal(h.readRecords()[0].penalty,'dnf');
});

test('reload restores the selected group while beginning safely in the timer view',()=>{
  const h=harness({importedRecords:groupData()});select(h,'b');h.click('navReview');
  const reloaded=harness({storageEntries:h.entries,sessionEntries:h.sessionEntries});
  assert.equal(reloaded.document.getElementById('groupSelect').value,'b');assert.equal(reloaded.document.getElementById('app').dataset.view,'timer');
  assert.equal(reloaded.text('coreCount'),'100');assert.equal(reloaded.document.getElementById('reviewChart').children.length,0);
});

test('browser cancellation of the initial inspection touch cancels observation and unlocks navigation',()=>{
  const h=harness({inspection:true});h.pointer('pointerdown',1);h.advance(100);
  assert.equal(status(h),'观察中');h.pointer('pointercancel',1);
  assert.equal(status(h),'就绪');assert.equal(h.document.getElementById('navReview').disabled,false);
  assert.equal(h.document.getElementById('cancelInspection').hidden,true);assert.equal(h.readRecords().length,0);
  h.advance(1500);h.pointer('pointerup',1);assert.equal(status(h),'就绪');assert.equal(h.text('timer'),'0.000');
  h.click('navReview');assert.equal(h.document.getElementById('app').dataset.view,'review');
  h.click('navTimer');h.pointer('pointerdown',2);h.pointer('pointerup',2);assert.equal(status(h),'观察中');
});

test('cancelling a later preparation touch preserves an already-started inspection',()=>{
  const h=harness({inspection:true});h.pointer('pointerdown',1);h.pointer('pointerup',1);h.advance(1000);
  h.pointer('pointerdown',2);h.advance(100);h.pointer('pointercancel',2);
  assert.equal(status(h),'观察中');assert.equal(h.document.getElementById('navReview').disabled,true);
  assert.equal(h.document.getElementById('cancelInspection').hidden,false);assert.equal(h.readRecords().length,0);
  h.pointer('pointerdown',3);h.advance(300);assert.equal(status(h),'按住');h.pointer('pointercancel',3);
  assert.equal(status(h),'观察中');assert.equal(h.document.getElementById('navReview').disabled,true);
  h.pointer('pointerdown',4);h.advance(300);h.pointer('pointerup',4);assert.equal(status(h),'计时中');
  finish(h);assert.equal(h.readRecords()[0].penalty,'ok');
});

for(const [boundary,penalty,label] of [[15000,'+2','+2'],[17000,'dnf','DNF']])test('holding inspection reports the '+boundary+' ms penalty before arming completes',()=>{
  const h=harness({inspection:true});h.key('keydown');h.key('keyup');h.advance(boundary-100);h.key('keydown');h.advance(100);
  assert.equal(status(h),'观察中');assert.equal(h.document.getElementById('pad').dataset.penalty,penalty);
  assert.ok(h.text('subStatus').includes(label));assert.match(h.text('subStatus'),/保持到变绿/);
  h.key('keyup');h.key('keydown','Escape');h.key('keyup','Escape');
  assert.equal(status(h),'就绪');assert.equal(h.document.getElementById('pad').dataset.penalty,'ok');
  assert.equal(h.document.getElementById('navReview').disabled,false);assert.equal(h.readRecords().length,0);
});

test('actual view switches return to the top and focus without hiding the scramble',()=>{
  const h=harness({width:390,records:[record(0)]});const pad=h.document.getElementById('pad'),review=h.document.getElementById('reviewView');
  h.window.scrollTo(0,700);h.click('navReview');
  assert.equal(h.window.scrollY,0);assert.equal(h.document.activeElement,review);assert.equal(review.focusCalls.at(-1).preventScroll,true);
  h.window.scrollTo(0,340);const beforeSameReview=h.window.scrollCalls.length;h.click('navReview');
  assert.equal(h.window.scrollY,340);assert.equal(h.window.scrollCalls.length,beforeSameReview,'Clicking the current review preserves manual scroll');
  h.click('navTimer');assert.equal(h.window.scrollY,0);assert.equal(h.document.activeElement,pad);assert.equal(pad.focusCalls.at(-1).preventScroll,true);
  h.window.scrollTo(0,180);const beforeSameTimer=h.window.scrollCalls.length;h.click('navTimer');
  assert.equal(h.window.scrollY,180);assert.equal(h.window.scrollCalls.length,beforeSameTimer,'Clicking the current timer preserves manual scroll');
});

test('state changes and timer frames never reset manual page scrolling',()=>{
  const h=harness();h.window.scrollTo(0,180);const calls=h.window.scrollCalls.length;
  hold(h);for(let i=0;i<30;i++)h.advance(16);h.key('keydown');h.key('keyup');h.respond(h.requests().at(-1));
  assert.equal(h.window.scrollCalls.length,calls);assert.equal(h.window.scrollY,180);
  h.click('groupNew');h.click('groupCancel');assert.equal(h.window.scrollCalls.length,calls);
});

function pointerAction(h,id) {
  const node=h.document.getElementById(id);node.tagName='BUTTON';node.focus();
  node.dispatch('click',{target:node,detail:1});return node;
}
function focusedSpace(h,milliseconds=300) {
  const down=h.key('keydown',' ',{target:h.document.activeElement});h.advance(milliseconds);
  h.key('keyup',' ',{target:h.document.activeElement});return down;
}
function drag(h,type,id,x,y,pointerType='touch') {
  return h.document.getElementById('pad').dispatch(type,{pointerId:id,pointerType,clientX:x,clientY:y});
}

for(const action of ['penaltyPlus','penaltyDnf','deleteLatest'])test('pointer '+action+' hands the next Space to timing without repeating the action',()=>{
  const h=harness({records:[record(0),record(1)]});pointerAction(h,action);
  assert.equal(h.document.activeElement,h.document.getElementById('pad'));
  assert.equal(h.document.activeElement.focusCalls.at(-1).preventScroll,true);
  const before=h.readRecords().length,prior=JSON.stringify(h.readRecords());
  const down=focusedSpace(h);assert.ok(down.defaultPrevented);assert.equal(status(h),'计时中');
  assert.equal(JSON.stringify(h.readRecords()),prior,'Beginning the next solve must not edit or delete another record');
  h.advance(500);focusedSpace(h,0);assert.equal(h.readRecords().length,before+1);
});

test('pointer inspection toggle and cancel restore immediate keyboard timing',()=>{
  const h=harness();pointerAction(h,'inspectionToggle');assert.equal(h.document.activeElement,h.document.getElementById('pad'));
  focusedSpace(h,0);assert.equal(status(h),'观察中');pointerAction(h,'cancelInspection');
  assert.equal(status(h),'就绪');assert.equal(h.document.activeElement,h.document.getElementById('pad'));
  focusedSpace(h,0);assert.equal(status(h),'观察中');focusedSpace(h);assert.equal(status(h),'计时中');
  h.advance(500);focusedSpace(h,0);assert.equal(h.readRecords().length,1);assert.equal(h.readRecords()[0].penalty,'ok');
});

test('pointer new scramble and retry keep timer focus through asynchronous delivery',()=>{
  const h=harness();pointerAction(h,'newScramble');assert.equal(h.document.activeElement,h.document.getElementById('pad'));
  h.respond(h.requests().at(-1),ALGORITHMS[1]);focusedSpace(h);assert.equal(status(h),'计时中');
  h.advance(500);focusedSpace(h,0);h.advance(5000);assert.equal(status(h),'生成失败');
  pointerAction(h,'retryBtn');assert.equal(h.document.activeElement,h.document.getElementById('pad'));
  h.respond(h.requests().at(-1),ALGORITHMS[2]);focusedSpace(h);assert.equal(status(h),'计时中');
});

test('pointer group selection returns to the timer while keyboard selection retains the select',()=>{
  const h=harness({importedRecords:groupData()});const selectNode=h.document.getElementById('groupSelect');selectNode.tagName='SELECT';
  selectNode.focus();selectNode.dispatch('pointerdown',{target:selectNode});selectNode.value='a';selectNode.dispatch('change');
  assert.equal(h.document.activeElement,h.document.getElementById('pad'));focusedSpace(h);assert.equal(status(h),'计时中');
  h.advance(500);focusedSpace(h,0);h.respond(h.requests().at(-1));
  selectNode.focus();selectNode.dispatch('pointerdown',{target:selectNode});selectNode.dispatch('keydown',{key:'ArrowDown',target:selectNode});selectNode.value='b';selectNode.dispatch('change');
  assert.equal(h.document.activeElement,selectNode);const down=focusedSpace(h);assert.ok(!down.defaultPrevented);assert.notEqual(status(h),'计时中');
  assert.equal(h.readRecords().at(-1).groupId,'a');
});

test('keyboard and assistive control clicks keep focus and native Space semantics',()=>{
  const h=harness({records:[record(0)]});const plus=h.document.getElementById('penaltyPlus');plus.tagName='BUTTON';plus.focus();
  let down=focusedSpace(h);assert.ok(!down.defaultPrevented);assert.equal(status(h),'就绪');
  plus.dispatch('click',{target:plus,detail:0});assert.equal(h.readRecords()[0].penalty,'+2');assert.equal(h.document.activeElement,plus);
  down=focusedSpace(h);assert.ok(!down.defaultPrevented);plus.dispatch('click',{target:plus,detail:0});assert.equal(h.readRecords()[0].penalty,'ok');
  assert.equal(h.document.activeElement,plus);assert.equal(h.readRecords().length,1);
});

test('closing a recent detail returns to immediate timing even when no penalty was edited',()=>{
  const h=harness({records:[record(0)]});const list=h.document.getElementById('recentList');
  const button=h.descendants(list).find(n=>n.getAttribute('data-record-uid')!==null);list.dispatch('click',{target:button,detail:1});
  assert.equal(h.document.getElementById('recordDialog').open,true);h.click('recordClose');
  assert.equal(h.document.activeElement,h.document.getElementById('pad'));focusedSpace(h);assert.equal(status(h),'计时中');
  assert.equal(h.document.getElementById('app').dataset.view,'timer');
});

for(const inspection of [false,true])test('a touch slide cancels the initial action without saving or locking navigation '+inspection,()=>{
  const h=harness({inspection});const pad=h.document.getElementById('pad');
  const down=drag(h,'pointerdown',1,100,100);assert.ok(!down.defaultPrevented,'Touch down must permit browser scrolling');
  h.advance(150);drag(h,'pointermove',1,100,160);h.advance(400);drag(h,'pointerup',1,100,160);
  assert.equal(status(h),'就绪');assert.equal(h.readRecords().length,0);assert.equal(h.document.getElementById('navReview').disabled,false);
  assert.equal(pad.hasPointerCapture(1),false);assert.equal(h.text('scrambleText'),ALGORITHMS[0]);
  drag(h,'pointerdown',2,100,100);if(inspection){drag(h,'pointerup',2,100,100);assert.equal(status(h),'观察中');}
  else {h.advance(300);drag(h,'pointerup',2,100,100);assert.equal(status(h),'计时中');}
});

test('moving after ready cancels both ordinary and inspection preparations without a solve',()=>{
  for(const inspection of [false,true]) {
    const h=harness({inspection});if(inspection){drag(h,'pointerdown',1,100,100);drag(h,'pointerup',1,100,100);h.advance(1000);}
    drag(h,'pointerdown',2,100,100);h.advance(300);assert.equal(status(h),'按住');
    drag(h,'pointermove',2,111,100);drag(h,'pointerup',2,111,100);
    assert.equal(status(h),inspection?'观察中':'就绪');assert.equal(h.readRecords().length,0);
    assert.equal(h.document.getElementById('navReview').disabled,inspection);
    if(inspection){drag(h,'pointerdown',3,100,100);h.advance(100);drag(h,'pointermove',3,100,112);drag(h,'pointerup',3,100,112);assert.equal(status(h),'观察中');}
  }
});

test('small touch jitter and ordinary mouse holds still reach the 300 ms threshold',()=>{
  for(const pointerType of ['touch','mouse']){
    const h=harness();drag(h,'pointerdown',1,100,100,pointerType);h.advance(150);
    drag(h,'pointermove',1,pointerType==='mouse'?160:106,pointerType==='mouse'?160:106,pointerType);
    h.advance(149);assert.notEqual(status(h),'按住');h.advance(1);assert.equal(status(h),'按住');
    drag(h,'pointerup',1,100,100,pointerType);assert.equal(status(h),'计时中');
  }
});

for(const inspection of [false,true])test('a second touch outside the pad cancels the gesture until every contact ends '+inspection,()=>{
  const h=harness({inspection});drag(h,'pointerdown',1,100,100);h.advance(100);
  h.window.dispatch('pointerdown',{pointerId:2,pointerType:'touch',clientX:300,clientY:100});
  assert.equal(status(h),'就绪');assert.equal(h.document.getElementById('pad').hasPointerCapture(1),false);
  h.window.dispatch('pointerup',{pointerId:2,pointerType:'touch'});
  drag(h,'pointerdown',3,200,100);h.advance(400);drag(h,'pointerup',3,200,100);
  assert.equal(status(h),'就绪','An unreleased first contact still blocks the multi-touch gesture');
  h.window.dispatch('pointerup',{pointerId:1,pointerType:'touch'});
  drag(h,'pointerdown',4,100,100);h.advance(300);drag(h,'pointerup',4,100,100);
  assert.equal(status(h),inspection?'观察中':'计时中');assert.equal(h.readRecords().length,0);
});

test('a running touch-down stops immediately and later movement never saves a second solve',()=>{
  const h=harness();hold(h);h.advance(1234);drag(h,'pointerdown',1,100,100);
  assert.equal(h.readRecords().length,1);assert.equal(h.readRecords()[0].ms,1234);
  drag(h,'pointermove',1,100,180);h.advance(400);drag(h,'pointerup',1,100,180);
  assert.equal(h.readRecords().length,1);assert.notEqual(status(h),'计时中');
  h.respond(h.requests().at(-1));hold(h);assert.equal(status(h),'计时中');
});

test('average detail exposes chronological rows, trimmed extremes and the actual +2 calculation',()=>{
  const rows=[record(0,10000),record(1,11000),{...record(2,10000),penalty:'+2'},record(3,13000),record(4,14000)];
  const h=harness({records:rows});h.click('coreAo5Detail');
  assert.equal(h.document.getElementById('averageDialog').open,true);
  assert.equal(h.text('averageTitle'),'Ao5 明细');assert.equal(h.text('averageResult'),'12.000');
  assert.match(h.text('averageFormula'),/36\.000.*3.*12\.000/);
  const items=h.document.getElementById('averageRows').children;
  assert.equal(items.length,5);assert.deepEqual(items.map(row=>row.children[0].textContent),['#1','#2','#3','#4','#5']);
  assert.equal(items[0].getAttribute('data-excluded'),'best');assert.equal(items[4].getAttribute('data-excluded'),'worst');
  assert.equal(items[2].getAttribute('data-excluded'),'');assert.match(items[2].textContent,/原始 10\.000 \+ 2 秒/);
});

test('average details stay unavailable for short sessions and Ao12 uses the current group only',()=>{
  const short=harness({records:Array.from({length:4},(_,i)=>record(i))});
  assert.equal(short.document.getElementById('coreAo5Detail').disabled,true);
  short.click('coreAo5Detail');assert.equal(short.document.getElementById('averageDialog').open,false);
  const h=harness({importedRecords:groupData()});select(h,'b');h.click('navReview');h.click('ao12Detail');
  assert.equal(h.text('averageTitle'),'Ao12 明细');assert.equal(h.text('averageResult'),'20.000');
  assert.match(h.text('averageGroup'),/^B · 第 89–100 次$/);
  assert.equal(h.document.getElementById('averageRows').children.length,12);
  assert.ok(h.document.getElementById('averageRows').children.every(row=>row.getAttribute('data-record-uid').startsWith('b')));
});

test('average modal locks timer and penalty shortcuts, then cancel restores its trigger focus',()=>{
  const h=harness({records:Array.from({length:5},(_,i)=>record(i))});const trigger=h.document.getElementById('coreAo5Detail');
  const before=JSON.stringify(h.readRecords()),requests=h.requests().length;
  h.click('coreAo5Detail');h.key('keydown');h.advance(400);h.key('keyup');
  for(const key of ['1','2','n']){h.key('keydown',key);h.key('keyup',key);}
  h.click('deleteLatest');assert.equal(JSON.stringify(h.readRecords()),before);
  assert.equal(h.requests().length,requests);assert.notEqual(status(h),'计时中');
  assert.equal(h.document.getElementById('soundToggle').disabled,true);
  const event=h.document.getElementById('averageDialog').dispatch('cancel');assert.equal(event.defaultPrevented,true);
  assert.equal(h.document.getElementById('averageDialog').open,false);assert.equal(h.document.activeElement,trigger);
  hold(h);assert.equal(status(h),'计时中');
});

test('open average details refresh on peer edits and close if deletion leaves too few solves',()=>{
  const h=harness({records:Array.from({length:5},(_,i)=>record(i,10000+i*1000))});h.click('coreAo5Detail');
  const api=h.window.StarCubeStore,peer=api.create({storage:h.storage}),row=h.readRecords()[2];
  peer.put({...row,penalty:'+2'});h.window.dispatch('storage',{key:api.keys.itemPrefix+row.uid});h.advance(40);
  assert.equal(h.document.getElementById('averageDialog').open,true);assert.equal(h.text('averageResult'),'12.667');
  assert.match(h.text('averageRows'),/原始 12\.000 \+ 2 秒/);
  peer.remove(row.uid);h.window.dispatch('storage',{key:api.keys.deletedPrefix+row.uid});h.advance(40);
  assert.equal(h.document.getElementById('averageDialog').open,false);assert.equal(h.text('count'),'4');
  assert.match(h.text('dataFeedback'),/平均值明细已关闭/);
});

function audioProbe() {
  const calls=[];
  return {calls,create(options){return {
    setEnabled(value){calls.push(['enabled',value]);},unlock(){calls.push(['unlock']);},
    startInspection(){calls.push(['start']);},updateInspection(elapsed){calls.push(['update',elapsed]);},
    stop(){calls.push(['stop']);},preview(){calls.push(['preview']);},
    getStatus(){return {state:'ready',message:''};}
  };}};
}

test('inspection sound defaults off and an explicit choice survives reload',()=>{
  const probe=audioProbe(),h=harness({inspection:true,audioFactory:probe.create});
  assert.equal(h.document.getElementById('soundToggle').getAttribute('aria-checked'),'false');
  assert.deepEqual(probe.calls,[['enabled',false]]);
  h.click('soundToggle');assert.equal(JSON.parse(h.storage.getItem('starcube.settings.v1')).inspectionSound,true);
  const next=audioProbe(),reloaded=harness({storageEntries:h.entries,audioFactory:next.create});
  assert.equal(reloaded.document.getElementById('soundToggle').getAttribute('aria-checked'),'true');
  assert.deepEqual(next.calls,[['enabled',true]],'Reload alone must not attempt gesture-only audio unlock');
});

test('unsupported audio reports its limitation without preventing ordinary timing',()=>{
  const h=harness();h.click('soundPreview');h.click('soundToggle');
  assert.match(h.text('soundFeedback'),/不支持提示音/);
  assert.equal(h.document.getElementById('soundPreview').getAttribute('aria-busy'),'false');
  hold(h);finish(h,1234);assert.equal(h.readRecords()[0].ms,1234);
});

test('sound preview is independent of the enabled setting, records and timer state',()=>{
  const probe=audioProbe(),h=harness({inspection:true,records:[record(0)],audioFactory:probe.create});
  const before=JSON.stringify(h.readRecords()),scramble=h.text('scrambleText'),state=status(h),requests=h.requests().length;
  h.click('soundPreview');assert.deepEqual(probe.calls,[['enabled',false],['preview']]);
  assert.equal(JSON.stringify(h.readRecords()),before);assert.equal(h.text('scrambleText'),scramble);
  assert.equal(status(h),state);assert.equal(h.requests().length,requests);
  assert.equal(h.document.getElementById('soundToggle').getAttribute('aria-checked'),'false');
  const button=h.document.getElementById('soundPreview');button.tagName='BUTTON';button.focus();
  button.dispatch('click',{target:button,detail:0});assert.equal(h.document.activeElement,button);
  button.dispatch('click',{target:button,detail:1});assert.equal(h.document.activeElement,h.document.getElementById('pad'));
  focusedSpace(h);assert.equal(status(h),'观察中','Pointer preview returns focus for the next timer action');
});

test('inspection audio unlocks before starting, receives elapsed frames, and stops on run or cancellation',()=>{
  const probe=audioProbe(),h=harness({inspection:true,audioFactory:probe.create});h.click('soundToggle');probe.calls.length=0;
  h.key('keydown');h.key('keyup');assert.deepEqual(probe.calls.slice(0,3),[['stop'],['unlock'],['start']]);
  h.advance(8000);assert.ok(probe.calls.some(call=>call[0]==='update'&&call[1]===8000));
  hold(h);assert.equal(probe.calls.at(-1)[0],'stop');
  for(const cancel of ['escape','blur','hidden']){
    const audio=audioProbe(),other=harness({inspection:true,audioFactory:audio.create});other.click('soundToggle');
    other.key('keydown');other.key('keyup');audio.calls.length=0;
    if(cancel==='escape')other.key('keydown','Escape');
    if(cancel==='blur')other.window.dispatch('blur');
    if(cancel==='hidden'){other.document.hidden=true;other.document.dispatch('visibilitychange');}
    assert.equal(audio.calls.at(-1)[0],'stop',cancel);assert.equal(other.readRecords().length,0);
  }
});

test('backup appears at 100 old records and snooze persists until another 100 net records',()=>{
  const h=harness({records:Array.from({length:100},(_,i)=>record(i))});
  assert.equal(h.document.getElementById('backupReminder').hidden,false);h.click('backupLater');
  assert.equal(h.document.getElementById('backupReminder').hidden,true);
  const reloaded=harness({storageEntries:h.entries}),api=reloaded.window.StarCubeStore,peer=api.create({storage:reloaded.storage});
  assert.equal(reloaded.document.getElementById('backupReminder').hidden,true);
  for(let i=100;i<199;i++)peer.put({...record(i),uid:'added-'+i});
  reloaded.window.dispatch('storage',{key:api.keys.itemPrefix+'added-198'});reloaded.advance(40);
  assert.equal(reloaded.document.getElementById('backupReminder').hidden,true);
  peer.put({...record(199),uid:'added-199'});reloaded.window.dispatch('storage',{key:api.keys.itemPrefix+'added-199'});reloaded.advance(40);
  assert.equal(reloaded.document.getElementById('backupReminder').hidden,false);assert.equal(reloaded.text('count'),'200');
});

test('backup export includes every group, resets reminder and excludes reminder metadata from JSON',()=>{
  const h=harness({importedRecords:groupData()});select(h,'a');h.click('backupExport');
  const payload=h.exportedPayloads().at(-1);assert.ok(payload);assert.equal(payload.records.length,200);
  assert.ok(payload.groups.some(group=>group.id==='b'));assert.equal(h.document.getElementById('backupReminder').hidden,true);
  assert.deepEqual(Object.keys(payload).sort(),['backups','exportedAt','format','groups','records','version']);
  assert.doesNotMatch(JSON.stringify(payload),/lastExportRequestedAt|exportedFingerprint|reminderCount|starcube\.backup\.v1/);
  assert.ok(JSON.parse(h.storage.getItem('starcube.backup.v1')).lastExportRequestedAt>0);
  assert.match(h.text('backupStatus'),/上次发起导出/);assert.match(h.text('dataFeedback'),/请确认文件已保存/);
  h.key('keydown','1');assert.match(h.text('backupStatus'),/此后数据有更改/);
});

test('backup metadata write failure does not put record storage into memory mode',()=>{
  const h=harness({records:Array.from({length:100},(_,i)=>record(i))});h.failWrites(key=>key==='starcube.backup.v1');
  h.click('backupExport');assert.equal(h.exportedPayloads().at(-1).records.length,100);
  assert.match(h.text('backupStatus'),/提醒状态仅保留在本页/);assert.doesNotMatch(h.text('storageBanner'),/不会被保存|写入失败/);
  hold(h);h.advance(1234);h.key('keydown');h.key('keyup');
  assert.equal(h.readRecords().length,101);assert.ok(h.readRecords().some(row=>row.ms===1234));
  assert.equal(h.document.getElementById('storageBanner').hidden,true);
});

test('cross-tab backup-only events refresh reminders without changing records',()=>{
  const a=harness({records:Array.from({length:100},(_,i)=>record(i))});
  const b=harness({sharedEntries:a.entries}),before=JSON.stringify(b.readRecords());
  assert.equal(b.document.getElementById('backupReminder').hidden,false);a.click('backupLater');
  b.window.dispatch('storage',{key:'starcube.backup.v1'});assert.equal(b.document.getElementById('backupReminder').hidden,true);
  a.click('exportData');b.window.dispatch('storage',{key:'starcube.backup.v1'});
  assert.match(b.text('backupStatus'),/上次发起导出/);assert.equal(JSON.stringify(b.readRecords()),before);
});

console.log('\n'+passed+' passed, '+failures+' failed');
if(failures)process.exitCode=1;
