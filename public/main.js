/* =========================================
   MINERBASAFE MAIN CONTROLLER - FIXED
   ========================================= */

// --- UTILS ---
const qs = (s) => document.querySelector(s);
const qsa = (s) => document.querySelectorAll(s);
const getUser = () => JSON.parse(localStorage.getItem('currentUser') || '{"username":"guest","role":"Inspector","name":"Guest"}');
const formatDate = (d) => d ? new Date(d).toLocaleString('id-ID', {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : '-';

/* =========================================
   NAVIGATION & UI LOGIC (FIXED)
   ========================================= */
function initNavigation() {
    const sidebar = qs('#sidebar');
    const overlay = qs('#sidebarOverlay');
    const btnToggle = qs('#toggleSidebar');
    const btnClose = qs('#btnCloseSidebar');

    function openMenu() {
        sidebar.classList.add('show');
        overlay.classList.add('show');
    }

    function closeMenu() {
        sidebar.classList.remove('show');
        overlay.classList.remove('show');
    }

    // Event Listeners
    btnToggle?.addEventListener('click', openMenu);
    btnClose?.addEventListener('click', closeMenu);
    overlay?.addEventListener('click', closeMenu);

    // Auto-close saat link diklik (Mobile Only)
    qsa('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth < 992) closeMenu();
        });
    });

    // Network Status Listener
    function updateOnlineStatus() {
        const dot = qs('#onlineIndicator');
        const text = qs('#syncStatusText');
        if(navigator.onLine) {
            dot.classList.add('online'); text.textContent = "Online";
        } else {
            dot.classList.remove('online'); text.textContent = "Offline";
        }
    }
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
}

// Init Nav segera
initNavigation();

// --- ROUTER HOOK ---
window.onPageLoaded = function(page) {
    const user = getUser();
    
    // Update Active Link
    qsa('.nav-link').forEach(l => l.classList.remove('active'));
    qs(`.nav-link[data-page="${page}"]`)?.classList.add('active');
    
    // Update User Info
    qs('#userNameDisplay').textContent = user.name;
    qs('#userRoleDisplay').textContent = user.role;
    qs('#userInitials').textContent = user.name.charAt(0).toUpperCase();

    // Set Page Title
    const titles = {
        'dashboard': ['Dashboard Eksekutif', 'Pantauan Real-time K3'],
        'input': ['Input Inspeksi', 'Formulir Standar Minerba'],
        'rekap': ['Rekapitulasi Data', 'Database Temuan & Tindak Lanjut'],
        'grafik': ['Analisa Data', 'Statistik Kinerja Keselamatan'],
        'detail': ['Detail Temuan', 'Verifikasi & Validasi'],
        'users': ['Manajemen Pengguna', 'Kontrol Akses Sistem'],
        'settings': ['Pengaturan', 'Konfigurasi Aplikasi']
    };
    if(titles[page]) {
        qs('#pageTitle').textContent = titles[page][0];
        qs('#pageSubtitle').textContent = titles[page][1];
    }

    // Init Page Logic
    if (page === 'dashboard') initDashboard();
    if (page === 'input') initInput(user);
    if (page === 'rekap') initRekap(user);
    if (page === 'detail') initDetail(user);
    if (page === 'users') initUsers(user);
    if (page === 'grafik') initGrafik();
    if (page === 'settings') initSettings();
};

/* ===========================
   PAGE FUNCTIONS
   =========================== */

async function initDashboard() {
    if(!window._k3db) return;
    try {
        const docs = await window._k3db.listInspections(20);
        
        // Safe check elements
        if(qs('#statTotal')) qs('#statTotal').textContent = docs.length;
        if(qs('#statOpen')) qs('#statOpen').textContent = docs.filter(d => d.status === 'Open').length;
        if(qs('#statClosed')) qs('#statClosed').textContent = docs.filter(d => d.status === 'Closed').length;
        if(qs('#statCritical')) qs('#statCritical').textContent = docs.filter(d => (d.kode_bahaya === 'AA' || d.risk_score >= 15) && d.status === 'Open').length;

        // Recent Table
        const tbody = qs('#dashboardRecent');
        if(tbody) {
            const recents = docs.slice(0, 5);
            if(recents.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">Belum ada data.</td></tr>';
            } else {
                tbody.innerHTML = recents.map(d => `
                    <tr>
                        <td>${formatDate(d.tanggal).split(',')[0]}</td>
                        <td><div class="text-truncate" style="max-width:120px">${d.lokasi}</div></td>
                        <td><span class="badge bg-${d.risk_level==='EXTREME'?'danger':d.risk_level==='HIGH'?'warning':'success'}">${d.risk_level}</span></td>
                        <td><span class="badge bg-${d.status==='Open'?'danger':'success'}">${d.status}</span></td>
                        <td><button class="btn btn-sm btn-light border" onclick="router.navigateTo('detail',{id:'${d._id}'})"><i class="bi bi-arrow-right"></i></button></td>
                    </tr>
                `).join('');
            }
        }
    } catch(e) { console.error("Dashboard error", e); }
}

function initInput(user) {
    const form = qs('#formMinerba');
    if(!form) return;

    qs('#f_inspector').value = user.name;
    qs('#f_inspectorId').value = user.username;
    
    // Set current datetime local compatible
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    qs('#f_tanggal').value = now.toISOString().slice(0,16);

    // Risk Calculator
    function calcRisk() {
        const s = parseInt(qs('#f_sev').value);
        const p = parseInt(qs('#f_prob').value);
        const score = s * p;
        qs('#f_risk_score').value = score;
        const label = qs('#f_risk_level');
        
        if(score >= 15) { label.value = 'EXTREME'; label.style.background='#dc3545'; label.style.color='#fff'; }
        else if(score >= 10) { label.value = 'HIGH'; label.style.background='#fd7e14'; label.style.color='#fff'; }
        else if(score >= 5) { label.value = 'MODERATE'; label.style.background='#ffc107'; label.style.color='#000'; }
        else { label.value = 'LOW'; label.style.background='#198754'; label.style.color='#fff'; }
    }
    qs('#f_sev').addEventListener('change', calcRisk);
    qs('#f_prob').addEventListener('change', calcRisk);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if(!form.checkValidity()) {
            e.stopPropagation();
            form.classList.add('was-validated');
            alert("Harap lengkapi semua kolom wajib.");
            return;
        }

        const btn = form.querySelector('button[type="submit"]');
        const origText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menyimpan...';
        btn.disabled = true;

        const doc = {
            inspector: user.name,
            inspector_id: user.username,
            tanggal: qs('#f_tanggal').value,
            shift: qs('#f_shift').value,
            lokasi: qs('#f_lokasi').value,
            perusahaan: qs('#f_perusahaan').value,
            cuaca: qs('#f_cuaca').value,
            uraian: qs('#f_uraian').value,
            kode_bahaya: qs('#f_kode_bahaya').value,
            severity: parseInt(qs('#f_sev').value),
            probability: parseInt(qs('#f_prob').value),
            risk_score: parseInt(qs('#f_risk_score').value),
            risk_level: qs('#f_risk_level').value,
            rekomendasi: qs('#f_rekomendasi').value,
            hirarki: qs('#f_hirarki').value,
            pic: qs('#f_pic').value,
            due_date: qs('#f_duedate').value,
            status: 'Open',
            created_at: new Date().toISOString()
        };

        const files = Array.from(qs('#f_foto').files);
        const attachments = await Promise.all(files.map(f => new Promise(resolve => {
            const r = new FileReader();
            r.onload = ev => resolve({ blob: ev.target.result.split(',')[1], type: f.type });
            r.readAsDataURL(f);
        })));

        try {
            await window._k3db.saveInspection(doc, attachments);
            alert("Data berhasil disimpan!");
            router.navigateTo('dashboard');
        } catch(err) {
            alert("Gagal simpan: " + err.message);
            btn.disabled = false; btn.innerHTML = origText;
        }
    });
}

async function initRekap(user) {
    const body = qs('#rekapTableBody');
    if(!body) return;
    try {
        const docs = await window._k3db.listInspections();
        if(docs.length === 0) {
            body.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted">Belum ada data.</td></tr>';
            return;
        }
        body.innerHTML = docs.map(d => `
            <tr>
                <td>${formatDate(d.tanggal).split(',')[0]}</td>
                <td><span class="fw-bold">${d.lokasi}</span><br><small class="text-muted">${d.perusahaan}</small></td>
                <td><span class="badge bg-${d.kode_bahaya==='AA'?'dark':d.kode_bahaya==='A'?'danger':'warning'}">${d.kode_bahaya}</span></td>
                <td>${d.risk_level} (${d.risk_score})</td>
                <td>${d.uraian.substring(0,40)}...</td>
                <td>${d.pic || '-'}</td>
                <td><span class="badge bg-${d.status==='Open'?'danger':'success'}">${d.status}</span></td>
                <td><button class="btn btn-sm btn-light border" onclick="router.navigateTo('detail',{id:'${d._id}'})">Detail</button></td>
            </tr>
        `).join('');
    } catch(e) { console.error(e); }
}

async function initDetail(user) {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const id = params.get('id');
    if(!id) return;

    try {
        const doc = await window._k3db.getInspection(id);
        const content = qs('#detailContent');
        
        content.innerHTML = `
            <div class="card card-pro p-4 mb-4">
                <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
                    <div>
                        <h5 class="fw-bold mb-1">${doc.lokasi}</h5>
                        <small class="text-muted">${doc.perusahaan} | ${doc.shift}</small>
                    </div>
                    <span class="badge bg-${doc.status==='Open'?'danger':'success'} px-3 py-2 rounded-pill">${doc.status}</span>
                </div>
                
                <div class="row g-4 mb-4">
                    <div class="col-md-6">
                        <table class="table table-sm table-borderless small">
                            <tr><td class="text-muted w-25">Tanggal</td><td class="fw-bold">${formatDate(doc.tanggal)}</td></tr>
                            <tr><td class="text-muted">Inspector</td><td class="fw-bold">${doc.inspector}</td></tr>
                            <tr><td class="text-muted">Cuaca</td><td>${doc.cuaca}</td></tr>
                        </table>
                    </div>
                    <div class="col-md-6 text-md-end">
                        <div class="p-3 rounded border bg-light d-inline-block text-start" style="min-width:200px">
                            <small class="text-muted d-block mb-1">Risk Profile</small>
                            <div class="fw-bold fs-5 text-${doc.risk_level==='EXTREME'?'danger':'warning'}">${doc.risk_level}</div>
                            <small>Score: ${doc.risk_score} | Kode: ${doc.kode_bahaya}</small>
                        </div>
                    </div>
                </div>

                <div class="alert alert-secondary border-0 bg-opacity-10">
                    <h6 class="fw-bold small text-uppercase text-muted"><i class="bi bi-exclamation-triangle me-2"></i>Uraian Temuan</h6>
                    <p class="mb-0 text-dark">${doc.uraian}</p>
                </div>
                
                <div class="alert alert-primary border-0 bg-opacity-10">
                    <h6 class="fw-bold small text-uppercase text-muted"><i class="bi bi-tools me-2"></i>Rekomendasi / Tindakan</h6>
                    <p class="mb-2 text-dark">${doc.rekomendasi}</p>
                    <div class="d-flex gap-3 small text-muted border-top pt-2 border-primary border-opacity-25">
                        <span><strong>PIC:</strong> ${doc.pic || '-'}</span>
                        <span><strong>Due Date:</strong> ${doc.due_date || '-'}</span>
                        <span><strong>Hirarki:</strong> ${doc.hirarki || '-'}</span>
                    </div>
                </div>

                <div class="mt-4">
                     <h6 class="fw-bold small text-muted border-bottom pb-2">Bukti Foto</h6>
                     <div class="row g-2" id="detailPhotos"></div>
                </div>

                <div class="d-flex gap-2 justify-content-end mt-5 pt-3 border-top">
                    <button class="btn btn-outline-dark" onclick="window.exportPDF('${doc._id}')"><i class="bi bi-printer me-2"></i>Cetak PDF</button>
                    ${doc.status==='Open' ? `<button class="btn btn-success" onclick="closeInsp('${doc._id}')"><i class="bi bi-check-lg me-2"></i>Selesai</button>` : ''}
                </div>
            </div>
        `;

        // Render Photos
        const photoCont = qs('#detailPhotos');
        if(doc._attachments) {
            for(const k in doc._attachments) {
                const blob = await window._k3db.db.getAttachment(doc._id, k);
                const url = URL.createObjectURL(blob);
                photoCont.innerHTML += `
                    <div class="col-6 col-md-3">
                        <a href="${url}" target="_blank">
                            <img src="${url}" class="img-fluid rounded border shadow-sm" style="height:120px; width:100%; object-fit:cover;">
                        </a>
                    </div>
                `;
            }
        } else {
            photoCont.innerHTML = '<div class="col-12 text-muted small fst-italic">Tidak ada foto terlampir.</div>';
        }

        window.closeInsp = async (id) => {
            if(!confirm("Tandai temuan ini sebagai selesai (Closed)?")) return;
            doc.status = 'Closed';
            doc.synced = false;
            await window._k3db.db.put(doc);
            initDetail(user);
        };
    } catch(e) {
        qs('#detailContent').innerHTML = `<div class="alert alert-danger">Gagal memuat: ${e.message}</div>`;
    }
}

// Global Export PDF
window.exportPDF = async (id) => {
    try {
        const doc = await window._k3db.getInspection(id);
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();
        
        pdf.setFontSize(16); pdf.setFont("helvetica", "bold");
        pdf.text("LAPORAN INSPEKSI K3 PERTAMBANGAN", 105, 20, { align: "center" });
        
        pdf.autoTable({
            startY: 30,
            body: [
                ['Lokasi', doc.lokasi],
                ['Tanggal', formatDate(doc.tanggal)],
                ['Inspector', doc.inspector],
                ['Perusahaan', doc.perusahaan],
                ['Risk Level', `${doc.risk_level} (${doc.risk_score})`]
            ],
            theme: 'plain'
        });
        
        pdf.setFontSize(11); pdf.setFont("helvetica", "bold");
        pdf.text("Uraian Temuan:", 14, pdf.lastAutoTable.finalY + 10);
        pdf.setFont("helvetica", "normal");
        const uraian = pdf.splitTextToSize(doc.uraian, 180);
        pdf.text(uraian, 14, pdf.lastAutoTable.finalY + 16);
        
        let y = pdf.lastAutoTable.finalY + 16 + (uraian.length * 6);
        pdf.setFont("helvetica", "bold");
        pdf.text("Rekomendasi:", 14, y + 10);
        pdf.setFont("helvetica", "normal");
        const reko = pdf.splitTextToSize(doc.rekomendasi, 180);
        pdf.text(reko, 14, y + 16);
        
        // Tanda Tangan
        y += 40 + (reko.length * 6);
        pdf.setLineWidth(0.1);
        pdf.rect(20, y, 60, 25);
        pdf.text("Dibuat Oleh", 50, y+5, {align:"center"});
        pdf.text(`(${doc.inspector})`, 50, y+20, {align:"center"});
        
        pdf.rect(130, y, 60, 25);
        pdf.text("Diketahui (KTT/PJO)", 160, y+5, {align:"center"});
        pdf.text("(...........................)", 160, y+20, {align:"center"});

        pdf.save(`Laporan_${doc._id}.pdf`);
    } catch(e) { alert("PDF Error: "+e.message); }
};

// Sync Handler
qs('#btnSync')?.addEventListener('click', async () => {
    const btn = qs('#btnSync');
    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Syncing...';
    try {
        const stats = await window._k3db.sync();
        alert(`Sinkronisasi Selesai.\nUpload: ${stats.pushed}\nDownload: ${stats.pulled}`);
        location.reload();
    } catch(e) {
        alert("Sync Gagal: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = orig;
    }
});

function initUsers(){} // Placeholder
function initSettings(){} // Placeholder
function initGrafik(){} // Placeholder: gunakan kode grafik sebelumnya jika perlu