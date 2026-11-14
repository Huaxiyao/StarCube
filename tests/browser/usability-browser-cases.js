'use strict';
// Native CDP mouse, touch, key pairs. Dedicated synthetic profile only.
const networkRequests=[];
ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Network.requestWillBeSent')networkRequests.push(m.params.request.url);});
const usabilityRows=(count=24)=>Array.from({length:count},(_,i)=>({...record(i+1,Math.round(18800-i*110+Math.sin(i*1.3)*1900),i===9?'dnf':i===16?'+2':'ok'),uid:'usability-'+(i+1),groupId:'default',at:new Date(Date.UTC(2026,9,1,10,0,i)).toISOString()}));
async function seedUsability(rows=usabilityRows(),inspection=false){
  await ev(`(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('starcube.'))localStorage.removeItem(key);sessionStorage.removeItem('starcube.currentGroup.v1');localStorage.setItem('starcube.settings.v1',JSON.stringify({inspection:${inspection}}));const s=window.StarCubeStore.create({storage:localStorage});s.putGroup({id:'usability-other',origin:'usability-fixture',name:'另一组练习'});${JSON.stringify(rows)}.forEach(r=>s.put(r))})()`);
  await cdp('Page.reload');await wait(80);await ready();
}
async function rawKey(name,code,vk){for(const type of ['keyDown','keyUp'])await cdp('Input.dispatchKeyEvent',{type,key:name,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk});}
async function focusInfo(){return ev(`({id:document.activeElement.id,locked:document.querySelector('#navReview').disabled,scrollY,status:document.querySelector('#status').textContent})`);}
async function toView(view){if(await ev(`document.querySelector('#${view}View').hidden`))await click(view==='timer'?'#navTimer':'#navReview');}
async function topUsability(){await ev('scrollTo(0,0);document.querySelector("main").scrollTop=0');}
async function solveWithoutBlur(){await hold();assert.equal((await state()).status,'计时中');await wait(120);await tap();await ready();}
async function movingTouch(p,dx,dy,steps=8){await touch('touchStart',p);for(let i=1;i<=steps;i++){await touch('touchMove',{...p,x:p.x+dx*i/steps,y:p.y+dy*i/steps});await wait(20);}await touch('touchEnd',p);await wait(180);}
async function dragMouse(p,dx,dy,holdMs=60){await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await wait(holdMs);await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx,y:p.y+dy,button:'left',buttons:1});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx,y:p.y+dy,button:'left',clickCount:1});}
async function measuredLayout(){return ev(`(()=>{const m=document.querySelector('main'),pad=document.querySelector('#pad').getBoundingClientRect(),timer=document.querySelector('#timer').getBoundingClientRect(),scramble=document.querySelector('.scramble').getBoundingClientRect(),status=document.querySelector('#subStatus').getBoundingClientRect();return{width:innerWidth,height:innerHeight,docWidth:document.documentElement.scrollWidth,mainWidth:m.clientWidth,mainScrollWidth:m.scrollWidth,scrollY,pad:{top:pad.top,bottom:pad.bottom},timer:{left:timer.left,right:timer.right,top:timer.top,bottom:timer.bottom},scramble:{top:scramble.top,bottom:scramble.bottom},status:{top:status.top,bottom:status.bottom},controls:[...document.querySelectorAll('button,select,input:not([type=file]),summary')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height).map(e=>({id:e.id||e.tagName,height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width}))}})()`);}

(async()=>{
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const targets=(await cdp('Target.getTargets',{},null)).targetInfos;
  targetId=targets.find(t=>t.type==='page'&&t.url===url)?.targetId||(await cdp('Target.createTarget',{url},null)).targetId;
  active=(await cdp('Target.attachToTarget',{targetId,flatten:true},null)).sessionId;
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');await cdp('Page.bringToFront');await ready();
  const metadata={url,htmlSha256:crypto.createHash('sha256').update(fs.readFileSync(htmlPath)).digest('hex'),startedAt:new Date().toISOString(),isolated:true};

  await check('native-mouse-penalties-delete-to-space-continuous-solves',async()=>{
    await viewport(1280,800);await seedUsability();const evidence=[];
    for(const selector of ['#penaltyPlus','#penaltyDnf','#deleteLatest']){
      const before=(await state()).count;await click(selector);const clicked=await focusInfo();assert.equal(clicked.id,'pad');
      const afterAction=(await state()).count;assert.equal(afterAction,before-(selector==='#deleteLatest'?1:0));
      await solveWithoutBlur();assert.equal((await state()).count,afterAction+1);evidence.push({selector,clicked,savedCount:(await state()).count});
    }
    return{evidence};
  });
  await check('native-change-scramble-and-inspection-to-space',async()=>{
    await seedUsability();const old=(await state()).scramble;await click('#newScramble');assert.equal((await focusInfo()).id,'pad');await ready();await until(`document.querySelector('#scrambleText').textContent!==${JSON.stringify(old)}`);const next=(await state()).scramble;
    await solveWithoutBlur();const saved=(await state()).records.find(r=>!r.uid.startsWith('usability-'));assert.equal(saved.scramble,next);
    await click('#inspectionToggle');assert.equal((await focusInfo()).id,'pad');await tap();assert.equal((await state()).status,'观察中');await hold();assert.equal((await state()).status,'计时中');await tap();await ready();
    await click('#inspectionToggle');assert.equal((await focusInfo()).id,'pad');await solveWithoutBlur();return{scramble:next,count:(await state()).count};
  });
  await check('group-pointer-change-focus-and-keyboard-select-semantics',async()=>{
    await seedUsability();
    // A native pointer starts selection; the selected value/change is supplied,
    // since the OS-owned select popup is not a DOM automation surface.
    const p=await point('#groupSelect');await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
    await ev(`(()=>{const s=document.querySelector('#groupSelect');s.value='usability-other';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});
    assert.equal((await focusInfo()).id,'pad');assert.equal(await ev('document.querySelector("#groupSelect").value'),'usability-other');await solveWithoutBlur();
    assert.equal((await state()).records.filter(r=>r.groupId==='usability-other').length,1);
    await ev('document.querySelector("#groupSelect").focus()');await rawKey('ArrowUp','ArrowUp',38);
    assert.equal((await focusInfo()).id,'groupSelect');assert.equal(await ev('document.querySelector("#groupSelect").value'),'default');
    await tap();assert.notEqual((await state()).status,'计时中');await rawKey('Escape','Escape',27);
    return{pointerChange:'native pointerdown + supplied change',keyboardSelection:'native ArrowUp and Space',group:await ev('document.querySelector("#groupSelect").value')};
  });
  await check('keyboard-tab-space-keeps-button-and-input-semantics',async()=>{
    await seedUsability();await ev('document.querySelector("#pad").focus()');await rawKey('Tab','Tab',9);assert.equal((await focusInfo()).id,'penaltyPlus');
    const before=(await state()).records;await hold();assert.notEqual((await state()).status,'计时中');assert.equal((await focusInfo()).id,'penaltyPlus');
    const changed=(await state()).records;assert.equal(changed.length,before.length);assert.equal(changed.at(-1).penalty,'+2');
    await click('#groupNew');await cdp('Input.insertText',{text:'N 1 2'});await hold();assert.notEqual((await state()).status,'计时中');assert.match(await ev('document.querySelector("#groupName").value'),/N 1 2/);await rawKey('Escape','Escape',27);
    return{focusedButton:'penaltyPlus',spaceActivatedButton:true,inputProtected:true};
  });
  await check('recent-detail-return-starts-next-solve-and-review-retains-origin',async()=>{
    await seedUsability();await click('#recentList [data-record-uid="usability-24"]');assert.equal(await ev('document.querySelector("#recordDialog").open'),true);
    await click('#recordPlus');await click('#recordClose');assert.equal((await focusInfo()).id,'pad');await solveWithoutBlur();
    await toView('review');await click('#reviewInspect');await click('#recordClose');assert.equal((await focusInfo()).id,'reviewInspect');
    const before=(await state()).count;await hold();assert.notEqual((await state()).status,'计时中');assert.equal((await state()).count,before);if(await ev('document.querySelector("#recordDialog").open'))await click('#recordClose');
    return{timerReturn:'pad',reviewReturn:'reviewInspect',count:before};
  });
  await check('native-vertical-touch-scrolls-page-without-starting',async()=>{
    await viewport(390,600);await seedUsability();await topUsability();const before=(await state()).count;const p=await point('#pad');
    await ev(`window.__scrollGestureEvents=[];for(const type of ['pointerdown','pointermove','pointercancel'])document.querySelector('#pad').addEventListener(type,e=>window.__scrollGestureEvents.push({type,x:e.clientX,y:e.clientY}),{passive:true})`);
    const scrollBefore=await ev('scrollY');await movingTouch(p,0,-180,10);const actual=await focusInfo();
    assert.ok(actual.scrollY>scrollBefore+20,'Native touch move actually scrolls page');assert.equal((await state()).count,before);assert.notEqual(actual.status,'计时中');assert.equal(actual.locked,false);await shot('phone-after-native-scroll');
    return{scrollBefore,after:actual,events:await ev('window.__scrollGestureEvents'),touchAction:await ev('getComputedStyle(document.querySelector("#pad")).touchAction')};
  });
  await check('touch-drag-cancels-hold-and-mouse-or-small-move-still-work',async()=>{
    await viewport(390,844);await seedUsability();await topUsability();const before=(await state()).count;let p=await point('#pad');
    await movingTouch(p,32,0,3);assert.equal((await state()).count,before);assert.equal((await focusInfo()).locked,false);assert.notEqual((await state()).status,'计时中');
    p=await point('#pad');await touch('touchStart',p);await wait(420);assert.equal((await state()).status,'按住');await touch('touchMove',{...p,x:p.x+32});await touch('touchEnd',p);assert.equal((await state()).count,before);assert.equal((await focusInfo()).locked,false);
    await viewport(1280,800);p=await point('#pad');await dragMouse(p,32,0,420);assert.equal((await state()).count,before);assert.equal((await state()).status,'计时中');await tap();await ready();assert.equal((await state()).count,before+1);
    await viewport(390,844);p=await point('#pad');await touch('touchStart',p);await touch('touchMove',{...p,x:p.x+4,y:p.y+4});await wait(420);assert.equal((await state()).status,'按住');await touch('touchEnd',p);assert.equal((await state()).status,'计时中');
    await touch('touchStart',p);assert.equal((await state()).count,before+2);await touch('touchMove',{...p,y:p.y-40});await touch('touchEnd',p);await ready();assert.equal((await state()).count,before+2);
    return{cancelledTouchPreparation:true,cancelledTouchReady:true,mouseDragKeepsOriginalStart:true,smallMoveStarted:true,stopSavedOnPointerDown:true};
  });
  await check('inspection-drag-and-second-finger-cancel-safely',async()=>{
    await viewport(390,844);await seedUsability(usabilityRows(),true);await topUsability();const before=(await state()).count;const p=await point('#pad');
    await movingTouch(p,32,0,3);assert.equal((await state()).status,'就绪');assert.equal((await focusInfo()).locked,false);
    await touchTap('#pad');assert.equal((await state()).status,'观察中');await movingTouch(p,32,0,3);assert.equal((await state()).status,'观察中');assert.equal((await focusInfo()).locked,true);await click('#cancelInspection');
    await touch('touchStart',p);assert.equal((await state()).status,'观察中');
    await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1},{x:12,y:24,id:2}]});await wait(350);assert.equal((await state()).status,'就绪');assert.equal((await state()).count,before);await touch('touchEnd',p);
    await touchTap('#pad');assert.equal((await state()).status,'观察中');await click('#cancelInspection');assert.equal((await state()).count,before);return{initialDragCancelsInspection:true,existingInspectionPreserved:true,secondFingerOutsidePadCancels:true};
  });
  await check('timer-region-keeps-vertical-position-across-hold-run-stop',async()=>{
    const evidence=[];
    const injection=await cdp('Page.addScriptToEvaluateOnNewDocument',{source:workerControl});
    try{for(const [width,height]of [[1280,800],[390,844]]){
      await viewport(width,height);await seedUsability();await topUsability();await ev('document.querySelector("#pad").focus({preventScroll:true})');
      const sample=async phase=>({phase,...await ev(`(()=>{const p=document.querySelector('#pad').getBoundingClientRect(),t=document.querySelector('#timer').getBoundingClientRect(),a=document.querySelector('#actions').getBoundingClientRect();return{scrollY,padTop:p.top,padHeight:p.height,timerCenterY:(t.top+t.bottom)/2,timerHeight:t.height,actionsHeight:a.height,scrambleMessage:document.querySelector('#scrambleText').classList.contains('is-message'),scrambleText:document.querySelector('#scrambleText').textContent}})()`)});
      const phases=[await sample('idle')];await key('keyDown');await wait(80);phases.push(await sample('holding'));await wait(340);phases.push(await sample('ready'));await key('keyUp');await wait(80);assert.equal((await state()).status,'计时中');phases.push(await sample('running'));await ev('window.__testWorker.queueOn=true');await key('keyDown');phases.push(await sample('stop-key-held-generating'));await key('keyUp');await until('window.__testWorker.queue.length>0');await ev('window.__testWorker.queueOn=false;window.__testWorker.queue.forEach(item=>item.deliver())');await ready();phases.push(await sample('stopped'));
      assert.equal(phases.find(p=>p.phase==='stop-key-held-generating').scrambleMessage,true,'The intermediate sample really catches generating text');evidence.push({width,height,phases});fs.writeFileSync(path.join(outDir,'timer-geometry-observations.json'),JSON.stringify(evidence,null,2));
      const base=phases[0];for(const phase of phases){assert.ok(Math.abs(phase.padTop-base.padTop)<=2,'Pad top stable '+width+' '+phase.phase);assert.ok(Math.abs(phase.padHeight-base.padHeight)<=2,'Pad height stable '+width+' '+phase.phase);assert.ok(Math.abs(phase.timerCenterY-base.timerCenterY)<=2,'Timer vertical center stable '+width+' '+phase.phase);assert.equal(phase.scrollY,base.scrollY);}
    }}finally{await cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});}
    return{evidence,note:'Checks vertical geometry, not numeral-dependent text width.'};
  });
  await check('rendered-desktop-mobile-small-landscape-and-enlarged-text',async()=>{
    await seedUsability();const layouts=[];
    for(const [width,height,name]of [[1280,800,'desktop'],[390,844,'phone'],[320,568,'small'],[844,390,'landscape']]){
      await viewport(width,height);await toView('timer');await topUsability();const actual=await measuredLayout();assert.ok(actual.docWidth<=width&&actual.mainScrollWidth<=actual.mainWidth);assert.ok(actual.timer.left>=0&&actual.timer.right<=width);assert.ok(actual.controls.every(c=>c.height>=44));
      if(width===390){assert.ok(actual.scramble.top>=0&&actual.scramble.bottom<height);assert.ok(actual.status.top>=0&&actual.status.bottom<height);}
      await shot(name+'-timer');await toView('review');await topUsability();await shot(name+'-review');await click('#reviewInspect');
      const dialog=await ev(`(()=>{const d=document.querySelector('#recordDialog'),r=d.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,client:d.clientWidth,scroll:d.scrollWidth}})()`);assert.ok(dialog.left>=0&&dialog.right<=width&&dialog.top>=0&&dialog.bottom<=height&&dialog.scroll<=dialog.client);await shot(name+'-detail');await click('#recordClose');layouts.push({width,height,actual,dialog});
    }
    await viewport(390,844);await toView('timer');await topUsability();const before=await ev('parseFloat(getComputedStyle(document.querySelector("#subStatus")).fontSize)');
    await ev(`(()=>{const style=document.createElement('style');style.id='usability-font-test';style.textContent='html{font-size:200% !important}';document.head.appendChild(style)})()`);
    try{const after=await ev('parseFloat(getComputedStyle(document.querySelector("#subStatus")).fontSize)');assert.ok(after>=before*1.99);const enlarged=await measuredLayout();assert.ok(enlarged.docWidth<=390&&enlarged.mainScrollWidth<=enlarged.mainWidth);await shot('phone-enlarged-text');layouts.push({fontBefore:before,fontAfter:after,enlarged});}finally{await ev('document.querySelector("#usability-font-test").remove()');}
    return{layouts};
  });
  await check('no-network-or-uncaught-errors',async()=>{assert.deepEqual(networkRequests.filter(u=>/^https?:/.test(u)),[]);assert.deepEqual(runtimeErrors,[]);return{networkRequests,runtimeErrors};});
  const summary={passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,total:results.length};
  fs.writeFileSync(path.join(outDir,'browser-regression-results.json'),JSON.stringify({metadata,summary,results,runtimeErrors,networkRequests},null,2));console.log(JSON.stringify(summary));ws.close();if(summary.failed)process.exitCode=1;
})().catch(error=>{console.error(error);fs.writeFileSync(path.join(outDir,'browser-regression-results.json'),JSON.stringify({results,runtimeErrors,fatal:error.stack},null,2));ws.close();process.exitCode=1;});
