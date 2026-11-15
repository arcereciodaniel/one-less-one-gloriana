"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const {JSDOM,VirtualConsole}=require("jsdom");
const html=fs.readFileSync("index.html","utf8"),script=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
assert(script);
function boot(seed){
 const errors=[],vc=new VirtualConsole();vc.on("jsdomError",e=>errors.push(String(e.stack||e)));
 const dom=new JSDOM(html,{url:"https://example.com/",runScripts:"outside-only",pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event("close"))};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(o,key)=>key==="measureText"?()=>({width:80}):()=>{}})};
 w.alert=message=>errors.push("ALERT "+message);w.confirm=()=>true;w.prompt=()=>null;
 const key=script.match(/const STORAGE_KEY = "([^"]+)"/)?.[1];assert(key);
 w.localStorage.setItem(key,JSON.stringify(seed));
 try{w.eval(script)}catch(e){errors.push(String(e.stack||e))}
 return {w,errors,dom,read:()=>JSON.parse(w.localStorage.getItem(key))};
}
const seed={
 version:6.2,categorySchemaVersion:1,incomeSchemaVersion:1,
 settings:{fx:500,fxBuy:500,fxSell:500,displayCurrency:"CRC"},
 periods:[
  {key:"2026-11-Q1",budgetMonth:"2026-11",fortnight:1,date:"2026-10-28",quarter:"2026-T4",n:1,
   opening:50000,income:0,otherIncome:0,categoryBudgets:{"cat-save":10000},categoryBudgetCurrencies:{"cat-save":"CRC"},budgets:{}},
  {key:"2026-11-Q2",budgetMonth:"2026-11",fortnight:2,date:"2026-11-14",quarter:"2026-T4",n:2,
   opening:null,income:0,otherIncome:0,categoryBudgets:{"cat-save":10000},categoryBudgetCurrencies:{"cat-save":"CRC"},budgets:{}},
  {key:"2026-12-Q1",budgetMonth:"2026-12",fortnight:1,date:"2026-11-28",quarter:"2026-T4",n:3,
   opening:null,income:0,otherIncome:0,categoryBudgets:{"cat-save":10000},categoryBudgetCurrencies:{"cat-save":"CRC"},budgets:{}}
 ],
 categories:[{id:"cat-save",name:"Ahorro e inversión",type:"Gasto",group:"Ahorro",active:true,budgetable:true,sort:10}],
 movements:[],debts:[],reconciliations:[],
 reserves:[{id:"goal1",name:"Viaje",type:"goal",status:"active",openingDate:"2026-10-01",openingAmount:0,openingCurrency:"CRC",target:100000,targetCurrency:"CRC",budgetCategoryId:"cat-save"}],
 reserveMovements:[],sharedCharges:[],sharedChargeGroups:[],receivableRecurring:[]
};
const test=boot(seed),{w,errors,read}=test,d=w.document;
assert.deepEqual(errors,[],"Sin errores de arranque");
d.querySelector("#nav [data-view=movements]").click();
d.getElementById("toggleMovementComposer").click();
d.querySelector("[data-one-action=goal]").click();
assert.equal(d.getElementById("oneCentralGoalCategory").value,"cat-save");
d.getElementById("oneCentralGoalDate").value="2026-11-15";
d.getElementById("oneCentralGoalAmount").value="5000";
d.getElementById("oneCentralGoalForm").dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));
const saved=read();
assert.equal(saved.reserveMovements.length,1);
assert.equal(saved.reserveMovements[0].budgetCategoryId,"cat-save");
assert.equal(saved.movements.length,0,"No crear gasto duplicado");
d.querySelector("#nav [data-view=plan]").click();
const budgetHtml=d.getElementById("planMonths").textContent;
assert(/Ahorro e inversión/.test(budgetHtml));
assert(/Ahorrado:/.test(budgetHtml),"El presupuesto debe reflejar el aporte");
assert(!errors.length,"Sin fallos al renderizar presupuesto");
const first=Number(d.getElementById("onePaydayFirst").value),second=Number(d.getElementById("onePaydaySecond").value);
assert(first>=1&&second>first);
d.getElementById("onePaydayFirst").value=15;
d.getElementById("onePaydaySecond").value=30;
d.getElementById("onePaydayForm").dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));
const after=read(),q1=after.periods.find(p=>p.key==="2026-11-Q1"),q2=after.periods.find(p=>p.key==="2026-11-Q2"),dec=after.periods.find(p=>p.key==="2026-12-Q1");
assert.equal(q1.date,"2026-10-30");assert.equal(q2.date,"2026-11-15");assert.equal(dec.date,"2026-11-30");
assert.equal(after.movements.length,0);
assert.equal(after.reserveMovements.length,1);
assert.equal(after.periods[0].categoryBudgets["cat-save"],10000,"Preservar el presupuesto");
assert(d.getElementById("planMonths").textContent.includes("15"),"El calendario debe reflejar fechas de pago");
assert.deepEqual(errors,[]);
test.dom.window.close();
console.log("OK: categoría Ahorro e inversión refleja aporte; no gasto duplicado; quincenas 15/30 y presupuestos preservados.");
