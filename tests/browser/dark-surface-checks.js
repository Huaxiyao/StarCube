const surfaceEvidence=[];
async function checkDarkSurface(label){
  const surfaces=await ev(`(()=>{
    function rgba(v){const a=(v.match(/[\\d.]+/g)||[]).map(Number);return[a[0]||0,a[1]||0,a[2]||0,a.length>3?a[3]:1]}
    function luminance(c){return c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)}
    return ['.timer-console','#pad','.timer-controls','#actions','#penaltyPlus','#penaltyDnf','#deleteLatest'].map(selector=>{const e=document.querySelector(selector),parents=[];for(let p=e;p;p=p.parentElement)parents.unshift(p);let bg=[255,255,255];for(const p of parents){const c=rgba(getComputedStyle(p).backgroundColor);bg=bg.map((v,i)=>c[i]*c[3]+v*(1-c[3]))}const s=getComputedStyle(e);return{selector,background:bg,luminance:luminance(bg),color:s.color,outline:s.outlineColor,visible:!!e.getBoundingClientRect().width&&s.visibility!=='hidden'}})
  })()`);
  surfaceEvidence.push({label,surfaces});
  fs.writeFileSync(path.join(outDir,'surface-tone-results.json'),JSON.stringify(surfaceEvidence,null,2));
  // Studio Light 亮色表面需维持高亮度洁净底色；文字与交互对比度由 checkContrast 严格校验。
  for(const surface of surfaces)assert.ok(surface.luminance>.75,label+' light surface '+surface.selector);
  return surfaces;
}
