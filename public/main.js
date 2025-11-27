// main.js - handles page lifecycle, binds forms, renders charts & tables
// This file expects router to load pages from /pages/*.html

// --- SETUP ROUTER HOOK ---
window.onPageLoaded = function(page) {
  // call per-page init here
  if (page === 'dashboard') initDashboard();
  if (page === 'input') initInput();
  if (page === 'rekap') initRekap();
  if (page === 'grafik') initGrafik();
  if (page === 'users') initUsers();
  if (page === 'settings') initSettings();
};

// --- COMMON UI/DATA HELPERS ---
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

function isOnline() {
    return navigator.onLine;
}

// Helper untuk format tanggal
function formatDate(dateString) {
    if (!dateString) return 'Belum pernah sync';
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString('id-ID', options);
}

// --- LOGIKA SINKRONISASI API BARU (PUSH & PULL) ---
// Note: Logic ini memanggil fungsi dari db.js dan API di server.js

/**
 * Mengirim data yang belum tersinkronisasi (synced: false) ke API Express. (PUSH)
 * @returns {number} Jumlah dokumen yang berhasil diunggah.
 */
async function pushDataToAPI() {
    if (!window._k3db || !isOnline()) return 0;

    let successCount = 0;
    
    try {
        // 1. Cari semua dokumen yang belum disinkronisasi
        const toSync = await window._k3db.db.find({ 
            selector: { type: 'inspection', synced: { $ne: true } }, 
            limit: 999 
        });

        if (toSync.docs.length === 0) {
            console.log("Tidak ada data baru untuk diunggah.");
            return 0;
        }

        console.log(`Mencoba mengunggah ${toSync.docs.length} dokumen...`);

        // 2. Unggah setiap dokumen ke server
        for (const doc of toSync.docs) {
            // Hapus _rev dan _attachments dari data yang di-POST ke server (karena server yang akan buat _rev)
            const docToPost = { ...doc };
            delete docToPost._rev;
            delete docToPost._attachments;

            const response = await fetch(window._k3db.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(docToPost)
            });

            if (response.ok) {
                const result = await response.json();
                
                // 3. Tandai dokumen sudah synced di PouchDB
                const localDoc = await window._k3db.db.get(doc._id);
                localDoc.synced = true;
                localDoc.remote_id = result.id; // Simpan ID dari CouchDB
                await window._k3db.db.put(localDoc); 
                successCount++;
            } else {
                console.error(`Gagal unggah dokumen ${doc._id}:`, await response.json());
            }
        }
        return successCount;

    } catch (e) {
        console.error("Kesalahan saat push data:", e);
        return 0;
    }
}


/**
 * Menarik semua data inspeksi dari server ke PouchDB lokal. (PULL)
 */
async function pullDataFromAPI() {
    if (!window._k3db || !isOnline()) return false;
    
    try {
        console.log("Mulai menarik semua data dari server...");
        const response = await fetch(window._k3db.API_URL);
        if (!response.ok) throw new Error("Gagal terhubung ke API Server.");
        
        const remoteDocs = await response.json();
        let updatedCount = 0;
        
        // Simpan/Update setiap dokumen yang ditarik ke PouchDB
        for (const remoteDoc of remoteDocs) {
            try {
                // Tambahkan field untuk tracking data remote
                remoteDoc.synced = true;
                remoteDoc.remote_id = remoteDoc._id; // remote ID adalah ID aslinya
                remoteDoc._id = `ins_${remoteDoc._id}`; // Ubah local ID agar tidak konflik
                delete remoteDoc._rev; // Hapus _rev agar put() bisa jalan
                
                // Cari dokumen lokal untuk mencegah duplikasi/konflik
                try {
                    const localDoc = await window._k3db.db.get(remoteDoc._id);
                    // Jika ada versi lokal, update versi lokal dengan _rev dari lokal
                    remoteDoc._rev = localDoc._rev;
                } catch(e) {
                    // Dokumen baru (tidak ada di lokal)
                }

                await window._k3db.db.put(remoteDoc);
                updatedCount++;
            } catch (e) {
                console.warn(`Konflik atau error put dokumen ${remoteDoc._id}:`, e.message);
            }
        }
        
        console.log(`Berhasil menarik dan memperbarui ${updatedCount} dokumen.`);
        return true;

    } catch (e) {
        console.error("Kesalahan saat pull data:", e);
        return false;
    }
}

// bind sync button (Ubah logika sync menjadi PUSH kemudian PULL)
document.getElementById('btnSync')?.addEventListener('click', async () => {
    if (!isOnline()) return alert('Anda sedang offline. Sinkronisasi dibatalkan.');
    
    const btn = document.getElementById('btnSync');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Syncing...';
    btn.disabled = true;

    try {
        // 1. Coba Unggah data yang belum synced (Push)
        const pushCount = await pushDataToAPI();
        
        // 2. Tarik data terbaru dari server (Pull)
        await pullDataFromAPI();
        
        // 3. Tampilkan pesan ringkasan
        let message = `Sinkronisasi Selesai.`;
        if (pushCount > 0) {
            message += ` Berhasil mengunggah ${pushCount} dokumen baru.`;
        }
        alert(message);
        router.navigateTo('dashboard'); // Refresh data dashboard
        
    } catch (e) {
        alert('❌ Sinkronisasi gagal total. Cek log konsol.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});


// ------------------------------------
// --- LOGIKA PER PAGE INITIATION ---
// ------------------------------------

/**
 * Inisialisasi halaman Input Inspeksi
 */
function initInput() {
    const form = qs('#formHybrid');
    const f_sev = qs('#f_sev');
    const f_like = qs('#f_like');
    const f_risk = qs('#f_risk');
    const f_photos = qs('#f_photos');
    
    // Hitung Risk Score Otomatis (Severity x Likelihood)
    const updateRiskScore = () => {
        const sev = parseInt(f_sev.value) || 0;
        const like = parseInt(f_like.value) || 0;
        f_risk.value = sev * like;
        f_risk.className = `form-control form-control-sm border-2 fw-bold text-${f_risk.value >= 15 ? 'danger' : f_risk.value >= 9 ? 'warning' : 'success'}`;
    };

    f_sev.addEventListener('input', updateRiskScore);
    f_like.addEventListener('input', updateRiskScore);
    updateRiskScore(); // Hitung nilai awal

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // 1. Kumpulkan data inspeksi
        const doc = {
            type: 'inspection',
            inspector: qs('#f_inspector').value,
            location: qs('#f_location').value,
            activity: qs('#f_activity').value,
            description: qs('#f_description').value,
            severity: parseInt(f_sev.value),
            likelihood: parseInt(f_like.value),
            risk_score: parseInt(f_risk.value),
            status: 'Open', 
            gps: qs('#f_gps').value,
            // Tambahkan bidang lain sesuai kebutuhan
        };

        // 2. Kumpulkan file foto
        const attachments = [];
        const files = f_photos.files;
        if (files.length > 0) {
            for (let i = 0; i < Math.min(files.length, 4); i++) { 
                const file = files[i];
                const blob = new Blob([file], { type: file.type });
                attachments.push({ type: file.type, blob: blob });
            }
        }
        
        // 3. Simpan ke PouchDB
        try {
            const btn = qs('button[type="submit"]');
            btn.textContent = 'Menyimpan...';
            btn.disabled = true;

            const res = await window._k3db.saveInspection(doc, attachments);
            
            alert(`✅ Inspeksi berhasil disimpan secara lokal! ID: ${res.id}`);
            form.reset(); 
            updateRiskScore(); 
            
            // Coba sync otomatis jika online
            if (isOnline()) {
                await pushDataToAPI();
            }

        } catch (e) {
            console.error(e);
            alert(`❌ Gagal menyimpan data: ${e.message}. Cek konsol.`);
        } finally {
            const btn = qs('button[type="submit"]');
            btn.textContent = 'Simpan Inspeksi Lokal';
            btn.disabled = false;
        }
    });
}

/**
 * Inisialisasi halaman Dashboard (Ringkasan Statistik)
 */
async function initDashboard() {
    try {
        const inspections = await window._k3db.listInspections(9999); 
        
        // Agregasi Data
        const total = inspections.length;
        const open = inspections.filter(d => d.status === 'Open').length;
        const closed = inspections.filter(d => d.status === 'Closed' || d.resolution_date).length;
        const critical = inspections.filter(d => d.risk_score >= 15).length; // Risk Score 15+ dianggap Critical

        const lastInspection = inspections.length > 0 ? inspections[0] : null;

        // Tampilkan di UI (dashboard.html)
        qs('#kt-total').textContent = total;
        qs('#kt-open').textContent = open;
        qs('#kt-closed').textContent = closed;
        qs('#kt-critical').textContent = critical;
        qs('#lastSync').textContent = formatDate(lastInspection ? lastInspection.created_at : null);
        
        // Tampilkan 5 inspeksi terbaru di tabel preview
        const latestInspections = inspections.slice(0, 5);
        const tableBody = qs('#latestTableBody');
        if (tableBody) {
            tableBody.innerHTML = latestInspections.map(doc => `
                <tr>
                    <td>${doc.location}</td>
                    <td>${doc.inspector}</td>
                    <td>${formatDate(doc.created_at)}</td>
                    <td><span class="badge bg-${doc.status === 'Open' ? 'warning' : 'success'}">${doc.status}</span></td>
                    <td><span class="badge bg-${doc.risk_score >= 15 ? 'danger' : 'warning'}">${doc.risk_score}</span></td>
                </tr>
            `).join('');
        }

    } catch (e) {
        console.error('Error in initDashboard:', e);
        qs('#pageSubtitle').textContent = 'Gagal memuat data dashboard.';
    }
}

/**
 * Inisialisasi halaman Rekap Data (Tabel Lengkap)
 */
async function initRekap() {
    try {
        const inspections = await window._k3db.listInspections(9999); 
        const tableBody = qs('#rekapTableBody');
        const syncBadge = qs('#rekapSyncBadge');

        tableBody.innerHTML = inspections.map(doc => `
            <tr>
                <td>${formatDate(doc.created_at)}</td>
                <td>${doc.location}</td>
                <td>${doc.inspector}</td>
                <td><span class="badge bg-${doc.risk_score >= 15 ? 'danger' : doc.risk_score >= 9 ? 'warning' : 'success'}">${doc.risk_score}</span></td>
                <td>${(doc.description || '').substring(0, 50)}...</td>
                <td><span class="badge bg-${doc.status === 'Open' ? 'warning' : 'success'}">${doc.status}</span></td>
                <td>${doc.synced ? '<i class="bi bi-cloud-check-fill text-success"></i>' : '<i class="bi bi-cloud-upload-fill text-danger"></i>'}</td>
            </tr>
        `).join('');

        const unsyncedCount = inspections.filter(d => !d.synced).length;
        syncBadge.textContent = `${unsyncedCount} Belum Sync`;
        syncBadge.className = `badge bg-${unsyncedCount > 0 ? 'danger' : 'success'}`;
        
    } catch (e) {
        console.error('Error in initRekap:', e);
        qs('#rekapContent').innerHTML = `<div class="alert alert-danger">Gagal memuat data rekap: ${e.message}</div>`;
    }
}

/**
 * Inisialisasi halaman Grafik (Grafik & Trend)
 */
async function initGrafik() {
    const content = qs('#grafikContent');
    content.innerHTML = '<canvas id="inspectionChart"></canvas>';
    
    try {
        const inspections = await window._k3db.listInspections(9999); 
        
        // Contoh Aggregation: Hitung total inspeksi per lokasi
        const locationCounts = inspections.reduce((acc, doc) => {
            acc[doc.location] = (acc[doc.location] || 0) + 1;
            return acc;
        }, {});

        const locations = Object.keys(locationCounts);
        const counts = Object.values(locationCounts);

        const ctx = document.getElementById('inspectionChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: locations,
                datasets: [{
                    label: 'Jumlah Inspeksi per Lokasi',
                    data: counts,
                    backgroundColor: [
                        'rgba(25, 135, 84, 0.6)', // success
                        'rgba(255, 193, 7, 0.6)',  // warning
                        'rgba(220, 53, 69, 0.6)',  // danger
                        'rgba(13, 110, 253, 0.6)'  // primary
                    ],
                    borderColor: [
                        'rgba(25, 135, 84, 1)',
                        'rgba(255, 193, 7, 1)',
                        'rgba(220, 53, 69, 1)',
                        'rgba(13, 110, 253, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true } }
            }
        });
        
    } catch (e) {
        content.innerHTML = `<div class="alert alert-danger">Gagal membuat grafik: ${e.message}</div>`;
    }
}

/**
 * Inisialisasi halaman Users
 */
function initUsers() {
    const content = qs('#usersContent');
    content.innerHTML = '<div class="alert alert-info">Fitur Manajemen User (CRUD). Masih merupakan *placeholder*.</div>';
}

/**
 * Inisialisasi halaman Settings
 */
function initSettings() {
    const content = qs('#settingsForm').parentElement; 
    content.innerHTML = `
        <div class="alert alert-info small">
            <i class="bi bi-info-circle-fill"></i> **Pengaturan Koneksi Aman:** Koneksi database remote (CouchDB) kini ditangani oleh server (server.js) untuk alasan keamanan. 
            Fitur ini dinonaktifkan di frontend.
        </div>
        <div class="mt-3">
            <p>Data PouchDB Lokal Anda saat ini aman.</p>
            <button id="btnManualPull" class="btn btn-secondary btn-sm"><i class="bi bi-arrow-down-up"></i> Tarik Semua Data dari Server</button>
        </div>
    `;
  
    // Pasang listener untuk Pull data manual
    qs('#btnManualPull').addEventListener('click', async () => {
      await pullDataFromAPI();
      router.navigateTo('dashboard'); // Refresh dashboard setelah pull
      alert('Proses tarik data selesai. Cek Dashboard.');
    });
}