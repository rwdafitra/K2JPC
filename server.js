// server.js — FINAL DEBUGGER VERSION
const express = require("express");
const path = require("path");
const PouchDB = require("pouchdb");
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
});

PouchDB.plugin(require("pouchdb-find"));

// Database Connection
const TARGET_URL = process.env.COUCHDB_URL || process.env.DATABASE_URL || "inspeksi_k3_local_fallback";
const safeLog = TARGET_URL.replace(/:([^:@]+)@/, ':****@');

console.log("\n============================================");
console.log(`🔌 URL DATABASE: ${safeLog}`);
const db = new PouchDB(TARGET_URL);

// Cek status awal
db.info().then(info => {
    console.log(`✅ TERHUBUNG KE: ${info.db_name}`);
    console.log(`📊 TOTAL DOKUMEN SAAT INI: ${info.doc_count}`);
}).catch(e => console.error("❌ GAGAL KONEKSI:", e.message));
console.log("============================================\n");

// --- API ROUTES ---

// 1. INSPEKSI (PUSH)
app.put("/api/inspeksi/:id", async (req, res) => {
    try {
        console.log(`📥 [PUSH] Menerima data: ${req.params.id}`);
        const doc = req.body;
        doc._id = req.params.id;
        try {
            const exist = await db.get(doc._id);
            doc._rev = exist._rev;
        } catch(e) {}
        
        const response = await db.put(doc);
        console.log(`✅ [SAVED] Sukses.`);
        res.json(response);
    } catch (err) {
        console.error(`❌ [ERROR] Gagal simpan: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// 2. INSPEKSI (PULL) - DENGAN LOG DETEKTIF
app.get("/api/inspeksi", async (req, res) => {
    try {
        // Ambil SEMUA data mentah
        const result = await db.allDocs({ include_docs: true, attachments: true, descending: true });
        
        // --- LOG LOGIKA FILTERING ---
        const totalRaw = result.rows.length;
        console.log(`\n🔍 [DEBUG PULL] Server menemukan ${totalRaw} dokumen mentah di CouchDB.`);
        
        if (totalRaw > 0 && totalRaw < 5) {
            // Jika data sedikit, kita intip isinya di log server
            result.rows.forEach(r => {
                console.log(`   - Doc ID: ${r.id} | Type: ${r.doc.type} | Deleted: ${r.doc.deleted}`);
            });
        }

        // Lakukan Filter
        const docs = result.rows
            .map(row => row.doc)
            .filter(d => d.type === 'inspection' && !d.deleted);

        console.log(`📤 [RESPONSE] Mengirim ${docs.length} dokumen valid ke HP.\n`);
        res.json(docs);
    } catch (err) {
        console.error("Pull Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 3. USERS (PUSH & PULL)
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/users", async (req, res) => {
    try {
        const result = await db.allDocs({ include_docs: true });
        const users = result.rows.map(r => r.doc).filter(d => d.type === 'user');
        res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));