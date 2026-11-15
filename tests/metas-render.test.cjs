"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {JSDOM,VirtualConsole}=require("jsdom");
const html=fs.readFileSync("index.html","utf8");
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
assert(script,"No se encontró el script de la app");

function boot(){
 const errors=[],vc=new VirtualConsole();
 vc.on("jsdomError",e=>errors.push(String(e.stack||e)));
 vc.on("error",e=>errors.push(String(e)));
 const dom=new JSDOM(html,{url:"https://example.com/",runScripts:"outside-only",pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window;
 w.alert=()=>{};
 w.confirm=()=>true;
 w.prompt=()=>null;
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLCanvasElement.prototype.getContext=function(){
   return new Proxy({}, {get:(o,key)=>key==="measureText"?()=>({width:80}):()=>{}});
 };
 try{w.eval(script)}catch(e){errors.push("BOOT: "+String(e.stack||e))}
 return {dom,w,errors};
}

const {dom,w,errors}=boot();
try{
 const toggle=w.document.getElementById("moduleGoalsToggle");
 assert(toggle,"Falta el control para habilitar Metas");
 toggle.checked=true;
 toggle.dispatchEvent(new w.Event("change",{bubbles:true}));
 const btn=w.document.querySelector('#nav [data-view="capital"]');
 assert(btn,"Falta el enlace de Metas");
 btn.click();
}catch(e){errors.push("METAS: "+String(e.stack||e))}
const view=w.document.getElementById("view-capital"),summary=w.document.getElementById("goalSummary"),grid=w.document.getElementById("goalCardGrid");
console.log(JSON.stringify({
  errors,
  active:!!view?.classList.contains("active"),
  summary:summary?.textContent?.trim().slice(0,120),
  grid:grid?.textContent?.trim().slice(0,120),
  rendered:!!summary?.children.length,
  bodyText:view?.textContent?.trim().slice(0,160),
  ancestor:view?.parentElement?.tagName,
  styles:w.getComputedStyle(view).display
},null,2));
assert.equal(errors.length,0,"Errores al abrir Metas");
assert(view.classList.contains("active"));
assert.equal(w.getComputedStyle(view).display,"block","La vista activa de Metas no puede seguir con display:none");
for(const theme of ["light","dark"]){
 w.document.documentElement.dataset.theme=theme;
 assert.equal(w.getComputedStyle(view).display,"block","Metas invisible en tema "+theme);
}
assert(summary.children.length,"El resumen de Metas no se generó");
assert(grid.textContent.includes("No hay metas"),"No se ve el estado vacío de Metas");
const dashboard=w.document.querySelector('#nav [data-view="dashboard"]');
dashboard.click();
assert.equal(w.getComputedStyle(view).display,"none","Metas debe ocultarse fuera de su vista");
assert(!view.classList.contains("active"));
const metas=w.document.querySelector('#nav [data-view="capital"]');
metas.click();
assert.equal(w.getComputedStyle(view).display,"block","Metas debe volver a abrir después de navegar");
dom.window.close();
