// db.js — Robust PouchDB Wrapper

// Nama DB Lokal. Jika di HP, ini tersimpan di browser storage.
const DB_NAME = 'minerba_k3_v2';
const REMOTE_API = '/api'; 

// Init DB
let db;
try {
    db = new PouchDB(DB_NAME);
    console.log("✅ PouchDB Initialized:", DB_NAME);
} catch(e) {
    console.error("❌ PouchDB Init Failed:", e);
    alert("Database lokal gagal dimuat. Coba refresh atau gunakan browser lain (Chrome/Safari).");
}

// Create Index (Async, don't wait)
if(db) {
    db.createIndex({ index: { fields: ['type', 'created_at'] } }).catch(e=>console.warn(e));
    db.createIndex({ index: { fields: ['type', 'deleted'] } }).catch(e=>console.warn(e));
}

const _k3db = {
    db: db,

    // --- INSPECTIONS ---
    async saveInspection(doc, attachments = []) {
        if(!db) throw new Error("Database not ready");
        
        // Generate Unique ID if new
        if (!doc._id) {
            doc._id = `insp_${Date.now()}_${Math.floor(Math.random()*1000)}`;
            doc.created_at = new Date().toISOString();
        }
        
        doc.type = 'inspection';
        doc.synced = false;
        doc.deleted = false;

        // Try update existing rev if exists
        try {
            const existing = await db.get(doc._id);
            doc._rev = existing._rev;
        } catch(e) {} // New doc

        let res = await db.put(doc);

        // Handle Attachments
        if (attachments.length > 0) {
            // Fetch latest rev after put
            const latest = await db.get(doc._id);
            let rev = latest._rev;

            for (let i = 0; i < attachments.length; i++) {
                const att = attachments[i];
                // Put attachment
                const attRes = await db.putAttachment(
                    doc._id, `foto_${i+1}.jpg`, rev, att.blob, att.type
                );
                rev = attRes.rev; // update rev for next attachment
            }
            res = { ...res, rev: rev };
        }
        return res;
    },

    async getInspection(id) {
        return await db.get(id, { attachments: true, binary: true });
    },

    async listInspections(limit = 1000) {
        // Fallback jika find plugin error
        try {
            const res = await db.find({
                selector: { type: 'inspection', deleted: { $ne: true } },
                sort: [{ created_at: 'desc' }],
                limit
            });
            return res.docs;
        } catch(e) {
            // Fallback manual filter
            const all = await db.allDocs({include_docs: true, descending: true});
            return all.rows
                .map(r => r.doc)
                .filter(d => d.type === 'inspection' && !d.deleted)
                .slice(0, limit);
        }
    },

    // --- SYNC ENGINE (Manual Push/Pull via API) ---
    async sync() {
        if(!navigator.onLine) throw new Error("Tidak ada koneksi internet.");
        let stats = { pushed: 0, pulled: 0 };

        // 1. PUSH
        const toPush = await db.find({ selector: { synced: false } });
        for(const doc of toPush.docs) {
            const payload = {...doc};
            delete payload._rev; 
            delete payload._attachments; 
            
            // Kirim ke server
            const endpoint = (doc.type==='user') ? `${REMOTE_API}/users` : `${REMOTE_API}/inspeksi/${doc._id}`;
            const res = await fetch(endpoint, {
                method: 'PUT',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify(payload)
            });
            
            if(res.ok) {
                doc.synced = true;
                await db.put(doc);
                stats.pushed++;
            }
        }

        // 2. PULL (Inspeksi only for demo)
        const resInsp = await fetch(`${REMOTE_API}/inspeksi`);
        if(resInsp.ok) {
            const remoteDocs = await resInsp.json();
            for(let r of remoteDocs) {
                if(r.deleted) continue;
                try {
                    const local = await db.get(r._id);
                    r._rev = local._rev; // Update local
                    r.synced = true;
                    await db.put(r);
                } catch(e) {
                    r.synced = true;
                    await db.put(r); // Insert new
                }
                stats.pulled++;
            }
        }

        return stats;
    }
};

// Expose globally
window._k3db = _k3db;