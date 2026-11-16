"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {JSDOM,VirtualConsole}=require("jsdom");
const html=fs.readFileSync("index.html","utf8");
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
assert(script,"Debe existir el código principal");
assert(html.includes('content="One Less One"'),"El nombre de la aplicación debe ser One Less One");
assert(html.includes('id="scAdvanced"'),"Cobros necesita opciones avanzadas colapsables");
assert(html.includes('id="scDueDate"'),"El cobro conserva fecha esperada opcional");

const errors=[],vc=new VirtualConsole();
vc.on("jsdomError",e=>errors.push(String(e.stack||e)));
const dom=new JSDOM(html,{url:"https://example.com/",runScripts:"outside-only",pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,root=w.document;
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event("close"))};
w.alert=message=>errors.push("ALERT: "+message);
w.confirm=()=>true;w.prompt=()=>null;
w.HTMLElement.prototype.scrollIntoView=function(){};
w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({}, {get:(o,key)=>key==="measureText"?()=>({width:80}):()=>{}})};
const storageKey=script.match(/const STORAGE_KEY = "([^"]+)"/)?.[1];assert(storageKey);
const seed={
 version:6.2,categorySchemaVersion:1,incomeSchemaVersion:1,
 settings:{fx:500,fxBuy:500,fxSell:500,displayCurrency:"CRC"},
 periods:[{key:"2026-11-Q1",quarter:"2026-T4",n:1,budgetMonth:"2026-11",fortnight:1,
 date:"2026-10-28",opening:40000,income:0,otherIncome:0,budgets:{},categoryBudgets:{}}],
 movements:[],reconciliations:[],debts:[],categories:[
  {id:"cat-super",name:"Supermercado",type:"Gasto",group:"Necesidades",budgetable:true,active:true,sort:10},
  {id:"cat-trans",name:"Transporte",type:"Gasto",group:"Necesidades",budgetable:true,active:true,sort:20},
  {id:"cat-sal",name:"Salario",type:"Ingreso",group:"Ingresos",budgetable:true,active:true,sort:10}
 ],reserves:[],reserveMovements:[],
 sharedCharges:[],sharedChargeGroups:[],receivableRecurring:[]
};
w.localStorage.setItem(storageKey,JSON.stringify(seed));
w.eval(script);
assert.deepEqual(errors,[],"La aplicación no debe fallar al iniciar");
root.querySelector('#nav [data-view="movements"]').click();
root.getElementById("toggleMovementComposer").click();

// Gasto: no sugerir una categoría arbitraria y exigir selección explícita.
const category=root.getElementById("mCategory");
assert.equal(category.value,"","Gasto debe empezar sin categoría");
assert.equal(category.options[0].textContent,"Seleccioná una categoría");
assert.equal(root.getElementById("mDescription").placeholder,"¿En qué gastaste?");
root.querySelector('[data-m2-type="Ingreso"]').click();
assert.equal(category.value,"","Ingreso también debe empezar sin categoría");
assert.equal(root.getElementById("mDescription").placeholder,"¿De dónde recibiste el dinero?");
root.getElementById("mType").value="Pago deuda";
root.getElementById("mType").dispatchEvent(new w.Event("change",{bubbles:true}));
assert.equal(root.getElementById("mDebtField").hidden,false);
assert.equal(root.getElementById("mCategoryField").hidden,true);
assert.equal(root.getElementById("mDebt").value,"","Pago deuda no debe seleccionar una deuda arbitraria");
assert.equal(root.getElementById("mDescription").placeholder,"¿Querés agregar un detalle?");
root.querySelector('[data-m2-type="Gasto"]').click();
root.getElementById("movementSplitToggle").click();
const splits=[...root.querySelectorAll(".m2-split-category")];
assert.equal(splits.length,2);
assert(splits.every(el=>el.value===""),"Dividir gasto tampoco debe escoger categorías automáticamente");

// Cobro: registro claro y fecha opcional, sin ingreso ficticio.
root.querySelector('[data-one-action="cobro"]').click();
assert.equal(root.getElementById("sharedChargeForm").parentNode.id,"oneCentralCobroMount");
assert.equal(root.getElementById("scAdvanced").open,false,"Opciones avanzadas cerradas al crear");
assert.equal(root.getElementById("scDueDate").required,false);
assert.equal(root.getElementById("scDueDate").value,"");
assert.equal(root.getElementById("scReminderField").hidden,true);
root.getElementById("scPerson").value="Ana";
root.getElementById("scDescription").value="Cena";
root.getElementById("scAmount").value="12000";
root.getElementById("sharedChargeForm").dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));
let saved=JSON.parse(w.localStorage.getItem(storageKey));
assert.equal(saved.sharedCharges.length,1);
assert.equal(saved.sharedCharges[0].dueDate,"","La ausencia de fecha se debe respetar");
assert.equal(saved.sharedCharges[0].status,"pending");
assert.equal(saved.movements.length,0,"Un cobro pendiente no es un ingreso");
assert.equal(w.cobroReminderStart(saved.sharedCharges[0]),"9999-12-31","Sin fecha no debe generar recordatorios");
assert(root.getElementById("sharedChargeDialog").contains(root.getElementById("sharedChargeForm")));

// Recurrencia: pedir fecha esperada en lugar de generar un vencimiento implícito.
root.getElementById("toggleMovementComposer").click();
root.querySelector('[data-one-action="cobro"]').click();
root.getElementById("scPerson").value="Luis";
root.getElementById("scDescription").value="Suscripción";
root.getElementById("scAmount").value="5000";
root.getElementById("scRecurring").checked=true;
root.getElementById("sharedChargeForm").dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));
saved=JSON.parse(w.localStorage.getItem(storageKey));
assert.equal(saved.sharedCharges.length,1,"No crear recurrencias sin fecha");
assert(errors.some(x=>x.includes("elegí la fecha")),"Explicar por qué es necesaria una fecha para recurrencia");
errors.length=0;
root.getElementById("scDueDate").value="2026-12-15";
root.getElementById("scDueDate").dispatchEvent(new w.Event("change",{bubbles:true}));
assert.equal(root.getElementById("scReminderField").hidden,false);
root.getElementById("sharedChargeForm").dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));
saved=JSON.parse(w.localStorage.getItem(storageKey));
assert.equal(saved.sharedCharges.length,2);
assert.equal(saved.sharedCharges[1].dueDate,"2026-12-15");
assert.equal(saved.receivableRecurring.length,1);
assert.deepEqual(errors,[],"No debe producir alertas o errores inesperados");
console.log("Formularios V8: categoría, ingreso, deuda, cobro, recordatorios y recurrencia OK");
