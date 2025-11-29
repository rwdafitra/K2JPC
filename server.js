// server.js — FINAL VERSION WITH CONNECTION CHECKER & LOGS
const express = require("express");
const path = require("path");
const PouchDB = require("pouchdb");
const app = express();
const PORT = process.env.PORT || 8080;

// Middleware Setup
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- MANUAL CORS (Agar PWA bisa akses dari HP/Web) ---
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
});

// Load Plugin PouchDB
PouchDB.plugin(require("pouchdb-find"));

// --- LOGIKA KONEKSI DATABASE ---
// Prioritas: Variable COUCHDB_URL dari Railway -> Fallback ke nama lokal
const TARGET_URL = process.env.COUCHDB_URL || process.env.DATABASE_URL || "inspeksi_k3_local_fallback";

console.log("\n============================================");
console.log("🚀 MEMULAI PROSES KONEKSI DATABASE...");

// Masking password agar aman di log
const hiddenURL = TARGET_URL.replace(/:([^:@]+)@/, ':****@');
console.log(`📡 URL TUJUAN: ${hiddenURL}`);

// Inisialisasi DB
const db = new PouchDB(TARGET_URL);

// --- DETEKTIF KONEKSI (DIJALANKAN SAAT SERVER START) ---
// Ini akan mengecek apakah server benar-benar bisa "melihat" database inspeksi_k3
db.info().then(info => {
    console.log("✅ KONEKSI SUKSES!");
    console.log(`   - Nama Database: ${info.db_name}`);
    console.log(`   - Jumlah Dokumen: ${info.doc_count}`);
    console.log("   (Aplikasi siap menerima data Sync)");
}).catch(err => {
    console.error("❌ KONEKSI GAGAL / DATABASE TIDAK DITEMUKAN!");
    console.error(`   - Error: ${err.message}`);
    
    if (TARGET_URL.includes("http")) {
        console.error("   ⚠️  Cek Variable COUCHDB_URL di Railway.");
        console.error("   ⚠️  Pastikan user/password benar dan database 'inspeksi_k3' sudah dibuat.");
    } else {
        console.error("   ⚠️  Server menggunakan penyimpanan file LOKAL (Bukan Cloud).");
        console.error("   ⚠️  Data akan hilang saat restart jika tidak segera diperbaiki.");
    }
});
console.log("============================================\n");


// --- API ROUTES ---

// 1. INSPEKSI (PUSH & PULL)
app.put("/api/inspeksi/:id", async (req, res) => {
    try {
        console.log(`📥 [PUSH] Menerima inspeksi: ${req.params.id}`);
        const doc = req.body;
        doc._id = req.params.id;
        try {
            const exist = await db.get(doc._id);
            doc._rev = exist._rev;
        } catch(e) {} // Dokumen baru
        
        const response = await db.put(doc);
        console.log(`✅ [SAVED] Sukses simpan ke DB.`);
        res.json(response);
    } catch (err) {
        console.error(`❌ [ERROR] Gagal simpan: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/inspeksi", async (req, res) => {
    try {
        const result = await db.allDocs({ 
            include_docs: true, 
            attachments: true, 
            descending: true 
        });
        const docs = result.rows.map(row => row.doc).filter(d => d.type === 'inspection' && !d.deleted);
        console.log(`📤 [PULL] Mengirim ${docs.length} dokumen ke client.`);
        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. USERS (PUSH & PULL)
app.put("/api/users", async (req, res) => {
    try {
        const user = req.body;
        user._id = user._id || `user_${user.username}`;
        try {
            const exist = await db.get(user._id);
            user._rev = exist._rev;
        } catch(e) {}
        const response = await db.put(user);
        console.log(`👤 [USER] Saved: ${user.username}`);
        res.json(response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/users", async (req, res) => {
    try {
        const result = await db.allDocs({ include_docs: true });
        const users = result.rows.map(r => r.doc).filter(d => d.type === 'user');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SPA Fallback
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));