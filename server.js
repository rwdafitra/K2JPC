// server.js — FINAL POLISHED VERSION
const express = require("express");
const path = require("path");
const PouchDB = require("pouchdb");
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- MANUAL CORS MIDDLEWARE (Agar aman tanpa install paket tambahan) ---
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*"); // Izinkan akses dari mana saja
    res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
});

PouchDB.plugin(require("pouchdb-find"));

// Database Server-side
const COUCH_URL = process.env.COUCHDB_URL || process.env.DATABASE_URL || "inspeksi_db_level";

console.log("========================================");
// Masking password di log agar aman saat dilihat di Railway
const safeLog = COUCH_URL.replace(/:([^:@]+)@/, ':****@');
console.log(`🔌 DATABASE TARGET: ${safeLog}`);
console.log("========================================");

const db = new PouchDB(COUCH_URL);

// --- API ROUTES ---

// 1. INSPEKSI (PUSH & PULL)
app.put("/api/inspeksi/:id", async (req, res) => {
    try {
        const doc = req.body;
        doc._id = req.params.id;
        try {
            const exist = await db.get(doc._id);
            doc._rev = exist._rev;
        } catch(e) {} 
        const response = await db.put(doc);
        console.log(`✅ Saved Inspeksi: ${doc._id}`);
        res.json(response);
    } catch (err) {
        console.error("❌ Error Save Inspeksi:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/inspeksi", async (req, res) => {
    try {
        // PERBAIKAN: Gunakan allDocs + attachments: true agar foto ikut terdownload
        const result = await db.allDocs({ 
            include_docs: true, 
            attachments: true, // PENTING: Agar foto turun ke client
            descending: true 
        });
        
        const docs = result.rows
            .map(row => row.doc)
            .filter(d => d.type === 'inspection' && !d.deleted);

        console.log(`out Kirim ${docs.length} inspeksi ke client.`);
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
        console.log(`👤 Saved User: ${user.username}`);
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