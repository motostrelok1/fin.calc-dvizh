const { chromium } = require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const [n,perStudent,groups] of [[5,2400,1],[15,800,1],[16,1500,2],[30,800,2]]){
   const page=await browser.newPage({viewport:{width:1440,height:900}});
   await page.goto('http://127.0.0.1:8765/',{waitUntil:'load'});
   await page.evaluate(n=>{
    const s=JSON.parse(localStorage.getItem('autoshkola_finmodel_v1')||'{}');
    s.theoryClassWageVersion=1;
    s.activeTariff=1;
    s.tariffs=[0,1,2].map(i=>({name:['Завлекающий','Базовый','Повышающий'][i],students:i===1?n:0,marginPercent:30,price:38000,hours:56,duration:3,lessonPrice:1000,sim:false,theoryOnlineEnabled:false,theoryClassEnabled:true,theoryIndividualEnabled:false,theoryOnline:0,theoryClass:12000,theoryIndividual:0,theoryOnlineStudents:0,theoryClassStudents:i===1?n:0,theoryIndividualStudents:0}));
    s.students=n;
    localStorage.setItem('autoshkola_finmodel_v1',JSON.stringify(s));
   },n);
   await page.reload({waitUntil:'load'});
   const got=await page.evaluate(()=>({
    perStudent:document.querySelector('#tariffTheoryTotal')?.textContent,
    teacherSalary:document.querySelector('#teacherSalarySummary')?.textContent,
    classSalary:document.querySelector('#teacherSalaryRow strong')?.textContent
   }));
   const nums=Object.fromEntries(Object.entries(got).map(([k,v])=>[k,Number((v||'').replace(/[^\\d]/g,''))]));
   if(nums.perStudent!==perStudent||nums.teacherSalary!==groups*12000||nums.classSalary!==groups*12000)
    throw Error(JSON.stringify({n,expected:{perStudent,teacherSalary:groups*12000},got,nums}));
   console.log('PASS classroom',n,'students',perStudent,'rub/student',groups,'groups');
   await page.close();
  }
  const legacy=await browser.newPage({viewport:{width:1440,height:900}});
  await legacy.goto('http://127.0.0.1:8765/',{waitUntil:'load'});
  await legacy.evaluate(()=>{
   const s=JSON.parse(localStorage.getItem('autoshkola_finmodel_v1')||'{}');
   delete s.theoryClassWageVersion;
   s.activeTariff=1;s.students=15;
   s.tariffs=[0,1,2].map(i=>({...s.tariffs[i],students:i===1?15:0,theoryClass:6000,theoryClassEnabled:true,theoryOnlineEnabled:false,theoryIndividualEnabled:false,theoryClassStudents:i===1?15:0,theoryOnlineStudents:0,theoryIndividualStudents:0}));
   localStorage.setItem('autoshkola_finmodel_v1',JSON.stringify(s));
  });
  await legacy.reload({waitUntil:'load'});
  const migrated=await legacy.locator('#tariffTheoryTotal').textContent();
  if(Number(migrated.replace(/[^\\d]/g,''))!==800)throw Error('Legacy migration: '+migrated);
  console.log('PASS legacy settings migration');
  await legacy.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
