const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({headless:true});
  let failures=0;
  try {
    for(const width of [1366,1920,2560]){
      const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
      await page.goto('http://127.0.0.1:8765/',{waitUntil:'load'});
      for(const count of [1,2,3,4]){
        await page.evaluate(n=>{
          const state=JSON.parse(localStorage.getItem('autoshkola_finmodel_v1')||'{}');
          state.dockedPanels=['cars','program','expenses','instructors'];
          state.openDockPanels=['cars','program','expenses','instructors'].slice(0,n);
          state.activeDockPanel=state.openDockPanels.at(-1);
          localStorage.setItem('autoshkola_finmodel_v1',JSON.stringify(state));
        },count);
        await page.reload({waitUntil:'load'});
        await page.waitForTimeout(150);
        const measured=await page.evaluate(()=>{
          const panels=[...document.querySelectorAll('#dockContent > .docked-panel')].filter(x=>!x.hidden);
          const rs=panels.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}});
          return {viewport:window.innerWidth,docWidth:document.documentElement.scrollWidth,panels:rs};
        });
        const quarter=measured.viewport/4;
        const valid=measured.panels.length===count&&
          measured.panels.every(p=>p.width>50&&p.width<=quarter+2&&p.left>=-2&&p.right<=measured.viewport+2)&&
          measured.panels.every((p,i)=>i===0||p.left>=measured.panels[i-1].right-1);
        console.log(JSON.stringify({width,count,valid,...measured}));
        await page.screenshot({path:'screenshots/dock-'+width+'-'+count+'.png',fullPage:false});
        if(!valid)failures++;
      }
      await page.close();
    }
  }finally{await browser.close();}
  if(failures)throw Error(failures+' dock scenarios failed');
})().catch(e=>{console.error(e);process.exit(1)});
