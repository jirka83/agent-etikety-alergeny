
"use strict";
const API="https://nseyvrzfaqqhqbxovbmd.supabase.co", KEY="sb_publishable_1GSNX79G31T5OkafLHok3g_BFnAhg-5", APP=new URL("./",location.href).pathname;
const ALL=[
["gluten","1. Obiloviny obsahující lepek"],["crustaceans","2. Korýši"],["eggs","3. Vejce"],
["fish","4. Ryby"],["peanuts","5. Arašídy"],["soy","6. Sója"],["milk","7. Mléko"],
["nuts","8. Skořápkové plody"],["celery","9. Celer"],["mustard","10. Hořčice"],
["sesame","11. Sezam"],["sulphites","12. Oxid siřičitý a siřičitany"],["lupin","13. Vlčí bob"],["molluscs","14. Měkkýši"]];
let session=null,profile=null,found=[],selected=null,photo=null,working=false,scanner=null,pendingSave=null;
const el=id=>document.getElementById(id);
const escapeHtml=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const urlSafe=x=>{try{const u=new URL(x);return ["https:","http:"].includes(u.protocol)?escapeHtml(u.href):""}catch{return ""}};
const allergenName=k=>ALL.find(a=>a[0]===k)?.[1]||k;
function msg(s,bad=false){el("alert").innerHTML='<p class="alert '+(bad?"error":"ok")+'" role="status">'+escapeHtml(s)+'</p>';setTimeout(()=>{if(el("alert"))el("alert").innerHTML=""},11000)}
function show(html){stopScanner();el("app").innerHTML=html}
function fail(e){msg(e?.message||String(e),true)}
function stopScanner(){if(scanner){clearInterval(scanner.timer);scanner.stream.getTracks().forEach(t=>t.stop());scanner=null}}
async function api(path,options={},requiresLogin=true){
 const headers={"apikey":KEY,...(options.headers||{})};
 if(requiresLogin){await validSession();if(!session)throw Error("Je nutné přihlášení.");headers.Authorization="Bearer "+session.access_token}
 const res=await fetch(API+path,{...options,headers});
 const raw=await res.text();let data=null;try{data=JSON.parse(raw)}catch{data=raw}
 if(!res.ok){const e=Error(data?.message||data?.error_description||data?.error||"Chyba "+res.status);e.status=res.status;throw e}
 return data;
}
function store(s){session={...s,expires_at:s.expires_at||(Math.floor(Date.now()/1000)+Number(s.expires_in||3600))};localStorage.setItem("etikety_session",JSON.stringify(session))}
async function validSession(){
 if(!session||session.expires_at>Math.floor(Date.now()/1000)+60)return;
 try{const s=await api("/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refresh_token:session.refresh_token})},false);store(s)}
 catch{session=null;localStorage.removeItem("etikety_session")}
}
async function authenticate(){
 await validSession();
 if(!session){login();return false}
 const user=await api("/auth/v1/user");
 session.user=user;store(session);
 const prof=await api("/rest/v1/profiles?select=id,role,email&id=eq."+encodeURIComponent(user.id));
 profile=prof[0];
 if(!profile||!["owner","staff"].includes(profile.role))throw Error("Účet nemá povolený přístup.");
 el("account").textContent=profile.email+" · "+(profile.role==="owner"?"Majitel":"Zaměstnanec");
 return true;
}
function login(){
 el("account").textContent="";
 show('<div class="card" style="max-width:450px;margin:30px auto"><h2>Přihlášení</h2><p class="muted">Použij svůj účet aplikace Etikety & Alergeny.</p><form id="authform"><label>E-mail<input type="email" id="mail" autocomplete="username" required></label><label>Heslo<input type="password" id="pass" autocomplete="current-password" required></label><div class="row"><button>Přihlásit</button><button type="button" id="reset" class="secondary">Zapomenuté heslo</button></div></form></div>');
 el("authform").onsubmit=async event=>{event.preventDefault();try{const s=await api("/auth/v1/token?grant_type=password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:el("mail").value.trim(),password:el("pass").value})},false);store(s);if(await authenticate()){if(!recoveryPending())home()}}catch(e){fail(e)}};
 el("reset").onclick=async()=>{if(!el("mail").value.trim())return msg("Nejprve zadej e-mail.",true);try{await api("/auth/v1/recover?redirect_to="+encodeURIComponent(location.origin+APP),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:el("mail").value.trim()})},false);msg("Pokud účet existuje, pošleme e-mail. Adresa aplikace musí být povolena v Supabase Redirect URLs.")}catch(e){fail(e)}};
}
async function resetPassword(){
 show('<div class="card" style="max-width:450px;margin:30px auto"><h2>Nastavit heslo</h2><form id="resetform"><label>Nové heslo (nejméně 12 znaků)<input id="newpass" type="password" minlength="12" required></label><button>Uložit nové heslo</button></form></div>');
 el("resetform").onsubmit=async e=>{e.preventDefault();try{await api("/auth/v1/user",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:el("newpass").value})});history.replaceState(null,"",APP);msg("Heslo nastavené.");if(await authenticate()){if(!recoveryPending())home()}}catch(ex){fail(ex)}};
}
async function signout(){
 if(session){try{await api("/auth/v1/logout",{method:"POST"})}catch{}}
 stopScanner();sessionStorage.removeItem("etikety_pending_save");session=null;profile=null;localStorage.removeItem("etikety_session");login();
}
function chrome(title,body,tab="search"){
 show('<nav><button data-view="search" class="'+(tab==="search"?"active":"")+'">Agent – vyhledávání</button><button data-view="saved" class="'+(tab==="saved"?"active":"")+'">Uložené výrobky</button><button id="staff" class="secondary">Zaměstnanci</button><button id="signout" class="secondary">Odhlásit</button></nav><h2>'+escapeHtml(title)+'</h2>'+body+
 '<p class="alert">Nikdy nepovažuj chybějící alergen nebo údaj o možných stopách za potvrzení, že ve výrobku není. Rozhoduje aktuální etiketa skutečného balení.</p>');
 document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>b.dataset.view==="saved"?saved():home());
 el("signout").onclick=signout;
 const staff=el("staff");if(staff){staff.style.display=profile?.role==="owner"?"inline-block":"none";staff.onclick=employees;}
}
function home(){
 selected=null;found=[];photo=null;pendingSave=null;
 chrome("Automaticky najít etiketu",
 '<div class="card"><label>Název výrobku nebo EAN</label><div class="row"><input id="lookup" class="grow" placeholder="Zadej značku a název nebo čárový kód" autofocus><button id="find">Najít etiketu</button><button id="scan" class="secondary">Skenovat EAN</button><button id="manual" class="secondary">Zadat ručně</button></div><div id="camera"></div><p class="muted">Agent použije bezplatný katalog Open Food Facts. Automatické vyhledávání probíhá až po stisknutí tlačítka. Zdroj Open Food Facts – ODbL.</p></div><div id="results"></div><div id="editor"></div>');
 el("find").onclick=search;
 el("lookup").onkeydown=e=>{if(e.key==="Enter")search()};
 el("scan").onclick=startScanner;
 el("manual").onclick=()=>edit(null);
}
async function search(){
 const term=el("lookup").value.trim(),b=el("find");
 if(term.length<3)return msg("Zadej alespoň 3 znaky nebo celý EAN.",true);
 b.disabled=true;el("results").innerHTML='<div class="card">Hledám výrobky, složení a případné fotografie etiket…</div>';el("editor").innerHTML="";
 try{
  await validSession();
  const res=await fetch(API+"/functions/v1/etikety-lookup",{
   method:"POST",headers:{"Content-Type":"application/json","apikey":KEY,"Authorization":"Bearer "+session.access_token},body:JSON.stringify({term})
  });
  const j=await res.json();if(!res.ok)throw Error(j.error||"Vyhledávání se nepodařilo.");
  found=j.matches||[];
  el("results").innerHTML='<h2>Nalezené varianty ('+found.length+')</h2>'+
  (found.length?'<p class="alert">Vyber přesný produkt podle názvu, příchutě, balení a EAN. Údaje jsou neověřené.</p>':'<div class="card">Výrobek v komunitním katalogu nenalezen. Použij ruční zadání či fotografii, případně <a target="_blank" rel="noopener noreferrer" href="https://www.google.com/search?q='+encodeURIComponent(term+" etiketa složení alergeny výrobce pdf")+'">vyhledej dokument výrobce na webu</a> a ověř jej.</div>')+
  found.map((m,i)=>'<div class="card"><h3>'+escapeHtml(m.name)+'</h3><p class="muted">'+escapeHtml([m.brand,m.quantity,"EAN "+m.ean].filter(Boolean).join(" · "))+'</p>'+
  (m.labelImageUrl?'<a href="'+urlSafe(m.labelImageUrl)+'" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="'+urlSafe(m.labelImageUrl)+'" alt="Fotografie složení" style="width:100%;max-height:220px;object-fit:contain"></a>':'<div class="alert">Fotografie složení nenalezena – nahraj vlastní etiketu.</div>')+
  '<p><b>Obsahuje (neověřeno):</b> '+(m.contains.length?escapeHtml(m.contains.map(allergenName).join(", ")):"Údaj nenalezen")+'</p>'+
  '<p><b>Možné stopy (neověřeno):</b> '+(m.possibleTraces.length?escapeHtml(m.possibleTraces.map(allergenName).join(", ")):"Údaj nenalezen – neznamená bez stop")+'</p>'+
  (m.tracesText?'<p>Upozornění: '+escapeHtml(m.tracesText)+'</p>':"")+
  '<button data-choice="'+i+'">Vybrat neověřený návrh</button> <a href="'+urlSafe(m.sourceUrl)+'" rel="noopener noreferrer" target="_blank">Zdroj</a></div>').join("");
  document.querySelectorAll("[data-choice]").forEach(b=>b.onclick=()=>edit(found[Number(b.dataset.choice)]));
 }catch(e){el("results").innerHTML='<div class="alert error">'+escapeHtml(e.message)+' — můžeš údaje zadat ručně.</div>'}
 finally{b.disabled=false}
}
function edit(m){
 selected=m||{ean:"",name:el("lookup").value.trim(),brand:"",quantity:"",ingredients:"",contains:[],possibleTraces:[],tracesText:"",sourceUrl:"",sourceStatus:"manual_unverified"};
 photo=null;pendingSave=null;
 const hasLabel=Boolean(m?.labelImageUrl);
 const body='<div class="card"><h2>Kontrola a uložení etikety</h2>'+
 '<div class="alert">Návrh není ověřený. Před uložením zkontroluj přesný produkt, všechny alergeny a možná upozornění „může obsahovat“.</div>'+
 '<div class="grid"><div><label>Název *</label><input id="name" value="'+escapeHtml(selected.name)+'"></div><div><label>EAN</label><input id="ean" value="'+escapeHtml(selected.ean)+'" inputmode="numeric"></div><div><label>Značka</label><input id="brand" value="'+escapeHtml(selected.brand)+'"></div><div><label>Varianta / gramáž</label><input id="qty" value="'+escapeHtml(selected.quantity)+'"></div></div>'+
 '<label>Fotografie tvého balení (pro ověření)</label><input id="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"><button id="ocr" type="button" class="secondary">Přečíst fotografii (OCR)</button><p id="ocrmsg" class="muted">OCR funguje lokálně a je pouze návrhem.</p>'+
 '<label>Složení (zkontroluj celý text)</label><textarea id="ingredients">'+escapeHtml(selected.ingredients)+'</textarea>'+
 '<label>Možné stopy – přesný text z obalu</label><textarea id="traces">'+escapeHtml(selected.tracesText)+'</textarea>'+
 '<label>Zdroj</label><input id="source" type="url" value="'+escapeHtml(selected.sourceUrl)+'" placeholder="https://…">'+
 '<label>Stav údajů</label><select id="status"><option value="unverified">Neověřeno – doporučené</option><option value="verified">Ověřeno mnou podle fotografie mého balení</option><option value="conflict">Rozpor ve zdrojích</option></select></div>'+
 '<div class="card"><h2>Alergeny a možné stopy</h2><button id="suggest" class="secondary">Navrhnout z textu (nutná kontrola)</button><p class="muted">Každou skupinu ověř. „Neuvedeno“ neznamená „neobsahuje“.</p>'+
 ALL.map(([code,label])=>'<div class="a"><span>'+escapeHtml(label)+'</span><select data-code="'+code+'"><option value="unknown">Neuvedeno / neověřeno</option><option value="contains" '+(selected.contains.includes(code)?"selected":"")+'>Obsahuje</option><option value="both">Obsahuje i možné stopy</option><option value="may_contain" '+(!selected.contains.includes(code)&&selected.possibleTraces.includes(code)?"selected":"")+'>Možné stopy</option></select></div>').join("")+'</div>'+
 '<div class="card"><label><input id="confirmed" type="checkbox"> Potvrzuji, že jsem údaje porovnal(a) s konkrétním obalem nebo zdrojem. Ukládá se nová verze; staré záznamy zůstanou zachovány.</label><button id="save">Uložit výrobek a verzi etikety</button></div>';
 el("editor").innerHTML=body;document.querySelectorAll("[data-code]").forEach(s=>{if(selected.contains.includes(s.dataset.code)&&selected.possibleTraces.includes(s.dataset.code))s.value="both"});
 el("editor").scrollIntoView({behavior:"smooth",block:"start"});
 el("photo").onchange=e=>photo=e.target.files?.[0]||null;
 el("ocr").onclick=runOcr;
 el("suggest").onclick=suggest;
 el("save").onclick=save;
}

const WORDS={
 gluten:["lepek","pšeni","žitn","ječn","oves","špald","wheat","barley","rye"],crustaceans:["korýš","krevet","humr","krab"],eggs:["vejce","vaječ","žloutek","bílek","eggs"],fish:["ryb","losos","tuňák","treska"],
 peanuts:["arašíd","podzemnice","peanut"],soy:["soja","sója","sój","sojov","soy"],milk:["mlék","mléč","smetan","máslo","syrovátk","laktóz","sýr","kasein","milk"],nuts:["ořech","mandl","pistáci","kešu","lískov","almond","hazelnut"],
 celery:["celer"],mustard:["hořčic","hořčič","mustard"],sesame:["sezam","sesame"],sulphites:["siřičit","sulphit","sulfit","e220","e221","e222","e223","e224","e226","e227","e228"],lupin:["lupin","vlčí bob"],molluscs:["měkkýš","ústřic","chobotnic","sépie","slávk"]};
function suggestStates(ingredients,tracesText){
 const text=String(ingredients||"").toLocaleLowerCase("cs-CZ");
 const marker=/(?:může|mohou|muze|mohou)\s+obsahovat|may\s+contain|(?:možné|mozné|mozne)\s+stopy|stopy\s+(?:alergenů|mléka|ořechů|arašídů|sóji|lepku)/i.exec(text);
 const main=marker?text.slice(0,marker.index):text;
 const traces=((marker?text.slice(marker.index):"")+" "+String(tracesText||"")).toLocaleLowerCase("cs-CZ");
 return Object.fromEntries(ALL.map(([code])=>{const words=WORDS[code]||[];const c=words.some(w=>main.includes(w)),t=words.some(w=>traces.includes(w));return [code,c&&t?"both":c?"contains":t?"may_contain":"unknown"]}));
}
function suggest(){
 const states=suggestStates(el("ingredients").value,el("traces").value);
 document.querySelectorAll("[data-code]").forEach(s=>s.value=states[s.dataset.code]);
 msg("Návrh oddělil složení a možné stopy. Porovnej jej s etiketou; rozpoznání slov nemusí být úplné.");
}
async function runOcr(){
 if(!photo)return msg("Nejdřív nahraj fotku svého balení.",true);
 el("ocr").disabled=true;el("ocrmsg").textContent="Načítá se lokální OCR (bez placené AI)…";
 try{
  if(!window.Tesseract){await new Promise((ok,no)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";s.onload=ok;s.onerror=no;document.head.appendChild(s)})}
  const target=el("ingredients"),image=photo;const r=await Tesseract.recognize(image,"ces+eng");if(!target.isConnected||photo!==image)return;target.value=r.data.text;
  el("ocrmsg").textContent="Text vložen. Porovnej jej s fotografií; možné stopy zkontroluj zvlášť.";
 }catch(e){if(el("ocrmsg"))el("ocrmsg").textContent="OCR se nepodařilo; údaje opiš ručně."}finally{if(el("ocr"))el("ocr").disabled=false}
}

function validEan(ean){
 if(!ean)return true;if(!/^(?:[0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$/.test(ean))return false;
 const digits=[...ean].map(Number),check=digits.pop();let sum=0;
 digits.reverse().forEach((d,i)=>sum+=d*(i%2===0?3:1));return (10-sum%10)%10===check;
}
function collectFindings(){
 return [...document.querySelectorAll("[data-code]")].flatMap(s=>
  (s.value==="both"?["contains","may_contain"]:s.value==="unknown"?[]:[s.value]).map(type=>({allergen_code:s.dataset.code,finding_type:type})));
}
async function completePendingSave(){
 const row=await api("/rest/v1/rpc/save_label_version",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(pendingSave)});
 sessionStorage.removeItem("etikety_pending_save");pendingSave=null;
 msg("Výrobek, etiketa i alergeny byly společně uloženy.");await saved(row.product_id);
}
async function save(){
 const b=el("save");if(working)return;
 if(pendingSave){working=true;b.disabled=true;try{await completePendingSave()}catch(e){fail(e)}finally{working=false;b.disabled=false}return}
 const rawEan=el("ean").value.trim(),ean=rawEan.replace(/\s/g,""),name=el("name").value.trim();
 if(!name)return msg("Vyplň název výrobku.",true);
 if(!validEan(ean))return msg("Zkontroluj celý EAN včetně kontrolní číslice.",true);
 if(!el("confirmed").checked)return msg("Potvrď kontrolu etikety.",true);
 if(el("status").value==="verified"&&!photo)return msg("Ověřený stav vyžaduje fotografii vlastního obalu.",true);
 if(photo&&(photo.size>10485760||!["image/jpeg","image/png","image/webp"].includes(photo.type)))return msg("Fotografie musí být JPG, PNG nebo WEBP do 10 MB.",true);
 if(el("source").value.trim()&&!urlSafe(el("source").value.trim()))return msg("Zadej platnou internetovou adresu zdroje.",true);
 working=true;b.disabled=true;
 try{
  let id=selected?.productId||null,create=false;
  if(!id&&ean){const existing=await api("/rest/v1/products?select=id,name&ean=eq."+encodeURIComponent(ean));if(existing.length>1)throw Error("Více výrobků má stejný EAN. Vyber přesný uložený výrobek.");if(existing.length){if(!confirm("Výrobek s tímto EAN již existuje: "+existing[0].name+". Přidat novou verzi etikety?"))return;id=existing[0].id}}
  if(!id){id=crypto.randomUUID();create=true}
  let path=null;
  if(photo){path=id+"/"+crypto.randomUUID()+"."+photo.type.split("/")[1].replace("jpeg","jpg");await api("/storage/v1/object/labels/"+path,{method:"POST",headers:{"Content-Type":photo.type,"x-upsert":"false"},body:photo})}
  pendingSave={p_request:crypto.randomUUID(),p_product:{id,create,name,ean,brand:el("brand").value.trim(),variant:el("qty").value.trim()},p_label:{ingredients:el("ingredients").value.trim(),note:el("traces").value.trim(),source:el("source").value.trim(),verification_status:el("status").value,photo_path:path},p_findings:collectFindings()};
  sessionStorage.setItem("etikety_pending_save",JSON.stringify({user_id:session.user.id,payload:pendingSave}));
  await completePendingSave();
 }catch(e){if(e.status===400){pendingSave=null;sessionStorage.removeItem("etikety_pending_save")}fail(e);if(pendingSave){b.textContent="Znovu ověřit stejné uložení";msg("Uložení nebylo potvrzeno: "+e.message+". Další stisk odešle stejné potvrzení a nevytvoří druhou verzi. Po obnovení stránky lze uložení znovu ověřit.",true)}}
 finally{working=false;b.disabled=false}
}
function recoveryPending(){
 let cached;try{cached=JSON.parse(sessionStorage.getItem("etikety_pending_save")||"null")}catch{}
 if(!cached)return false;
 if(cached.user_id!==session.user.id){sessionStorage.removeItem("etikety_pending_save");return false}
 pendingSave=cached.payload;
 chrome("Ověřit předchozí uložení",'<div class="card"><p>Předchozí uložení nemá potvrzený výsledek. Znovu ověříme stejné potvrzení bez vytvoření další verze.</p><button id="retry-save">Ověřit a dokončit uložení</button></div>');
 el("retry-save").onclick=async()=>{const b=el("retry-save");b.disabled=true;try{await completePendingSave()}catch(e){fail(e)}finally{b.disabled=false}};return true;
}
async function exportCsv(){
 const b=el("export");if(b)b.disabled=true;
 try{
  const [products,versions,allergens]=await Promise.all([
    api("/rest/v1/products?select=id,name,brand,variant,ean&order=name.asc&limit=500"),
    api("/rest/v1/label_versions?select=id,product_id,verification_status,created_at,source,source_url,note&order=created_at.desc&limit=3000"),
    api("/rest/v1/allergen_findings?select=label_version_id,allergen_code,finding_type&limit=10000")
  ]);
  if(products.length>=500||versions.length>=1000||allergens.length>=1000)throw Error("Evidence je příliš velká pro jednorázový export. Obrať se na majitele.");
  const latest=new Map();versions.forEach(v=>{if(!latest.has(v.product_id))latest.set(v.product_id,v)});
  const rows=[["EAN","Výrobek","Značka","Varianta","Obsahuje","Možné stopy","Přesný text stop","Stav","Datum záznamu","Zdroj"]];
  for(const p of products){
   const v=latest.get(p.id);
   const findings=v?allergens.filter(a=>a.label_version_id===v.id):[];
   const contains=findings.filter(a=>a.finding_type==="contains").map(a=>allergenName(a.allergen_code)).join(", ")||"ÚDAJ NENALEZEN";
   const traces=findings.filter(a=>a.finding_type==="may_contain").map(a=>allergenName(a.allergen_code)).join(", ")||"ÚDAJ NENALEZEN — NEZNAMENÁ BEZ STOP";
   rows.push([p.ean||"",p.name,p.brand||"",p.variant||"",contains,traces,v?.note||"",v?.verification_status||"Není etiketa",v?.created_at?new Date(v.created_at).toLocaleDateString("cs-CZ"):"",v?.source_url||v?.source||""]);
  }
  const cell=v=>{let t=String(v??"");if(/^[\s]*[=+\-@]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"'};
  const data="\uFEFF"+rows.map(row=>row.map(cell).join(";")).join("\r\n");
  const blob=new Blob([data],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);const link=document.createElement("a");
  link.href=url;link.download="etikety-alergeny-"+new Date().toISOString().slice(0,10)+".csv";
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  msg("Export hotový. Neověřené údaje nejsou potvrzením bezpečnosti výrobku.");
 }catch(e){fail(e)}finally{if(b)b.disabled=false}
}

async function saved(focus){
 chrome("Uložené výrobky",'<div class="row"><button id="export" class="secondary">Export do Excelu (CSV)</button></div><div id="stored" class="card">Načítání…</div>',"saved");
 el("export").onclick=exportCsv;
 try{
  const list=await api("/rest/v1/products?select=id,name,brand,ean,variant&order=name.asc&limit=500");
  el("stored").innerHTML=list.length?list.map(p=>'<div class="choice"><b>'+escapeHtml(p.name)+'</b><p class="muted">'+escapeHtml([p.brand,p.variant,p.ean].filter(Boolean).join(" · "))+'</p><button data-p="'+escapeHtml(p.id)+'" class="secondary">Zobrazit alergeny a historii</button></div>').join(""):"Zatím nejsou uložené výrobky.";
  document.querySelectorAll("[data-p]").forEach(b=>b.onclick=()=>detail(b.dataset.p));
  if(focus)await detail(focus);
 }catch(e){el("stored").innerHTML='<p class="alert error">'+escapeHtml(e.message)+'</p>'}
}
async function detail(id){
 try{
  const [products,versions]=await Promise.all([
   api("/rest/v1/products?select=id,name,brand,variant,ean&id=eq."+encodeURIComponent(id)),
   api("/rest/v1/label_versions?select=*&product_id=eq."+encodeURIComponent(id)+"&order=created_at.desc")
  ]);
  const p=products[0],v=versions[0];if(!p)throw Error("Výrobek neexistuje.");
  let finds=[];if(v)finds=await api("/rest/v1/allergen_findings?select=allergen_code,finding_type&label_version_id=eq."+encodeURIComponent(v.id));
  const state=Object.fromEntries(finds.map(f=>[f.allergen_code,f.finding_type]));
  let body='<div class="card"><h2>'+escapeHtml(p.name)+'</h2><p class="muted">'+escapeHtml([p.brand,p.variant,p.ean].filter(Boolean).join(" · "))+'</p><p>Počet verzí etiket: '+versions.length+'</p>';
  if(v){
   body+='<p>Stav nejnovější verze: <b>'+escapeHtml(v.verification_status)+'</b> · '+escapeHtml(new Date(v.created_at).toLocaleString("cs-CZ"))+'</p><h3>Složení</h3><p style="white-space:pre-wrap">'+escapeHtml(v.ingredients||v.ingredients_text||"Údaj nenalezen")+'</p>'+
   '<h3>Obsahuje</h3>'+(finds.some(f=>f.finding_type==="contains")?finds.filter(f=>f.finding_type==="contains").map(f=>'<span class="pill red">'+escapeHtml(allergenName(f.allergen_code))+'</span>').join(""):"<p>Údaj nenalezen – nezaručuje nepřítomnost alergenů.</p>")+
   '<h3>Možné stopy</h3>'+(finds.some(f=>f.finding_type==="may_contain")?finds.filter(f=>f.finding_type==="may_contain").map(f=>'<span class="pill gold">'+escapeHtml(allergenName(f.allergen_code))+'</span>').join(""):"<p>Údaj o stopách nenalezen – neznamená bez stop.</p>")+
   (v.note?'<p>Upozornění výrobce: '+escapeHtml(v.note)+'</p>':"")+
   '<h3>Neověřené skupiny</h3>'+ALL.filter(x=>!state[x[0]]).map(x=>'<span class="pill gray">'+escapeHtml(x[1])+'</span>').join("");
   if(v.source_url||v.source)body+='<p><a href="'+urlSafe(v.source_url||v.source)+'" target="_blank" rel="noopener noreferrer">Původní zdroj</a></p>';
   if(v.photo_path){
    const s=await api("/storage/v1/object/sign/labels/"+v.photo_path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expiresIn:600})}).catch(()=>null);
    if(s?.signedURL||s?.signedUrl){const link=s.signedURL||s.signedUrl;const full=link.startsWith("http")?link:API+"/storage/v1"+link;body+='<p><a href="'+urlSafe(full)+'" target="_blank" rel="noopener noreferrer">Otevřít fotografii konkrétní etikety</a></p>'}
   }
  }else body+='<p class="alert">Není zaznamenaná etiketa. Všechny alergeny a stopy jsou neověřené.</p>';
  body+='<p><button id="new-version" class="secondary">Přidat novou etiketu</button></p></div><div class="card"><h3>Historie</h3>'+versions.map(v=>'<p>'+escapeHtml(new Date(v.created_at).toLocaleString("cs-CZ"))+' · '+escapeHtml(v.verification_status)+'</p>').join("")+'</div>';
  chrome("Detail výrobku",body,"saved");
  const newv=el("new-version");if(newv)newv.onclick=()=>{home();edit({productId:p.id,name:p.name,ean:p.ean||"",brand:p.brand||"",quantity:p.variant||"",ingredients:"",contains:[],possibleTraces:[],tracesText:"",sourceUrl:""});};
 }catch(e){fail(e)}
}
function startScanner(){
 const holder=el("camera");
 if(!window.BarcodeDetector||!navigator.mediaDevices){holder.innerHTML='<p class="alert">Tento prohlížeč neumí skenovat. EAN zadej ručně.</p>';return}
 holder.innerHTML='<video id="cam" autoplay playsinline muted style="width:100%;max-width:360px"></video><button id="stop" class="secondary">Zavřít kameru</button>';
 const stop=()=>{if(scanner){clearInterval(scanner.timer);scanner.stream.getTracks().forEach(t=>t.stop());scanner=null}holder.innerHTML=""};
 el("stop").onclick=stop;
 navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}}).then(async stream=>{
  const v=el("cam");if(!v){stream.getTracks().forEach(t=>t.stop());return}v.srcObject=stream;const det=new BarcodeDetector({formats:["ean_13","ean_8","upc_a","upc_e"]});
  scanner={stream,timer:setInterval(async()=>{try{const res=await det.detect(v);if(res.length){el("lookup").value=res[0].rawValue;stop();search()}}catch{}},550)};
 }).catch(e=>{stop();msg("Kamera není dostupná.",true)});
}

async function employees(){
 if(profile?.role!=="owner")return msg("Správa zaměstnanců je dostupná jen majiteli.",true);
 chrome("Zaměstnanci",'<div class="card"><form id="staff-form"><label for="staff-email">E-mail zaměstnance</label><input id="staff-email" type="email" required><div class="row"><button id="invite" type="submit">Vytvořit jednorázovou pozvánku</button><button id="recover-staff" type="button" class="secondary">Obnovit přístup zaměstnance</button></div></form><p class="muted">Bez placené e-mailové služby. Tajný odkaz zkopíruješ a předáš pouze příslušnému zaměstnanci.</p><div id="staff-result"></div></div><div class="card" id="staff-list">Načítání…</div>',"staff");
 async function action(kind){
  if(!el("staff-form").reportValidity())return;
  const invite=el("invite"),recover=el("recover-staff");invite.disabled=recover.disabled=true;el("staff-result").textContent="Vytvářím jednorázový odkaz…";
  try{
   const r=await api("/functions/v1/etikety-app",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:kind,email:el("staff-email").value.trim().toLowerCase()})});
   const link=kind==="invite"?r.invite_url:r.recovery_url;
   if(!link)throw Error("Server nevrátil jednorázový odkaz.");
   el("staff-result").innerHTML='<p class="alert">Odkaz je připraven. Předávej jej pouze danému zaměstnanci. Platí jednou a může vypršet.</p><button id="copy-staff" class="secondary">Kopírovat tajný odkaz</button>';
   el("copy-staff").onclick=async()=>{try{await navigator.clipboard.writeText(link);msg("Odkaz zkopírován.")}catch{msg("Kopírování nebylo povoleno. Povol pro tuto aplikaci přístup ke schránce.",true)}};
   await list();
  }catch(e){el("staff-result").textContent="";fail(e)}finally{invite.disabled=recover.disabled=false}
 }
 async function list(){try{const rows=await api("/rest/v1/profiles?select=email,role&order=created_at.asc");el("staff-list").innerHTML='<h3>Účty aplikace</h3>'+rows.map(p=>'<p>'+escapeHtml(p.email)+' · '+(p.role==="owner"?"Majitel":"Zaměstnanec")+'</p>').join("")}catch(e){el("staff-list").textContent=e.message}}
 el("staff-form").onsubmit=e=>{e.preventDefault();action("invite")};el("recover-staff").onclick=()=>action("recovery");await list();
}

(async()=>{try{
 const params=new URLSearchParams(location.hash.slice(1));
 if(params.get("access_token")){
  history.replaceState(null,"",APP);store({access_token:params.get("access_token"),refresh_token:params.get("refresh_token"),expires_in:Number(params.get("expires_in")||3600)});
  const user=await api("/auth/v1/user");session.user=user;store(session);if(["recovery","invite"].includes(params.get("type")))resetPassword();else if(await authenticate()){if(!recoveryPending())home()}return;
 }
 try{session=JSON.parse(localStorage.getItem("etikety_session")||"null")}catch{}
 if(!session){login();return}
 if(await authenticate()){if(!recoveryPending())home()};
}catch(e){session=null;localStorage.removeItem("etikety_session");login();fail(e)}})();
