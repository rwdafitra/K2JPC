// server.js - Backend Express untuk melayani PWA dan API data
const express = require("express");
const path = require("path");
const PouchDB = require("pouchdb");
const app = express();
const PORT = process.env.PORT || 8080;

// --- KONFIGURASI MIDDLEWARE ---
app.use(express.json()); // Middleware untuk parsing body JSON

// Melayani semua file PWA dari folder 'public'
app.use(express.static(path.join(__dirname, 'public'))); 

// --- KONFIGURASI DATABASE COUCHDB (DI SISI SERVER YANG AMAN) ---

PouchDB.plugin(require("pouchdb-find"));

// Daftar variabel lingkungan yang mungkin mengandung URL CouchDB
const ENV_VARS = ['COUCHDB_URL', 'DATABASE_URL', 'INSPEKSI_K3', 'inspeksi_k3'];
let COUCHDB_URL_BASE;

for (const envName of ENV_VARS) {
    if (process.env[envName]) {
        COUCHDB_URL_BASE = process.env[envName];
        console.log(`✅ Menggunakan variabel lingkungan: ${envName}`);
        break;
    }
}

const DB_NAME = "inspeksi_k3"; 

if (!COUCHDB_URL_BASE) {
  console.error("FATAL: Variabel lingkungan CouchDB tidak ditemukan!");
  throw new Error("Koneksi CouchDB gagal. Cek variabel lingkungan di Railway.");
}

// Tambahkan slash '/' jika URL tidak diakhiri dengan slash sebelum nama DB
const couchdbUrl = COUCHDB_URL_BASE.endsWith('/') 
    ? COUCHDB_URL_BASE + DB_NAME 
    : COUCHDB_URL_BASE + '/' + DB_NAME;

const db = new PouchDB(couchdbUrl);

// PENTING: Index tetap dibuat untuk fitur pencarian lanjutan di masa depan.
db.createIndex({ index: { fields: ['type', 'created_at'] } }).catch(err => console.error("Gagal membuat index CouchDB:", err));
db.info().then(info => console.log(`✅ Terhubung ke DB: ${info.db_name}. Dokumen: ${info.doc_count}`)).catch(err => console.error("🚨 GAGAL TERHUBUNG KE COUCHDB:", err.message));


// --- API ENDPOINTS (PUSH & PULL) ---

// POST: Menerima data inspeksi dari klien (PUSH)
app.post("/api/inspeksi", async (req, res) => {
  let doc = { ...req.body };
  delete doc._rev; // PENTING: Hapus _rev agar CouchDB menghasilkan rev baru
  
  // Tambahkan _id jika belum ada (meskipun sudah dibuat di frontend, ini untuk safety)
  if (!doc._id) doc._id = "ins_" + Date.now();

  try {
    // Gunakan db.put. Karena _rev dihapus, ini akan membuat/mengganti dokumen baru
    const response = await db.put(doc);
    res.json({ success: true, id: response.id, rev: response.rev });
  } catch (err) {
    console.error("Error POST /api/inspeksi:", err);
    res.status(500).json({ error: "Gagal menyimpan data ke CouchDB.", details: err.message });
  }
});

// GET: Mengambil semua data inspeksi dari CouchDB (PULL) - MENGGUNAKAN ALLDOCS
app.get("/api/inspeksi", async (req, res) => {
  try {
    // 💡 PERBAIKAN KRITIS: Gunakan allDocs karena lebih reliable untuk full data pull
    // allDocs tidak bergantung pada index yang mungkin gagal dibuat di CouchDB.
    const result = await db.allDocs({ include_docs: true, descending: true });
    
    // Filter dokumen di server untuk memastikan hanya dokumen 'inspection' yang terkirim
    const inspectionDocs = result.rows
      .map(row => row.doc)
      .filter(doc => doc && doc.type === 'inspection');

    res.json(inspectionDocs);
  } catch (err) {
    console.error("Error GET /api/inspeksi (Pull Data):", err);
    // Pastikan server tidak crash dan memberikan pesan error yang jelas
    res.status(500).json({ error: "Gagal mengambil data dari CouchDB. Cek log server.", details: err.message });
  }
});


// GET: Route fallback untuk melayani index.html pada semua request
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`🚀 Server Express berjalan di port ${PORT}`);
});