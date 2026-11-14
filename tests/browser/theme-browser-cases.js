'use strict';
// Color/style checks read computed browser rendering; native input exercises states.
const networkRequests=[];
ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Network.requestWillBeSent')networkRequests.push(m.params.request.url);});
const themeRows=()=>Array.from({length:28},(_,i)=>({...record(i+1,Math.round(18500-i*90+Math.sin(i*1.4)*1800),i===9||i===19?'dnf':i===15?'+2':'ok'),uid:'theme-'+(i+1),groupId:'default',at:new Date(Date.UTC(2026,9,2,10,0,i)).toISOString()}));
async function seedTheme(inspection=false){await ev(`(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('starcube.'))localStorage.removeItem(key);sessionStorage.removeItem('starcube.currentGroup.v1');localStorage.setItem('starcube.settings.v1',JSON.stringify({inspection:${inspection}}));const s=window.StarCubeStore.create({storage:localStorage});${JSON.stringify(themeRows())}.forEach(r=>s.put(r))})()`);await cdp('Page.reload');await wait(80);await ready();}
async function themeView(view){if(await ev(`document.querySelector('#${view}View').hidden`))await click(view==='timer'?'#navTimer':'#navReview');}
async function themeTop(){await ev('scrollTo(0,0);document.querySelector("main").scrollTop=0');}
async function styleOf(selector){return ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(e);return{color:s.color,background:s.backgroundColor,border:s.borderColor,shadow:s.boxShadow,outlineColor:s.outlineColor,outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,outlineOffset:s.outlineOffset,fontWeight:s.fontWeight,opacity:s.opacity}})()`);}
const contrastExpression=`(()=>{
  function rgba(value){const values=(value.match(/[\\d.]+/g)||[]).map(Number);return[values[0]||0,values[1]||0,values[2]||0,values.length>3?values[3]:1]}
  function blend(top,bottom){return[0,1,2].map(i=>top[i]*top[3]+bottom[i]*(1-top[3])).concat(1)}
  function luminance(c){return c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)}
  function ratio(a,b){const l1=luminance(a),l2=luminance(b);return(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)}
  function background(e){const parents=[];let node=e;while(node){parents.unshift(node);node=node.parentElement}let bg=[255,255,255,1],unsupported=[];for(const p of parents){const s=getComputedStyle(p);bg=blend(rgba(s.backgroundColor),bg);if(s.backgroundImage!=='none')unsupported.push('background-image:'+p.tagName+(p.id?'#'+p.id:''));if(Number(s.opacity)!==1)unsupported.push('opacity:'+p.tagName+(p.id?'#'+p.id:''))}return{bg,unsupported}}
  const root=document.querySelector('dialog[open]')||document.body,walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),elements=new Set();let n;
  while(n=walker.nextNode()){if(n.textContent.trim()&&n.parentElement&&!/^(SCRIPT|STYLE|OPTION|TITLE|DESC)$/.test(n.parentElement.tagName))elements.add(n.parentElement)}
  root.querySelectorAll('select').forEach(e=>elements.add(e));
  const checks=[],skipped=[];
  for(const e of elements){const s=getComputedStyle(e),r=e.getBoundingClientRect();if(!r.width||!r.height||s.visibility==='hidden'||e.closest('button:disabled,select:disabled,input:disabled'))continue;const text=e.tagName==='SELECT'?(e.selectedOptions[0]?.textContent||''):[...e.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim();if(!text)continue;
    if(e.closest('[aria-hidden="true"]')&&!text.replaceAll('/','').replaceAll('·','').replaceAll('|','').replaceAll('—','').trim())continue;
    const surface=background(e),fg=rgba(e.namespaceURI==='http://www.w3.org/2000/svg'?s.fill:s.color),size=parseFloat(s.fontSize),weight=Number(s.fontWeight),large=size>=24||(size>=18.666&&weight>=700),item={id:e.id||e.className.baseVal||e.className||e.tagName,text:text.slice(0,60),fontSize:size,fontWeight:weight,foreground:fg,background:surface.bg.slice(0,3),minimum:large?3:4.5,ratio:ratio(blend(fg,surface.bg),surface.bg)};
    if(surface.unsupported.length)skipped.push({...item,reasons:surface.unsupported});else checks.push(item)
  }
  for(const e of root.querySelectorAll(':focus-visible,.review-single,.review-ao5,.review-dnf')){const s=getComputedStyle(e),r=e.getBoundingClientRect(),focus=e.matches(':focus-visible');if(!r.width||!r.height||s.visibility==='hidden')continue;if(focus&&(s.outlineStyle==='none'||!parseFloat(s.outlineWidth)))continue;const value=focus?s.outlineColor:s.stroke;if(value==='none')continue;const surface=background(focus?e.parentElement:e),fg=rgba(value),item={id:e.id||e.className.baseVal||e.className,kind:focus?'focus-indicator':'chart-stroke',foreground:fg.slice(0,3),background:surface.bg.slice(0,3),minimum:3,ratio:ratio(blend(fg,surface.bg),surface.bg)};if(surface.unsupported.length)skipped.push({...item,reasons:surface.unsupported});else checks.push(item)}
  return{checks,skipped,failures:checks.filter(x=>x.ratio<x.minimum)}
})()`;
const contrastEvidence=[];
async function checkContrast(label){const result=await ev(contrastExpression);contrastEvidence.push({label,...result});fs.writeFileSync(path.join(outDir,'computed-contrast-results.json'),JSON.stringify(contrastEvidence,null,2));assert.deepEqual(result.failures,[],label+' text contrast failures');return result;}

(async()=>{
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const targets=(await cdp('Target.getTargets',{},null)).targetInfos;
  targetId=targets.find(t=>t.type==='page'&&t.url===url)?.targetId||(await cdp('Target.createTarget',{url},null)).targetId;
  active=(await cdp('Target.attachToTarget',{targetId,flatten:true},null)).sessionId;
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');await cdp('Page.bringToFront');await cdp('Page.reload');await wait(80);await ready();
  const metadata={url,htmlSha256:crypto.createHash('sha256').update(fs.readFileSync(htmlPath)).digest('hex'),startedAt:new Date().toISOString(),isolated:true};
  await check('rendered-theme-text-contrast-desktop-and-mobile',async()=>{
    await seedTheme();const evidence=[];
    for(const [width,height,label]of [[1280,800,'desktop'],[390,844,'phone'],[320,568,'small']]){
      await viewport(width,height);await themeView('timer');await themeTop();await shot(label+'-theme-timer');const timer=await checkContrast(label+'-timer');
      await themeView('review');await themeTop();await shot(label+'-theme-review');const review=await checkContrast(label+'-review');
      await click('#reviewInspect');await shot(label+'-theme-detail');const detail=await checkContrast(label+'-detail');await click('#recordClose');evidence.push({width,height,timerChecks:timer.checks.length,reviewChecks:review.checks.length,detailChecks:detail.checks.length,unsupported:timer.skipped.length+review.skipped.length+detail.skipped.length});
    }return{evidence,note:'Computed solid/alpha backgrounds are composited. Gradients and group opacity are reported separately for visual review, not called a contrast pass.'};
  });
  await check('native-hover-keyboard-focus-and-selected-penalty-styles',async()=>{
    await viewport(1280,800);await seedTheme();await themeTop();await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await wait(180);
    const normal=await styleOf('#newScramble'),p=await point('#newScramble');await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});await wait(200);const hovered=await styleOf('#newScramble');assert.notDeepEqual(hovered,normal,'Hover has a visible style change');await checkContrast('hover');await shot('desktop-theme-hover');
    await ev('document.querySelector("#pad").focus({preventScroll:true})');for(const type of ['keyDown','keyUp'])await cdp('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.equal(await ev('document.activeElement.id'),'penaltyPlus');
    const focused=await styleOf('#penaltyPlus');assert.notEqual(focused.outlineStyle,'none');assert.ok(parseFloat(focused.outlineWidth)>=2);const beforeSelected=await styleOf('#penaltyPlus');await tap();assert.equal(await ev('document.querySelector("#penaltyPlus").getAttribute("aria-pressed")'),'true');const selected=await styleOf('#penaltyPlus');assert.notDeepEqual(selected,beforeSelected);await checkContrast('selected-plus2');await shot('desktop-theme-focused-plus2');
    await click('#penaltyDnf');assert.equal(await ev('document.querySelector("#penaltyDnf").getAttribute("aria-pressed")'),'true');await checkContrast('selected-dnf');await shot('desktop-theme-selected-dnf');return{normal,hovered,focused,selected,dnf:await styleOf('#penaltyDnf')};
  });
  await check('active-navigation-and-chart-semantic-colors',async()=>{
    await seedTheme();await viewport(1280,800);const timerActive=await styleOf('#navTimer'),reviewInactive=await styleOf('#navReview');assert.notDeepEqual(timerActive,reviewInactive);
    await themeView('review');const reviewActive=await styleOf('#navReview'),timerInactive=await styleOf('#navTimer');assert.notDeepEqual(reviewActive,timerInactive);assert.equal(await ev('document.querySelector("#navReview").getAttribute("aria-pressed")'),'true');
    const strokes=await ev(`(()=>({single:getComputedStyle(document.querySelector('#reviewChart .review-single')).stroke,ao5:getComputedStyle(document.querySelector('#reviewChart .review-ao5')).stroke,dnf:getComputedStyle(document.querySelector('#reviewChart .review-dnf')).stroke,ao5Dash:getComputedStyle(document.querySelector('#reviewChart .review-ao5')).strokeDasharray,dnfMarks:document.querySelectorAll('#reviewChart [data-dnf]').length}))()`);
    assert.notEqual(strokes.single,strokes.ao5);assert.notEqual(strokes.dnf,strokes.single);assert.notEqual(strokes.ao5Dash,'none');assert.equal(strokes.dnfMarks,2);await checkContrast('selected-review-navigation');await shot('desktop-theme-chart');return{timerActive,reviewInactive,reviewActive,timerInactive,strokes};
  });
  await check('ready-plus2-dnf-feedback-colors-in-actual-render',async()=>{
    await viewport(390,844);await seedTheme(true);await themeTop();await ev('window.__themeClock=100000;performance.now=()=>window.__themeClock;document.querySelector("#pad").focus({preventScroll:true})');
    const evidence=[];
    try{
      await tap();await key('keyDown');await wait(420);assert.equal((await state()).status,'按住');
      for(const [elapsed,penalty,label]of [[14000,'ok','ready'],[15000,'+2','plus2'],[17000,'dnf','dnf']]){
        await ev('window.__themeClock='+String(100000+elapsed));await wait(180);assert.equal(await ev('document.querySelector("#pad").dataset.penalty'),penalty);const colors={timer:await styleOf('#timer'),hint:await styleOf('#subStatus')};const contrast=await checkContrast(label+'-feedback');await shot('phone-theme-'+label);evidence.push({elapsed,penalty,colors,checks:contrast.checks.length});
      }
      assert.notEqual(evidence[0].colors.hint.color,evidence[1].colors.hint.color);assert.notEqual(evidence[1].colors.hint.color,evidence[2].colors.hint.color);await key('keyUp');await tap();await ready();
    }finally{await tap('Escape');await key('keyUp');if((await state()).status==='计时中'){await tap();await ready();}await ev('delete performance.now;delete window.__themeClock');}
    return{evidence};
  });
  await check('tabular-digits-and-320-header-bounds',async()=>{
    await seedTheme();const evidence=[];
    for(const [width,height]of [[1280,800],[390,844],[320,568]]){
      await viewport(width,height);await themeTop();
      const metrics=await ev(`(()=>{const result=[];for(const selector of ['#timer','#coreAo5','.history-result','#recordResult']){const target=document.querySelector(selector);if(!target)continue;const s=getComputedStyle(target),span=document.createElement('span');Object.assign(span.style,{position:'fixed',left:'-10000px',top:'0',whiteSpace:'pre',display:'inline-block'});for(const name of ['fontFamily','fontSize','fontWeight','fontStretch','fontStyle','fontVariantNumeric','fontFeatureSettings','fontVariationSettings','fontKerning','letterSpacing'])span.style[name]=s[name];document.body.appendChild(span);const widths=['111.111','888.888','000.000'].map(text=>{span.textContent=text;return{text,width:span.getBoundingClientRect().width}});result.push({selector,fontFamily:s.fontFamily,fontSize:s.fontSize,fontVariantNumeric:s.fontVariantNumeric,widths});span.remove()}const rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom}};return{digits:result,documentWidth:document.documentElement.scrollWidth,header:rect(document.querySelector('.topbar')),brand:rect(document.querySelector('.brand')),right:rect(document.querySelector('.topbar-right')),status:rect(document.querySelector('#status'))}})()`);
      for(const item of metrics.digits){const sizes=item.widths.map(v=>v.width);assert.ok(Math.max(...sizes)-Math.min(...sizes)<=.1,'Equal-width digits '+width+' '+item.selector)}
      assert.ok(metrics.documentWidth<=width);for(const name of ['header','brand','right','status'])assert.ok(metrics[name].left>=0&&metrics[name].right<=width,'Header bounds '+name+' at '+width);if(metrics.brand.top<metrics.right.bottom&&metrics.right.top<metrics.brand.bottom)assert.ok(metrics.brand.right<=metrics.right.left+1,'Brand/status do not overlap at '+width);evidence.push({width,height,...metrics});
    }return{evidence,note:'Measures offscreen spans using the real computed font and numeric features; timer content is not changed.'};
  });
  await check('no-network-or-uncaught-errors',async()=>{assert.deepEqual(networkRequests.filter(u=>/^https?:/.test(u)),[]);assert.deepEqual(runtimeErrors,[]);return{networkRequests,runtimeErrors};});
  const summary={passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,total:results.length};
  fs.writeFileSync(path.join(outDir,'browser-regression-results.json'),JSON.stringify({metadata,summary,results,runtimeErrors,networkRequests},null,2));console.log(JSON.stringify(summary));ws.close();if(summary.failed)process.exitCode=1;
})().catch(error=>{console.error(error);fs.writeFileSync(path.join(outDir,'browser-regression-results.json'),JSON.stringify({results,runtimeErrors,fatal:error.stack},null,2));ws.close();process.exitCode=1;});
