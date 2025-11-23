// db.js - initialize local PouchDB and export helpers
const DB_NAME = 'k3_inspeksi';

const db = new PouchDB(DB_NAME);

let remoteDB = null;

/**
 * Configure remote CouchDB for live sync
 * @param {string} url - CouchDB URL (without credentials)
 * @param {string} user - admin username
 * @param {string} pass - admin password
 * @returns remoteDB instance
 */
function configureRemote(url, user, pass) {
  if (!url) return null;
  const safeUrl = url.includes('@') ? url : url.replace(
    'https://',
    'https://' + (user ? user + ':' + pass + '@' : '')
  );
  remoteDB = new PouchDB(safeUrl, { skip_setup: false });
  startLiveSync();
  return remoteDB;
}

/**
 * Start live sync between local and remote
 */
function startLiveSync() {
  if (!remoteDB) return;
  db.sync(remoteDB, { live: true, retry: true })
    .on('change', info => console.log('SYNC → change', info))
    .on('paused', err => console.log('SYNC → paused', err || 'idle/offline'))
    .on('active', () => console.log('SYNC → active/resumed'))
    .on('denied', err => console.warn('SYNC → denied', err))
    .on('complete', info => console.log('SYNC → complete', info))
    .on('error', err => console.error('SYNC → ERROR', err));
}

/**
 * Save inspection document (with optional attachments)
 * @param {object} doc - inspection doc
 * @param {array} attachments - [{type: 'image/jpeg', blob: Blob}]
 */
async function saveInspection(doc, attachments = []) {
  if (!doc._id) doc._id = 'ins_' + Date.now();
  try {
    const res = await db.put(doc);

    // add attachments if any
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
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
    const found = await db.find({ selector: { type: 'inspection' }, sort: [{ created_at: 'desc' }], limit });
    return found.docs;
  } catch (e) {
    // fallback
    const all = await db.allDocs({ include_docs: true, descending: true, limit });
    return all.rows.map(r => r.doc).filter(d => d.type === 'inspection');
  }
}

// Initialize remote CouchDB with Railway instance
window._k3db = { db, configureRemote, startLiveSync, saveInspection, listInspections };
window._k3db.configureRemote(
  'https://database-production-7625.up.railway.app/inspeksi_k3',
  'admin',
  'CmMa0O66hFLm'
);
