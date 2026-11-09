"use strict";

function labelOcrMarkup(){
 return '<div id="label-ocr"><label for="photo">Fotografie tvého balení (pro ověření)</label>'+
  '<input id="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment">'+
  '<p class="muted">Vyfoť zezadu řádky se složením a případnými stopami. Drobné písmo zabírej zblízka a bez odlesku.</p>'+
  '<div id="ocr-photo-tools" hidden><canvas id="ocr-image" aria-label="Náhled etikety" style="display:block;width:100%;max-width:520px;border-radius:8px;touch-action:pan-y"></canvas>'+
  '<div class="row" style="margin:8px 0"><button id="ocr-crop" type="button" class="secondary" aria-pressed="false">Označit složení</button>'+
  '<button id="ocr-reset" type="button" class="secondary">Celá fotka</button><button id="ocr-rotate" type="button" class="secondary">Otočit fotku</button></div></div>'+
  '<button id="ocr" type="button" class="secondary" disabled>Přečíst fotografii (OCR)</button>'+
  '<p id="ocrmsg" class="muted" role="status">Fotka se čte v tomto zařízení. Text nejdřív uvidíš jako návrh.</p>'+
  '<div id="ocr-proposal" class="card" hidden><h3>Návrh z fotografie</h3><b>Složení</b><p id="ocr-ingredients" style="white-space:pre-wrap"></p>'+
  '<div id="ocr-traces-area" hidden><b>Možné stopy</b><p id="ocr-traces" style="white-space:pre-wrap"></p></div>'+
  '<p class="muted">Porovnej návrh s obalem. Vložením nahradíš text složení.</p>'+
  '<button id="ocr-apply" type="button">Použít přečtený text</button></div></div>';
}

let ocrLibraryPromise=null;
function loadLabelOcr(){
 if(window.Tesseract)return Promise.resolve(window.Tesseract);
 if(!ocrLibraryPromise)ocrLibraryPromise=new Promise((resolve,reject)=>{
  const script=document.createElement("script");
  script.src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(Error("OCR se nenačetlo."));
  script.onerror=()=>{script.remove();reject(Error("OCR se nenačetlo."))};
  document.head.appendChild(script);
 }).catch(error=>{ocrLibraryPromise=null;throw error});
 return ocrLibraryPromise;
}

function drawLabelImage(canvas,image,turns,limit){
 const scale=Math.min(1,limit/Math.max(image.naturalWidth,image.naturalHeight));
 const width=Math.max(1,Math.round(image.naturalWidth*scale));
 const height=Math.max(1,Math.round(image.naturalHeight*scale));
 canvas.width=turns%2?height:width;canvas.height=turns%2?width:height;
 const ctx=canvas.getContext("2d");
 ctx.fillStyle="white";ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(turns*Math.PI/2);
 ctx.drawImage(image,-width/2,-height/2,width,height);
 ctx.setTransform(1,0,0,1,0,0);
 return ctx;
}

function prepareLabelImage(image,turns,selection){
 const original=document.createElement("canvas");
 drawLabelImage(original,image,turns,2600);
 const {x,y,w,h}=selection||{x:0,y:0,w:1,h:1};
 const width=Math.max(1,Math.round(w*original.width)),height=Math.max(1,Math.round(h*original.height));
 const scale=Math.min(2,1800/Math.max(width,height));
 const scaledWidth=Math.max(1,Math.round(width*scale)),scaledHeight=Math.max(1,Math.round(height*scale));
 const canvas=document.createElement("canvas");canvas.width=scaledWidth+32;canvas.height=scaledHeight+32;
 const ctx=canvas.getContext("2d",{willReadFrequently:true});
 ctx.fillStyle="white";ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.drawImage(original,Math.round(x*original.width),Math.round(y*original.height),width,height,16,16,scaledWidth,scaledHeight);
 original.width=1;original.height=1;
 return canvas;
}

function increaseLabelContrast(canvas){
 const ctx=canvas.getContext("2d",{willReadFrequently:true});
 const pixels=ctx.getImageData(16,16,canvas.width-32,canvas.height-32),data=pixels.data;
 const {width,height}=pixels,stride=width+1;
 const sums=new Uint32Array(stride*(height+1));
 // Compare each pixel with its neighborhood so shadows on curved labels do not hide letters.
 for(let y=0;y<height;y++){
  let rowSum=0;
  for(let x=0;x<width;x++){
   const i=(y*width+x)*4;
   const gray=Math.round(data[i]*.299+data[i+1]*.587+data[i+2]*.114);
   data[i]=gray;rowSum+=gray;
   sums[(y+1)*stride+x+1]=sums[y*stride+x+1]+rowSum;
  }
 }
 const radius=Math.max(12,Math.round(Math.min(width,height)/14));
 for(let y=0;y<height;y++){
  const top=Math.max(0,y-radius),bottom=Math.min(height,y+radius+1);
  for(let x=0;x<width;x++){
   const left=Math.max(0,x-radius),right=Math.min(width,x+radius+1);
   const sum=sums[bottom*stride+right]-sums[top*stride+right]-sums[bottom*stride+left]+sums[top*stride+left];
   const average=sum/((right-left)*(bottom-top)),i=(y*width+x)*4;
   const gray=245+5*(data[i]-average);
   data[i]=gray;data[i+1]=gray;data[i+2]=gray;
  }
 }
 ctx.putImageData(pixels,16,16);
}

function parseLabelOcr(data){
 const text=String(data?.text||"").replace(/\r/g,"").replace(/[ \t]+/g," ").trim();
 const heading=/(?:^|\s)(?:slo[žz]en[íi]|ingredients)\s*[:：]/i.exec(text);
 const start=heading?heading.index+heading[0].length:0;
 const nextSection=/(?:^|\s)(?:v[ýy][žz]ivov[ée]\s+(?:hodnoty|[úu]daje)|nutri[čc]n[íi]\s+(?:hodnoty|[úu]daje)|nutrition\s+(?:facts|information)|skladov[áa]n[íi]|minim[áa]ln[íi]\s+trvanlivost|uchov[áa]vejte|distributor|zlo[žz]enie\s*:)(?=[\s:.,]|$)/i;
 const label=text.slice(start);
 const trace=/(?:^|\s)(?:(?:m[ůu][žz]e|mohou)\s+(?:(?:tak[ée])\s+)?obsahovat|may\s+(?:also\s+)?contain)\b/i.exec(label);
 const ingredients=(trace?label.slice(0,trace.index):label).split(nextSection)[0].trim();
 const traces=trace?label.slice(trace.index).trim().split(nextSection)[0].match(/^[^.!?]+[.!?]?/)?.[0]?.trim()||"":"";
 const words=ingredients.match(/\p{L}{3,}/gu)||[];
 const separators=ingredients.match(/[,;]/g)||[];
 const confidence=Number(data?.confidence)||0;
 const plausible=heading?words.length>=1:words.length>=3&&separators.length>=2&&ingredients.length>=16;
 return {ingredients,traces,usable:Boolean(plausible&&confidence>=65)};
}

function bindLabelOcr(fields,onPhoto){
 const panel=document.getElementById("label-ocr");
 const get=id=>panel.querySelector("#"+id);
 const input=get("photo"),tools=get("ocr-photo-tools"),canvas=get("ocr-image"),status=get("ocrmsg");
 const run=get("ocr"),crop=get("ocr-crop"),proposalBox=get("ocr-proposal");
 let image=null,turns=0,selection=null,start=null,cropping=false,revision=0,busy=false,proposal=null;
 function redraw(box=selection){
  if(!image)return;
  const ctx=drawLabelImage(canvas,image,turns,720);
  if(!box)return;
  const x=box.x*canvas.width,y=box.y*canvas.height,w=box.w*canvas.width,h=box.h*canvas.height;
  ctx.fillStyle="rgba(29,123,104,.18)";ctx.fillRect(x,y,w,h);
  ctx.strokeStyle="#087b65";ctx.lineWidth=3;ctx.strokeRect(x,y,w,h);
 }
 function invalidate(){
  revision++;proposal=null;proposalBox.hidden=true;
 }
 function cropMode(enabled){
  cropping=enabled;start=null;crop.setAttribute("aria-pressed",String(enabled));
  canvas.style.touchAction=enabled?"none":"pan-y";
 }
 input.onchange=async()=>{
  const file=input.files?.[0]||null;onPhoto(file);
  invalidate();const loading=revision;image=null;turns=0;selection=null;cropMode(false);
  tools.hidden=true;run.disabled=true;
  if(!file){status.textContent="Vyber nebo vyfoť etiketu.";return}
  const url=URL.createObjectURL(file);
  try{
   const next=new Image();
   await new Promise((resolve,reject)=>{next.onload=resolve;next.onerror=reject;next.src=url});
   if(loading!==revision||!panel.isConnected)return;
   image=next;redraw();tools.hidden=false;run.disabled=busy;
   status.textContent="Můžeš přečíst celou fotku nebo nejdřív označit jen složení.";
  }catch{if(loading===revision)status.textContent="Fotku se nepodařilo otevřít. Zkus ji pořídit znovu."}
  finally{URL.revokeObjectURL(url)}
 };
 crop.onclick=()=>{
  cropMode(!cropping);
  if(cropping)canvas.scrollIntoView({block:"center"});
  status.textContent=cropping?"Prstem nebo myší obkresli obdélník kolem řádků se složením a stopami.":"Můžeš spustit čtení.";
 };
 get("ocr-reset").onclick=()=>{invalidate();selection=null;cropMode(false);redraw();status.textContent="Čtení použije celou fotku."};
 get("ocr-rotate").onclick=()=>{invalidate();turns=(turns+1)%4;selection=null;cropMode(false);redraw();status.textContent="Fotka otočena. Můžeš označit složení nebo spustit čtení."};
 function position(event){
  const r=canvas.getBoundingClientRect(),unit=value=>Math.max(0,Math.min(1,value));
  return {x:unit((event.clientX-r.left)/r.width),y:unit((event.clientY-r.top)/r.height)};
 }
 function boxTo(end){return {x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),w:Math.abs(start.x-end.x),h:Math.abs(start.y-end.y)}}
 canvas.onpointerdown=event=>{
  if(!cropping||!event.isPrimary)return;
  invalidate();start=position(event);canvas.setPointerCapture(event.pointerId);
 };
 canvas.onpointermove=event=>{if(start&&event.isPrimary)redraw(boxTo(position(event)))};
 canvas.onpointercancel=()=>{start=null;redraw()};
 canvas.onpointerup=event=>{
  if(!start||!event.isPrimary)return;
  const box=boxTo(position(event));start=null;
  if(box.w<.04||box.h<.04){redraw();status.textContent="Označ větší obdélník kolem celého textu.";return}
  selection=box;cropMode(false);redraw();status.textContent="Výřez je připravený. Klepni na Přečíst fotografii.";
 };
 run.onclick=async()=>{
  if(!image||busy)return;
  cropMode(false);invalidate();const job=revision,part=selection;
  const current=()=>panel.isConnected&&job===revision;
  busy=true;run.disabled=true;status.textContent="Načítám čtečku… Při prvním spuštění to může chvíli trvat.";
  let worker,prepared;
  try{
   prepared=prepareLabelImage(image,turns,part);
   const ocr=await loadLabelOcr();if(!current())return;
   worker=await ocr.createWorker(["ces","eng"],1);if(!current())return;
   status.textContent=part?"Čtu označený výřez…":"Čtu fotku…";
   await worker.setParameters({tessedit_pageseg_mode:part?ocr.PSM.SINGLE_BLOCK:ocr.PSM.AUTO});
   let result=parseLabelOcr((await worker.recognize(prepared)).data);if(!current())return;
   if(!result.usable){
    increaseLabelContrast(prepared);
    await worker.setParameters({tessedit_pageseg_mode:part?ocr.PSM.SPARSE_TEXT:ocr.PSM.SINGLE_BLOCK});
    result=parseLabelOcr((await worker.recognize(prepared)).data);if(!current())return;
   }
   if(!result.usable){
    status.textContent="Složení se nepodařilo spolehlivě přečíst. Označ jen řádky se složením nebo zkus ostřejší fotku bez odlesku.";
    return;
   }
   proposal=result;get("ocr-ingredients").textContent=result.ingredients;
   get("ocr-traces").textContent=result.traces;get("ocr-traces-area").hidden=!result.traces;
   proposalBox.hidden=false;status.textContent="Zkontroluj návrh níže. Text v etiketě se změní až po potvrzení.";
  }catch{if(current())status.textContent="Čtení se nepodařilo dokončit. Zkus menší výřez nebo novou fotku."}
  finally{
   if(prepared){prepared.width=1;prepared.height=1}
   if(worker)await worker.terminate().catch(()=>{});
   busy=false;run.disabled=!image;
  }
 };
 get("ocr-apply").onclick=()=>{
  if(!proposal)return;
  fields.ingredients.value=proposal.ingredients;
  if(proposal.traces)fields.traces.value=proposal.traces;
  fields.confirmed.checked=false;proposal=null;proposalBox.hidden=true;
  status.textContent="Návrh je vložený. Zkontroluj složení, alergeny a možné stopy podle obalu.";
 };
}
