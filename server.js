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

// PENTING: Index tetap dibuat untuk fitur pencarian lanjutan di masa depan,
// tetapi tidak lagi menjadi bottleneck untuk full data pull.
db.createIndex({ index: { fields: ['type', 'created_at'] } }).catch(err => console.error("Gagal membuat index CouchDB:", err));
db.info().then(info => console.log(`✅ Terhubung ke DB: ${info.db_name}. Dokumen: ${info.doc_count}`)).catch(err => console.error("🚨 GAGAL TERHUBUNG KE COUCHDB:", err.message));


// --- API ENDPOINTS (PUSH & PULL) ---\r\n
\r\n// POST: Menerima data inspeksi dari klien (PUSH)\r\napp.post(\"/api/inspeksi\", async (req, res) => {\r\n  let doc = { ...req.body };\r\n  delete doc._rev; // PENTING: Hapus _rev agar CouchDB menghasilkan rev baru\r\n  \r\n  // Tambahkan _id jika belum ada (meskipun sudah dibuat di frontend, ini untuk safety)\r\n  if (!doc._id) doc._id = \"ins_\" + Date.now();\r\n\r\n  try {\r\n    // Gunakan db.put. Karena _rev dihapus, ini akan membuat/mengganti dokumen baru\r\n    const response = await db.put(doc);\r\n    res.json({ success: true, id: response.id, rev: response.rev });\r\n  } catch (err) {\r\n    console.error(\"Error POST /api/inspeksi:\", err);\r\n    res.status(500).json({ error: \"Gagal menyimpan data ke CouchDB.\", details: err.message });\r\n  }\r\n});

// GET: Mengambil semua data inspeksi dari CouchDB (PULL) - MENGGUNAKAN ALLDOCS\r\napp.get(\"/api/inspeksi\", async (req, res) => {\r\n  try {\r\n    // 🚨 PERBAIKAN KRITIS: Gunakan allDocs karena lebih reliable untuk full data pull\r\n    // allDocs tidak bergantung pada index yang mungkin gagal dibuat.\r\n    const result = await db.allDocs({ include_docs: true, descending: true });\r\n    \r\n    // Filter dokumen di server untuk memastikan hanya dokumen 'inspection' yang terkirim\r\n    const inspectionDocs = result.rows\r\n      .map(row => row.doc)\r\n      .filter(doc => doc && doc.type === 'inspection'); // Pastikan doc ada dan tipenya benar\r\n\r\n    res.json(inspectionDocs);\r\n  } catch (err) {\r\n    console.error(\"Error GET /api/inspeksi (Pull Data):\", err);\r\n    // Pastikan server tidak crash dan memberikan pesan error yang jelas\r\n    res.status(500).json({ error: \"Gagal mengambil data dari CouchDB. Cek log server.\", details: err.message });\r\n  }\r\n});\r\n\r\n\r\n// GET: Route fallback untuk melayani index.html pada semua request\r\napp.get(\"*\", (req, res) => {\r\n  res.sendFile(path.join(__dirname, 'public', 'index.html'));\r\n});\r\n\r\n// --- START SERVER ---\r\napp.listen(PORT, () => {\r\n  console.log(`🚀 Server Express berjalan di port ${PORT}`);\r\n});