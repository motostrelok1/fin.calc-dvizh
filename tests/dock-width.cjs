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
    // Simulator charge is per enrolled student and included once in tariff base and total expenses.
    for(const [enabled,fee] of [[false,500],[true,500],[true,2000]]){
      await theoryPage.evaluate(({enabled,fee})=>{
        const state=JSON.parse(localStorage.getItem('autoshkola_finmodel_v1'));
        const t=state.tariffs[1];
        t.students=15;t.sim=enabled;t.simPrice=fee;
        state.sim=enabled;state.activeTariff=1;
        state.tariffs[0].students=0;state.tariffs[2].students=0;
        localStorage.setItem('autoshkola_finmodel_v1',JSON.stringify(state));
      },{enabled,fee});
      await theoryPage.reload({waitUntil:'load'});
      const result=await theoryPage.evaluate(()=>({
        slider:document.querySelector('#simPrice').value,
        disabled:document.querySelector('#simPrice').disabled,
        practice:document.querySelector('#costStudent').textContent,
        theory:document.querySelector('#tariffTheoryTotal').textContent,
        base:document.querySelector('#tariffBaseCost').textContent,
        total:document.querySelector('#simulatorTotal').textContent
      }));
      const num=x=>Number(x.replace(/[^0-9]/g,''));
      const expectedUnit=enabled?fee:0;
      const valid=Number(result.slider)===fee&&result.disabled===!enabled&&
        num(result.base)===num(result.practice)+num(result.theory)+expectedUnit&&
        num(result.total)===15*expectedUnit;
      console.log(JSON.stringify({simulatorEnabled:enabled,fee,valid,...result}));
      if(!valid)failures++;
    }
    // Lesson demand: total teaching hours / selected duration * students (sum of tariffs).
    for(const [hours,duration,students,expected] of [[30,2,15,225],[30,3,15,150],[31,2,15,232.5]]){
      await theoryPage.evaluate(({hours,duration,students})=>{
        const state=JSON.parse(localStorage.getItem('autoshkola_finmodel_v1'));
        state.activeTariff=1;state.instructors=3;state.lessonLimit=120;
        state.tariffs.forEach((t,i)=>{t.students=i===1?students:0;t.hours=hours;t.duration=duration;t.sim=false;});
        localStorage.setItem('autoshkola_finmodel_v1',JSON.stringify(state));
      },{hours,duration,students});
      await theoryPage.reload({waitUntil:'load'});
      const vals=await theoryPage.evaluate(()=>({
        demand:document.querySelector('#totalLessons').textContent,
        capacity:document.querySelector('#instructorCapacity').textContent,
        lessonUnit:document.querySelector('#lessonCount').textContent
      }));
      const number=v=>Number(v.replace(/\\s/g,'').replace(',','.'));
      const valid=Math.abs(number(vals.demand)-expected)<0.001&&number(vals.capacity)===360&&Math.abs(number(vals.lessonUnit)-hours/duration)<.01;
      console.log(JSON.stringify({hours,duration,students,expected,valid,...vals}));
      if(!valid)failures++;
    }
    // The displayed selected tariff count must equal lessons per student × selected students.
    await theoryPage.evaluate(()=>{
      const state=JSON.parse(localStorage.getItem('autoshkola_finmodel_v1'));
      state.activeTariff=1;
      state.tariffs[1].students=15;
      state.tariffs[1].hours=30;
      state.tariffs[1].duration=2;
      state.tariffs[1].sim=true;
      state.tariffs[0].students=9;
      state.tariffs[2].students=7;
      localStorage.setItem('autoshkola_finmodel_v1',JSON.stringify(state));
    });
    await theoryPage.reload({waitUntil:'load'});
    const selected=await theoryPage.evaluate(()=>({
      count:document.querySelector('#lessonCount').textContent,
      students:document.querySelector('#tariffCountVal').textContent,
      needed:document.querySelector('#totalLessons').textContent
    }));
    const parse=v=>Number(v.replace(/\\s/g,'').replace(',','.'));
    const selectedValid=parse(selected.count)*parse(selected.students)===parse(selected.needed)&&parse(selected.needed)===210;
    console.log(JSON.stringify({selectedTariffDemand:true,valid:selectedValid,...selected}));
    if(!selectedValid)failures++;
    // Instructor payroll: add an instructor, set rate and lessons, verify total and reload.
    await theoryPage.locator('#instructorPayDetails').evaluate(el=>el.open=true);
    await theoryPage.locator('#instructorPayName').fill('Тестовый инструктор');
    await theoryPage.locator('#instructorPayForm button[type="submit"]').click();
    const rate=theoryPage.locator('.payroll-item .pay-rate').last();
    const lessons=theoryPage.locator('.payroll-item .pay-lessons').last();
    await rate.evaluate(el=>{el.value='750';el.dispatchEvent(new Event('input',{bubbles:true}))});
    await lessons.evaluate(el=>{el.value='80';el.dispatchEvent(new Event('input',{bubbles:true}))});
    await theoryPage.waitForTimeout(300);
    const before=await theoryPage.evaluate(()=>({
      total:document.querySelector('#instructorPayTotal').textContent,
      average:document.querySelector('#instructorPayAverage').textContent,
      result:document.querySelector('#instructorPayrollSummary').textContent,
      row:document.querySelector('.payroll-item .pay-sum').textContent
    }));
    await theoryPage.reload({waitUntil:'load'});
    const after=await theoryPage.evaluate(()=>({
      count:document.querySelectorAll('.payroll-item').length,
      total:document.querySelector('#instructorPayTotal').textContent,
      result:document.querySelector('#instructorPayrollSummary').textContent,
      rate:document.querySelector('.payroll-item .pay-rate').value,
      lessons:document.querySelector('.payroll-item .pay-lessons').value
    }));
    const rub=v=>Number(v.replace(/[^0-9]/g,''));const payValid=rub(before.total)===60000&&rub(before.average)===750&&rub(before.row)===60000&&rub(before.result)===60000&&after.count===1&&rub(after.total)===60000&&rub(after.result)===60000&&after.rate==='750'&&after.lessons==='80';
    console.log(JSON.stringify({instructorPayroll:true,valid:payValid,before,after}));
    if(!payValid)failures++;
    // Driving income is part of tariff revenue; only instructor and simulator payments are costs.
    await theoryPage.evaluate(()=>{
      const data=JSON.parse(localStorage.getItem('autoshkola_finmodel_v1'));
      data.instructorPay=[{id:'one',name:'Первый',rate:1000,lessons:168}];
      data.tariffs.forEach((t,i)=>{t.students=i===1?15:0;t.hours=30;t.duration=2;t.sim=true;t.simPrice=1200;t.lessonPrice=1200;});
      data.activeTariff=1;
      localStorage.setItem('autoshkola_finmodel_v1',JSON.stringify(data));
    });
    await theoryPage.reload({waitUntil:'load'});
    const drive=await theoryPage.evaluate(()=>({
      income:document.querySelector('#driving').textContent,
      payroll:document.querySelector('#instructorPayrollSummary').textContent,
      simulator:document.querySelector('#simulatorTotal').textContent,
      profit:document.querySelector('#drivingProfit').textContent,
      total:document.querySelector('#totalCost').textContent,
      teacher:document.querySelector('#teacherSalarySummary').textContent,
      fixed:document.querySelector('#fixedSummary').textContent,
      leasing:document.querySelector('#leasingSummary').textContent,
      tax:document.querySelector('#taxes').textContent,
      marketing:document.querySelector('#ads').textContent
    }));
    const number=v=>Number(v.replace(/[^0-9-]/g,''));
    const expectedProfit=number(drive.income)-number(drive.payroll)-number(drive.simulator);
    const expectedExpenses=['payroll','simulator','teacher','fixed','leasing','tax','marketing'].reduce((n,k)=>n+number(drive[k]),0);
    const profitValid=number(drive.profit)===expectedProfit&&Math.abs(number(drive.total)-expectedExpenses)<=2;
    console.log(JSON.stringify({drivingProfitCheck:true,valid:profitValid,...drive}));
    if(!profitValid)failures++;
    await theoryPage.close();
  }finally{await browser.close();}
  if(failures)throw Error(failures+' dock scenarios failed');
})().catch(e=>{console.error(e);process.exit(1)});
