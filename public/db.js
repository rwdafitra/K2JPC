// db.js - initialize local PouchDB and export helpers
const DB_NAME = 'k3_inspeksi';
const db = new PouchDB(DB_NAME);

/**
 * Save inspection document (with optional attachments)
 * @param {object} doc - inspection doc (tanpa _id, _rev dari form)
 * @param {array} attachments - [{type: 'image/jpeg', blob: Blob}]
 */
async function saveInspection(doc, attachments = []) {
  // Tambahkan _id & metadata jika belum ada (hanya dokumen baru)
  if (!doc._id) {
    doc._id = 'ins_' + Date.now();
    doc.created_at = new Date().toISOString();
  }

  // >>> Tambahkan flag sinkronisasi baru. Ini PENTING. <<<
  doc.type = 'inspection';
  doc.synced = false; // Flag ini menandakan dokumen ini perlu diunggah ke server

  try {
    const res = await db.put(doc);

    // add attachments if any
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      // Jika ada konflik _rev, ambil _rev terbaru sebelum putAttachment
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
 * List inspection documents
 * @param {number} limit - number of docs
 */
async function listInspections(limit = 100) {
  try {
    // Pastikan index 'type' sudah ada (dibangun di main.js)
    const found = await db.find({ selector: { type: 'inspection' }, sort: [{ created_at: 'desc' }], limit });
    return found.docs;
  } catch (e) {
    // fallback
    const all = await db.allDocs({ include_docs: true, descending: true });
    return all.rows.map(r => r.doc).filter(d => d.type === 'inspection');
  }
}

// Export objek global baru (tidak lagi ada remoteDB atau sync)
window._k3db = { 
  db, 
  saveInspection, 
  listInspections,
  API_URL: '/api/inspeksi' // Endpoint API ke Express Server
};
