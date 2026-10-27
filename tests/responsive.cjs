const { chromium } = require('playwright');
const sizes = [{width:1366,height:768},{width:1920,height:1080},{width:2560,height:1440}];
(async()=>{
 const browser=await chromium.launch({headless:true});
 let errors=0;
 try {
  for(const size of sizes){
   const page=await browser.newPage({viewport:size,deviceScaleFactor:1});
   await page.goto('https://motostrelok1.github.io/fin.calc-dvizh/',{waitUntil:'networkidle'});
   await page.screenshot({path:'screenshots/'+size.width+'x'+size.height+'.png',fullPage:true});
   const result=await page.evaluate(()=>{
    const els=['.wrap','.overview','.dashboard-dock','.layout'];
    return {viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,
      boxes:els.map(sel=>{const e=document.querySelector(sel);if(!e||e.hidden)return {selector:sel,hidden:true};const r=e.getBoundingClientRect();return {selector:sel,left:r.left,right:r.right,width:r.width}})};
   });
   const overflow=result.scroll>result.viewport+2||result.boxes.some(b=>!b.hidden&&(b.right>result.viewport+2||b.left< -2));
   console.log(JSON.stringify({resolution:size,...result,overflow}));
   if(overflow)errors++;
   const tabs=page.locator('#dockTabs button');
   if(await tabs.count()){
    await tabs.first().click();
    const dock=await page.locator('.dashboard-dock .docked-panel:not([hidden])').first().boundingBox();
    const container=await page.locator('#dashboardDock').boundingBox();
    if(dock&&container&&(dock.width>container.width+2||dock.x+dock.width>size.width+2)){errors++;console.error('Dock content exceeds viewport at '+size.width)}
   }
   await page.close();
  }
 }finally{await browser.close()}
 if(errors)process.exitCode=1;
})();
