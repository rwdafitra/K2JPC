// public/main.js — FINAL COMPLETE VERSION

/* ===========================
   HELPERS GLOBAL
   =========================== */
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }
function isOnline() { return navigator.onLine; }

function formatDate(isoString) {
  if (!isoString) return '-';
  try {
    return new Date(isoString).toLocaleString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) { return isoString; }
}

function getUserRole() {
  try {
    let user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!user) {
      // Default fallback user
      user = { username: 'admin', role: 'Manager', name: 'Safety Admin' };
      localStorage.setItem('currentUser', JSON.stringify(user));
    }
    return user;
  } catch (e) {
    return { username: 'guest', role: 'Inspector', name: 'Guest' };
  }
}
window.currentUser = getUserRole();


/* ===========================
   LOGIKA INTI & ROUTER CALLBACK
   =========================== */
window.onPageLoaded = function (page) {
  const user = getUserRole();
  
  // Highlight Menu Sidebar
  qsa('.sidebar a').forEach(a => a.classList.remove('active'));
  qs(`.sidebar a[data-page="${page}"]`)?.classList.add('active');

  // Tutup sidebar di mobile setelah klik (UX improvement)
  if(window.innerWidth < 768) {
     qs('#mainSidebar')?.classList.remove('show');
  }

  // Proteksi Halaman Admin
  if (page === 'users' && user.role !== 'Manager' && user.role !== 'Admin') {
      alert("Akses ditolak. Halaman ini khusus Manager/Admin.");
      router.navigateTo('dashboard');
      return;
  }

  // Router Switch
  try {
    if (page === 'dashboard') initDashboard();
    if (page === 'input') initInput(user);
    if (page === 'rekap') initRekap(user);
    if (page === 'detail') initDetail(user);
    if (page === 'grafik') initGrafik(); 
    if (page === 'users') initUsers(user);
    if (page === 'settings') initSettings();
  } catch (e) {
    console.error(`Init error page ${page}:`, e);
  }
};


/* ===========================
   DASHBOARD
   =========================== */
async function initDashboard() {
  if (!window._k3db?.listInspections) return;
  try {
    const docs = await window._k3db.listInspections();
    
    // Statistik
    qs('#kt-total').textContent = docs.length;
    qs('#kt-open').textContent = docs.filter(d => d.status === 'Open').length;
    qs('#kt-closed').textContent = docs.filter(d => d.status === 'Closed').length;
    qs('#kt-critical').textContent = docs.filter(d => d.risk_score >= 15 && d.status === 'Open').length;

    // Update Last Sync Text
    qs('#lastSyncDisplay').textContent = "Last Sync: " + (qs('#lastSync')?.textContent || '-');

    // Tabel Recent
    const recentBody = qs('#dashboardRecent');
    if (recentBody) {
        const recents = docs.slice(0, 5); // Ambil 5 terbaru
        if (recents.length === 0) {
            recentBody.innerHTML = `<tr><td colspan="6" class="text-center py-3 text-muted">Belum ada data inspeksi.</td></tr>`;
        } else {
            recentBody.innerHTML = recents.map(doc => `
                <tr>
                    <td>${formatDate(doc.tanggal_inspeksi).split(' ')[0]}</td>
                    <td><div class="text-truncate" style="max-width:150px;">${doc.lokasi}</div></td>
                    <td><span class="badge bg-${doc.risk_category==='HIGH'?'danger': doc.risk_category==='MEDIUM'?'warning':'success'}">${doc.risk_category}</span></td>
                    <td><span class="badge bg-${doc.status==='Open'?'danger':'success'}">${doc.status}</span></td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-light border" onclick="router.navigateTo('detail',{id:'${doc._id}'})">Detail</button>
                    </td>
                </tr>
            `).join('');
        }
    }
  } catch (e) { console.error(e); }
}


/* ===========================
   INPUT INSPEKSI
   =========================== */
function initInput(user) {
    const form = qs('#formMinerba');
    if (!form) return;

    // Set Default
    qs('#f_inspector').value = user.name;
    qs('#f_inspectorId').value = user.username;
    if(qs('#f_tanggal_inspeksi')) qs('#f_tanggal_inspeksi').value = new Date().toISOString().split('T')[0];

    // Auto Calculation Risk
    function calc() {
        const s = parseInt(qs('#f_sev')?.value) || 0;
        const l = parseInt(qs('#f_like')?.value) || 0;
        const score = s * l;
        qs('#f_risk').value = score;
        let cat = 'LOW';
        if (score >= 15) cat = 'HIGH'; // Standar Minerba umum
        else if (score >= 9) cat = 'MEDIUM';
        qs('#f_risk_cat').value = cat;
    }
    qs('#f_sev')?.addEventListener('change', calc);
    qs('#f_like')?.addEventListener('change', calc);
    qs('#f_sev')?.addEventListener('keyup', calc);
    qs('#f_like')?.addEventListener('keyup', calc);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if(!form.checkValidity()) {
            form.classList.add('was-validated');
            return;
        }
        
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.disabled = true; btn.textContent = 'Menyimpan...';

        // Collect Data
        const doc = {
            inspector: qs('#f_inspector').value,
            inspector_id: qs('#f_inspectorId').value,
            tanggal_inspeksi: qs('#f_tanggal_inspeksi').value,
            lokasi: qs('#f_location').value,
            area: qs('#f_area').value,
            jenis_kegiatan: qs('#f_activity').value,
            kategori_temuan: qs('#f_category').value,
            uraian_temuan: qs('#f_uraian').value,
            rekomendasi: qs('#f_rekomendasi').value,
            severity: parseInt(qs('#f_sev').value),
            likelihood: parseInt(qs('#f_like').value),
            risk_score: parseInt(qs('#f_risk').value),
            risk_category: qs('#f_risk_cat').value,
            referensi_hukum: qs('#f_ref_hukum').value,
            target_tindak_lanjut: qs('#f_target_tl').value,
            status: 'Open',
            gps: qs('#f_gps').value,
            created_at: new Date().toISOString()
        };

        // Handle Photos
        const files = Array.from(qs('#f_photos').files);
        const attachments = await Promise.all(files.map(file => {
            return new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = evt => resolve({
                    type: file.type,
                    blob: evt.target.result.split(',')[1], // ambil base64 raw
                    filename: file.name
                });
                reader.readAsDataURL(file);
            });
        }));

        try {
            await window._k3db.saveInspection(doc, attachments);
            alert("Berhasil disimpan!");
            router.navigateTo('dashboard');
        } catch (err) {
            alert("Gagal simpan: " + err.message);
            btn.disabled = false; btn.textContent = originalText;
        }
    });
}


/* ===========================
   GRAFIK (FIXED)
   =========================== */
async function initGrafik() {
  // Pastikan elemen canvas sudah ada (dari grafik.html)
  const ctxRisk = qs('#chartRisk');
  const ctxStatus = qs('#chartStatus');

  if (!ctxRisk || !ctxStatus) return; 
  if (!window._k3db) return;

  try {
    const docs = await window._k3db.listInspections(500); // Limit sample data
    
    // Hapus loading message
    qs('#chartLoading')?.remove();

    // Data Processing
    const riskCounts = { HIGH:0, MEDIUM:0, LOW:0 };
    const statusCounts = { Open:0, Closed:0 };

    docs.forEach(d => {
        const r = d.risk_category || 'LOW';
        if (riskCounts[r] !== undefined) riskCounts[r]++;
        else riskCounts['LOW']++; // fallback
        
        const s = d.status || 'Open';
        if (statusCounts[s] !== undefined) statusCounts[s]++;
        else statusCounts['Open']++;
    });

    // Render Chart Risk (Bar)
    if (window.chartInstanceRisk) window.chartInstanceRisk.destroy(); 
    window.chartInstanceRisk = new Chart(ctxRisk, {
        type: 'bar',
        data: {
            labels: ['LOW', 'MEDIUM', 'HIGH'],
            datasets: [{
                label: 'Jumlah Temuan',
                data: [riskCounts.LOW, riskCounts.MEDIUM, riskCounts.HIGH],
                backgroundColor: ['#198754', '#ffc107', '#dc3545'],
                borderWidth: 1
            }]
        },
        options: { responsive: true, plugins: { legend: {display:false} } }
    });

    // Render Chart Status (Doughnut)
    if (window.chartInstanceStatus) window.chartInstanceStatus.destroy();
    window.chartInstanceStatus = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: ['Open', 'Closed'],
            datasets: [{
                data: [statusCounts.Open, statusCounts.Closed],
                backgroundColor: ['#dc3545', '#198754']
            }]
        },
        options: { responsive: true }
    });

  } catch (e) {
    console.error("Grafik Error:", e);
    const container = qs('#chartContainer');
    if(container) container.innerHTML = `<div class="alert alert-danger">Gagal memuat grafik: ${e.message}</div>`;
  }
}


/* ===========================
   REKAP / LIST DATA
   =========================== */
async function initRekap(user) {
    if (!window._k3db?.listInspections) return;
    const body = qs('#rekapTableBody');
    if (!body) return;

    try {
        const docs = await window._k3db.listInspections();
        // Filter jika Inspector hanya bisa lihat punya sendiri
        const filtered = (user.role === 'Inspector') 
            ? docs.filter(d => d.inspector_id === user.username)
            : docs;

        if (filtered.length === 0) {
            body.innerHTML = `<tr><td colspan="7" class="text-center text-muted small py-4">Tidak ada data inspeksi.</td></tr>`;
            return;
        }

        body.innerHTML = filtered.map(doc => `
          <tr>
            <td>${formatDate(doc.tanggal_inspeksi).split(' ')[0]}</td>
            <td>${doc.inspector || '-'}</td>
            <td>${(doc.lokasi || '-') + ' / ' + (doc.area || '-')}</td>
            <td>${(doc.uraian_temuan || '').slice(0, 50)}...</td>
            <td><span class="badge bg-${doc.risk_category==='HIGH'?'danger': doc.risk_category==='MEDIUM'?'warning':'success'}">${doc.risk_category}</span></td>
            <td><span class="badge bg-${doc.status==='Open'?'danger':'success'}">${doc.status}</span></td>
            <td>
              <button class="btn btn-sm btn-info me-1" onclick="router.navigateTo('detail',{id:'${doc._id}'})"><i class="bi bi-eye"></i></button>
              <button class="btn btn-sm btn-danger" onclick="handleDelete('${doc._id}','${doc.lokasi}')"><i class="bi bi-trash"></i></button>
            </td>
          </tr>
        `).join('');

    } catch (e) {
        body.innerHTML = `<tr><td colspan="7" class="text-danger">Gagal memuat: ${e.message}</td></tr>`;
    }
}


/* ===========================
   DETAIL INSPEKSI
   =========================== */
async function initDetail(user) {
    if (!window._k3db?.getInspection) return;

    // Ambil ID dari URL Hash (router.js menyimpan parameter di suatu tempat, 
    // tapi cara paling aman ambil ulang dari window.location untuk detail)
    // Asumsi: router.js memformat hash seperti #detail?id=xxx
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const id = params.get('id');
    const content = qs('#detailContent');
    
    if (!id || !content) return router.navigateTo('dashboard');

    try {
        const doc = await window._k3db.getInspection(id);
        const canEdit = (doc.inspector_id === user.username) || (user.role === 'Manager') || (user.role === 'Admin');

        // Render HTML Detail
        content.innerHTML = `
          <div class="card mb-3 shadow-sm border-0">
            <div class="card-header bg-white d-flex justify-content-between align-items-center">
              <div>
                 <strong>${doc.lokasi} - ${doc.area}</strong>
                 <br><small class="text-muted">${doc.jenis_kegiatan || ''}</small>
              </div>
              <span class="badge bg-${doc.status === 'Open' ? 'danger' : 'success'} fs-6">${doc.status}</span>
            </div>
            <div class="card-body">
              <div class="row g-3">
                <div class="col-md-6">
                  <table class="table table-borderless table-sm small">
                     <tr><td class="text-muted w-25">Inspector</td><td>: ${doc.inspector}</td></tr>
                     <tr><td class="text-muted">Tanggal</td><td>: ${formatDate(doc.tanggal_inspeksi)}</td></tr>
                     <tr><td class="text-muted">Kategori</td><td>: ${doc.kategori_temuan}</td></tr>
                     <tr><td class="text-muted">Ref Hukum</td><td>: ${doc.referensi_hukum || '-'}</td></tr>
                  </table>
                  <div class="p-2 bg-light rounded border mt-2">
                     <label class="small text-muted fw-bold">Uraian Temuan</label>
                     <p class="mb-0">${doc.uraian_temuan}</p>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="row text-center mb-3">
                     <div class="col-4 border-end">
                        <div class="small text-muted">Severity</div>
                        <div class="fw-bold">${doc.severity}</div>
                     </div>
                     <div class="col-4 border-end">
                        <div class="small text-muted">Likelihood</div>
                        <div class="fw-bold">${doc.likelihood}</div>
                     </div>
                     <div class="col-4">
                        <div class="small text-muted">Risk Score</div>
                        <div class="fw-bold fs-5 text-${doc.risk_category==='HIGH'?'danger': doc.risk_category==='MEDIUM'?'warning':'success'}">${doc.risk_score}</div>
                     </div>
                  </div>
                  <div class="p-2 bg-light rounded border">
                     <label class="small text-muted fw-bold">Rekomendasi</label>
                     <p class="mb-0">${doc.rekomendasi}</p>
                     <small class="text-danger mt-1 d-block">Target: ${doc.target_tindak_lanjut || '-'}</small>
                  </div>
                </div>
              </div>

              <h6 class="border-bottom pb-2 mt-4">Bukti Foto</h6>
              <div class="row" id="photoContainer"></div>

              <h6 class="border-bottom pb-2 mt-4">Riwayat Komentar & Tindak Lanjut</h6>
              <ul class="list-group list-group-flush small mb-3" id="commentList">
                 ${(doc.komentar || []).map(c => `
                    <li class="list-group-item px-0">
                      <strong>${c.user} (${c.role})</strong> <span class="text-muted float-end">${formatDate(c.date)}</span>
                      <div class="mt-1">${c.text}</div>
                    </li>
                 `).join('')}
              </ul>
              
              ${(doc.komentar||[]).length === 0 ? '<p class="text-muted small">Belum ada komentar.</p>' : ''}
            </div>
            
            <div class="card-footer bg-white text-end">
                <button class="btn btn-danger btn-sm me-2" onclick="handleDelete('${doc._id}','${doc.lokasi}')" ${!canEdit ? 'disabled' : ''}>
                   <i class="bi bi-trash"></i> Hapus
                </button>
                <button class="btn btn-outline-primary btn-sm me-2" onclick="exportPDF('${doc._id}','${doc.lokasi}')">
                   <i class="bi bi-printer"></i> PDF
                </button>
                ${(doc.status === 'Open' && canEdit) ? `
                   <button class="btn btn-success btn-sm" id="btnCloseInspection">
                     <i class="bi bi-check-lg"></i> Tandai Selesai (Closed)
                   </button>
                ` : ''}
            </div>
          </div>
        `;

        // Load Images Attachments
        const pc = qs('#photoContainer');
        if (doc._attachments && pc) {
            for (const att in doc._attachments) {
                const blob = await window._k3db.db.getAttachment(doc._id, att);
                const url = URL.createObjectURL(blob);
                pc.innerHTML += `
                    <div class="col-6 col-md-3 mb-2">
                        <a href="${url}" target="_blank">
                           <img src="${url}" class="img-fluid rounded border" style="height:100px; width:100%; object-fit:cover;">
                        </a>
                    </div>`;
            }
        } else {
            pc.innerHTML = '<div class="col-12 text-muted small fst-italic">Tidak ada foto.</div>';
        }

        // Handle Close Button
        qs('#btnCloseInspection')?.addEventListener('click', async () => {
             if(!confirm("Yakin ingin menutup temuan ini?")) return;
             doc.status = 'Closed';
             doc.komentar = doc.komentar || [];
             doc.komentar.push({
                 user: user.name, role: user.role, text: 'Status diubah menjadi CLOSED.', date: new Date().toISOString()
             });
             doc.synced = false;
             await window._k3db.db.put(doc);
             alert("Status diperbarui.");
             initDetail(user); // Reload
        });

        // Handle Comment Form Logic
        const commentForm = qs('#commentForm');
        if (commentForm) {
            // Remove old listener to avoid duplicate if re-initialized
            const newForm = commentForm.cloneNode(true);
            commentForm.parentNode.replaceChild(newForm, commentForm);
            
            newForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const input = qs('#f_comment');
                if(!input.value.trim()) return;
                
                // Fetch fresh doc to avoid conflict
                const freshDoc = await window._k3db.getInspection(id);
                freshDoc.komentar = freshDoc.komentar || [];
                freshDoc.komentar.push({
                    user: user.name, role: user.role, text: input.value.trim(), date: new Date().toISOString()
                });
                freshDoc.synced = false;
                await window._k3db.db.put(freshDoc);
                input.value = '';
                initDetail(user); // Reload UI
            });
        }

    } catch (e) {
        content.innerHTML = `<div class="alert alert-danger">Detail tidak ditemukan atau error: ${e.message}</div>`;
    }
}


/* ===========================
   USERS & SETTINGS
   =========================== */
async function initUsers(user) {
    if (!window._k3db?.listUsers) return;
    const body = qs('#userTableBody');
    const form = qs('#userForm');

    async function render() {
        const users = await window._k3db.listUsers();
        body.innerHTML = users.map(u => `
            <tr>
               <td>${u.name}</td>
               <td>${u.username}</td>
               <td><span class="badge bg-secondary">${u.role}</span></td>
               <td>
                 <button class="btn btn-sm btn-danger" onclick="deleteUser('${u._id}')"><i class="bi bi-trash"></i></button>
               </td>
            </tr>
        `).join('');
    }

    window.deleteUser = async (id) => {
        if(!confirm("Hapus user?")) return;
        try {
            const u = await window._k3db.db.get(id);
            u.deleted = true; 
            await window._k3db.db.put(u);
            render();
        } catch(e) { alert(e.message); }
    };

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const doc = {
            username: qs('#f_uname').value,
            name: qs('#f_name').value,
            role: qs('#f_role').value
        };
        try {
            await window._k3db.saveUser(doc);
            form.reset();
            render();
        } catch(e) { alert("Gagal simpan user: " + e.message); }
    });

    render();
}

function initSettings() {
    // Tombol di settings.html
    qs('#btnManualPull')?.addEventListener('click', async () => {
        try {
            await window._k3db.pull(); // Pastikan db.js punya method ini exposed di _k3db
            alert("Pull selesai.");
        } catch(e) { alert("Pull error: " + e.message); }
    });
    
    qs('#btnClearAll')?.addEventListener('click', async () => {
        if(!confirm("HAPUS DATABASE LOKAL? Data yang belum sync akan hilang!")) return;
        await window._k3db.db.destroy();
        location.reload();
    });
}


/* ===========================
   GLOBAL ACTIONS (Delete, PDF, Sync)
   =========================== */
window.handleDelete = async function (id, name) {
  if (!confirm(`Hapus data "${name}"?`)) return;
  try {
    await window._k3db.softDeleteInspection(id);
    alert("Data dihapus (soft delete).");
    // Kembali ke rekap atau refresh dashboard
    if(window.location.hash.includes('dashboard')) initDashboard();
    else router.navigateTo('rekap');
  } catch (e) {
    alert('Gagal menghapus: ' + e.message);
  }
};

window.exportPDF = async function (id, filename) {
  try {
      const doc = await window._k3db.getInspection(id);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF();
      
      pdf.setFontSize(16);
      pdf.text(`Laporan Inspeksi K3`, 14, 20);
      pdf.setFontSize(10);
      pdf.text(`Lokasi: ${doc.lokasi} - ${doc.area}`, 14, 30);
      pdf.text(`Inspector: ${doc.inspector}`, 14, 35);
      pdf.text(`Tanggal: ${doc.tanggal_inspeksi}`, 14, 40);
      
      pdf.setLineWidth(0.5);
      pdf.line(14, 45, 196, 45);
      
      pdf.text(`Uraian Temuan:`, 14, 55);
      const uraian = pdf.splitTextToSize(doc.uraian_temuan, 180);
      pdf.text(uraian, 14, 60);
      
      let nextY = 60 + (uraian.length * 5) + 10;
      pdf.text(`Rekomendasi:`, 14, nextY);
      const rekomen = pdf.splitTextToSize(doc.rekomendasi || '-', 180);
      pdf.text(rekomen, 14, nextY + 5);
      
      pdf.save(`${filename || 'Inspeksi'}.pdf`);
  } catch(e) {
      alert("Gagal export PDF: " + e.message);
  }
};

// SYNC BUTTON LISTENER
qs('#btnSync')?.addEventListener('click', async function() {
    const btn = this;
    if(!isOnline()) return alert("Anda sedang Offline. Cek koneksi internet.");
    
    // Jika db.js belum siap
    if(!window._k3db) return alert("Database belum siap. Refresh halaman.");

    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Sync...`;
    btn.disabled = true;

    try {
        // Panggil fungsi sync dari kode Anda yang lama (biasanya push dan pull)
        // Kita panggil manual via db.js endpoints jika ada method sync khusus,
        // Tapi di sini kita lakukan manual Push & Pull User & Inspection
        
        // 1. Push Users
        const usersToPush = await window._k3db.db.find({ selector: { type: 'user', synced: false } });
        for(let u of usersToPush.docs) {
             // Logic POST ke Server.js
             const payload = {...u}; delete payload._rev;
             await fetch('/api/users', { 
                 method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) 
             });
             u.synced = true; await window._k3db.db.put(u);
        }

        // 2. Pull Users
        const resUsers = await fetch('/api/users');
        const remoteUsers = await resUsers.json();
        for(let r of remoteUsers) {
             try { 
                 const local = await window._k3db.db.get(r._id); 
                 r._rev = local._rev; // update local
                 r.synced = true;
                 await window._k3db.db.put(r);
             } catch(e) { 
                 r.synced = true; await window._k3db.db.put(r); // insert new
             }
        }

        // 3. Push Inspections (Logic sederhana)
        const inspToPush = await window._k3db.db.find({ selector: { type: 'inspection', synced: false } });
        for(let doc of inspToPush.docs) {
             const payload = {...doc}; delete payload._rev; delete payload._attachments; // Kirim json saja dulu
             await fetch('/api/inspeksi/'+doc._id, { 
                 method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) 
             });
             // (Opsional: Kirim attachments terpisah jika server support)
             
             doc.synced = true; await window._k3db.db.put(doc);
        }

        // 4. Pull Inspections
        const resInsp = await fetch('/api/inspeksi');
        const remoteInsp = await resInsp.json();
        for(let r of remoteInsp) {
            if(r.deleted) continue; // Server mungkin kirim yg deleted
            try {
                const local = await window._k3db.db.get(r._id);
                // Konflik resolution sederhana: Server wins atau Local wins?
                // Kita anggap Server wins untuk Pull
                r._rev = local._rev;
                r.synced = true;
                await window._k3db.db.put(r);
            } catch(e) {
                r.synced = true;
                await window._k3db.db.put(r);
            }
        }
        
        alert("Sinkronisasi Berhasil!");
        location.reload(); 

    } catch(e) {
        console.error(e);
        alert("Sync Gagal: " + e.message);
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
});