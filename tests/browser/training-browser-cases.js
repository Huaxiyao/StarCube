// Executed by test-training-browser.cjs with the shared CDP fixture.
const networkRequests=[];
ws.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.method==='Network.requestWillBeSent')networkRequests.push(msg.params.request.url);});
async function groupState(session=active){return ev(`(()=>({selected:document.querySelector('#groupSelect').value,options:[...document.querySelector('#groupSelect').options].map(o=>({id:o.value,name:o.textContent})),pb:document.querySelector('#pb').textContent,globalPb:document.querySelector('#globalPb').textContent,avg:document.querySelector('#avg').textContent,locked:document.querySelector('#groupSelect').disabled,groups:window.StarCubeStore.create({storage:localStorage}).load().groups}))()`,session);}
async function selectGroup(id,session=active){await ev(`(()=>{const s=document.querySelector('#groupSelect');s.value=${JSON.stringify(id)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`,session);}
async function blur(session=active){await ev('document.activeElement?.blur()',session);}
async function newGroup(name){await click('#groupNew');await cdp('Input.insertText',{text:name});await click('#groupSave');assert.equal(await ev('document.querySelector("#groupForm").hidden'),true);return(await groupState()).selected;}
async function solve(ms=800,session=active){await blur(session);await hold(session);assert.equal((await state(session)).status,'计时中');await wait(ms);await tap(' ',session);await ready(session);}
async function exportDownload(){
  await cdp('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:downloadDir,eventsEnabled:true},null);
  const offset=downloads.length;await click('#exportData');let begin;
  for(let i=0;i<200;i++){begin=downloads.slice(offset).find(d=>d.method==='Browser.downloadWillBegin');if(begin&&downloads.some(d=>d.guid===begin.guid&&d.state==='completed'))break;await wait(50);}
  assert.ok(begin&&downloads.some(d=>d.guid===begin.guid&&d.state==='completed'),'Actual backup download completed');
  return JSON.parse(fs.readFileSync(path.join(downloadDir,begin.guid),'utf8'));
}

(async()=>{
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const targets=(await cdp('Target.getTargets',{},null)).targetInfos;
  targetId=targets.find(t=>t.type==='page'&&t.url===url)?.targetId||(await cdp('Target.createTarget',{url},null)).targetId;
  active=(await cdp('Target.attachToTarget',{targetId,flatten:true},null)).sessionId;
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');await cdp('Page.bringToFront');await ready();
  const metadata={url,htmlSha256:crypto.createHash('sha256').update(fs.readFileSync(htmlPath)).digest('hex'),startedAt:new Date().toISOString(),isolated:true};
  let ga,gb,payload;

  await check('two-groups-real-solves-penalty-refresh-download-and-restore',async()=>{
    await viewport(1440,900);await reset();
    ga=await newGroup('今晚练习');await solve(800);await solve(1100);
    const a=await state();assert.equal(a.count,2);assert.ok(a.records.every(r=>r.groupId===ga));
    gb=await newGroup('周末复盘');assert.equal((await state()).count,0);assert.equal((await state()).timer,'0.000');
    await solve(1500);await solve(1700);assert.equal((await state()).count,2);
    await selectGroup(ga);assert.equal((await state()).count,2);const beforePenalty=await state();await click('#penaltyPlus');
    const afterPenalty=await state();assert.equal(afterPenalty.records.filter(r=>r.groupId===ga).at(-1).penalty,'+2');assert.ok(afterPenalty.records.filter(r=>r.groupId===gb).every(r=>r.penalty==='ok'));
    await click('#groupRename');await ev('document.querySelector("#groupName").select()');await cdp('Input.insertText',{text:'今晚练习 · 第 2 轮'});await click('#groupSave');
    await cdp('Page.reload');await wait(80);await ready();assert.equal((await groupState()).selected,ga);assert.equal((await state()).count,2);
    assert.ok((await groupState()).options.some(g=>g.id===ga&&g.name==='今晚练习 · 第 2 轮'));
    const best=Math.min(...afterPenalty.records.map(r=>r.ms+(r.penalty==='+2'?2000:0)));
    assert.equal((await groupState()).globalPb,(best/1000).toFixed(3));
    await shot('desktop-training');payload=await exportDownload();assert.equal(payload.version,3);assert.equal(payload.groups.length,3);assert.equal(payload.records.length,4);
    await reset();await importFile(JSON.stringify(payload));await importFile(JSON.stringify(payload));
    assert.equal((await state()).records.length,4);assert.equal((await groupState()).groups.length,3);
    await selectGroup(ga);assert.equal((await state()).count,2);await selectGroup(gb);assert.equal((await state()).count,2);
    assert.deepEqual((await state()).records,payload.records);
    await viewport(390,844);await shot('mobile-training');
    return{ga,gb,beforePenalty,afterPenalty,restored:await groupState(),backup:payload};
  });

  await check('native-form-keys-and-keyboard-submit',async()=>{
    await viewport(390,844);await click('#groupNew');const before=await state();
    for(const name of ['N',' ','1',' ','2']){
      await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name===' '?'Space':name==='N'?'KeyN':'Digit'+name,text:name});
      await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name===' '?'Space':name==='N'?'KeyN':'Digit'+name});
    }
    assert.equal(await ev('document.querySelector("#groupName").value'),'N 1 2');await wait(400);
    assert.equal((await state()).count,before.count);assert.equal((await state()).scramble,before.scramble);assert.deepEqual((await state()).records,before.records);
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    assert.equal(await ev('document.querySelector("#groupForm").hidden'),true);assert.equal((await state()).count,0);assert.equal((await state()).actionsHidden,true);
    await blur();await tap('1');await tap('2');assert.equal((await state()).records.length,4);
    return{group:await groupState(),nativeTyped:'N 1 2'};
  });

  await check('preparation-inspection-running-and-import-locks',async()=>{
    await cdp('Page.reload');await wait(80);await ready();
    await selectGroup(ga);await blur();await key('keyDown');await wait(100);assert.equal((await groupState()).locked,true);
    await selectGroup(gb);assert.equal((await groupState()).selected,ga);await wait(320);assert.equal((await state()).status,'按住');await selectGroup(gb);assert.equal((await groupState()).selected,ga);
    await key('keyUp');assert.equal((await state()).status,'计时中');await selectGroup(gb);assert.equal((await groupState()).selected,ga);await tap();await ready();
    await click('#inspectionToggle');await blur();await tap();assert.equal((await state()).status,'观察中');const scramble=(await state()).scramble;
    await selectGroup(gb);assert.equal((await groupState()).selected,ga);await hold();assert.equal((await state()).status,'计时中');await wait(150);await tap();await ready();
    const saved=(await state()).records.filter(r=>r.groupId===ga).at(-1);assert.equal(saved.scramble,scramble);
    await ev(`(()=>{const file=new File(['[]'],'delayed.json');file.text=()=>new Promise(resolve=>{window.finishTrainingImport=()=>resolve('[]')});const transfer=new DataTransfer();transfer.items.add(file);const input=document.querySelector('#importFile');input.files=transfer.files;const selected=input.files[0];selected.text=file.text;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal((await groupState()).locked,true);await selectGroup(gb);assert.equal((await groupState()).selected,ga);await blur();await tap();assert.notEqual((await state()).status,'观察中');
    await ev('window.finishTrainingImport()');await until('!document.querySelector("#groupSelect").disabled');
    await click('#inspectionToggle');return{saved};
  });

  await check('cross-page-selections-concurrent-solves-and-frozen-identity',async()=>{
    await cdp('Page.reload');await wait(80);await ready();
    await selectGroup(ga);const a=active;let bTarget,b;
    try{
      bTarget=(await cdp('Target.createTarget',{url},null)).targetId;b=(await cdp('Target.attachToTarget',{targetId:bTarget,flatten:true},null)).sessionId;
      await cdp('Page.enable',{},b);await cdp('Runtime.enable',{},b);await ready(b);await selectGroup(gb,b);
      const before=(await state(a)).records.length;
      await cdp('Page.bringToFront',{},a);await blur(a);await hold(a);const scramble=(await state(a)).scramble;
      await cdp('Page.bringToFront',{},b);await blur(b);await hold(b);await wait(200);await tap(' ',b);await ready(b);
      await cdp('Page.bringToFront',{},a);assert.equal((await state(a)).status,'计时中');assert.equal((await groupState(a)).selected,ga);assert.equal((await state(a)).scramble,scramble);
      await tap(' ',a);await ready(a);assert.equal((await state(a)).records.length,before+2);assert.equal((await groupState(b)).selected,gb);
      const latest=(await state(a)).records.filter(r=>r.groupId===ga).at(-1);assert.equal(latest.scramble,scramble);
      await selectGroup('default',a);await wait(150);assert.equal((await groupState(b)).selected,gb);
      await cdp('Page.reload',{},b);await wait(80);await ready(b);assert.equal((await groupState(b)).selected,gb);
      return{latest,selectionA:(await groupState(a)).selected,selectionB:(await groupState(b)).selected};
    }finally{if(bTarget)await cdp('Target.closeTarget',{targetId:bTarget},null);await cdp('Page.bringToFront',{},a);}
  });

  await check('readonly-and-quota-memory-groups-export-and-restore',async()=>{
    await selectGroup(ga);const countBefore=(await state()).records.length;
    const injection=await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`Storage.prototype.setItem=function(){throw new DOMException('Isolated quota fixture','QuotaExceededError')}`});
    try{
      await cdp('Page.reload');await wait(80);await ready();assert.equal((await state()).writable,false);assert.ok((await state()).count>0);
      const memoryGroup=await newGroup('内存训练');await solve(300);await selectGroup(ga);await selectGroup(memoryGroup);assert.equal((await state()).count,1);
      const exported=await exportDownload();assert.equal(exported.records.length,countBefore+1);assert.ok(exported.groups.some(g=>g.id===memoryGroup));assert.ok(exported.records.some(r=>r.groupId===memoryGroup));
      fs.writeFileSync(path.join(outDir,'memory-backup.json'),JSON.stringify(exported,null,2));return{memoryGroup,exportedRecords:exported.records.length};
    }finally{await cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});await cdp('Page.reload');await wait(80);await ready();}
  });

  await check('old-backup-conflicts-missing-groups-and-repeat-import',async()=>{
    const before=(await state()).records.length;
    const local=(await groupState()).groups.find(g=>g.id===ga);
    const incoming={format:'starcube',version:3,groups:[{id:ga,origin:'other-installation',name:local.name}],records:[{...record(900,18000),uid:'foreign-900',groupId:ga},{...record(901,19000),uid:'foreign-901',groupId:'missing-session'}]};
    await importFile(JSON.stringify(incoming));assert.match((await state()).feedback,/冲突训练/);const first=await state();
    assert.equal(first.records.length,before+2);const remapped=first.records.find(r=>r.uid==='foreign-900').groupId;assert.notEqual(remapped,ga);
    assert.ok((await groupState()).groups.some(g=>g.id==='missing-session'));
    const groupCount=(await groupState()).groups.length;await importFile(JSON.stringify(incoming));assert.equal((await state()).records.length,before+2);assert.equal((await groupState()).groups.length,groupCount);
    await importFile(JSON.stringify({format:'starcube',version:2,records:[record(902,22000)]}));await importFile(JSON.stringify([record(902,22000)]));
    await selectGroup('default');assert.equal((await state()).count,1);return{remapped,groups:await groupState()};
  });

  await check('mobile-touch-group-flow-long-names-focus-and-layout',async()=>{
    await viewport(390,844);await reset();
    const a=await newGroup('手机练习'),b=await newGroup('长名称'.repeat(13));await selectGroup(a);
    await touchTap('#pad'); // inspection disabled: short tap must not start.
    const p=await point('#pad');await touch('touchStart',p);await wait(420);await touch('touchEnd',p);assert.equal((await state()).status,'计时中');
    await wait(300);await touchTap('#pad');await ready();assert.equal((await state()).records.find(r=>r.groupId===a).groupId,a);
    await selectGroup(b);assert.equal((await state()).count,0);await selectGroup(a);await click('#groupRename');
    const evidence=[];
    for(const [width,height]of [[320,568],[390,844],[844,390],[1440,900]]){
      await viewport(width,height);await point('#groupName');
      const layout=await ev(`(()=>({width:innerWidth,doc:document.documentElement.scrollWidth,main:document.querySelector('main').clientWidth,scroll:document.querySelector('main').scrollWidth,controls:[...document.querySelectorAll('.training button,.training select,.training input')].filter(e=>e.getBoundingClientRect().height>0).map(e=>({id:e.id,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),label:document.querySelector('#groupName').labels[0].textContent}))()`);
      assert.ok(layout.doc<=width&&layout.scroll<=layout.main);assert.ok(layout.controls.every(c=>c.height>=44));assert.equal(layout.label,'重命名训练');evidence.push(layout);
    }
    await viewport(390,844);await shot('mobile-training-form');await click('#groupCancel');
    // Deliver screenshots with the completed two-group backup restored.
    await reset();await importFile(JSON.stringify(payload));await selectGroup(ga);await ev('document.querySelector("main").scrollTop=0');await shot('mobile-training');
    await viewport(1440,900);await cdp('Page.reload');await wait(80);await ready();await shot('desktop-training');
    return{evidence,touchVerified:true};
  });

  await check('no-network-requests-or-uncaught-errors',async()=>{
    assert.deepEqual(networkRequests.filter(u=>/^https?:/.test(u)),[]);assert.deepEqual(runtimeErrors,[]);return{networkRequests,runtimeErrors};
  });
  const summary={passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,total:results.length};
  fs.writeFileSync(path.join(outDir,'browser-regression-results.json'),JSON.stringify({metadata,summary,results,runtimeErrors,networkRequests},null,2));
  console.log(JSON.stringify(summary));ws.close();if(summary.failed)process.exitCode=1;
})().catch(error=>{console.error(error);fs.writeFileSync(path.join(outDir,'browser-regression-results.json'),JSON.stringify({results,runtimeErrors,fatal:error.stack},null,2));ws.close();process.exitCode=1;});
