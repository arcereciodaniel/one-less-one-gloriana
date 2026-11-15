"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {JSDOM,VirtualConsole}=require("jsdom");
const html=fs.readFileSync("index.html","utf8");
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
assert(script,"Falta el JavaScript principal");
const actualCSS=html.slice(html.indexOf("<style>"),html.indexOf("</style>"));
assert(actualCSS.includes("/* Metas Beta 1.0"),"Los estilos de Metas deben estar en la hoja real, no en el reporte de impresión");
assert.equal((html.match(/\/\* Metas Beta 1.0 · identical structure/g)||[]).length,1,"No duplicar CSS de Metas en plantillas de impresión");

function boot(seed=null){
 const errors=[],vc=new VirtualConsole();vc.on("jsdomError",e=>errors.push(String(e.stack||e)));
 const dom=new JSDOM(html,{url:"https://example.com/",runScripts:"outside-only",pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event("close"))};
 w.alert=message=>{errors.push("ALERT: "+message)};
 w.confirm=()=>true;w.prompt=()=>null;
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({}, {get:(o,key)=>key==="measureText"?()=>({width:80}):()=>{}})};
 const key=script.match(/const STORAGE_KEY = "([^"]+)"/)?.[1];assert(key);
 if(seed)w.localStorage.setItem(key,JSON.stringify(seed));
 try{w.eval(script)}catch(e){errors.push("BOOT: "+String(e.stack||e))}
 return {w,dom,errors,key,read:()=>JSON.parse(w.localStorage.getItem(key)||"null")};
}
const activeGoal={
 version:6.2,categorySchemaVersion:1,incomeSchemaVersion:1,
 settings:{fx:500,fxBuy:500,fxSell:500,displayCurrency:"CRC"},
 periods:[{key:"2026-11-Q1",quarter:"2026-T4",n:1,budgetMonth:"2026-11",fortnight:1,date:"2026-10-28",
  opening:40000,income:0,otherIncome:0,budgets:{},categoryBudgets:{}}],
 movements:[],reconciliations:[],debts:[],categories:[],
 reserves:[{id:"goal-test",name:"Vacaciones",type:"goal",target:100000,
  targetCurrency:"CRC",openingAmount:20000,openingCurrency:"CRC",
  openingDate:"2026-11-01",targetDate:"2027-12-31",status:"active"}],
 reserveMovements:[],sharedCharges:[],sharedChargeGroups:[],receivableRecurring:[]
};
const run=boot(activeGoal),{w,errors,read}=run;
assert.deepEqual(errors,[],"La aplicación no debe tener errores al iniciar");
const root=w.document;
const quick=root.querySelectorAll("#movementQuickTypes button");
assert.equal(quick.length,5,"Debe haber Gasto, Ingreso, Pago deuda, Cobro y Ahorro para meta");
root.querySelector("#nav [data-view=movements]").click();
root.getElementById("toggleMovementComposer").click();
const actionGoal=root.querySelector('[data-one-action="goal"]');
actionGoal.click();
assert.equal(root.getElementById("oneCentralGoalForm").hidden,false);
assert.equal(root.getElementById("movementForm").hidden,true);
assert.equal(root.getElementById("oneCentralGoalSelect").value,"goal-test");
root.getElementById("oneCentralGoalAmount").value="5000";
root.getElementById("oneCentralGoalDate").value="2026-11-15";
root.getElementById("oneCentralGoalCurrency").value="CRC";
root.getElementById("oneCentralGoalForm").dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));
let saved=read();
assert(saved,"Se debe persistir el aporte");
assert.equal(saved.reserveMovements.length,1,"El ahorro se registra una vez en Metas");
assert.equal(saved.reserveMovements[0].reserveId,"goal-test");
assert.equal(saved.reserveMovements[0].type,"Aporte");
assert.equal(saved.reserveMovements[0].amount,5000);
assert.equal(saved.movements.length,0,"El ahorro no debe duplicar gasto ni ingreso en Movimientos");
assert(root.getElementById("oneCentralFeedback").textContent.includes("No se creó un gasto"));
assert.equal(root.getElementById("movementComposerDialog").open,false,"Cerrar formulario tras guardar");
assert.equal(w.getComputedStyle(root.querySelector(".one-goal-summary")).display,"grid","Los estilos reales de metas deben aplicarse");
assert.equal(w.getComputedStyle(root.querySelector(".one-goal-grid")).display,"grid");

// Captura de Cobro desde Movimientos reusa el formulario nativo y NO crea un ingreso.
root.getElementById("toggleMovementComposer").click();
root.querySelector('[data-one-action="cobro"]').click();
assert.equal(root.getElementById("movementComposerDialog").open,true,"Cobros permanece en el mismo modal");
assert.equal(root.getElementById("sharedChargeDialog").open,false,"No abrir otro diálogo");
assert.equal(root.getElementById("sharedChargeForm").parentNode.id,"oneCentralCobroMount","Usar el formulario de Cobros dentro de Movimientos");
assert.equal(root.querySelector('[data-one-action="goal"]').hidden,false,"Permitir cambiar a Metas desde Cobros");
root.getElementById("scPerson").value="Ana";
root.getElementById("scDescription").value="Cena";
root.getElementById("scAmount").value="12000";
root.getElementById("scStatus").value="pending";
root.getElementById("sharedChargeForm").dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));
saved=read();
assert(saved,"Debe persistir el cobro");
assert.equal(saved.sharedCharges.length,1);
assert.equal(saved.sharedCharges[0].person,"Ana");
assert.equal(saved.sharedCharges[0].amount,12000);
assert.equal(saved.sharedCharges[0].status,"pending");
assert.equal(saved.movements.length,0,"El cargo no es un ingreso recibido");
assert.equal(saved.reserveMovements.length,1,"El cobro no cambia el ahorro existente");
assert(root.getElementById("oneCentralFeedback").textContent.includes("No se registró como ingreso"));
assert.equal(root.getElementById("movementComposerDialog").open,false,"Cerrar tras guardar un cobro");
assert(root.getElementById("sharedChargeDialog").contains(root.getElementById("sharedChargeForm")),"Restaurar formulario para uso normal de Cobros");
assert.equal(root.getElementById("view-movements").classList.contains("active"),true,"Mantener la pantalla Movimientos al registrar el cobro");
assert.deepEqual(errors,[],"La integración no debe producir errores ni alertas");

const navGoal=root.querySelector("#nav [data-view=capital]");
navGoal.click();
assert.equal(w.getComputedStyle(root.getElementById("capitalLegacyDetails")).display,"none","No mostrar secciones heredadas de capital");
assert(!root.getElementById("view-capital").textContent.includes("Capital protegido e historial completo"),"Ocultar el módulo de capital protegido");
assert.equal(root.getElementById("goalCardGrid").querySelector(".one-goal-card h3")?.textContent,"Vacaciones");
const fromGoal=root.querySelector('[data-goal-txn="goal-test"][data-goal-type="Aporte"]');
assert(fromGoal,"Cada meta debe poder registrar un aporte");
fromGoal.click();
assert.equal(root.getElementById("movementComposerDialog").open,true,"La misma ventana de Movimientos debe funcionar dentro de Metas");
assert.equal(root.getElementById("oneCentralGoalForm").hidden,false);
assert.equal(root.getElementById("oneCentralGoalSelect").value,"goal-test");
root.getElementById("oneCentralGoalTxnType").value="Retiro a operación";
root.getElementById("oneCentralGoalTxnType").dispatchEvent(new w.Event("change",{bubbles:true}));
assert.equal(root.getElementById("oneCentralGoalCategoryField").hidden,true,"Un retiro no ejecuta presupuesto de ahorro");
root.getElementById("oneCentralGoalAmount").value="1000";
root.getElementById("oneCentralGoalDate").value="2026-11-15";
root.getElementById("oneCentralGoalForm").dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));
const afterWithdraw=read();
assert.equal(afterWithdraw.reserveMovements.length,2);
assert.equal(afterWithdraw.reserveMovements[1].type,"Retiro a operación");
assert.equal(afterWithdraw.movements.length,0,"Ni el aporte ni el retiro generan ingresos/gastos ficticios");
navGoal.click();
root.querySelector("#nav [data-view=movements]").click();
root.getElementById("toggleMovementComposer").click();
root.querySelector('[data-one-action="cobro"]').click();
root.querySelector('[data-one-action="goal"]').click();
assert.equal(root.getElementById("oneCentralGoalForm").hidden,false,"Cambiar de Cobros a Metas sin cerrar la ventana");
assert(root.getElementById("sharedChargeDialog").contains(root.getElementById("sharedChargeForm")),"Devolver formulario original al cambiar de tipo");
root.querySelector('[data-m2-type="Gasto"]').click();
assert.equal(root.getElementById("movementForm").hidden,false,"Cambiar de Metas a Gasto sin cerrar la ventana");
assert.equal(root.getElementById("movementComposerDialog").open,true);
root.getElementById("closeMovementComposer").click();
assert.deepEqual(errors,[],"Metas y cambios de tipo no deben producir errores");


// Sin metas: orientar a crear una antes de aportar, nunca guardar contra un fondo inexistente.
run.dom.window.close();
const noGoal=boot({...activeGoal,reserves:[]});
assert.deepEqual(noGoal.errors,[]);
const d=noGoal.w.document;
d.getElementById("toggleMovementComposer").click();
d.querySelector('[data-one-action="goal"]').click();
assert.equal(d.getElementById("oneCentralGoalEmpty").hidden,false);
assert.equal(d.getElementById("oneCentralGoalSubmit").disabled,true);
d.getElementById("oneCentralCreateGoal").click();
assert.equal(d.getElementById("reserveDialog").open,true);
assert.equal(d.getElementById("fType").value,"goal");
assert.equal(noGoal.read()?.reserveMovements?.length,0);
noGoal.dom.window.close();
console.log("OK: Metas con CSS real, 5 acciones, ahorro sin duplicidad, Cobro sin ingreso, formulario reutilizado y estado sin metas.");
