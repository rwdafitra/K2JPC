// db.js - initialize local PouchDB and export helpers (VERSI FINAL TERLENGKAP DAN ROBUST)
const DB_NAME = 'inspeksi_k3'; 
const db = new PouchDB(DB_NAME);

// API URL untuk PUSH/PULL data melalui server Express
const API_URL = '/api/inspeksi'; 
const API_USER_URL = '/api/users'; 

// Inisialisasi DB (Pastikan index ada untuk pencarian cepat)
// FIX: Membungkus createIndex dengan catch agar script tidak crash jika plugin pouchdb-find gagal dimuat
db.createIndex({ index: { fields: ['type', 'created_at'] } })
    .catch(err => console.warn("PouchDB Index (created_at) failed to create. Pastikan PouchDB Find dimuat di index.html.", err.message));
db.createIndex({ index: { fields: ['type', 'deleted'] } })
    .catch(err => console.warn("PouchDB Index (deleted) failed to create.", err.message));


/**
 * Save inspection document (with optional attachments)
 */
async function saveInspection(doc, attachments = []) {
  if (!doc._id) {
    doc._id = 'ins_' + Date.now();
    doc.created_at = new Date().toISOString();
  }
  doc.type = 'inspection';
  doc.synced = false; 
  doc.deleted = doc.deleted || false; 

  try {
    let res = await db.put(doc);
    
    // Simpan attachments
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      await db.putAttachment(doc._id, `photo_${i}`, res.rev, att.type, att.blob).catch(async (e) => {
        // Coba dapatkan rev terbaru jika putAttachment gagal
        const latest = await db.get(doc._id);
        res = await db.putAttachment(doc._id, `photo_${i}`, latest._rev, att.type, att.blob);
      });
    }
    return res;
  } catch (e) {
    throw e;
  }
}

/**
 * Get single inspection document by ID
 */
async function getInspection(id) {
    return db.get(id, { attachments: true });
}

/**
 * List inspection documents (menggunakan pouchdb-find dan filter soft-delete)
 */
async function listInspections(limit = 100) {
  try {
    const found = await db.find({ 
        selector: { type: 'inspection', deleted: false }, 
        sort: [{ created_at: 'desc' }], 
        limit 
    });
    return found.docs;
  } catch (e) {
    console.warn("listInspections failed with find(), falling back to allDocs.", e.message);
    // Fallback jika index gagal atau find tidak tersedia
    const all = await db.allDocs({ include_docs: true, descending: true });
    return all.rows
        .map(r => r.doc)
        .filter(d => d && d.type === 'inspection' && !d.deleted)
        .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, limit);
  }
}

/**
 * Soft delete inspection (tandai sebagai deleted: true)
 */
async function softDeleteInspection(id) {
    const doc = await db.get(id);
    doc.deleted = true;
    doc.synced = false;
    return db.put(doc);
}


// --- USER MANAGEMENT ---

/**
 * Save or update user document
 */
async function saveUser(userDoc) {
    if (!userDoc._id) {
        userDoc._id = 'user_' + userDoc.username;
        userDoc.created_at = new Date().toISOString();
    }
    userDoc.type = 'user';
    userDoc.synced = false; 
    userDoc.deleted = userDoc.deleted || false;
    
    try {
        const existing = await db.get(userDoc._id).catch(() => null);
        if (existing) userDoc._rev = existing._rev;
        
        const res = await db.put(userDoc);
        return res;
    } catch (e) {
        throw e;
    }
}

/**
 * List all active users
 */
async function listUsers() {
    try {
        const found = await db.find({ 
            selector: { type: 'user', deleted: false }, 
            sort: [{ name: 'asc' }]
        });
        return found.docs;
    } catch (e) {
        console.warn("listUsers failed with find(), falling back to allDocs.", e.message);
        const all = await db.allDocs({ include_docs: true });
        return all.rows.map(r => r.doc).filter(d => d && d.type === 'user' && !d.deleted);
    }
}

// Export semua fungsi yang diperlukan ke window
window._k3db = {
  db, API_URL, API_USER_URL,
  saveInspection, getInspection, listInspections, softDeleteInspection,
  saveUser, listUsers
};