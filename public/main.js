// main.js - handles page lifecycle, binds forms, renders charts & tables (VERSI FINAL ROBUST)

/**
 * Dipanggil oleh router.js setiap kali halaman baru dimuat.
 * Bertanggung jawab memanggil fungsi inisialisasi halaman yang sesuai.
 */
window.onPageLoaded = function(page) {
    const user = getUserRole(); // Cek peran pengguna saat ini
    
    // update sidebar visual dan judul
    document.getElementById('content').setAttribute('data-page', page);
    document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
    document.querySelector(`.sidebar a[data-page="${page}"]`)?.classList.add('active');
    
    // RBAC: Tampilkan/Sembunyikan menu Users berdasarkan peran
    const userMenu = document.querySelector('.sidebar a[data-page="users"]');
    if (userMenu) userMenu.style.display = user.role === 'Manager' ? 'block' : 'none';

    // Panggil fungsi inisialisasi per halaman
    try {
        if (page === 'dashboard') initDashboard();
        if (page === 'input') initInput(user); 
        if (page === 'rekap') initRekap(user);
        if (page === 'detail') initDetail(user); 
        if (page === 'grafik') initGrafik();
        if (page === 'users') initUsers(user);  
        if (page === 'settings') initSettings();
    } catch (e) {
        console.error(`Error saat inisialisasi halaman ${page}:`, e);
        // Tampilkan pesan error di konten jika terjadi kegagalan fatal
        const content = qs('#content');
        if(content) content.innerHTML = `<div class="alert alert-danger">Gagal memuat halaman **${page}**. Cek konsol browser untuk detail error.</div>`;
    }
};

// ------------------------------------
// --- COMMON HELPERS & AUTH MOCK ---
// ------------------------------------

function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }
function isOnline() { return navigator.onLine; }

function formatDate(isoString) {
    if (!isoString) return '-';
    // Gunakan try/catch untuk date parsing
    try {
        return new Date(isoString).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return isoString;
    }
}

/**
 * Mendapatkan atau membuat user default (Role Based Access Control)
 */
function getUserRole() {
    let user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    // Jika user belum ada, set default Manager (untuk inisialisasi user pertama)
    if (!user) {
        user = { username: 'admin', role: 'Manager', name: 'KTT Manager' };
        localStorage.setItem('currentUser', JSON.stringify(user));
    }
    return user;
}
window.currentUser = getUserRole(); // Set global user


// ------------------------------------
// --- LOGIKA SINKRONISASI API ---
// ------------------------------------

/**
 * Mengirim data yang belum tersinkronisasi (synced: false) ke API Express. (PUSH)
 * @param {'inspection'|'user'} type - Jenis dokumen yang akan diunggah
 * @returns {number} Jumlah dokumen yang berhasil diunggah.
 */
async function pushDataToAPI(type) {
    if (!window._k3db || !isOnline()) return 0;
    let successCount = 0;
    const apiUrl = type === 'user' ? window._k3db.API_USER_URL : window._k3db.API_URL;
    
    try {
        // Cari semua dokumen yang belum disinkronisasi
        const toSync = await window._k3db.db.find({ 
            selector: { type: type, synced: false }, 
            limit: 9999 
        });

        if (toSync.docs.length === 0) return 0;
        
        for (const doc of toSync.docs) {
            const docToSend = { ...doc };
            delete docToSend._rev; // Hapus _rev agar CouchDB bisa menentukan rev baru saat update/put
            
            // PUT digunakan untuk create dan update di server
            const url = apiUrl + (type === 'inspection' ? `/${doc._id}` : '');
            
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(docToSend)
            });
            
            if (res.ok) {
                const json = await res.json();
                const localDoc = await window._k3db.db.get(doc._id);
                localDoc.synced = true;
                if (json.rev) localDoc._rev = json.rev; // Update rev lokal
                await window._k3db.db.put(localDoc);
                successCount++;
            } else {
                console.error(`Gagal unggah dokumen ${doc._id} (${type}): ${res.statusText}`);
            }
        }
    } catch (error) {
        console.error(`Error saat pushDataToAPI (${type}):`, error);
    }
    return successCount;
}

/**
 * Menarik data terbaru dari API Express ke database lokal. (PULL)
 * @param {'inspection'|'user'} type - Jenis dokumen yang akan ditarik
 */
async function pullDataFromAPI(type) {
    if (!window._k3db || !isOnline()) return;
    const apiUrl = type === 'user' ? window._k3db.API_USER_URL : window._k3db.API_URL;
    
    try {
        const res = await fetch(apiUrl); 
        if (!res.ok) throw new Error(`Server error: ${res.status}`);

        let remoteDocs = await res.json();
        if (!Array.isArray(remoteDocs)) return;
        
        const docsToPut = [];
        for (const remoteDoc of remoteDocs) {
            if (!remoteDoc._id) continue; 
            remoteDoc.synced = true;
            
            try {
                // Cek apakah sudah ada di lokal untuk mendapatkan _rev
                const localDoc = await window._k3db.db.get(remoteDoc._id);
                remoteDoc._rev = localDoc._rev; 
            } catch (e) {
                // Jika tidak ada di lokal, hapus _rev
                delete remoteDoc._rev;
            }
            docsToPut.push(remoteDoc);
        }

        if (docsToPut.length > 0) {
            // Gunakan bulkDocs untuk efisiensi
            await window._k3db.db.bulkDocs(docsToPut);
        }
    } catch (error) {
        console.error(`Error saat pullDataFromAPI (${type}):`, error);
        if(type === 'inspection') console.error(`Gagal menarik data inspeksi: ${error.message}`);
    } 
}

// Event listener untuk tombol Sync Now
document.getElementById('btnSync')?.addEventListener('click', async () => {
    if (!isOnline()) return alert('Anda sedang offline. Sinkronisasi dibatalkan.');
    
    if (!window._k3db) return alert("Sistem database lokal belum siap. Coba refresh halaman.");

    // Tampilkan loading/disable tombol
    const btn = qs('#btnSync');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Syncing...`;

    try {
        // 1. PUSH & PULL USER
        const pushUserCount = await pushDataToAPI('user');
        await pullDataFromAPI('user');

        // 2. PUSH & PULL INSPEKSI
        const pushInspCount = await pushDataToAPI('inspection');
        await pullDataFromAPI('inspection');
        
        let message = `Sinkronisasi selesai! User diunggah: ${pushUserCount}. Inspeksi diunggah: ${pushInspCount}. Data terbaru ditarik.`;
        alert(message);
    } catch (e) {
        alert('Sinkronisasi gagal total. Cek log konsol.');
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-arrow-down-up me-1"></i> Sync Now`;
        // Memaksa pemuatan ulang halaman saat ini untuk menampilkan data terbaru
        const currentPage = document.getElementById('content').getAttribute('data-page') || 'dashboard';
        router.navigateTo(currentPage);
    }
});


// ------------------------------------
// --- LOGIKA PER PAGE INITIATION ---
// ------------------------------------

/**
 * Dashboard: Menampilkan ringkasan statistik
 */
async function initDashboard() {
    if (!window._k3db || !window._k3db.listInspections) return; 

    try {
        const docs = await window._k3db.listInspections();
        const total = docs.length;
        const open = docs.filter(d => d.status === 'Open').length;
        const closed = docs.filter(d => d.status === 'Closed').length;
        // Asumsi risk_score >= 15 adalah Critical
        const critical = docs.filter(d => d.risk_score >= 15 && d.status === 'Open').length; 

        qs('#kt-total').textContent = total;
        qs('#kt-open').textContent = open;
        qs('#kt-closed').textContent = closed;
        qs('#kt-critical').textContent = critical;
        qs('#lastSync').textContent = formatDate(new Date().toISOString());

        const dashboardAlert = qs('#dashboardAlert');
        if (dashboardAlert) {
            if (total === 0) {
                dashboardAlert.innerHTML = `<div class="alert alert-info small">Belum ada data inspeksi yang tersimpan secara lokal. Silakan input data.</div>`;
            } else {
                dashboardAlert.innerHTML = ``;
            }
        }
    } catch (e) {
        console.error("Gagal inisialisasi Dashboard:", e);
        qs('#kt-total').textContent = 'Error';
    }
}

/**
 * Input: Menyiapkan form input Inspeksi
 */
function initInput(user) {
    // Asumsi form ID adalah #formMinerba
    const form = qs('#formMinerba');
    if (!form) return;

    // FIX KRITIS: Set tanggal, inspector ID, dan nama inspector
    const currentDate = new Date().toISOString().split('T')[0];
    const dateInput = qs('#f_tanggal_inspeksi');
    if (dateInput) dateInput.value = currentDate;
    
    qs('#f_inspector').value = user.name;
    qs('#f_inspector').setAttribute('readonly', true);
    qs('#f_inspectorId').value = user.username;
    
    // Logic Risk Score Calculator
    function calculateRisk() {
        const sev = parseInt(qs('#f_sev')?.value) || 0;
        const like = parseInt(qs('#f_like')?.value) || 0;
        const score = sev * like;
        qs('#f_risk').value = score;
        qs('#f_risk_cat').value = score >= 15 ? 'HIGH' : (score >= 9 ? 'MEDIUM' : 'LOW');
    }
    qs('#f_sev')?.addEventListener('input', calculateRisk);
    qs('#f_like')?.addEventListener('input', calculateRisk);
    calculateRisk(); // Panggil pertama kali

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const doc = {
            inspector: qs('#f_inspector').value,
            inspector_id: qs('#f_inspectorId').value,
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
            status: 'Open', 
            komentar: [],
            gps: qs('#f_gps').value,
            referensi_hukum: qs('#f_ref_hukum').value,
            target_tindak_lanjut: qs('#f_target_tl').value,
            tanggal_inspeksi: qs('#f_tanggal_inspeksi').value, // Tanggal format YYYY-MM-DD
            // Tambahan default field
            type: 'inspection',
            deleted: false
        };

        // Konversi file ke base64 blob untuk PouchDB attachment
        const files = Array.from(qs('#f_photos').files);
        const attachments = await Promise.all(files.map(file => {
            return new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = (e) => resolve({ 
                    type: file.type, 
                    // Ambil hanya bagian base64 (setelah koma)
                    blob: e.target.result.split(',')[1],
                    filename: file.name
                }); 
                reader.readAsDataURL(file);
            });
        }));

        try {
            await window._k3db.saveInspection(doc, attachments);
            alert('Inspeksi berhasil disimpan secara lokal! Jangan lupa Sync Now.');
            form.reset();
            calculateRisk(); // Reset risk score display
            router.navigateTo('dashboard');
        } catch (error) {
            alert('Gagal menyimpan data lokal: ' + error.message);
            console.error('Error Save Inspection:', error);
        }
    });
}

/**
 * Rekap: Menampilkan daftar inspeksi
 */
async function initRekap(user) {
    if (!window._k3db || !window._k3db.listInspections) return;
    const tableBody = qs('#rekapTableBody');
    if (!tableBody) return;
    
    try {
        const docs = await window._k3db.listInspections();
        
        let filteredDocs = docs;
        // RBAC: Inspector hanya lihat data mereka sendiri
        if (user.role === 'Inspector') {
            filteredDocs = docs.filter(d => d.inspector_id === user.username);
        }

        if (filteredDocs.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center">Tidak ada data inspeksi yang tersimpan di lokal.</td></tr>`;
            return;
        }

        tableBody.innerHTML = filteredDocs.map(doc => `
            <tr>
                <td>${doc.tanggal_inspeksi}</td>
                <td>${doc.inspector}</td>
                <td>${doc.lokasi} - ${doc.area}</td>
                <td>${doc.uraian_temuan.substring(0, 50)}${doc.uraian_temuan.length > 50 ? '...' : ''}</td>
                <td>${doc.risk_category} (${doc.risk_score})</td>
                <td><span class="badge bg-${doc.status === 'Open' ? 'warning' : 'success'}">${doc.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-info text-white me-1" onclick="router.navigateTo('detail', {id: '${doc._id}'})"><i class="bi bi-eye"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="handleDelete('${doc._id}', '${doc.lokasi}')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `).join('');

    } catch (e) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Gagal memuat data rekap: ${e.message}</td></tr>`;
        console.error('Error initRekap:', e);
    }
}

/**
 * Detail: Menampilkan detail inspeksi dan mengelola komentar/TL
 */
async function initDetail(user) {
    if (!window._k3db || !window._k3db.getInspection) return;
    
    // Mendapatkan ID dari hash URL
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const id = urlParams.get('id');

    const content = qs('#detailContent');
    const commentForm = qs('#commentForm');

    if (!id || !content || !commentForm) return router.navigateTo('dashboard');
    
    // Fungsi pembantu untuk merender ulang konten
    const renderDetail = async () => {
        try {
            const doc = await window._k3db.getInspection(id);
            const isOwner = doc.inspector_id === user.username;
            const canEdit = isOwner || user.role === 'Manager'; // Hanya pemilik atau manager yang bisa edit status/komentar
            
            // Render Detail Utama
            let html = `
                <div class="card mb-3">
                    <div class="card-header">
                        <strong>Detail Inspeksi: ${doc.lokasi} - ${doc.area}</strong>
                        <span class="badge bg-${doc.status === 'Open' ? 'warning' : 'success'} float-end">${doc.status}</span>
                    </div>
                    <div class="card-body small">
                        <div class="row">
                            <div class="col-md-6">
                                <p><strong>Inspector:</strong> ${doc.inspector} (${doc.inspector_id})</p>
                                <p><strong>Tanggal:</strong> ${doc.tanggal_inspeksi}</p>
                                <p><strong>Jenis Kegiatan:</strong> ${doc.jenis_kegiatan}</p>
                                <p><strong>Kategori Temuan:</strong> ${doc.kategori_temuan}</p>
                                <p><strong>Uraian Temuan:</strong> ${doc.uraian_temuan}</p>
                            </div>
                            <div class="col-md-6">
                                <p><strong>Risiko:</strong> ${doc.risk_category} (S:${doc.severity} x L:${doc.likelihood} = ${doc.risk_score})</p>
                                <p><strong>Rekomendasi TL:</strong> ${doc.rekomendasi}</p>
                                <p><strong>Target TL:</strong> ${doc.target_tindak_lanjut || '-'}</p>
                                <p><strong>Referensi Hukum:</strong> ${doc.referensi_hukum || '-'}</p>
                                <p><strong>GPS:</strong> ${doc.gps || '-'}</p>
                            </div>
                        </div>
                        <h6 class="border-bottom pb-1 mt-3">Bukti Foto (${doc._attachments ? Object.keys(doc._attachments).length : 0})</h6>
                        <div class="row" id="photoContainer">
                            </div>
                        <h6 class="border-bottom pb-1 mt-3">Tindak Lanjut & Komentar</h6>
                        <ul class="list-group list-group-flush small" id="commentList">
                            ${doc.komentar && doc.komentar.length > 0 ? doc.komentar.map(c => `<li class="list-group-item"><strong>${c.user} (${c.role}):</strong> ${c.text} <span class="text-muted float-end">${formatDate(c.date)}</span></li>`).join('') : '<li class="list-group-item text-muted">Belum ada catatan tindak lanjut.</li>'}
                        </ul>
                    </div>
                    <div class="card-footer text-end">
                        <button class="btn btn-sm btn-danger me-2" onclick="handleDelete('${doc._id}', '${doc.lokasi}')" ${!canEdit ? 'disabled' : ''}>
                            <i class="bi bi-trash"></i> Hapus Lokal
                        </button>
                        <button class="btn btn-sm btn-primary" onclick="window.exportPDF('${doc._id}', '${doc.lokasi} - ${doc.area}')">
                            <i class="bi bi-file-earmark-pdf"></i> Export PDF
                        </button>
                        ${doc.status === 'Open' && canEdit ? `
                            <button class="btn btn-sm btn-success ms-2" id="btnMarkClosed">
                                <i class="bi bi-check2-circle"></i> Tandai Selesai
                            </button>` : ''}
                    </div>
                </div>
            `;
            content.innerHTML = html;
            
            // Load dan render attachments
            const photoContainer = qs('#photoContainer');
            if (doc._attachments && photoContainer) {
                for (const attName in doc._attachments) {
                    const att = doc._attachments[attName];
                    const blob = await window._k3db.db.getAttachment(id, attName);
                    const url = URL.createObjectURL(blob);
                    
                    photoContainer.innerHTML += `
                        <div class="col-md-4 mb-2">
                            <a href="${url}" target="_blank">
                                <img src="${url}" class="img-fluid rounded shadow-sm" alt="Bukti Temuan">
                            </a>
                        </div>
                    `;
                }
            }

            // Bind Mark Closed button
            qs('#btnMarkClosed')?.addEventListener('click', async () => {
                if (confirm(`Anda yakin ingin menutup temuan ${doc.lokasi}?`)) {
                    doc.status = 'Closed';
                    doc.komentar.push({
                        user: user.name,
                        role: user.role,
                        text: 'Temuan ditutup oleh ' + user.name,
                        date: new Date().toISOString()
                    });
                    doc.synced = false;
                    await window._k3db.db.put(doc);
                    alert('Temuan berhasil ditutup secara lokal! Lakukan sinkronisasi.');
                    renderDetail();
                }
            });

        } catch (e) {
            content.innerHTML = `<div class="alert alert-danger">Detail Inspeksi ID: ${id} tidak ditemukan. ${e.message}</div>`;
        }
    };
    
    // Bind Form Komentar
    commentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const commentText = qs('#f_comment').value.trim();
        if (!commentText) return;

        try {
            const doc = await window._k3db.getInspection(id);
            doc.komentar = doc.komentar || [];
            doc.komentar.push({
                user: user.name,
                role: user.role,
                text: commentText,
                date: new Date().toISOString()
            });
            doc.synced = false;

            await window._k3db.db.put(doc);
            qs('#f_comment').value = '';
            alert('Komentar berhasil ditambahkan secara lokal.');
            renderDetail();
        } catch (e) {
            alert('Gagal menambahkan komentar: ' + e.message);
        }
    });

    renderDetail();
}

/**
 * Grafik: Placeholder untuk chart
 */
function initGrafik() {
    // FIX KRITIS: Pastikan elemen target ada
    const chartContainer = qs('#chartContainer');
    if (!chartContainer) {
        return console.warn("Element #chartContainer for Grafik not found. Check pages/grafik.html");
    }

    // Logika grafik masih kosong
    chartContainer.innerHTML = `<div class="alert alert-warning small">Logika rendering Grafik & Trend akan ditambahkan di pengembangan selanjutnya.</div>`;
}

/**
 * Users: Manajemen User (Hanya untuk Manager)
 */
async function initUsers(user) {
    if (!window._k3db || !window._k3db.listUsers) return;
    const content = qs('#usersContent');
    const userForm = qs('#userForm');
    const userTableBody = qs('#userTableBody');

    if (user.role !== 'Manager') {
        if(content) content.innerHTML = `<div class="alert alert-danger">Akses ditolak. Hanya Manager yang dapat mengelola user.</div>`;
        return;
    }
    
    // Fungsi untuk merender daftar user
    const renderUsers = async () => {
        try {
            const users = await window._k3db.listUsers();
            userTableBody.innerHTML = users.map(u => `
                <tr>
                    <td>${u.name}</td>
                    <td>${u.username}</td>
                    <td>${u.role}</td>
                    <td>
                        <button class="btn btn-sm btn-secondary" onclick="editUser('${u.username}')"><i class="bi bi-pencil"></i></button>
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            userTableBody.innerHTML = `<tr><td colspan="4" class="text-danger">Gagal memuat user: ${e.message}</td></tr>`;
        }
    };

    // Form Submit
    userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const uname = qs('#f_uname').value.trim();
        const name = qs('#f_name').value.trim();
        const role = qs('#f_role').value;

        const userDoc = { username: uname, name, role };

        try {
            await window._k3db.saveUser(userDoc);
            alert('User berhasil disimpan/diperbarui secara lokal! Lakukan sinkronisasi.');
            userForm.reset();
            qs('#f_uname').disabled = false;
            renderUsers();
        } catch (error) {
            alert('Gagal menyimpan user: ' + error.message);
        }
    });

    // Fungsi untuk mengisi form saat edit
    window.editUser = async (username) => {
        try {
            const userDoc = await window._k3db.db.get('user_' + username);
            qs('#f_uname').value = userDoc.username;
            qs('#f_name').value = userDoc.name;
            qs('#f_role').value = userDoc.role;
            // Disable username saat mode edit
            qs('#f_uname').disabled = true; 
        } catch (e) {
            alert('User tidak ditemukan.');
        }
    };

    renderUsers();
}

/**
 * Settings: Info dan opsi sync manual
 */
function initSettings() {
    // Fungsi pull manual
    qs('#btnManualPull')?.addEventListener('click', async () => {
      if (!isOnline()) return alert('Anda sedang offline.');
      alert('Memulai proses tarik data...');
      await pullDataFromAPI('inspection');
      await pullDataFromAPI('user');
      alert('Proses tarik data selesai. Silakan cek halaman Rekap.');
    });
}


// ------------------------------------
// --- GLOBAL ACTIONS ---
// ------------------------------------

/**
 * Menghapus dokumen (Soft Delete)
 */
window.handleDelete = async function(id, name) {
    if (!window._k3db || !window._k3db.softDeleteInspection) return;
    if (!confirm(`Anda yakin ingin menghapus temuan: ${name} (ID: ${id})? Data akan ditandai terhapus dan disinkronisasi ke server.`)) {
        return;
    }

    try {
        await window._k3db.softDeleteInspection(id);
        alert('Dokumen berhasil dihapus secara lokal (soft delete)! Lakukan sinkronisasi.');
        router.navigateTo('rekap');
    } catch (e) {
        alert('Gagal menghapus dokumen: ' + e.message);
        console.error('Error softDeleteInspection:', e);
    }
};

/**
 * Export detail inspeksi ke PDF menggunakan jspdf dan html2canvas
 */
window.exportPDF = async function(id, title) {
    if (!window.jspdf || !window.html2canvas) return alert('Library PDF Export belum dimuat.');
    
    // Simpan konten saat ini
    const originalContent = qs('#content').innerHTML;
    qs('#content').innerHTML = `
        <div class="alert alert-info" id="pdfExportLoading">Memuat data untuk PDF...</div>
        <div id="pdfContent" style="padding: 20px; background: white; width: 210mm; margin: auto;"></div>
    `;

    try {
        const doc = await window._k3db.getInspection(id);
        
        // Render versi detail yang sederhana untuk PDF
        const pdfHtml = `
            <h4 style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px;">LAPORAN INSPEKSI K3</h4>
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 10pt;">
                <tr><td style="width: 30%;"><strong>ID Temuan:</strong></td><td>${doc._id}</td></tr>
                <tr><td><strong>Tanggal Inspeksi:</strong></td><td>${doc.tanggal_inspeksi}</td></tr>
                <tr><td><strong>Inspector:</strong></td><td>${doc.inspector}</td></tr>
                <tr><td><strong>Lokasi/Area:</strong></td><td>${doc.lokasi} / ${doc.area}</td></tr>
                <tr><td><strong>Jenis Kegiatan:</strong></td><td>${doc.jenis_kegiatan}</td></tr>
                <tr><td><strong>Status:</strong></td><td>${doc.status}</td></tr>
            </table>
            <h5 style="margin-top: 20px;">Uraian Temuan</h5>
            <div style="border: 1px solid #ccc; padding: 10px; font-size: 10pt;">${doc.uraian_temuan}</div>

            <h5 style="margin-top: 20px;">Analisis Risiko</h5>
            <table style="width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 10pt;">
                <tr><td style="width: 30%;"><strong>Severity (S):</strong></td><td>${doc.severity}</td></tr>
                <tr><td><strong>Likelihood (L):</strong></td><td>${doc.likelihood}</td></tr>
                <tr><td><strong>Risk Score:</strong></td><td>${doc.risk_score} (${doc.risk_category})</td></tr>
            </table>

            <h5 style="margin-top: 20px;">Rekomendasi Tindak Lanjut</h5>
            <div style="border: 1px solid #ccc; padding: 10px; font-size: 10pt;">${doc.rekomendasi} (Target: ${doc.target_tindak_lanjut || '-'})</div>

            <h5 style="margin-top: 20px;">Bukti Foto</h5>
            <div id="pdfPhotoContainer" style="display: flex; flex-wrap: wrap; gap: 10px;"></div>
        `;
        qs('#pdfContent').innerHTML = pdfHtml;
        qs('#pdfExportLoading').textContent = "Memproses gambar...";

        // Load images for PDF
        const pdfPhotoContainer = qs('#pdfPhotoContainer');
        if (doc._attachments) {
            for (const attName in doc._attachments) {
                const blob = await window._k3db.db.getAttachment(id, attName);
                const url = URL.createObjectURL(blob);
                pdfPhotoContainer.innerHTML += `<img src="${url}" style="width: 150px; height: 100px; object-fit: cover;">`;
            }
        }
        
        qs('#pdfExportLoading').textContent = "Mencetak PDF...";

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const element = qs('#pdfContent');
        
        const canvas = await html2canvas(element, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 210; 
        const pageHeight = 295;  
        const imgHeight = canvas.height * imgWidth / canvas.width;
        let heightLeft = imgHeight;

        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }

        pdf.save(`Inspeksi-${title}-${doc.tanggal_inspeksi}.pdf`);
        alert('PDF berhasil dibuat!');
    } catch (e) {
        alert('Gagal mengekspor PDF: ' + e.message);
        console.error('Error Export PDF:', e);
    } finally {
        // Kembalikan konten asli
        qs('#content').innerHTML = originalContent;
        // Panggil ulang init untuk me-reload halaman
        const currentPage = document.getElementById('content').getAttribute('data-page') || 'dashboard';
        router.navigateTo(currentPage);
    }
};