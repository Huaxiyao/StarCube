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
  let wallEpoch = options.now === undefined ? Date.now() : new Date(options.now).getTime();
  function HarnessDate(...args) {
    if (!new.target) return new Date(wallEpoch + now - 1000).toString();
    return args.length ? new Date(...args) : new Date(wallEpoch + now - 1000);
  }
  Object.setPrototypeOf(HarnessDate,Date);HarnessDate.prototype=Date.prototype;
  HarnessDate.now=()=>wallEpoch + now - 1000;
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
    const captured = new Set(), classes = new Set();
    const node=Object.assign(eventTarget(),{tagName:tag.toUpperCase(),id,hidden:id==='toast',disabled:false,open:false,style:{},dataset:{},children:[],attributes:{},scrollTop:0,textWrites:0,replacements:0,focusCalls:[],scrollIntoViewCalls:[],
      classList:{toggle(name,force){const has=classes.has(name),next=force===undefined?!has:!!force;if(next)classes.add(name);else classes.delete(name);return next;},add(...names){for(const name of names)classes.add(name);},remove(...names){for(const name of names)classes.delete(name);},contains(name){return classes.has(name);}},
      appendChild(child){this.children.push(child);child.parentNode=this;return child;},
      append(...children){for(const child of children)this.appendChild(child);},
      replaceChildren(...children){this.replacements++;for(const child of this.children)child.parentNode=null;this.children=[];for(const child of children){if(child.tagName==='#FRAGMENT')for(const item of child.children)this.appendChild(item);else this.appendChild(child);}},
      remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);},
      setAttribute(key,value){this.attributes[key]=String(value);},getAttribute(key){return this.attributes[key] ?? null;},
      setPointerCapture(id){captured.add(id);},releasePointerCapture(id){if(captured.delete(id))this.dispatch('lostpointercapture',{pointerId:id});},hasPointerCapture(id){return captured.has(id);},
      click(){if(this.tagName==='A')downloads.push({name:this.download,blob:blobUrls.get(this.href)});this.dispatch('click',{target:this});},focus(options){this.focusCalls.push(options||null);document.activeElement=this;},scrollIntoView(options){this.scrollIntoViewCalls.push(options||null);},querySelectorAll(selector){return descendants(this).filter(child=>selector===child.tagName.toLowerCase());},
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
    createElement:tag=>element(tag),createElementNS:(ns,tag)=>element(tag),createDocumentFragment:()=>element('#fragment'),
    execCommand:options.execCommand});
  document.documentElement=element('html');
  document.body=element('body');
  const navigator=options.navigator !== undefined ? options.navigator : (options.clipboard ? {clipboard:options.clipboard} : {});
  const window=Object.assign(eventTarget(),{innerWidth:options.width || 1440,scrollX:0,scrollY:0,scrollCalls:[],scrollTo(x,y){this.scrollX=x;this.scrollY=y;this.scrollCalls.push({x,y});},localStorage:storage,sessionStorage:{getItem:k=>sessionEntries.get(k)||null,setItem:(k,v)=>sessionEntries.set(k,v)},location:{protocol:'file:',href:'file:///test/starcube.html'},confirm:()=>true,navigator});
  if(options.nativeBridge)window.StarCubeNative=options.nativeBridge;
  class Worker {
    constructor(){this.requests=[];workers.push(this);}
    postMessage(message){this.requests.push(JSON.parse(JSON.stringify(message)));}
    terminate(){this.terminated=true;}
    deliver(data){this.onmessage({data});}
  }
  const quietConsole={warn(...args){warnings.push(args.join(' '));},error(...args){warnings.push(args.join(' '));},log(){}};
  const context={window,self:window,document,navigator,localStorage:storage,Worker,performance:{now:()=>now},console:quietConsole,
    setTimeout(callback,delay){const id=sequence++;timers.set(id,{callback,at:now+(delay||0)});return id;},clearTimeout(id){timers.delete(id);},
    setInterval(callback,delay){const id=sequence++,interval=Math.max(1,Number(delay)||0);timers.set(id,{callback,at:now+interval,interval});return id;},clearInterval(id){timers.delete(id);},
    requestAnimationFrame(callback){const id=sequence++;rafs.set(id,callback);return id;},cancelAnimationFrame(id){rafs.delete(id);},
    Blob:class{constructor(parts,settings){this.parts=parts;this.type=settings&&settings.type;}},URL:{createObjectURL(blob){const url='blob:test-app-regression-'+(++urlSequence);blobUrls.set(url,blob);return url;},revokeObjectURL(url){blobUrls.delete(url);}},Date:HarnessDate,Math,JSON,String,Array,Object,Number,Map,Set,Infinity,isFinite};
  vm.createContext(context);
  for(const name of ['stats.js','review.js','store.js','audio.js','backup.js','app.js']) {
    const file=path.join(__dirname,'../src',name);
    if(name==='store.js'&&!fs.existsSync(file))continue;
    if(name==='app.js'&&options.audioFactory)window.StarCubeAudio={create:options.audioFactory};
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:name});
    if(name==='store.js'&&options.importedRecords)window.StarCubeStore.create({storage}).importRecords(options.importedRecords);
  }
  function advance(milliseconds){const end=now+milliseconds;while(true){let next=null;for(const [id,timer] of timers)if(timer.at<=end&&(!next||timer.at<next[1].at))next=[id,timer];if(!next)break;now=next[1].at;if(next[1].interval)next[1].at+=next[1].interval;else timers.delete(next[0]);next[1].callback();}now=end;const frames=[...rafs.values()];rafs.clear();for(const callback of frames)callback(now);}
  function setNow(value){wallEpoch=new Date(value).getTime()-now+1000;}
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
  return {advance,setNow,key,pointer,click,text,readRecords,requests,respond,initialRequest,worker,window,document,nodes,allNodes,storage,entries,sessionEntries,warnings,metrics,descendants,failWrites,downloads,exportedPayloads};
}

let failures=0,passed=0;
const pendingTests=[];
function test(name,callback){
  try{
    const result=callback();
    if(result&&typeof result.then==='function'){
      pendingTests.push(result.then(()=>{passed++;console.log('PASS '+name);},error=>{failures++;console.error('FAIL '+name+'\n'+error.stack);}));
      return;
    }
    passed++;console.log('PASS '+name);
  }catch(error){failures++;console.error('FAIL '+name+'\n'+error.stack);}
}
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

function openAverageRecord(h,uid) {
  const list=h.document.getElementById('averageRows');
  const button=h.descendants(list).find(node=>node.tagName==='BUTTON'&&node.getAttribute('data-record-uid')===uid);
  assert.ok(button,'The average contains an accessible result button');
  list.dispatch('click',{target:button});return button;
}

test('historical deletion restores the exact UID, group, penalty and statistics on undo',()=>{
  const payload=groupData();payload.records.find(row=>row.uid==='a55').penalty='+2';
  const h=harness({importedRecords:payload});select(h,'a');h.click('navReview');
  const original=JSON.stringify(h.readRecords()),average=h.text('avg');
  openHistoryRecord(h,'a55');h.click('recordDelete');
  assert.equal(h.document.getElementById('recordDialog').open,false);assert.equal(h.text('count'),'99');
  assert.equal(h.readRecords().some(row=>row.uid==='a55'),false);
  assert.equal(h.readRecords().filter(row=>row.groupId==='b').length,100);
  assert.match(h.text('undoMessage'),/A.*第 56 次.*12\.000\+/);assert.equal(h.document.activeElement,h.document.getElementById('undoDelete'));
  h.click('undoDelete');assert.equal(h.text('count'),'100');assert.equal(h.text('avg'),average);
  assert.equal(JSON.stringify(h.readRecords()),original,'Undo must retain identity and every stored field');
  assert.equal(h.document.getElementById('undoDelete').hidden,true);assert.match(h.text('undoMessage'),/已恢复/);
});

test('multiple deletions undo in reverse order and remain available after changing groups',()=>{
  const h=harness({importedRecords:groupData()});select(h,'a');h.click('deleteLatest');
  select(h,'b');h.click('deleteLatest');assert.equal(h.readRecords().length,198);
  assert.match(h.text('undoDelete'),/2/);h.click('undoDelete');
  assert.ok(h.readRecords().some(row=>row.uid==='b99'));assert.ok(!h.readRecords().some(row=>row.uid==='a99'));
  assert.equal(h.document.getElementById('groupSelect').value,'b');assert.equal(h.text('count'),'100');
  h.click('undoDelete');assert.equal(h.readRecords().length,200);assert.ok(h.readRecords().some(row=>row.uid==='a99'));
  assert.equal(h.document.getElementById('groupSelect').value,'b','Undo must not change the active training');
});

test('cross-page deletion and explicit restoration refresh the other page through storage events',()=>{
  const a=harness({records:[record(0),record(1)]}),b=harness({sharedEntries:a.entries});
  const api=a.window.StarCubeStore,uid=a.readRecords()[1].uid;
  a.click('deleteLatest');b.window.dispatch('storage',{key:api.keys.deletedPrefix+uid});b.advance(40);
  assert.equal(b.text('count'),'1');a.click('undoDelete');
  const restoreKey=[...a.entries.keys()].find(key=>key.startsWith(api.keys.restoredPrefix));assert.ok(restoreKey);
  b.window.dispatch('storage',{key:restoreKey});b.advance(40);assert.equal(b.text('count'),'2');
  assert.equal(JSON.stringify(b.readRecords()),JSON.stringify(a.readRecords()));
});

test('an obsolete undo cannot revive a newer deletion in another page',()=>{
  const h=harness({records:[record(0)]}),api=h.window.StarCubeStore,uid=h.readRecords()[0].uid;
  h.click('deleteLatest');api.create({storage:h.storage}).remove(uid);h.click('undoDelete');
  assert.equal(h.readRecords().length,0);assert.equal(h.text('count'),'0');
  assert.match(h.text('undoMessage'),/未能撤销/);assert.equal(h.document.getElementById('undoDelete').hidden,true);
});

test('failed delete retains the record and failed undo remains retryable without a success message',()=>{
  const h=harness({records:[record(0),record(1)]}),api=h.window.StarCubeStore;
  const before=JSON.stringify(h.readRecords());h.click('navReview');openHistoryRecord(h,h.readRecords()[0].uid);
  h.failWrites(key=>key.startsWith(api.keys.deletedPrefix));h.click('recordDelete');
  assert.equal(JSON.stringify(h.readRecords()),before);assert.equal(h.document.getElementById('recordDialog').open,true);
  assert.match(h.text('recordFeedback'),/删除未完成.*成绩仍保留/);
  h.failWrites(null);h.click('recordDelete');assert.equal(h.text('count'),'1');
  h.failWrites(key=>key.startsWith(api.keys.restoredPrefix));h.click('undoDelete');
  assert.equal(h.readRecords().length,1);assert.match(h.text('undoMessage'),/未能撤销/);
  assert.equal(h.document.getElementById('undoDelete').hidden,false,'A transient failure must leave undo available');
  h.failWrites(null);h.click('undoDelete');assert.equal(JSON.stringify(h.readRecords()),before);assert.match(h.text('undoMessage'),/已恢复/);
});

test('average to result to penalty edit returns to the same window, focus and scroll position',()=>{
  const h=harness({records:Array.from({length:7},(_,i)=>record(i,10000+i*1000))});
  const edited=h.readRecords()[4],anchor=h.readRecords()[6].uid;h.click('coreAo5Detail');
  const average=h.document.getElementById('averageDialog');average.scrollTop=96;
  openAverageRecord(h,edited.uid);assert.equal(average.open,false);assert.equal(h.document.getElementById('recordDialog').open,true);
  assert.equal(h.text('recordClose'),'返回明细');h.click('recordPlus');h.click('recordClose');
  assert.equal(average.open,true);assert.equal(h.document.getElementById('recordDialog').open,false);assert.equal(average.scrollTop,96);
  assert.match(h.text('averageGroup'),/第 3–7 次/);assert.equal(h.text('averageResult'),'14.667');
  assert.equal(h.document.activeElement.getAttribute('data-record-uid'),edited.uid);
  assert.equal(h.document.getElementById('averageRows').children.at(-1).getAttribute('data-record-uid'),anchor);
  h.click('averageClose');assert.equal(average.open,false);assert.equal(h.document.activeElement,h.document.getElementById('coreAo5Detail'));
});

test('historical result opens its own Ao5 and returns through native cancel without stacking dialogs',()=>{
  const h=harness({records:Array.from({length:10},(_,i)=>record(i,(i+1)*1000))});h.click('navReview');
  const uid=h.readRecords()[5].uid;openHistoryRecord(h,uid);h.document.getElementById('recordDialog').scrollTop=42;
  assert.equal(h.text('recordAo5'),'4.000');h.click('recordAo5Detail');
  assert.equal(h.document.getElementById('recordDialog').open,false);assert.equal(h.document.getElementById('averageDialog').open,true);
  assert.match(h.text('averageGroup'),/第 2–6 次/);assert.equal(h.text('averageResult'),'4.000');assert.equal(h.text('averageClose'),'返回成绩');
  h.document.getElementById('averageDialog').dispatch('cancel');
  assert.equal(h.document.getElementById('recordDialog').open,true);assert.equal(h.document.getElementById('averageDialog').open,false);
  assert.equal(h.text('recordTitle'),'第 6 次成绩');assert.equal(h.document.getElementById('recordDialog').scrollTop,42);
  assert.equal(h.document.activeElement,h.document.getElementById('recordAo5Detail'));
});

test('best Ao5 links to its historical five solves rather than the latest window',()=>{
  const h=harness({records:[10,11,12,13,14,30,31,32,33,34].map((seconds,i)=>record(i,seconds*1000))});h.click('navReview');
  assert.equal(h.text('ao5'),'32.000');assert.equal(h.text('bestAo5'),'12.000');h.click('bestAo5Detail');
  assert.equal(h.text('averageResult'),'12.000');assert.match(h.text('averageGroup'),/第 1–5 次/);
  const api=h.window.StarCubeStore,peer=api.create({storage:h.storage});peer.put({...record(10,35000),uid:'later-solve'});
  h.window.dispatch('storage',{key:api.keys.itemPrefix+'later-solve'});h.advance(40);
  assert.match(h.text('averageGroup'),/第 1–5 次/,'An appended solve must not move the open historical window');
});

test('PB entry points inspect and edit their original group without switching current training',()=>{
  const h=harness({importedRecords:groupData()});select(h,'b');
  h.click('corePbDetail');assert.equal(h.text('recordGroup'),'B');assert.equal(h.text('recordResult'),'20.000');h.click('recordClose');
  h.click('coreGlobalPbDetail');assert.equal(h.text('recordGroup'),'A');assert.equal(h.text('recordResult'),'10.000');
  h.click('recordPlus');assert.equal(h.readRecords().find(row=>row.uid==='a0').penalty,'+2');
  assert.equal(h.document.getElementById('groupSelect').value,'b');assert.equal(h.text('corePb'),'20.000');h.click('recordClose');
  h.click('navReview');h.click('pbDetail');assert.equal(h.text('recordGroup'),'B');h.click('recordClose');
  h.click('globalPbDetail');assert.equal(h.text('recordGroup'),'A');assert.equal(h.text('recordResult'),'10.000');
  h.click('recordDelete');assert.equal(h.document.getElementById('groupSelect').value,'b');assert.equal(h.text('count'),'100');
  assert.equal(h.readRecords().filter(row=>row.groupId==='a').length,99);h.click('undoDelete');assert.equal(h.readRecords().length,200);
});

test('empty and all-DNF sessions disable best links while historical short windows disable Ao5',()=>{
  for(const rows of [[],Array.from({length:5},(_,i)=>({...record(i),penalty:'dnf'}))]) {
    const h=harness({records:rows});
    for(const id of ['corePbDetail','pbDetail','coreGlobalPbDetail','globalPbDetail','bestAo5Detail']) {
      assert.equal(h.document.getElementById(id).disabled,true,id);h.click(id);
      assert.equal(h.document.getElementById('recordDialog').open,false);assert.equal(h.document.getElementById('averageDialog').open,false);
    }
  }
  const h=harness({records:Array.from({length:4},(_,i)=>record(i))});h.click('corePbDetail');
  assert.equal(h.document.getElementById('recordAo5Detail').disabled,true);h.click('recordAo5Detail');
  assert.equal(h.document.getElementById('recordDialog').open,true);assert.equal(h.document.getElementById('averageDialog').open,false);
});

test('deleting an average endpoint safely exits invalid parents and undo restores the window',()=>{
  const h=harness({records:Array.from({length:6},(_,i)=>record(i))}),uid=h.readRecords()[5].uid;
  h.click('coreAo5Detail');openAverageRecord(h,uid);h.click('recordDelete');
  assert.equal(h.document.getElementById('recordDialog').open,false);assert.equal(h.document.getElementById('averageDialog').open,false);
  assert.equal(h.text('count'),'5');assert.equal(h.document.activeElement,h.document.getElementById('undoDelete'));
  h.click('undoDelete');h.click('coreAo5Detail');assert.match(h.text('averageGroup'),/第 2–6 次/);
  assert.equal(h.document.getElementById('averageRows').children.at(-1).getAttribute('data-record-uid'),uid);
});

test('deleting an inner average result returns to valid parent and supports undo inside that dialog',()=>{
  const h=harness({records:Array.from({length:7},(_,i)=>record(i,10000+i*1000))}),uid=h.readRecords()[4].uid;
  h.click('coreAo5Detail');openAverageRecord(h,uid);h.click('recordDelete');
  assert.equal(h.document.getElementById('recordDialog').open,false);assert.equal(h.document.getElementById('averageDialog').open,true);
  assert.equal(h.text('count'),'6');assert.equal(h.document.activeElement,h.document.getElementById('averageUndo'));
  h.click('averageUndo');assert.equal(h.text('count'),'7');assert.match(h.text('averageGroup'),/第 3–7 次/);assert.equal(h.text('averageResult'),'14.000');
});

test('new detail entry points and undo respect active timing and nested dialogs keep shortcut locks',()=>{
  const h=harness({records:Array.from({length:7},(_,i)=>record(i))});h.click('deleteLatest');const afterDelete=JSON.stringify(h.readRecords());
  hold(h);assert.equal(h.document.getElementById('undoDelete').disabled,true);
  for(const id of ['undoDelete','corePbDetail','coreGlobalPbDetail','bestAo5Detail'])h.click(id);
  assert.equal(JSON.stringify(h.readRecords()),afterDelete);assert.equal(h.document.getElementById('recordDialog').open,false);
  h.key('keydown');h.key('keyup');h.respond(h.requests().at(-1));h.click('undoDelete');
  h.click('coreAo5Detail');openAverageRecord(h,h.readRecords().at(-1).uid);
  const before=JSON.stringify(h.readRecords()),requests=h.requests().length;
  for(const key of [' ','1','2','n']){h.key('keydown',key);h.advance(400);h.key('keyup',key);}
  assert.equal(JSON.stringify(h.readRecords()),before);assert.equal(h.requests().length,requests);assert.notEqual(status(h),'计时中');
});

const REVIEW_NOW = new Date(2026,10,14,12,0,0).getTime();
function dateRecord(index,offset,ms,penalty='ok',groupId) {
  const row={...record(index,ms),uid:'date-'+index,penalty,at:new Date(2026,10,14+offset,10,0,index).toISOString()};
  if(groupId)row.groupId=groupId;
  return row;
}
function reviewRange(h,value) {
  h.click('navReview');const range=h.document.getElementById('reviewRange');range.value=String(value);range.dispatch('change');
}

test('today comparison uses local dates and displays full-period counts, averages, spread and DNF rates',()=>{
  const rows=[dateRecord(0,-1,10000),dateRecord(1,-1,14000),dateRecord(2,-1,9000,'dnf'),
    dateRecord(3,0,8000),dateRecord(4,0,12000),dateRecord(5,0,16000),dateRecord(6,0,9000,'dnf')];
  const h=harness({now:REVIEW_NOW,records:rows});reviewRange(h,'today');
  assert.equal(h.document.getElementById('reviewComparison').hidden,false);
  assert.equal(h.text('reviewCurrentLabel'),'今天');assert.equal(h.text('reviewPreviousLabel'),'昨天');
  assert.equal(h.text('compareCountCurrent'),'4');assert.equal(h.text('compareCountPrevious'),'3');
  assert.equal(h.text('compareAverageCurrent'),'12.000');assert.equal(h.text('compareAveragePrevious'),'12.000');
  assert.equal(h.text('compareStddevCurrent'),'3.266');assert.equal(h.text('compareStddevPrevious'),'2.000');
  assert.equal(parseFloat(h.text('compareDnfCurrent')),25);assert.equal(parseFloat(h.text('compareDnfPrevious')),33.3);
  assert.equal(h.text('compareCountDelta'),'多 1 次');assert.equal(h.text('compareAverageDelta'),'持平');
  assert.equal(h.text('compareStddevDelta'),'增大 1.266 秒');assert.equal(h.text('compareDnfDelta'),'下降 8.3 个百分点');
  assert.equal(h.document.getElementById('reviewRecord').children.length,4);
  assert.ok(h.document.getElementById('reviewRecord').children[0].textContent.startsWith('#4'));
  assert.match(h.text('reviewPeriod'),/11/);assert.match(h.text('reviewPeriod'),/14/);
});

test('seven-day comparison includes today and compares against the immediately preceding seven local dates',()=>{
  const rows=[dateRecord(0,-14,99000),dateRecord(1,-13,40000),dateRecord(2,-7,30000),
    dateRecord(3,-6,20000),dateRecord(4,-1,10000),dateRecord(5,0,15000),dateRecord(6,1,99000)];
  const h=harness({now:REVIEW_NOW,records:rows});reviewRange(h,'7days');
  assert.equal(h.text('reviewCurrentLabel'),'最近 7 天');assert.equal(h.text('reviewPreviousLabel'),'前 7 天');
  assert.equal(h.text('compareCountCurrent'),'3');assert.equal(h.text('compareCountPrevious'),'2');
  assert.equal(h.text('compareAverageCurrent'),'15.000');assert.equal(h.text('compareAveragePrevious'),'35.000');
  assert.equal(h.text('compareStddevCurrent'),'4.082');assert.equal(h.text('compareStddevPrevious'),'5.000');
  assert.equal(h.text('compareAverageDelta'),'快 20.000 秒');assert.equal(h.text('compareStddevDelta'),'减小 0.918 秒');
  assert.equal(h.document.getElementById('reviewRecord').children.length,3);
});

test('an empty current period still shows previous-period comparison and does not invent zero averages',()=>{
  const h=harness({now:REVIEW_NOW,records:[dateRecord(0,-1,10000),dateRecord(1,-1,14000)]});reviewRange(h,'today');
  assert.equal(h.document.getElementById('reviewComparison').hidden,false);
  assert.equal(h.document.getElementById('reviewContent').hidden,true);assert.equal(h.document.getElementById('reviewEmpty').hidden,false);
  assert.equal(h.text('compareCountCurrent'),'0');assert.equal(h.text('compareCountPrevious'),'2');
  for(const id of ['compareAverageCurrent','compareStddevCurrent','compareDnfCurrent','compareAverageDelta','compareStddevDelta','compareDnfDelta'])assert.equal(h.text(id),'—',id);
  assert.equal(h.text('compareAveragePrevious'),'12.000');assert.equal(h.text('compareStddevPrevious'),'2.000');
  assert.equal(h.document.getElementById('reviewRecord').children.length,0);
});

test('all-DNF and single-valid-solve date periods retain counts but leave unsupported spread blank',()=>{
  const rows=[dateRecord(0,-1,9000),dateRecord(1,0,10000,'dnf'),dateRecord(2,0,12000,'dnf')];
  const h=harness({now:REVIEW_NOW,records:rows});reviewRange(h,'today');
  assert.equal(h.text('compareCountCurrent'),'2');assert.equal(h.text('compareCountPrevious'),'1');
  assert.equal(h.text('compareAverageCurrent'),'—');assert.equal(h.text('compareAveragePrevious'),'9.000');
  assert.equal(h.text('compareStddevCurrent'),'—');assert.equal(h.text('compareStddevPrevious'),'—');
  assert.equal(parseFloat(h.text('compareDnfCurrent')),100);assert.equal(parseFloat(h.text('compareDnfPrevious')),0);
  assert.equal(h.text('compareAverageDelta'),'—');assert.equal(h.text('compareStddevDelta'),'—');
  assert.match(h.text('reviewCompareNote'),/样本|不足/);
});

test('date comparisons immediately follow penalty edits, historical deletion and undo',()=>{
  const h=harness({now:REVIEW_NOW,importedRecords:[dateRecord(0,-1,20000),dateRecord(1,0,10000),dateRecord(2,0,12000)]});reviewRange(h,'today');
  openHistoryRecord(h,'date-1');h.click('recordPlus');
  assert.equal(h.text('compareAverageCurrent'),'12.000');assert.equal(h.text('compareStddevCurrent'),'0.000');
  h.click('recordDelete');assert.equal(h.text('compareCountCurrent'),'1');assert.equal(h.text('compareStddevCurrent'),'—');
  assert.equal(h.text('compareCountPrevious'),'1');assert.equal(h.text('compareAveragePrevious'),'20.000');
  h.click('undoDelete');assert.equal(h.text('compareCountCurrent'),'2');assert.equal(h.text('compareAverageCurrent'),'12.000');
  openHistoryRecord(h,'date-2');h.click('recordDnf');
  assert.equal(h.text('compareAverageCurrent'),'12.000');assert.equal(h.text('compareStddevCurrent'),'—');
  assert.equal(parseFloat(h.text('compareDnfCurrent')),50);
});

test('date review preserves its range across groups without leaking another training into comparison',()=>{
  const payload={format:'starcube',version:3,groups:[{id:'a',origin:'oa',name:'A'},{id:'b',origin:'ob',name:'B'}],
    records:[dateRecord(0,-1,20000,'ok','a'),dateRecord(1,0,10000,'ok','a'),dateRecord(2,0,14000,'ok','a'),
      dateRecord(3,-1,50000,'ok','b'),dateRecord(4,0,40000,'ok','b')]};
  const h=harness({now:REVIEW_NOW,importedRecords:payload});select(h,'a');reviewRange(h,'today');
  assert.equal(h.text('compareAverageCurrent'),'12.000');assert.equal(h.text('compareCountCurrent'),'2');
  select(h,'b');assert.equal(h.document.getElementById('reviewRange').value,'today');
  assert.equal(h.text('compareAverageCurrent'),'40.000');assert.equal(h.text('compareAveragePrevious'),'50.000');
  assert.equal(h.text('compareCountCurrent'),'1');assert.equal(h.document.getElementById('reviewRecord').children.length,1);
});

test('a date-filtered graph keeps group solve numbers and opens historical Ao5 across the date boundary',()=>{
  const rows=[10,11,12,13,14].map((seconds,i)=>dateRecord(i,i===4?0:-1,seconds*1000));
  const h=harness({now:REVIEW_NOW,importedRecords:rows});reviewRange(h,'today');
  const picker=h.document.getElementById('reviewRecord');assert.equal(picker.children.length,1);
  assert.match(picker.children[0].textContent,/#5.*14\.000.*Ao5 12\.000/);
  chooseReviewRecord(h,'date-4');h.click('reviewInspect');assert.equal(h.text('recordAo5'),'12.000');h.click('recordAo5Detail');
  assert.equal(h.text('averageResult'),'12.000');assert.match(h.text('averageGroup'),/第 1–5 次/);
  assert.deepEqual(h.document.getElementById('averageRows').children.map(row=>row.getAttribute('data-record-uid')),['date-0','date-1','date-2','date-3','date-4']);
});

test('date charts cap at 100 points while summary covers the whole period and count modes remain compatible',()=>{
  const rows=Array.from({length:150},(_,i)=>dateRecord(i,0,i<50?100000:10000));
  const h=harness({now:REVIEW_NOW,records:rows});reviewRange(h,'today');
  assert.equal(h.text('compareCountCurrent'),'150');assert.equal(h.text('compareAverageCurrent'),'40.000');
  assert.equal(h.text('reviewAverage'),'40.000');assert.equal(h.document.getElementById('reviewRecord').children.length,100);
  assert.match(h.document.getElementById('reviewRecord').children[0].textContent,/^#51 /);
  assert.match(h.text('reviewSummary')+' '+h.text('reviewCompareNote'),/100/);
  h.document.getElementById('reviewChart').dispatch('click',{clientX:74});assert.match(h.text('reviewSelected'),/^#51 /);
  h.document.getElementById('reviewChart').dispatch('click',{clientX:746});assert.match(h.text('reviewSelected'),/^#150 /);
  reviewRange(h,50);assert.equal(h.document.getElementById('reviewComparison').hidden,true);
  assert.equal(h.text('reviewAverage'),'10.000');assert.equal(h.document.getElementById('reviewRecord').children.length,50);
  assert.match(h.text('reviewSummary'),/第 101–150 次/);
  reviewRange(h,100);assert.equal(h.document.getElementById('reviewComparison').hidden,true);
  assert.equal(h.document.getElementById('reviewRecord').children.length,100);assert.match(h.text('reviewSummary'),/第 51–150 次/);
});

test('an open today review advances to the next local day on the minute refresh',()=>{
  const tomorrow={...dateRecord(2,1,20000),at:new Date(2026,10,15,0,0,0).toISOString()};
  const h=harness({now:new Date(2026,10,14,23,59,30),records:[dateRecord(0,-1,5000),dateRecord(1,0,10000),tomorrow]});reviewRange(h,'today');
  assert.equal(h.text('compareAverageCurrent'),'10.000');assert.equal(h.text('compareAveragePrevious'),'5.000');
  h.advance(60001);assert.equal(h.text('compareAverageCurrent'),'20.000');assert.equal(h.text('compareAveragePrevious'),'10.000');
  assert.equal(h.text('compareCountCurrent'),'1');assert.match(h.text('reviewPeriod'),/15/);
});

test('returning to the foreground refreshes an elapsed date without requiring a timer callback or data edit',()=>{
  const h=harness({now:REVIEW_NOW,records:[dateRecord(0,0,10000),dateRecord(1,1,20000)]});reviewRange(h,'today');
  assert.equal(h.text('compareAverageCurrent'),'10.000');h.document.hidden=true;h.document.dispatch('visibilitychange');
  h.setNow(new Date(2026,10,15,12,0,0));h.document.hidden=false;h.document.dispatch('visibilitychange');
  assert.equal(h.text('compareAverageCurrent'),'20.000');assert.equal(h.text('compareAveragePrevious'),'10.000');
  assert.equal(h.document.getElementById('reviewRange').value,'today');
});

function historyButtons(h) {
  return h.descendants(h.document.getElementById('historyList')).filter(node=>node.tagName==='BUTTON'&&node.getAttribute('data-record-uid'));
}
function historyUids(h) { return historyButtons(h).map(node=>node.getAttribute('data-record-uid')); }
function historyDateHeadings(h) {
  return h.descendants(h.document.getElementById('historyList')).filter(node=>String(node.className).split(' ').includes('history-date'));
}

for(const [entry,continueButton] of [['coreAo5Detail','averageContinue'],['corePbDetail','recordContinue']]) {
  test(entry+' offers an explicit continue action that returns to timing without changing a solve or scramble',()=>{
    const h=harness({records:Array.from({length:7},(_,i)=>record(i))});
    h.window.scrollTo(0,175);const before=JSON.stringify(h.readRecords()),scramble=h.text('scrambleText'),requests=h.requests().length;
    h.click(entry);assert.equal(h.document.getElementById(continueButton).hidden,false);h.window.scrollTo(0,500);
    h.click(continueButton);
    assert.equal(h.document.getElementById('recordDialog').open,false);assert.equal(h.document.getElementById('averageDialog').open,false);
    assert.equal(h.document.activeElement,h.document.getElementById('pad'));assert.equal(h.window.scrollY,175);
    assert.equal(h.text('scrambleText'),scramble);assert.equal(h.requests().length,requests);assert.equal(JSON.stringify(h.readRecords()),before);
    assert.notEqual(status(h),'计时中','Continuing returns to the pad but does not start a solve');
    focusedSpace(h);assert.equal(status(h),'计时中','The next full Space press/release starts normally');
  });
}

test('continue from a nested average/result clears the entire navigation trail and preserves the current group',()=>{
  const h=harness({importedRecords:groupData()});select(h,'b');h.window.scrollTo(0,230);
  const scramble=h.text('scrambleText');h.click('coreAo5Detail');openAverageRecord(h,'b99');
  assert.equal(h.text('recordClose'),'返回明细');assert.equal(h.document.getElementById('recordContinue').hidden,false);
  h.click('recordAo5Detail');assert.equal(h.text('averageClose'),'返回成绩');h.click('averageContinue');
  assert.equal(h.document.getElementById('recordDialog').open,false);assert.equal(h.document.getElementById('averageDialog').open,false);
  assert.equal(h.document.activeElement,h.document.getElementById('pad'));assert.equal(h.window.scrollY,230);
  assert.equal(h.document.getElementById('groupSelect').value,'b');assert.equal(h.text('scrambleText'),scramble);
  h.click('corePbDetail');assert.equal(h.text('recordClose'),'关闭');h.click('recordContinue');
  assert.equal(h.document.getElementById('averageDialog').open,false,'No abandoned average reopens on a later close');
});

test('pointer root close returns to the timer while keyboard and nested close preserve their focus destinations',()=>{
  const h=harness({records:Array.from({length:7},(_,i)=>record(i))});
  pointerAction(h,'coreAo5Detail');pointerAction(h,'averageClose');
  assert.equal(h.document.activeElement,h.document.getElementById('pad'));
  h.click('coreAo5Detail');const row=openAverageRecord(h,h.readRecords()[4].uid);pointerAction(h,'recordClose');
  assert.equal(h.document.getElementById('averageDialog').open,true);
  assert.equal(h.document.activeElement.getAttribute('data-record-uid'),row.getAttribute('data-record-uid'));
  const close=h.document.getElementById('averageClose');close.dispatch('click',{target:close,detail:0});
  assert.equal(h.document.activeElement,h.document.getElementById('coreAo5Detail'));
  h.click('corePbDetail');h.document.getElementById('recordDialog').dispatch('cancel');
  assert.equal(h.document.activeElement,h.document.getElementById('corePbDetail'));
});

test('review-origin details never expose or execute continue-timing and retain the history focus fallback',()=>{
  const h=harness({records:Array.from({length:7},(_,i)=>record(i))});h.click('navReview');
  const uid=h.readRecords()[5].uid;openHistoryRecord(h,uid);
  assert.equal(h.document.getElementById('recordContinue').hidden,true);h.click('recordContinue');
  assert.equal(h.document.getElementById('recordDialog').open,true);h.click('recordAo5Detail');
  assert.equal(h.document.getElementById('averageContinue').hidden,true);h.click('averageContinue');
  assert.equal(h.document.getElementById('averageDialog').open,true);pointerAction(h,'averageClose');pointerAction(h,'recordClose');
  assert.equal(h.document.activeElement,h.document.getElementById('historyToggle'),'A rebuilt history trigger falls back to its visible heading');
  assert.equal(h.document.getElementById('app').dataset.view,'review');
  h.click('navTimer');h.click('coreAo5Detail');assert.equal(h.document.getElementById('averageContinue').hidden,false);
});

test('date history uses the exact chart boundaries, original solve numbers and all-group restoration',()=>{
  const midnight=new Date(2026,10,14,0,0,0).getTime();
  const rows=[dateRecord(0,-7,10000),dateRecord(1,-6,11000),dateRecord(2,-1,12000),
    {...dateRecord(3,0,13000),at:new Date(midnight).toISOString()},
    {...dateRecord(4,0,14000),at:new Date(REVIEW_NOW).toISOString()},
    {...dateRecord(5,0,15000),at:new Date(REVIEW_NOW+1).toISOString()}];
  const h=harness({now:REVIEW_NOW,importedRecords:rows});reviewRange(h,'today');
  assert.deepEqual(historyUids(h),['date-4','date-3']);assert.equal(h.text('historyCount'),'2');
  assert.match(h.text('historyTitle'),/今天/);assert.match(historyButtons(h)[0].getAttribute('aria-label'),/第 5 次/);
  assert.equal(h.document.getElementById('historyScopeBar').hidden,false);
  assert.equal(historyDateHeadings(h).length,1);assert.match(historyDateHeadings(h)[0].textContent,/2026.*11.*14/);
  reviewRange(h,'7days');assert.deepEqual(historyUids(h),['date-4','date-3','date-2','date-1']);
  assert.equal(h.text('historyCount'),'4');assert.equal(historyDateHeadings(h).length,3);
  reviewRange(h,100);assert.deepEqual(historyUids(h),['date-5','date-4','date-3','date-2','date-1','date-0']);
  assert.equal(h.text('historyCount'),'6');assert.equal(h.text('historyTitle'),'本组历史');
  assert.equal(h.document.getElementById('historyScopeBar').hidden,true);
});

test('date history paginates beyond the 100-point graph and range changes reset pagination and scroll',()=>{
  const rows=[dateRecord(0,-1,20000),...Array.from({length:151},(_,i)=>dateRecord(i+1,0,10000+i))];
  const h=harness({now:REVIEW_NOW,importedRecords:rows});reviewRange(h,'today');
  const body=h.document.getElementById('historyBody');assert.equal(h.text('historyCount'),'151');
  assert.equal(historyButtons(h).length,50);assert.equal(h.document.getElementById('reviewRecord').children.length,100);
  h.click('historyMore');assert.equal(historyButtons(h).length,100);
  h.click('historyMore');assert.equal(historyButtons(h).length,150);
  h.click('historyMore');assert.equal(historyButtons(h).length,151);assert.equal(historyUids(h).at(-1),'date-1');
  assert.equal(h.document.getElementById('historyMore').hidden,true);
  body.scrollTop=700;reviewRange(h,'7days');assert.equal(historyButtons(h).length,50);assert.equal(body.scrollTop,0);
  h.click('historyMore');body.scrollTop=500;h.click('historyAll');
  assert.equal(h.document.getElementById('reviewRange').value,'50');assert.equal(historyButtons(h).length,50);
  assert.equal(h.text('historyCount'),'152');assert.equal(body.scrollTop,0);
  assert.equal(String(JSON.parse(h.storage.getItem('starcube.settings.v1')).reviewRange),'50');
});

test('date-linked history updates after penalty edits, deletion and undo while excluding the prior day',()=>{
  const h=harness({now:REVIEW_NOW,importedRecords:[dateRecord(0,-1,20000),dateRecord(1,0,10000),dateRecord(2,0,12000)]});
  reviewRange(h,'today');assert.deepEqual(historyUids(h),['date-2','date-1']);
  openHistoryRecord(h,'date-1');h.click('recordPlus');assert.equal(h.text('compareAverageCurrent'),'12.000');
  assert.match(historyButtons(h).find(node=>node.getAttribute('data-record-uid')==='date-1').textContent,/12\.000\+/);
  h.click('recordDelete');assert.deepEqual(historyUids(h),['date-2']);assert.equal(h.text('historyCount'),'1');
  h.click('undoDelete');assert.deepEqual(historyUids(h),['date-2','date-1']);assert.equal(h.text('historyCount'),'2');
  assert.equal(h.text('compareCountCurrent'),'2');assert.equal(h.document.getElementById('reviewRange').value,'today');
  assert.equal(h.readRecords().find(row=>row.uid==='date-1').penalty,'+2');
});

test('linked history follows group changes without reusing the previous group pagination or date headings',()=>{
  const payload={format:'starcube',version:3,groups:[{id:'a',origin:'oa',name:'A'},{id:'b',origin:'ob',name:'B'}],
    records:[...Array.from({length:60},(_,i)=>dateRecord(i,0,10000+i,'ok','a')),
      dateRecord(60,-1,12000,'ok','b'),dateRecord(61,0,14000,'ok','b')]};
  const h=harness({now:REVIEW_NOW,importedRecords:payload});select(h,'a');reviewRange(h,'today');h.click('historyMore');
  assert.equal(historyButtons(h).length,60);h.document.getElementById('historyBody').scrollTop=300;select(h,'b');
  assert.deepEqual(historyUids(h),['date-61']);assert.equal(h.text('historyCount'),'1');assert.equal(historyDateHeadings(h).length,1);
  assert.equal(h.document.getElementById('historyBody').scrollTop,0);assert.equal(h.document.getElementById('reviewRange').value,'today');
  select(h,'a');assert.equal(historyButtons(h).length,50);
});

test('midnight refresh updates date history even when the trend panel is collapsed',()=>{
  const tomorrow={...dateRecord(2,1,20000),at:new Date(2026,10,15,0,0,0).toISOString()};
  const h=harness({now:new Date(2026,10,14,23,59,30),importedRecords:[dateRecord(0,-1,5000),dateRecord(1,0,10000),tomorrow]});
  reviewRange(h,'today');assert.deepEqual(historyUids(h),['date-1']);h.click('reviewToggle');
  assert.equal(h.document.getElementById('reviewBody').hidden,true);h.advance(60001);
  assert.deepEqual(historyUids(h),['date-2']);assert.equal(h.text('historyCount'),'1');
  assert.equal(h.document.getElementById('reviewBody').hidden,true);assert.match(historyDateHeadings(h)[0].textContent,/15/);
});

test('an ordinary date-refresh minute preserves unchanged history DOM and the focused result button',()=>{
  const h=harness({now:REVIEW_NOW,importedRecords:[dateRecord(0,-1,9000),dateRecord(1,0,10000),dateRecord(2,0,12000)]});
  reviewRange(h,'today');const list=h.document.getElementById('historyList');
  const focused=historyButtons(h).find(node=>node.getAttribute('data-record-uid')==='date-1');focused.focus();
  const replacements=list.replacements;h.advance(60001);
  assert.equal(list.replacements,replacements,'A minute boundary with the same records must not replace the history');
  assert.equal(h.document.activeElement,focused);assert.equal(focused.isConnected,true);
  assert.deepEqual(historyUids(h),['date-2','date-1']);
});

test('necessary history rebuilds restore focused solve identity and fall back to the heading if it disappears',()=>{
  const h=harness({now:REVIEW_NOW,importedRecords:[dateRecord(0,0,9000),dateRecord(1,0,10000),dateRecord(2,0,12000)]});
  reviewRange(h,'today');const list=h.document.getElementById('historyList'),api=h.window.StarCubeStore;
  const focused=historyButtons(h).find(node=>node.getAttribute('data-record-uid')==='date-1');focused.focus();
  const replacements=list.replacements,peer=api.create({storage:h.storage});
  peer.put({...h.readRecords().find(row=>row.uid==='date-1'),penalty:'+2'});
  h.window.dispatch('storage',{key:api.keys.itemPrefix+'date-1'});h.advance(40);
  assert.ok(list.replacements>replacements,'Changed results require a rendered update');
  assert.notEqual(h.document.activeElement,focused);assert.equal(h.document.activeElement.getAttribute('data-record-uid'),'date-1');
  assert.equal(h.document.activeElement.isConnected,true);assert.match(h.document.activeElement.textContent,/12\.000\+/);
  peer.remove('date-1');h.window.dispatch('storage',{key:api.keys.deletedPrefix+'date-1'});h.advance(40);
  assert.deepEqual(historyUids(h),['date-2','date-0']);assert.equal(h.document.activeElement,h.document.getElementById('historyToggle'));
});

test('foreground refresh advances filtered history with a collapsed chart and preserves the chosen scope',()=>{
  const h=harness({now:REVIEW_NOW,importedRecords:[dateRecord(0,0,10000),dateRecord(1,1,20000)]});
  reviewRange(h,'today');h.click('reviewToggle');h.document.hidden=true;h.document.dispatch('visibilitychange');
  h.setNow(new Date(2026,10,15,12,0,0));h.document.hidden=false;h.document.dispatch('visibilitychange');
  assert.deepEqual(historyUids(h),['date-1']);assert.equal(h.document.getElementById('reviewRange').value,'today');
  assert.equal(h.document.getElementById('reviewBody').hidden,true);
});

test('the date history shortcut opens a collapsed mobile history and does not change the selected range',()=>{
  const h=harness({width:390,now:REVIEW_NOW,importedRecords:[dateRecord(0,0,10000)]});reviewRange(h,'today');
  const history=h.document.getElementById('historyBody');assert.equal(history.hidden,true);
  assert.equal(h.document.getElementById('reviewHistory').hidden,false);h.click('reviewHistory');
  assert.equal(history.hidden,false);assert.equal(h.document.getElementById('historyToggle').getAttribute('aria-expanded'),'true');
  assert.deepEqual(historyUids(h),['date-0']);assert.equal(h.document.getElementById('reviewRange').value,'today');
  assert.ok(h.allNodes.some(node=>node.scrollIntoViewCalls.length),'The shortcut scrolls the history into view');
  assert.ok(['historyToggle','historyBody','historyTitle'].includes(h.document.activeElement.id),'Focus follows the visible history destination');
});

test('an empty date history is distinct from an empty training and can return to all history',()=>{
  const h=harness({now:REVIEW_NOW,importedRecords:[dateRecord(0,-1,10000)]});reviewRange(h,'today');
  assert.equal(h.text('historyCount'),'0');assert.deepEqual(historyUids(h),[]);assert.equal(historyDateHeadings(h).length,0);
  assert.equal(h.document.getElementById('historyEmpty').hidden,false);assert.match(h.text('historyEmpty'),/今天/);
  assert.equal(h.document.getElementById('historyMore').hidden,true);assert.equal(h.document.getElementById('historyScopeBar').hidden,false);
  h.click('historyAll');assert.deepEqual(historyUids(h),['date-0']);assert.equal(h.document.getElementById('historyEmpty').hidden,true);
});

test('every supported review scope persists across reload while retaining existing inspection and sound preferences',()=>{
  for(const range of ['today','7days','100','50']) {
    const settings={inspection:true,inspectionSound:true};
    const h=harness({now:REVIEW_NOW,storageEntries:[['starcube.settings.v1',JSON.stringify(settings)]],importedRecords:[dateRecord(0,0,10000)]});
    reviewRange(h,range);const saved=JSON.parse(h.storage.getItem('starcube.settings.v1'));
    assert.equal(String(saved.reviewRange),range);assert.equal(saved.inspection,true);assert.equal(saved.inspectionSound,true);
    const reloaded=harness({now:REVIEW_NOW,sharedEntries:h.entries});
    assert.equal(reloaded.document.getElementById('reviewRange').value,range);assert.equal(reloaded.document.getElementById('app').dataset.view,'timer');
    reloaded.click('navReview');assert.equal(reloaded.document.getElementById('reviewComparison').hidden,!['today','7days'].includes(range));
    assert.equal(reloaded.document.getElementById('inspectionToggle').getAttribute('aria-checked'),'true');
    assert.equal(reloaded.document.getElementById('soundToggle').getAttribute('aria-checked'),'true');
  }
});

test('legacy, malformed and unsupported saved ranges safely default to the recent 50 mode',()=>{
  for(const raw of [JSON.stringify({inspection:false}),'{broken',JSON.stringify({inspection:false,reviewRange:'forever'}),
    JSON.stringify({inspection:false,reviewRange:{mode:'today'}})]) {
    const h=harness({now:REVIEW_NOW,storageEntries:[['starcube.settings.v1',raw]]});
    assert.equal(h.document.getElementById('reviewRange').value,'50');h.click('navReview');
    assert.equal(h.document.getElementById('reviewComparison').hidden,true);assert.equal(h.text('historyTitle'),'本组历史');
  }
});

test('a remembered today scope recalculates on the new local day instead of restoring stale dates',()=>{
  const h=harness({now:REVIEW_NOW,importedRecords:[dateRecord(0,0,10000),dateRecord(1,1,20000)]});reviewRange(h,'today');
  const reloaded=harness({now:new Date(2026,10,15,12,0,0),sharedEntries:h.entries});reloaded.click('navReview');
  assert.equal(reloaded.document.getElementById('reviewRange').value,'today');assert.deepEqual(historyUids(reloaded),['date-1']);
  assert.equal(reloaded.text('compareAverageCurrent'),'20.000');assert.equal(reloaded.text('compareAveragePrevious'),'10.000');
});

test('failed preference storage keeps date filtering usable in the current page and reports the failure',()=>{
  const h=harness({now:REVIEW_NOW,importedRecords:[dateRecord(0,-1,12000),dateRecord(1,0,10000)]});
  const stored=h.storage.getItem('starcube.settings.v1');h.failWrites(key=>key==='starcube.settings.v1');reviewRange(h,'today');
  assert.deepEqual(historyUids(h),['date-1']);assert.equal(h.text('compareCountCurrent'),'1');
  assert.equal(h.storage.getItem('starcube.settings.v1'),stored);assert.equal(h.document.getElementById('storageBanner').hidden,false);
  assert.match(h.text('storageBanner'),/设置|保存|写入/);assert.equal(h.readRecords().length,2);
});

test('history CSV export follows current group, active date filter, reverse order and Excel UTF-8 BOM format',()=>{
  const payload={format:'starcube',version:3,groups:[{id:'a',origin:'oa',name:'主训练/一'},{id:'b',origin:'ob',name:'另一组'}],
    records:[
      {...dateRecord(0,-8,9000,'ok','a'),scramble:'R U R'},
      {...dateRecord(1,-2,10500,'+2','a'),scramble:"U2 F' D"},
      {...dateRecord(2,0,12345,'ok','a'),scramble:"L B' R2"},
      {...dateRecord(3,0,65432,'+2','a'),scramble:"F2 D' U"},
      {...dateRecord(4,0,8888,'dnf','a'),scramble:'B2 L2 R2'},
      {...dateRecord(5,0,7777,'ok','b'),scramble:'D2 U2'}
    ]};
  const h=harness({now:REVIEW_NOW,importedRecords:payload});
  select(h,'a');reviewRange(h,'today');
  assert.equal(h.document.getElementById('exportHistoryCsv').disabled,false);
  h.click('exportHistoryCsv');
  const todayFile=h.downloads.at(-1);
  assert.ok(todayFile,'Today CSV download was triggered');
  assert.match(todayFile.name,/\.csv$/);
  assert.doesNotMatch(todayFile.name,/[\\/:*?"<>|]/);
  assert.equal(todayFile.blob.type,'text/csv;charset=utf-8');
  const todayText=todayFile.blob.parts.join('');
  assert.equal(todayText.charCodeAt(0),0xFEFF);
  const todayLines=todayText.slice(1).trim().split('\r\n');
  assert.equal(todayLines.length,4);
  assert.equal(todayLines[0],'记录时间,原始用时,状态,打乱公式');
  assert.match(todayLines[1],/,8\.888,DNF,B2 L2 R2$/);
  assert.match(todayLines[2],/,1:05\.432,\+2,F2 D' U$/);
  assert.match(todayLines[3],/,12\.345,正常,L B' R2$/);
  assert.equal(h.storage.getItem('starcube.backup.v1'),null,'CSV export must not mark full JSON backup as completed');

  reviewRange(h,'7days');
  h.click('exportHistoryCsv');
  const weekLines=h.downloads.at(-1).blob.parts.join('').slice(1).trim().split('\r\n');
  assert.equal(weekLines.length,5);
  assert.match(weekLines[4],/,10\.500,\+2,U2 F' D$/);

  reviewRange(h,50);
  h.click('exportHistoryCsv');
  const allLines=h.downloads.at(-1).blob.parts.join('').slice(1).trim().split('\r\n');
  assert.equal(allLines.length,6);
  assert.match(allLines[5],/,9\.000,正常,R U R$/);

  select(h,'b');
  h.click('exportHistoryCsv');
  const groupBLines=h.downloads.at(-1).blob.parts.join('').slice(1).trim().split('\r\n');
  assert.equal(groupBLines.length,2);
  assert.match(groupBLines[1],/,7\.777,正常,D2 U2$/);
});

test('history CSV export includes all filtered rows beyond pagination and disables when empty or locked',()=>{
  const rows=[dateRecord(0,-1,20000),...Array.from({length:120},(_,i)=>dateRecord(i+1,0,10000+i,i%3===0?'ok':i%3===1?'+2':'dnf'))];
  const h=harness({now:REVIEW_NOW,importedRecords:rows});
  reviewRange(h,'today');
  assert.equal(historyButtons(h).length,50,'UI remains paginated at 50 rows');
  h.click('exportHistoryCsv');
  const lines=h.downloads.at(-1).blob.parts.join('').slice(1).trim().split('\r\n');
  assert.equal(lines.length,121,'Header plus all 120 today solves');
  assert.match(lines[1],/,10\.119,/,'Newest solve is first');
  assert.match(lines[120],/,10\.000,正常,/,'Oldest today solve is last');

  const empty=harness({now:REVIEW_NOW,importedRecords:[dateRecord(0,-1,10000)]});
  reviewRange(empty,'today');
  assert.equal(empty.document.getElementById('exportHistoryCsv').disabled,true);
  const before=empty.downloads.length;
  empty.click('exportHistoryCsv');
  assert.equal(empty.downloads.length,before);
  empty.click('historyAll');
  assert.equal(empty.document.getElementById('exportHistoryCsv').disabled,false);
  empty.click('groupNew');
  assert.equal(empty.document.getElementById('exportHistoryCsv').disabled,true);
  empty.click('groupCancel');
  assert.equal(empty.document.getElementById('exportHistoryCsv').disabled,false);
});

test('theme toggle cycles through light, warm and dark, syncs metadata and persists without altering other settings',()=>{
  const initial={inspection:true,inspectionSound:true,reviewRange:'7days'};
  const h=harness({storageEntries:[['starcube.settings.v1',JSON.stringify(initial)]]});
  const html=h.document.documentElement;
  const colorScheme=h.document.getElementById('metaColorScheme');
  const themeColor=h.document.getElementById('metaThemeColor');
  const toggle=h.document.getElementById('themeToggle');
  assert.equal(html.dataset.theme,'light');
  assert.equal(html.style.colorScheme,'light');
  assert.equal(colorScheme.getAttribute('content'),'light');
  assert.equal(themeColor.getAttribute('content'),'#f3f4f6');
  assert.equal(h.text('themeLabel'),'纸白');

  const expected=[
    ['warm','暖纸','复古暖纸','light','#efe6d5'],
    ['dark','曜黑','极简曜黑','dark','#0c0f14'],
    ['light','纸白','纯净纸白','light','#f3f4f6']
  ];
  for(const [theme,shortLabel,fullLabel,scheme,color] of expected) {
    h.click('themeToggle');
    assert.equal(html.dataset.theme,theme);
    assert.equal(html.style.colorScheme,scheme);
    assert.equal(colorScheme.getAttribute('content'),scheme);
    assert.equal(themeColor.getAttribute('content'),color);
    assert.equal(toggle.dataset.theme,theme);
    assert.equal(h.text('themeLabel'),shortLabel);
    assert.match(toggle.getAttribute('aria-label'),new RegExp(fullLabel));
    const saved=JSON.parse(h.storage.getItem('starcube.settings.v1'));
    assert.equal(saved.theme,theme);
    assert.equal(saved.inspection,true);
    assert.equal(saved.inspectionSound,true);
    assert.equal(saved.reviewRange,'7days');
    const reloaded=harness({sharedEntries:h.entries});
    assert.equal(reloaded.document.documentElement.dataset.theme,theme);
    assert.equal(reloaded.document.getElementById('metaColorScheme').getAttribute('content'),scheme);
    assert.equal(reloaded.document.getElementById('metaThemeColor').getAttribute('content'),color);
    assert.equal(reloaded.document.getElementById('inspectionToggle').getAttribute('aria-checked'),'true');
    assert.equal(reloaded.document.getElementById('soundToggle').getAttribute('aria-checked'),'true');
    assert.equal(reloaded.document.getElementById('reviewRange').value,'7days');
  }
});

test('malformed, missing or unsupported saved themes safely fall back to light',()=>{
  for(const raw of [JSON.stringify({inspection:false}),'{broken',JSON.stringify({inspection:true,theme:'neon'}),
    JSON.stringify({inspection:true,theme:123}),JSON.stringify({inspection:true,theme:null}),JSON.stringify({inspection:true,theme:{name:'dark'}})]) {
    const h=harness({storageEntries:[['starcube.settings.v1',raw]]});
    assert.equal(h.document.documentElement.dataset.theme,'light');
    assert.equal(h.document.getElementById('metaColorScheme').getAttribute('content'),'light');
    assert.equal(h.document.getElementById('metaThemeColor').getAttribute('content'),'#f3f4f6');
    assert.equal(h.text('themeLabel'),'纸白');
  }
});

test('theme toggle locks during timing and open details, syncs across tabs and survives write failure',()=>{
  const h=harness({records:[record(0,12000)]});
  hold(h);
  assert.equal(h.document.getElementById('themeToggle').disabled,true);
  h.click('themeToggle');
  assert.equal(h.document.documentElement.dataset.theme,'light');
  h.advance(1000);h.key('keydown');h.key('keyup');
  assert.equal(h.text('count'),'2');
  assert.equal(h.document.getElementById('themeToggle').disabled,false);

  h.click('corePbDetail');
  assert.equal(h.document.getElementById('themeToggle').disabled,true);
  h.click('themeToggle');
  assert.equal(h.document.documentElement.dataset.theme,'light');
  h.click('recordClose');
  assert.equal(h.document.getElementById('themeToggle').disabled,false);

  h.storage.setItem('starcube.settings.v1',JSON.stringify({inspection:false,inspectionSound:false,reviewRange:'50',theme:'dark'}));
  h.window.dispatch('storage',{key:'starcube.settings.v1',newValue:h.storage.getItem('starcube.settings.v1')});
  assert.equal(h.document.documentElement.dataset.theme,'dark');
  assert.equal(h.document.getElementById('metaColorScheme').getAttribute('content'),'dark');

  h.failWrites(key=>key==='starcube.settings.v1');
  h.click('themeToggle');
  assert.equal(h.document.documentElement.dataset.theme,'light');
  assert.equal(h.document.getElementById('storageBanner').hidden,false);
});

test('toast appears for group save, backup export and CSV export, preserves feedback text and auto-hides after 2s',()=>{
  const h=harness({now:REVIEW_NOW,importedRecords:[dateRecord(0,0,12345)]});
  const toast=h.document.getElementById('toast');
  assert.equal(toast.hidden,true);

  createGroup(h,'夜训');
  assert.match(h.text('dataFeedback'),/已保存训练「夜训」/);
  assert.equal(toast.hidden,false);
  assert.match(toast.textContent,/已保存训练「夜训」/);
  h.advance(1800);
  assert.equal(toast.hidden,false);
  h.advance(200);
  assert.equal(toast.hidden,true);
  assert.equal(toast.textContent,'');

  select(h,'default');
  h.click('exportData');
  assert.match(h.text('dataFeedback'),/已发起下载/);
  assert.equal(toast.hidden,false);
  assert.match(toast.textContent,/已导出备份/);
  h.advance(1500);
  assert.equal(toast.hidden,false);

  // Triggering CSV export before the first toast finishes must reset the 2-second hide timer.
  h.click('navReview');
  h.click('exportHistoryCsv');
  assert.match(h.text('dataFeedback'),/已发起 CSV 导出/);
  assert.equal(toast.hidden,false);
  assert.match(toast.textContent,/已导出 CSV/);
  h.advance(1000);
  assert.equal(toast.hidden,false,'Reset timer keeps the newer toast visible past the prior deadline');
  h.advance(1000);
  assert.equal(toast.hidden,true);
});

test('group deletion blocks default, deletes empty groups directly, confirms non-empty groups with backup and cleans stale undo',()=>{
  const payload={format:'starcube',version:3,
    groups:[{id:'empty-g',origin:'oe',name:'空训练'},{id:'busy-g',origin:'ob',name:'专项训练'}],
    records:[
      {...record(0,15000),uid:'def-1',groupId:'default'},
      {...record(1,8000),uid:'busy-1',groupId:'busy-g'},
      {...record(2,9000),uid:'busy-2',groupId:'busy-g'},
      {...record(3,10000),uid:'busy-3',groupId:'busy-g'}
    ]};
  const h=harness({importedRecords:payload});
  // 默认训练组不可删除
  assert.equal(h.document.getElementById('groupDelete').disabled,true);
  h.click('groupDelete');
  assert.equal(h.document.getElementById('groupDeleteDialog').open,false);
  assert.equal(h.document.getElementById('groupSelect').value,'default');

  // 空非默认训练组直接删除并切回默认训练组
  select(h,'empty-g');
  assert.equal(h.document.getElementById('groupDelete').disabled,false);
  h.click('groupDelete');
  assert.equal(h.document.getElementById('groupDeleteDialog').open,false);
  assert.equal(h.document.getElementById('groupSelect').value,'default');
  assert.equal(h.text('count'),'1');
  assert.match(h.text('dataFeedback'),/已删除训练「空训练」/);

  // 含成绩的训练组：先删除其中一条成绩产生待撤销记录，再删除该训练组
  select(h,'busy-g');
  assert.equal(h.text('count'),'3');
  assert.equal(h.text('globalPb'),'8.000');
  h.click('deleteLatest');
  assert.equal(h.text('count'),'2');
  assert.equal(h.document.getElementById('undoNotice').hidden,false);

  h.click('groupDelete');
  assert.equal(h.document.getElementById('groupDeleteDialog').open,true);
  assert.match(h.text('groupDeleteMessage'),/2 条成绩/);
  assert.match(h.text('groupDeleteMessage'),/备份/);

  // 确认弹窗打开时拦截计时快捷键和切换分组
  h.key('keydown');h.advance(400);h.key('keyup');
  assert.equal(status(h),'就绪');
  select(h,'default');
  assert.equal(h.document.getElementById('groupSelect').value,'busy-g');

  // 弹窗内可先导出备份，不关闭弹窗
  const beforeExports=h.downloads.length;
  h.click('groupDeleteExport');
  assert.equal(h.downloads.length,beforeExports+1);
  assert.equal(h.document.getElementById('groupDeleteDialog').open,true);
  assert.match(h.text('groupDeleteFeedback'),/备份/);

  // 取消后数据完整保留
  h.click('groupDeleteClose');
  assert.equal(h.document.getElementById('groupDeleteDialog').open,false);
  assert.equal(h.document.getElementById('groupSelect').value,'busy-g');
  assert.equal(h.text('count'),'2');

  // 确认删除：安全切回默认训练组，更新统计、历史、趋势图与全局 PB，并清除已删组的待撤销项
  h.click('navReview');
  assert.equal(h.text('historyCount'),'2');
  h.click('groupDelete');
  h.click('groupDeleteConfirm');
  assert.equal(h.document.getElementById('groupDeleteDialog').open,false);
  assert.equal(h.document.getElementById('groupSelect').value,'default');
  assert.equal(h.sessionEntries.get('starcube.currentGroup.v1'),'default');
  assert.equal(h.text('count'),'1');
  assert.equal(h.text('historyCount'),'1');
  assert.equal(h.text('globalPb'),'15.000');
  assert.equal(h.document.getElementById('reviewRecord').children.length,1);
  assert.equal(h.document.getElementById('undoNotice').hidden,true,'Undo entry for deleted group must be cleared');
  assert.equal(h.readRecords().length,1);
  assert.equal(h.storage.getItem('starcube.groups.v1.item.busy-g'),null);
  assert.match(h.text('dataFeedback'),/已删除训练「专项训练」.*已移除 2 条成绩/);
  assert.equal(h.document.getElementById('toast').hidden,false);
});

test('cross-tab group deletion syncs selection back to default and refreshes stats, history and chart',()=>{
  const shared=new Map();
  const payload={format:'starcube',version:3,
    groups:[{id:'shared-g',origin:'os',name:'跨标签训练'}],
    records:[
      {...record(0,16000),uid:'d-0',groupId:'default'},
      {...record(1,9500),uid:'s-1',groupId:'shared-g'},
      {...record(2,10500),uid:'s-2',groupId:'shared-g'}
    ]};
  const a=harness({sharedEntries:shared,importedRecords:payload});
  const b=harness({sharedEntries:shared});
  select(a,'shared-g');
  select(b,'shared-g');
  b.click('navReview');
  openHistoryRecord(b,'s-1');
  assert.equal(b.document.getElementById('recordDialog').open,true);

  a.click('groupDelete');
  a.click('groupDeleteConfirm');
  assert.equal(a.document.getElementById('groupSelect').value,'default');

  b.window.dispatch('storage',{key:'starcube.groups.v1.item.shared-g'});
  b.advance(40);
  assert.equal(b.document.getElementById('groupSelect').value,'default');
  assert.equal(b.sessionEntries.get('starcube.currentGroup.v1'),'default');
  assert.equal(b.document.getElementById('recordDialog').open,false);
  assert.equal(b.text('count'),'1');
  assert.equal(b.text('historyCount'),'1');
  assert.equal(b.text('globalPb'),'16.000');
  assert.equal(b.document.getElementById('reviewRecord').children.length,1);
});

test('group deletion degrades safely to memory-only mode on write failure without corrupting storage',()=>{
  const payload={format:'starcube',version:3,
    groups:[{id:'mem-g',origin:'om',name:'只读训练'}],
    records:[{...record(0,14000),uid:'d-0',groupId:'default'},{...record(1,11000),uid:'m-1',groupId:'mem-g'}]};
  const h=harness({importedRecords:payload});
  const storedBefore=new Map(h.entries);
  select(h,'mem-g');
  h.failWrites(()=>true);
  h.click('groupDelete');
  assert.equal(h.document.getElementById('groupDeleteDialog').open,true);
  h.click('groupDeleteConfirm');
  assert.equal(h.document.getElementById('groupSelect').value,'default');
  assert.equal(h.text('count'),'1');
  assert.equal(h.text('globalPb'),'14.000');
  assert.equal(h.document.getElementById('storageBanner').hidden,false);
  assert.match(h.text('storageBanner'),/不会被保存|删除失败/);
  assert.match(h.text('dataFeedback'),/仅在本页删除/);
  assert.deepEqual(h.entries,storedBefore,'Read-only storage bytes must remain intact');
  h.click('exportData');
  const exported=h.exportedPayloads().at(-1);
  assert.equal(exported.groups.some(g=>g.id==='mem-g'),false);
  assert.equal(exported.records.some(r=>r.groupId==='mem-g'),false);
});

test('copy scramble works via Clipboard API, falls back to execCommand, and shows clear guidance when unsupported',()=>{
  const copied=[];
  const h1=harness({
    records:[{...record(0,12000),scramble:"R U R' U' F2"},{...record(1,13000),scramble:'—'}],
    clipboard:{writeText(text){copied.push(text);return Promise.resolve();}}
  });
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
  h1.click('copyScramble');
  return tick().then(()=>{
    assert.equal(copied.at(-1),ALGORITHMS[0]);
    assert.match(h1.text('dataFeedback'),/已复制打乱/);
    assert.equal(h1.document.getElementById('toast').hidden,false);

    h1.click('navReview');
    const saved=h1.readRecords();
    openHistoryRecord(h1,saved[0].uid);
    assert.equal(h1.document.getElementById('recordCopyScramble').disabled,false);
    h1.click('recordCopyScramble');
    return tick().then(()=>{
      assert.equal(copied.at(-1),"R U R' U' F2");
      assert.match(h1.text('recordFeedback'),/已复制打乱/);
      h1.click('recordClose');

      // 无打乱（'—'）时禁用复制与重测按钮
      openHistoryRecord(h1,saved[1].uid);
      assert.equal(h1.document.getElementById('recordCopyScramble').disabled,true);
      assert.equal(h1.document.getElementById('recordReplayScramble').disabled,true);
      h1.click('recordClose');

      // Clipboard API 被拒绝且无 execCommand 时也给出清晰降级提示
      const hReject=harness({clipboard:{writeText(){return Promise.reject(new Error('NotAllowedError'));}}});
      hReject.click('copyScramble');
      return tick().then(()=>{
        assert.match(hReject.text('dataFeedback'),/不支持自动复制.*手动选中/);
        assert.equal(hReject.document.getElementById('toast').hidden,false);

        // 无 Clipboard API 但支持 execCommand 降级复制
        let execCalls=0;
        const h2=harness({execCommand(cmd){if(cmd==='copy'){execCalls++;return true;}return false;}});
        h2.click('copyScramble');
        assert.equal(execCalls,1);
        assert.match(h2.text('dataFeedback'),/已复制打乱/);

        // 既不支持 Clipboard API 也不支持 execCommand 时给出明确降级提示
        const h3=harness({records:[{...record(0,12000),scramble:"L2 D' B"}]});
        h3.click('copyScramble');
        assert.match(h3.text('dataFeedback'),/不支持自动复制.*手动选中/);
        assert.equal(h3.document.getElementById('toast').hidden,false);
        h3.click('navReview');
        openHistoryRecord(h3,h3.readRecords()[0].uid);
        h3.click('recordCopyScramble');
        assert.match(h3.text('recordFeedback'),/不支持自动复制.*手动选中/);
      });
    });
  });
});

test('replay scramble from history detail closes nested dialogs, returns to timer without auto-starting and updates net',()=>{
  const replayAlg="R U R' U'";
  const rows=Array.from({length:5},(_,i)=>({...record(i,10000+i*1000),scramble:i===2?replayAlg:ALGORITHMS[0]}));
  const h=harness({inspection:true,records:rows});
  const targetUid=h.readRecords()[2].uid;

  // 从复盘页 Ao5 明细进入单次详情（测试嵌套弹窗栈也能一次干净关闭）
  h.click('navReview');
  h.click('ao5Detail');
  assert.equal(h.document.getElementById('averageDialog').open,true);
  const rowBtn=h.descendants(h.document.getElementById('averageRows')).find(node=>node.getAttribute('data-record-uid')===targetUid);
  h.document.getElementById('averageRows').dispatch('click',{target:rowBtn});
  assert.equal(h.document.getElementById('recordDialog').open,true);

  const solvedRects=h.descendants(h.document.getElementById('net')).filter(n=>n.tagName==='RECT').map(n=>n.getAttribute('fill'));
  h.click('recordReplayScramble');

  assert.equal(h.document.getElementById('recordDialog').open,false);
  assert.equal(h.document.getElementById('averageDialog').open,false);
  assert.equal(h.document.getElementById('app').dataset.view,'timer');
  assert.equal(h.text('scrambleText'),replayAlg);
  assert.match(h.text('scrambleHint'),/重测历史打乱 · 4 步/);
  assert.equal(status(h),'就绪','Must not auto-start timer or inspection');
  assert.equal(h.document.activeElement,h.document.getElementById('pad'));

  // 魔方展开图已根据该条打乱重新渲染（不同于全还原状态）
  const replayedRects=h.descendants(h.document.getElementById('net')).filter(n=>n.tagName==='RECT').map(n=>n.getAttribute('fill'));
  assert.equal(replayedRects.length,54);
  assert.notDeepEqual(replayedRects,solvedRects);

  // 保持原有观察 + 0.3s 按住起表边界，完成后保存的成绩带该条打乱并请求下一条随机打乱
  const reqCountBefore=h.requests().length;
  h.key('keydown');h.key('keyup');
  assert.equal(status(h),'观察中');
  hold(h);
  h.advance(1234);
  h.key('keydown');h.key('keyup');
  const latest=h.readRecords().at(-1);
  assert.equal(latest.ms,1234);
  assert.equal(latest.scramble,replayAlg);
  assert.equal(h.requests().length,reqCountBefore+1,'Automatically requests next random scramble after finishing replay');
});

test('Native bridge syncs theme colors and routes JSON/CSV export with saved and cancelled outcomes',async ()=>{
  const themes=[];
  const exported=[];
  let nextExportResult={status:'saved'};
  const h=harness({
    records:[record(0,11230),record(1,10450)],
    nativeBridge:{
      setTheme(color,isDark){themes.push({color,isDark});},
      exportFile(options){
        exported.push(options);
        return Promise.resolve(nextExportResult);
      }
    }
  });
  assert.ok(themes.length>=1,'Initial theme synced to native host');
  assert.deepEqual(themes.at(-1),{color:'#f3f4f6',isDark:false});

  h.click('themeToggle');
  assert.deepEqual(themes.at(-1),{color:'#efe6d5',isDark:false});
  h.click('themeToggle');
  assert.deepEqual(themes.at(-1),{color:'#0c0f14',isDark:true});

  // 备份导出取消：不应走 browser download，也不应标记备份已完成
  nextExportResult={status:'cancelled'};
  h.click('exportData');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.downloads.length,0,'Native export bypasses anchor blob download');
  assert.equal(exported.length,1);
  assert.equal(exported[0].mimeType,'application/json');
  assert.match(exported[0].filename,/^starcube-backup-\d{4}-\d{2}-\d{2}\.json$/);
  assert.match(h.text('dataFeedback'),/已取消备份导出/);

  // 备份导出成功
  nextExportResult={status:'saved'};
  h.click('exportData');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(exported.length,2);
  const parsed=JSON.parse(exported[1].content);
  assert.equal(parsed.format,'starcube');
  assert.equal(parsed.records.length,2);
  assert.match(h.text('dataFeedback'),/已保存备份/);

  // CSV 原生导出成功
  h.click('navReview');
  nextExportResult={status:'saved'};
  h.click('exportHistoryCsv');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(exported.length,3);
  assert.equal(exported[2].mimeType,'text/csv');
  assert.match(exported[2].filename,/\.csv$/);
  assert.match(h.text('dataFeedback'),/已保存 CSV/);
});

test('Native back handler unwinds modal, view, inspection, and blocks accidental exit while running',()=>{
  const h=harness({inspection:true,records:[record(0,10800)]});
  assert.equal(typeof h.window.StarCubeApp.handleBack,'function');

  // 1. 复盘页按返回 -> 切回计时页
  h.click('navReview');
  assert.equal(h.document.getElementById('app').dataset.view,'review');
  assert.equal(h.window.StarCubeApp.handleBack(),true);
  assert.equal(h.document.getElementById('app').dataset.view,'timer');

  // 2. 观察中按返回 -> 取消观察
  h.key('keydown');h.key('keyup');
  assert.equal(status(h),'观察中');
  assert.equal(h.window.StarCubeApp.handleBack(),true);
  assert.equal(status(h),'就绪');

  // 3. 计时中按返回 -> 吞掉返回键不中断计时，并弹轻提示
  h.key('keydown');h.key('keyup');
  hold(h);
  assert.equal(status(h),'计时中');
  assert.equal(h.window.StarCubeApp.handleBack(),true);
  assert.equal(status(h),'计时中');
  assert.match(h.text('toast'),/计时中，请先停表/);
  h.advance(1500);
  h.key('keydown');h.key('keyup');
  assert.equal(h.readRecords().length,2);
  assert.equal(h.readRecords().at(-1).ms,1500);

  // 4. 计时页空闲状态按返回 -> 返回 false 交由安卓原生处理双击退出
  assert.equal(h.window.StarCubeApp.handleBack(),false);
});

test('Mobile focus mode, touch copy, haptics, bottom sheets, net preview, and empty-after-delete reset',()=>{
  const haptics=[];
  let readyCalls=0;
  const h=harness({
    width:390,
    inspection:true,
    nativeBridge:{
      setTheme(){},
      onReady(){readyCalls++;},
      haptic(kind){haptics.push(kind);}
    }
  });
  assert.equal(readyCalls,1,'Initial render notifies native splash to dismiss');
  assert.doesNotMatch(h.text('subStatus'),/空格/,'Touch-only UI omits desktop spacebar copy');
  assert.equal(h.document.getElementById('app').dataset.focus,'false');

  // 底部抽屉打开与返回键关闭
  h.click('mobileGroupBtn');
  assert.equal(h.document.getElementById('trainingPanel').classList.contains('is-sheet-open'),true);
  assert.equal(h.document.getElementById('mobileSheetBackdrop').hidden,false);
  assert.equal(h.window.StarCubeApp.handleBack(),true);
  assert.equal(h.document.getElementById('trainingPanel').classList.contains('is-sheet-open'),false);

  // 魔方展开图大图预览与返回键关闭
  h.click('netPreviewTrigger');
  assert.equal(h.document.getElementById('netPreviewDialog').open,true);
  assert.equal(h.descendants(h.document.getElementById('netPreviewCanvas')).filter(n=>n.tagName==='RECT').length,54);
  assert.equal(h.window.StarCubeApp.handleBack(),true);
  assert.equal(h.document.getElementById('netPreviewDialog').open,false);

  // 观察 + 准备 + 计时触发专注模式与触觉反馈
  h.key('keydown');h.key('keyup');
  assert.equal(h.document.getElementById('app').dataset.focus,'true');
  hold(h);
  assert.deepEqual(haptics,['ready']);
  assert.equal(h.document.getElementById('app').dataset.focus,'true');
  assert.equal(h.text('subStatus'),'轻点任意处停表');
  h.advance(1200);
  h.key('keydown');h.key('keyup');
  assert.deepEqual(haptics,['ready','stop']);
  assert.equal(h.document.getElementById('app').dataset.focus,'false');

  // 删掉唯一成绩后不再停留于「已保存 / 已停止」矛盾文案
  h.respond(h.requests().at(-1));
  h.click('deleteLatest');
  assert.equal(h.readRecords().length,0);
  assert.equal(status(h),'就绪');
  assert.doesNotMatch(h.text('subStatus'),/已保存/);
});

test('About section displays native version and handles up-to-date, new release, and offline update checks',async ()=>{
  const openedUrls=[];
  let nextResponse={status:'ok',tag:'v1.2.0',htmlUrl:'https://github.com/Huaxiyao/StarCube/releases/tag/v1.2.0'};
  const h=harness({
    width:390,
    nativeBridge:{
      setTheme(){},
      getVersion(){return '1.2.0';},
      checkUpdate(){return Promise.resolve(nextResponse);},
      openUrl(url){openedUrls.push(url);return true;}
    }
  });
  assert.equal(h.text('aboutVersion'),'v1.2.0');
  assert.equal(h.document.getElementById('aboutActions').hidden,false);

  // 已是最新版
  h.click('checkUpdateBtn');
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(h.text('updateStatus'),/当前已是最新版本/);
  assert.equal(h.document.getElementById('downloadUpdateBtn').hidden,true);

  // 发现新版 v1.3.0
  nextResponse={
    status:'ok',
    tag:'v1.3.0',
    notes:'新增更多功能',
    htmlUrl:'https://github.com/Huaxiyao/StarCube/releases/tag/v1.3.0',
    downloadUrl:'https://github.com/Huaxiyao/StarCube/releases/download/v1.3.0/StarCube-v1.3.0.apk'
  };
  h.click('checkUpdateBtn');
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(h.text('updateStatus'),/发现新版本 v1\.3\.0/);
  assert.equal(h.document.getElementById('downloadUpdateBtn').hidden,false);
  assert.equal(h.text('downloadUpdateBtn'),'下载 v1.3.0');
  assert.equal(h.document.getElementById('updateNotes').hidden,false);
  h.click('downloadUpdateBtn');
  assert.deepEqual(openedUrls,['https://github.com/Huaxiyao/StarCube/releases/download/v1.3.0/StarCube-v1.3.0.apk']);

  // 离线状态
  nextResponse={status:'offline',message:'当前未联网，离线模式不影响练习'};
  h.click('checkUpdateBtn');
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(h.text('updateStatus'),/当前未联网/);
  assert.equal(h.document.getElementById('downloadUpdateBtn').hidden,true);
});

Promise.all(pendingTests).then(()=>{
  console.log('\n'+passed+' passed, '+failures+' failed');
  if(failures)process.exitCode=1;
});
