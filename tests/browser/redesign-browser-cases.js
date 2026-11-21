'use strict';
// New spatial relationships; existing suites continue to own timer/data behavior.
const networkRequests=[];
ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Network.requestWillBeSent')networkRequests.push(m.params.request.url);});
const redesignRows=()=>Array.from({length:64},(_,i)=>({...record(i+1,Math.round(21800-i*75+Math.sin(i*.8)*1900),i===17||i===48?'dnf':i===30?'+2':'ok'),uid:'redesign-'+(i+1),groupId:'default',at:new Date(Date.UTC(2026,9,3,10,0,i)).toISOString()}));
async function seedRedesign(){await ev(`(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('starcube.'))localStorage.removeItem(key);sessionStorage.removeItem('starcube.currentGroup.v1');localStorage.setItem('starcube.settings.v1',JSON.stringify({inspection:false}));const s=window.StarCubeStore.create({storage:localStorage});${JSON.stringify(redesignRows())}.forEach(r=>s.put(r))})()`);await cdp('Page.reload');await wait(80);await ready();}
async function redesignView(view){if(await ev(`document.querySelector('#${view}View').hidden`))await click(view==='timer'?'#navTimer':'#navReview');}
async function redesignTop(){await ev('scrollTo(0,0);document.querySelector("main").scrollTop=0');}
async function rects(selectors){return ev(`(()=>{const result={};for(const [key,selector]of Object.entries(${JSON.stringify(selectors)})){const e=document.querySelector(selector);if(!e)throw new Error('Missing '+selector);const r=e.getBoundingClientRect();result[key]={left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}}return result})()`);}
(async()=>{
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const targets=(await cdp('Target.getTargets',{},null)).targetInfos;targetId=targets.find(t=>t.type==='page'&&t.url===url)?.targetId||(await cdp('Target.createTarget',{url},null)).targetId;active=(await cdp('Target.attachToTarget',{targetId,flatten:true},null)).sessionId;
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');await cdp('Page.bringToFront');await cdp('Page.reload');await wait(80);await ready();
  const metadata={url,htmlSha256:crypto.createHash('sha256').update(fs.readFileSync(htmlPath)).digest('hex'),startedAt:new Date().toISOString(),isolated:true};
  await check('desktop-rail-console-bottom-stat-strip-and-recent-sidebar',async()=>{
    await seedRedesign();const evidence=[];
    for(const [width,height]of [[1440,900],[1280,800]]){
      await viewport(width,height);await redesignView('timer');await redesignTop();const r=await rects({rail:'.topbar',pad:'#pad',core:'.core-stats',ao5:'#coreAo5',ao12:'#coreAo12',pb:'#corePb',count:'#coreCount',recent:'#recentList'});await shot('desktop-'+width+'-redesign-timer');
      fs.writeFileSync(path.join(outDir,'desktop-timer-geometry.json'),JSON.stringify([...evidence,{width,height,r}],null,2));
      assert.ok(r.rail.width>r.rail.height*3,'Desktop navigation is a horizontal top bar');assert.ok(r.rail.bottom<=r.pad.top+1,'Top bar stays above the timing instrument');
      assert.ok(r.core.top>=r.pad.bottom-1,'Core statistics are below the timing surface');assert.ok(r.ao5.left<r.ao12.left&&r.ao12.left<r.pb.left&&r.pb.left<r.count.left,'Core statistics form a horizontal strip');assert.ok(Math.max(r.ao5.top,r.ao12.top,r.pb.top,r.count.top)-Math.min(r.ao5.top,r.ao12.top,r.pb.top,r.count.top)<=8);
      assert.ok(r.recent.left>=r.pad.right-1&&r.recent.width<r.pad.width,'Recent solves are a smaller right-hand column');evidence.push({width,height,r});
    }return{evidence};
  });
  await check('review-full-stat-strip-above-chart-and-history-columns',async()=>{
    const evidence=[];
    for(const [width,height]of [[1440,900],[1280,800]]){
      await viewport(width,height);await redesignView('review');await redesignTop();if(await ev('document.querySelector("#historyBody").hidden'))await click('#historyToggle');
      const r=await rects({stats:'.stats',chart:'#reviewChart',history:'.history-wrap',csv:'#exportHistoryCsv'});await shot('desktop-'+width+'-redesign-review');
      fs.writeFileSync(path.join(outDir,'desktop-review-geometry.json'),JSON.stringify([...evidence,{width,height,r}],null,2));
      assert.ok(r.chart.right<=r.history.left+1,'Chart and history are separate columns');assert.ok(r.stats.bottom<=Math.min(r.chart.top,r.history.top)+1,'Full statistics are above both columns');assert.ok(r.stats.width>=r.chart.width+r.history.width-16,'The statistics strip spans the review workspace');assert.ok(r.chart.width>=480,'The trend retains useful desktop width');assert.ok(r.csv.height>=44&&r.csv.right<=r.history.right+1,'CSV export button meets touch target inside history panel');evidence.push({width,height,r});
    }return{evidence};
  });
  await check('mobile-reflows-to-timing-first-and-bottom-navigation',async()=>{
    const evidence=[];
    for(const [width,height,name]of [[390,844,'phone'],[320,568,'small'],[844,390,'landscape']]){
      await viewport(width,height);await redesignView('timer');await redesignTop();const r=await rects({pad:'#pad',scramble:'.scramble',status:'#subStatus',nav:'#navTimer',group:'#groupSelect'});await shot(name+'-redesign-timer');
      assert.ok(await ev('document.documentElement.scrollWidth<=innerWidth'),'No document horizontal overflow');
      if(width<=390){assert.ok(r.nav.top>=height-120&&r.nav.bottom<=height,'Mobile navigation stays in the thumb area');assert.ok(r.nav.height>=44);}
      if(width===390){assert.ok(r.scramble.top>=0&&r.scramble.bottom<height);assert.ok(r.status.top>=0&&r.status.bottom<r.nav.top,'The first screen contains timing feedback above navigation');}
      await redesignView('review');await redesignTop();await shot(name+'-redesign-review');const review=await rects({chart:'#reviewChart',history:'.history-wrap'});if(width<=390)assert.ok(review.history.top>=review.chart.bottom,'Mobile review stacks history after the chart');evidence.push({width,height,r,review});
    }return{evidence};
  });
  await check('native-mouse-and-touch-keep-the-same-solve-state-sequence',async()=>{
    const evidence=[];
    const sample=async phase=>({phase,...await ev(`({padState:document.querySelector('#pad').dataset.state,locked:document.querySelector('#navReview').disabled,actionsHidden:document.querySelector('#actions').hidden,penalty:document.querySelector('#pad').dataset.penalty})`)});
    for(const [kind,width,height]of [['mouse',1280,800],['touch',390,844]]){
      await viewport(width,height);await seedRedesign();await redesignTop();const before=(await state()).count,p=await point('#pad'),phases=[await sample('idle')];
      const down=async()=>kind==='touch'?touch('touchStart',p):cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
      const up=async()=>kind==='touch'?touch('touchEnd',p):cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});
      await down();await wait(80);phases.push(await sample('holding'));await wait(340);phases.push(await sample('ready'));await shot(kind+'-redesign-ready');await up();assert.equal((await state()).status,'计时中');phases.push(await sample('running'));await wait(120);await down();assert.equal((await state()).count,before+1,'Stop commits on pointerdown');await up();await ready();phases.push(await sample('stopped'));assert.equal((await state()).count,before+1);
      assert.deepEqual(phases.map(p=>p.padState),['idle','holding','ready','running','stopped']);assert.deepEqual(phases.map(p=>p.locked),[false,true,true,true,false]);evidence.push({kind,width,height,phases,saved:1});
    }
    assert.deepEqual(evidence[0].phases,evidence[1].phases);return{evidence,note:'Native CDP input simulation; no physical-device claim.'};
  });
  await check('short-wide-screen-reflows-navigation-and-keeps-page-scroll',async()=>{
    await viewport(1280,360);await seedRedesign();await redesignView('timer');await redesignTop();
    const r=await rects({header:'.topbar',timerNav:'#navTimer',reviewNav:'#navReview',inspection:'#inspectionToggle',status:'#status'});
    await shot('short-wide-1280x360-top');
    assert.ok(r.header.width>r.header.height*3,'Short wide view uses horizontal navigation');assert.ok(Math.abs(r.timerNav.top-r.reviewNav.top)<=2&&r.timerNav.left<r.reviewNav.left,'View buttons remain side by side');
    for(const name of ['timerNav','reviewNav','inspection','status'])assert.ok(r[name].left>=0&&r[name].right<=1280&&r[name].top>=0&&r[name].bottom<=360,'Reachable '+name);
    assert.ok(await ev('document.documentElement.scrollWidth<=innerWidth'));const before=await ev('({scrollY,count:document.querySelector("#count").textContent,scrollHeight:document.documentElement.scrollHeight})');assert.ok(before.scrollHeight>360);
    await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:1248,y:180,deltaX:0,deltaY:480});await wait(180);const after=await ev('({scrollY,count:document.querySelector("#count").textContent})');assert.ok(after.scrollY>before.scrollY+20,'The document can scroll normally');assert.equal(after.count,before.count);await shot('short-wide-1280x360-scrolled');return{r,before,after};
  });
  await check('no-network-or-uncaught-errors',async()=>{assert.deepEqual(networkRequests.filter(u=>/^https?:/.test(u)),[]);assert.deepEqual(runtimeErrors,[]);return{networkRequests,runtimeErrors};});
  const summary={passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,total:results.length};fs.writeFileSync(path.join(outDir,'browser-regression-results.json'),JSON.stringify({metadata,summary,results,runtimeErrors,networkRequests},null,2));console.log(JSON.stringify(summary));ws.close();if(summary.failed)process.exitCode=1;
})().catch(error=>{console.error(error);fs.writeFileSync(path.join(outDir,'browser-regression-results.json'),JSON.stringify({results,runtimeErrors,fatal:error.stack},null,2));ws.close();process.exitCode=1;});
