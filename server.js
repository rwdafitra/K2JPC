// server.js — FIXED & COMPLETE
const express = require("express");
const path = require("path");
const PouchDB = require("pouchdb");
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

PouchDB.plugin(require("pouchdb-find"));

// Database Server-side
const COUCH_URL = process.env.COUCHDB_URL || process.env.DATABASE_URL || "inspeksi_db_level";
console.log(`🔌 Database Target: ${COUCH_URL}`);
const db = new PouchDB(COUCH_URL);

// --- API ROUTES ---

// 1. INSPEKSI
app.put("/api/inspeksi/:id", async (req, res) => {
    try {
        const doc = req.body;
        doc._id = req.params.id;
        try {
            const exist = await db.get(doc._id);
            doc._rev = exist._rev;
        } catch(e) {} 
        const response = await db.put(doc);
        res.json(response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/inspeksi", async (req, res) => {
    try {
        const result = await db.find({ selector: { type: 'inspection' }, limit: 2000 });
        // Fallback jika find kosong/error
        if(!result.docs) {
             const all = await db.allDocs({include_docs: true});
             return res.json(all.rows.map(r=>r.doc).filter(d=>d.type==='inspection'));
        }
        res.json(result.docs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. USERS (SEBELUMNYA KOSONG, INI PERBAIKANNYA)
app.put("/api/users", async (req, res) => {
    try {
        const user = req.body;
        // Pastikan ID user konsisten
        user._id = user._id || `user_${user.username}`;
        try {
            const exist = await db.get(user._id);
            user._rev = exist._rev;
        } catch(e) {}
        
        const response = await db.put(user);
        res.json(response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/users", async (req, res) => {
    try {
        const result = await db.find({ selector: { type: 'user' } });
        // Fallback
        if(!result.docs) {
             const all = await db.allDocs({include_docs: true});
             return res.json(all.rows.map(r=>r.doc).filter(d=>d.type==='user'));
        }
        res.json(result.docs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SPA Fallback
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));