/*
  Cobertura ECT 2026 - receptor de fotos/videos para Google Drive
  Desplegar como Web App: Ejecutar como YO / Acceso: Cualquiera (Anyone)
*/

const FIREBASE_API_KEY = 'AIzaSyA3o-PRuAvt8jkjEvLuKlpxd8ciyEdiMIw';
const FIREBASE_PROJECT_ID = 'cobertura-ect';
const ROOT_FOLDER_NAME = 'ECT COBERTURA 2026';
const TIME_ZONE = 'America/Asuncion';
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const STAFF_NAMES = [
  'Sergio Quiroga','Laura Ruiz Diaz','Jhonatan Ferri','Araceli Chavez','Marcos Ibarra',
  'Nicole Fariña','Nara Ruiz','Luz Rodriguez','Carlos Gonzalez','Deisy Villalba','Matias Barrios'
];

function doGet() {
  return HtmlService.createHtmlOutput('<h3>Cobertura ECT 2026</h3><p>Receptor de archivos activo.</p>')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


function doPost(e) {
  const requestId = (e && e.parameter && e.parameter.requestId) || '';
  try {
    const raw = (e && e.parameter && e.parameter.payload) || '';
    if (!raw) throw new Error('Solicitud vacía.');
    const p = JSON.parse(raw);
    if (!p.idToken) throw new Error('Falta autenticación.');
    if (!p.dataBase64) throw new Error('Falta el archivo.');
    if (!/^image\//.test(p.mimeType || '') && !/^video\//.test(p.mimeType || '')) {
      throw new Error('Solo se permiten fotos y videos.');
    }

    const authUser = lookupFirebaseUser_(p.idToken);
    const profile = getFirestoreProfile_(authUser.localId, p.idToken);
    if (!profile || profile.active !== true || profile.is_staff !== true || !profile.staff_id) {
      throw new Error('La cuenta no pertenece al Staff activo.');
    }
    if (profile.email && authUser.email && String(profile.email).toLowerCase() !== String(authUser.email).toLowerCase()) {
      throw new Error('El correo del perfil no coincide con Firebase.');
    }

    const bytes = Utilities.base64Decode(p.dataBase64);
    if (bytes.length > MAX_FILE_BYTES) throw new Error('El archivo supera el límite de 15 MB.');

    const now = new Date();
    const dateStr = Utilities.formatDate(now, TIME_ZONE, 'yyyy-MM-dd');
    const timeStr = Utilities.formatDate(now, TIME_ZONE, 'HH-mm-ss');
    const dayFolderName = dayFolderLabel_(dateStr);
    const staffName = profile.name || authUser.email || profile.staff_id;

    const root = getOrCreateChild_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    const dayFolder = getOrCreateChild_(root, dayFolderName);
    // Crea las carpetas del Staff para ese día de una sola vez.
    STAFF_NAMES.forEach(function(name){ getOrCreateChild_(dayFolder, name); });
    const staffFolder = getOrCreateChild_(dayFolder, staffName);

    const original = safeFileName_(p.originalName || (String(p.mimeType).startsWith('video/') ? 'video.webm' : 'foto.jpg'));
    const isVideo = String(p.mimeType || '').startsWith('video/');
    const prefix = isVideo ? 'VID' : 'IMG';
    const extension = fileExtension_(original, p.mimeType || '');
    const courseSlug = courseSlug_(p.courseTitle || 'Sin-curso');

    // Numeración automática por carpeta de Staff/día.
    // LockService evita que dos cargas simultáneas reciban el mismo número.
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    let seq;
    try {
      seq = nextMediaNumber_(staffFolder);
    } finally {
      lock.releaseLock();
    }

    const finalName = prefix + '_' + String(seq).padStart(4, '0') + '-' + courseSlug + extension;
    const blob = Utilities.newBlob(bytes, p.mimeType || 'application/octet-stream', finalName);
    const file = staffFolder.createFile(blob);
    if (p.courseTitle) file.setDescription('Curso: ' + p.courseTitle + (p.courseId ? ' | ID: ' + p.courseId : ''));

    return reply_({
      source: 'ECT_APPS_SCRIPT_UPLOAD', requestId: requestId || p.requestId || '', ok: true,
      fileId: file.getId(), fileName: file.getName(), fileUrl: file.getUrl(),
      folderPath: ROOT_FOLDER_NAME + ' / ' + dayFolderName + ' / ' + staffName
    });
  } catch (err) {
    return reply_({
      source: 'ECT_APPS_SCRIPT_UPLOAD', requestId: requestId, ok: false,
      error: err && err.message ? err.message : String(err)
    });
  }
}

function lookupFirebaseUser_(idToken) {
  const url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(FIREBASE_API_KEY);
  const res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({idToken: idToken}),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Sesión de Firebase inválida o vencida.');
  const data = JSON.parse(res.getContentText() || '{}');
  if (!data.users || !data.users.length) throw new Error('Usuario de Firebase no encontrado.');
  return data.users[0];
}

function getFirestoreProfile_(uid, idToken) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID +
    '/databases/(default)/documents/users/' + encodeURIComponent(uid);
  const res = UrlFetchApp.fetch(url, {
    method: 'get', headers: {Authorization: 'Bearer ' + idToken}, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('No se pudo validar el perfil del Staff.');
  const doc = JSON.parse(res.getContentText() || '{}');
  return firestoreFields_(doc.fields || {});
}

function firestoreFields_(fields) {
  const out = {};
  Object.keys(fields).forEach(function(k){ out[k] = firestoreValue_(fields[k]); });
  return out;
}
function firestoreValue_(v) {
  if (!v) return null;
  if (Object.prototype.hasOwnProperty.call(v, 'stringValue')) return v.stringValue;
  if (Object.prototype.hasOwnProperty.call(v, 'booleanValue')) return v.booleanValue;
  if (Object.prototype.hasOwnProperty.call(v, 'integerValue')) return Number(v.integerValue);
  if (Object.prototype.hasOwnProperty.call(v, 'doubleValue')) return Number(v.doubleValue);
  if (Object.prototype.hasOwnProperty.call(v, 'nullValue')) return null;
  return null;
}

function getOrCreateChild_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function dayFolderLabel_(dateStr) {
  const parts = String(dateStr).split('-').map(Number);
  const y = parts[0], m = parts[1], d = parts[2];
  const names = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return names[dow] + ' ' + String(d).padStart(2,'0') + '-' + String(m).padStart(2,'0') + '-' + y;
}


function nextMediaNumber_(folder) {
  let max = 0;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const name = files.next().getName();
    const m = /^(?:IMG|VID)_(\d{4})-/i.exec(name);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return max + 1;
}

function courseSlug_(name) {
  let s = String(name || 'Sin-curso');
  try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
  return s
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'Sin-curso';
}

function fileExtension_(originalName, mimeType) {
  const m = /\.([A-Za-z0-9]{2,6})$/.exec(String(originalName || ''));
  if (m) return '.' + m[1].toLowerCase();
  const t = String(mimeType || '').toLowerCase();
  if (t.includes('jpeg')) return '.jpg';
  if (t.includes('png')) return '.png';
  if (t.includes('webp')) return '.webp';
  if (t.includes('heic')) return '.heic';
  if (t.includes('heif')) return '.heif';
  if (t.includes('mp4')) return '.mp4';
  if (t.includes('quicktime')) return '.mov';
  if (t.includes('webm')) return '.webm';
  return '';
}

function safeFileName_(name) {
  return String(name || 'archivo')
    .replace(/[\\/:*?"<>|#%{}~]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 140) || 'archivo';
}

function reply_(obj) {
  const json = JSON.stringify(obj).replace(/</g, '\\u003c');
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta charset="utf-8"><script>' +
    'try{window.parent.postMessage(' + json + ', "*");}catch(e){}' +
    'try{window.top.postMessage(' + json + ', "*");}catch(e){}' +
    '</script><p>Listo.</p>'
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
