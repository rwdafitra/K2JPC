// db.js - initialize local PouchDB and export helpers (VERSI AMAN FINAL)
const DB_NAME = 'inspeksi_k3'; // Nama DB Lokal disesuaikan
const db = new PouchDB(DB_NAME);

// API URL untuk PUSH/PULL data melalui server Express
const API_URL = '/api/inspeksi'; 

// FUNGSI configureRemote dan startLiveSync DIHAPUS

/**
 * Save inspection document (with optional attachments)
 * @param {object} doc - inspection doc
 * @param {array} attachments - [{type: 'image/jpeg', blob: Blob}]
 */
async function saveInspection(doc, attachments = []) {
  // Jika dokumen baru, tambahkan _id dan created_at
  if (!doc._id) {
    doc._id = 'ins_' + Date.now();
    doc.created_at = new Date().toISOString();
  }
  doc.type = 'inspection';
  doc.synced = false; // <<< PENTING: Dokumen baru ditandai belum sync

  try {
    const res = await db.put(doc);
    
    // add attachments (logic for attachments remains here)
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      // Perlu mendapatkan rev terbaru jika ada konflik putAttachment
      await db.putAttachment(doc._id, `photo_${i}`, res.rev, att.type, att.blob).catch(async (e) => {
        const latest = await db.get(doc._id);
        await db.putAttachment(doc._id, `photo_${i}`, latest._rev, att.type, att.blob);
      });
    }
    return res;
  } catch (e) {
    throw e;
  }
}

/**
 * List inspection documents (menggunakan pouchdb-find)
 * @param {number} limit - number of docs
 */
async function listInspections(limit = 100) {
  try {
    const found = await db.find({ selector: { type: 'inspection' }, sort: [{ created_at: 'desc' }], limit });
    return found.docs;
  } catch (e) {
    // fallback jika index belum siap
    const all = await db.allDocs({ include_docs: true, descending: true });
    return all.rows.map(r => r.doc).filter(d => d.type === 'inspection').slice(0, limit);
  }
}

// Export fungsi dan variabel yang dibutuhkan
window._k3db = {
  db,
  saveInspection,
  listInspections,
  API_URL
};