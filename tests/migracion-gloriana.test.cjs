"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const html=fs.readFileSync("index.html","utf8");
const scriptStart=html.indexOf("<script>")+8;
const scriptEnd=html.lastIndexOf("</script>");
assert(scriptStart>7&&scriptEnd>scriptStart,"No se encontró el script de la aplicación");
const appScript=html.slice(scriptStart,scriptEnd);
new vm.Script(appScript,{filename:"one-less-one-gloriana.js"});
const lastBoot=appScript.lastIndexOf("bind();initDebtBalanceReconciliation();");
assert(lastBoot!==-1,"No se encontró el inicio de la UI");
const appWithoutDomBoot=appScript.slice(0,lastBoot);

class Storage {
  constructor(entries={}){this.map=new Map(Object.entries(entries))}
  getItem(k){return this.map.has(k)?this.map.get(k):null}
  setItem(k,v){this.map.set(String(k),String(v))}
  removeItem(k){this.map.delete(k)}
}
function start(storage){
  const ctx=vm.createContext({
    localStorage:storage,sessionStorage:new Storage(),console,
    navigator:{},window:{},document:{},crypto:{randomUUID:()=>Math.random().toString(36).slice(2)},
    alert:()=>{},confirm:()=>true,setTimeout:()=>{},URL:{},Blob:class{}
  });
  vm.runInContext(appWithoutDomBoot,ctx,{timeout:15000});
  return {
    data:JSON.parse(vm.runInContext("JSON.stringify(data)",ctx)),
    error:vm.runInContext("storageReadError",ctx),
    status:JSON.parse(vm.runInContext("JSON.stringify(oneGlorianaMigrationState)",ctx))
  };
}
const legacy={
  version:1.3,settings:{fx:500},
  periods:[{key:"2026-11-Q1",quarter:"2026-T4",n:1,budgetMonth:"2026-11",fortnight:1,date:"2026-11-01",
    opening:1000,income:500,otherIncome:100,budgets:{"Supermercado":180,"Tarjetas / acuerdos":90}}],
  movements:[
    {id:"m1",seq:1,date:"2026-11-04",type:"Gasto",category:"Supermercado",account:"Efectivo",amount:50,period:"2026-11-Q1",description:"Compra"},
    {id:"m2",seq:2,date:"2026-11-05",type:"Pago deuda",category:"Tarjetas / acuerdos",debtId:"d1",debt:"Visa",amount:90,period:"2026-11-Q1",description:"Pago"}
  ],
  movementSeq:2,
  debts:[{id:"d1",type:"Tarjeta",name:"Visa",usd:0,crc:2000,fx:500,minimum:100,limit:0,payDay:"20",priority:1}],
  reconciliations:[{id:"rec1",date:"2026-11-06",amount:1200,afterSeq:2,calculatedBefore:1200,createdAt:"2026-11-06T12:00:00"}],
  reserves:[{id:"f1",name:"Vacaciones",type:"goal",target:2000,openingAmount:400,openingDate:"2026-11-01"}],
  reserveMovements:[{id:"t1",date:"2026-11-03",reserveId:"f1",type:"Aporte",amount:200,createdAt:"2026-11-03T12:00:00"}],
  receivables:[
    {id:"c1",person:"Ana",reason:"Cena",date:"2026-11-01",amount:130,status:"pending",paidAt:""},
    {id:"c2",person:"Luis",reason:"Entrada",date:"2026-11-01",amount:90,status:"paid",paidAt:"2026-11-07"}
  ]
};
const LEGACY_KEY="gloriana_finanzas_local_v1", NEW_KEY="gloriana_one_less_one_data_v2";
const legacyText=JSON.stringify(legacy);

// Migración real con estructuras y reglas del aplicativo, no una implementación duplicada.
const storage=new Storage({[LEGACY_KEY]:legacyText});
const first=start(storage);
assert.equal(first.error,false,"La migración no debe bloquear la aplicación");
assert.equal(first.status.type,"done");
assert.equal(first.data.movements.length,2);
assert.equal(first.data.debts.length,1);
assert.equal(first.data.reconciliations[0].amount,1200,"No alterar conciliaciones históricas");
assert.equal(first.data.reserves.length,1);
assert.equal(first.data.reserveMovements.length,1);
assert.equal(first.data.periods[0].income,500);
assert.equal(first.data.periods[0].otherIncome,100);
assert.equal(first.data.sharedCharges.length,2);
assert.equal(first.data.sharedCharges.find(c=>c.id==="c1").status,"pending");
assert.equal(first.data.sharedCharges.find(c=>c.id==="c2").payments[0].amount,90);
assert.equal(first.data.movements.find(m=>m.id==="m2").type,"Pago deuda");
assert.equal(first.data.categories.find(c=>c.id===first.data.movements.find(m=>m.id==="m2").categoryId).type,"Pago deuda");
assert.equal(storage.getItem(LEGACY_KEY),legacyText,"Nunca borrar o modificar el origen");
assert.equal(storage.getItem("gloriana_one_less_one_legacy_backup_v131"),legacyText);
assert(storage.getItem(NEW_KEY),"No se escribió el destino");

// Segunda apertura no debe duplicar cobros ni movimientos.
const second=start(storage);
assert.equal(second.error,false);
assert.equal(second.data.sharedCharges.length,2);
assert.equal(second.data.movements.length,2);
assert.equal(second.status.type,"already");

// Si la nueva versión ya contiene movimientos, no pisarlos por los antiguos.
const withoutLegacy=start(new Storage()).data;
withoutLegacy.movements=[{id:"nuevo",date:"2026-11-01",type:"Gasto",amount:10,category:"Supermercado",period:withoutLegacy.periods[0].key}];
const prior=JSON.stringify(withoutLegacy);
const conflictStorage=new Storage({[LEGACY_KEY]:legacyText,[NEW_KEY]:prior});
const conflict=start(conflictStorage);
assert.equal(conflict.status.type,"conflict");
assert.equal(conflict.data.movements.length,1);
assert.equal(conflict.data.movements[0].id,"nuevo");
assert.equal(conflictStorage.getItem(NEW_KEY),prior,"No modificar el destino si hay conflicto");

// Si solo se había abierto la nueva UI sin contenido financiero, importar.
const blankStorage=new Storage({[LEGACY_KEY]:legacyText,[NEW_KEY]:JSON.stringify(start(new Storage()).data)});
const blank=start(blankStorage);
assert.equal(blank.status.type,"done");
assert.equal(blank.data.movements.length,2);
assert(blankStorage.getItem("gloriana_one_less_one_before_legacy_import_v2"));

// Si el historial viejo está corrupto, bloquear guardado y no inventar datos migrados.
const corruptStorage=new Storage({[LEGACY_KEY]:"{archivo-corrupto"});
const corrupt=start(corruptStorage);
assert.equal(corrupt.error,true);
assert.equal(corrupt.status.type,"error");
assert.equal(corruptStorage.getItem(NEW_KEY),null);
assert.equal(corruptStorage.getItem(LEGACY_KEY),"{archivo-corrupto");

console.log("OK: sintaxis, migración, conteos, importes, cobros, idempotencia, conflicto, respaldo y origen corrupto.");
