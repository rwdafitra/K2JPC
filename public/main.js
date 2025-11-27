// main.js - handles page lifecycle, binds forms, renders charts & tables
window.onPageLoaded = function(page) {
    // ... (logic untuk sidebar dan judul tetap sama)
    document.getElementById('content').setAttribute('data-page', page);
    document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
    document.querySelector(`.sidebar a[data-page="${page}"]`)?.classList.add('active');

    if (page === 'dashboard') initDashboard();
    if (page === 'input') initInput();
    if (page === 'rekap') initRekap();
    if (page === 'detail') initDetail(); // <-- FUNGSI BARU
    if (page === 'grafik') initGrafik();
    if (page === 'users') initUsers();  // <-- FUNGSI BARU
    if (page === 'settings') initSettings();
};

// common ui helpers
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }
function isOnline() { return navigator.onLine; }

function formatDate(isoString) {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// --- LOGIKA SINKRONISASI API ---

/**
 * Mengirim data yang belum tersinkronisasi (synced: false) ke API Express. (PUSH)
 */
async function pushDataToAPI() {
    if (!window._k3db || !isOnline()) return 0;
    let successCount = 0;
    
    try {
        const toSync = await window._k3db.db.find({ 
            selector: { type: 'inspection', synced: false }, 
            limit: 9999 
        });

        if (toSync.docs.length === 0) return 0;
        
        for (const doc of toSync.docs) {
            const docToSend = { ...doc };
            delete docToSend._rev; // Penting untuk CouchDB
            
            // Tentukan method: PUT jika dokumen sudah memiliki remote_id (sudah pernah di-sync/update)
            const method = doc.remote_id ? 'PUT' : 'POST'; 
            const url = doc.remote_id ? `${window._k3db.API_URL}/${doc._id}` : window._k3db.API_URL;

            try {
                const res = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(docToSend)
                });
                
                if (res.ok) {
                    const json = await res.json();
                    
                    const localDoc = await window._k3db.db.get(doc._id);
                    localDoc.synced = true;
                    // Simpan _id dari server jika ini POST (dokumen baru)
                    if (method === 'POST') localDoc.remote_id = json.id; 
                    
                    await window._k3db.db.put(localDoc);
                    successCount++;
                } else {
                    console.error(`Gagal unggah dokumen ${doc._id} (${method}): ${res.statusText}`);
                }
            } catch (fetchErr) {
                console.error(`Fetch error untuk dokumen ${doc._id}:`, fetchErr);
            }
        }
    } catch (error) {
        console.error('Error saat pushDataToAPI:', error);
    }
    return successCount;
}

// (Fungsi pullDataFromAPI sama seperti sebelumnya)
async function pullDataFromAPI() {
    if (!window._k3db || !isOnline()) return;
    
    // UI Feedback for Sync... (omitted for brevity, assume similar to previous)
    
    try {
        const res = await fetch(window._k3db.API_URL); 
        if (!res.ok) throw new Error(`Server error: ${res.status}`);

        let remoteDocs = await res.json();

        const docsToPut = [];
        for (const remoteDoc of remoteDocs) {
            remoteDoc.synced = true;
            // Gunakan _id server sebagai _id lokal agar tidak terjadi duplikasi saat pull
            // ASUMSI: server menggunakan id unik. PouchDB lokal akan menyimpan data dari server
            
            try {
                const localDoc = await window._k3db.db.get(remoteDoc._id);
                remoteDoc._rev = localDoc._rev; 
            } catch (e) {
                // Dokumen baru dari server
                delete remoteDoc._rev;
            }
            docsToPut.push(remoteDoc);
        }

        await window._k3db.db.bulkDocs(docsToPut);
        console.log(`Berhasil pull ${remoteDocs.length} dokumen.`);

    } catch (error) {
        console.error('Error saat pullDataFromAPI:', error);
        alert(`Gagal menarik data dari server: ${error.message}`);
    } 
    // UI Feedback cleanup... (omitted for brevity)
}

document.getElementById('btnSync')?.addEventListener('click', async () => {
    if (!isOnline()) return alert('Anda sedang offline. Sinkronisasi dibatalkan.');
    
    const pushCount = await pushDataToAPI();
    await pullDataFromAPI();
    
    let message = `Sinkronisasi selesai! Data terbaru ditarik.`;
    if (pushCount > 0) message = `Sinkronisasi selesai! ${pushCount} dokumen diunggah/diupdate, dan data terbaru ditarik.`;
    alert(message);
    router.navigateTo('dashboard');
});


// ------------------------------------
// --- LOGIKA PER PAGE INITIATION ---
// ------------------------------------

/**
 * Inisialisasi halaman Detail (Komentar, Tindak Lanjut, Penutupan)
 */
async function initDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const docId = urlParams.get('id');
    const cardBody = qs('#detailCardBody');
    const form = qs('#formKomentar');
    
    document.getElementById('pageTitle').textContent = 'Detail & Tindak Lanjut';
    document.getElementById('pageSubtitle').textContent = `Inspeksi ID: ${docId}`;

    if (!docId) return cardBody.innerHTML = '<div class="alert alert-danger">ID Inspeksi tidak ditemukan.</div>';

    let doc;
    try {
        doc = await window._k3db.getInspection(docId);
        renderDetail(doc, cardBody);
    } catch (e) {
        return cardBody.innerHTML = `<div class="alert alert-danger">Data inspeksi (${docId}) tidak ditemukan di lokal. Coba Sync.</div>`;
    }

    // Render Komentar yang sudah ada
    const actionsList = qs('#actionsList');
    if (actionsList) {
        actionsList.innerHTML = (doc.actions || []).map(action => `
            <li class="list-group-item list-group-item-${action.type === 'comment' ? 'light' : 'success'}">
                <p class="mb-1 small">
                    <span class="badge bg-secondary">${action.user || 'Unknown'} (${action.role || 'N/A'})</span>
                    <span class="float-end text-muted">${formatDate(action.timestamp)}</span>
                </p>
                <strong>${action.type === 'closed' ? 'TUTUP TEMUAN' : 'Komentar Atasan'}:</strong> ${action.note}
            </li>
        `).join('');
    }

    // Handle Form Komentar/Status Update
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const note = qs('#f_komentar').value;
        const newStatus = qs('#f_status_update').value;
        
        if (!note) return alert('Komentar tidak boleh kosong.');
        
        const action = {
            timestamp: new Date().toISOString(),
            user: 'Supervisor/Atasan (Mock)', // Ganti dengan user login sebenarnya
            role: 'Supervisor',
            type: (newStatus === 'Closed') ? 'closed' : 'comment',
            note: note,
        };

        const updatedDoc = {
            actions: [...(doc.actions || []), action],
            status: newStatus,
            resolution_date: (newStatus === 'Closed') ? new Date().toISOString() : doc.resolution_date,
        };

        try {
            await window._k3db.updateInspection(docId, updatedDoc);
            alert('Update status/komentar berhasil disimpan secara lokal!');
            await pushDataToAPI(); // Sync perubahan segera
            router.navigateTo(`detail?id=${docId}`); // Reload page
        } catch (e) {
            console.error(e);
            alert(`Gagal update data: ${e.message}`);
        }
    });
}

function renderDetail(doc, targetElement) {
    targetElement.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <h6>Detail Temuan</h6>
                <table class="table table-sm small table-bordered">
                    <tr><th>Lokasi</th><td>${doc.lokasi || '-'}</td></tr>
                    <tr><th>Inspector</th><td>${doc.inspector || '-'} (${doc.jabatan || '-'})</td></tr>
                    <tr><th>Tgl. Inspeksi</th><td>${formatDate(doc.tanggal_inspeksi)}</td></tr>
                    <tr><th>Uraian Temuan</th><td>${doc.uraian_temuan || '-'}</td></tr>
                    <tr><th>Rekomendasi TL</th><td>${doc.rekomendasi || '-'}</td></tr>
                    <tr><th>PJ & Due Date</th><td>${doc.penanggung_jawab || '-'} / ${doc.due_date || '-'}</td></tr>
                </table>
            </div>
            <div class="col-md-6">
                <h6>Analisis Risiko & Status</h6>
                <table class="table table-sm small table-bordered">
                    <tr><th>Severity (S)</th><td>${doc.severity}</td></tr>
                    <tr><th>Likelihood (L)</th><td>${doc.likelihood}</td></tr>
                    <tr><th>Risk Score (SxL)</th><td><span class="badge bg-${(doc.risk_score || 0) >= 15 ? 'danger' : (doc.risk_score || 0) >= 8 ? 'warning' : 'success'}">${doc.risk_score}</span></td></tr>
                    <tr><th>Status Temuan</th><td><span class="badge bg-${doc.status === 'Open' ? 'warning' : 'success'} fs-6">${doc.status}</span></td></tr>
                    <tr><th>Sync Status</th><td>${doc.synced ? '<i class="bi bi-cloud-check-fill text-success"></i> Synced' : '<i class="bi bi-cloud-upload-fill text-danger"></i> Unsynced'}</td></tr>
                </table>
            </div>
        </div>
        <h6 class="mt-3 border-bottom pb-2">Dokumentasi Foto</h6>
        ${doc._attachments ? Object.keys(doc._attachments).map(attName => 
            `<img src="/api/attachment/${doc._id}/${attName}" class="img-thumbnail me-2 mb-2" style="width: 150px; height: 150px; object-fit: cover;">`
        ).join('') : '<p class="text-muted small">Tidak ada foto terlampir.</p>'}
        <h6 class="mt-3 border-bottom pb-2">Riwayat Tindak Lanjut & Komentar</h6>
        <ul id="actionsList" class="list-group list-group-flush mb-3"></ul>
    `;
}

// ... (initDashboard, initInput, initRekap, initGrafik, initSettings) tetap sama atau diperbarui sedikit) ...

/**
 * Inisialisasi halaman Users (Daftar & Status User)
 */
async function initUsers() {
    document.getElementById('pageTitle').textContent = 'Manajemen Users (Mock)';
    document.getElementById('pageSubtitle').textContent = 'Daftar dan Status Akses Inspektor/Supervisor';
    
    const tableBody = qs('#usersTableBody');
    if (!tableBody) return;
    
    try {
        const res = await fetch('/api/users');
        const users = await res.json();
        
        tableBody.innerHTML = users.map(user => `
            <tr>
                <td>${user.name}</td>
                <td><span class="badge bg-secondary">${user.role}</span></td>
                <td><span class="badge bg-${user.status === 'Active' ? 'success' : 'danger'}">${user.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" disabled><i class="bi bi-person-gear"></i> Edit Status</button>
                </td>
            </tr>
        `).join('');

        qs('#userAlert').innerHTML = `<div class="alert alert-info small"><i class="bi bi-info-circle-fill"></i> **Peringatan:** Fitur Edit Status dan daftar user ini adalah *Mock* (placeholder) dan tidak terhubung ke sistem autentikasi database.</div>`;

    } catch (e) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Gagal memuat daftar user dari API.</td></tr>`;
    }
}
// ... (initSettings - diperbaiki untuk lebih fungsional) ...

/**
 * Inisialisasi halaman Settings
 */
function initSettings() {
    document.getElementById('pageTitle').textContent = 'Pengaturan Aplikasi & Data';
    document.getElementById('pageSubtitle').textContent = 'Manajemen Cache dan Koneksi Server';
    
    const content = qs('#settingsCardBody'); 
    
    content.innerHTML = `
        <div class="alert alert-info small">
            <i class="bi bi-info-circle-fill"></i> Status PouchDB Lokal: **OK**. Database: **${window._k3db.db.name}**
        </div>
        <div class="mt-3">
            <h6>Maintenance Data Lokal (PouchDB)</h6>
            <p class="small text-muted">Aksi ini mempengaruhi data yang tersimpan di browser Anda.</p>
            <button id="btnClearCache" class="btn btn-danger btn-sm me-2"><i class="bi bi-trash"></i> Hapus Semua Data Lokal</button>
            <button id="btnManualPull" class="btn btn-secondary btn-sm"><i class="bi bi-arrow-down-up"></i> Tarik Ulang Data Server</button>
        </div>
    `;
  
    // Listener untuk Clear Cache
    qs('#btnClearCache')?.addEventListener('click', async () => {
        if (confirm('Yakin ingin menghapus semua data inspeksi lokal? Data yang BELUM disinkronkan akan hilang secara permanen!')) {
            await window._k3db.db.destroy();
            alert('Data lokal berhasil dihapus. Silakan refresh halaman.');
            window.location.reload();
        }
    });
    
    // Listener untuk Pull data manual
    qs('#btnManualPull')?.addEventListener('click', async () => {
      await pullDataFromAPI();
      alert('Proses tarik data selesai. Cek Rekap Data.');
    });
}