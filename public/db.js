// ========================================================
// db.js — Local Database Handler for K3 Inspection App
// FINAL & FIXED VERSION — Compatible with router.js & main.js
// ========================================================

// Nama database lokal PouchDB
const DB_NAME = 'inspeksi_k3';
const db = new PouchDB(DB_NAME);

// URL API untuk sinkronisasi dengan server (Express / Railway)
const API_URL = '/api/inspeksi';
const API_USER_URL = '/api/users';

// ========================================================
//  INDEX CREATION (SAFE MODE)
// ========================================================
db.createIndex({ index: { fields: ['type', 'created_at'] } })
    .catch(err => console.warn("⚠️ Index created_at gagal:", err.message));

db.createIndex({ index: { fields: ['type', 'deleted'] } })
    .catch(err => console.warn("⚠️ Index deleted gagal:", err.message));


// ========================================================
//  SAVE INSPECTION (CREATE OR UPDATE)
// ========================================================
async function saveInspection(doc, attachments = []) {
    try {
        // Jika dokumen baru
        if (!doc._id) {
            doc._id = 'ins_' + Date.now();
            doc.created_at = new Date().toISOString();
        }

        doc.type = 'inspection';
        doc.synced = false;
        doc.deleted = doc.deleted || false;

        // Simpan dokumen
        let res = await db.put(doc);

        // Simpan lampiran (foto)
        for (let i = 0; i < attachments.length; i++) {
            const att = attachments[i];

            await db.putAttachment(
                doc._id,
                `photo_${i}`,
                res.rev,
                att.blob,
                att.type
            ).catch(async (e) => {
                // Jika gagal (karena rev berubah), ambil rev terbaru
                const latest = await db.get(doc._id);
                res = await db.putAttachment(
                    doc._id,
                    `photo_${i}`,
                    latest._rev,
                    att.blob,
                    att.type
                );
            });
        }

        return res;
    } catch (err) {
        console.error("❌ saveInspection error:", err);
        throw err;
    }
}


// ========================================================
//  GET INSPECTION DETAIL
// ========================================================
async function getInspection(id) {
    try {
        return await db.get(id, { attachments: true });
    } catch (err) {
        console.error("❌ getInspection error:", err);
        throw err;
    }
}


// ========================================================
//  LIST ALL INSPECTIONS
// ========================================================
async function listInspections(limit = 200) {
    try {
        // Try using pouchdb-find
        const found = await db.find({
            selector: { type: 'inspection', deleted: false },
            sort: [{ created_at: 'desc' }],
            limit
        });
        return found.docs;

    } catch (err) {
        console.warn("⚠️ listInspections fallback (find gagal):", err.message);

        // Fallback manual — allDocs
        const all = await db.allDocs({ include_docs: true });
        return all.rows
            .map(r => r.doc)
            .filter(d => d && d.type === 'inspection' && !d.deleted)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, limit);
    }
}


// ========================================================
//  SOFT DELETE INSPECTION
// ========================================================
async function softDeleteInspection(id) {
    try {
        const doc = await db.get(id);
        doc.deleted = true;
        doc.synced = false;
        return await db.put(doc);
    } catch (err) {
        console.error("❌ softDeleteInspection error:", err);
        throw err;
    }
}


// ========================================================
//  USER MANAGEMENT
// ========================================================

// CREATE / UPDATE USER
async function saveUser(userDoc) {
    try {
        if (!userDoc._id) {
            userDoc._id = 'user_' + userDoc.username;
            userDoc.created_at = new Date().toISOString();
        }

        userDoc.type = 'user';
        userDoc.synced = false;
        userDoc.deleted = userDoc.deleted || false;

        const existing = await db.get(userDoc._id).catch(() => null);
        if (existing) userDoc._rev = existing._rev;

        return await db.put(userDoc);

    } catch (err) {
        console.error("❌ saveUser error:", err);
        throw err;
    }
}

// LIST USERS
async function listUsers() {
    try {
        const found = await db.find({
            selector: { type: 'user', deleted: false },
            sort: [{ name: 'asc' }]
        });
        return found.docs;

    } catch (err) {
        console.warn("⚠️ listUsers fallback:", err.message);

        const all = await db.allDocs({ include_docs: true });
        return all.rows
            .map(r => r.doc)
            .filter(d => d && d.type === 'user' && !d.deleted);
    }
}


// ========================================================
//  EXPORT — INI PENTING (FIX UTAMA)
// ========================================================
//
// Semua fungsi database disatukan dalam `_k3db`.
// Inilah alasan error “saveInspection undefined” muncul sebelumnya —
// kamu memanggil `db.saveInspection`, padahal seharusnya `_k3db.saveInspection`.
//
window._k3db = {
    db,                      // PouchDB instance
    API_URL,
    API_USER_URL,

    // Inspeksi
    saveInspection,
    getInspection,
    listInspections,
    softDeleteInspection,

    // User mgmt
    saveUser,
    listUsers
};
