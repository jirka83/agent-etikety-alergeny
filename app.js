
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
 '<div class="card"><label>Název výrobku nebo EAN</label><div class="row"><input id="lookup" class="grow" placeholder="Zadej značku a název nebo čárový kód" autofocus><button id="find">Najít etiketu</button><button id="scan" class="secondary">Skenovat EAN</button><button id="photo-ean" class="secondary">Vyfotit EAN</button><button id="manual" class="secondary">Zadat ručně</button></div><div id="camera"></div><div class="row" style="margin-top:12px"><label for="lookup-market">Trh</label><select id="lookup-market" style="width:auto;max-width:100%"><option value="all">Všechny zdroje</option><option value="CZ">Česká republika</option><option value="AT">Rakousko</option></select></div><p class="muted">Česká republika a Rakousko hledají v Open Food Facts podle země prodeje. Všechny zdroje zahrnují také vlastní etikety a USDA.</p></div>'+catalogHelp()+'<div id="results"></div><details class="card" id="czech-sources"><summary>České zdroje k ručnímu dohledání</summary><div id="czech-sources-links">'+czechCatalogLinks()+'</div></details><div id="editor"></div>');
 el("find").onclick=search;
 el("lookup").onkeydown=e=>{if(e.key==="Enter")search()};
 el("scan").onclick=startScanner;el("photo-ean").onclick=photographEan;
 el("manual").onclick=()=>{stopScanner();edit(null)};el("archive-search").onclick=searchArchive;
 el("lookup-market").onchange=()=>{
  catalogSearchId++;
  el("results").textContent="";
  el("czech-sources").open=el("lookup-market").value==="CZ";
  el("czech-sources-links").innerHTML=czechCatalogLinks();
  el("find").disabled=false;
 };
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
const nutellaManufacturer="https://www.nutella.com/cz/cs/vyrobky/nutella";
const nutellaCzechPacks=[
 {ean:"80135463",grams:"200",sourceUrl:"https://eshop.rojal.cz/nutella-200-g"},
 {ean:"80177173",grams:"350",sourceUrl:"https://eshop.rojal.cz/nutella-350-g"},
 {ean:"8000500179864",grams:"600",sourceUrl:"https://sdmikulov.e-coop.cz/rakvice/1000156444.html"}
];
function czechReferenceMatches(query){
 if(query.market==="AT")return [];
 const match=query.exact?null:/^(?:ferrero )?nutella(?: (?:original|klasicka))?(?: (\d+) ?g?)?(?: ferrero)?$/.exec(searchWords(query.term));
 if(!query.exact&&!match)return [];
 return nutellaCzechPacks.filter(pack=>query.exact?canonicalGTIN(pack.ean)===canonicalGTIN(query.term):!match[1]||pack.grams===match[1])
  .map(pack=>({name:"Nutella",brand:"Ferrero",ean:pack.ean,quantity:pack.grams+" g",
   ingredients:"Cukr, palmový olej, lískové ořechy (13 %), odtučněné sušené mléko (8,7 %), nízkotučný kakaový prášek (7,4 %), sójové lecitiny, vanilin.",
   contains:["nuts","milk","soy"],containsDetail:"Lískové ořechy, mléko, sója (lecitiny)",possibleTraces:[],tracesText:"",
   sourceStatus:"czech_reference",sourceUrl:pack.sourceUrl,manufacturerUrl:nutellaManufacturer}));
}
function nutellaSearchWords(text){return searchWords(text).replace(/(\d+)\s+g\b/g,"$1g").split(" ")}
function czechCatalogLinks(name=""){
 const term=encodeURIComponent(name);
 const rohlik=name?"https://www.rohlik.cz/hledat?q="+term+"&companyId=1":"https://www.rohlik.cz/";
 const kosik=name?"https://www.kosik.cz/vyhledavani?search="+term:"https://www.kosik.cz/";
 const tesco=name?"https://nakup.itesco.cz/shop/cs-CZ/search?query="+term+"&inputType=free+text":"https://nakup.itesco.cz/shop/cs-CZ/";
 const glutenFree=name?"https://www.potravinybezlepku.cz/?page=vyhledavani&search="+term:"https://www.potravinybezlepku.cz/seznam-potravin/";
 const inspection=name?"https://www.potravinynapranyri.cz/XSearch.aspx?stext="+term:"https://www.potravinynapranyri.cz/";
 return '<p class="muted">Odkazy otevřou veřejné katalogy. Údaje z nich porovnej s etiketou svého balení.</p><ul><li>'+
  catalogLink("https://www.ferpotravina.cz/h","FÉR potravina")+' – hledání podle názvu nebo EAN.</li><li>'+
  catalogLink(glutenFree,"Potraviny bez lepku")+' – složení vybraných výrobků.</li><li>'+
  [catalogLink(rohlik,"Rohlík"),catalogLink(kosik,"Košík"),catalogLink(tesco,"Tesco")].join(' · ')+
  ' – produktové karty se složením a údaji o alergenech.</li></ul><p>'+
  catalogLink(inspection,"Potraviny na pranýři (SZPI)")+' – upozornění inspekce ke konkrétním výrobkům a šaržím.</p>';
}
function additionalCatalogLinks(term=""){
 return '<ul><li>'+catalogLink(usdaSearchUrl(term),"Celý katalog USDA")+' – značkové výrobky hlavně z USA a Nového Zélandu.</li><li>'+catalogLink("https://www.gs1cz.org/standardy-sluzby/nastroje/verified-by-gs1/","Verified by GS1")+' – ověření identity EAN, nikoli složení.</li>'+(term?'<li>'+catalogLink("https://www.google.com/search?q="+encodeURIComponent(term+" výrobce etiketa složení alergeny"),"Vyhledat etiketu výrobce")+' – ověř variantu a EAN přímo na dokumentu.</li>':'')+ '<li>Rakouské produktové katalogy: '+catalogLink("https://shop.billa.at/","BILLA")+' a '+catalogLink("https://www.spar.at/produktwelt","SPAR")+'.</li></ul>';
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
 const {saved:own,off,usda,reference}=states;
 const marketName=query.market==="CZ"?"Česká republika":query.market==="AT"?"Rakousko":"";
 const ongoing=Object.values(states).some(x=>x.state==="pending");
 const missing=Object.entries(states).filter(([,x])=>x.state==="failed").map(([k])=>({saved:"Uložené etikety",off:"Open Food Facts",usda:"USDA"}[k]));
 const referenceCodes=new Set(reference.rows.map(m=>canonicalGTIN(m.ean)));
 const queryWords=nutellaSearchWords(query.term);
 const nutellaByName=query.market!=="AT"&&!query.exact&&queryWords.includes("nutella");
 if(nutellaByName){
  // For these codes, show only the Czech cards matching the requested variant or weight.
  nutellaCzechPacks.forEach(pack=>referenceCodes.add(canonicalGTIN(pack.ean)));
 }
 const relevantPublicMatch=m=>{
  if(referenceCodes.has(canonicalGTIN(m.ean)))return false;
  if(!nutellaByName)return true;
  const words=nutellaSearchWords([m.name,m.brand,m.quantity].join(" "));
  return queryWords.every(word=>words.includes(word)||/^\d+$/.test(word)&&words.includes(word+"g"));
 };
 const offRows=off.rows.filter(relevantPublicMatch);
 const usdaRows=usda.rows.filter(relevantPublicMatch);
 found=[...reference.rows,...offRows,...usdaRows];
 const count=own.rows.length+found.length;
 const card=(m,i)=>'<article class="card"><h3>'+escapeHtml(m.name)+'</h3><p class="muted">'+escapeHtml([m.brand,m.quantity,"EAN "+m.ean].filter(Boolean).join(" · "))+'</p>'+
  (m.market?'<p class="muted">Trh: '+escapeHtml(m.market)+' · export USDA '+escapeHtml(m.snapshot)+(m.updated?' · změna záznamu '+escapeHtml(m.updated):'')+' · FDC '+escapeHtml(m.fdcId)+'</p>':'')+
  (m.labelImageUrl&&urlSafe(m.labelImageUrl)?'<a href="'+urlSafe(m.labelImageUrl)+'" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="'+urlSafe(m.labelImageUrl)+'" alt="Fotografie složení" style="width:100%;max-height:220px;object-fit:contain"></a>':'')+
  (m.ingredients?'<details><summary>Zobrazit složení</summary><p>'+escapeHtml(m.ingredients)+'</p></details>':'')+
  '<p><b>'+(m.manufacturerUrl?"Obsahuje podle českého zdroje:":"Obsahuje (neověřeno):")+'</b> '+(m.contains.length?escapeHtml(m.containsDetail||m.contains.map(allergenName).join(", ")):"Samostatný seznam není k dispozici. Zkontroluj složení.")+'</p>'+
  '<p><b>'+(m.manufacturerUrl?"Možné stopy:":"Možné stopy (neověřeno):")+'</b> '+(m.possibleTraces.length?escapeHtml(m.possibleTraces.map(allergenName).join(", ")):m.tracesText?"Viz upozornění výrobce níže.":m.manufacturerUrl?"Zdroj neuvádí samostatné upozornění. Zkontroluj obal.":"Údaj nenalezen – neznamená bez stop")+'</p>'+
  (m.tracesText?'<p>'+escapeHtml(m.tracesText)+'</p>':'')+
  '<button type="button" data-choice="'+i+'">Vybrat neověřený návrh</button> '+catalogLink(m.sourceUrl,m.manufacturerUrl?"Česká karta s EAN":m.market?"Vyhledat EAN v USDA":"Karta Open Food Facts")+
  (m.manufacturerUrl?' · '+catalogLink(m.manufacturerUrl,"Složení od výrobce"):'')+'</article>';
 target.innerHTML='<p role="status">'+(ongoing?(count?"Zatím nalezeno: "+count+". Ještě prohledávám další zdroje…":"Hledám v bezplatných katalozích…"):"Nalezené záznamy: "+count)+'</p>'+
  (missing.length?'<p class="alert">Nepodařilo se prohledat: '+escapeHtml(missing.join(", "))+'. Výsledky z dostupných zdrojů zůstávají zobrazené.</p>':'')+
  (own.rows.length?'<h3>Vaše uložené výrobky</h3>'+own.rows.map((r,i)=>'<div class="card"><b>'+escapeHtml(r.name)+'</b><p class="muted">'+escapeHtml([r.brand,r.variant,r.ean&&"EAN "+r.ean].filter(Boolean).join(" · "))+'</p><button type="button" data-own="'+i+'">Otevřít uloženou etiketu</button></div>').join(""):'')+
  (found.length?'<p class="muted">Výsledky jsou oddělené podle zdroje. Porovnej EAN, gramáž a složení se svým obalem.</p>':'')+
  (reference.rows.length?'<h3>České produktové karty</h3>'+reference.rows.map(card).join(""):'')+
  (offRows.length?'<h3>'+(marketName?marketName+' · Open Food Facts':'Open Food Facts')+'</h3>'+offRows.map((m,i)=>card(m,reference.rows.length+i)).join(""):'')+
  (usdaRows.length?'<h3>USDA FoodData Central</h3>'+usdaRows.map((m,i)=>card(m,reference.rows.length+offRows.length+i)).join(""):'')+
  (!ongoing&&!count?'<p class="card">'+(missing.length?"V dostupných zdrojích se výrobek nenašel.":marketName?"V katalogu se nenašel výrobek pro trh „"+marketName+"“.":"Výrobek v prohledaných katalozích nenalezen.")+' Použij fotografii nebo ruční zadání. '+catalogLink("https://www.google.com/search?q="+encodeURIComponent(query.term+" výrobce etiketa složení alergeny"),"Dohledat etiketu výrobce")+'</p>':'');
 target.querySelectorAll("[data-choice]").forEach(b=>{const item=found[Number(b.dataset.choice)];b.onclick=()=>edit(item)});
 target.querySelectorAll("[data-own]").forEach(b=>{const item=own.rows[Number(b.dataset.own)];b.onclick=()=>detail(item.id)});
}
async function lookupOpenFoodFacts(query){
 try{
  const result=await api("/functions/v1/etikety-lookup",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({term:query.term,market:query.market}),
   signal:catalogTimeout(19000)
  });
  if(!Array.isArray(result.matches)||query.market&&result.market!==query.market){
   throw Error("Katalog nevrátil výsledky pro vybraný trh.");
  }
  return result.matches;
 }catch(error){
  if(query.exact&&error.status===502&&error.message==="Katalog je nedostupný: 404")return [];
  throw error;
 }
}
async function search(){
 let query;try{query=catalogTerm(el("lookup").value)}catch(e){return fail(e)}
 if(!query.exact)query.term=query.term.replace(/\b(?:nuttela|nuttella|nutela)\b/gi,"Nutella");
 const b=el("find"),target=el("results"),request=++catalogSearchId;
 const market=el("lookup-market").value;
 if(market==="CZ"||market==="AT")query.market=market;
 stopScanner();b.disabled=true;el("editor").innerHTML="";el("archive-results").textContent="";el("catalog-links").innerHTML=additionalCatalogLinks(query.term);
 el("czech-sources-links").innerHTML=czechCatalogLinks(query.exact?"":query.term);
 const states=Object.fromEntries(["saved","off","usda"].map(k=>[k,{state:query.market&&k!=="off"?"skipped":"pending",rows:[]}]));
 states.reference={state:"done",rows:czechReferenceMatches(query)};
 const current=()=>target.isConnected&&request===catalogSearchId;
 const render=()=>{if(current())renderCatalogResults(query,states,target)};
 const run=async(k,fn)=>{try{states[k]={state:"done",rows:await fn()}}catch{states[k]={state:"failed",rows:[]}}render()};
 render();
 try{
  await validSession();if(!session)throw Error("Přihlas se znovu.");if(!current())return;
  const lookups=[run("off",()=>lookupOpenFoodFacts(query))];
  if(!query.market){
   lookups.push(run("saved",()=>lookupSaved(query)));
   lookups.push(run("usda",async()=>catalogMatches(await loadCatalog("usda"),query).map(r=>usdaMatch(r,query))));
  }
  await Promise.all(lookups);
  if(current()&&query.market!=="AT"&&Object.values(states).every(x=>!x.rows.length))el("czech-sources").open=true;
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
 state.liveCancelled=true;clearInterval(state.timer);state.timer=null;
 state.stream?.getTracks().forEach(t=>t.stop());state.stream=null;
 state.video.srcObject=null;state.preview.hidden=true;state.light.hidden=true;
}
function stopScanner(){
 const state=scanner;scanner=null;if(!state)return;
 releaseCamera(state);if(state.holder.isConnected)state.holder.innerHTML="";
}
function scannerMessage(state,text){if(scanner===state&&state.status.isConnected)state.status.textContent=text}
function retailBarcode(raw){
 const code=String(raw||"").trim();return code&&!/^0+$/.test(code)&&validEan(code)?code:"";
}
function acceptBarcode(state,raw){
 const code=retailBarcode(raw);if(!state||scanner!==state||!code)return false;
 const input=el("lookup");if(!input)return false;
 input.value=code;stopScanner();search();return true;
}
function scannerPanel(){
 stopScanner();const holder=el("camera");if(!holder)return null;
 holder.innerHTML='<p id="scan-status" role="status">Připravuji fotoaparát…</p>'+
  '<div id="scan-preview" hidden style="position:relative;max-width:480px;margin:0 auto 10px"><video id="cam" autoplay playsinline muted style="display:block;width:100%;border-radius:10px"></video><div aria-hidden="true" style="position:absolute;inset:32% 4%;border:2px solid #b5ffbf;border-radius:10px;box-shadow:0 0 0 1px #19333e;pointer-events:none"></div></div>'+
  '<div class="row"><button id="take-ean-photo" type="button" class="secondary">Vyfotit EAN</button><button id="pick-ean-photo" type="button" class="secondary">Vybrat fotku</button><button id="scan-light" type="button" class="secondary" aria-pressed="false" hidden>Světlo</button><button id="stop" type="button" class="secondary">Zavřít kameru</button></div>'+
  '<input id="ean-photo" type="file" accept="image/*" capture="environment" hidden><input id="ean-gallery" type="file" accept="image/*" hidden><p class="muted">Fotografii kódu čteme pouze v tomto zařízení.</p>';
 const state={holder,video:el("cam"),preview:el("scan-preview"),light:el("scan-light"),status:el("scan-status"),stream:null,timer:null,photoJob:0};scanner=state;
 state.video.muted=true;state.video.playsInline=true;
 el("stop").onclick=stopScanner;
 el("take-ean-photo").onclick=()=>openBarcodePhoto(state,"ean-photo");
 el("pick-ean-photo").onclick=()=>openBarcodePhoto(state,"ean-gallery");
 for(const id of ["ean-photo","ean-gallery"])el(id).onchange=e=>{const file=e.target.files?.[0];if(file)scanBarcodePhoto(state,file);e.target.value=""};
 return state;
}
function openBarcodePhoto(state,id){
 releaseCamera(state);state.photoJob++;
 scannerMessage(state,id==="ean-photo"?"Vyfoť celý čárový kód včetně světlého okraje.":"Vyber fotku s celým čárovým kódem.");
 el(id).click();
}
function photographEan(){const state=scannerPanel();if(state)openBarcodePhoto(state,"ean-photo")}
const fullBarcodeFrame=[0,0,1,1];
const centerBarcodeFrame=[.04,.32,.92,.36]; // Matches the guide over the video.
function drawBarcodeFrame(canvas,source,width,height,region,limit,sideways=false){
 const [left,top,spanX,spanY]=region;
 const w=Math.round(width*spanX),h=Math.round(height*spanY),scale=Math.min(1,limit/Math.max(w,h));
 const outW=Math.max(1,Math.round(w*scale)),outH=Math.max(1,Math.round(h*scale));
 canvas.width=sideways?outH:outW;canvas.height=sideways?outW:outH;
 const ctx=canvas.getContext("2d",{willReadFrequently:true});
 if(sideways){ctx.translate(outH,0);ctx.rotate(Math.PI/2)}
 ctx.drawImage(source,Math.round(width*left),Math.round(height*top),w,h,0,0,outW,outH);
}
function retailReader(library){
 const {EAN_13,EAN_8,UPC_A,ITF}=library.BarcodeFormat;
 const reader=new library.BrowserMultiFormatReader(new Map());
 reader.possibleFormats=[EAN_13,EAN_8,UPC_A,ITF];return reader;
}
function readBarcodeCanvas(reader,canvas){
 try{return retailBarcode(reader.decodeFromCanvas(canvas).getText())}catch{return ""}
}
function readBarcodePhoto(reader,image){
 const canvas=document.createElement("canvas");
 // Overlapping sections preserve detail for small codes near the edge of the photo.
 const regions=[fullBarcodeFrame,[0,0,.65,.65],[.35,0,.65,.65],[0,.35,.65,.65],[.35,.35,.65,.65]];
 for(const region of regions)for(const sideways of [false,true]){
  drawBarcodeFrame(canvas,image,image.naturalWidth,image.naturalHeight,region,1600,sideways);
  const code=readBarcodeCanvas(reader,canvas);if(code)return code;
 }
 return "";
}
async function scanBarcodePhoto(state,file){
 releaseCamera(state);const job=++state.photoJob;
 if((file.type&&!file.type.startsWith("image/")&&file.type!=="application/octet-stream")||file.size>20971520){scannerMessage(state,"Vyber fotografii do 20 MB.");return}
 scannerMessage(state,"Čtu EAN z fotografie…");let url;
 const current=()=>scanner===state&&job===state.photoJob;
 try{
  url=URL.createObjectURL(file);const image=new Image();
  const loaded=new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url});
  const [library]=await Promise.all([barcodeLibrary(),loaded]);if(!current())return;
  if(acceptBarcode(state,readBarcodePhoto(retailReader(library),image)))return;
  scannerMessage(state,"Kód se nepodařilo přečíst. Vyfoť celý kód včetně světlých okrajů, bez odlesku, nebo zadej čísla pod kódem.");
 }catch{if(current())scannerMessage(state,"Fotku se nepodařilo otevřít nebo načíst čtečku. Zkus novou fotku nebo zadej EAN ručně.")}
 finally{if(url)URL.revokeObjectURL(url)}
}
async function cameraControls(state,track){
 const caps=track.getCapabilities?.();if(!caps||!track.applyConstraints)return;
 if(caps.focusMode?.includes("continuous"))await track.applyConstraints({advanced:[{focusMode:"continuous"}]}).catch(()=>{});
 if(scanner!==state||state.liveCancelled||!(caps.torch===true||Array.isArray(caps.torch)&&caps.torch.includes(true)))return;
 const light=state.light;light.hidden=false;
 light.onclick=async()=>{
  const on=light.getAttribute("aria-pressed")!=="true";light.disabled=true;
  try{await track.applyConstraints({advanced:[{torch:on}]});if(!state.liveCancelled)light.setAttribute("aria-pressed",String(on))}
  catch{scannerMessage(state,"Světlo se nepodařilo přepnout. Zkus lépe osvětlit celý kód.")}
  finally{light.disabled=false}
 };
}
async function startScanner(){
 const state=scannerPanel();if(!state)return;state.liveCancelled=false;
 if(!navigator.mediaDevices?.getUserMedia){scannerMessage(state,"Živý náhled zde není dostupný. Tlačítko Vyfotit EAN otevře fotoaparát telefonu.");return}
 // Request the rear camera directly in the user's click, before loading the decoder.
 const live=()=>scanner===state&&!state.liveCancelled;
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:960},frameRate:{ideal:24}}});
  if(scanner!==state||state.liveCancelled||document.hidden){stream.getTracks().forEach(t=>t.stop());return}state.stream=stream;
  const video=state.video;video.srcObject=stream;state.preview.hidden=false;await video.play();if(!live())return;
  const track=stream.getVideoTracks()[0];
  if(track){cameraControls(state,track).catch(()=>{});track.addEventListener("ended",()=>{if(live())cameraError(state)}, {once:true})}
  let detector;try{if(window.BarcodeDetector)detector=new window.BarcodeDetector({formats:["ean_13","ean_8","upc_a"]})}catch{}
  const reader=await barcodeLibrary().then(retailReader).catch(()=>null);if(!live())return;
  if(!reader&&!detector)throw Error("Čtečka se nenačetla.");
  scannerMessage(state,"Dej celý kód vodorovně do rámečku. Pokud je rozmazaný, mírně oddal telefon a na chvíli ho podrž v klidu.");
  const canvas=document.createElement("canvas");let busy=false,frame=0;
  state.timer=setInterval(async()=>{
   if(busy||!live()||video.readyState<2||!video.videoWidth||!video.videoHeight)return;
   busy=true;
   try{
    const pass=frame++%4,region=pass===1||pass===3?fullBarcodeFrame:centerBarcodeFrame;
    drawBarcodeFrame(canvas,video,video.videoWidth,video.videoHeight,region,1280,pass===3);
    if(reader&&acceptBarcode(state,readBarcodeCanvas(reader,canvas)))return;
    if(detector&&(!reader||pass===1)){
     let results=[];try{results=await detector.detect(canvas)}catch{detector=null;if(!reader&&live())cameraError(state)}
     if(live())for(const result of results){if(acceptBarcode(state,result.rawValue))break}
    }
   }catch(error){if(live())cameraError(state,error)}finally{busy=false}
  },250);
 }catch(error){if(live())cameraError(state,error)}
}
function cameraError(state,error){
 if(scanner!==state)return;releaseCamera(state);
 scannerMessage(state,error?.name==="NotAllowedError"?"Přístup ke kameře byl zamítnut. Povol fotoaparát v nastavení tohoto webu, nebo použij Vyfotit EAN.":"Živý náhled kamery se nepodařilo otevřít. Použij Vyfotit EAN pro běžný fotoaparát telefonu.");
}
function pauseScanner(){if(scanner&&!scanner.liveCancelled){releaseCamera(scanner);scannerMessage(scanner,"Náhled byl pozastaven. Použij Vyfotit EAN nebo spusť skenování znovu.")}}
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
