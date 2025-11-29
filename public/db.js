// public/db.js — STABLE VERSION (Fix Sort Error)

const DB_NAME = 'minerba_k3_stable_v1'; 
const REMOTE_API = '/api'; 

// Init PouchDB
let db;
try {
    db = new PouchDB(DB_NAME);
    console.log(`✅ Database ${DB_NAME} Initialized`);
} catch(e) {
    console.error("❌ PouchDB Failed:", e);
}

// 1. REGISTER INDEX KHUSUS SORTING
// Kita buat index spesifik untuk 'created_at' agar sorting dijamin jalan
if (db && typeof db.createIndex === 'function') {
    db.createIndex({
        index: { 
            fields: ['created_at'], // Index tunggal, paling aman untuk sorting
            name: 'idx_date',
            ddoc: 'idx_date'
        }
    }).then(() => console.log("✅ Index 'created_at' siap."))
      .catch(console.warn);
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

        if (attachments.length > 0) {
            const latest = await db.get(doc._id);
            let rev = latest._rev;
            for (let i = 0; i < attachments.length; i++) {
                const att = attachments[i];
                const attRes = await db.putAttachment(doc._id, `foto_${i+1}.jpg`, rev, att.blob, att.type);
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
        if (!db) return [];

        // STRATEGI BARU: Query + In-Memory Filter
        // PouchDB kadang gagal jika selector terlalu kompleks dengan sort.
        // Kita query berdasarkan 'created_at' (agar urut), lalu filter 'type' & 'deleted' di JS.
        
        if (db.find) {
            try {
                const res = await db.find({
                    selector: { 
                        created_at: { $gt: null } // Wajib ada untuk trigger sort
                    },
                    sort: [{ 'created_at': 'desc' }],
                    use_index: 'idx_date', // Paksa pakai index tanggal
                    limit: limit + 50 // Buffer extra untuk filtering
                });
                
                // Filter di memori (Lebih aman & cepat untuk PouchDB)
                return res.docs
                    .filter(d => d.type === 'inspection' && !d.deleted)
                    .slice(0, limit);

            } catch(e) {
                console.warn("⚠️ Query Index gagal, fallback ke AllDocs:", e.message);
            }
        }
        
        // Fallback Manual
        const all = await db.allDocs({include_docs: true, descending: true});
        return all.rows
            .map(r => r.doc)
            .filter(d => d.type === 'inspection' && !d.deleted)
            .sort((a,b) => new Date(b.created_at) - new Date(a.created_at)) // Pastikan urut manual
            .slice(0, limit);
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
        const all = await db.allDocs({include_docs: true});
        return all.rows.map(r => r.doc).filter(d => d.type === 'user' && !d.deleted);
    },
    
    async deleteUser(id) {
        const doc = await db.get(id);
        doc.deleted = true; 
        return await db.put(doc);
    },
    
    async softDelete(id) {
        const doc = await db.get(id);
        doc.deleted = true;
        doc.synced = false;
        return await db.put(doc);
    },

    // --- SYNC ---
    async sync() {
        if(!navigator.onLine) throw new Error("Offline.");
        let stats = { pushed: 0, pulled: 0 };

        // 1. PUSH
        const allDocs = await db.allDocs({include_docs: true});
        const toPush = allDocs.rows
            .map(r => r.doc)
            .filter(d => d.synced === false && !d.deleted);

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

        // 2. PULL
        const pull = async (url) => {
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
            } catch(e) { console.warn("Pull error", url); }
        };
        await pull(`${REMOTE_API}/users`);
        await pull(`${REMOTE_API}/inspeksi`);
        return stats;
    }
};

window._k3db = _k3db;