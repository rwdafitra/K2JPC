/* =========================================
   MINERBASAFE MAIN CONTROLLER - ENTERPRISE
   ========================================= */

// --- UTILS ---
const qs = (s) => document.querySelector(s);
const getUser = () => JSON.parse(localStorage.getItem('currentUser') || '{"username":"guest","role":"Inspector","name":"Guest"}');
const formatDate = (d) => d ? new Date(d).toLocaleString('id-ID') : '-';

// --- ROUTER HOOK ---
window.onPageLoaded = function(page) {
    const user = getUser();
    
    // Update Sidebar UI
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    qs(`.nav-link[data-page="${page}"]`)?.classList.add('active');
    
    qs('#userNameDisplay').textContent = user.name;
    qs('#userRoleDisplay').textContent = user.role;
    qs('#userInitials').textContent = user.name.charAt(0).toUpperCase();

    // Init Page Logic
    if (page === 'dashboard') initDashboard();
    if (page === 'input') initInput(user);
    if (page === 'rekap') initRekap(user);
    if (page === 'detail') initDetail(user);
    if (page === 'users') initUsers(user);
    if (page === 'grafik') initGrafik();
    
    // Auto-update header
    const titles = {
        'dashboard': ['Dashboard Eksekutif', 'Pantauan Real-time K3'],
        'input': ['Input Inspeksi', 'Formulir Standar Minerba'],
        'rekap': ['Rekapitulasi Data', 'Database Temuan & Tindak Lanjut'],
        'grafik': ['Analisa Data', 'Statistik Kinerja Keselamatan'],
        'detail': ['Detail Temuan', 'Verifikasi & Validasi'],
        'users': ['Manajemen Pengguna', 'Kontrol Akses Sistem']
    };
    if(titles[page]) {
        qs('#pageTitle').textContent = titles[page][0];
        qs('#pageSubtitle').textContent = titles[page][1];
    }
};

/* ===========================
   DASHBOARD
   =========================== */
async function initDashboard() {
    if(!window._k3db) return;
    try {
        const docs = await window._k3db.listInspections();
        const total = docs.length;
        const open = docs.filter(d => d.status === 'Open').length;
        const closed = docs.filter(d => d.status === 'Closed').length;
        const critical = docs.filter(d => d.kode_bahaya === 'AA' || d.risk_score >= 15).length; // AA is Critical in Minerba

        // Render Cards (Inject HTML into dashboard page placeholders)
        // Note: Pastikan di dashboard.html ada ID ini
        if(qs('#statTotal')) qs('#statTotal').textContent = total;
        if(qs('#statOpen')) qs('#statOpen').textContent = open;
        if(qs('#statCritical')) qs('#statCritical').textContent = critical;
        if(qs('#statClosed')) qs('#statClosed').textContent = closed;

    } catch(e) { console.error("Dashboard error", e); }
}

/* ===========================
   INPUT FORM LOGIC
   =========================== */
function initInput(user) {
    const form = qs('#formMinerba');
    if(!form) return;

    // Pre-fill
    qs('#f_inspector').value = user.name;
    qs('#f_inspectorId').value = user.username;
    
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    qs('#f_tanggal').value = now.toISOString().slice(0,16);

    // Risk Matrix Calculator (5x5)
    function calcRisk() {
        const s = parseInt(qs('#f_sev').value);
        const p = parseInt(qs('#f_prob').value);
        const score = s * p;
        qs('#f_risk_score').value = score;
        
        const label = qs('#f_risk_level');
        if(score >= 15) { label.value = 'EXTREME'; label.style.background = '#dc3545'; label.style.color = '#fff'; }
        else if(score >= 10) { label.value = 'HIGH'; label.style.background = '#fd7e14'; label.style.color = '#fff'; }
        else if(score >= 5) { label.value = 'MODERATE'; label.style.background = '#ffc107'; label.style.color = '#000'; }
        else { label.value = 'LOW'; label.style.background = '#198754'; label.style.color = '#fff'; }
    }
    qs('#f_sev')?.addEventListener('change', calcRisk);
    qs('#f_prob')?.addEventListener('change', calcRisk);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if(!form.checkValidity()) {
            e.stopPropagation();
            form.classList.add('was-validated');
            alert("Mohon lengkapi semua data wajib.");
            return;
        }

        if(!confirm("Apakah data sudah benar?")) return;

        const btn = form.querySelector('button[type="submit"]');
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
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

        // Attachments
        const files = Array.from(qs('#f_foto').files);
        const attachments = await Promise.all(files.map(f => new Promise(resolve => {
            const r = new FileReader();
            r.onload = ev => resolve({ blob: ev.target.result.split(',')[1], type: f.type });
            r.readAsDataURL(f);
        })));

        try {
            await window._k3db.saveInspection(doc, attachments);
            alert("Inspeksi Berhasil Disimpan!");
            router.navigateTo('dashboard');
        } catch(err) {
            alert("Gagal: " + err.message);
            btn.disabled = false; btn.textContent = 'SIMPAN INSPEKSI';
        }
    });
}

/* ===========================
   REKAP & DELETE
   =========================== */
async function initRekap(user) {
    const body = qs('#rekapTableBody');
    if(!body) return;
    
    const docs = await window._k3db.listInspections();
    
    if(docs.length === 0) {
        body.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted">Belum ada data.</td></tr>';
        return;
    }

    body.innerHTML = docs.map(d => `
        <tr>
            <td>${formatDate(d.tanggal)}</td>
            <td>${d.lokasi}<br><small class="text-muted">${d.perusahaan}</small></td>
            <td><span class="badge bg-${getBadgeColor(d.kode_bahaya)}">${d.kode_bahaya}</span></td>
            <td>${d.risk_level} (${d.risk_score})</td>
            <td>${d.uraian.substring(0,40)}...</td>
            <td>${d.pic || '-'}</td>
            <td><span class="badge bg-${d.status==='Open'?'danger':'success'}">${d.status}</span></td>
            <td>
                <button class="btn btn-sm btn-light border" onclick="router.navigateTo('detail',{id:'${d._id}'})"><i class="bi bi-eye"></i></button>
            </td>
        </tr>
    `).join('');
}

function getBadgeColor(code) {
    if(code === 'AA') return 'dark';
    if(code === 'A') return 'danger';
    if(code === 'B') return 'warning';
    return 'info';
}

/* ===========================
   DETAIL & CLOSE & EXPORT
   =========================== */
async function initDetail(user) {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const id = params.get('id');
    if(!id) return;
    
    const doc = await window._k3db.getInspection(id);
    const content = qs('#detailContent');
    
    // Render Detail (Simple version for brevity, but make it clean)
    content.innerHTML = `
        <div class="card card-pro p-4">
            <div class="d-flex justify-content-between mb-3">
                <h5 class="fw-bold">${doc.lokasi}</h5>
                <span class="badge bg-${doc.status==='Open'?'danger':'success'} fs-6">${doc.status}</span>
            </div>
            
            <div class="row mb-4">
                <div class="col-md-6">
                    <p><strong>Inspector:</strong> ${doc.inspector}<br>
                    <strong>Tanggal:</strong> ${formatDate(doc.tanggal)}<br>
                    <strong>Perusahaan:</strong> ${doc.perusahaan}</p>
                </div>
                <div class="col-md-6 text-md-end">
                    <div class="p-3 bg-light rounded d-inline-block text-start">
                        <small>Risk Level</small>
                        <div class="fw-bold text-${doc.risk_level==='EXTREME'?'danger':'warning'}">${doc.risk_level} (Score: ${doc.risk_score})</div>
                        <small>Kode Bahaya: ${doc.kode_bahaya}</small>
                    </div>
                </div>
            </div>
            
            <h6 class="border-bottom pb-2">Uraian & Rekomendasi</h6>
            <div class="mb-3">
                <p class="mb-1 fw-bold text-muted small">TEMUAN:</p>
                <p>${doc.uraian}</p>
            </div>
            <div class="mb-3">
                <p class="mb-1 fw-bold text-muted small">REKOMENDASI:</p>
                <p>${doc.rekomendasi}</p>
                <small class="text-danger">Due Date: ${doc.due_date} | PIC: ${doc.pic}</small>
            </div>

            <div class="d-flex gap-2 justify-content-end mt-4">
                <button class="btn btn-outline-dark" onclick="exportPDF('${doc._id}')"><i class="bi bi-printer"></i> Export PDF (TTD)</button>
                ${(doc.status === 'Open') ? `<button class="btn btn-success" onclick="closeInsp('${doc._id}')">Tandai Selesai</button>` : ''}
            </div>
        </div>
    `;
    
    // Function Close
    window.closeInsp = async (id) => {
        if(!confirm("Tutup temuan ini?")) return;
        doc.status = 'Closed';
        doc.synced = false;
        await window._k3db.db.put(doc);
        initDetail(user);
    };
}

// --- EXPORT PDF WITH SIGNATURE ---
window.exportPDF = async (id) => {
    const doc = await window._k3db.getInspection(id);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    
    // Header
    pdf.setFontSize(16); pdf.setFont("helvetica", "bold");
    pdf.text("LAPORAN INSPEKSI K3 PERTAMBANGAN", 105, 20, { align: "center" });
    pdf.setFontSize(10); pdf.setFont("helvetica", "normal");
    pdf.text("Sesuai Kaidah Teknis Minerba", 105, 26, { align: "center" });
    
    // Line
    pdf.setLineWidth(0.5); pdf.line(15, 30, 195, 30);
    
    // Data Table using autoTable
    pdf.autoTable({
        startY: 35,
        head: [['Data Umum', 'Detail']],
        body: [
            ['Tanggal Inspeksi', formatDate(doc.tanggal)],
            ['Lokasi / Area', doc.lokasi],
            ['Perusahaan', doc.perusahaan],
            ['Inspector', doc.inspector],
            ['Shift / Cuaca', `${doc.shift} / ${doc.cuaca}`]
        ],
        theme: 'grid', styles: { fontSize: 9 }
    });

    pdf.autoTable({
        startY: pdf.lastAutoTable.finalY + 10,
        head: [['Analisa Risiko', 'Nilai']],
        body: [
            ['Kode Bahaya', doc.kode_bahaya],
            ['Risk Level', `${doc.risk_level} (Score: ${doc.risk_score})`],
            ['Hirarki Kontrol', doc.hirarki]
        ],
        theme: 'grid', styles: { fontSize: 9 }
    });

    // Content Text
    let y = pdf.lastAutoTable.finalY + 15;
    pdf.setFont("helvetica", "bold"); pdf.text("Uraian Temuan:", 15, y);
    pdf.setFont("helvetica", "normal"); 
    const uraian = pdf.splitTextToSize(doc.uraian, 180);
    pdf.text(uraian, 15, y+5);
    
    y += 10 + (uraian.length * 5);
    pdf.setFont("helvetica", "bold"); pdf.text("Rekomendasi / Tindakan:", 15, y);
    pdf.setFont("helvetica", "normal");
    const reko = pdf.splitTextToSize(doc.rekomendasi, 180);
    pdf.text(reko, 15, y+5);

    // SIGNATURE BOX (Fitur No. 5)
    y += 20 + (reko.length * 5);
    
    // Kotak Tanda Tangan
    pdf.setLineWidth(0.1);
    
    // Kiri: Dibuat Oleh
    pdf.rect(20, y, 60, 30); 
    pdf.text("Dibuat Oleh (Inspector)", 50, y+5, { align: "center" });
    pdf.text(`(${doc.inspector})`, 50, y+25, { align: "center" });
    
    // Kanan: Diketahui Oleh
    pdf.rect(130, y, 60, 30);
    pdf.text("Diketahui Oleh (KTT/Mgr)", 160, y+5, { align: "center" });
    pdf.text("(...................................)", 160, y+25, { align: "center" });

    pdf.save(`Laporan_Inspeksi_${doc._id}.pdf`);
};

/* ===========================
   USERS & GRAFIK (Placeholder Logic)
   =========================== */
async function initUsers(user) { /* Logic sama, gunakan _k3db.listUsers */ }
async function initGrafik() { /* Logic sama, gunakan _k3db.listInspections */ }

// Sync Button Action
qs('#btnSync')?.addEventListener('click', async () => {
    const btn = qs('#btnSync');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sync...';
    try {
        const stats = await window._k3db.sync();
        alert(`Sync Selesai!\nUpload: ${stats.pushed}\nDownload: ${stats.pulled}`);
        location.reload();
    } catch(e) {
        alert("Gagal Sync: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-cloud-sync"></i> Sync Data';
    }
});