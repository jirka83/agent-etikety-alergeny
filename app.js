
"use strict";
const API="https://nseyvrzfaqqhqbxovbmd.supabase.co", KEY="sb_publishable_1GSNX79G31T5OkafLHok3g_BFnAhg-5", APP=new URL("./",location.href).pathname;
const PUBLIC_APP_URL="https://jirka83.github.io/agent-etikety-alergeny/";
const ALL=[
["gluten","1. Obiloviny obsahující lepek"],["crustaceans","2. Korýši"],["eggs","3. Vejce"],
["fish","4. Ryby"],["peanuts","5. Arašídy"],["soy","6. Sója"],["milk","7. Mléko"],
["nuts","8. Skořápkové plody"],["celery","9. Celer"],["mustard","10. Hořčice"],
["sesame","11. Sezam"],["sulphites","12. Oxid siřičitý a siřičitany"],["lupin","13. Vlčí bob"],["molluscs","14. Měkkýši"]];
let session=null,profile=null,found=[],selected=null,photo=null,working=false,scanner=null,pendingSave=null;
const el=id=>document.getElementById(id);
const escapeHtml=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const urlSafe=x=>{try{const u=new URL(x);return ["https:","http:"].includes(u.protocol)?escapeHtml(u.href):""}catch{return ""}};
const statusName=k=>({unverified:"Neověřeno",verified:"Ručně ověřeno",conflict:"Rozpor ve zdrojích"}[k]||"Neověřeno");
const allergenName=k=>ALL.find(a=>a[0]===k)?.[1]||k;
function msg(s,bad=false){el("alert").innerHTML='<p class="alert '+(bad?"error":"ok")+'" role="status">'+escapeHtml(s)+'</p>';setTimeout(()=>{if(el("alert"))el("alert").innerHTML=""},11000)}
function show(html){stopScanner();el("app").innerHTML=html}
function fail(e){msg(e?.message||String(e),true)}

async function api(path,options={},requiresLogin=true){
 const headers={"apikey":KEY,...(options.headers||{})};
 if(requiresLogin){await validSession();if(!session)throw Error("Je nutné přihlášení.");headers.Authorization="Bearer "+session.access_token}
 const res=await fetch(API+path,{...options,headers});
 const raw=await res.text();let data=null;try{data=JSON.parse(raw)}catch{data=raw}
 if(!res.ok){const raw=data?.message||data?.msg||data?.error_description||data?.error||"Chyba "+res.status;const e=Error(res.status===429?"Služba dočasně omezila počet požadavků. U obnovy hesla použij nejnovější platný e-mail nebo zkus později.":raw==="Invalid login credentials"?"E-mail nebo heslo není správné.":raw);e.status=res.status;throw e}
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
 el("reset").onclick=async()=>{if(!el("mail").reportValidity())return;try{await api("/auth/v1/recover?redirect_to="+encodeURIComponent(PUBLIC_APP_URL),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:el("mail").value.trim()})},false);msg("Pokud účet existuje, přijde e-mail pro nastavení hesla. Otevři nejnovější zprávu; starší odkazy už nemusí platit.")}catch(e){fail(e)}};
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
 '<div class="card"><label>Název výrobku nebo EAN</label><div class="row"><input id="lookup" class="grow" placeholder="Zadej značku a název nebo čárový kód" autofocus><button id="find">Najít etiketu</button><button id="scan" class="secondary">Skenovat EAN</button><button id="photo-ean" class="secondary">Vyfotit EAN</button><button id="manual" class="secondary">Zadat ručně</button></div><div id="camera"></div><p class="muted">Jedním hledáním prohledáš uložené etikety, Open Food Facts (ODbL) a výběr USDA FoodData Central (CC0).</p></div>'+catalogHelp()+'<div id="results"></div><div id="editor"></div>');
 el("find").onclick=search;
 el("lookup").onkeydown=e=>{if(e.key==="Enter")search()};
 el("scan").onclick=startScanner;el("photo-ean").onclick=photographEan;
 el("manual").onclick=()=>edit(null);el("archive-search").onclick=searchArchive;
}
const catalogFiles={usda:"usda-2026-10.json",archive:"foodrepo-2018.json"};
const catalogLoads=new Map();
let catalogSearchId=0;
const catalogTimeout=ms=>{if(typeof AbortSignal.timeout==="function")return AbortSignal.timeout(ms);const controller=new AbortController();setTimeout(()=>controller.abort(),ms);return controller.signal};
const canonicalGTIN=code=>String(code).padStart(14,"0");
const searchWords=text=>String(text||"").normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
function catalogTerm(input){
 const text=String(input||"").trim().replace(/\s+/g," "),digits=text.replace(/\s/g,"");
 if(text.length<3||text.length>100)throw Error("Zadej 3 až 100 znaků názvu nebo celý EAN.");
 if(/^\d+$/.test(digits)){
  if(!validEan(digits)||/^0+$/.test(digits))throw Error("Zkontroluj celý EAN včetně kontrolní číslice.");
  return {term:digits,exact:true};
 }
 if(!searchWords(text))throw Error("Zadej název výrobku.");
 return {term:text,exact:false};
}
function catalogMatches(rows,query,limit=6){
 if(query.exact){const key=canonicalGTIN(query.term);return rows.filter(r=>canonicalGTIN(r[0])===key).slice(0,limit)}
 const phrase=searchWords(query.term),tokens=phrase.split(" ");
 return rows.map(r=>{const name=searchWords(r[1]),brand=searchWords(r[2]),combined=name+" "+brand;
  if(!tokens.every(w=>combined.includes(w)))return null;
  return {r,score:(name===phrase?8:0)+(brand===phrase?6:0)+(name.includes(phrase)?4:0)+(combined.includes(phrase)?2:0)};
 }).filter(Boolean).sort((a,b)=>b.score-a.score||a.r[1].localeCompare(b.r[1],"cs")).slice(0,limit).map(x=>x.r);
}
async function loadCatalog(kind){
 if(!catalogLoads.has(kind)){
  const pending=fetch(new URL(catalogFiles[kind],location.href),{credentials:"omit",signal:catalogTimeout(12000)})
   .then(async response=>{if(!response.ok)throw Error("Katalog není dostupný.");const data=await response.json();if(data.schema!==1||!Array.isArray(data.rows))throw Error("Katalog se nepodařilo načíst.");return data.rows})
   .catch(e=>{catalogLoads.delete(kind);throw e});
  catalogLoads.set(kind,pending);
 }
 return catalogLoads.get(kind);
}
function splitDeclaredTraces(text){
 const match=/\bmay\s+(?:also\s+)?contain\b/i.exec(text);
 return match?{ingredients:text.slice(0,match.index).trim(),tracesText:text.slice(match.index).trim()}:{ingredients:text,tracesText:""};
}
function usdaSearchUrl(term=""){
 const u=new URL("https://fdc.nal.usda.gov/food-search/");u.searchParams.set("type","Branded");if(term)u.searchParams.set("query",term);return u.href;
}
function usdaMatch(r,query){
 return {ean:query.exact?query.term:r[0],name:r[1],brand:r[2],quantity:r[3],...splitDeclaredTraces(r[4]),contains:[],possibleTraces:[],sourceStatus:"usda_unverified",sourceUrl:usdaSearchUrl(r[0]),fdcId:r[6],market:r[5]==="United States"?"USA":r[5]==="New Zealand"?"Nový Zéland":r[5],snapshot:"29. 10. 2026",updated:r[7]};
}
async function lookupSaved(query){
 const p=new URLSearchParams({select:"id,name,brand,variant,ean",order:"name.asc",limit:"30"});
 if(query.exact){
  const plain=query.term.replace(/^0+/,"");const variants=[...new Set([query.term,...[8,12,13,14].filter(n=>n>=plain.length).map(n=>plain.padStart(n,"0"))])];
  p.set("ean","in.("+variants.join(",")+")");
 }else{
  const words=query.term.replace(/[^\p{L}\p{N} ]/gu," ").trim().split(/\s+/).sort((a,b)=>b.length-a.length);
  if(!words[0])return [];
  const atom=words[0];p.set("or","(name.ilike.*"+atom+"*,brand.ilike.*"+atom+"*)");
 }
 const rows=await api("/rest/v1/products?"+p,{signal:catalogTimeout(10000)});
 return rows.filter(r=>query.exact?Boolean(r.ean)&&canonicalGTIN(r.ean)===canonicalGTIN(query.term):searchWords(query.term).split(" ").every(w=>searchWords(r.name+" "+(r.brand||"")).includes(w))).slice(0,6);
}
function catalogLink(url,label){return '<a href="'+urlSafe(url)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(label)+'</a>'}
function additionalCatalogLinks(term=""){
 return '<ul><li>'+catalogLink(usdaSearchUrl(term),"Celý katalog USDA")+' – značkové výrobky hlavně z USA a Nového Zélandu.</li><li>'+catalogLink("https://www.ferpotravina.cz/databaze-potravin","FÉR potravina")+' – české etikety k ručnímu dohledání.</li><li>'+catalogLink("https://www.gs1cz.org/standardy-sluzby/nastroje/verified-by-gs1/","Verified by GS1")+' – ověření identity EAN, nikoli složení.</li>'+(term?'<li>'+catalogLink("https://www.google.com/search?q="+encodeURIComponent(term+" výrobce etiketa složení alergeny"),"Vyhledat etiketu výrobce")+' – ověř variantu a EAN přímo na dokumentu.</li>':'')+'</ul>';
}
function catalogHelp(){
 return '<details class="card"><summary>Další bezplatné zdroje</summary><div id="catalog-links">'+additionalCatalogLinks()+'</div><p class="muted">FoodRepo – švýcarský archiv z roku 2018. Historické složení je pouze k porovnání; z archivu se etiketa nepředvyplňuje.</p><button type="button" id="archive-search" class="secondary">Prohledat archiv FoodRepo</button><div id="archive-results" aria-live="polite"></div></details>';
}
async function searchArchive(){
 const b=el("archive-search"),target=el("archive-results"),request=catalogSearchId;let query;
 try{query=catalogTerm(el("lookup").value)}catch(e){target.textContent=e.message;return}
 b.disabled=true;target.textContent="Hledám v historickém archivu…";
 try{const rows=catalogMatches(await loadCatalog("archive"),query);if(!target.isConnected||request!==catalogSearchId)return;
  target.innerHTML=rows.length?'<p><b>FoodRepo – historické údaje z 8. 1. 2018</b> · '+catalogLink("https://github.com/digitalepidemiologylab/foodrepo_api","Zdroj, CC BY 4.0")+'</p>'+rows.map(r=>'<article class="card"><h3>'+escapeHtml(r[1])+'</h3><p class="muted">EAN '+escapeHtml(r[0])+' · '+escapeHtml(r[3])+'</p><p>'+escapeHtml(r[4])+'</p></article>').join(""):'<p>V archivu pro tento dotaz není nalezena čitelná etiketa.</p>';
 }catch{if(target.isConnected&&request===catalogSearchId)target.textContent="Archiv se nepodařilo načíst. Zkus to znovu."}finally{b.disabled=false}
}
function renderCatalogResults(query,states,target){
 const {saved:own,off,usda}=states;
 const ongoing=Object.values(states).some(x=>x.state==="pending");
 const missing=Object.entries(states).filter(([,x])=>x.state==="failed").map(([k])=>({saved:"Uložené etikety",off:"Open Food Facts",usda:"USDA"}[k]));
 found=[...off.rows,...usda.rows];
 const count=own.rows.length+found.length;
 const card=(m,i)=>'<article class="card"><h3>'+escapeHtml(m.name)+'</h3><p class="muted">'+escapeHtml([m.brand,m.quantity,"EAN "+m.ean].filter(Boolean).join(" · "))+'</p>'+
  (m.market?'<p class="muted">Trh: '+escapeHtml(m.market)+' · export USDA '+escapeHtml(m.snapshot)+(m.updated?' · změna záznamu '+escapeHtml(m.updated):'')+' · FDC '+escapeHtml(m.fdcId)+'</p>':'')+
  (m.labelImageUrl&&urlSafe(m.labelImageUrl)?'<a href="'+urlSafe(m.labelImageUrl)+'" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="'+urlSafe(m.labelImageUrl)+'" alt="Fotografie složení" style="width:100%;max-height:220px;object-fit:contain"></a>':'')+
  (m.ingredients?'<details><summary>Zobrazit složení</summary><p>'+escapeHtml(m.ingredients)+'</p></details>':'')+
  '<p><b>Obsahuje (neověřeno):</b> '+(m.contains.length?escapeHtml(m.contains.map(allergenName).join(", ")):"Samostatný seznam není k dispozici. Zkontroluj složení.")+'</p>'+
  '<p><b>Možné stopy (neověřeno):</b> '+(m.possibleTraces.length?escapeHtml(m.possibleTraces.map(allergenName).join(", ")):m.tracesText?"Viz upozornění výrobce níže.":"Údaj nenalezen – neznamená bez stop")+'</p>'+
  (m.tracesText?'<p>'+escapeHtml(m.tracesText)+'</p>':'')+
  '<button type="button" data-choice="'+i+'">Vybrat neověřený návrh</button> '+catalogLink(m.sourceUrl,m.market?"Vyhledat EAN v USDA":"Karta Open Food Facts")+'</article>';
 target.innerHTML='<p role="status">'+(ongoing?(count?"Zatím nalezeno: "+count+". Ještě prohledávám další zdroje…":"Hledám v bezplatných katalozích…"):"Nalezené záznamy: "+count)+'</p>'+
  (missing.length?'<p class="alert">Nepodařilo se prohledat: '+escapeHtml(missing.join(", "))+'. Výsledky z dostupných zdrojů zůstávají zobrazené.</p>':'')+
  (own.rows.length?'<h3>Vaše uložené výrobky</h3>'+own.rows.map((r,i)=>'<div class="card"><b>'+escapeHtml(r.name)+'</b><p class="muted">'+escapeHtml([r.brand,r.variant,r.ean&&"EAN "+r.ean].filter(Boolean).join(" · "))+'</p><button type="button" data-own="'+i+'">Otevřít uloženou etiketu</button></div>').join(""):'')+
  (found.length?'<p class="muted">Výsledky jsou oddělené podle zdroje. Porovnej EAN, gramáž a složení se svým obalem.</p>':'')+
  (off.rows.length?'<h3>Open Food Facts</h3>'+off.rows.map(card).join(""):'')+
  (usda.rows.length?'<h3>USDA FoodData Central</h3>'+usda.rows.map((m,i)=>card(m,off.rows.length+i)).join(""):'')+
  (!ongoing&&!count?'<p class="card">'+(missing.length?"V dostupných zdrojích se výrobek nenašel.":"Výrobek v prohledaných katalozích nenalezen.")+' Použij fotografii nebo ruční zadání. '+catalogLink("https://www.google.com/search?q="+encodeURIComponent(query.term+" výrobce etiketa složení alergeny"),"Dohledat etiketu výrobce")+'</p>':'');
 target.querySelectorAll("[data-choice]").forEach(b=>{const item=found[Number(b.dataset.choice)];b.onclick=()=>edit(item)});
 target.querySelectorAll("[data-own]").forEach(b=>{const item=own.rows[Number(b.dataset.own)];b.onclick=()=>detail(item.id)});
}
async function search(){
 let query;try{query=catalogTerm(el("lookup").value)}catch(e){return fail(e)}
 const b=el("find"),target=el("results"),request=++catalogSearchId;
 stopScanner();b.disabled=true;el("editor").innerHTML="";el("archive-results").textContent="";el("catalog-links").innerHTML=additionalCatalogLinks(query.term);
 const states=Object.fromEntries(["saved","off","usda"].map(k=>[k,{state:"pending",rows:[]}]));
 const current=()=>target.isConnected&&request===catalogSearchId;
 const render=()=>{if(current())renderCatalogResults(query,states,target)};
 const run=async(k,fn)=>{try{states[k]={state:"done",rows:await fn()}}catch{states[k]={state:"failed",rows:[]}}render()};
 render();
 try{
  await validSession();if(!session)throw Error("Přihlas se znovu.");if(!current())return;
  await Promise.all([
   run("saved",()=>lookupSaved(query)),
   run("off",async()=>{try{const j=await api("/functions/v1/etikety-lookup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({term:query.term}),signal:catalogTimeout(19000)});if(!Array.isArray(j.matches))throw Error("Katalog nevrátil výsledky.");return j.matches}catch(e){if(query.exact&&e.status===502&&e.message==="Katalog je nedostupný: 404")return [];throw e}}),
   run("usda",async()=>catalogMatches(await loadCatalog("usda"),query).map(r=>usdaMatch(r,query)))
  ]);
 }catch(e){if(current())target.textContent=e.message}finally{if(current())b.disabled=false}
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
   rows.push([p.ean||"",p.name,p.brand||"",p.variant||"",contains,traces,v?.note||"",v?statusName(v.verification_status):"Není etiketa",v?.created_at?new Date(v.created_at).toLocaleDateString("cs-CZ"):"",v?.source_url||v?.source||""]);
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
async function detail(id,versionId=null){
 try{
  const [products,versions]=await Promise.all([
   api("/rest/v1/products?select=id,name,brand,variant,ean&id=eq."+encodeURIComponent(id)),
   api("/rest/v1/label_versions?select=*&product_id=eq."+encodeURIComponent(id)+"&order=created_at.desc")
  ]);
  const p=products[0],v=versionId?versions.find(x=>x.id===versionId):versions[0];if(versionId&&!v)throw Error("Tato verze etikety nebyla nalezena.");if(!p)throw Error("Výrobek neexistuje.");
  let finds=[];if(v)finds=await api("/rest/v1/allergen_findings?select=allergen_code,finding_type&label_version_id=eq."+encodeURIComponent(v.id));
  const state=Object.fromEntries(finds.map(f=>[f.allergen_code,f.finding_type]));
  let body='<div class="card"><h2>'+escapeHtml(p.name)+'</h2><p class="muted">'+escapeHtml([p.brand,p.variant,p.ean].filter(Boolean).join(" · "))+'</p><p>Počet verzí etiket: '+versions.length+'</p>';
  if(v){
   body+='<p>Stav zobrazené verze: <b>'+escapeHtml(statusName(v.verification_status))+'</b> · '+escapeHtml(new Date(v.created_at).toLocaleString("cs-CZ"))+'</p><h3>Složení</h3><p style="white-space:pre-wrap">'+escapeHtml(v.ingredients||v.ingredients_text||"Údaj nenalezen")+'</p>'+
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
  body+='<p><button id="new-version" class="secondary">Přidat novou etiketu</button></p></div><div class="card"><h3>Historie</h3>'+versions.map(v=>'<p>'+escapeHtml(new Date(v.created_at).toLocaleString("cs-CZ"))+' · '+escapeHtml(statusName(v.verification_status))+' <button class="secondary" data-history="'+escapeHtml(v.id)+'">Zobrazit verzi '+escapeHtml(v.version_no)+'</button></p>').join("")+'</div>';
  chrome("Detail výrobku",body,"saved");document.querySelectorAll("[data-history]").forEach(b=>b.onclick=()=>detail(id,b.dataset.history));
  const newv=el("new-version");if(newv)newv.onclick=()=>{home();edit({productId:p.id,name:p.name,ean:p.ean||"",brand:p.brand||"",quantity:p.variant||"",ingredients:"",contains:[],possibleTraces:[],tracesText:"",sourceUrl:""});};
 }catch(e){fail(e)}
}
let barcodeLibraryPromise=null;
function barcodeLibrary(){
 if(window.ZXingBrowser)return Promise.resolve(window.ZXingBrowser);
 if(!barcodeLibraryPromise)barcodeLibraryPromise=new Promise((resolve,reject)=>{
  const s=document.createElement("script");s.src=new URL("zxing-browser-0.1.5.min.js",location.href).href;
  s.onload=()=>window.ZXingBrowser?resolve(window.ZXingBrowser):reject(Error("Čtečka se nenačetla."));
  s.onerror=()=>{s.remove();reject(Error("Čtečka se nenačetla. Obnov stránku a zkus znovu."))};document.head.appendChild(s);
 }).catch(e=>{barcodeLibraryPromise=null;throw e});
 return barcodeLibraryPromise;
}
function releaseCamera(state){
 state.liveCancelled=true;clearInterval(state.timer);state.controls?.stop();state.controls=null;
 state.stream?.getTracks().forEach(t=>t.stop());state.stream=null;
 if(state.video)state.video.srcObject=null;
}
function stopScanner(){
 const state=scanner;scanner=null;if(!state)return;
 releaseCamera(state);if(state.holder.isConnected)state.holder.innerHTML="";
}
function scannerMessage(state,text){if(scanner===state&&state.status.isConnected)state.status.textContent=text}
function acceptBarcode(state,raw){
 const code=String(raw||"").trim();if(!state||scanner!==state||!code||!validEan(code))return false;
 const input=el("lookup");if(!input)return false;
 input.value=code;stopScanner();search();return true;
}
function scannerPanel(){
 stopScanner();const holder=el("camera");if(!holder)return null;
 holder.innerHTML='<p id="scan-status" role="status">Namiř fotoaparát na celý čárový kód při dobrém světle.</p><video id="cam" autoplay playsinline muted style="width:100%;max-width:480px"></video><div class="row"><label class="capture-button" for="ean-photo">Vyfotit EAN<input id="ean-photo" type="file" accept="image/*" capture="environment" style="position:absolute;width:1px;height:1px;opacity:0"></label><button id="stop" type="button" class="secondary">Zavřít kameru</button></div><p class="muted">Fotografii kódu čteme pouze v tomto zařízení. Lze také zadat EAN ručně.</p>';
 const state={holder,video:el("cam"),status:el("scan-status"),stream:null,controls:null,timer:null};scanner=state;
 state.video.muted=true;state.video.playsInline=true;
 el("stop").onclick=stopScanner;
 el("ean-photo").onchange=e=>{const file=e.target.files?.[0];if(file)scanBarcodePhoto(state,file);e.target.value=""};
 return state;
}
async function scanBarcodePhoto(state,file){
 releaseCamera(state);state.video.hidden=true;
 if(!file.type.startsWith("image/")||file.size>20971520){scannerMessage(state,"Vyber fotografii do 20 MB.");return}
 scannerMessage(state,"Čtu EAN z fotografie…");let url;
 try{const library=await barcodeLibrary();if(scanner!==state)return;
  url=URL.createObjectURL(file);const result=await new library.BrowserMultiFormatReader().decodeFromImageUrl(url);
  if(!acceptBarcode(state,result.getText()))scannerMessage(state,"Na fotografii nebyl rozpoznán platný EAN. Vyfoť celý kód ostřeji nebo jej zadej ručně.");
 }catch{scannerMessage(state,"Kód se nepodařilo přečíst. Vyfoť celý čárový kód ostře při dobrém světle nebo EAN zadej ručně.")}
 finally{if(url)URL.revokeObjectURL(url)}
}
function photographEan(){const state=scannerPanel();if(state){state.video.hidden=true;scannerMessage(state,"Vyfoť celý čárový kód.");el("ean-photo").click()}}
async function scanStreamWithLibrary(state){
 const library=await barcodeLibrary();if(scanner!==state||state.liveCancelled)return;
 const controls=await new library.BrowserMultiFormatReader().decodeFromStream(state.stream,state.video,result=>{if(result&&!state.liveCancelled)acceptBarcode(state,result.getText())});
 if(scanner!==state||state.liveCancelled)controls.stop();else state.controls=controls;
}
function startScanner(){
 const state=scannerPanel();if(!state)return;state.liveCancelled=false;
 if(!navigator.mediaDevices?.getUserMedia){state.video.hidden=true;scannerMessage(state,"Živý náhled zde není dostupný. Tlačítko Vyfotit EAN otevře fotoaparát telefonu.");return}
 // Request the rear camera directly in the user's click, before loading the decoder.
 let permission;try{permission=navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"}}})}catch(e){cameraError(state,e);return}
 Promise.resolve(permission).then(async stream=>{
  if(scanner!==state||state.liveCancelled||document.hidden){stream.getTracks().forEach(t=>t.stop());return}state.stream=stream;
  try{
   let detector;try{if(window.BarcodeDetector)detector=new window.BarcodeDetector({formats:["ean_13","ean_8","upc_a"]})}catch{}
   if(!detector){await scanStreamWithLibrary(state);return}
   state.video.srcObject=stream;await state.video.play();if(scanner!==state)return;
   let busy=false;state.timer=setInterval(async()=>{
    if(busy||scanner!==state||state.video.readyState<2)return;busy=true;
    try{const codes=await detector.detect(state.video);if(state.liveCancelled)return;for(const code of codes){if(acceptBarcode(state,code.rawValue))break}}
    catch{clearInterval(state.timer);try{await scanStreamWithLibrary(state)}catch(e){cameraError(state,e)}}finally{busy=false}
   },350);
  }catch(e){cameraError(state,e)}
 }).catch(e=>cameraError(state,e));
}
function cameraError(state,error){
 if(scanner!==state)return;releaseCamera(state);state.video.hidden=true;
 scannerMessage(state,error?.name==="NotAllowedError"?"Přístup ke kameře byl zamítnut. Povol fotoaparát v nastavení tohoto webu, nebo použij Vyfotit EAN.":"Živý náhled kamery se nepodařilo otevřít. Použij Vyfotit EAN pro běžný fotoaparát telefonu.");
}
function pauseScanner(){if(scanner){releaseCamera(scanner);scanner.video.hidden=true;scannerMessage(scanner,"Náhled byl pozastaven. Použij Vyfotit EAN nebo spusť skenování znovu.")}}
// Native iPhone photo capture can background the page; preserve its file input.
if(typeof window!=="undefined"&&window.addEventListener){window.addEventListener("pagehide",pauseScanner);document.addEventListener("visibilitychange",()=>{if(document.hidden)pauseScanner()})}



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
 if(params.has("error")){history.replaceState(null,"",APP);msg("Odkaz je neplatný, vypršel nebo už byl použit. Přihlas se heslem nebo požádej majitele o nový odkaz.",true)}
 if(params.get("access_token")){
  history.replaceState(null,"",APP);store({access_token:params.get("access_token"),refresh_token:params.get("refresh_token"),expires_in:Number(params.get("expires_in")||3600)});
  const user=await api("/auth/v1/user");session.user=user;store(session);if(["recovery","invite"].includes(params.get("type")))resetPassword();else if(await authenticate()){if(!recoveryPending())home()}return;
 }
 try{session=JSON.parse(localStorage.getItem("etikety_session")||"null")}catch{}
 if(!session){login();return}
 if(await authenticate()){if(!recoveryPending())home()};
}catch(e){session=null;localStorage.removeItem("etikety_session");login();fail(e)}})();
