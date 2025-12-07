// public/main.js — FINAL FIXED VERSION

/* =========================================
   1. UTILS & HELPER
   ========================================= */
const qs = (s) => document.querySelector(s);
const qsa = (s) => document.querySelectorAll(s);

const getUser = () => {
    try {
        let user = JSON.parse(localStorage.getItem('currentUser') || 'null');
        return user;
    } catch (e) { return null; }
};

const formatDate = (d) => d ? new Date(d).toLocaleString('id-ID', {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : '-';

/* =========================================
   2. NAVIGATION LOGIC (Fungsi yang Hilang)
   ========================================= */
function initNavigation() {
    const sidebar = qs('#sidebar');
    const overlay = qs('#sidebarOverlay');
    const btnToggle = qs('#toggleSidebar');
    const btnClose = qs('#btnCloseSidebar');

    function openMenu() {
        if(sidebar) sidebar.classList.add('show');
        if(overlay) overlay.classList.add('show');
    }

    function closeMenu() {
        if(sidebar) sidebar.classList.remove('show');
        if(overlay) overlay.classList.remove('show');
    }

    if(btnToggle) btnToggle.addEventListener('click', openMenu);
    if(btnClose) btnClose.addEventListener('click', closeMenu);
    if(overlay) overlay.addEventListener('click', closeMenu);

    qsa('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth < 992) closeMenu();
        });
    });

    // Network Status Listener
    function updateOnlineStatus() {
        const dot = qs('#onlineIndicator');
        const text = qs('#syncStatusText');
        if (!dot || !text) return;

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

/* =========================================
   3. SYSTEM LOGIN & AUTH (Baru)
   ========================================= */

// Cek apakah user sudah login?
function checkAuth() {
    const user = getUser(); 
    const overlay = document.getElementById('loginOverlay');
    
    if (user) {
        // User sudah login -> Hilangkan layar login
        if(overlay) overlay.style.display = 'none';
    } else {
        // User belum login -> Munculkan layar login
        if(overlay) overlay.style.display = 'flex';
    }
}

/* =========================================
   4. DOM CONTENT LOADED (Entry Point)
   ========================================= */
document.addEventListener('DOMContentLoaded', () => {
    // Jalankan Navigasi & Cek Login
    initNavigation(); 
    checkAuth();

    // Logic Tombol Login
    const formLogin = document.getElementById('formLogin');
    if(formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const u = document.getElementById('loginUser').value.toLowerCase().trim();
            const p = document.getElementById('loginPass').value;
            const btn = formLogin.querySelector('button');
            const origText = btn.innerHTML;

            console.log("Login attempt:", u, p);

            // BACKDOOR ADMIN (PENTING: Gunakan ini untuk login pertama kali!)
            if(u === 'admin' && p === 'admin123') {
                const adminData = { username:'admin', name:'Super Admin', role:'Admin' };
                localStorage.setItem('currentUser', JSON.stringify(adminData));
                location.reload();
                return;
            }

            try {
                btn.innerHTML = 'Memeriksa...'; btn.disabled = true;
                
                // Cari user di database
                const userDoc = await window._k3db.db.get(`user_${u}`);
                
                // Validasi Password
                if(userDoc.password === p) {
                    delete userDoc.password; // Jangan simpan password di localStorage
                    localStorage.setItem('currentUser', JSON.stringify(userDoc));
                    location.reload();
                } else {
                    alert("Password Salah!");
                    btn.innerHTML = origText; btn.disabled = false;
                }
            } catch(err) {
                console.error(err);
                alert("Username tidak ditemukan.");
                btn.innerHTML = origText; btn.disabled = false;
            }
        });
    }

    // Tambahkan Tombol Logout di Sidebar (Otomatis)
    const sidebar = document.querySelector('.sidebar .flex-grow-1');
    if(sidebar && !document.getElementById('btnLogout')) {
        const logoutLink = document.createElement('a');
        logoutLink.href = "#";
        logoutLink.id = "btnLogout";
        logoutLink.className = "nav-link text-danger mt-4 border-top border-white border-opacity-10 pt-3";
        logoutLink.innerHTML = '<i class="bi bi-box-arrow-right"></i> Logout';
        logoutLink.onclick = (e) => {
            e.preventDefault();
            if(confirm("Keluar dari aplikasi?")) {
                localStorage.removeItem('currentUser');
                location.reload(); 
            }
        };
        sidebar.appendChild(logoutLink);
    }
});

// --- SETELAH KODE INI ADALAH window.onPageLoaded dst... BIARKAN YANG DI BAWAH TETAP ADA ---

// --- ROUTER HOOK ---
window.onPageLoaded = function(page) {
    let user = getUser();
    
    if (!user) {
        user = { username: 'guest', role: 'Inspector', name: 'Tamu (Guest)' };
        localStorage.setItem('currentUser', JSON.stringify(user));
    }

    qsa('.nav-link').forEach(l => l.classList.remove('active'));
    const activeLink = qs(`.nav-link[data-page="${page}"]`);
    if(activeLink) activeLink.classList.add('active');
    
    if(qs('#userNameDisplay')) qs('#userNameDisplay').textContent = user.name;
    if(qs('#userRoleDisplay')) qs('#userRoleDisplay').textContent = user.role;
    if(qs('#userInitials')) qs('#userInitials').textContent = user.name.charAt(0).toUpperCase();

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
        if(qs('#pageTitle')) qs('#pageTitle').textContent = titles[page][0];
        if(qs('#pageSubtitle')) qs('#pageSubtitle').textContent = titles[page][1];
    }

    try {
        if (page === 'dashboard') initDashboard();
        if (page === 'input') initInput(user);
        if (page === 'rekap') initRekap(user);
        if (page === 'detail') initDetail(user);
        if (page === 'users') initUsers(user);
        if (page === 'grafik') initGrafik();
        if (page === 'settings') initSettings();
    } catch (e) {
        console.error("Error init page:", e);
    }
};

/* ===========================
   PAGE: DASHBOARD (Updated: Network First)
   =========================== */
async function initDashboard() {
    if(!window._k3db) return;
    
    let docs = [];
    const tbody = qs('#dashboardRecent');
    if(tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">Memuat data...</td></tr>';

    try {
        // STRATEGI: Cek Internet Dulu (Real-time)
        if (navigator.onLine) {
            try {
                // Fetch data metadata only (ringan)
                const res = await fetch('/api/inspeksi?limit=50'); 
                if (res.ok) {
                    docs = await res.json();
                    console.log("Dashboard: Mode ONLINE (Live Data)");
                } else { throw new Error("Server error"); }
            } catch(e) {
                // Fallback ke Lokal jika fetch gagal
                docs = await window._k3db.listInspections(50);
                console.log("Dashboard: Mode OFFLINE (Local Data)");
            }
        } else {
            // Offline Mode
            docs = await window._k3db.listInspections(50);
            console.log("Dashboard: Mode OFFLINE");
        }
        
        // Update Statistik
        if(qs('#statTotal')) qs('#statTotal').textContent = docs.length;
        if(qs('#statOpen')) qs('#statOpen').textContent = docs.filter(d => d.status === 'Open').length;
        if(qs('#statClosed')) qs('#statClosed').textContent = docs.filter(d => d.status === 'Closed').length;
        if(qs('#statCritical')) qs('#statCritical').textContent = docs.filter(d => (d.kode_bahaya === 'AA' || d.risk_score >= 15) && d.status === 'Open').length;

        // Render Tabel
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

/* ===========================
   PAGE: INPUT
   =========================== */
function initInput(user) {
    const form = qs('#formMinerba');
    if(!form) return;

    if(qs('#f_inspector')) qs('#f_inspector').value = user.name;
    if(qs('#f_inspectorId')) qs('#f_inspectorId').value = user.username;
    
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    if(qs('#f_tanggal')) qs('#f_tanggal').value = now.toISOString().slice(0,16);

    function calcRisk() {
        const sevEl = qs('#f_sev');
        const probEl = qs('#f_prob');
        if(!sevEl || !probEl) return;

        const s = parseInt(sevEl.value) || 1;
        const p = parseInt(probEl.value) || 1;
        const score = s * p;
        
        if(qs('#f_risk_score')) qs('#f_risk_score').value = score;
        const label = qs('#f_risk_level');
        
        if(label) {
            if(score >= 15) { label.value = 'EXTREME'; label.style.background='#dc3545'; label.style.color='#fff'; }
            else if(score >= 10) { label.value = 'HIGH'; label.style.background='#fd7e14'; label.style.color='#fff'; }
            else if(score >= 5) { label.value = 'MODERATE'; label.style.background='#ffc107'; label.style.color='#000'; }
            else { label.value = 'LOW'; label.style.background='#198754'; label.style.color='#fff'; }
        }
    }
    if(qs('#f_sev')) qs('#f_sev').addEventListener('change', calcRisk);
    if(qs('#f_prob')) qs('#f_prob').addEventListener('change', calcRisk);

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

// 1. Ambil File dari Input
const fileInput = qs('#f_foto');
const files = fileInput.files; 
const attachments = [];

// 2. Konversi FileList ke Array untuk diproses db.js
if (files && files.length > 0) {
    console.log(`📸 Ditemukan ${files.length} foto untuk diupload.`);
    for (let i = 0; i < files.length; i++) {
        attachments.push(files[i]);
    }
} else {
    console.log("⚠️ Tidak ada foto yang dipilih.");
}

// 3. Buat Object Dokumen
const doc = {
    // ... (field inspector, tanggal, shift, dll TETAP SAMA seperti kodemu sebelumnya) ...
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

try {
    // Kirim ke Database
    await window._k3db.saveInspection(doc, attachments);
    
    alert("✅ Data & Foto Berhasil Disimpan!");
    router.navigateTo('dashboard');
} catch(err) {
    console.error(err); // Lihat error di console
    alert("❌ Gagal simpan: " + err.message);
    btn.disabled = false; btn.innerHTML = origText;
}
    });
}

/* ===========================
   PAGE: REKAP
   =========================== */
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

/* ===========================
   PAGE: DETAIL (Updated Validasi KTT/HSE)
   =========================== */
async function initDetail(user) {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const id = params.get('id');
    if(!id) return;

    try {
        let doc;
        try { doc = await window._k3db.getInspection(id); } 
        catch(e) { throw new Error("Data belum disinkron ke perangkat ini."); }

        const content = qs('#detailContent');
        
        // CEK ROLE: Apakah user ini boleh memvalidasi?
        const allowedToClose = ['KTT', 'HSE'].includes(user.role);

        content.innerHTML = `
            <div class="card card-pro p-4 mb-4">
                <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
                    <div>
                        <h5 class="fw-bold mb-1">${doc.lokasi}</h5>
                        <small class="text-muted">${doc.perusahaan} | ${doc.shift}</small>
                    </div>
                    <span class="badge bg-${doc.status==='Open'?'danger':'success'} px-3 py-2 rounded-pill">${doc.status}</span>
                </div>
                
                <div class="alert alert-secondary border-0 bg-opacity-10">
                    <h6 class="fw-bold small text-uppercase text-muted">Uraian Temuan</h6>
                    <p class="mb-0 text-dark">${doc.uraian}</p>
                </div>
                
                <div class="alert alert-primary border-0 bg-opacity-10 mt-3">
                    <h6 class="fw-bold small text-uppercase text-muted">Rekomendasi</h6>
                    <p class="mb-2 text-dark">${doc.rekomendasi}</p>
                    <div class="d-flex gap-3 small text-muted border-top pt-2">
                         <span>PIC: <strong>${doc.pic||'-'}</strong></span>
                         <span>Due: <strong>${doc.due_date||'-'}</strong></span>
                    </div>
                </div>

                <div class="mt-4 row g-2" id="detailPhotos"></div>

                <div class="d-flex gap-2 justify-content-end mt-5 pt-3 border-top">
                    <button class="btn btn-outline-dark" onclick="window.exportPDF('${doc._id}')">
                        <i class="bi bi-printer me-2"></i> PDF
                    </button>
                    
                    ${ (doc.status === 'Open' && allowedToClose) 
                        ? `<button class="btn btn-success fw-bold" onclick="closeInsp('${doc._id}')">
                             <i class="bi bi-check-lg me-2"></i>VALIDASI & CLOSE
                           </button>` 
                        : '' 
                    }
                </div>
                
                ${ (doc.status === 'Open' && !allowedToClose)
                    ? `<div class="alert alert-warning mt-3 text-center small">
                        <i class="bi bi-lock-fill"></i> Menunggu validasi KTT / HSE
                       </div>`
                    : ''
                }
            </div>
        `;

        // Render Foto (Sama seperti sebelumnya)
        // ... (Kode render foto kamu biasanya ada di sini, copy dari yang lama atau biarkan jika tidak berubah) ...
        // Agar simple, saya tulis ulang versi pendek render foto:
        const photoCont = qs('#detailPhotos');
        if(doc._attachments) {
             for(const k in doc._attachments) {
                const blob = await window._k3db.db.getAttachment(doc._id, k);
                const url = URL.createObjectURL(blob);
                photoCont.innerHTML += `<div class="col-4"><img src="${url}" class="img-fluid rounded border"></div>`;
             }
        }

        // Logic Klik Tombol Close
        window.closeInsp = async (id) => {
            const currentUser = getUser();
            // Double Check Role (Keamanan)
            if (!['KTT', 'HSE'].includes(currentUser.role)) {
                alert("Akses Ditolak!"); return;
            }
            if(!confirm("Validasi temuan ini sebagai SELESAI (Closed)?")) return;
            
            doc.status = 'Closed';
            doc.closed_by = currentUser.name;
            doc.synced = false;
            await window._k3db.db.put(doc);
            initDetail(currentUser); // Refresh
        };

    } catch(e) {
        if(qs('#detailContent')) qs('#detailContent').innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
}

/* ===========================
   PAGE: USERS (Updated Password & Role)
   =========================== */
async function initUsers(user) {
    if (!window._k3db?.listUsers) return;
    
    // Proteksi: Hanya Admin yang boleh lihat halaman ini
    if (user.role !== 'Admin') {
        qs('#content').innerHTML = `<div class="alert alert-danger m-4">Akses Ditolak. Hanya Admin yang boleh mengakses halaman ini.</div>`;
        return;
    }

    const body = qs('#userTableBody');
    const form = qs('#userForm');
    if (!body || !form) return;

    // Render Tabel User
    async function render() {
        const users = await window._k3db.listUsers();
        if (users.length === 0) {
            body.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Belum ada user.</td></tr>';
            return;
        }
        body.innerHTML = users.map(u => `
            <tr>
               <td>${u.name}</td>
               <td>${u.username}</td>
               <td><span class="badge bg-${u.role==='Admin'?'dark':u.role==='KTT'?'primary':'secondary'}">${u.role}</span></td>
               <td>
                 <button class="btn btn-sm btn-danger" onclick="deleteUser('${u._id}')"><i class="bi bi-trash"></i></button>
               </td>
            </tr>
        `).join('');
    }

    window.deleteUser = async (id) => {
        if(!confirm("Hapus user ini?")) return;
        try { await window._k3db.deleteUser(id); render(); } 
        catch(e) { alert("Gagal hapus: " + e.message); }
    };

    // Handle Form Submit
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    
    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const uname = newForm.querySelector('#f_uname').value.trim().toLowerCase();
        const pass = newForm.querySelector('#f_pass').value;
        const name = newForm.querySelector('#f_name').value;
        const role = newForm.querySelector('#f_role').value;

        if (pass.length < 4) { alert("Password minimal 4 karakter!"); return; }

        const doc = {
            _id: `user_${uname}`, 
            username: uname,
            password: pass, // Simpan password
            name: name,
            role: role,
            type: 'user'
        };
        try {
            await window._k3db.saveUser(doc);
            newForm.reset();
            render();
            alert(`User ${name} (${role}) berhasil dibuat!`);
        } catch(e) { alert("Gagal simpan user: " + e.message); }
    });

    render();
}

/* ===========================
   PAGE: GRAFIK
   =========================== */
async function initGrafik() {
    const ctxRisk = qs('#chartRisk');
    const ctxStatus = qs('#chartStatus');
  
    if (!ctxRisk || !ctxStatus) return; 
    if (!window._k3db) return;
  
    try {
      const docs = await window._k3db.listInspections(500); 
      
      const loader = qs('#chartLoading');
      if(loader) loader.remove();
  
      const riskCounts = { HIGH:0, MEDIUM:0, LOW:0, EXTREME:0 };
      const statusCounts = { Open:0, Closed:0 };
  
      docs.forEach(d => {
          let r = d.risk_level || 'LOW';
          if (riskCounts[r] !== undefined) riskCounts[r]++;
          else riskCounts['LOW']++; 
          
          const s = d.status || 'Open';
          if (statusCounts[s] !== undefined) statusCounts[s]++;
          else statusCounts['Open']++;
      });
  
      if (window.chartInstanceRisk) window.chartInstanceRisk.destroy(); 
      window.chartInstanceRisk = new Chart(ctxRisk, {
          type: 'bar',
          data: {
              labels: ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'],
              datasets: [{
                  label: 'Jumlah Temuan',
                  data: [riskCounts.LOW, riskCounts.MEDIUM, riskCounts.HIGH, riskCounts.EXTREME],
                  backgroundColor: ['#198754', '#ffc107', '#fd7e14', '#dc3545'],
                  borderWidth: 1
              }]
          },
          options: { responsive: true, plugins: { legend: {display:false} } }
      });
  
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
   PAGE: SETTINGS
   =========================== */
function initSettings() {
    const btnSyncSet = qs('#btnSyncNowSettings');
    if(btnSyncSet) {
        btnSyncSet.addEventListener('click', () => {
            qs('#btnSync').click(); 
        });
    }

    const btnForce = qs('#btnForcePush');
    if(btnForce) {
        btnForce.addEventListener('click', async () => {
            if(!confirm("Kirim ulang SEMUA data lokal ke server? Gunakan ini jika data server kosong.")) return;
            
            const orig = btnForce.innerHTML;
            btnForce.disabled = true;
            btnForce.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Resetting...';
            
            try {
                const count = await window._k3db.resetSyncStatus();
                btnForce.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Uploading ${count} items...`;
                const stats = await window._k3db.sync();
                
                alert(`Sukses! ${stats.pushed} data berhasil dikirim ulang ke server.`);
            } catch(e) {
                alert("Gagal: " + e.message);
            } finally {
                btnForce.disabled = false;
                btnForce.innerHTML = orig;
            }
        });
    }
    
    const btnClear = qs('#btnClearAll');
    if(btnClear) {
        btnClear.addEventListener('click', async () => {
            if(!confirm("PERINGATAN: Hapus semua data di HP ini? Data yang belum sync akan HILANG PERMANEN.")) return;
            await window._k3db.db.destroy();
            alert("Database lokal dihapus. Halaman akan dimuat ulang.");
            location.reload();
        });
    }
}

/* ===========================
   GLOBAL EXPORT & SYNC
   =========================== */
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

const syncBtn = qs('#btnSync');
if(syncBtn) {
    syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true;
        const orig = syncBtn.innerHTML;
        syncBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Syncing...';
        try {
            const stats = await window._k3db.sync();
            alert(`Sinkronisasi Selesai.\nUpload: ${stats.pushed}\nDownload: ${stats.pulled}`);
            const currentPage = document.querySelector('.nav-link.active')?.getAttribute('data-page') || 'dashboard';
            window.onPageLoaded(currentPage); 
        } catch(e) {
            alert("Sync Gagal: " + e.message);
        } finally {
            syncBtn.disabled = false;
            syncBtn.innerHTML = orig;
        }
    });
}

// --- TAMBAHAN DI BAGIAN PALING BAWAH public/main.js ---

// Fungsi global untuk export semua data
window.exportAllToPdf = async () => {
    if (!confirm('Ekspor semua inspeksi yang tersimpan? (Akan mengunduh banyak file)')) return;
    
    const btn = document.querySelector('#btnExportAll');
    const originalText = btn ? btn.innerHTML : '';
    if(btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processing...';
    }

    try {
        const docs = await window._k3db.listInspections();
        if(docs.length === 0) {
            alert("Tidak ada data untuk diekspor.");
            return;
        }

        // Loop dan download satu per satu
        for (const doc of docs) {
            // Beri jeda 500ms agar browser tidak hang
            await new Promise(r => setTimeout(r, 500));
            // Gunakan fungsi exportPDF yang sudah ada di atas
            await window.exportPDF(doc._id);
        }
        alert("Selesai mengekspor semua data.");
    } catch (e) {
        alert('Gagal ekspor: ' + e.message);
    } finally {
        if(btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
};