'use strict';
// Executed with the existing package-free CDP fixture. All data is synthetic.
const networkRequests=[];
ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Network.requestWillBeSent')networkRequests.push(message.params.request.url);});
const layoutRows=(count=28)=>Array.from({length:count},(_,i)=>({...record(i+1,Math.round(19000-i*160+Math.sin(i*1.7)*2300),i===8||i===19?'dnf':i===11?'+2':'ok'),uid:'layout-'+(i+1),groupId:'default',at:new Date(Date.UTC(2026,10,13,10,0,i)).toISOString()}));
async function seedLayout(rows=layoutRows(),inspection=false){
  await ev(`(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('starcube.'))localStorage.removeItem(key);sessionStorage.removeItem('starcube.currentGroup.v1');localStorage.setItem('starcube.settings.v1',JSON.stringify({inspection:${inspection}}));const store=window.StarCubeStore.create({storage:localStorage});${JSON.stringify(rows)}.forEach(r=>store.put(r));})()`);
  await cdp('Page.reload');await wait(80);await ready();
}
async function nav(view){if(await ev(`document.querySelector('#${view}View').hidden`))await click(view==='timer'?'#navTimer':'#navReview');}
async function viewState(){return ev(`(()=>({timerHidden:document.querySelector('#timerView').hidden,reviewHidden:document.querySelector('#reviewView').hidden,timerSelected:document.querySelector('#navTimer').getAttribute('aria-pressed'),reviewSelected:document.querySelector('#navReview').getAttribute('aria-pressed'),locked:document.querySelector('#navTimer').disabled&&document.querySelector('#navReview').disabled,focused:document.activeElement.id,group:document.querySelector('#groupSelect').value}))()`);}
async function blurLayout(){await ev('document.activeElement?.blur()');}
async function topLayout(){await ev('scrollTo(0,0);document.querySelector("main").scrollTop=0');}
async function assertLocked(view){
  assert.equal((await viewState()).locked,true);
  await ev(`for(const id of ['navTimer','navReview','recentReview']){const el=document.getElementById(id);el.click();el.dispatchEvent(new Event('click',{bubbles:true}))}`);
  assert.equal((await viewState())[view+'Hidden'],false);
}
async function chooseLayoutRecord(uid){await nav('review');if(await ev('document.querySelector("#reviewBody").hidden'))await click('#reviewToggle');await ev(`(()=>{const select=document.querySelector('#reviewRecord');select.value=${JSON.stringify(uid)};select.dispatchEvent(new Event('change',{bubbles:true}))})()`);await click('#reviewInspect');}
async function geometry(){return ev(`(()=>{const main=document.querySelector('main'),timer=document.querySelector('#timer').getBoundingClientRect(),pad=document.querySelector('#pad').getBoundingClientRect(),scramble=document.querySelector('.scramble').getBoundingClientRect(),status=document.querySelector('#subStatus').getBoundingClientRect();return {width:innerWidth,height:innerHeight,scrollY,mainScrollTop:main.scrollTop,documentWidth:document.documentElement.scrollWidth,mainWidth:main.clientWidth,mainScrollWidth:main.scrollWidth,timer:{left:timer.left,right:timer.right,top:timer.top,bottom:timer.bottom},pad:{top:pad.top,bottom:pad.bottom},scramble:{top:scramble.top,bottom:scramble.bottom},status:{top:status.top,bottom:status.bottom},controls:[...document.querySelectorAll('button,select,input:not([type=file]),summary')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height).map(e=>({id:e.id||e.tagName,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))}})()`);}
const initCounter=`(()=>{const RealWorker=window.Worker;window.__layoutInit={workers:0,solver:0,stores:0};window.Worker=class extends RealWorker{constructor(...args){super(...args);window.__layoutInit.workers++}postMessage(message,...rest){if(message.cmd==='init')window.__layoutInit.solver++;return super.postMessage(message,...rest)}};let value;Object.defineProperty(window,'StarCubeStore',{configurable:true,get(){return value},set(api){const create=api.create;api.create=function(...args){window.__layoutInit.stores++;return create.apply(this,args)};value=api}})})()`;

(async()=>{
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const targets=(await cdp('Target.getTargets',{},null)).targetInfos;
  targetId=targets.find(t=>t.type==='page'&&t.url===url)?.targetId||(await cdp('Target.createTarget',{url},null)).targetId;
  active=(await cdp('Target.attachToTarget',{targetId,flatten:true},null)).sessionId;
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');await cdp('Page.bringToFront');await ready();
  const metadata={url,htmlSha256:crypto.createHash('sha256').update(fs.readFileSync(htmlPath)).digest('hex'),startedAt:new Date().toISOString(),isolated:true};

  await check('full-timer-save-review-history-penalty-return-path',async()=>{
    await viewport(1280,800);await seedLayout(layoutRows(6));await blurLayout();
    await hold();assert.equal((await state()).status,'计时中');await wait(280);await tap();await ready();
    assert.equal(await ev('document.querySelector("#coreCount").textContent'),'7');
    const before=await state();assert.equal(before.count,7);await nav('review');
    assert.equal((await viewState()).group,'default');assert.equal(await ev('document.querySelector("#reviewBody").hidden'),false);
    if(await ev('document.querySelector("#historyBody").hidden'))await click('#historyToggle');
    await click('#historyList [data-record-uid="layout-1"]');assert.equal(await ev('document.querySelector("#recordDialog").open'),true);
    await click('#recordPlus');assert.equal((await state()).records.find(r=>r.uid==='layout-1').penalty,'+2');
    const reviewAo5=await ev('document.querySelector("#ao5").textContent');await click('#recordClose');await nav('timer');
    assert.equal((await viewState()).focused,'pad');assert.equal(await ev('document.querySelector("#coreAo5").textContent'),reviewAo5);
    assert.equal((await state()).count,7);await cdp('Page.reload');await wait(80);await ready();
    assert.equal((await viewState()).timerHidden,false);assert.equal((await state()).records.find(r=>r.uid==='layout-1').penalty,'+2');
    return{saved:7,editedUid:'layout-1',view:await viewState()};
  });
  await check('preparation-running-and-inspection-lock-navigation',async()=>{
    await seedLayout();await blurLayout();await key('keyDown');await wait(100);await assertLocked('timer');
    await wait(320);assert.equal((await state()).status,'按住');await assertLocked('timer');
    await key('keyUp');assert.equal((await state()).status,'计时中');await assertLocked('timer');
    await wait(150);await tap();await ready();assert.equal((await viewState()).locked,false);
    await click('#inspectionToggle');await blurLayout();await tap();assert.equal((await state()).status,'观察中');await assertLocked('timer');
    await tap('Escape');assert.equal((await viewState()).locked,false);await click('#inspectionToggle');
    return{preparation:true,running:true,inspection:true};
  });
  await check('review-import-group-edit-and-dialog-locks',async()=>{
    await nav('review');await ev(`(()=>{const file=new File(['[]'],'delayed-layout.json');file.text=()=>new Promise(resolve=>{window.finishLayoutImport=()=>resolve('[]')});const transfer=new DataTransfer();transfer.items.add(file);const input=document.querySelector('#importFile');input.files=transfer.files;input.files[0].text=file.text;input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await assertLocked('review');await blurLayout();await hold();assert.notEqual((await state()).status,'计时中');
    await ev('window.finishLayoutImport()');await until('!document.querySelector("#navTimer").disabled');
    await click('#groupNew');await assertLocked('review');await click('#groupCancel');
    await chooseLayoutRecord('layout-1');await assertLocked('review');await click('#recordClose');
    return{import:true,groupEditor:true,dialog:true};
  });
  await check('ready-held-inspection-15-17-boundary-text-and-color',async()=>{
    await viewport(390,844);await seedLayout(layoutRows(),true);await topLayout();
    const existingUids=(await state()).records.map(r=>r.uid);
    // Only the test clock is frozen; native hold timers and RAF rendering keep running.
    await ev('window.__layoutClock=100000;performance.now=()=>window.__layoutClock');
    const evidence=[];
    try{
      await blurLayout();await tap();assert.equal((await state()).status,'观察中');await key('keyDown');
      for(const [elapsed,penalty]of [[15000,'+2'],[17000,'dnf']]){
        const holding=await ev(`(()=>{window.__layoutClock=${100000+elapsed};return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({state:document.querySelector('#pad').dataset.state,penalty:document.querySelector('#pad').dataset.penalty,text:document.querySelector('#subStatus').textContent}))))})()`);
        assert.equal(holding.state,'inspecting');assert.equal(holding.penalty,penalty);assert.match(holding.text,/按住/);assert.match(holding.text,penalty==='+2'?/\+2/:/DNF/);evidence.push({phase:'holding',elapsed,...holding});
      }
      await key('keyUp');await tap('Escape');await ev('window.__layoutClock=100000');await tap();await key('keyDown');await wait(420);
      assert.equal((await state()).status,'按住');
      for(const [elapsed,penalty,token]of [[14999,'ok','--green-bright'],[15000,'+2','--yellow'],[17000,'dnf','--red-text']]){
        await ev('window.__layoutClock='+String(100000+elapsed));await wait(80);
        const actual=await ev(`(()=>{const probe=document.createElement('span');probe.style.color='var(${token})';probe.style.position='absolute';document.querySelector('#pad').appendChild(probe);const expectedColor=getComputedStyle(probe).color;probe.remove();return{state:document.querySelector('#pad').dataset.state,penalty:document.querySelector('#pad').dataset.penalty,text:document.querySelector('#subStatus').textContent,color:getComputedStyle(document.querySelector('#subStatus')).color,expectedColor}})()`);
        assert.equal(actual.state,'ready');assert.equal(actual.penalty,penalty);assert.equal(actual.color,actual.expectedColor);
        if(penalty==='+2')assert.match(actual.text,/\+2/);if(penalty==='dnf')assert.match(actual.text,/DNF/);await assertLocked('timer');await shot('mobile-ready-'+(penalty==='ok'?'normal':penalty==='+2'?'plus2':'dnf'));evidence.push({elapsed,...actual});
      }
      await key('keyUp');assert.equal((await state()).status,'计时中');await tap();await ready();const added=(await state()).records.filter(r=>!existingUids.includes(r.uid));assert.equal(added.length,1);assert.equal(added[0].penalty,'dnf');
    }finally{await ev('delete performance.now;delete window.__layoutClock');await key('keyUp');}
    return{evidence};
  });
  await check('native-touchcancel-preserves-zoom-and-inspection-state',async()=>{
    await seedLayout(layoutRows(),true);await viewport(390,844);await topLayout();const before=(await state()).count;
    const p=await point('#pad');await touch('touchStart',p);await wait(50);assert.equal((await state()).status,'观察中');
    await touch('touchCancel',p);assert.equal((await state()).status,'就绪');assert.equal((await viewState()).locked,false);assert.equal((await state()).count,before);
    await touchTap('#pad');assert.equal((await state()).status,'观察中');
    await touch('touchStart',p);await wait(50);await touch('touchCancel',p);assert.equal((await state()).status,'观察中');assert.equal((await viewState()).locked,true);
    await touch('touchStart',p);await wait(420);assert.equal((await state()).status,'按住');await touch('touchCancel',p);assert.equal((await state()).status,'观察中');
    await click('#cancelInspection');assert.equal((await viewState()).locked,false);assert.equal((await state()).count,before);
    const zoom=await ev(`({meta:document.querySelector('meta[name="viewport"]').content,touchAction:getComputedStyle(document.querySelector('#pad')).touchAction})`);
    assert.ok(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\D|$)/i.test(zoom.meta));assert.match(zoom.touchAction,/pinch-zoom|manipulation|auto/);return{zoom,recordsUnchanged:before};
  });
  await check('review-shortcuts-cannot-start-or-edit-background',async()=>{
    await nav('review');await blurLayout();const before=await state();await hold();await tap('n');await tap('1');await tap('2');
    const after=await state();assert.deepEqual(after.records,before.records);assert.equal(after.scramble,before.scramble);assert.notEqual(after.status,'计时中');assert.equal((await viewState()).reviewHidden,false);
    return{records:after.records.length,scrambleUnchanged:true};
  });
  await check('view-switch-preserves-initialization-and-active-scramble',async()=>{
    const injection=await cdp('Page.addScriptToEvaluateOnNewDocument',{source:initCounter});
    try{
      await cdp('Page.reload');await wait(80);await ready();const before=await ev('({...window.__layoutInit,scramble:document.querySelector("#scrambleText").textContent})');
      for(let i=0;i<3;i++){await nav('review');await nav('timer');}
      const after=await ev('({...window.__layoutInit,scramble:document.querySelector("#scrambleText").textContent})');assert.deepEqual(after,before);assert.equal(after.workers,1);assert.equal(after.solver,1);assert.equal(after.stores,1);return{before,after};
    }finally{await cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});}
  });
  await check('hidden-dom-release-first-open-resize-and-cache',async()=>{
    await nav('timer');assert.equal(await ev('document.querySelector("#reviewChart").children.length'),0);assert.equal(await ev('document.querySelector("#reviewRecord").options.length'),0);assert.equal(await ev('document.querySelector("#historyList").children.length'),0);
    const evidence=[];
    for(const [width,height]of [[1280,800],[390,844],[320,568],[844,390]]){
      await viewport(width,height);await nav('review');await wait(100);
      const chart=await ev(`(()=>{const c=document.querySelector('#reviewChart'),r=c.getBoundingClientRect();return{width:r.width,height:r.height,viewBox:c.getAttribute('viewBox'),paths:c.querySelectorAll('[data-series]').length}})()`);
      const parts=chart.viewBox.split(' ').map(Number);assert.equal(parts[2],Math.max(280,Math.round(chart.width)));assert.equal(parts[3],Math.max(236,Math.round(chart.height)));assert.ok(chart.paths>0);evidence.push({width,...chart});
      await nav('timer');assert.equal(await ev('document.querySelector("#reviewChart").children.length'),0);
    }
    await viewport(1280,800);await nav('review');
    await until(`(()=>{const c=document.querySelector('#reviewChart'),parts=c.getAttribute('viewBox').split(' ').map(Number);return parts[2]===Math.max(280,c.clientWidth)&&parts[3]===Math.max(236,c.clientHeight)})()`);
    await wait(150);await ev('window.__cachedChart=document.querySelector("#reviewChart").firstChild');await wait(100);
    assert.equal(await ev('window.__cachedChart===document.querySelector("#reviewChart").firstChild'),true,'Viewport resize has settled before checking cache');
    const stableSize=await ev('document.querySelector("#reviewChart").getAttribute("viewBox")');
    await click('#groupRename');await click('#groupCancel');assert.equal(await ev('window.__cachedChart===document.querySelector("#reviewChart").firstChild'),true);assert.equal(await ev('document.querySelector("#reviewChart").getAttribute("viewBox")'),stableSize);
    return{evidence,stableSize,unchangedRenderRetainsChart:true};
  });
  await check('desktop-mobile-small-landscape-screens-and-targets',async()=>{
    await seedLayout();const evidence=[];
    for(const [width,height,name]of [[1280,800,'desktop'],[390,844,'mobile'],[320,568,'small'],[844,390,'landscape']]){
      await viewport(width,height);await nav('timer');await topLayout();const timer=await geometry();
      assert.ok(timer.documentWidth<=width&&timer.mainScrollWidth<=timer.mainWidth);assert.ok(timer.timer.left>=0&&timer.timer.right<=width);
      for(const control of timer.controls)assert.ok(control.height>=44,'44px height '+control.id);
      if(width===390){assert.ok(timer.scramble.top>=0&&timer.scramble.bottom<height);assert.ok(timer.status.bottom<height,'Phone first screen contains key timing state');}
      await shot(name+'-timer');await nav('review');await topLayout();await shot(name+'-review');
      const review=await geometry();assert.ok(review.documentWidth<=width&&review.mainScrollWidth<=review.mainWidth);
      await chooseLayoutRecord('layout-9');const dialog=await ev(`(()=>{const d=document.querySelector('#recordDialog'),r=d.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:d.clientWidth,scrollWidth:d.scrollWidth,scrollHeight:d.scrollHeight,height:d.clientHeight}})()`);
      assert.ok(dialog.left>=0&&dialog.right<=width&&dialog.top>=0&&dialog.bottom<=height);assert.ok(dialog.scrollWidth<=dialog.width);await shot(name+'-detail');
      await point('#recordDnf');await click('#recordClose');evidence.push({width,height,timer,review,dialog});
    }
    return{evidence};
  });
  await check('native-return-from-scrolled-review-shows-timer-context',async()=>{
    const evidence=[];
    for(const [width,height]of [[1280,800],[390,844]]){
      await viewport(width,height);await nav('review');
      if(await ev('document.querySelector("#historyBody").hidden'))await click('#historyToggle');
      await ev('document.querySelector("main").scrollTop=document.querySelector("main").scrollHeight;scrollTo(0,document.documentElement.scrollHeight)');await wait(80);
      await click('#navTimer');const actual=await geometry();assert.equal((await viewState()).focused,'pad');
      assert.equal(actual.scrollY,0);assert.equal(actual.mainScrollTop,0);await shot(width===390?'mobile-native-return':'desktop-native-return');
      assert.ok(actual.scramble.top>=0&&actual.scramble.bottom<height,'Returned scramble is visible at '+width);
      assert.ok(actual.status.top>=0&&actual.status.bottom<height,'Returned timing state is visible at '+width);evidence.push(actual);
    }
    return{evidence};
  });
  await check('enlarged-text-scroll-and-reduced-motion',async()=>{
    await viewport(390,844);await nav('timer');await topLayout();
    const fontBefore=await ev('parseFloat(getComputedStyle(document.querySelector("#subStatus")).fontSize)');
    await ev(`(()=>{const style=document.createElement('style');style.id='layout-test-font';style.textContent='html{font-size:200% !important}';document.head.appendChild(style)})()`);
    const fontAfter=await ev('parseFloat(getComputedStyle(document.querySelector("#subStatus")).fontSize)');assert.ok(fontAfter>=fontBefore*1.99,'Text really doubles, not merely the unused root size');
    const enlarged=await geometry();assert.ok(enlarged.documentWidth<=390&&enlarged.mainScrollWidth<=enlarged.mainWidth);await shot('mobile-enlarged-text');
    await nav('review');await chooseLayoutRecord('layout-1');await point('#recordDnf');await shot('mobile-enlarged-detail');await click('#recordClose');
    await ev('document.querySelector("#layout-test-font").remove()');
    await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    const motion=await ev(`(()=>({reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,transitions:[...document.querySelectorAll('#timer,.switch-dot,.history-chevron,#navTimer')].map(el=>({id:el.id||el.className,duration:getComputedStyle(el).transitionDuration,animation:getComputedStyle(el).animationName}))}))()`);
    assert.equal(motion.reduced,true);assert.ok(motion.transitions.every(t=>t.duration.split(',').every(d=>parseFloat(d)===0)&&t.animation==='none'));await cdp('Emulation.setEmulatedMedia',{features:[]});return{fontBefore,fontAfter,enlarged,motion};
  });
  await check('timer-frames-do-not-rebuild-statistics-or-recent-list',async()=>{
    await viewport(1280,800);await nav('timer');await topLayout();await ev(`window.__frameChanges=[];window.__frameObserver=new MutationObserver(entries=>window.__frameChanges.push(...entries.map(e=>e.target.id)));for(const id of ['recentList','coreAo5','coreCount','reviewChart','historyList'])window.__frameObserver.observe(document.getElementById(id),{childList:true,subtree:true,characterData:true})`);
    await blurLayout();await hold();await ev('window.__frameChanges=[]');await wait(600);const changes=await ev('window.__frameChanges');assert.deepEqual(changes,[]);await ev('window.__frameObserver.disconnect()');await tap();await ready();return{changesDuringTiming:changes};
  });
  await check('no-network-or-uncaught-errors',async()=>{assert.deepEqual(networkRequests.filter(u=>/^https?:/.test(u)),[]);assert.deepEqual(runtimeErrors,[]);return{networkRequests,runtimeErrors};});
  const summary={passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,total:results.length};
  fs.writeFileSync(path.join(outDir,'browser-regression-results.json'),JSON.stringify({metadata,summary,results,runtimeErrors,networkRequests},null,2));
  console.log(JSON.stringify(summary));ws.close();if(summary.failed)process.exitCode=1;
})().catch(error=>{console.error(error);fs.writeFileSync(path.join(outDir,'browser-regression-results.json'),JSON.stringify({results,runtimeErrors,fatal:error.stack},null,2));ws.close();process.exitCode=1;});
