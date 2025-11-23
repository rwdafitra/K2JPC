// main.js - handles page lifecycle, binds forms, renders charts & tables
// This file expects router to load pages from /pages/*.html
window.onPageLoaded = function(page) {
  // call per-page init here
  if (page === 'dashboard') initDashboard();
  if (page === 'input') initInput();
  if (page === 'rekap') initRekap();
  if (page === 'grafik') initGrafik();
  if (page === 'users') initUsers();
  if (page === 'settings') initSettings();
};

// common ui helpers
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

// Dashboard: show quick stats and simple chart
async function initDashboard(){
  const statTotal = qs('#kt-total'); const statOpen = qs('#kt-open'); const statClosed = qs('#kt-closed'); const statCritical = qs('#kt-critical');
  if (!statTotal) return;
  const rows = await window._k3db.listInspections(200);
  statTotal.textContent = rows.length;
  statOpen.textContent = rows.filter(r=>r.status==='Open').length;
  statClosed.textContent = rows.filter(r=>r.status==='Closed').length;
  statCritical.textContent = rows.filter(r=>Number(r.risk)>=12).length;

  // simple trend: group last 6 days
  const labels = []; const data = [];
  for (let i=5;i>=0;i--){
    const d = new Date(); d.setDate(d.getDate()-i);
    const key = d.toISOString().slice(0,10);
    labels.push(key);
    data.push(rows.filter(r=>r.created_at && r.created_at.startsWith(key)).length);
  }
  const ctx = qs('#chartTrend').getContext('2d');
  if (window._chartTrend) window._chartTrend.destroy();
  window._chartTrend = new Chart(ctx,{type:'line',data:{labels, datasets:[{label:'Inspeksi',data, fill:true}]}, options:{responsive:true}});
}

// Input page: hybrid form
function initInput(){
  // build checklist if not present
  const preset = [
    {id:'c1', q:'APD lengkap & digunakan', mandatory:true},
    {id:'c2', q:'Rambu & pembatas area terpasang', mandatory:false},
    {id:'c3', q:'Peralatan berat dalam kondisi aman', mandatory:true},
    {id:'c4', q:'Kebersihan & akses evakuasi tidak tersumbat', mandatory:false}
  ];
  const checklistWrap = qs('#stdChecklist');
  checklistWrap.innerHTML = '';
  preset.forEach(p=>{
    const div = document.createElement('div'); div.className='form-check mb-2';
    div.innerHTML = `<input class="form-check-input" type="checkbox" id="${p.id}"><label class="form-check-label" for="${p.id}">${p.q} ${p.mandatory?'<span class="text-danger">*</span>':''}</label>`;
    checklistWrap.appendChild(div);
  });

  // bind file input preview
  const photoInput = qs('#f_photos');
  let selectedFiles = [];
  photoInput.addEventListener('change', (e)=>{ selectedFiles = Array.from(e.target.files).slice(0,4); renderPreview(selectedFiles); });
  function renderPreview(files){
    const pr = qs('#photoPreview'); pr.innerHTML=''; files.forEach(f=>{
      const img = document.createElement('img'); img.className='me-2 mb-2'; img.style.width='100px'; img.style.height='70px'; img.style.objectFit='cover';
      img.src = URL.createObjectURL(f); pr.appendChild(img);
    });
  }

  // risk calc
  function calcRisk(){
    const s = Number(qs('#f_sev').value||1); const l = Number(qs('#f_like').value||1); qs('#f_risk').value = s*l;
  }
  qs('#f_sev').addEventListener('input', calcRisk); qs('#f_like').addEventListener('input', calcRisk); calcRisk();

  // handle save
  qs('#saveLocal').addEventListener('click', async (ev)=>{
    ev.preventDefault();
    const doc = {
      type: 'inspection',
      inspector: qs('#f_inspector').value || 'Anon',
      location: qs('#f_location').value,
      activity: qs('#f_activity').value,
      gps: qs('#f_gps').value || null,
      severity: Number(qs('#f_sev').value),
      likelihood: Number(qs('#f_like').value),
      risk: Number(qs('#f_risk').value),
      checklist: preset.map(p=>({id:p.id, checked: !!qs('#'+p.id).checked})),
      custom: [],
      status: 'Open',
      created_at: new Date().toISOString()
    };

    // attachments as {blob, type}
    const attachments = [];
    for (let i=0;i<selectedFiles.length;i++){
      const f = selectedFiles[i];
      attachments.push({ blob: f, type: f.type });
    }

    try {
      await window._k3db.saveInspection(doc, attachments);
      alert('Disimpan lokal. Akan sinkron saat online.');
      // reset form
      qs('#formHybrid').reset(); qs('#photoPreview').innerHTML=''; selectedFiles=[];
    } catch (e) { console.error(e); alert('Gagal menyimpan: '+e.message); }
  });
}

// Rekap page: list table with filters
async function initRekap(){
  const tableWrap = qs('#rekapTableBody'); if (!tableWrap) return;
  const rows = await window._k3db.listInspections(500);
  tableWrap.innerHTML = '';
  rows.forEach((r,idx)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${idx+1}</td><td>${(new Date(r.created_at)).toLocaleString()}</td><td>${r.location}</td><td>${r.activity}</td><td>${r.inspector}</td><td><span class="badge bg-${r.risk>12?'danger':r.risk>7?'warning':'primary'}">${r.risk}</span></td><td>${r.status}</td>`;
    tableWrap.appendChild(tr);
  });
}

// Grafik page
async function initGrafik(){
  // reuse dashboard trend for demo
  initDashboard();
}

// Users page placeholder
function initUsers(){
  const el = qs('#usersList'); if(!el) return;
  el.innerHTML = `<p class="small text-muted">User & Role management akan tersedia setelah backend.</p>`;
}

// Settings page
function initSettings(){
  // allow setting remote CouchDB URL
  const form = qs('#settingsForm'); if (!form) return;
  form.addEventListener('submit', (ev)=>{ ev.preventDefault();
    const url = qs('#couchUrl').value.trim();
    const user = qs('#couchUser').value.trim();
    const pass = qs('#couchPass').value.trim();
    if (!url) return alert('Masukkan URL CouchDB (contoh: https://user:pass@host/db)');
    window._k3db.configureRemote(url,user,pass);
    alert('Remote DB di-set. Sync live akan berjalan jika URL valid.');
  });
}

// bind sync button
document.getElementById('btnSync').addEventListener('click', async ()=>{
  if (!window._k3db) return alert('DB belum siap');
  if (!window._k3db.db) return alert('Local DB belum inisialisasi');
  if (!window._k3db.remoteDB && !confirm('Remote DB belum diset. Ingin terus simulasi lokal?')) return;
  if (window._k3db.remoteDB) {
    try {
      await window._k3db.db.replicate.to(window._k3db.remoteDB);
      await window._k3db.db.replicate.from(window._k3db.remoteDB);
      alert('Sinkron berhasil');
    } catch (e) { console.error(e); alert('Sync error: '+e.message); }
  } else {
    alert('Tidak ada remote DB. Data tetap tersimpan lokal.');
  }
});
