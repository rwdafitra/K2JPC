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

// Helper untuk mengecek koneksi internet
function isOnline() {
    return navigator.onLine;
}

// --- LOGIKA SINKRONISASI API BARU (PUSH & PULL) ---

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
            selector: { type: 'inspection', synced: false }, 
            limit: 9999 
        });

        if (toSync.docs.length === 0) {
            console.log('Tidak ada dokumen baru untuk diunggah.');
            return 0;
        }

        console.log(`Mencoba mengunggah ${toSync.docs.length} dokumen...`);

        // 2. Kirim satu per satu ke API server
        for (const doc of toSync.docs) {
            const docToSend = { ...doc };
            
            // Hapus field yang hanya boleh ada di PouchDB/CouchDB
            delete docToSend._attachments; 
            delete docToSend._rev;

            try {
                const res = await fetch(window._k3db.API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(docToSend)
                });
                
                if (res.ok) {
                    const json = await res.json();
                    
                    // 3. Update dokumen lokal setelah sukses diunggah
                    const localDoc = await window._k3db.db.get(doc._id);
                    localDoc.synced = true;
                    // Opsional: perbarui _rev dari server jika ada (tapi di sini kita hanya tandai synced)
                    // localDoc._rev = json.rev; 
                    await window._k3db.db.put(localDoc);
                    successCount++;
                } else {
                    console.error(`Gagal unggah dokumen ${doc._id}: ${res.statusText}`);
                }
            } catch (fetchErr) {
                console.error(`Fetch error untuk dokumen ${doc._id}:`, fetchErr);
                // Lanjut ke dokumen berikutnya
            }
        }
    } catch (error) {
        console.error('Error saat pushDataToAPI:', error);
    }
    return successCount;
}

/**
 * Menarik data terbaru dari API Express (CouchDB) dan menyimpannya di PouchDB lokal. (PULL)
 */
async function pullDataFromAPI() {
    if (!window._k3db || !isOnline()) {
        console.warn('Offline atau DB belum siap, melewatkan Pull Data.');
        return;
    }
    
    const statusEl = document.getElementById('lastSync');
    if(statusEl) statusEl.textContent = 'Syncing...';

    try {
        const res = await fetch(window._k3db.API_URL); // GET /api/inspeksi
        if (!res.ok) throw new Error(`Server error: ${res.status}`);

        let remoteDocs = await res.json();
        console.log(`Mendapatkan ${remoteDocs.length} dokumen dari server.`);

        // Tandai semua dokumen dari server sebagai sudah tersinkronisasi
        const docsToPut = remoteDocs.map(doc => {
            doc.synced = true;
            return doc;
        });

        // Simpan semua dokumen ke PouchDB lokal. new_edits: false PENTING!
        // Ini memberitahu PouchDB untuk mempertahankan _id dan _rev dari server.
        await window._k3db.db.bulkDocs(docsToPut, { new_edits: false });
        console.log('Bulk put ke PouchDB lokal selesai.');

    } catch (error) {
        console.error('Error saat pullDataFromAPI:', error);
        alert(`Gagal menarik data dari server: ${error.message}`);
    } finally {
         if(statusEl) statusEl.textContent = new Date().toLocaleTimeString('id-ID');
         // Muat ulang halaman jika diperlukan (untuk update tampilan)
         const currentPage = qs('#content').getAttribute('data-page');
         if(currentPage && window.onPageLoaded) window.onPageLoaded(currentPage);
    }
}


// --- INITIATOR FUNGSI HALAMAN (FINAL) ---

// Dashboard: show quick stats and simple chart
async function initDashboard(){
    const statTotal = qs('#kt-total'); 
    const statOpen = qs('#kt-open'); 
    const statClosed = qs('#kt-closed'); 
    const statCritical = qs('#kt-critical');
    const lastSyncEl = qs('#lastSync');

    if (!statTotal) return;

    // 1. Ambil data terbaru dari lokal
    const rows = await window._k3db.listInspections(500);

    // 2. Hitung statistik
    const total = rows.length;
    const open = rows.filter(r=>r.status==='Open').length;
    const closed = rows.filter(r=>r.status==='Closed').length;
    const critical = rows.filter(r=>Number(r.risk)>=12).length; 

    // 3. Update tampilan
    statTotal.textContent = total;
    statOpen.textContent = open;
    statClosed.textContent = closed;
    statCritical.textContent = critical;
    
    // Update waktu sinkronisasi terakhir (bisa menggunakan data dari local storage jika disimpan)
    lastSyncEl.textContent = lastSyncEl.textContent.includes('Syncing') ? lastSyncEl.textContent : new Date().toLocaleTimeString('id-ID');

    // 4. Implementasi Grafik (memerlukan library, kita lewati dulu)
}

// Input page: form submission logic
async function initInput() {
    const form = qs('#inspectionForm');
    const attachmentInput = qs('#attachment');
    if (!form) return;

    // Tambahkan event listener untuk tombol hitung Risk Rating
    qs('#hitungRisk')?.addEventListener('click', calculateRisk);

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const inputStatusEl = qs('#inputStatus');
        inputStatusEl.textContent = 'Memproses...';

        // 1. Ambil data dari form
        const doc = {
            lokasi: qs('#lokasi').value,
            kegiatan: qs('#kegiatan').value,
            inspector: qs('#inspector').value,
            status: qs('#status').value, // Open / Closed
            desc: qs('#desc').value,
            risk: Number(qs('#riskRating').value) || 0,
        };

        // Cek input wajib
        if (!doc.lokasi || !doc.inspector || !doc.desc) {
            inputStatusEl.textContent = 'Harap lengkapi Lokasi, Inspector, dan Deskripsi.';
            return alert('Harap lengkapi Lokasi, Inspector, dan Deskripsi.');
        }

        // 2. Ambil data attachment (file foto)
        const attachments = [];
        const files = attachmentInput.files;

        if (files.length > 0) {
            inputStatusEl.textContent = 'Uploading files...';
            const file = files[0];
            attachments.push({
                type: file.type,
                blob: file 
            });
        }
        
        // 3. Simpan ke PouchDB lokal
        inputStatusEl.textContent = 'Menyimpan data lokal...';
        try {
            const res = await window._k3db.saveInspection(doc, attachments);
            
            // 4. Setelah sukses simpan lokal, coba sinkronisasi (PUSH) ke server jika online
            if (isOnline()) {
                const pushCount = await pushDataToAPI();
                inputStatusEl.textContent = `Sinkronisasi ke server: ${pushCount} dokumen.`;
            } else {
                inputStatusEl.textContent = 'Data berhasil disimpan lokal. Anda sedang offline.';
            }

            // 5. Reset form dan tampilkan pesan sukses
            alert(`Inspeksi berhasil disimpan dengan ID: ${res.id}. Siap disinkronkan.`);
            form.reset();
            inputStatusEl.textContent = 'Form siap diisi.';
            // Kembali ke dashboard untuk melihat statistik terbaru
            router.navigateTo('dashboard'); 

        } catch (error) {
            console.error('Error saat menyimpan inspeksi:', error);
            inputStatusEl.textContent = `Gagal menyimpan: ${error.message}`;
            alert('Gagal menyimpan data. Cek console log.');
        }
    });
}

// Fungsi tambahan untuk menghitung Risk Rating (misal: Likelihood x Consequence)
function calculateRisk() {
    const likelihood = Number(qs('#likelihood').value) || 0;
    const consequence = Number(qs('#consequence').value) || 0;
    const riskRating = likelihood * consequence;

    qs('#riskRating').value = riskRating;
    qs('#riskRatingDisplay').textContent = riskRating;
    
    let color = '';
    if (riskRating >= 15) color = 'text-danger'; // Critical
    else if (riskRating >= 8) color = 'text-warning'; // High
    else color = 'text-success'; // Low/Medium

    qs('#riskRatingDisplay').className = color;
}

// Rekap page: show all inspection data in a table
async function initRekap() {
    const tableBody = qs('#rekapTableBody');
    if (!tableBody) return;

    try {
        const inspections = await window._k3db.listInspections(500); 
        
        if (inspections.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Belum ada data inspeksi.</td></tr>';
            return;
        }

        let html = '';
        let count = 0;
        
        inspections.forEach(doc => {
            count++;
            
            const date = new Date(doc.created_at);
            const timeStr = date.toLocaleString('id-ID', { 
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' 
            });

            const statusClass = doc.status === 'Closed' ? 'bg-success' : 'bg-warning';
            let riskClass = 'bg-primary';
            if (doc.risk >= 15) riskClass = 'bg-danger';
            else if (doc.risk >= 8) riskClass = 'bg-warning';

            html += `
                <tr>
                    <td>${count}</td>
                    <td>${timeStr}</td>
                    <td>${doc.lokasi || '-'}</td>
                    <td>${doc.kegiatan || '-'}</td>
                    <td>${doc.inspector || '-'}</td>
                    <td><span class="badge ${riskClass}">${doc.risk || 0}</span></td>
                    <td><span class="badge ${statusClass}">${doc.status}</span></td>
                </tr>
            `;
        });

        tableBody.innerHTML = html;

    } catch (error) {
        console.error('Error saat menampilkan rekap inspeksi:', error);
        tableBody.innerHTML = `<tr><td colspan="7" class="text-danger">Gagal memuat data.</td></tr>`;
    }
}


// Grafik page placeholder
function initGrafik() {
    // Placeholder untuk implementasi Chart.js atau sejenisnya
    const el = qs('#grafikContainer');
    if(el) el.innerHTML = `<p class="small text-muted">Implementasi grafik (misal: Chart.js) akan ditambahkan di sini setelah data sudah banyak.</p>`;
}

// Users page placeholder
function initUsers(){
  const el = qs('#usersList'); if(!el) return;
  el.innerHTML = `<p class=\"small text-muted\">User & Role management akan membutuhkan implementasi di server.js (IAM).</p>`;
}

// Settings page (Sekarang hanya menampilkan status)
function initSettings(){
  const content = qs('#settingsForm').parentNode; 
  if (!content) return;
  
  // Tampilkan pesan bahwa setting remote sudah di server
  content.innerHTML = `
    <div class="alert alert-info small">
        <i class="bi bi-info-circle-fill"></i> **Pengaturan Koneksi Aman:** Koneksi database remote (CouchDB) kini ditangani oleh server (server.js) untuk alasan keamanan. 
        Fitur ini dinonaktifkan di frontend.
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

// bind sync button (Ubah logika sync menjadi PUSH kemudian PULL)
document.getElementById('btnSync').addEventListener('click', async ()=>{\r\n  if (!isOnline()) return alert('Anda sedang offline. Sinkronisasi dibatalkan.');\r\n  \r\n  // 1. Coba Unggah data yang belum synced (Push)\r\n  const pushSuccess = await pushDataToAPI();\r\n  \r\n  // 2. Tarik data terbaru dari server (Pull)\r\n  await pullDataFromAPI();\r\n  \r\n  // 3. Tampilkan pesan ringkasan\r\n  if (pushSuccess > 0) {\r\n      alert(`Sinkronisasi selesai! ${pushSuccess} dokumen diunggah, dan data terbaru ditarik dari server.`);\r\n  } else {\r\n      alert('Sinkronisasi selesai. Tidak ada data baru yang diunggah, data terbaru ditarik dari server.');\r\n  }\r\n});