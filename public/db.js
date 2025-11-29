// public/db.js — FINAL FIXED & OPTIMIZED

const DB_NAME = 'minerba_k3_pro'; 
const REMOTE_API = '/api'; 

// Init PouchDB
let db;
try {
    db = new PouchDB(DB_NAME);
    console.log(`✅ Database ${DB_NAME} Initialized`);
} catch(e) {
    console.error("❌ PouchDB Failed:", e);
}

// REGISTER INDEXES
// Kita pastikan index dibuat untuk 'type' + 'created_at' agar sorting berjalan mulus
if (db && typeof db.createIndex === 'function') {
    db.createIndex({
        index: { fields: ['type', 'created_at'] }
    }).then(() => console.log("✅ Index 'created_at' siap digunakan."))
      .catch(err => console.warn("⚠️ Index warning:", err.message));
}

const _k3db = {
    db: db,

    // --- INSPECTIONS ---
    async saveInspection(doc, attachments = []) {
        if(!db) throw new Error("Database belum siap");
        
        if (!doc._id) {
            doc._id = `insp_${Date.now()}_${Math.floor(Math.random()*1000)}`;
            doc.created_at = new Date().toISOString();
        }
        doc.type = 'inspection';
        doc.synced = false;
        doc.deleted = false;

        try {
            const existing = await db.get(doc._id);
            doc._rev = existing._rev;
        } catch(e) {}

        let res = await db.put(doc);

        // Attachments
        if (attachments.length > 0) {
            const latest = await db.get(doc._id);
            let rev = latest._rev;
            for (let i = 0; i < attachments.length; i++) {
                const att = attachments[i];
                const attRes = await db.putAttachment(
                    doc._id, `foto_${i+1}.jpg`, rev, att.blob, att.type
                );
                rev = attRes.rev;
            }
            res = { ...res, rev: rev };
        }
        return res;
    },

    async getInspection(id) {
        return await db.get(id, { attachments: true, binary: true });
    },

    async listInspections(limit = 1000) {
        // COBA QUERY DENGAN INDEX
        if (db.find) {
            try {
                const res = await db.find({
                    selector: { 
                        type: 'inspection',
                        // FIX: Field sort WAJIB ada di selector agar index dipakai
                        created_at: { $gt: null }, 
                        deleted: { $ne: true } 
                    },
                    sort: [{ created_at: 'desc' }],
                    limit
                });
                return res.docs;
            } catch(e) {
                console.warn("⚠️ Query Index gagal, menggunakan fallback (AllDocs).", e.message);
            }
        }
        
        // FALLBACK MANUAL (Jika index bermasalah/belum siap)
        const all = await db.allDocs({include_docs: true, descending: true});
        return all.rows
            .map(r => r.doc)
            .filter(d => d.type === 'inspection' && !d.deleted) // Filter manual
            .slice(0, limit);
    },

    async softDelete(id) {
        const doc = await db.get(id);
        doc.deleted = true;
        doc.synced = false;
        return await db.put(doc);
    },

    // --- USERS ---
    async saveUser(user) {
        if(!db) throw new Error("DB not ready");
        user._id = user._id || `user_${user.username}`;
        user.type = 'user';
        user.synced = false;
        user.deleted = false;
        try {
            const existing = await db.get(user._id);
            user._rev = existing._rev;
        } catch(e) {}
        return await db.put(user);
    },

    async listUsers() {
        if (db.find) {
            try {
                const res = await db.find({ selector: { type: 'user', deleted: { $ne: true } } });
                return res.docs;
            } catch(e) {}
        }
        // Fallback
        const all = await db.allDocs({include_docs: true});
        return all.rows.map(r => r.doc).filter(d => d.type === 'user' && !d.deleted);
    },
    
    async deleteUser(id) {
        const doc = await db.get(id);
        doc.deleted = true; 
        return await db.put(doc);
    },

    // --- SYNC ---
    async sync() {
        if(!navigator.onLine) throw new Error("Offline. Cek koneksi internet.");
        let stats = { pushed: 0, pulled: 0 };

        // 1. PUSH (Local -> Server)
        // Gunakan fallback filter manual agar sync tidak macet karena index
        const allDocs = await db.allDocs({include_docs: true});
        const toPush = allDocs.rows
            .map(r => r.doc)
            .filter(d => d.synced === false && !d.deleted); // Hanya yg belum sync

        for(const doc of toPush) {
            const payload = {...doc};
            delete payload._rev; 
            delete payload._attachments;
            
            const endpoint = (doc.type === 'user') ? `${REMOTE_API}/users` : `${REMOTE_API}/inspeksi/${doc._id}`;
            const res = await fetch(endpoint, {
                method: 'PUT', headers: {'Content-Type':'application/json'},
                body: JSON.stringify(payload)
            });
            
            if(res.ok) {
                doc.synced = true;
                await db.put(doc);
                stats.pushed++;
            }
        }

        // 2. PULL (Server -> Local)
        const pullData = async (url) => {
            try {
                const res = await fetch(url);
                if(res.ok) {
                    const data = await res.json();
                    for(let d of data) {
                        if(d.deleted) continue;
                        try {
                            const local = await db.get(d._id);
                            d._rev = local._rev;
                            d.synced = true;
                            await db.put(d);
                        } catch(e) { d.synced = true; await db.put(d); }
                        stats.pulled++;
                    }
                }
            } catch(e) { console.warn("Pull fail:", url, e); }
        };

        await pullData(`${REMOTE_API}/users`);
        await pullData(`${REMOTE_API}/inspeksi`);

        return stats;
    }
};

window._k3db = _k3db;