// main.js — FINAL (bagian 1/3)
// Helpers, auth mock, dan logika sinkronisasi (push/pull)

/* ===========================
   HELPERS & AUTH MOCK
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
  } catch (e) {
    return isoString;
  }
}

/* ===========================
   AUTH MOCK / USER
   - stored in localStorage currentUser
   - provides basic RBAC used across pages
   =========================== */
function getUserRole() {
  try {
    let user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!user) {
      user = { username: 'admin', role: 'Manager', name: 'KTT Manager' };
      localStorage.setItem('currentUser', JSON.stringify(user));
    }
    return user;
  } catch (e) {
    // fallback safe user
    return { username: 'admin', role: 'Manager', name: 'KTT Manager' };
  }
}
window.currentUser = getUserRole();

/* ===========================
   SYNC: PUSH / PULL helpers
   - uses window._k3db (must be provided by db.js)
   - defensive: always check _k3db and online
   =========================== */

/**
 * Push documents of given type ('inspection'|'user') to server API.
 * Returns number of successfully pushed documents.
 */
async function pushDataToAPI(type) {
  if (!window._k3db || !isOnline()) return 0;
  let successCount = 0;
  const apiUrl = (type === 'user') ? window._k3db.API_USER_URL : window._k3db.API_URL;

  try {
    // Use find() but fallback handled inside db.js; here assume _k3db.db.find exists
    const q = await window._k3db.db.find({
      selector: { type: type, synced: false, deleted: { $ne: true } },
      limit: 9999
    });

    const toSync = (q && q.docs) ? q.docs : [];

    if (toSync.length === 0) return 0;

    for (const doc of toSync) {
      try {
        // Prepare payload: avoid sending attachments raw (server may handle separately)
        const payload = { ...doc };
        delete payload._rev;
        // If attachments exist, do not include binary in payload by default
        if (payload._attachments) {
          // convert attachments metadata only
          payload._attachments = Object.keys(payload._attachments).reduce((acc, k) => {
            acc[k] = { content_type: payload._attachments[k].content_type, length: payload._attachments[k].length };
            return acc;
          }, {});
        }

        const url = (type === 'inspection') ? `${apiUrl}/${encodeURIComponent(doc._id)}` : apiUrl;

        const res = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const json = await res.json().catch(() => ({}));
          // mark local doc as synced
          const local = await window._k3db.db.get(doc._id);
          local.synced = true;
          if (json.rev) local._rev = json.rev;
          await window._k3db.db.put(local);
          successCount++;
        } else {
          console.warn(`pushDataToAPI: server returned ${res.status} for ${doc._id}`);
        }
      } catch (errDoc) {
        console.error('pushDataToAPI: error pushing doc', doc._id, errDoc);
        // continue with next doc
      }
    }
  } catch (err) {
    console.error('pushDataToAPI error:', err);
  }

  return successCount;
}

/**
 * Pull remote docs for given type and upsert into local DB.
 * - expects server to return array of docs (with _id)
 */
async function pullDataFromAPI(type) {
  if (!window._k3db || !isOnline()) return;
  const apiUrl = (type === 'user') ? window._k3db.API_USER_URL : window._k3db.API_URL;

  try {
    const res = await fetch(apiUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);

    const remote = await res.json();
    if (!Array.isArray(remote)) return;

    const toPut = [];
    for (const r of remote) {
      if (!r._id) continue;
      r.synced = true;
      // preserve local _rev when present to avoid conflicts blindly
      try {
        const local = await window._k3db.db.get(r._id);
        r._rev = local._rev;
      } catch (e) {
        delete r._rev;
      }
      toPut.push(r);
    }

    if (toPut.length > 0) {
      await window._k3db.db.bulkDocs(toPut);
    }
  } catch (err) {
    console.error('pullDataFromAPI error:', err);
  }
}

/* ===========================
   SYNC BUTTON HANDLING
   - attaches to #btnSync in index.html
   - safe guards & UI feedback
   =========================== */
(function attachSyncButton() {
  const btn = qs('#btnSync');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!isOnline()) return alert('Anda sedang offline. Sinkronisasi dibatalkan.');
    if (!window._k3db) return alert('Sistem database lokal belum siap. Coba refresh halaman.');

    // UI: disable + spinner
    btn.disabled = true;
    const origHtml = btn.innerHTML;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Syncing...`;

    try {
      // push users then pull users (so server has users)
      const pushedUsers = await pushDataToAPI('user');
      await pullDataFromAPI('user');

      // push inspections then pull inspections
      const pushedInspections = await pushDataToAPI('inspection');
      await pullDataFromAPI('inspection');

      alert(`Sinkronisasi selesai. Users uploaded: ${pushedUsers}. Inspections uploaded: ${pushedInspections}.`);
    } catch (err) {
      console.error('Sync error:', err);
      alert('Sinkronisasi gagal. Periksa konsol untuk detail.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
      // refresh current page data
      const current = qs('#content')?.getAttribute('data-page') || window.location.hash.replace('#','') || 'dashboard';
      try { router.navigateTo(current.split('?')[0]); } catch(e){ /* ignore */ }
    }
  });
})();

/* ============================================================
   ROUTER CALLBACK — DIPANGGIL SETIAP PAGE BERGANTI
   ============================================================ */
window.onPageLoaded = function (page) {
  const user = getUserRole();

  // Update highlight menu
  document.getElementById('content').setAttribute('data-page', page);
  qsa('.sidebar a').forEach(a => a.classList.remove('active'));
  qs(`.sidebar a[data-page="${page}"]`)?.classList.add('active');

  // RBAC — menu users hanya muncul untuk Manager
  const userMenu = qs('.sidebar a[data-page="users"]');
  if (userMenu) {
    userMenu.style.display = (user.role === 'Manager') ? 'block' : 'none';
  }

  // Panggil init sesuai page
  try {
    if (page === 'dashboard') initDashboard();
    if (page === 'input') initInput(user);
    if (page === 'rekap') initRekap(user);
    if (page === 'detail') initDetail(user);
    if (page === 'grafik') initGrafik();
    if (page === 'users') initUsers(user);
    if (page === 'settings') initSettings();
  } catch (e) {
    console.error(`Init error (page: ${page})`, e);
    const c = qs('#content');
    if (c) c.innerHTML = `<div class="alert alert-danger">Gagal memuat halaman <strong>${page}</strong>. Lihat konsol.</div>`;
  }
};

/* ============================================================
   DASHBOARD
   ============================================================ */
async function initDashboard() {
  if (!window._k3db?.listInspections) return;

  try {
    const docs = await window._k3db.listInspections();
    const total = docs.length;
    const open = docs.filter(d => d.status === 'Open').length;
    const closed = docs.filter(d => d.status === 'Closed').length;
    const critical = docs.filter(d => d.risk_score >= 15 && d.status === 'Open').length;

    qs('#kt-total').textContent = total;
    qs('#kt-open').textContent = open;
    qs('#kt-closed').textContent = closed;
    qs('#kt-critical').textContent = critical;
    qs('#lastSyncDisplay') && (qs('#lastSyncDisplay').textContent = formatDate(new Date().toISOString()));

    // Dashboard alert
    const alertBox = qs('#dashboardAlert');
    if (alertBox) {
      if (total === 0) {
        alertBox.innerHTML = `<div class="alert alert-info small">Belum ada data inspeksi. Silakan input data.</div>`;
      } else {
        alertBox.innerHTML = '';
      }
    }

    // Render 10 data terbaru
    renderDashboardRecent();
  } catch (e) {
    console.error('Dashboard error:', e);
    qs('#kt-total').textContent = 'Err';
  }
}

/* ============================================================
   INPUT INSPEKSI
   ============================================================ */
function initInput(user) {
  const form = qs('#formMinerba');
  if (!form) return;

  // Pre-fill inspector & tanggal
  const today = new Date().toISOString().split('T')[0];
  if (qs('#f_tanggal_inspeksi')) qs('#f_tanggal_inspeksi').value = today;

  qs('#f_inspector').value = user.name;
  qs('#f_inspectorId').value = user.username;

  // Risk calculator
  function calcRisk() {
    const s = parseInt(qs('#f_sev')?.value) || 0;
    const l = parseInt(qs('#f_like')?.value) || 0;
    const score = s * l;
    qs('#f_risk').value = score;
    qs('#f_risk_cat').value =
      score >= 15 ? 'HIGH' : score >= 9 ? 'MEDIUM' : 'LOW';
  }
  qs('#f_sev')?.addEventListener('input', calcRisk);
  qs('#f_like')?.addEventListener('input', calcRisk);
  calcRisk();

  // Submit form
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!window._k3db?.saveInspection) return alert('DB belum siap.');

    // Build doc
    const doc = {
      inspector: qs('#f_inspector').value,
      inspector_id: qs('#f_inspectorId').value,
      lokasi: qs('#f_location').value,
      area: qs('#f_area').value,
      jenis_kegiatan: qs('#f_activity').value,
      kategori_temuan: qs('#f_category').value,
      uraian_temuan: qs('#f_uraian').value,
      rekomendasi: qs('#f_rekomendasi').value,
      severity: parseInt(qs('#f_sev').value) || 0,
      likelihood: parseInt(qs('#f_like').value) || 0,
      risk_score: parseInt(qs('#f_risk').value) || 0,
      risk_category: qs('#f_risk_cat').value,
      status: 'Open',
      komentar: [],
      gps: qs('#f_gps').value,
      referensi_hukum: qs('#f_ref_hukum').value,
      target_tindak_lanjut: qs('#f_target_tl').value,
      tanggal_inspeksi: qs('#f_tanggal_inspeksi').value,
      type: 'inspection',
      deleted: false
    };

    // Convert photos to base64 attachments
    const files = Array.from(qs('#f_photos').files);
    const attachments = await Promise.all(files.map(file => {
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve({
          type: file.type,
          blob: e.target.result.split(',')[1],
          filename: file.name
        });
        reader.readAsDataURL(file);
      });
    }));

    try {
      await window._k3db.saveInspection(doc, attachments);
      alert('Data inspeksi tersimpan lokal. Lakukan Sync untuk upload ke server.');
      form.reset();
      calcRisk();
      router.navigateTo('dashboard');
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan: ' + err.message);
    }
  });
}

/* ============================================================
   REKAP INSPEKSI
   ============================================================ */
async function initRekap(user) {
  if (!window._k3db?.listInspections) return;

  const body = qs('#rekapTableBody');
  if (!body) return;

  try {
    const docs = await window._k3db.listInspections();
    const filtered = (user.role === 'Inspector')
      ? docs.filter(d => d.inspector_id === user.username)
      : docs;

    if (filtered.length === 0) {
      body.innerHTML = `<tr><td colspan="7" class="text-center text-muted small">Tidak ada data inspeksi.</td></tr>`;
      return;
    }

    body.innerHTML = filtered.map(doc => `
      <tr>
        <td>${doc.tanggal_inspeksi || '-'}</td>
        <td>${doc.inspector || '-'}</td>
        <td>${(doc.lokasi || '-') + ' / ' + (doc.area || '-')}</td>
        <td>${(doc.uraian_temuan || '').slice(0, 60)}${(doc.uraian_temuan || '').length > 60 ? '...' : ''}</td>
        <td>${doc.risk_category || '-'} (${doc.risk_score || 0})</td>
        <td><span class="badge bg-${doc.status === 'Open' ? 'warning' : 'success'}">${doc.status}</span></td>
        <td>
          <button class="btn btn-sm btn-info me-1" onclick="router.navigateTo('detail',{id:'${doc._id}'})"><i class="bi bi-eye"></i></button>
          <button class="btn btn-sm btn-danger" onclick="handleDelete('${doc._id}','${doc.lokasi}')"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error(e);
    body.innerHTML = `<tr><td colspan="7" class="text-danger">Gagal memuat: ${e.message}</td></tr>`;
  }
}

/* ============================================================
   DETAIL INSPEKSI
   ============================================================ */
async function initDetail(user) {
  if (!window._k3db?.getInspection) return;

  const params = new URLSearchParams(location.hash.split('?')[1]);
  const id = params.get('id');
  const content = qs('#detailContent');
  const commentForm = qs('#commentForm');
  if (!id || !content) return router.navigateTo('dashboard');

  async function render() {
    try {
      const doc = await window._k3db.getInspection(id);
      const canEdit = (doc.inspector_id === user.username) || (user.role === 'Manager');

      let html = `
        <div class="card mb-3">
          <div class="card-header">
            <strong>${doc.lokasi} - ${doc.area}</strong>
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
                <p><strong>Risk:</strong> ${doc.risk_category} (S:${doc.severity} × L:${doc.likelihood} = ${doc.risk_score})</p>
                <p><strong>Rekomendasi:</strong> ${doc.rekomendasi}</p>
                <p><strong>Target TL:</strong> ${doc.target_tindak_lanjut || '-'}</p>
                <p><strong>Referensi Hukum:</strong> ${doc.referensi_hukum || '-'}</p>
                <p><strong>GPS:</strong> ${doc.gps || '-'}</p>
              </div>
            </div>

            <h6 class="border-bottom mt-3">Bukti Foto</h6>
            <div class="row" id="photoContainer"></div>

            <h6 class="border-bottom mt-3">Tindak Lanjut & Komentar</h6>
            <ul class="list-group list-group-flush small" id="commentList">
              ${(doc.komentar || []).length
                ? doc.komentar.map(c => `
                    <li class="list-group-item">
                      <strong>${c.user} (${c.role})</strong>: ${c.text}
                      <span class="text-muted float-end">${formatDate(c.date)}</span>
                    </li>`).join('')
                : '<li class="list-group-item text-muted">Belum ada komentar</li>'
              }
            </ul>
          </div>

          <div class="card-footer text-end">
            <button class="btn btn-danger btn-sm me-2" onclick="handleDelete('${doc._id}','${doc.lokasi}')" ${!canEdit ? 'disabled' : ''}>
              <i class="bi bi-trash"></i> Hapus
            </button>
            <button class="btn btn-primary btn-sm" onclick="exportPDF('${doc._id}','${doc.lokasi}-${doc.area}')">
              <i class="bi bi-file-earmark-pdf"></i> Export PDF
            </button>
            ${doc.status === 'Open' && canEdit ? `
              <button class="btn btn-success btn-sm ms-2" id="btnClose">
                <i class="bi bi-check2-circle"></i> Tandai Selesai
              </button>` : ''}
          </div>
        </div>
      `;

      content.innerHTML = html;

      // Render attachments
      const pc = qs('#photoContainer');
      if (doc._attachments && pc) {
        for (const att in doc._attachments) {
          const blob = await window._k3db.db.getAttachment(doc._id, att);
          const url = URL.createObjectURL(blob);
          pc.innerHTML += `
            <div class="col-4 mb-2">
              <a href="${url}" target="_blank">
                <img src="${url}" class="img-fluid rounded shadow-sm">
              </a>
            </div>`;
        }
      }

      // Close button
      qs('#btnClose')?.addEventListener('click', async () => {
        if (!confirm('Tandai temuan sebagai Selesai?')) return;
        doc.status = 'Closed';
        doc.komentar = doc.komentar || [];
        doc.komentar.push({
          user: user.name,
          role: user.role,
          text: 'Temuan ditutup.',
          date: new Date().toISOString()
        });
        doc.synced = false;
        await window._k3db.db.put(doc);
        alert('Status temuan diperbarui. Lakukan Sync untuk upload.');
        render();
      });

    } catch (e) {
      content.innerHTML = `<div class="alert alert-danger">Gagal memuat detail: ${e.message}</div>`;
    }
  }

  // komentar form
  commentForm?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const text = qs('#f_comment')?.value.trim();
    if (!text) return;

    try {
      const doc = await window._k3db.getInspection(id);
      doc.komentar = doc.komentar || [];
      doc.komentar.push({
        user: user.name,
        role: user.role,
        text,
        date: new Date().toISOString()
      });
      doc.synced = false;
      await window._k3db.db.put(doc);
      qs('#f_comment').value = '';
      render();
    } catch (e) {
      alert('Gagal menyimpan komentar: ' + e.message);
    }
  });

  render();
}

/* ============================================================
   GRAFIK
   ============================================================ */
async function initGrafik() {
  if (!window._k3db?.listInspections) return;

  const content = qs('#content');
  content.innerHTML = `
    <div class="container">
      <h4>Grafik Inspeksi</h4>
      <p class="small text-muted">Ringkasan grafik berdasarkan risk & status.</p>

      <div class="row">
        <div class="col-md-6">
          <div class="card p-3">
            <h6>Distribusi Risk</h6>
            <canvas id="chartRisk" height="200"></canvas>
          </div>
        </div>
        <div class="col-md-6">
          <div class="card p-3">
            <h6>Status Inspeksi</h6>
            <canvas id="chartStatus" height="200"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;

  const docs = await window._k3db.listInspections();

  const low = docs.filter(d => d.risk_category === 'LOW').length;
  const medium = docs.filter(d => d.risk_category === 'MEDIUM').length;
  const high = docs.filter(d => d.risk_category === 'HIGH').length;

  const open = docs.filter(d => d.status === 'Open').length;
  const closed = docs.filter(d => d.status === 'Closed').length;

  // Chart.js
  new Chart(qs('#chartRisk'), {
    type: 'bar',
    data: {
      labels: ['LOW', 'MEDIUM', 'HIGH'],
      datasets: [{
        label: 'Jumlah',
        data: [low, medium, high]
      }]
    }
  });

  new Chart(qs('#chartStatus'), {
    type: 'pie',
    data: {
      labels: ['Open', 'Closed'],
      datasets: [{
        data: [open, closed]
      }]
    }
  });
}

/* ============================================================
   USERS
   ============================================================ */
async function initUsers(user) {
  if (!window._k3db?.listUsers) return;

  const form = qs('#userForm');
  const listBody = qs('#userTableBody');

  async function render() {
    const users = await window._k3db.listUsers();

    if (users.length === 0) {
      listBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted small">Belum ada user</td></tr>`;
      return;
    }

    listBody.innerHTML = users.map(u => `
      <tr>
        <td>${u.name}</td>
        <td>${u.username}</td>
        <td>${u.role}</td>
        <td>
          <button class="btn btn-sm btn-info me-1" onclick="editUser('${u._id}')"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-danger" onclick="deleteUser('${u._id}')"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
    `).join('');
  }

  window.editUser = async function (id) {
    const u = await window._k3db.getUser(id);
    qs('#f_uname').value = u.username;
    qs('#f_uname').disabled = true;
    qs('#f_name').value = u.name;
    qs('#f_role').value = u.role;
    form.setAttribute('data-id', id);
  };

  window.deleteUser = async function (id) {
    if (!confirm("Hapus user ini?")) return;
    await window._k3db.deleteUser(id);
    render();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = form.getAttribute('data-id'); // mode edit jika ada

    const doc = {
      username: qs('#f_uname').value,
      name: qs('#f_name').value,
      role: qs('#f_role').value,
      type: 'user'
    };

    if (!id) {
      await window._k3db.saveUser(doc);
    } else {
      const old = await window._k3db.getUser(id);
      doc._id = old._id;
      doc._rev = old._rev;
      await window._k3db.db.put(doc);
      form.removeAttribute('data-id');
    }

    form.reset();
    qs('#f_uname').disabled = false;
    render();
  });

  render();
}

/* ============================================================
   SETTINGS
   ============================================================ */
function initSettings() {
  const content = qs('#content');
  content.innerHTML = `
    <div class="container">
      <h4>Settings</h4>
      <p class="small text-muted">Pengaturan aplikasi & utilitas debugging.</p>

      <button class="btn btn-danger" id="btnClearAll"><i class="bi bi-trash"></i> Hapus Semua Data Lokal</button>
      <button class="btn btn-secondary ms-2" id="btnReload"><i class="bi bi-arrow-repeat"></i> Reload Halaman</button>
    </div>
  `;

  qs('#btnClearAll')?.addEventListener('click', async () => {
    if (!confirm("Hapus SEMUA data lokal (PouchDB) ?")) return;
    await window._k3db?.db.destroy();
    alert("Database dihapus. Reload halaman.");
    location.reload();
  });

  qs('#btnReload')?.addEventListener('click', () => location.reload());
}

/* ============================================================
   DELETE HANDLER (Soft Delete)
   ============================================================ */
window.handleDelete = async function (id, name) {
  if (!confirm(`Hapus inspeksi "${name}" ?`)) return;

  try {
    const doc = await window._k3db.getInspection(id);
    doc.deleted = true;
    doc.synced = false;
    await window._k3db.db.put(doc);

    alert("Data dihapus lokal (soft delete). Lakukan Sync untuk sinkron ke server.");
    router.navigateTo('rekap');
  } catch (e) {
    alert('Gagal menghapus: ' + e.message);
  }
};

/* ============================================================
   SYNC BUTTONS
   ============================================================ */
qs('#btnSync')?.addEventListener('click', async () => {
  try {
    const res = await window._k3db.sync();
    alert("Sync selesai. Lihat console untuk detail.");
    qs('#lastSync').textContent = new Date().toLocaleString();
  } catch (e) {
    alert("Sync gagal: " + e.message);
  }
});

qs('#btnManualPull')?.addEventListener('click', async () => {
  try {
    await window._k3db.pull();
    alert("Pull selesai.");
    router.navigateTo('dashboard');
  } catch (e) {
    alert("Pull gagal: " + e.message);
  }
});

/* ============================================================
   EXPORT PDF
   ============================================================ */
window.exportPDF = async function (id, filename) {
  const doc = await window._k3db.getInspection(id);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });

  let y = 40;

  function addLine(text) {
    pdf.text(text, 40, y);
    y += 18;
  }

  addLine(`INSPEKSI K3 - ${doc.lokasi}`);
  addLine(`Tanggal: ${doc.tanggal_inspeksi}`);
  addLine(`Inspector: ${doc.inspector}`);
  addLine(`Area: ${doc.area}`);
  addLine(`Risk: ${doc.risk_category} (${doc.risk_score})`);
  addLine(`Uraian:`);
  pdf.text(doc.uraian_temuan || '-', 60, y); y += 40;
  addLine(`Rekomendasi:`);
  pdf.text(doc.rekomendasi || '-', 60, y); y += 40;

  // Komentar
  pdf.text("Komentar:", 40, y); y += 16;
  (doc.komentar || []).forEach(c => {
    pdf.text(`- ${c.user} (${c.role}): ${c.text}`, 60, y);
    y += 16;
  });

  // Foto
  if (doc._attachments) {
    for (const att in doc._attachments) {
      const blob = await window._k3db.db.getAttachment(doc._id, att);
      const img = await blobToBase64(blob);

      pdf.addPage();
      pdf.text(att, 40, 40);
      pdf.addImage(img, 'JPEG', 40, 60, 400, 300);
    }
  }

  pdf.save((filename || 'inspeksi') + ".pdf");
};

/* ============================================================
   HELPERS
   ============================================================ */
function qs(x) { return document.querySelector(x); }
function qsa(x) { return document.querySelectorAll(x); }

function formatDate(d) {
  if (!d) return '-';
  const x = new Date(d);
  return x.toLocaleDateString('id-ID') + ' ' + x.toLocaleTimeString('id-ID');
}

function getUserRole() {
  const raw = localStorage.getItem('k3-user');
  if (!raw) return { username: '-', name: 'Unknown', role: 'Inspector' };
  try { return JSON.parse(raw); }
  catch { return { username: '-', name: 'Unknown', role: 'Inspector' }; }
}

function blobToBase64(blob) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}
