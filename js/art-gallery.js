/**
 * Hero Academy — Art Gallery persistence (IndexedDB-backed).
 *
 * One shared store for both Sketch Lab and Animation Studio. Lives on the
 * device — no server round-trips. Designed to survive PWA reloads.
 *
 * Schema:
 *   DB:      hero_academy_art  (v1)
 *   Store:   creations
 *     keyPath: id  (string: timestamp + random suffix)
 *     index:   createdAt  (number, ms epoch)
 *
 * Record shape:
 *   {
 *     id:           "1717650000000-7x3",
 *     type:         "sketch" | "animation",
 *     title:        "Nigel's drawing"        // optional, user can rename
 *     thumbDataUrl: "data:image/png;base64,..."   // 128×128 thumbnail
 *     fullDataUrl:  "data:image/png;base64,..."   // sketch: full-res PNG. animations: first frame
 *     frames:       ["data:image/png;base64,...", ...]   // animation only
 *     fps:          6                              // animation only
 *     createdAt:    1717650000000,
 *   }
 *
 * API (all Promise-returning):
 *   ArtGallery.save(creation)        -> id
 *   ArtGallery.list({limit, type})   -> Array<record>     (newest first)
 *   ArtGallery.get(id)               -> record | null
 *   ArtGallery.delete(id)            -> void
 *   ArtGallery.count()               -> number
 *   ArtGallery.makeThumb(canvas, 128) -> dataUrl  (sync helper)
 */
(function(global){
  'use strict';

  var DB_NAME = 'hero_academy_art';
  var DB_VERSION = 1;
  var STORE = 'creations';

  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function(resolve, reject){
      if (!global.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(e){
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('byCreatedAt', 'createdAt', { unique: false });
          store.createIndex('byType', 'type', { unique: false });
        }
      };
      req.onsuccess = function(e){ resolve(e.target.result); };
      req.onerror = function(e){ reject(e.target.error || new Error('DB open failed')); };
    });
    return dbPromise;
  }

  function genId() {
    return Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  }

  function tx(mode) {
    return openDb().then(function(db){
      return db.transaction(STORE, mode).objectStore(STORE);
    });
  }

  // ----- Public API -----

  function save(creation) {
    if (!creation || typeof creation !== 'object') return Promise.reject(new Error('invalid creation'));
    if (!creation.id) creation.id = genId();
    if (!creation.createdAt) creation.createdAt = Date.now();
    if (!creation.type) creation.type = 'sketch';
    return tx('readwrite').then(function(store){
      return new Promise(function(resolve, reject){
        var req = store.put(creation);
        req.onsuccess = function(){ resolve(creation.id); };
        req.onerror = function(e){ reject(e.target.error); };
      });
    });
  }

  function list(opts) {
    opts = opts || {};
    var limit = opts.limit || 100;
    var type = opts.type || null;
    return tx('readonly').then(function(store){
      return new Promise(function(resolve, reject){
        var idx = store.index('byCreatedAt');
        // Open cursor in reverse (newest first)
        var req = idx.openCursor(null, 'prev');
        var out = [];
        req.onsuccess = function(e){
          var cursor = e.target.result;
          if (!cursor || out.length >= limit) { resolve(out); return; }
          if (!type || cursor.value.type === type) out.push(cursor.value);
          cursor.continue();
        };
        req.onerror = function(e){ reject(e.target.error); };
      });
    });
  }

  function get(id) {
    return tx('readonly').then(function(store){
      return new Promise(function(resolve, reject){
        var req = store.get(id);
        req.onsuccess = function(){ resolve(req.result || null); };
        req.onerror = function(e){ reject(e.target.error); };
      });
    });
  }

  function del(id) {
    return tx('readwrite').then(function(store){
      return new Promise(function(resolve, reject){
        var req = store.delete(id);
        req.onsuccess = function(){ resolve(); };
        req.onerror = function(e){ reject(e.target.error); };
      });
    });
  }

  function count() {
    return tx('readonly').then(function(store){
      return new Promise(function(resolve, reject){
        var req = store.count();
        req.onsuccess = function(){ resolve(req.result); };
        req.onerror = function(e){ reject(e.target.error); };
      });
    });
  }

  // Sync helper: render canvas to a small thumbnail dataUrl.
  function makeThumb(srcCanvas, size) {
    size = size || 128;
    var out = document.createElement('canvas');
    out.width = size; out.height = size;
    var ctx = out.getContext('2d');
    // White-pad behind so transparent canvases don't render black on dark UIs
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    // Fit while preserving aspect
    var sw = srcCanvas.width, sh = srcCanvas.height;
    var scale = Math.min(size / sw, size / sh);
    var dw = sw * scale, dh = sh * scale;
    var dx = (size - dw) / 2, dy = (size - dh) / 2;
    ctx.drawImage(srcCanvas, 0, 0, sw, sh, dx, dy, dw, dh);
    return out.toDataURL('image/png');
  }

  global.HeroAcademy = global.HeroAcademy || {};
  global.HeroAcademy.ArtGallery = {
    save: save,
    list: list,
    get: get,
    delete: del,
    count: count,
    makeThumb: makeThumb,
  };
})(typeof window !== 'undefined' ? window : globalThis);
