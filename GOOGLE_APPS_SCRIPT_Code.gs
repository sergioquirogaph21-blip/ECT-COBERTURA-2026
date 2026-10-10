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
  if (Object.prototype.hasOwnProperty.call(v, 'timestampValue')) return v.timestampValue;
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

/* ==========================================================
   ALERTAS AUTOMÁTICAS DE COBERTURA SIN BLAZE
   ----------------------------------------------------------
   - 10 minutos antes: avisa al Staff asignado.
   - Al comenzar el curso sin "Marcar inicio": avisa a TODO
     el resto del Staff que tenga push activado.
   - Funciona con la app cerrada mediante un trigger de
     Google Apps Script cada 1 minuto.
   ========================================================== */

const ECT_ALERT_HANDLER = 'procesarAlertasCoberturaECT';
const ECT_ALERT_WINDOW_AFTER_START_MIN = 15;

/**
 * Ejecutá esta función UNA sola vez desde Apps Script.
 * Crea (o reemplaza) el trigger que revisa las coberturas cada minuto.
 */
function instalarAlertasAutomaticasECT() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === ECT_ALERT_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger(ECT_ALERT_HANDLER)
    .timeBased()
    .everyMinutes(1)
    .create();
  return 'Alertas automáticas instaladas. Se revisarán los cursos cada minuto.';
}

/** Elimina el trigger automático si alguna vez querés pausarlo. */
function desactivarAlertasAutomaticasECT() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === ECT_ALERT_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  return 'Triggers eliminados: ' + removed;
}

/**
 * Prueba rápida: envía un push a todos los dispositivos activos.
 * Útil para verificar la configuración antes del evento.
 */
function probarPushTodosECT() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  const tokenDocs = listFirestoreCollection_('push_tokens');
  const activeTokens = tokenDocs
    .map(function(d){ return {doc:d.name, data:firestoreFields_(d.fields || {})}; })
    .filter(function(x){ return x.data.active !== false && !!x.data.token; });

  const result = sendPushToTokens_(activeTokens, {
    title: 'Prueba Cobertura ECT',
    body: 'Las alertas automáticas están configuradas correctamente.',
    tag: 'ect-test-' + Date.now(),
    url: './'
  });
  return 'Push enviados: ' + result.sent + ' / ' + activeTokens.length;
}

/**
 * Esta función la ejecuta el trigger cada minuto.
 * También podés ejecutarla manualmente para probar la lógica.
 */
function procesarAlertasCoberturaECT() {
  const courseDocs = listFirestoreCollection_('courses');
  const tokenDocs = listFirestoreCollection_('push_tokens');
  const staffDocs = listFirestoreCollection_('staff');

  const tokens = tokenDocs
    .map(function(d){ return {doc:d.name, data:firestoreFields_(d.fields || {})}; })
    .filter(function(x){ return x.data.active !== false && !!x.data.token && !!x.data.staff_id; });

  const staffNames = {};
  staffDocs.forEach(function(d){
    const s = firestoreFields_(d.fields || {});
    const id = firestoreDocId_(d.name);
    if (id) staffNames[id] = s.name || id;
  });

  const nowLocal = Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd'T'HH:mm");
  const nowMinute = localMinuteNumber_(nowLocal);
  let reminders = 0;
  let uncovered = 0;

  courseDocs.forEach(function(doc){
    const c = firestoreFields_(doc.fields || {});
    if (!c.start_at) return;
    const startMinute = localMinuteNumber_(c.start_at);
    if (!isFinite(startMinute)) return;
    const diff = startMinute - nowMinute; // minutos hasta el inicio
    const assigned = c.assigned_staff_id || '';

    // 1) Recordatorio al Staff asignado: alrededor de 10 minutos antes.
    if (assigned && !c.check_start && !c.reminder_10_sent_at && diff <= 10 && diff >= 8) {
      const recipients = tokens.filter(function(t){ return t.data.staff_id === assigned; });
      const r = sendPushToTokens_(recipients, {
        title: 'Tu cobertura empieza en 10 minutos',
        body: (c.title || 'Curso') + ' · ' + (c.location || 'Lugar sin definir'),
        tag: '10m-' + firestoreDocId_(doc.name),
        url: './'
      });
      if (r.sent > 0) {
        setFirestoreTimestampField_(doc.name, 'reminder_10_sent_at');
        reminders++;
      }
    }

    // 2) Curso iniciado sin "Marcar inicio": avisar a TODOS LOS DEMÁS.
    // Se da una ventana de hasta 15 min por si un trigger se retrasa.
    if (assigned && !c.check_start && !c.uncovered_alert_sent_at && diff <= 0 && diff >= -ECT_ALERT_WINDOW_AFTER_START_MIN) {
      const recipients = tokens.filter(function(t){ return t.data.staff_id !== assigned; });
      const assignedName = staffNames[assigned] || 'el Staff asignado';
      const r = sendPushToTokens_(recipients, {
        title: '⚠️ Curso sin cubrir',
        body: (c.title || 'Un curso') + ' ya comenzó y ' + assignedName + ' todavía no marcó el inicio. ¿Podés cubrirlo?',
        tag: 'uncovered-' + firestoreDocId_(doc.name),
        url: './'
      });
      if (r.sent > 0) {
        setFirestoreTimestampField_(doc.name, 'uncovered_alert_sent_at');
        uncovered++;
      }
    }
  });

  return 'Recordatorios: ' + reminders + ' | Alertas sin cubrir: ' + uncovered;
}

function listFirestoreCollection_(collectionName) {
  const out = [];
  let nextPageToken = '';
  const accessToken = ScriptApp.getOAuthToken();
  do {
    let url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(FIREBASE_PROJECT_ID) +
      '/databases/(default)/documents/' + encodeURIComponent(collectionName) + '?pageSize=300';
    if (nextPageToken) url += '&pageToken=' + encodeURIComponent(nextPageToken);
    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {Authorization: 'Bearer ' + accessToken},
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('Firestore ' + collectionName + ': HTTP ' + res.getResponseCode() + ' · ' + res.getContentText());
    }
    const data = JSON.parse(res.getContentText() || '{}');
    (data.documents || []).forEach(function(d){ out.push(d); });
    nextPageToken = data.nextPageToken || '';
  } while (nextPageToken);
  return out;
}

function firestoreDocId_(docName) {
  const parts = String(docName || '').split('/');
  return parts.length ? parts[parts.length - 1] : '';
}

function localMinuteNumber_(dateTime) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(dateTime || ''));
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) / 60000;
}

function setFirestoreTimestampField_(documentName, fieldName) {
  const url = 'https://firestore.googleapis.com/v1/' + documentName +
    '?updateMask.fieldPaths=' + encodeURIComponent(fieldName);
  const fields = {};
  fields[fieldName] = {timestampValue: new Date().toISOString()};
  const res = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
    payload: JSON.stringify({fields: fields}),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error('No se pudo marcar ' + fieldName + ': HTTP ' + res.getResponseCode() + ' · ' + res.getContentText());
  }
}

function setFirestoreBooleanField_(documentName, fieldName, value) {
  const url = 'https://firestore.googleapis.com/v1/' + documentName +
    '?updateMask.fieldPaths=' + encodeURIComponent(fieldName);
  const fields = {};
  fields[fieldName] = {booleanValue: !!value};
  UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
    payload: JSON.stringify({fields: fields}),
    muteHttpExceptions: true
  });
}

function sendPushToTokens_(tokenEntries, message) {
  let sent = 0;
  let failed = 0;
  tokenEntries.forEach(function(entry){
    const token = entry.data.token;
    if (!token) return;
    const payload = {
      message: {
        token: String(token),
        data: {
          title: String(message.title || 'Cobertura ECT'),
          body: String(message.body || 'Tenés un nuevo aviso.'),
          tag: String(message.tag || 'ect-cobertura'),
          url: String(message.url || './')
        }
      }
    };
    const res = UrlFetchApp.fetch(
      'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(FIREBASE_PROJECT_ID) + '/messages:send',
      {
        method: 'post',
        contentType: 'application/json',
        headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );
    const code = res.getResponseCode();
    const body = res.getContentText() || '';
    if (code >= 200 && code < 300) {
      sent++;
    } else {
      failed++;
      // Si Firebase informa que el token ya no existe, lo desactivamos.
      if (body.indexOf('UNREGISTERED') >= 0 || body.indexOf('registration-token-not-registered') >= 0) {
        try { setFirestoreBooleanField_(entry.doc, 'active', false); } catch (e) {}
      }
      console.log('FCM error ' + code + ': ' + body);
    }
  });
  return {sent:sent, failed:failed};
}
