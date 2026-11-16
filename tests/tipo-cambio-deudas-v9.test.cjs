"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {JSDOM,VirtualConsole}=require("jsdom");
const html=fs.readFileSync("index.html","utf8");
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
assert(script,"El archivo debe incluir el script de la aplicación");
function dueDebt(id,name,day,minimum){
  return {id,name,type:name.includes("Préstamo")?"Préstamo":"Tarjeta",status:"active",usd:0,crc:1000000,
    minimum,minimumCurrency:"CRC",payDay:String(day),balanceAdjustments:[]};
}
const debtList=[
  dueDebt("t8517","Tarjeta 8517",1,73500),
  dueDebt("bn","Préstamo BN",4,241000),
  dueDebt("t3095","Tarjeta 3095",6,37500),
  dueDebt("t9955","Tarjeta 9955",18,19000),
  dueDebt("t5587","Tarjeta 5587",30,35000)
];
function payment(seq,date,debtId,amount){
  return {id:"pay-"+seq,seq,date,type:"Pago deuda",debtId,categoryId:"cat-debt",category:"Tarjetas",
    amount,currency:"CRC",period:"2026-11-Q1",fxBuy:0,fxSell:0,fxRef:0};
}
const movements=[
  payment(1,"2026-10-29","t8517",72640),
  payment(2,"2026-10-29","bn",240000),
  payment(3,"2026-10-29","t3095",38500),
  payment(4,"2026-11-15","t9955",19000),
  {id:"legacy",seq:5,date:"2026-10-30",type:"Gasto",categoryId:"cat-debt",category:"Tarjetas",
   amount:1000,currency:"CRC",period:"2026-11-Q1"}
];
const today=new Date().toISOString().slice(0,10);
const seed={
 version:6.2,categorySchemaVersion:1,incomeSchemaVersion:1,
 settings:{fx:450,fxBuy:445,fxSell:455,fxDate:today,fxCheckedOn:today,fxSource:"manual",
   displayCurrency:"CRC",fxHistory:[]},
 periods:[{key:"2026-11-Q1",budgetMonth:"2026-11",fortnight:1,date:"2026-10-28",
  quarter:"2026-T4",n:1,opening:500000,income:0,otherIncome:0,categoryBudgets:{},budgets:{}}],
 movements,reconciliations:[],debts:debtList,
 categories:[
  {id:"cat-debt",name:"Tarjetas",type:"Pago deuda",group:"Deudas",active:true,budgetable:true,sort:10},
  {id:"cat-exp",name:"Otros",type:"Gasto",group:"Gastos",active:true,budgetable:true,sort:20}
 ],
 reserves:[],reserveMovements:[],sharedCharges:[],sharedChargeGroups:[],receivableRecurring:[]
};
const errors=[],vc=new VirtualConsole();
vc.on("jsdomError",e=>errors.push(String(e.stack||e)));
const dom=new JSDOM(html,{url:"https://example.com/",runScripts:"outside-only",
  pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window;
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
w.HTMLDialogElement.prototype.close=function(){this.open=false;};
w.HTMLElement.prototype.scrollIntoView=function(){};
w.HTMLCanvasElement.prototype.getContext=function(){
  return new Proxy({},{get:(obj,key)=>key==="measureText"?()=>({width:80}):()=>{}});
};
w.alert=x=>errors.push("ALERT "+x);w.confirm=()=>true;w.prompt=()=>null;
const key=script.match(/const STORAGE_KEY = "([^"]+)"/)?.[1];assert(key);
w.localStorage.setItem(key,JSON.stringify(seed));
w.eval(script);
const get=id=>JSON.parse(w.localStorage.getItem(key)).debts.find(d=>d.id===id);
function entry(id){return w.oneDebtDueEntry(get(id),"2026-11-16");}
assert.equal(entry("t8517").state,"review","Pago anticipado parcial no se considera sin pagar");
assert.equal(entry("t8517").paid,72640);
assert.equal(entry("t8517").minimum,860);
assert.equal(entry("bn").state,"review");
assert.equal(entry("bn").paid,240000);
assert.equal(entry("bn").minimum,1000);
assert.equal(entry("t3095").date,"2026-12-06","Pago anticipado cubre noviembre");
assert.equal(entry("t3095").coveredThisMonth,true);
assert.equal(entry("t9955").date,"2026-12-18","Pago del 15 de noviembre cubre el 18");
assert.equal(entry("t5587").date,"2026-11-30","No adelantar un pago de ciclo anterior");
assert.equal(entry("t5587").paid,0);
assert.equal(w.oneDebtClassificationWarnings().mismatch,1,"Alertar sin recategorizar movimientos antiguos");
assert.equal(JSON.parse(w.localStorage.getItem(key)).movements.length,movements.length);
assert.equal(w.oneDebtRegisteredForCycle(get("bn"),"2026-11-04","2026-11-16"),240000);
const before=JSON.parse(w.localStorage.getItem(key));
(async()=>{
  let count=0;
  w.fetch=async url=>{
    count++;
    assert.equal(url,"https://api.hacienda.go.cr/indicadores/tc/dolar");
    return {ok:true,json:async()=>({
      compra:{fecha:w.todayIso(),valor:442.56},venta:{fecha:w.todayIso(),valor:448.34}
    })};
  };
  assert.equal(await w.oneFxAutoUpdate(false),true,"No sustituir tipo manual del día");
  assert.equal(count,0);
  assert.equal(await w.oneFxAutoUpdate(true),true,"Consulta forzada debe traer Hacienda");
  assert.equal(count,1);
  const changed=JSON.parse(w.localStorage.getItem(key));
  assert.equal(changed.settings.fxBuy,442.56);
  assert.equal(changed.settings.fxSell,448.34);
  assert.equal(changed.settings.fxSource,"hacienda");
  assert.equal(changed.settings.fxCheckedOn,w.todayIso());
  assert.equal(changed.settings.fxHistory.at(-1).source,"hacienda");
  const essential=rows=>rows.map(m=>({id:m.id,date:m.date,type:m.type,debtId:m.debtId||"",amount:m.amount,currency:m.currency}));
  assert.deepEqual(essential(changed.movements),essential(before.movements),"El TC nunca modifica importes históricos");
  assert.equal(await w.oneFxAutoUpdate(false),true,"La consulta automática es una por día");
  assert.equal(count,1);
  w.fetch=async()=>{throw Error("Sin conexión")};
  assert.equal(await w.oneFxAutoUpdate(true),false);
  const offline=JSON.parse(w.localStorage.getItem(key));
  assert.equal(offline.settings.fxBuy,442.56,"Sin red se conserva el último dato");
  assert.equal(offline.settings.fxSell,448.34);
  w.fetch=async url=>{
    if(url.includes("hacienda.go.cr"))throw Error("CORS no disponible");
    assert.equal(url,"https://tipodecambio.paginasweb.cr/api");
    const iso=w.todayIso(),date=iso.slice(8,10)+"/"+iso.slice(5,7)+"/"+iso.slice(0,4);
    return {ok:true,json:async()=>({fecha:date,compra:440.12,venta:448.51})};
  };
  assert.equal(await w.oneFxAutoUpdate(true),true,"Usar fuente alternativa al fallar Hacienda");
  const backup=JSON.parse(w.localStorage.getItem(key));
  assert.equal(backup.settings.fxSource,"bccr_mirror");
  assert.equal(backup.settings.fxBuy,440.12);
  assert.equal(backup.settings.fxSell,448.51);
  assert.deepEqual(errors,[],"Sin errores de interfaz");
  dom.window.close();
  console.log("V9: pagos anticipados, diferencias verificables, integridad y TC Hacienda/offline OK");
})().catch(e=>{dom.window.close();console.error(e);process.exitCode=1;});
