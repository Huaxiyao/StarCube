'use strict';
// Run only against the dedicated verification browser. Native CDP input; no packages.
// Loaded by scripts/test-browser.cjs with an explicit suite and isolated CDP browser.
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict'), crypto=require('node:crypto');
if(!/^wss?:\/\//.test(process.argv[2]||''))throw new Error('Pass the isolated browser CDP WebSocket URL.');
const projectRoot=path.resolve(__dirname,'..','..');
const htmlPath=path.join(projectRoot,'starcube.html');
const url=require('node:url').pathToFileURL(htmlPath).href;
const outDir=path.join(projectRoot,'test-results','browser',suite);
const downloadDir=path.join(outDir,'downloads');
fs.mkdirSync(downloadDir,{recursive:true});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ws=new WebSocket(process.argv[2]),pending=new Map(),results=[],runtimeErrors=[],downloads=[];
let serial=0,active,targetId;
function cdp(method,params={},session=active){
  const id=++serial;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},25000);
    pending.set(id,{resolve,reject,timeout});
    ws.send(JSON.stringify({id,method,params,...(session?{sessionId:session}:{})}));
  });
}
ws.addEventListener('message',event=>{
  const message=JSON.parse(event.data),item=pending.get(message.id);
  if(item){clearTimeout(item.timeout);pending.delete(message.id);message.error?item.reject(new Error(JSON.stringify(message.error))):item.resolve(message.result);}
  else if(message.method==='Runtime.exceptionThrown')runtimeErrors.push(message);
  else if(message.method==='Browser.downloadWillBegin'||message.method==='Browser.downloadProgress')downloads.push({method:message.method,...message.params});
});
async function ev(expression,session=active){
  const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session);
  if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(expression,session=active,timeout=20000){
  const started=Date.now();
  while(Date.now()-started<timeout){if(await ev(expression,session))return;await wait(50);}
  throw new Error('Condition timed out: '+expression);
}
async function ready(session=active){
  await until(`window.StarCubeStore && ['就绪','已停止'].includes(document.querySelector('#status')?.textContent) && /^[URFDLB]/.test(document.querySelector('#scrambleText').textContent)`,session);
}
async function state(session=active){
  return ev(`(()=>{const store=window.StarCubeStore.create({storage:localStorage});const loaded=store.load();return {status:document.querySelector('#status').textContent,timer:document.querySelector('#timer').textContent,count:Number(document.querySelector('#count').textContent),scramble:document.querySelector('#scrambleText').textContent,actionsHidden:document.querySelector('#actions').hidden,inspection:document.querySelector('#inspectionToggle').getAttribute('aria-checked'),bannerHidden:document.querySelector('#storageBanner').hidden,banner:document.querySelector('#storageBanner').textContent,feedback:document.querySelector('#dataFeedback')?.textContent,records:loaded.records,writable:loaded.writable,keys:Object.keys(store.readRaw())}})()`,session);
}
const record=(id,ms=12345,penalty='ok')=>({id,ms,penalty,scramble:"R U R' U'",at:'2026-01-01T00:00:00.000Z'});
async function reset(rows=[],inspection=false,session=active){
  await cdp('Page.bringToFront',{},session);
  await ev(`for(const key of Object.keys(localStorage)){if(key.startsWith('starcube.'))localStorage.removeItem(key)}localStorage.setItem('starcube.records.v1',${JSON.stringify(JSON.stringify(rows))});localStorage.setItem('starcube.settings.v1',${JSON.stringify(JSON.stringify({inspection}))});`,session);
  await cdp('Page.reload',{},session);await wait(80);await ready(session);
}
async function key(type,name=' ',session=active,autoRepeat=false){
  const code=name===' '?'Space':name==='Escape'?'Escape':/^\d$/.test(name)?'Digit'+name:'Key'+name.toUpperCase();
  const vk=name===' '?32:name==='Escape'?27:name.toUpperCase().charCodeAt(0);
  await cdp('Input.dispatchKeyEvent',{type,key:name,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,autoRepeat,...(type==='keyDown'&&name===' '?{text:' ',unmodifiedText:' '}:{})},session);
}
async function tap(name=' ',session=active){await key('keyDown',name,session);await key('keyUp',name,session);}
async function hold(session=active,ms=420){await key('keyDown',' ',session);await wait(ms);await key('keyUp',' ',session);}
async function point(selector,session=active){
  return ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw new Error('Missing '+${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,id:1,width:r.width,height:r.height}})()`,session);
}
async function click(selector,session=active){
  const p=await point(selector,session);assert.ok(p.height>0&&p.width>0,'Visible click target '+selector);
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1},session);
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1},session);
}
async function touch(type,p,session=active){await cdp('Input.dispatchTouchEvent',{type,touchPoints:['touchEnd','touchCancel'].includes(type)?[]:[{x:p.x,y:p.y,id:p.id||1}]},session);}
async function touchTap(selector){const p=await point(selector);await touch('touchStart',p);await touch('touchEnd',p);}
async function viewport(width,height){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<721});
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:width<721,maxTouchPoints:5});
}
async function shot(name){const response=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(outDir,name+'.png'),Buffer.from(response.data,'base64'));}
async function check(name,fn){
  const started=Date.now();
  try{const evidence=await fn();results.push({name,passed:true,ms:Date.now()-started,...evidence});console.log('PASS '+name);}
  catch(error){results.push({name,passed:false,ms:Date.now()-started,error:error.stack});console.error('FAIL '+name+': '+error.message);try{await shot('failure-'+name);}catch{}}
  fs.writeFileSync(path.join(outDir,'browser-regression-results.json'),JSON.stringify({results,runtimeErrors},null,2)+'\n');
}
const workerControl=`(()=>{
  const RealWorker=window.Worker;
  const control=window.__testWorker={queueOn:false,queue:[],sent:[],workers:[]};
  window.Worker=class{
    constructor(url){control.workers.push(this);this.real=new RealWorker(url);this.real.onmessage=event=>{const deliver=()=>this.onmessage&&this.onmessage(event);if(event.data.cmd==='scramble'&&control.queueOn)control.queue.push({payload:event.data,deliver});else deliver()};this.real.onerror=event=>this.onerror&&this.onerror(event);this.real.onmessageerror=event=>this.onmessageerror&&this.onmessageerror(event)}
    postMessage(message,...rest){if(message.cmd==='scramble')control.sent.push(message.requestId);return this.real.postMessage(message,...rest)}
    terminate(){return this.real.terminate()}
  };
})()`;
async function importFile(raw){
  // Deliberately simulates a chosen File and change event; it does not exercise the OS dialog.
  await ev(`(()=>{const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(raw)}],'verification.json',{type:'application/json'}));const input=document.querySelector('#importFile');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await until(`!document.querySelector('#dataFeedback').textContent.includes('正在校验')`);
}

(async()=>{
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const targets=(await cdp('Target.getTargets',{},null)).targetInfos;
  const found=targets.find(t=>t.type==='page'&&t.url===url);
  targetId=found?found.targetId:(await cdp('Target.createTarget',{url},null)).targetId;
  active=(await cdp('Target.attachToTarget',{targetId,flatten:true},null)).sessionId;
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Log.enable');await cdp('Page.bringToFront');await ready();
  const metadata={targetId,url,htmlSha256:crypto.createHash('sha256').update(fs.readFileSync(htmlPath)).digest('hex'),startedAt:new Date().toISOString()};

  await check('net-geometry-and-standard-centers',async()=>{
    await viewport(1440,900);await reset();
    const actual=await ev(`(()=>{const rects=[...document.querySelectorAll('#net rect')];return {count:rects.length,unique:new Set(rects.map(r=>r.getAttribute('x')+','+r.getAttribute('y'))).size,maxRight:Math.max(...rects.map(r=>+r.getAttribute('x')+ +r.getAttribute('width'))),maxBottom:Math.max(...rects.map(r=>+r.getAttribute('y')+ +r.getAttribute('height'))),viewBox:document.querySelector('#net svg').getAttribute('viewBox'),centers:[4,13,22,31,40,49].map(i=>rects[i].getAttribute('fill').toUpperCase())}})()`);
    assert.equal(actual.count,54);assert.equal(actual.unique,54);assert.equal(actual.maxRight,191);assert.equal(actual.maxBottom,143);
    assert.deepEqual(actual.centers,['#F2F2F2','#C62828','#2E7D32','#F2C230','#E06C00','#1565C0']);
    await shot('desktop-correct-net');return {actual};
  });
  await check('native-keyboard-start-stop',async()=>{
    await reset();await hold();const running=await state();assert.equal(running.status,'计时中');await wait(600);await tap();await ready();const stopped=await state();
    assert.equal(stopped.count,1);assert.ok(stopped.records[0].ms>=550);assert.equal(stopped.actionsHidden,false);return {running,stopped};
  });
  await check('next-worker-response-arrives-while-stop-key-held',async()=>{
    await reset();const original=await state();await hold();assert.equal((await state()).status,'计时中');await wait(200);
    await key('keyDown');await ready();const heldStop=await state();assert.equal(heldStop.count,1);assert.equal(heldStop.status,'已停止');assert.notEqual(heldStop.scramble,original.scramble);
    await key('keyUp');await hold();assert.equal((await state()).status,'计时中');await wait(200);await tap();await ready();const next=await state();assert.equal(next.count,2);assert.equal(next.records[1].scramble,heldStop.scramble);return {heldStop,next};
  });
  await check('native-keyboard-inspection-and-cancel',async()=>{
    await reset([],true);await tap();assert.equal((await state()).status,'观察中');await tap('Escape');assert.equal((await state()).count,0);
    await tap();await hold();assert.equal((await state()).status,'计时中');await wait(200);await tap();await ready();const stopped=await state();assert.equal(stopped.records[0].penalty,'ok');return {stopped};
  });
  await check('native-touch-start-stop-and-cancel',async()=>{
    await viewport(390,844);await reset();const p=await point('#pad');await touch('touchStart',p);await wait(100);await touch('touchCancel',p);assert.equal((await state()).count,0);
    await touch('touchStart',p);await wait(420);assert.equal((await state()).status,'按住');await touch('touchEnd',p);assert.equal((await state()).status,'计时中');await wait(300);await touch('touchStart',p);await touch('touchEnd',p);await ready();const stopped=await state();assert.equal(stopped.count,1);
    await reset([],true);await touchTap('#pad');assert.equal((await state()).status,'观察中');await touchTap('#cancelInspection');const cancelled=await state();assert.equal(cancelled.count,0);assert.equal(cancelled.status,'就绪');await shot('mobile-touch-flow');return {stopped,cancelled};
  });
  await check('reload-edit-repeat-and-delete',async()=>{
    await reset([record(1)]);await cdp('Page.reload');await wait(80);await ready();const before=await state();assert.equal(before.actionsHidden,false);
    await tap('1');assert.equal((await state()).records[0].penalty,'+2');for(let i=0;i<3;i++)await key('keyDown','1',active,true);await key('keyUp','1');assert.equal((await state()).records[0].penalty,'+2');
    await tap('2');assert.equal((await state()).records[0].penalty,'dnf');await key('keyDown','2',active,true);await key('keyUp','2');assert.equal((await state()).records[0].penalty,'dnf');
    await click('#deleteLatest');assert.equal((await state()).count,0);await cdp('Page.reload');await wait(80);await ready();const after=await state();assert.equal(after.count,0);return {before,after};
  });
  await check('corrupt-record-retains-valid-and-original-raw',async()=>{
    const rows=[record(1),{id:2,ms:'broken'}],raw=JSON.stringify(rows);await reset(rows);const actual=await state();
    const recovery=await ev(`(()=>{const store=window.StarCubeStore.create({storage:localStorage});return{legacy:localStorage.getItem('starcube.records.v1'),backups:store.backups()}})()`);
    assert.equal(actual.count,1);assert.equal(actual.records[0].ms,12345);assert.equal(recovery.legacy,raw);assert.ok(recovery.backups.some(b=>b.sourceKey==='starcube.records.v1'&&b.raw===raw));assert.match(actual.banner,/损坏/);return {actual,recovery};
  });
  await check('two-tabs-preserve-all-three-records',async()=>{
    await reset([record(1)]);const a=active;let bTarget,b;
    try{
      bTarget=(await cdp('Target.createTarget',{url},null)).targetId;b=(await cdp('Target.attachToTarget',{targetId:bTarget,flatten:true},null)).sessionId;
      await cdp('Page.enable',{},b);await cdp('Runtime.enable',{},b);await ready(b);
      await cdp('Page.bringToFront',{},a);await wait(100);await hold(a);await wait(150);await tap(' ',a);await ready(a);const afterA=await state(a);assert.equal(afterA.records.length,2);
      await cdp('Page.bringToFront',{},b);await wait(150);await hold(b);await wait(300);await tap(' ',b);await ready(b);const afterB=await state(b);assert.equal(afterB.records.length,3);assert.equal(new Set(afterB.records.map(r=>r.uid)).size,3);assert.ok(afterB.records.some(r=>r.uid===afterA.records[1].uid));
      await cdp('Page.bringToFront',{},a);await until(`Number(document.querySelector('#count').textContent)===3`,a);return {afterA,afterB};
    }finally{if(bTarget)await cdp('Target.closeTarget',{targetId:bTarget},null);await cdp('Page.bringToFront',{},a);}
  });
  await check('quota-read-only-preserves-history-display',async()=>{
    await reset([record(1)]);const injection=await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`Storage.prototype.setItem=function(){throw new DOMException('Verification quota failure','QuotaExceededError')}`});
    try{await cdp('Page.reload');await wait(80);await ready();const actual=await state();assert.equal(actual.count,1);assert.equal(actual.records.length,1);assert.equal(actual.writable,false);assert.equal(actual.bannerHidden,false);assert.match(actual.banner,/不会被保存|无法写入/);return {actual};}
    finally{await cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});await cdp('Page.reload');await wait(80);await ready();}
  });
  await check('holding-space-blocks-new-scramble',async()=>{
    await reset();const before=await state();await key('keyDown');await wait(100);await tap('n');await wait(330);const held=await state();assert.equal(held.scramble,before.scramble);assert.equal(held.status,'按住');await key('keyUp');assert.equal((await state()).status,'计时中');await wait(200);await tap();await ready();const after=await state();assert.equal(after.records[0].scramble,before.scramble);return {before,held,after};
  });
  const interception=await cdp('Page.addScriptToEvaluateOnNewDocument',{source:workerControl});
  await check('stale-worker-response-is-ignored-through-inspection',async()=>{
    try{
      await reset([],true);await ev('window.__testWorker.queueOn=true');await tap('n');await until('window.__testWorker.queue.length===1');await until(`document.querySelector('#status').textContent==='生成失败'`,active,8000);
      await tap('n');await until('window.__testWorker.queue.length===2');const queued=await ev('window.__testWorker.queue.map(x=>x.payload)');assert.notEqual(queued[0].requestId,queued[1].requestId);
      await ev('window.__testWorker.queue[0].deliver()');const stale=await state();assert.equal(stale.status,'生成中…');await tap();assert.notEqual((await state()).status,'观察中');
      await ev('window.__testWorker.queue[1].deliver()');await ready();assert.equal((await state()).scramble,queued[1].algorithm);await tap();const inspecting=await state();assert.equal(inspecting.status,'观察中');
      await ev('window.__testWorker.queue[0].deliver();window.__testWorker.queue[1].deliver()');const extra=await state();assert.equal(extra.status,'观察中');assert.equal(extra.scramble,queued[1].algorithm);await shot('stale-response-keeps-inspection');
      await ev('window.__testWorker.queueOn=false');await hold();await wait(200);await tap();await ready();const stopped=await state();assert.equal(stopped.records[0].scramble,queued[1].algorithm);return {queued,stale,inspecting,extra,stopped};
    }finally{await cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:interception.identifier});await cdp('Page.reload');await wait(80);await ready();}
  });
  await check('mobile-native-change-scramble-button',async()=>{
    await viewport(390,844);await reset();const before=await state();await touchTap('#newScramble');await ready();await until(`document.querySelector('#scrambleText').textContent!==${JSON.stringify(before.scramble)}`);const after=await state();assert.equal(after.count,0);assert.notEqual(after.scramble,before.scramble);return {before,after};
  });
  await check('import-validation-dedup-and-export-download',async()=>{
    await reset([record(1)]);const initial=await state();const newRecord=record(2,15555);const payload={format:'starcube',version:2,records:[record(1),newRecord]};
    await importFile(JSON.stringify(payload));assert.equal((await state()).count,2);await importFile(JSON.stringify(payload));assert.equal((await state()).count,2);
    await importFile(JSON.stringify({format:'starcube',version:2,records:[record(3,20000),{id:4,ms:'bad'}]}));const invalid=await state();assert.equal(invalid.count,2);assert.match(invalid.feedback,/失败/);
    await cdp('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:downloadDir,eventsEnabled:true},null);const index=downloads.length;await click('#exportData');
    const started=Date.now();let begin;while(Date.now()-started<10000){begin=downloads.slice(index).find(d=>d.method==='Browser.downloadWillBegin');if(begin&&downloads.some(d=>d.guid===begin.guid&&d.state==='completed'))break;await wait(50);}
    assert.ok(begin,'Browser emitted downloadWillBegin');assert.ok(downloads.some(d=>d.guid===begin.guid&&d.state==='completed'),'Download completed');
    const exported=JSON.parse(fs.readFileSync(path.join(downloadDir,begin.guid),'utf8'));assert.equal(exported.format,'starcube');assert.equal(exported.version,3);assert.equal(exported.records.length,2);assert.ok(Array.isArray(exported.backups));assert.ok(exported.backups.some(b=>b.sourceKey==='starcube.records.v1'));
    return {initial,invalid,exported,download:{guid:begin.guid,suggestedFilename:begin.suggestedFilename},note:'Import File and change event supplied through DOM; actual OS chooser not tested. Export verified through native button activation and a completed Chrome download.'};
  });
  await check('history-renders-zero-collapsed-and-pages-50-100',async()=>{
    await viewport(390,844);await reset(Array.from({length:120},(_,i)=>record(i+1,10000+i)));
    // History now lives on the review view; paging and collapse assertions remain.
    if(await ev('!!document.querySelector("#navReview")'))await click('#navReview');
    const count=()=>ev('document.querySelectorAll(".history-item").length');assert.equal(await count(),0);await click('#historyToggle');assert.equal(await count(),50);await click('#historyMore');assert.equal(await count(),100);await shot('mobile-history-paged');await click('#historyToggle');assert.equal(await count(),0);return {collapsedRows:0,firstPageRows:50,secondPageRows:100,records:(await state()).count};
  });
  await check('responsive-no-horizontal-overflow',async()=>{
    const cases=[];for(const [width,height,ms]of [[320,568,12345],[390,844,3600000],[1440,900,12345],[721,540,600000],[844,390,12345]]){
      await viewport(width,height);await reset([record(1,ms)]);const actual=await ev(`(()=>{const timer=document.querySelector('#timer'),r=timer.getBoundingClientRect(),main=document.querySelector('main');return{width:innerWidth,height:innerHeight,docWidth:document.documentElement.scrollWidth,mainWidth:main.clientWidth,mainScrollWidth:main.scrollWidth,timer:timer.textContent,timerLeft:r.left,timerRight:r.right,buttons:[...document.querySelectorAll('#newScramble,#exportData,#importData,.action-btn')].filter(e=>e.getBoundingClientRect().height>0).map(e=>({id:e.id,height:e.getBoundingClientRect().height}))}})()`);
      assert.ok(actual.docWidth<=actual.width,'Document overflow at '+width);assert.ok(actual.mainScrollWidth<=actual.mainWidth,'Main overflow at '+width);assert.ok(actual.timerLeft>=0&&actual.timerRight<=actual.width,'Timer overflow at '+width);for(const button of actual.buttons)assert.ok(button.height>=44,'Touch target '+button.id);cases.push(actual);await shot('responsive-'+width+'-'+height);
    }return {cases};
  });
  await check('no-uncaught-runtime-errors',async()=>{assert.deepEqual(runtimeErrors,[]);return {errors:runtimeErrors};});
  const summary={passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,total:results.length};
  fs.writeFileSync(path.join(outDir,'browser-regression-results.json'),JSON.stringify({metadata,summary,results,runtimeErrors,downloads},null,2)+'\n');
  console.log(JSON.stringify(summary));console.log('Saved '+path.join(outDir,'browser-regression-results.json'));
  // Keep the isolated browser and target open for the parent to inspect.
  ws.close();if(summary.failed)process.exitCode=1;
})().catch(error=>{console.error(error);fs.writeFileSync(path.join(outDir,'browser-regression-results.json'),JSON.stringify({results,runtimeErrors,fatal:error.stack},null,2)+'\n');ws.close();process.exitCode=1;});
