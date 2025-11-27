// main.js - handles page lifecycle, binds forms, renders charts & tables (VERSI FINAL TERLENGKAP)
window.onPageLoaded = function(page) {
    const user = getUserRole(); // Cek peran pengguna saat ini
    
    // update sidebar visual dan judul
    document.getElementById('content').setAttribute('data-page', page);
    document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
    document.querySelector(`.sidebar a[data-page="${page}"]`)?.classList.add('active');
    
    // Tampilkan/Sembunyikan menu berdasarkan peran
    document.querySelector('.sidebar a[data-page="users"]').style.display = user.role === 'Manager' ? 'block' : 'none';

    if (page === 'dashboard') initDashboard();
    if (page === 'input') initInput(user); 
    if (page === 'rekap') initRekap(user);
    if (page === 'detail') initDetail(user); 
    if (page === 'grafik') initGrafik();
    if (page === 'users') initUsers(user);  
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

// --- AUTENTIKASI MOCK & RBAC (BARU) ---
function getUserRole() {
    let user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    // Jika user belum ada, set default Manager (untuk inisialisasi user pertama)
    if (!user) {
        user = { username: 'manager', role: 'Manager', name: 'KTT Manager' };
        localStorage.setItem('currentUser', JSON.stringify(user));
    }
    return user;
}
window.currentUser = getUserRole(); // Set global user

// --- LOGIKA SINKRONISASI API BARU (PUSH & PULL SEMUA DOKUMEN) ---

async function pushDataToAPI(type) {
    if (!window._k3db || !isOnline()) return 0;
    let successCount = 0;
    const apiUrl = type === 'user' ? window._k3db.API_USER_URL : window._k3db.API_URL;
    
    try {
        const toSync = await window._k3db.db.find({ 
            selector: { type: type, synced: false }, 
            limit: 9999 
        });

        if (toSync.docs.length === 0) return 0;
        
        for (const doc of toSync.docs) {
            const docToSend = { ...doc };
            delete docToSend._rev; 
            
            // API PUT /api/users dan PUT /api/inspeksi/id menggunakan PUT untuk update/create
            const res = await fetch(apiUrl + (type === 'inspection' ? `/${doc._id}` : ''), {
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

// PULL data Inspeksi dan User
async function pullDataFromAPI(type) {
    if (!window._k3db || !isOnline()) return;
    const apiUrl = type === 'user' ? window._k3db.API_USER_URL : window._k3db.API_URL;
    
    try {
        const res = await fetch(apiUrl); 
        if (!res.ok) throw new Error(`Server error: ${res.status}`);

        let remoteDocs = await res.json();
        if (!Array.isArray(remoteDocs)) return;
        
        console.log(`PULL SUCCESS: Menerima ${remoteDocs.length} dokumen ${type} dari server.`);

        const docsToPut = [];
        for (const remoteDoc of remoteDocs) {
            if (!remoteDoc._id) continue; // Pastikan ada _id
            remoteDoc.synced = true;
            
            try {
                const localDoc = await window._k3db.db.get(remoteDoc._id);
                remoteDoc._rev = localDoc._rev; 
            } catch (e) {
                delete remoteDoc._rev;
            }
            docsToPut.push(remoteDoc);
        }

        if (docsToPut.length > 0) {
            await window._k3db.db.bulkDocs(docsToPut);
            console.log(`Berhasil bulkDocs ${docsToPut.length} dokumen ${type}.`);
        }
    } catch (error) {
        console.error(`Error saat pullDataFromAPI (${type}):`, error);
        if(type === 'inspection') alert(`Gagal menarik data inspeksi: ${error.message}`);
    } 
}

document.getElementById('btnSync')?.addEventListener('click', async () => {
    if (!isOnline()) return alert('Anda sedang offline. Sinkronisasi dibatalkan.');
    
    // 1. PUSH & PULL USER
    const pushUserCount = await pushDataToAPI('user');
    await pullDataFromAPI('user');

    // 2. PUSH & PULL INSPEKSI
    const pushInspCount = await pushDataToAPI('inspection');
    await pullDataFromAPI('inspection');
    
    let message = `Sinkronisasi selesai! User diunggah: ${pushUserCount}. Inspeksi diunggah: ${pushInspCount}. Data terbaru ditarik.`;
    alert(message);

    // Memaksa pemuatan ulang halaman saat ini
    const currentPage = document.getElementById('content').getAttribute('data-page');
    router.navigateTo(currentPage);
});


// ------------------------------------
// --- LOGIKA PER PAGE INITIATION ---
// ------------------------------------

// initDashboard
async function initDashboard() {
    const docs = await window._k3db.listInspections();
    const total = docs.length;
    const open = docs.filter(d => d.status === 'Open').length;
    const closed = docs.filter(d => d.status === 'Closed').length;
    const critical = docs.filter(d => d.risk_score >= 15).length; // Contoh risk score tinggi

    qs('#kt-total').textContent = total;
    qs('#kt-open').textContent = open;
    qs('#kt-closed').textContent = closed;
    qs('#kt-critical').textContent = critical;
    qs('#lastSync').textContent = formatDate(new Date().toISOString());

    if (total === 0) {
        qs('#dashboardAlert').innerHTML = `<div class="alert alert-info small">Belum ada data inspeksi yang tersimpan secara lokal. Silakan input data.</div>`;
    } else {
        qs('#dashboardAlert').innerHTML = ``;
    }
}

// initInput (Sesuai Minerba)
function initInput(user) {
    const form = qs('#formMinerba');
    if (!form) return;

    qs('#f_inspector').value = user.name;
    qs('#f_inspector').setAttribute('readonly', true);
    qs('#f_inspectorId').value = user.username;
    
    // Logic Risk Score Calculator
    function calculateRisk() {
        const sev = parseInt(qs('#f_sev').value) || 0;
        const like = parseInt(qs('#f_like').value) || 0;
        const score = sev * like;
        qs('#f_risk').value = score;
        qs('#f_risk_cat').value = score >= 15 ? 'HIGH' : (score >= 9 ? 'MEDIUM' : 'LOW');
    }
    qs('#f_sev').addEventListener('input', calculateRisk);
    qs('#f_like').addEventListener('input', calculateRisk);
    calculateRisk(); // Initial calculation

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
            status: 'Open', // Default
            komentar: [],
            gps: qs('#f_gps').value,
            // new fields
            referensi_hukum: qs('#f_ref_hukum').value,
            target_tindak_lanjut: qs('#f_target_tl').value,
            tanggal_inspeksi: new Date().toISOString().split('T')[0],
        };

        const files = Array.from(qs('#f_photos').files);
        const attachments = await Promise.all(files.map(file => {
            return new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = (e) => resolve({ type: file.type, blob: e.target.result.split(',')[1] });
                reader.readAsDataURL(file);
            });
        }));

        try {
            await window._k3db.saveInspection(doc, attachments);
            alert('Inspeksi berhasil disimpan! Siap untuk sinkronisasi.');
            form.reset();
            router.navigateTo('dashboard');
        } catch (error) {
            alert('Gagal menyimpan data lokal: ' + error.message);
            console.error(error);
        }
    });
}

// initRekap
async function initRekap(user) {
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
                <td>${formatDate(doc.created_at)}</td>
                <td>${doc.inspector}</td>
                <td>${doc.lokasi} - ${doc.area}</td>
                <td>${doc.uraian_temuan.substring(0, 50)}...</td>
                <td>${doc.risk_category} (${doc.risk_score})</td>
                <td><span class="badge bg-${doc.status === 'Open' ? 'warning' : 'success'}">${doc.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-info text-white me-1" onclick="router.navigateTo('detail', '${doc._id}')"><i class="bi bi-eye"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="window.exportPDF('${doc._id}', '${doc.lokasi} - ${doc.area}')"><i class="bi bi-file-earmark-pdf"></i></button>
                </td>
            </tr>
        `).join('');

    } catch (e) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Gagal memuat data rekap: ${e.message}</td></tr>`;
    }
}

// initDetail (Kompleks: Lihat, Komen, Edit, Delete)
async function initDetail(user) {
    const id = router.getCurrentParams()?.id;
    const content = qs('#detailContent');
    const commentForm = qs('#commentForm');

    if (!id || !content || !commentForm) return router.navigateTo('dashboard');

    // Ambil data
    let doc;
    try {
        doc = await window._k3db.getInspection(id);
    } catch (e) {
        content.innerHTML = `<div class="alert alert-danger">Inspeksi tidak ditemukan.</div>`;
        return;
    }

    const isManager = user.role === 'Manager';
    const isOwner = user.username === doc.inspector_id;
    const canEdit = isManager || (isOwner && doc.status === 'Open'); // Inspector hanya bisa edit kalau status masih Open

    // Render detail
    content.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <h6>**Detail Temuan**</h6>
                <table class="table table-sm small">
                    <tr><th>ID Inspeksi</th><td>${doc._id}</td></tr>
                    <tr><th>Tanggal</th><td>${formatDate(doc.created_at)}</td></tr>
                    <tr><th>Inspector</th><td>${doc.inspector}</td></tr>
                    <tr><th>Lokasi/Area</th><td>${doc.lokasi} / ${doc.area}</td></tr>
                    <tr><th>Jenis Kegiatan</th><td>${doc.jenis_kegiatan}</td></tr>
                    <tr><th>Kategori Temuan</th><td>${doc.kategori_temuan}</td></tr>
                    <tr><th>Uraian Temuan</th><td><strong>${doc.uraian_temuan}</strong></td></tr>
                    <tr><th>Rekomendasi TL</th><td>${doc.rekomendasi}</td></tr>
                    <tr><th>Target TL</th><td>${doc.target_tindak_lanjut}</td></tr>
                    <tr><th>Referensi Hukum</th><td>${doc.referensi_hukum}</td></tr>
                    <tr><th>Risk Score</th><td><span class="badge bg-${doc.risk_score >= 15 ? 'danger' : (doc.risk_score >= 9 ? 'warning' : 'success')}">${doc.risk_category} (${doc.risk_score})</span></td></tr>
                    <tr><th>Status</th><td><span class="badge bg-${doc.status === 'Open' ? 'warning' : 'success'}" id="detailStatus">${doc.status}</span></td></tr>
                </table>
                <div class="d-flex my-3">
                    ${isManager ? `<button class="btn btn-sm btn-danger me-2" onclick="handleDelete('${doc._id}', '${doc.lokasi}')"><i class="bi bi-trash"></i> Delete</button>` : ''}
                    ${canEdit ? `<button class="btn btn-sm btn-primary" onclick="handleEdit('${doc._id}')"><i class="bi bi-pencil"></i> Edit</button>` : ''}
                </div>
            </div>
            <div class="col-md-6">
                <h6>**Foto & Bukti**</h6>
                <div id="photoContainer" class="row">
                    </div>
                ${canEdit ? `
                    <h6 class="mt-3">Ganti Status</h6>
                    <select id="statusUpdater" class="form-select form-select-sm mb-3">
                        <option value="Open" ${doc.status === 'Open' ? 'selected' : ''}>Open</option>
                        <option value="Closed" ${doc.status === 'Closed' ? 'selected' : ''}>Closed</option>
                    </select>
                ` : ''}
            </div>
        </div>
        <div class="row mt-3"><div class="col-12"><h6 class="pb-2 border-bottom">Riwayat Komentar & Tindak Lanjut</h6><div id="commentList"></div></div></div>
    `;
    
    // Load Attachments
    const photoContainer = qs('#photoContainer');
    if (doc._attachments) {
        for (const key in doc._attachments) {
            if (key.startsWith('photo_')) {
                const blob = await window._k3db.db.getAttachment(doc._id, key);
                const url = URL.createObjectURL(blob);
                photoContainer.innerHTML += `<div class="col-6 mb-2"><img src="${url}" class="img-fluid rounded shadow-sm" loading="lazy"></div>`;
            }
        }
    }
    if(photoContainer.innerHTML === '') photoContainer.innerHTML = `<div class="col-12"><div class="alert alert-light small">Tidak ada foto terlampir.</div></div>`;


    // Render Comments
    function renderComments() {
        const commentList = qs('#commentList');
        commentList.innerHTML = (doc.komentar || []).map(k => `
            <div class="card card-body bg-light mb-2 small">
                <p class="mb-1">${k.text}</p>
                <footer class="blockquote-footer m-0">${k.by} pada ${formatDate(k.at)}</footer>
            </div>
        `).join('') || '<p class="text-muted small">Belum ada komentar atau tindak lanjut.</p>';
    }
    renderComments();


    // Event Listener Ganti Status
    qs('#statusUpdater')?.addEventListener('change', async (e) => {
        const newStatus = e.target.value;
        if (confirm(`Yakin ingin mengubah status menjadi ${newStatus}?`)) {
            try {
                await window._k3db.db.put({ ...doc, status: newStatus, synced: false, _rev: doc._rev });
                doc.status = newStatus; // Update lokal
                qs('#detailStatus').textContent = newStatus;
                qs('#detailStatus').className = `badge bg-${newStatus === 'Open' ? 'warning' : 'success'}`;
                alert('Status berhasil diupdate. Segera lakukan sinkronisasi.');
            } catch (error) {
                alert('Gagal update status: ' + error.message);
            }
        }
    });

    // Event Listener Tambah Komentar
    commentForm.onsubmit = async (e) => {
        e.preventDefault();
        const commentText = qs('#f_comment').value.trim();
        if (!commentText) return;

        const newComment = {
            by: user.name,
            at: new Date().toISOString(),
            text: commentText,
        };

        try {
            const latestDoc = await window._k3db.db.get(doc._id);
            latestDoc.komentar = [...(latestDoc.komentar || []), newComment];
            latestDoc.synced = false;

            await window._k3db.db.put(latestDoc);
            
            doc.komentar = latestDoc.komentar; // Update data lokal untuk render
            renderComments(); // Re-render
            
            qs('#f_comment').value = '';
            alert('Komentar berhasil ditambahkan. Segera lakukan sinkronisasi.');

        } catch (error) {
            alert('Gagal menambahkan komentar: ' + error.message);
        }
    };
}

// Global Edit Handler (Simplifikasi: Kembali ke form input dengan data yang diisi)
window.handleEdit = (id) => {
    // Implementasi lengkap akan memerlukan loading data ke input.html
    alert('Fitur edit memerlukan implementasi loading data ke form Input.');
};

// Global Delete Handler (Manager Only)
window.handleDelete = async (id, lokasi) => {
    if (confirm(`APAKAH ANDA YAKIN INGIN MENGHAPUS (Soft Delete) Inspeksi di ${lokasi}? Tindakan ini hanya bisa dilakukan Manager.`)) {
        try {
            await window._k3db.softDeleteInspection(id);
            alert('Inspeksi berhasil dihapus (soft delete). Lakukan sinkronisasi untuk menghapus dari server.');
            router.navigateTo('rekap');
        } catch (error) {
            alert('Gagal menghapus inspeksi: ' + error.message);
        }
    }
};

// initUsers (Manajemen User oleh Manager)
async function initUsers(user) {
    const content = qs('#usersContent');
    const userForm = qs('#userForm');
    const userTableBody = qs('#userTableBody');

    if (user.role !== 'Manager') {
        content.innerHTML = `<div class="alert alert-danger">Akses ditolak. Hanya Manager yang dapat mengelola user.</div>`;
        return;
    }

    // Render User List
    async function renderUsers() {
        const users = await window._k3db.listUsers();
        userTableBody.innerHTML = users.map(u => `
            <tr>
                <td>${u.name}</td>
                <td>${u.username}</td>
                <td><span class="badge bg-${u.role === 'Manager' ? 'primary' : 'secondary'}">${u.role}</span></td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="editUser('${u.username}')"><i class="bi bi-pencil"></i> Edit</button>
                </td>
            </tr>
        `).join('');
    }
    renderUsers();


    // Event Listener Form
    userForm.onsubmit = async (e) => {
        e.preventDefault();
        const userDoc = {
            username: qs('#f_uname').value.trim(),
            name: qs('#f_name').value.trim(),
            role: qs('#f_role').value,
            status: 'Active',
        };

        if (!userDoc.username || !userDoc.name) return alert('Username dan Nama wajib diisi.');
        userDoc._id = 'user_' + userDoc.username;

        try {
            await window._k3db.saveUser(userDoc);
            alert(`User ${userDoc.name} berhasil disimpan. Lakukan sinkronisasi.`);
            userForm.reset();
            renderUsers();
        } catch (error) {
            alert('Gagal menyimpan user: ' + error.message);
        }
    };

    // Mock Edit (Perlu implementasi lengkap jika diperlukan)
    window.editUser = (username) => {
        alert(`Fungsi Edit User untuk ${username} memerlukan implementasi lanjutan.`);
    };
}


// initGrafik
function initGrafik() {
    // Logika grafik masih kosong
    qs('#chartContainer').innerHTML = `<div class="alert alert-warning small">Logika rendering Grafik & Trend akan ditambahkan di pengembangan selanjutnya.</div>`;
}

// initSettings
function initSettings() {
    // Fungsi pull manual
    qs('#btnManualPull')?.addEventListener('click', async () => {
      await pullDataFromAPI('inspection');
      await pullDataFromAPI('user');
      alert('Proses tarik data selesai.');
    });
}

// --- PDF EXPORT (BARU) ---
window.exportPDF = async (id, title) => {
    const doc = await window._k3db.getInspection(id);
    if (!doc) return alert('Data tidak ditemukan untuk di-export.');

    const pdfContent = `
        <style>
            .pdf-container { font-family: sans-serif; padding: 20px; font-size: 10px; }
            h4 { text-align: center; margin-bottom: 5px; }
            h6 { border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-top: 15px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            th, td { border: 1px solid #ddd; padding: 5px; text-align: left; }
            .signature-box { border: 1px solid #000; padding: 20px; text-align: center; width: 30%; height: 80px; display: inline-block; margin: 10px 10px 0 0;}
        </style>
        <div class="pdf-container">
            <h4>LAPORAN INSPEKSI TERENCANA K3 PERTAMBANGAN</h4>
            <p style="text-align: center; font-size: 8px;">Sesuai Ketentuan Minerba</p>
            
            <h6>A. DATA ADMINISTRASI</h6>
            <table>
                <tr><th style="width: 30%;">ID Inspeksi</th><td>${doc._id}</td></tr>
                <tr><th>Tanggal Inspeksi</th><td>${formatDate(doc.created_at)}</td></tr>
                <tr><th>Inspector</th><td>${doc.inspector} (${doc.inspector_id})</td></tr>
                <tr><th>Lokasi / Area</th><td>${doc.lokasi} / ${doc.area}</td></tr>
                <tr><th>Jenis Kegiatan</th><td>${doc.jenis_kegiatan}</td></tr>
                <tr><th>Referensi Hukum</th><td>${doc.referensi_hukum}</td></tr>
                <tr><th>Risk Score (S x L)</th><td>${doc.risk_score} (${doc.risk_category})</td></tr>
            </table>

            <h6>B. TEMUAN & REKOMENDASI</h6>
            <table>
                <tr><th style="width: 30%;">Kategori Temuan</th><td>${doc.kategori_temuan}</td></tr>
                <tr><th>Uraian Temuan</th><td>${doc.uraian_temuan}</td></tr>
                <tr><th>Rekomendasi Tindak Lanjut</th><td>${doc.rekomendasi}</td></tr>
                <tr><th>Target Penyelesaian</th><td>${doc.target_tindak_lanjut}</td></tr>
                <tr><th>Status</th><td>${doc.status}</td></tr>
            </table>

            <h6>C. RIWAYAT TINDAK LANJUT (Komentar)</h6>
            <table>
                <thead><tr><th>Waktu</th><th>Oleh</th><th>Keterangan</th></tr></thead>
                <tbody>
                    ${(doc.komentar || []).map(k => `
                        <tr><td>${formatDate(k.at)}</td><td>${k.by}</td><td>${k.text}</td></tr>
                    `).join('') || '<tr><td colspan="3">Tidak ada riwayat tindak lanjut.</td></tr>'}
                </tbody>
            </table>

            <h6 style="margin-top: 30px;">D. TANDA TANGAN PERSETUJUAN</h6>
            <div style="text-align: right; margin-top: 10px; margin-right: 50px;">
                <p style="margin-bottom: 40px;">Disetujui oleh,</p>
                <p><strong>(Nama Kepala Teknik Tambang)</strong></p>
                <p>Kepala Teknik Tambang (KTT)</p>
            </div>
            
            <p style="page-break-before: always;"></p>
            <h6>E. LAMPIRAN FOTO</h6>
            <div id="pdf-photo-container">
                </div>
        </div>
    `;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = pdfContent;
    document.body.appendChild(tempDiv);
    
    // Load photos to HTML for canvas
    const photoContainer = tempDiv.querySelector('#pdf-photo-container');
    if (doc._attachments) {
        for (const key in doc._attachments) {
            if (key.startsWith('photo_')) {
                const blob = await window._k3db.db.getAttachment(doc._id, key);
                const url = URL.createObjectURL(blob);
                photoContainer.innerHTML += `<div style="margin-bottom: 20px;"><img src="${url}" style="width: 100%; max-height: 400px; object-fit: contain;"></div>`;
            }
        }
    } else {
        photoContainer.innerHTML = '<p>Tidak ada foto terlampir.</p>';
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'pt', 'a4');
    
    // Convert HTML to Canvas and add to PDF
    html2canvas(tempDiv, { scale: 2 }).then(canvas => {
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Inspeksi_${title.replace(/\s/g, '_')}_${new Date().toLocaleDateString()}.pdf`);
        document.body.removeChild(tempDiv); // Clean up
    });
};