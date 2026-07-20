const STORAGE_KEY = "agroControlDataV1";
const euro = new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"});
const monthFmt = new Intl.DateTimeFormat("es-ES",{month:"long",year:"numeric"});

let deferredPrompt = null;
let state = loadState();

function defaultState(){
  return {
    settings:{businessName:"Agro Control",defaultRate:0},
    clients:[],
    jobs:[]
  };
}

function loadState(){
  try{
    return {...defaultState(),...JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}")};
  }catch{
    return defaultState();
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  renderAll();
}

function uid(){ return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2); }
function today(){ return new Date().toISOString().slice(0,10); }
function money(n){ return euro.format(Number(n)||0); }
function total(job){ return (Number(job.hours)||0)*(Number(job.rate)||0); }
function clientById(id){ return state.clients.find(c=>c.id===id); }
function escapeHtml(s=""){ return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m])); }

function nextClientCode(){
  const max = state.clients.reduce((m,c)=>{
    const n = parseInt((c.code||"").replace(/\D/g,""),10);
    return Number.isFinite(n)?Math.max(m,n):m;
  },0);
  return `C${String(max+1).padStart(3,"0")}`;
}

function renderAll(){
  renderMetrics();
  renderClients();
  renderJobs();
  renderSummaries();
  fillClientSelect();
  document.getElementById("businessName").value=state.settings.businessName||"Agro Control";
  document.getElementById("defaultRate").value=state.settings.defaultRate||0;
  document.querySelector(".topbar h1").textContent=state.settings.businessName||"Agro Control";
}

function renderMetrics(){
  const billed = state.jobs.reduce((s,j)=>s+total(j),0);
  const collected = state.jobs.filter(j=>j.paid).reduce((s,j)=>s+total(j),0);
  const pending = billed-collected;
  const hours = state.jobs.reduce((s,j)=>s+(Number(j.hours)||0),0);
  metricBilled.textContent=money(billed);
  metricCollected.textContent=money(collected);
  metricPending.textContent=money(pending);
  metricHours.textContent=hours.toLocaleString("es-ES",{maximumFractionDigits:2});

  const recent=[...state.jobs].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  recentJobs.innerHTML=recent.length?recent.map(jobCard).join(""):'<div class="empty-state">Todavía no hay trabajos.</div>';
}

function renderClients(){
  const q=clientSearch.value.trim().toLowerCase();
  const list=state.clients
    .filter(c=>[c.name,c.code,c.phone].some(v=>(v||"").toLowerCase().includes(q)))
    .sort((a,b)=>a.name.localeCompare(b.name,"es"));
  clientList.innerHTML=list.length?list.map(c=>{
    const jobs=state.jobs.filter(j=>j.clientId===c.id);
    const billed=jobs.reduce((s,j)=>s+total(j),0);
    const pending=jobs.filter(j=>!j.paid).reduce((s,j)=>s+total(j),0);
    return `<button class="list-item" onclick="editClient('${c.id}')">
      <div><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.code)} · ${escapeHtml(c.phone||"Sin teléfono")}</p><p>${jobs.length} trabajos</p></div>
      <div class="amount">${money(billed)}<p>Pendiente ${money(pending)}</p></div>
    </button>`;
  }).join(""):'<div class="empty-state">No hay clientes.</div>';
}

function jobCard(j){
  const c=clientById(j.clientId);
  return `<button class="list-item" onclick="editJob('${j.id}')">
    <div><h3>${escapeHtml(c?.name||"Sin cliente")}</h3><p>${escapeHtml(j.service)} · ${escapeHtml(j.farm)}</p><p>${escapeHtml(j.date)}</p><span class="badge ${j.paid?"paid":"pending"}">${j.paid?"Cobrado":"Pendiente"}</span></div>
    <div class="amount">${money(total(j))}</div>
  </button>`;
}

function renderJobs(){
  const q=jobSearch.value.trim().toLowerCase();
  const f=jobFilter.value;
  const list=[...state.jobs]
    .filter(j=>{
      const c=clientById(j.clientId);
      const text=[c?.name,j.farm,j.service].some(v=>(v||"").toLowerCase().includes(q));
      const paid=f==="all"||(f==="paid"&&j.paid)||(f==="pending"&&!j.paid);
      return text&&paid;
    })
    .sort((a,b)=>b.date.localeCompare(a.date));
  jobList.innerHTML=list.length?list.map(jobCard).join(""):'<div class="empty-state">No hay trabajos.</div>';
}

function renderSummaries(){
  const billed=state.jobs.reduce((s,j)=>s+total(j),0);
  const pending=state.jobs.filter(j=>!j.paid).reduce((s,j)=>s+total(j),0);
  sumJobs.textContent=state.jobs.length;
  sumClients.textContent=state.clients.length;
  sumBilled.textContent=money(billed);
  sumPending.textContent=money(pending);

  const monthly={};
  state.jobs.forEach(j=>{
    const key=j.date.slice(0,7);
    monthly[key]=(monthly[key]||0)+total(j);
  });
  monthlySummary.innerHTML=Object.keys(monthly).sort().reverse().slice(0,12).map(k=>{
    const d=new Date(k+"-01T12:00:00");
    return `<div class="summary-row"><span>${monthFmt.format(d)}</span><strong>${money(monthly[k])}</strong></div>`;
  }).join("")||'<div class="empty-state">Sin datos.</div>';

  clientSummary.innerHTML=state.clients.map(c=>{
    const jobs=state.jobs.filter(j=>j.clientId===c.id);
    const value=jobs.reduce((s,j)=>s+total(j),0);
    return {name:c.name,value};
  }).sort((a,b)=>b.value-a.value).map(x=>
    `<div class="summary-row"><span>${escapeHtml(x.name)}</span><strong>${money(x.value)}</strong></div>`
  ).join("")||'<div class="empty-state">Sin datos.</div>';
}

function fillClientSelect(){
  const current=jobClient.value;
  jobClient.innerHTML='<option value="">Selecciona un cliente</option>'+
    state.clients.sort((a,b)=>a.name.localeCompare(b.name,"es"))
      .map(c=>`<option value="${c.id}">${escapeHtml(c.code)} · ${escapeHtml(c.name)}</option>`).join("");
  jobClient.value=current;
}

function openClient(id=null){
  clientForm.reset();
  clientId.value="";
  clientDialogTitle.textContent=id?"Editar cliente":"Nuevo cliente";
  deleteClientBtn.classList.toggle("hidden",!id);
  if(id){
    const c=state.clients.find(c=>c.id===id);
    if(!c)return;
    clientId.value=c.id; clientCode.value=c.code; clientName.value=c.name;
    clientPhone.value=c.phone||""; clientEmail.value=c.email||"";
    clientAddress.value=c.address||""; clientTaxId.value=c.taxId||""; clientNotes.value=c.notes||"";
  }else{
    clientCode.value=nextClientCode();
  }
  clientDialog.showModal();
}

window.editClient=openClient;

clientForm.addEventListener("submit",e=>{
  e.preventDefault();
  const data={
    id:clientId.value||uid(), code:clientCode.value.trim().toUpperCase(),
    name:clientName.value.trim(), phone:clientPhone.value.trim(),
    email:clientEmail.value.trim(), address:clientAddress.value.trim(),
    taxId:clientTaxId.value.trim().toUpperCase(), notes:clientNotes.value.trim()
  };
  if(!data.name||!data.code)return;
  const duplicate=state.clients.some(c=>c.code===data.code&&c.id!==data.id);
  if(duplicate){ alert("Ese código de cliente ya existe."); return; }
  const i=state.clients.findIndex(c=>c.id===data.id);
  if(i>=0)state.clients[i]=data; else state.clients.push(data);
  clientDialog.close(); saveState();
});

deleteClientBtn.addEventListener("click",()=>{
  const id=clientId.value;
  if(state.jobs.some(j=>j.clientId===id)){
    alert("No se puede eliminar este cliente porque tiene trabajos asociados.");
    return;
  }
  if(confirm("¿Eliminar este cliente?")){
    state.clients=state.clients.filter(c=>c.id!==id); clientDialog.close(); saveState();
  }
});

function openJob(id=null){
  if(!state.clients.length){
    alert("Primero debes crear al menos un cliente.");
    showView("clientes");
    return;
  }
  jobForm.reset(); jobId.value="";
  jobDialogTitle.textContent=id?"Editar trabajo":"Nuevo trabajo";
  deleteJobBtn.classList.toggle("hidden",!id);
  jobDate.value=today();
  jobRate.value=state.settings.defaultRate||0;
  if(id){
    const j=state.jobs.find(j=>j.id===id); if(!j)return;
    jobId.value=j.id; jobDate.value=j.date; jobClient.value=j.clientId; jobFarm.value=j.farm;
    jobService.value=j.service; jobHours.value=j.hours; jobRate.value=j.rate;
    jobPaid.value=j.paid?"yes":"no"; jobPaymentDate.value=j.paymentDate||"";
    jobNotes.value=j.notes||"";
  }
  updatePaymentVisibility(); updateJobTotal(); jobDialog.showModal();
}

window.editJob=openJob;

function updateJobTotal(){ jobTotal.value=money((Number(jobHours.value)||0)*(Number(jobRate.value)||0)); }
function updatePaymentVisibility(){ paymentDateWrap.classList.toggle("hidden",jobPaid.value!=="yes"); }

jobHours.addEventListener("input",updateJobTotal);
jobRate.addEventListener("input",updateJobTotal);
jobPaid.addEventListener("change",updatePaymentVisibility);

jobForm.addEventListener("submit",e=>{
  e.preventDefault();
  const data={
    id:jobId.value||uid(), date:jobDate.value, clientId:jobClient.value,
    farm:jobFarm.value.trim(), service:jobService.value.trim(),
    hours:Number(jobHours.value)||0, rate:Number(jobRate.value)||0,
    paid:jobPaid.value==="yes", paymentDate:jobPaid.value==="yes"?(jobPaymentDate.value||today()):"",
    notes:jobNotes.value.trim()
  };
  if(!data.clientId||!data.date||!data.farm||!data.service)return;
  const i=state.jobs.findIndex(j=>j.id===data.id);
  if(i>=0)state.jobs[i]=data; else state.jobs.push(data);
  jobDialog.close(); saveState();
});

deleteJobBtn.addEventListener("click",()=>{
  if(confirm("¿Eliminar este trabajo?")){
    state.jobs=state.jobs.filter(j=>j.id!==jobId.value); jobDialog.close(); saveState();
  }
});

function showView(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id));
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===id));
  window.scrollTo({top:0,behavior:"smooth"});
}

document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.go)));
newClientBtn.addEventListener("click",()=>openClient());
newJobBtn.addEventListener("click",()=>openJob());
quickAdd.addEventListener("click",()=>openJob());
clientSearch.addEventListener("input",renderClients);
jobSearch.addEventListener("input",renderJobs);
jobFilter.addEventListener("change",renderJobs);

saveSettingsBtn.addEventListener("click",()=>{
  state.settings.businessName=businessName.value.trim()||"Agro Control";
  state.settings.defaultRate=Number(defaultRate.value)||0;
  saveState();
  alert("Ajustes guardados.");
});

function downloadFile(name,content,type){
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

exportCsvBtn.addEventListener("click",()=>{
  const rows=[["Fecha","Código cliente","Cliente","Parcela o finca","Servicio","Horas","Precio por hora","Total","Cobrado","Fecha de cobro","Observaciones"]];
  state.jobs.forEach(j=>{
    const c=clientById(j.clientId);
    rows.push([j.date,c?.code||"",c?.name||"",j.farm,j.service,j.hours,j.rate,total(j),j.paid?"Sí":"No",j.paymentDate||"",j.notes||""]);
  });
  const csv="\ufeff"+rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(";")).join("\n");
  downloadFile("AgroControl_Trabajos.csv",csv,"text/csv;charset=utf-8");
});

backupBtn.addEventListener("click",()=>{
  downloadFile("AgroControl_Copia.json",JSON.stringify(state,null,2),"application/json");
});

restoreInput.addEventListener("change",async()=>{
  const file=restoreInput.files[0]; if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    if(!data.clients||!data.jobs)throw new Error();
    if(confirm("Esto sustituirá los datos actuales. ¿Continuar?")){
      state={...defaultState(),...data}; saveState();
    }
  }catch{ alert("La copia no es válida."); }
  restoreInput.value="";
});

window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault(); deferredPrompt=e; installBtn.classList.remove("hidden");
});
installBtn.addEventListener("click",async()=>{
  if(!deferredPrompt){
    alert('En iPhone: abre el menú Compartir de Safari y pulsa "Añadir a pantalla de inicio".');
    return;
  }
  deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null;
});

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("service-worker.js"));
}

renderAll();
