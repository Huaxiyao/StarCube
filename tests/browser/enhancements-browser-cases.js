const networkRequests=[];
ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Network.requestWillBeSent')networkRequests.push(m.params.request.url);});
const audioProbe=`(()=>{const Real=window.AudioContext;window.__tones=[];window.AudioContext=class extends Real{createOscillator(){const o=super.createOscillator(),start=o.start.bind(o),set=o.frequency.setValueAtTime.bind(o.frequency);let frequency;o.frequency.setValueAtTime=(value,at)=>{frequency=value;return set(value,at)};o.start=(at)=>{window.__tones.push({frequency,at,now:performance.now()});start(at)};return o}}})()`;
async function downloadBackup(selector='#exportData'){
  await cdp('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:downloadDir,eventsEnabled:true},null);
  const start=downloads.length;await click(selector);let begin;
  for(let i=0;i<160;i++){begin=downloads.slice(start).find(d=>d.method==='Browser.downloadWillBegin');if(begin&&downloads.some(d=>d.guid===begin.guid&&d.state==='completed'))break;await wait(50);}
  assert.ok(begin&&downloads.some(d=>d.guid===begin.guid&&d.state==='completed'),'Backup downloaded');
  return JSON.parse(fs.readFileSync(path.join(downloadDir,begin.guid),'utf8'));
}
async function addRows(from,to){
  await ev(`(()=>{const s=StarCubeStore.create({storage:localStorage});${JSON.stringify(Array.from({length:to-from+1},(_,i)=>({...record(from+i),uid:'extra-'+(from+i)})))}.forEach(r=>s.put(r));})()`);
  await cdp('Page.reload');await wait(80);await ready();
}
(async()=>{
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const targets=(await cdp('Target.getTargets',{},null)).targetInfos;
  for(const target of targets.filter(t=>t.type==='page'&&t.url===url))await cdp('Target.closeTarget',{targetId:target.targetId},null);
  targetId=(await cdp('Target.createTarget',{url},null)).targetId;
  active=(await cdp('Target.attachToTarget',{targetId,flatten:true},null)).sessionId;
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');await cdp('Page.bringToFront');await ready();
  await cdp('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  const probe=await cdp('Page.addScriptToEvaluateOnNewDocument',{source:audioProbe});
  const metadata={url,htmlSha256:crypto.createHash('sha256').update(fs.readFileSync(htmlPath)).digest('hex'),startedAt:new Date().toISOString(),isolated:true,offline:true};
  await check('average-insufficient-and-five-details',async()=>{
    await viewport(1280,800);await reset([record(1),record(2)]);
    assert.equal(await ev('document.querySelector("#coreAo5Detail").disabled'),true);
    await reset([record(1,9000),record(2,10000),record(3,11000,'+2'),record(4,14000),record(5,15000,'dnf')]);
    await click('#coreAo5Detail');
    const actual=await ev(`({open:averageDialog.open,result:averageResult.textContent,formula:averageFormula.textContent,rows:[...averageRows.children].map(r=>({text:r.textContent,excluded:r.dataset.excluded})),focus:document.activeElement.id})`);
    assert.equal(actual.open,true);assert.equal(actual.result,'12.333');assert.equal(actual.rows.length,5);
    assert.deepEqual(actual.rows.map(r=>r.excluded),['best','','','','worst']);assert.match(actual.rows[2].text,/原始 11.000 \+ 2 秒/);assert.equal(actual.focus,'averageClose');
    await shot('desktop-average-five');return {actual};
  });
  await check('average-native-focus-and-timer-isolation',async()=>{
    const before=await state();await ev('averageTitle.tabIndex=-1;averageTitle.focus()');await tap('n');await tap('1');await tap('2');await hold();
    assert.deepEqual((await state()).records,before.records);assert.equal((await state()).scramble,before.scramble);assert.equal((await state()).status,before.status);
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    assert.equal(await ev('averageDialog.contains(document.activeElement) || document.activeElement===document.body'),true);
    await tap('Escape');assert.equal(await ev('averageDialog.open'),false);assert.equal(await ev('document.activeElement.id'),'coreAo5Detail');
    await ev('pad.focus()');await hold();assert.equal((await state()).status,'计时中');await tap();await ready();
  });
  await check('average-twelve-dnf-and-responsive-dialog',async()=>{
    await reset(Array.from({length:12},(_,i)=>record(i+1,10000+i*1000,i>9?'dnf':'ok')));
    await click('#navReview');await click('#ao12Detail');assert.equal(await ev('averageResult.textContent'),'DNF');
    assert.equal(await ev('averageRows.children.length'),12);const layouts=[];
    for(const [width,height]of [[1280,800],[375,812],[320,568]]){
      await viewport(width,height);
      const layout=await ev(`(()=>{const d=averageDialog,r=d.getBoundingClientRect();return{width:innerWidth,doc:document.documentElement.scrollWidth,left:r.left,right:r.right,top:r.top,bottom:r.bottom,client:d.clientWidth,scroll:d.scrollWidth,closeHeight:averageClose.getBoundingClientRect().height}})()`);
      assert.ok(layout.doc<=width&&layout.left>=0&&layout.right<=width&&layout.top>=0&&layout.bottom<=height);assert.ok(layout.scroll<=layout.client&&layout.closeHeight>=44);layouts.push(layout);
      await shot('average-twelve-'+width);
    }
    await click('#averageClose');return{layouts};
  });
  await check('preview-off-is-independent-and-pointer-focus-returns',async()=>{
    await viewport(1280,800);await reset([],true);
    const before=await state();await click('#soundPreview');await wait(1000);
    const after=await state(),tones=await ev('__tones');assert.equal(tones.length,3);assert.deepEqual(tones.map(t=>t.frequency),[660,880,880]);
    assert.equal(after.status,before.status);assert.equal(after.scramble,before.scramble);assert.equal(after.count,0);assert.equal(await ev('soundToggle.getAttribute("aria-checked")'),'false');assert.equal(await ev('document.activeElement.id'),'pad');
    return{tones};
  });
  await check('inspection-native-eight-and-twelve-cues',async()=>{
    await reset([],true);await click('#soundToggle');await ev('pad.focus()');await tap();assert.equal((await state()).status,'观察中');
    await wait(8300);assert.deepEqual(await ev('__tones.map(t=>t.frequency)'),[660]);
    await wait(4000);assert.deepEqual(await ev('__tones.map(t=>t.frequency)'),[660,880,880]);
    await tap('Escape');assert.equal((await state()).count,0);
    await cdp('Page.reload');await wait(80);await ready();assert.equal(await ev('soundToggle.getAttribute("aria-checked")'),'true');
  });
  await check('audio-unsupported-feedback-and-timing',async()=>{
    const block=await cdp('Page.addScriptToEvaluateOnNewDocument',{source:'window.AudioContext=undefined;window.webkitAudioContext=undefined;'});
    await reset();await click('#soundPreview');assert.match(await ev('soundFeedback.textContent'),/不支持/);
    await ev('pad.focus()');await hold();await tap();await ready();assert.equal((await state()).count,1);
    await cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:block.identifier});
  });
  await check('backup-threshold-snooze-refresh-and-download',async()=>{
    await reset(Array.from({length:99},(_,i)=>record(i+1)));assert.equal(await ev('backupReminder.hidden'),true);
    await addRows(100,100);assert.equal(await ev('backupReminder.hidden'),false);
    await click('#backupLater');assert.equal(await ev('backupReminder.hidden'),true);
    await cdp('Page.reload');await wait(80);await ready();assert.equal(await ev('backupReminder.hidden'),true);
    await addRows(101,199);assert.equal(await ev('backupReminder.hidden'),true);
    await addRows(200,200);assert.equal(await ev('backupReminder.hidden'),false);
    const payload=await downloadBackup('#backupExport');assert.equal(payload.records.length,200);assert.equal(payload.version,3);assert.equal(JSON.stringify(payload).includes('lastExportRequestedAt'),false);
    assert.equal(await ev('backupReminder.hidden'),true);assert.match(await ev('backupStatus.textContent'),/上次发起导出/);assert.match((await state()).feedback,/请确认文件已保存/);
    await click('#penaltyPlus');assert.match(await ev('backupStatus.textContent'),/数据有更改/);
  });
  await check('backup-cross-tab-export-clears-other-reminder',async()=>{
    await reset(Array.from({length:100},(_,i)=>record(i+1)));
    const otherTarget=(await cdp('Target.createTarget',{url},null)).targetId;
    const other=(await cdp('Target.attachToTarget',{targetId:otherTarget,flatten:true},null)).sessionId;
    await cdp('Page.enable',{},other);await cdp('Runtime.enable',{},other);await ready(other);
    await ev(`(()=>{const b=StarCubeBackup.create({storage:localStorage}),s=StarCubeStore.create({storage:localStorage}).load();b.observe(s.records,s.groups);b.markExportRequested()})()`,other);
    await until('backupReminder.hidden');assert.match(await ev('backupStatus.textContent'),/上次发起导出/);
    await cdp('Target.closeTarget',{targetId:otherTarget},null);await cdp('Page.bringToFront');
  });
  await check('utilities-responsive-and-reminder-does-not-interrupt',async()=>{
    await reset(Array.from({length:100},(_,i)=>record(i+1)),true);const layouts=[];
    for(const [width,height]of [[1280,800],[375,812],[320,568]]){
      await viewport(width,height);await point('#backupStatus');
      const layout=await ev(`({width:innerWidth,doc:document.documentElement.scrollWidth,buttons:['soundToggle','soundPreview','backupExport','backupLater'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return{id,w:r.width,h:r.height}})})`);
      assert.ok(layout.doc<=width);assert.ok(layout.buttons.every(b=>b.w>=44&&b.h>=44));layouts.push(layout);await shot('utilities-'+width);
    }
    await viewport(1280,800);await point('#pad');await ev('pad.focus()');await tap();assert.equal((await state()).status,'观察中');
    assert.equal(await ev('backupExport.disabled && backupLater.disabled && soundToggle.disabled && soundPreview.disabled'),true);
    assert.equal(await ev('averageDialog.open || recordDialog.open'),false);await tap('Escape');return{layouts};
  });
  await check('offline-no-network-or-uncaught-errors',async()=>{assert.deepEqual(networkRequests.filter(u=>/^https?:/.test(u)),[]);assert.deepEqual(runtimeErrors,[]);return{networkRequests,runtimeErrors};});
  await cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:probe.identifier});
  await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  const summary={passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,total:results.length};
  fs.writeFileSync(path.join(outDir,'browser-regression-results.json'),JSON.stringify({metadata,summary,results,runtimeErrors,networkRequests},null,2));
  console.log(JSON.stringify(summary));ws.close();if(summary.failed)process.exitCode=1;
})().catch(error=>{console.error(error);fs.writeFileSync(path.join(outDir,'browser-regression-results.json'),JSON.stringify({results,runtimeErrors,fatal:error.stack},null,2));ws.close();process.exitCode=1;});
