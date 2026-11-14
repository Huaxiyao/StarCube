// Product-level checks: native pointer/keyboard input, real SVG/DOM and storage.
const networkRequests = [];
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Network.requestWillBeSent') networkRequests.push(message.params.request.url);
});
const reviewRows = () => [10000,12000,14000,16000,18000,20000].map((ms,i) => ({
  ...record(i+1,ms,i===1?'+2':i===2?'dnf':'ok'),uid:'review-'+(i+1),groupId:'default',
  at:new Date(Date.UTC(2026,10,13,10,0,i)).toISOString()
}));
async function seedReview(rows=reviewRows(), groups=[], inspection=false) {
  await ev(`(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('starcube.'))localStorage.removeItem(key);sessionStorage.removeItem('starcube.currentGroup.v1');localStorage.setItem('starcube.settings.v1',JSON.stringify({inspection:${inspection}}));const s=window.StarCubeStore.create({storage:localStorage});${JSON.stringify(groups)}.forEach(g=>s.putGroup(g));${JSON.stringify(rows)}.forEach(r=>s.put(r));})()`);
  await cdp('Page.reload');await wait(80);await ready();
}
async function openReview(){if(await ev('!!document.querySelector("#reviewView") && document.querySelector("#reviewView").hidden'))await click('#navReview');if(await ev('document.querySelector("#reviewBody").hidden'))await click('#reviewToggle');}
async function reviewToTimer(){if(await ev('!!document.querySelector("#timerView") && document.querySelector("#timerView").hidden'))await click('#navTimer');}
async function selectReview(uid){await ev(`(()=>{const el=document.querySelector('#reviewRecord');el.value=${JSON.stringify(uid)};el.dispatchEvent(new Event('change',{bubbles:true}))})()`);}
async function openRecord(uid){await openReview();await selectReview(uid);await click('#reviewInspect');assert.equal(await ev('document.querySelector("#recordDialog").open'),true);}
async function selectReviewGroup(id,session=active){await ev(`(()=>{const el=document.querySelector('#groupSelect');el.value=${JSON.stringify(id)};el.dispatchEvent(new Event('change',{bubbles:true}))})()`,session);}
async function closeRecord(){if(await ev('document.querySelector("#recordDialog").open'))await click('#recordClose');}
async function exportReview(){
  await cdp('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:downloadDir,eventsEnabled:true},null);
  const start=downloads.length;await click('#exportData');let begin;
  for(let i=0;i<200;i++){begin=downloads.slice(start).find(d=>d.method==='Browser.downloadWillBegin');if(begin&&downloads.some(d=>d.guid===begin.guid&&d.state==='completed'))break;await wait(50);}
  assert.ok(begin&&downloads.some(d=>d.guid===begin.guid&&d.state==='completed'),'Backup downloaded');
  return JSON.parse(fs.readFileSync(path.join(downloadDir,begin.guid),'utf8'));
}

(async()=>{
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const targets=(await cdp('Target.getTargets',{},null)).targetInfos;
  targetId=targets.find(t=>t.type==='page'&&t.url===url)?.targetId||(await cdp('Target.createTarget',{url},null)).targetId;
  active=(await cdp('Target.attachToTarget',{targetId,flatten:true},null)).sessionId;
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');await cdp('Page.bringToFront');await ready();
  const metadata={url,htmlSha256:crypto.createHash('sha256').update(fs.readFileSync(htmlPath)).digest('hex'),startedAt:new Date().toISOString(),isolated:true};

  await check('empty-and-all-dnf-have-no-fabricated-zero-time',async()=>{
    await viewport(1280,800);await seedReview([]);await openReview();
    assert.equal(await ev('document.querySelector("#reviewInspect").disabled'),true);
    assert.equal(await ev('document.querySelectorAll("#reviewChart [data-series]").length'),0);
    const empty=await ev('document.querySelector("#reviewBody").textContent');
    assert.match(empty,/还没有|完成|暂无|开始/);
    await seedReview(reviewRows().slice(0,3).map(r=>({...r,penalty:'dnf'})));await openReview();
    const dnf=await ev(`(()=>({summary:document.querySelector('#reviewSummary').textContent,marks:document.querySelectorAll('#reviewChart [data-dnf]').length,paths:[...document.querySelectorAll('#reviewChart [data-series="value"]')].map(e=>e.getAttribute('d'))}))()`);
    assert.equal(dnf.marks,3);assert.ok(dnf.paths.every(d=>!d));return {empty,dnf};
  });

  await check('known-times-summary-ao5-and-dnf-chart-break',async()=>{
    await seedReview();await openReview();
    const chart=await ev(`(()=>({summary:document.querySelector('#reviewSummary').textContent,paths:[...document.querySelectorAll('#reviewChart [data-series="value"]')].map(e=>e.getAttribute('d')),dnf:[...document.querySelectorAll('#reviewChart [data-dnf]')].map(e=>e.getAttribute('data-dnf')),options:[...document.querySelector('#reviewRecord').options].map(e=>({value:e.value,text:e.textContent})),svg:document.querySelector('#reviewChart').outerHTML}))()`);
    assert.equal(await ev('document.querySelector("#reviewAverage").textContent'),'15.600');
    assert.equal(await ev('document.querySelector("#reviewBest").textContent'),'10.000');
    assert.ok(chart.paths.join(' ').match(/M/g).length>=2,'DNF interrupts the line');
    assert.deepEqual(chart.dnf,['review-3']);assert.equal(chart.options.length,6);
    assert.ok(!/NaN|Infinity/.test(chart.svg));
    await click('#reviewChart .review-dot');assert.equal(await ev('document.querySelector("#reviewRecord").value'),'review-1');
    await click('#reviewChart [data-dnf="review-3"]');assert.equal(await ev('document.querySelector("#reviewRecord").value'),'review-3');
    assert.equal(await ev('getComputedStyle(document.querySelector("#reviewChart .review-selection")).fill'),'none','Selected ring must not cover DNF cross');
    await openRecord('review-5');assert.match(await ev('document.querySelector("#recordAo5").textContent'),/16\.000/);
    await closeRecord();await openRecord('review-6');assert.match(await ev('document.querySelector("#recordAo5").textContent'),/18\.000/);
    await closeRecord();await seedReview(reviewRows().slice(0,5));await openReview();
    assert.equal(await ev('document.querySelectorAll("#reviewChart .review-ao5-dot").length'),1,'Exactly five solves display their single Ao5 point');
    return {chart};
  });

  await check('historical-penalty-edit-updates-pb-mean-chart-and-persists',async()=>{
    await seedReview();await openRecord('review-1');
    assert.match(await ev('document.querySelector("#recordRaw").textContent'),/10\.000/);
    assert.match(await ev('document.querySelector("#recordScramble").textContent'),/R U R' U'/);
    await click('#recordPlus');assert.equal((await state()).records.find(r=>r.uid==='review-1').penalty,'+2');
    assert.match(await ev('document.querySelector("#recordResult").textContent'),/12\.000/);
    assert.match(await ev('document.querySelector("#pb").textContent'),/^12\.000\+?$/);
    assert.match(await ev('document.querySelector("#globalPb").textContent'),/^12\.000\+?$/);
    await click('#recordDnf');assert.equal((await state()).records.find(r=>r.uid==='review-1').penalty,'dnf');
    assert.match(await ev('document.querySelector("#pb").textContent'),/^14\.000\+?$/);
    await click('#recordOk');assert.equal((await state()).records.find(r=>r.uid==='review-1').penalty,'ok');
    await click('#recordPlus');await closeRecord();await cdp('Page.reload');await wait(80);await ready();
    assert.equal((await state()).records.find(r=>r.uid==='review-1').penalty,'+2');
    const final=await state();assert.equal(final.records.at(-1).penalty,'ok');return {final};
  });

  await check('dialog-shortcuts-focus-escape-and-history-entry',async()=>{
    await seedReview();await openRecord('review-1');const before=await state();
    await ev('document.querySelector("#recordOk").focus()');await tap('1');await tap('2');await tap('n');await hold();
    const after=await state();assert.deepEqual(after.records,before.records);assert.equal(after.scramble,before.scramble);assert.notEqual(after.status,'计时中');
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    assert.equal(await ev('document.querySelector("#recordDialog").contains(document.activeElement)'),true);
    await tap('Escape');await until('!document.querySelector("#recordDialog").open');
    assert.equal(await ev('document.activeElement.id'),'reviewInspect');
    if(await ev('document.querySelector("#historyBody").hidden'))await click('#historyToggle');
    await click('#historyList [data-record-uid="review-4"]');assert.equal(await ev('document.querySelector("#recordDialog").open'),true);
    assert.match(await ev('document.querySelector("#recordResult").textContent'),/16\.000/);
    await closeRecord();return {before,after};
  });

  await check('range-50-100-and-group-isolation',async()=>{
    const rows=Array.from({length:120},(_,i)=>({...record(i+1,10000+i*100),uid:'range-'+(i+1),groupId:'default',at:new Date(Date.UTC(2026,10,13,0,0,i)).toISOString()}));
    rows.push({...record(121,5000),uid:'other-1',groupId:'other'});
    await seedReview(rows,[{id:'other',origin:'review-other',name:'另一组'}]);await openReview();
    assert.equal(await ev('document.querySelector("#reviewRecord").options.length'),50);
    assert.equal(await ev('[...document.querySelector("#reviewRecord").options].some(o=>o.value==="range-71")'),true);
    await ev('document.querySelector("#reviewRange").value="100";document.querySelector("#reviewRange").dispatchEvent(new Event("change",{bubbles:true}))');
    assert.equal(await ev('document.querySelector("#reviewRecord").options.length'),100);
    await selectReviewGroup('other');assert.equal(await ev('document.querySelector("#reviewRecord").options.length'),1);
    assert.equal(await ev('document.querySelector("#reviewRecord").value'),'other-1');
    await openRecord('other-1');assert.match(await ev('document.querySelector("#recordGroup").textContent'),/另一组/);await closeRecord();
    assert.equal((await state()).count,1);return {total:rows.length};
  });

  await check('preparation-inspection-and-running-block-details',async()=>{
    await seedReview();await openReview();await reviewToTimer();await ev('document.querySelector("#pad").focus()');
    await key('keyDown');await wait(100);await ev('document.querySelector("#reviewInspect").click()');assert.equal(await ev('document.querySelector("#recordDialog").open'),false);
    await wait(320);await key('keyUp');assert.equal((await state()).status,'计时中');
    await ev('document.querySelector("#reviewInspect").click()');assert.equal(await ev('document.querySelector("#recordDialog").open'),false);
    await tap();await ready();
    await seedReview(reviewRows(),[],true);await openReview();await reviewToTimer();await ev('document.querySelector("#pad").focus()');await tap();assert.equal((await state()).status,'观察中');
    await ev('document.querySelector("#reviewInspect").click()');assert.equal(await ev('document.querySelector("#recordDialog").open'),false);
    await tap('Escape');return {locksVerified:true};
  });

  await check('cross-page-edit-and-delete-do-not-write-stale-detail',async()=>{
    await seedReview();await openRecord('review-1');const a=active;let bTarget,b;
    try{
      bTarget=(await cdp('Target.createTarget',{url},null)).targetId;b=(await cdp('Target.attachToTarget',{targetId:bTarget,flatten:true},null)).sessionId;
      await cdp('Page.enable',{},b);await cdp('Runtime.enable',{},b);await ready(b);
      await ev(`(()=>{const s=window.StarCubeStore.create({storage:localStorage}),r=s.load().records.find(r=>r.uid==='review-1');s.put({...r,penalty:'+2'})})()`,b);
      await until('document.querySelector("#recordResult").textContent.includes("12.000")',a);
      await ev('window.StarCubeStore.create({storage:localStorage}).remove("review-1")',b);
      await until('!document.querySelector("#recordDialog").open',a);
      await ev('document.querySelector("#recordOk").click()',a);
      assert.equal((await state(a)).records.some(r=>r.uid==='review-1'),false);
      return {remaining:(await state(a)).records.length};
    }finally{if(bTarget)await cdp('Target.closeTarget',{targetId:bTarget},null);await cdp('Page.bringToFront',{},a);}
  });

  await check('space-stops-pointer-start-with-control-focused',async()=>{
    await viewport(1280,800);await seedReview();await openReview();await reviewToTimer();
    // Production controls now disable during preparation and Chrome blurs them.
    // This isolated native button models any retained control focus without
    // weakening the regression that Space must stop before input-target guards.
    await ev(`(()=>{const button=document.createElement('button');button.id='retainedFocusFixture';button.textContent='焦点回归夹具';document.querySelector('.workspace-tools').appendChild(button);button.focus()})()`);
    assert.equal(await ev('document.activeElement.id'),'retainedFocusFixture');
    const p=await point('#pad');
    await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
    await wait(420);await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});
    assert.equal((await state()).status,'计时中');const focused=await ev('document.activeElement.id');
    assert.equal(focused,'retainedFocusFixture');await wait(150);await tap();await ready();
    assert.equal((await state()).count,7);await ev('document.querySelector("#retainedFocusFixture").remove()');return {focused,count:(await state()).count};
  });

  await check('readonly-detail-edit-keeps-memory-and-exports',async()=>{
    await seedReview();const injection=await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`Storage.prototype.setItem=function(){throw new DOMException('Review fixture','QuotaExceededError')}`});
    try{
      await cdp('Page.reload');await wait(80);await ready();await openRecord('review-1');await click('#recordDnf');
      assert.equal(await ev('document.querySelector("#recordResult").textContent'),'DNF');
      assert.equal((await state()).records.find(r=>r.uid==='review-1').penalty,'ok','Persistent original is preserved');
      await closeRecord();const payload=await exportReview();assert.equal(payload.records.find(r=>r.uid==='review-1').penalty,'dnf');
      return {exportedPenalty:'dnf',persistentPenalty:'ok'};
    }finally{await cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});await cdp('Page.reload');await wait(80);await ready();}
  });

  await check('desktop-mobile-layout-chart-and-dialog',async()=>{
    await seedReview();await openReview();const layouts=[];
    for(const [width,height]of [[1280,800],[390,844],[320,568],[844,390]]){
      await viewport(width,height);await point('#reviewChart');
      const layout=await ev(`(()=>{const m=document.querySelector('main'),c=document.querySelector('#reviewChart').getBoundingClientRect();return {width:innerWidth,doc:document.documentElement.scrollWidth,main:m.clientWidth,scroll:m.scrollWidth,chart:{width:c.width,height:c.height},controls:[...document.querySelectorAll('#reviewRange,#reviewRecord,#reviewInspect')].filter(e=>e.getBoundingClientRect().height>0).map(e=>({id:e.id,height:e.getBoundingClientRect().height}))}})()`);
      assert.ok(layout.doc<=width&&layout.scroll<=layout.main);assert.ok(layout.chart.width>0&&layout.chart.height>0);assert.ok(layout.controls.every(c=>c.height>=44));
      if(width===1280||width===390||width===320)await shot(width===1280?'desktop-review':width===390?'mobile-review':'mobile-320-review');
      await openRecord('review-3');
      const dialog=await ev(`(()=>{const d=document.querySelector('#recordDialog'),r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,client:d.clientWidth,scroll:d.scrollWidth}})()`);
      assert.ok(dialog.left>=0&&dialog.right<=width&&dialog.top>=0&&dialog.bottom<=height);assert.ok(dialog.scroll<=dialog.client);
      if(width===390||width===320)await shot(width===390?'mobile-record-detail':'mobile-320-record-detail');await closeRecord();layouts.push({layout,dialog});
    }
    await viewport(1280,800);await point('#reviewChart');await shot('desktop-review');return {layouts};
  });

  await check('no-network-or-uncaught-errors',async()=>{assert.deepEqual(networkRequests.filter(u=>/^https?:/.test(u)),[]);assert.deepEqual(runtimeErrors,[]);return {networkRequests,runtimeErrors};});
  const summary={passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,total:results.length};
  fs.writeFileSync(path.join(outDir,'browser-regression-results.json'),JSON.stringify({metadata,summary,results,runtimeErrors,networkRequests},null,2));
  console.log(JSON.stringify(summary));ws.close();if(summary.failed)process.exitCode=1;
})().catch(error=>{console.error(error);fs.writeFileSync(path.join(outDir,'browser-regression-results.json'),JSON.stringify({results,runtimeErrors,fatal:error.stack},null,2));ws.close();process.exitCode=1;});
