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
          return {viewport:window.innerWidth,docWidth:document.documentElement.scrollWidth,fit:document.getElementById('dockContent').dataset.viewportFit,panels:rs};
        });
        const quarter=measured.viewport/4;
        const valid=measured.fit==='applied'&&measured.panels.length===count&&
          measured.panels.every(p=>p.width>50&&p.width<=quarter+2&&p.left>=-2&&p.right<=measured.viewport+2)&&
          measured.panels.every((p,i)=>i===0||p.left>=measured.panels[i-1].right-1);
        console.log(JSON.stringify({width,count,valid,...measured}));
        await page.screenshot({path:'screenshots/dock-'+width+'-'+count+'.png',fullPage:false});
        if(!valid)failures++;
      }
      await page.close();
    }
    // Classroom teacher pay is the slider value per group (max 15 students).
    const theoryPage=await browser.newPage({viewport:{width:1366,height:900}});
    await theoryPage.goto('http://127.0.0.1:8765/',{waitUntil:'load'});
    // Persist initialized application defaults before changing the saved tariff objects.
    await theoryPage.locator('#save').click();
    for(const [students,perStudent,expense] of [[5,1200,6000],[15,400,6000],[16,750,12000],[30,400,12000]]){
      await theoryPage.evaluate(n=>{
        const state=JSON.parse(localStorage.getItem('autoshkola_finmodel_v1')||'{}');
        const tariffs=state.tariffs||[];
        for(let i=0;i<tariffs.length;i++){
          const t=tariffs[i];
          t.students=i===1?n:0;
          t.theoryOnlineEnabled=false;t.theoryClassEnabled=i===1;t.theoryIndividualEnabled=false;
          t.theoryOnlineStudents=0;t.theoryClassStudents=i===1?n:0;t.theoryIndividualStudents=0;
          t.theoryClass=6000;
        }
        state.activeTariff=1;state.students=n;
        localStorage.setItem('autoshkola_finmodel_v1',JSON.stringify(state));
      },students);
      await theoryPage.reload({waitUntil:'load'});
      const result=await theoryPage.evaluate(()=>({
        theory:document.querySelector('#tariffTheoryTotal').textContent,
        expense:document.querySelector('#teacherSalarySummary').textContent,
        group:document.querySelector('#teacherSalaryRow strong').textContent
      }));
      const numeric=v=>Number(v.replace(/[^0-9]/g,''));
      const valid=numeric(result.theory)===perStudent&&numeric(result.expense)===expense&&numeric(result.group)===expense;
      console.log(JSON.stringify({classroomStudents:students,valid,...result}));
      if(!valid)failures++;
    }
    await theoryPage.close();
  }finally{await browser.close();}
  if(failures)throw Error(failures+' dock scenarios failed');
})().catch(e=>{console.error(e);process.exit(1)});
