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

// --- LOGIKA SINKRONISASI API BARU (PUSH & PULL) ---

// Helper untuk mengecek koneksi internet
function isOnline() {
    return navigator.onLine;
}

/**
 * Menarik data terbaru dari API Express (CouchDB) dan menyimpannya di PouchDB lokal. (PULL)
 */
async function pullDataFromAPI() {
    if (!window._k3db || !isOnline()) {
        console.warn('Offline atau DB belum siap, melewatkan Pull Data.');
        return;
    }
    
    document.getElementById('lastSync').textContent = 'Syncing...';
    try {
        const res = await fetch(window._k3db.API_URL); // GET /api/inspeksi
        if (!res.ok) throw new Error('Gagal menarik data dari API Express');
        const remoteDocs = await res.json();
        
        const localDB = window._k3db.db;
        
        // Memasukkan dokumen dari server ke PouchDB lokal.
        // Dokumen dari server sudah memiliki _id dan _rev (penting untuk PouchDB)
        const docsToPut = remoteDocs.map(doc => ({
            ...doc,
            // Pastikan dokumen yang ditarik dari server dianggap 'synced'
            synced: true,
            // PouchDB akan menangani _rev secara otomatis saat PUT
        }));

        await localDB.bulkDocs(docsToPut, { new_edits: false }); // new_edits: false penting untuk mempertahankan _rev dari server
        
        document.getElementById('lastSync').textContent = new Date().toLocaleTimeString();
        console.log(`Pull Berhasil: ${remoteDocs.length} dokumen diupdate di PouchDB lokal.`);
        
        // Muat ulang dashboard setelah sinkronisasi
        router.navigateTo('dashboard');
        
    } catch(e) {
        console.error('Error saat menarik data dari server:', e);
        document.getElementById('lastSync').textContent = 'Error';
        alert('Gagal menarik data dari server. Cek koneksi.');
    }
}

/**
 * Mengunggah data yang belum disinkronkan dari PouchDB lokal ke API Express (PUSH)
 */
async function pushDataToAPI() {
    if (!window._k3db || !isOnline()) return;

    const localDB = window._k3db.db;
    try {
        // 1. Dapatkan dokumen yang belum disinkronkan (synced: false)
        const unsyncedDocs = await localDB.find({ 
            selector: { type: 'inspection', synced: false }, 
            limit: 9999 
        });

        if (unsyncedDocs.docs.length === 0) {
            console.log('Tidak ada data baru yang perlu diunggah.');
            return 0; // Kembalikan 0 berhasil
        }

        let successCount = 0;
        
        // 2. Kirim dokumen satu per satu ke API Express
        for (const doc of unsyncedDocs.docs) {
            // Hapus property yang tidak perlu dikirim ke server (seperti attachments _attachments)
            const docToSend = { ...doc };
            delete docToSend._attachments; 
            delete docToSend._rev; // Hapus _rev agar server bisa PUT sebagai dokumen baru

            const response = await fetch(window._k3db.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(docToSend)
            });
            
            if (response.ok) {
                successCount++;
                // 3. Tandai dokumen di lokal sebagai sudah sinkron
                const res = await localDB.get(doc._id);
                res.synced = true;
                await localDB.put(res);
            } else {
                console.error('Gagal sync doc:', doc._id, await response.text());
            }
        }
        
        alert(`Unggah berhasil: ${successCount} dokumen terkirim.`);
        return successCount;

    } catch (e) { 
        console.error(e); 
        alert('Sync error: '+e.message); 
        return 0;
    }
}

// Dashboard: show quick stats and simple chart
async function initDashboard(){
  const statTotal = qs('#kt-total'); const statOpen = qs('#kt-open'); const statClosed = qs('#kt-closed'); const statCritical = qs('#kt-critical');
  if (!statTotal) return;
  
  // Pastikan index dibuat sebelum find (PouchDB find require index)
  await window._k3db.db.createIndex({ index: { fields: ['type', 'created_at'] } }).catch(e=>console.warn("Index PouchDB gagal dibuat, lanjut fallback:", e));

  const rows = await window._k3db.listInspections(200);
  
  statTotal.textContent = rows.length;
  statOpen.textContent = rows.filter(r=>r.status==='Open').length;
  statClosed.textContent = rows.filter(r=>r.status==='Closed').length;
  statCritical.textContent = rows.filter(r=>Number(r.risk)>=12).length;

  // simple trend: group last 6 days
  const labels = []; const dataOpen = []; const dataClosed = [];
  const today = new Date();
  for(let i=5; i>=0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      labels.push(d.toLocaleDateString('id-ID', {day:'numeric', month:'short'}));
      
      const dailyRows = rows.filter(r => r.created_at?.startsWith(dateStr));
      dataOpen.push(dailyRows.filter(r=>r.status==='Open').length);
      dataClosed.push(dailyRows.filter(r=>r.status==='Closed').length);
  }

  if (window._chartTrend) window._chartTrend.destroy();
  window._chartTrend = new Chart(qs('#kt-chart-trend'), {
    type: 'line', data: { labels, datasets: [
      { label: 'Open', data: dataOpen, borderColor: '#ffc107', tension: 0.3 },
      { label: 'Closed', data: dataClosed, borderColor: '#198754', tension: 0.3 }
    ]}, options: { responsive: true, maintainAspectRatio: false }
  });

  // check for unsynced data
  const unsynced = (await window._k3db.db.find({ selector: { type: 'inspection', synced: false } })).docs.length;
  qs('#unsynced-info').textContent = unsynced > 0 ? `(${unsynced} dokumen belum diunggah)` : '(Semua data sudah disinkronkan)';
}

// Input page: form submit handler
function initInput(){
  // ... (kode initInput yang sudah ada, tidak ada perubahan)
}

// Rekap page: show detailed table
async function initRekap(){
  // ... (kode initRekap yang sudah ada, tidak ada perubahan)
}

// Grafik page: trend and other charts
function initGrafik(){
  // ... (kode initGrafik yang sudah ada, tidak ada perubahan)
}

// Users page placeholder
function initUsers(){
  const el = qs('#usersList'); if(!el) return;
  el.innerHTML = `<p class="small text-muted">User & Role management akan tersedia setelah backend.</p>`;
}

// Settings page: Hapus logika konfigurasi remote DB yang tidak aman.
function initSettings(){
  const form = qs('#settingsForm'); if (!form) return;
  form.innerHTML = `
    <div class="alert alert-info small">
        <i class="bi bi-info-circle-fill"></i> Konfigurasi koneksi database remote (CouchDB) kini ditangani oleh server (server.js) untuk alasan keamanan. 
        Fitur ini dinonaktifkan. Anda hanya perlu mengelola PouchDB lokal.
    </div>
    <div class="mt-3">
        <button id="btnManualPull" class="btn btn-secondary btn-sm"><i class="bi bi-arrow-down-up"></i> Tarik Semua Data dari Server</button>
    </div>
  `;
  
  // Pasang listener untuk Pull data manual (opsional, karena Sync Now sudah melakukan Pull)
  qs('#btnManualPull').addEventListener('click', async () => {
    await pullDataFromAPI();
    alert('Proses tarik data selesai.');
  });
}

// bind sync button (Ubah logika sync)
document.getElementById('btnSync').addEventListener('click', async ()=>{
  if (!isOnline()) return alert('Anda sedang offline. Sinkronisasi dibatalkan.');
  
  // 1. Coba Unggah data yang belum synced (Push)
  const pushSuccess = await pushDataToAPI();
  
  // 2. Tarik data terbaru dari server (Pull)
  await pullDataFromAPI();
  
  // Tampilkan pesan ringkasan
  if (pushSuccess > 0) {
      alert(`Sinkronisasi selesai! ${pushSuccess} dokumen diunggah, dan data terbaru ditarik dari server.`);
  } else {
      alert('Sinkronisasi selesai. Tidak ada data baru yang diunggah, data terbaru ditarik dari server.');
  }
});

// Aksi yang harus dilakukan saat aplikasi pertama kali dimuat
router.navigateTo('dashboard').then(async ()=>{
    // Tarik data saat pertama kali masuk, jika online
    await pullDataFromAPI();
});
