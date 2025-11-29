// public/db.js — Final Fixed

// Nama Database Lokal
const DB_NAME = 'minerba_k3_final'; 
const REMOTE_API = '/api'; 

// Init PouchDB
let db;
try {
    db = new PouchDB(DB_NAME);
    console.log(`✅ Database ${DB_NAME} Initialized`);
} catch(e) {
    console.error("❌ PouchDB Failed:", e);
    alert("Database Error: Gagal memuat penyimpanan lokal.");
}

// REGISTER INDEXES (SAFE MODE)
// Kita bungkus dalam try-catch & cek fungsi untuk mencegah crash "is not a function"
if (db) {
    if (typeof db.createIndex === 'function') {
        db.createIndex({ index: { fields: ['type', 'created_at'] } })
          .then(() => console.log("✅ Index 'created_at' created"))
          .catch(err => console.warn("⚠️ Index creation warning:", err.message));
          
        db.createIndex({ index: { fields: ['type', 'deleted'] } }).catch(console.warn);
    } else {
        console.error("❌ PLUGIN ERROR: PouchDB-Find belum dimuat. Fitur pencarian akan menggunakan mode lambat (fallback).");
    }
}

const _k3db = {
    db: db,

    // --- INSPECTIONS ---
    async saveInspection(doc, attachments = []) {
        if(!db) throw new Error("DB not ready");
        
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
        // Fallback Mechanism jika plugin find gagal
        if (db.find) {
            try {
                const res = await db.find({
                    selector: { type: 'inspection', deleted: { $ne: true } },
                    sort: [{ created_at: 'desc' }],
                    limit
                });
                return res.docs;
            } catch(e) {
                console.warn("Query find gagal, switch ke fallback:", e.message);
            }
        }
        
        // Manual Filtering (Fallback)
        const all = await db.allDocs({include_docs: true, descending: true});
        return all.rows
            .map(r => r.doc)
            .filter(d => d.type === 'inspection' && !d.deleted)
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

        // 1. PUSH
        // Gunakan fallback manual filter jika find gagal, agar sync tetap jalan
        let toPushDocs = [];
        if(db.find) {
            const q = await db.find({ selector: { synced: false } });
            toPushDocs = q.docs;
        } else {
            const all = await db.allDocs({include_docs: true});
            toPushDocs = all.rows.map(r=>r.doc).filter(d => d.synced === false);
        }

        for(const doc of toPushDocs) {
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

        // 2. PULL
        // Pull Users
        try {
            const rUsers = await fetch(`${REMOTE_API}/users`);
            if(rUsers.ok) {
                const users = await rUsers.json();
                for(let u of users) {
                    if(u.deleted) continue;
                    try {
                        const local = await db.get(u._id);
                        u._rev = local._rev;
                        u.synced = true;
                        await db.put(u);
                    } catch(e) { u.synced = true; await db.put(u); }
                }
            }
        } catch(e) { console.warn("Pull Users fail", e); }

        // Pull Inspections
        try {
            const rInsp = await fetch(`${REMOTE_API}/inspeksi`);
            if(rInsp.ok) {
                const insps = await rInsp.json();
                for(let i of insps) {
                    if(i.deleted) continue;
                    try {
                        const local = await db.get(i._id);
                        i._rev = local._rev;
                        i.synced = true;
                        await db.put(i);
                    } catch(e) { i.synced = true; await db.put(i); }
                    stats.pulled++;
                }
            }
        } catch(e) { console.warn("Pull Insp fail", e); }

        return stats;
    }
};

window._k3db = _k3db;