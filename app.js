const $ = (s) => document.querySelector(s);
const E = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const ADMIN_EMAIL = 'sergio.quiroga@ect.local';
const ADMIN_STAFF_ID = 'sergio-quiroga';

const STAFF_ROSTER = [
  {id:'sergio-quiroga',name:'Sergio Quiroga',legacy_email:ADMIN_EMAIL,role:'admin',active:true,is_staff:true},
  {id:'laura-ruiz-diaz',name:'Laura Ruiz Diaz',legacy_email:'laura.ruizdiaz@ect.local',role:'staff',active:true,is_staff:true},
  {id:'jhonatan-ferri',name:'Jhonatan Ferri',legacy_email:'jhonatan.ferri@ect.local',role:'staff',active:true,is_staff:true},
  {id:'araceli-chavez',name:'Araceli Chavez',legacy_email:'araceli.chavez@ect.local',role:'staff',active:true,is_staff:true},
  {id:'marcos-ibarra',name:'Marcos Ibarra',legacy_email:'marcos.ibarra@ect.local',role:'staff',active:true,is_staff:true},
  {id:'nicole-farina',name:'Nicole Fariña',legacy_email:'nicole.farina@ect.local',role:'staff',active:true,is_staff:true},
  {id:'nara-ruiz',name:'Nara Ruiz',legacy_email:'nara.ruiz@ect.local',role:'staff',active:true,is_staff:true},
  {id:'luz-rodriguez',name:'Luz Rodriguez',legacy_email:'luz.rodriguez@ect.local',role:'staff',active:true,is_staff:true},
  {id:'carlos-gonzalez',name:'Carlos Gonzalez',legacy_email:'carlos.gonzalez@ect.local',role:'staff',active:true,is_staff:true},
  {id:'deisy-villalba',name:'Deisy Villalba',legacy_email:'deisy.villalba@ect.local',role:'staff',active:true,is_staff:true},
  {id:'matias-barrios',name:'Matias Barrios',legacy_email:'matias.barrios@ect.local',role:'staff',active:true,is_staff:true}
];

const state = {
  user:null, profile:null, staff:[], courses:[], invites:[], tab:'agenda', date:'2026-10-12',
  ready:false, loading:false, error:'', unsubs:[], authMode:'login', registering:false,
  notificationReady:false
};

let auth = null;
let db = null;
let messaging = null;
let localAlertTimer = null;
let captureStream = null;
let captureRecorder = null;
let captureChunks = [];
let captureTimer = null;
let captureStartedAt = 0;
let captureFiles = [];
let captureMode = 'photo';
let loginTutorialOpened = false;
let appTutorialOpened = false;

function configOK(){
  const c = window.ECT_FIREBASE_CONFIG || {};
  return !!(window.firebase && c.apiKey && !c.apiKey.includes('PEGAR_') && c.authDomain && c.projectId && c.appId);
}
function vapidConfigured(){
  const v = window.ECT_FIREBASE_CONFIG?.vapidKey || '';
  return !!v && !v.includes('PEGAR_');
}
function appsScriptConfigured(){
  const u = window.ECT_FIREBASE_CONFIG?.appsScriptUrl || '';
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(u) && !u.includes('PEGAR_');
}
function toast(msg, err=false){
  const old = document.querySelector('.toast'); if(old) old.remove();
  const x = document.createElement('div'); x.className = 'toast'+(err?' err':''); x.textContent = msg;
  document.body.append(x); setTimeout(()=>x.remove(),4200);
}
function initials(name='ECT'){return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
function isAdmin(){
  if(!state.profile) return false;
  const own = state.staff.find(p=>p.id===state.profile.staff_id);
  return own ? own.role==='admin' : state.profile.role==='admin';
}
function isStaff(){return !!state.profile?.is_staff}
function dateOf(s){return String(s||'').slice(0,10)}
function timeOf(s){return String(s||'').slice(11,16)}
function friendly(d){return new Date(d+'T12:00:00').toLocaleDateString('es-PY',{weekday:'long',day:'numeric',month:'long'})}
function status(c){return c.check_start && c.check_end ? 'Completado' : c.check_start ? 'En curso' : 'Pendiente'}
function staffById(id){return state.staff.find(p=>p.id===id)}
function assignedName(c){return staffById(c.assigned_staff_id)?.name || 'Sin asignar'}
function assignedCount(staffId){return state.courses.filter(c=>c.assigned_staff_id===staffId).length}
function eventDates(){const dates=[...new Set(state.courses.map(c=>dateOf(c.start_at)).filter(Boolean))].sort();return dates.length?dates:['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16']}
function dayLabel(d){const x=new Date(d+'T12:00:00');return {w:x.toLocaleDateString('es-PY',{weekday:'short'}).replace('.','').toUpperCase(),n:String(x.getDate()).padStart(2,'0')}}
function roleLabel(){return isAdmin()?'Administrador · Staff':'Staff'}
function normalizedCode(v){return String(v||'').trim().toUpperCase().replace(/\s+/g,'')}
function nowMillis(){return Date.now()}
function courseStartMillis(c){return Date.parse(c.start_at)}

function firebaseError(err){
  const code=err?.code||'';
  if(code.includes('invalid-credential')||code.includes('wrong-password')||code.includes('user-not-found')) return 'Correo o contraseña incorrectos.';
  if(code.includes('email-already-in-use')) return 'Ese correo ya está registrado. Probá iniciar sesión o recuperar tu contraseña.';
  if(code.includes('weak-password')) return 'La contraseña debe tener al menos 6 caracteres.';
  if(code.includes('invalid-email')) return 'Ingresá un correo válido.';
  if(code.includes('too-many-requests')) return 'Demasiados intentos. Probá nuevamente más tarde.';
  if(code.includes('network-request-failed')) return 'No se pudo conectar a Firebase. Revisá tu Internet.';
  if(code.includes('permission-denied')) return 'Firebase rechazó esta operación. Revisá las reglas de Firestore.';
  return err?.message || 'Ocurrió un error.';
}

function loginView(){
  const warning = !configOK()
    ? '<div class="setup-warning"><b>Falta configurar Firebase.</b><span>Abrí <code>config.js</code> y pegá la configuración de tu proyecto.</span></div>'
    : state.error ? `<div class="setup-warning"><b>No se pudo iniciar.</b><span>${E(state.error)}</span></div>` : '';

  if(state.authMode==='register'){
    return `<div class="login-simple"><div class="login-brand-simple"><img src="./logo.png" alt="ECT"><h1>Cobertura ECT</h1></div>
      <form id="registerForm" class="login compact-login">
        <span class="kicker">PRIMER INGRESO</span><h2>Crear mi acceso</h2><p>Usá el código que te entrega un administrador y elegí tu propio correo y contraseña.</p>${warning}
        <label>Código de acceso</label><input name="code" required autocomplete="one-time-code" placeholder="Ej. ECT-LAURA-8K4P">
        <label>Correo que querés usar</label><input name="email" type="email" required autocomplete="email" placeholder="tu@gmail.com">
        <label>Elegí una contraseña</label><input name="password" type="password" required minlength="6" autocomplete="new-password" placeholder="Mínimo 6 caracteres">
        <label>Repetí la contraseña</label><input name="password2" type="password" required minlength="6" autocomplete="new-password" placeholder="Repetí tu contraseña">
        <button class="btn" type="submit" ${!configOK()?'disabled':''}>Crear acceso</button>
        <button class="text-btn" type="button" data-auth-mode="login">Volver a iniciar sesión</button>
        <button class="polito-help-link" type="button" data-login-tutorial>¿Primera vez? Polito te explica</button>
        <div class="author">Desarrollado por Sergio Quiroga</div>
      </form>
    </div>`;
  }

  return `<div class="login-simple"><div class="login-brand-simple"><img src="./logo.png" alt="ECT"><h1>Cobertura ECT</h1></div>
    <form id="loginForm" class="login compact-login">
      <span class="kicker">ECT 2026</span><h2>Iniciar sesión</h2>${warning}
      <label>Correo</label><input name="email" type="email" required autocomplete="username" placeholder="tu@correo.com">
      <label>Contraseña</label><input name="password" type="password" required autocomplete="current-password" placeholder="Tu contraseña">
      <button class="btn" type="submit" ${!configOK()?'disabled':''}>Entrar</button>
      <button class="polito-help-link" type="button" data-login-tutorial>Primera vez · Polito te guía</button>
      <button class="text-btn subtle" type="button" data-forgot>Olvidé mi contraseña</button>
      <div class="author">Desarrollado por Sergio Quiroga</div>
    </form>
  </div>`;
}
function loadingView(text='Cargando datos…'){
  return `<div class="boot"><img src="./logo.png" alt="ECT"><p>${E(text)}</p></div>`;
}

function courseCard(c){
  const myStaffId = state.profile.staff_id;
  const assignedToMe = c.assigned_staff_id === myStaffId;
  const canCover = isAdmin() || assignedToMe;
  const st = status(c);
  const endDisabled = !c.check_start && !c.check_end;
  const confirmed = !!c.coverage_confirmed;
  const adminControls = isAdmin() ? `<div class="admin-course-tools">${!assignedToMe?`<button class="btn self-assign small" data-assign-self="${E(c.id)}">Asignarme</button>`:''}<button class="btn secondary small" data-assign="${E(c.id)}">Asignar</button><button class="btn secondary small" data-edit-course="${E(c.id)}">Editar</button></div>` : '';
  return `<article class="card course ${!c.assigned_staff_id?'needs-staff':''}">
    <div class="course-head"><div class="time">${E(timeOf(c.start_at))}</div><div class="course-main"><h3>${E(c.title)}</h3>
      <div class="meta"><span>${E(c.location||'Sin lugar')}</span><span>•</span><span>${E(timeOf(c.start_at))}–${E(timeOf(c.end_at))}</span><span class="state ${st==='Completado'?'done':st==='En curso'?'doing':''}">${st}</span>${confirmed?'<span class="state confirmed">Confirmado</span>':''}</div>
    </div></div>
    <div class="assigned"><span>Staff</span><strong>${E(assignedName(c))}</strong>${adminControls}</div>
    ${assignedToMe&&!confirmed?`<button class="btn confirm-cover" data-confirm-cover="${E(c.id)}">✓ Confirmar que voy a cubrir</button>`:''}
    ${assignedToMe&&confirmed?'<div class="coverage-ok">✓ Confirmaste esta cobertura</div>':''}
    ${canCover?`<div class="actions"><button class="btn ${c.check_start?'secondary':''}" data-check="start" data-id="${E(c.id)}" data-done="${c.check_start?'0':'1'}">${c.check_start?'✓ Inicio marcado':'Marcar inicio'}</button><button class="btn ${c.check_end?'secondary':''}" data-check="end" data-id="${E(c.id)}" data-done="${c.check_end?'0':'1'}" ${endDisabled?'disabled':''}>${c.check_end?'✓ Fin marcado':'Marcar fin'}</button></div>`:''}
    ${(c.opening_by||c.closing_by)?`<div class="audit">${c.opening_by?`Inicio: ${E(staffById(c.opening_by)?.name||c.opening_by)}`:''}${c.opening_by&&c.closing_by?' · ':''}${c.closing_by?`Fin: ${E(staffById(c.closing_by)?.name||c.closing_by)}`:''}</div>`:''}
  </article>`;
}
function coursesForView(){
  let rows = state.courses.filter(c=>dateOf(c.start_at)===state.date);
  if(state.tab==='mine') rows = rows.filter(c=>c.assigned_staff_id===state.profile.staff_id);
  return rows;
}

function activeInviteFor(staffId){
  return state.invites.find(i=>i.staff_id===staffId && !i.claimed);
}

function teamView(){
  if(!isAdmin()) return '<div class="card empty">Esta sección es exclusiva para administradores.</div>';
  const staffRows = state.staff.filter(p=>p.active);
  return `<div class="section-title"><div><h2>Staff</h2><p>${staffRows.length} integrantes</p></div><span class="tiny-note">Códigos de un solo uso · Administrá permisos</span></div>
    <div class="team">${staffRows.map(p=>{
      const inv=activeInviteFor(p.id);
      const claimed=!!p.uid;
      const isRoot=p.id===ADMIN_STAFF_ID;
      const admin=p.role==='admin';
      return `<div class="card person"><div class="avatar">${E(initials(p.name))}</div><div class="grow"><strong>${E(p.name)}</strong><span>${E(p.email||'Acceso todavía no creado')}</span><small>${assignedCount(p.id)} cursos asignados</small>${!claimed&&inv?`<div class="invite-code">${E(inv.id)}</div>`:''}</div><div class="person-side"><span class="role">${isRoot?'Admin principal · Staff':admin?'Admin · Staff':'Staff'}</span>${!claimed?`<button class="btn secondary small" data-generate-invite="${E(p.id)}">${inv?'Regenerar código':'Crear acceso'}</button>${inv?`<button class="mini-link" data-copy-invite="${E(inv.id)}">Copiar código</button>`:''}`:'<span class="access-ok">✓ Acceso creado</span>'}${!isRoot?`<button class="mini-link role-action" data-toggle-admin="${E(p.id)}">${admin?'Quitar admin':'Hacer admin'}</button>`:''}</div></div>`;
    }).join('')}</div>`;
}
function notificationStatus(){
  if(!('Notification' in window) || !('serviceWorker' in navigator)) return 'Este navegador no admite avisos push.';
  if(Notification.permission==='granted' && !vapidConfigured()) return 'Avisos locales activados. Falta la VAPID key para recibir push con la app cerrada.';
  if(Notification.permission==='granted') return 'Notificaciones push activadas en este dispositivo.';
  if(!vapidConfigured()) return 'Podés activar avisos locales; para push con la app cerrada falta configurar la VAPID key.';
  if(Notification.permission==='denied') return 'Las notificaciones están bloqueadas en el navegador.';
  return 'Activá los avisos para recibir recordatorios de tus cursos.';
}

function accountView(){
  return `<div class="card account"><div class="avatar big">${E(initials(state.profile.name))}</div><h2>${E(state.profile.name)}</h2><p>${E(state.profile.email)}</p><span class="role">${E(roleLabel())}</span>
    <div class="notify-box"><strong>Avisos de cobertura</strong><p>${E(notificationStatus())}</p><button class="btn secondary" data-enable-notifications>Activar notificaciones</button></div>
    <button class="btn secondary" data-app-tutorial>Ver tutorial con Polito</button>
    <button class="btn danger" data-logout>Cerrar sesión</button><div class="author">Cobertura ECT 2026 · Desarrollado por Sergio Quiroga</div></div>`;
}
function captureSectionView(){
  return `<section class="capture-page">
    <div class="capture-page-head">
      <div><span class="kicker">CAPTURA ECT</span><h2>Fotos y archivos</h2><p>Sacá una foto con la cámara del celular o subí fotos y videos originales desde tus archivos.</p></div>
    </div>
    ${appsScriptConfigured()?'':`<div class="setup-warning compact-warning"><b>Falta conectar Google Drive.</b><span>Pegá la URL /exec de Google Apps Script en <code>config.js</code>.</span></div>`}
    <div class="capture-panel card">
      <div class="capture-modes">
        <button class="${captureMode==='photo'?'active':''}" data-media-mode="photo">📷 Foto</button>
        <button class="${captureMode==='gallery'?'active':''}" data-media-mode="gallery">📁 Subir archivos</button>
      </div>
      <label class="capture-course-label">Curso relacionado <span class="muted-label">(opcional)</span></label>
      <select id="captureCourse">${captureCourseOptions()}</select>
      <div id="captureStage" class="capture-stage"></div>
      <div id="captureFiles" class="capture-files"></div>
      <div class="capture-upload-wrap hidden" id="captureUploadWrap"><div class="capture-progress"><i id="captureProgressBar"></i></div><small id="captureProgressText">Preparando…</small></div>
      <div class="capture-footer"><button class="btn" id="sendCaptureBtn" data-send-capture disabled>Enviar a Drive</button></div>
    </div>
  </section>`;
}

function content(){
  if(state.tab==='capture') return captureSectionView();
  if(state.tab==='team' && !isAdmin()) state.tab='agenda';
  if(state.tab==='team') return teamView();
  if(state.tab==='account') return accountView();
  const rows = coursesForView();
  return `<div class="course-list">${rows.length?rows.map(courseCard).join(''):'<div class="card empty">No hay cursos para esta fecha.</div>'}</div>`;
}

function mainView(){
  if(!isAdmin() && state.tab==='team') state.tab='agenda';
  const allDay = state.courses.filter(c=>dateOf(c.start_at)===state.date);
  const done = allDay.filter(c=>c.check_start&&c.check_end).length;
  const unassigned = allDay.filter(c=>!c.assigned_staff_id).length;
  const myToday = allDay.filter(c=>c.assigned_staff_id===state.profile.staff_id).length;
  const teamTab = isAdmin()?`<button class="${state.tab==='team'?'active':''}" data-tab="team">Staff</button>`:'';
  const teamNav = isAdmin()?`<button class="${state.tab==='team'?'active':''}" data-tab="team">Staff</button>`:'';
  return `<div class="app">
    <header class="top"><img src="./logo.png" alt="ECT"><div class="grow"><h1>Cobertura ECT</h1><p>${E(state.profile.name)} · ${E(roleLabel())}</p></div><button class="avatar avatar-button" data-app-tutorial title="Ver tutorial">${E(initials(state.profile.name))}</button></header>
    ${('Notification' in window)&&Notification.permission==='default'?'<button class="notify-banner" data-enable-notifications>🔔 Activar avisos de cobertura</button>':''}
    ${state.tab==='capture' ? content() : `
    <section class="card hero"><div class="grow"><span class="kicker">ECT 2026</span><h2>${isAdmin()?'Agenda de cobertura':'Tus coberturas'}</h2><p>${E(friendly(state.date))}</p></div><button class="polito-hero-button" data-app-tutorial title="Polito te guía"><img class="polito-transparent" src="./polito.png" alt="Polito"></button></section>
    <div class="stats"><div class="card stat"><b>${allDay.length}</b><span>Cursos</span></div><div class="card stat"><b>${isAdmin()?done:myToday}</b><span>${isAdmin()?'Completados':'Mis cursos'}</span></div><div class="card stat"><b>${unassigned}</b><span>Sin asignar</span></div></div>
    <div class="day-strip">${eventDates().map(d=>{const l=dayLabel(d);return `<button class="day ${state.date===d?'active':''}" data-date="${d}"><span>${l.w}</span><b>${l.n}</b></button>`}).join('')}</div>
    <div class="tabs ${isAdmin()?'with-admin':'staff-only'}"><button class="${state.tab==='agenda'?'active':''}" data-tab="agenda">Agenda</button><button class="${state.tab==='mine'?'active':''}" data-tab="mine">Mis coberturas</button>${teamTab}<button class="${state.tab==='account'?'active':''}" data-tab="account">Cuenta</button></div>
    ${content()}`}
  </div>
  <nav class="nav capture-nav">
    <div class="nav-side nav-left">
      <button class="${state.tab==='agenda'?'active':''}" data-tab="agenda">Agenda</button>
      <button class="${state.tab==='mine'?'active':''}" data-tab="mine">Mis tareas</button>
    </div>
    <button class="capture-fab ${state.tab==='capture'?'active':''}" data-capture-open aria-label="Abrir cámara y subir archivos" title="Capturar o subir">+</button>
    <div class="nav-side nav-right">
      ${teamNav}
      <button class="${state.tab==='account'?'active':''}" data-tab="account">Cuenta</button>
    </div>
  </nav>`;
}
function render(){
  const root=$('#app');
  if(state.loading){root.innerHTML=loadingView('Preparando Cobertura ECT…');return;}
  root.innerHTML = state.user && state.profile ? mainView() : loginView();
  if(state.user && state.profile && state.tab==='capture') requestAnimationFrame(()=>setCaptureMode(captureMode));
  if(state.user && state.profile) maybeAutoAppTutorial();
  else maybeAutoLoginTutorial();
}
function clearListeners(){state.unsubs.forEach(fn=>{try{fn()}catch{}});state.unsubs=[]}

async function ensureInitialData(){
  if(!state.user || state.user.email.toLowerCase()!==ADMIN_EMAIL) return;
  const now=firebase.firestore.FieldValue.serverTimestamp();
  const userRef=db.collection('users').doc(state.user.uid);
  await userRef.set({
    staff_id:ADMIN_STAFF_ID,name:'Sergio Quiroga',email:ADMIN_EMAIL,role:'admin',is_staff:true,active:true,updated_at:now
  },{merge:true});

  const existingStaffSnap = await db.collection('staff').get();
  const existingStaff = Object.fromEntries(existingStaffSnap.docs.map(d=>[d.id,d.data()]));
  const batch = db.batch();
  STAFF_ROSTER.forEach(p=>{
    const ref=db.collection('staff').doc(p.id);
    const current=existingStaff[p.id]||{};
    const base={name:p.name,role:p.id===ADMIN_STAFF_ID?'admin':(current.role||p.role),is_staff:true,active:true,legacy_email:p.legacy_email,updated_at:now};
    if(p.id===ADMIN_STAFF_ID) Object.assign(base,{uid:state.user.uid,email:ADMIN_EMAIL,claimed_at:now});
    batch.set(ref,base,{merge:true});
  });
  await batch.commit();

  const existing=await db.collection('courses').get();
  if(existing.empty){
    const chunks=[]; let current=[];
    (window.ECT_COURSES||[]).forEach(c=>{current.push(c);if(current.length===450){chunks.push(current);current=[]}});if(current.length)chunks.push(current);
    for(const chunk of chunks){
      const cb=db.batch();
      chunk.forEach(c=>cb.set(db.collection('courses').doc(c.id),{
        ...c,assigned_staff_id:null,coverage_confirmed:false,coverage_confirmed_by:null,coverage_confirmed_at:null,
        check_start:false,check_end:false,opening_by:null,closing_by:null,check_start_at:null,check_end_at:null,
        reminder_10_sent_at:null,uncovered_alert_sent_at:null,created_at:now,updated_at:now
      }));
      await cb.commit();
    }
    toast('Datos iniciales cargados: 67 cursos y Staff ECT.');
  }else{
    const legacyToStaff=Object.fromEntries(STAFF_ROSTER.map(s=>[s.legacy_email,s.id]));
    const batches=[]; let cb=db.batch(),n=0;
    existing.docs.forEach(doc=>{
      const c=doc.data();
      const patch={};
      if(!('assigned_staff_id' in c)) patch.assigned_staff_id=c.assigned_email?legacyToStaff[c.assigned_email]||null:null;
      if(!('coverage_confirmed' in c)) patch.coverage_confirmed=false;
      if(!('coverage_confirmed_by' in c)) patch.coverage_confirmed_by=null;
      if(!('coverage_confirmed_at' in c)) patch.coverage_confirmed_at=null;
      if(!('reminder_10_sent_at' in c)) patch.reminder_10_sent_at=null;
      if(!('uncovered_alert_sent_at' in c)) patch.uncovered_alert_sent_at=null;
      if(Object.keys(patch).length){patch.updated_at=now;cb.update(doc.ref,patch);n++;}
      if(n===450){batches.push(cb);cb=db.batch();n=0;}
    });
    if(n)batches.push(cb);
    for(const b of batches) await b.commit();
  }
}

async function loadProfile(){
  const ref=db.collection('users').doc(state.user.uid);
  let snap=await ref.get();
  if(!snap.exists && state.user.email?.toLowerCase()===ADMIN_EMAIL){await ensureInitialData();snap=await ref.get();}
  if(!snap.exists) throw new Error('Tu cuenta de Firebase todavía no está vinculada al Staff ECT. Si es tu primera vez, cerrá sesión y usá “Crear mi acceso”.');
  state.profile={uid:snap.id,...snap.data()};
}

function startRealtime(){
  clearListeners();
  const u1=db.collection('staff').orderBy('name').onSnapshot(s=>{
    const wasAdmin=isAdmin();
    state.staff=s.docs.map(d=>({id:d.id,...d.data()}));
    const nowAdmin=isAdmin();
    if(wasAdmin!==nowAdmin){setTimeout(()=>startRealtime(),0);return;}
    if(state.tab!=='capture') render();
  },e=>toast(firebaseError(e),true));
  const u2=db.collection('courses').orderBy('start_at').onSnapshot(s=>{state.courses=s.docs.map(d=>({id:d.id,...d.data()}));if(state.tab!=='capture') render();startLocalAlertLoop()},e=>toast(firebaseError(e),true));
  state.unsubs=[u1,u2];
  if(isAdmin()){
    const u3=db.collection('invites').orderBy('created_at','desc').onSnapshot(s=>{state.invites=s.docs.map(d=>({id:d.id,...d.data()}));if(state.tab!=='capture') render()},e=>console.warn(e));
    state.unsubs.push(u3);
  } else state.invites=[];
}
async function afterLogin(user){
  state.loading=true; state.error=''; state.user=user; render();
  try{
    if(user.email?.toLowerCase()===ADMIN_EMAIL) await ensureInitialData();
    await loadProfile();
    startRealtime();
    if(('Notification' in window) && Notification.permission==='granted'){ if(vapidConfigured()) setupPushToken().catch(()=>{}); else startLocalAlertLoop(); }
  }catch(e){
    clearListeners(); state.profile=null; state.error=firebaseError(e); toast(state.error,true);
  }finally{state.loading=false;render()}
}

async function doLogin(email,password){
  if(!configOK()) throw new Error('Primero configurá Firebase en config.js.');
  await auth.signInWithEmailAndPassword(String(email).trim().toLowerCase(),String(password));
}
async function doLogout(){clearListeners();stopLocalAlertLoop();await auth.signOut();state.user=null;state.profile=null;state.staff=[];state.courses=[];state.invites=[];state.tab='agenda';render()}

async function registerStaff({code,email,password,password2}){
  if(password!==password2) throw new Error('Las contraseñas no coinciden.');
  const inviteCode=normalizedCode(code); if(!inviteCode) throw new Error('Ingresá tu código de acceso.');
  const normalizedEmail=String(email||'').trim().toLowerCase();
  state.registering=true;
  let created=null;
  try{
    const cred=await auth.createUserWithEmailAndPassword(normalizedEmail,password);
    created=cred.user;
    await db.runTransaction(async tx=>{
      const inviteRef=db.collection('invites').doc(inviteCode);
      const inviteSnap=await tx.get(inviteRef);
      if(!inviteSnap.exists) throw new Error('Código de acceso inválido.');
      const invite=inviteSnap.data();
      if(invite.claimed) throw new Error('Ese código de acceso ya fue utilizado.');
      const staffRef=db.collection('staff').doc(invite.staff_id);
      const staffSnap=await tx.get(staffRef);
      if(!staffSnap.exists) throw new Error('No se encontró el integrante del Staff asociado a este código.');
      const staff=staffSnap.data();
      if(staff.uid) throw new Error('Ese integrante del Staff ya tiene una cuenta creada.');
      const userRef=db.collection('users').doc(created.uid);
      const now=firebase.firestore.FieldValue.serverTimestamp();
      tx.set(userRef,{staff_id:invite.staff_id,name:invite.staff_name,email:normalizedEmail,role:staff.role==='admin'?'admin':'staff',is_staff:true,active:true,invite_code:inviteCode,created_at:now,updated_at:now});
      tx.update(staffRef,{uid:created.uid,email:normalizedEmail,claimed_at:now,updated_at:now});
      tx.update(inviteRef,{claimed:true,claimed_uid:created.uid,claimed_email:normalizedEmail,claimed_at:now});
    });
    state.registering=false;
    state.authMode='login';
    toast('Acceso creado correctamente.');
    await afterLogin(created);
  }catch(e){
    state.registering=false;
    if(created){try{await created.delete()}catch{} try{await auth.signOut()}catch{}}
    throw e;
  }
}

async function forgotPassword(){
  const email=prompt('Ingresá el correo de tu cuenta:'); if(!email)return;
  await auth.sendPasswordResetEmail(String(email).trim().toLowerCase());
  toast('Te enviamos un correo para restablecer tu contraseña.');
}

async function setCheck(id,kind,done){
  const c=state.courses.find(x=>x.id===id); if(!c) return;
  const can=isAdmin()||c.assigned_staff_id===state.profile.staff_id; if(!can) throw new Error('Este curso no está asignado a tu cuenta.');
  const data={updated_at:firebase.firestore.FieldValue.serverTimestamp()};
  if(kind==='start') Object.assign(data,{check_start:done,opening_by:done?state.profile.staff_id:null,check_start_at:done?firebase.firestore.FieldValue.serverTimestamp():null});
  if(kind==='end') Object.assign(data,{check_end:done,closing_by:done?state.profile.staff_id:null,check_end_at:done?firebase.firestore.FieldValue.serverTimestamp():null});
  await db.collection('courses').doc(id).update(data);
  toast(done?'Estado registrado.':'Estado revertido.');
}

async function confirmCoverage(id){
  const c=state.courses.find(x=>x.id===id); if(!c)return;
  if(c.assigned_staff_id!==state.profile.staff_id) throw new Error('Este curso no está asignado a tu cuenta.');
  await db.collection('courses').doc(id).update({coverage_confirmed:true,coverage_confirmed_by:state.profile.staff_id,coverage_confirmed_at:firebase.firestore.FieldValue.serverTimestamp(),updated_at:firebase.firestore.FieldValue.serverTimestamp()});
  toast('Cobertura confirmada.');
}

function editCourseModal(id){
  if(!isAdmin()) throw new Error('Solo un administrador puede modificar cursos.');
  const c=state.courses.find(x=>x.id===id); if(!c)return;
  const date=dateOf(c.start_at), start=timeOf(c.start_at), end=timeOf(c.end_at);
  const bg=document.createElement('div');bg.className='modal-bg';bg.innerHTML=`<div class="modal"><h3>Editar curso</h3><p>Podés modificar el nombre, la fecha, el horario y el aula/lugar.</p>
    <label>Nombre del curso</label><input id="editCourseTitle" type="text" maxlength="220" value="${E(c.title)}" required>
    <label>Fecha</label><input id="editCourseDate" type="date" value="${E(date)}" required>
    <div class="edit-time-grid"><div><label>Hora de inicio</label><input id="editCourseStart" type="time" value="${E(start)}" required></div><div><label>Hora de fin</label><input id="editCourseEnd" type="time" value="${E(end)}" required></div></div>
    <label>Aula / lugar</label><input id="editCourseLocation" type="text" maxlength="180" value="${E(c.location||'')}" placeholder="Ej. AULA 3">
    <div class="buttons"><button class="btn secondary" data-close>Cancelar</button><button class="btn" data-save-course="${E(id)}">Guardar cambios</button></div></div>`;document.body.append(bg);
}
async function saveCourseEdit(id){
  if(!isAdmin()) throw new Error('Solo un administrador puede modificar cursos.');
  const title=String($('#editCourseTitle')?.value||'').trim();
  const date=$('#editCourseDate')?.value||'';
  const start=$('#editCourseStart')?.value||'';
  const end=$('#editCourseEnd')?.value||'';
  const location=String($('#editCourseLocation')?.value||'').trim();
  if(!title) throw new Error('Ingresá el nombre del curso.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) throw new Error('Revisá la fecha y los horarios.');
  const startAt=`${date}T${start}:00-03:00`, endAt=`${date}T${end}:00-03:00`;
  if(Date.parse(endAt)<=Date.parse(startAt)) throw new Error('La hora de fin debe ser posterior a la hora de inicio.');
  await db.collection('courses').doc(id).update({
    title,location,start_at:startAt,end_at:endAt,
    reminder_10_sent_at:null,uncovered_alert_sent_at:null,
    updated_at:firebase.firestore.FieldValue.serverTimestamp()
  });
  state.date=date;
  document.querySelector('.modal-bg')?.remove();
  toast('Curso actualizado.');
}

function assignModal(id){
  const c=state.courses.find(x=>x.id===id); if(!c)return;
  const bg=document.createElement('div');bg.className='modal-bg';bg.innerHTML=`<div class="modal"><h3>Asignar cobertura</h3><p>${E(c.title)}</p><label>Staff responsable</label><select id="assignSelect"><option value="">Sin asignar</option>${state.staff.filter(p=>p.active).map(p=>`<option value="${E(p.id)}" ${p.id===c.assigned_staff_id?'selected':''}>${E(p.name)}${p.role==='admin'?' · Admin':''}</option>`).join('')}</select><div class="buttons"><button class="btn secondary" data-close>Cancelar</button><button class="btn" data-save-assign="${E(id)}">Guardar</button></div></div>`;document.body.append(bg);
}
async function saveAssign(id){
  if(!isAdmin())throw new Error('Solo un administrador puede cambiar asignaciones.');
  const value=$('#assignSelect')?.value||null;
  await db.collection('courses').doc(id).update({assigned_staff_id:value,coverage_confirmed:false,coverage_confirmed_by:null,coverage_confirmed_at:null,reminder_10_sent_at:null,uncovered_alert_sent_at:null,updated_at:firebase.firestore.FieldValue.serverTimestamp()});
  document.querySelector('.modal-bg')?.remove();toast('Asignación guardada.');
}

async function assignSelf(id){
  if(!isAdmin()) throw new Error('Solo un administrador puede asignar cursos.');
  await db.collection('courses').doc(id).update({assigned_staff_id:state.profile.staff_id,coverage_confirmed:false,coverage_confirmed_by:null,coverage_confirmed_at:null,reminder_10_sent_at:null,uncovered_alert_sent_at:null,updated_at:firebase.firestore.FieldValue.serverTimestamp()});
  state.tab='mine';
  toast('Te asignaste esta cobertura. Ya aparece en Mis coberturas.');
}

async function toggleAdmin(staffId){
  if(!isAdmin()) throw new Error('Solo un administrador puede cambiar privilegios.');
  if(staffId===ADMIN_STAFF_ID) throw new Error('Sergio Quiroga permanece como administrador principal.');
  const staff=staffById(staffId); if(!staff) return;
  const next=staff.role==='admin'?'staff':'admin';
  const batch=db.batch();
  const now=firebase.firestore.FieldValue.serverTimestamp();
  batch.update(db.collection('staff').doc(staffId),{role:next,updated_at:now});
  if(staff.uid) batch.update(db.collection('users').doc(staff.uid),{role:next,updated_at:now});
  await batch.commit();
  toast(next==='admin'?`${staff.name} ahora es administrador y Staff.`:`Se quitó el privilegio de administrador a ${staff.name}.`);
}

function tutorialShell({title,text,step,total,mode='app',final=false}){
  return `<div class="tutorial-bg"><div class="tutorial-card"><div class="tutorial-polito"><img class="polito-transparent" src="./polito.png" alt="Polito"></div><div class="tutorial-copy"><span class="kicker">POLITO TE GUÍA · ${step+1}/${total}</span><h3>${E(title)}</h3><p>${E(text)}</p></div><div class="tutorial-actions"><button class="btn secondary" data-tutorial-skip="${mode}">Omitir</button>${final?`<button class="btn" data-tutorial-finish="${mode}">${mode==='login'?'Crear mi acceso':'Listo'}</button>`:`<button class="btn" data-tutorial-next="${mode}" data-step="${step+1}">Siguiente</button>`}</div></div></div>`;
}

function loginTutorialSteps(){return [
  {title:'Pedí tu código',text:'La primera vez necesitás un código de acceso de un solo uso. Pedíselo a un administrador.'},
  {title:'Elegí tu correo y contraseña',text:'Con el código podés crear tu cuenta usando el correo que quieras y una contraseña propia.'},
  {title:'Después entrás normalmente',text:'Tu código se usa una sola vez. Desde el siguiente ingreso usás solamente tu correo y tu contraseña.'}
]}
function appTutorialSteps(){
  if(isAdmin()) return [
    {title:'Tu agenda',text:'Elegí el día y revisá los cursos. Desde cada tarjeta podés asignar a alguien o tocar Asignarme para tomar vos la cobertura.'},
    {title:'Mis coberturas',text:'Todo curso que te asignes aparece en Mis coberturas. Ahí podés confirmar que vas a cubrirlo.'},
    {title:'Cámara rápida',text:'Usá el botón + fijo del centro para sacar una foto, grabar video o elegir archivos. Al enviar, van directo a Drive en la carpeta del día y tu nombre.'},
    {title:'Inicio y fin',text:'Cuando llegues al curso, marcá Inicio. Al terminar, marcá Fin. Así queda registrado quién cubrió cada momento.'},
    {title:'Administración del Staff',text:'Solo los administradores ven la sección Staff. Desde ahí generás códigos y también podés dar o quitar privilegios de administrador.'},
    {title:'Activá los avisos',text:'En Cuenta podés activar notificaciones para recibir recordatorios de tus coberturas.'}
  ];
  return [
    {title:'Tus cursos',text:'Entrá en Mis coberturas para ver únicamente los cursos que te asignaron.'},
    {title:'Cámara rápida',text:'Usá el botón + fijo del centro para sacar una foto, grabar video o elegir archivos. Al enviar, van directo a Drive en la carpeta del día y tu nombre.'},
    {title:'Confirmá que vas a cubrir',text:'Antes del curso, tocá Confirmar que voy a cubrir para dejar asentado que vas a encargarte.'},
    {title:'Marcá inicio y fin',text:'Al llegar marcá Inicio y, cuando termine el curso, marcá Fin. El sistema registra tu cobertura.'},
    {title:'Activá los avisos',text:'En Cuenta podés activar notificaciones para recibir recordatorios antes de tus cursos.'}
  ];
}
function closeTutorial(){document.querySelector('.tutorial-bg')?.remove()}
function openLoginTutorial(step=0){
  closeTutorial(); const steps=loginTutorialSteps(); const i=Math.max(0,Math.min(step,steps.length-1));
  document.body.insertAdjacentHTML('beforeend',tutorialShell({...steps[i],step:i,total:steps.length,mode:'login',final:i===steps.length-1}));
}
function openAppTutorial(step=0){
  closeTutorial(); const steps=appTutorialSteps(); const i=Math.max(0,Math.min(step,steps.length-1));
  document.body.insertAdjacentHTML('beforeend',tutorialShell({...steps[i],step:i,total:steps.length,mode:'app',final:i===steps.length-1}));
}
function finishTutorial(mode,skip=false){
  if(mode==='login'){
    localStorage.setItem('ect-login-tutorial-v2','1'); loginTutorialOpened=true; closeTutorial();
    if(!skip){state.authMode='register';render();}
  } else {
    if(state.user) localStorage.setItem(`ect-app-tutorial-v2-${state.user.uid}`,'1'); appTutorialOpened=true; closeTutorial();
  }
}
function maybeAutoLoginTutorial(){
  if(state.user||state.authMode!=='login'||loginTutorialOpened||localStorage.getItem('ect-login-tutorial-v2')||document.querySelector('.tutorial-bg')) return;
  loginTutorialOpened=true; setTimeout(()=>openLoginTutorial(0),250);
}
function maybeAutoAppTutorial(){
  if(!state.user||!state.profile||appTutorialOpened||localStorage.getItem(`ect-app-tutorial-v2-${state.user.uid}`)||document.querySelector('.tutorial-bg')) return;
  appTutorialOpened=true; setTimeout(()=>openAppTutorial(0),450);
}

function randomCode(staff){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes=new Uint8Array(6);crypto.getRandomValues(bytes);
  const random=[...bytes].map(b=>alphabet[b%alphabet.length]).join('');
  const prefix=staff.name.split(' ')[0].normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z]/g,'').slice(0,8);
  return `ECT-${prefix}-${random}`;
}
async function generateInvite(staffId){
  if(!isAdmin()) throw new Error('Solo un administrador puede crear accesos.');
  const staff=staffById(staffId); if(!staff)return;
  if(staff.uid) throw new Error('Este integrante ya tiene su acceso creado.');
  const old=await db.collection('invites').where('staff_id','==',staffId).get();
  const batch=db.batch(); const unused=old.docs.filter(d=>!d.data().claimed); unused.forEach(d=>batch.delete(d.ref)); if(unused.length) await batch.commit();
  const code=randomCode(staff);
  await db.collection('invites').doc(code).set({staff_id:staff.id,staff_name:staff.name,claimed:false,created_at:firebase.firestore.FieldValue.serverTimestamp(),created_by:state.user.uid});
  toast(`Código creado para ${staff.name}.`);
}
async function copyInvite(code){
  try{await navigator.clipboard.writeText(code);toast('Código copiado.')}catch{prompt('Copiá este código:',code)}
}

async function sha256(text){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function setupPushToken(){
  if(!('Notification' in window)||!('serviceWorker' in navigator)) throw new Error('Este navegador no admite notificaciones push.');
  if(Notification.permission!=='granted'){
    const permission=await Notification.requestPermission();
    if(permission!=='granted') throw new Error('No se concedió permiso para notificaciones.');
  }
  const registration=await navigator.serviceWorker.register('./firebase-messaging-sw.js');
  startLocalAlertLoop();
  if(!vapidConfigured()){
    toast('Avisos locales activados. Configurá la VAPID key para recibir push con la app cerrada.');
    render();
    return;
  }
  if(!messaging) messaging=firebase.messaging();
  const token=await messaging.getToken({vapidKey:window.ECT_FIREBASE_CONFIG.vapidKey,serviceWorkerRegistration:registration});
  if(!token) throw new Error('Firebase no devolvió un token de notificaciones.');
  const id=await sha256(token);
  await db.collection('push_tokens').doc(id).set({token,uid:state.user.uid,staff_id:state.profile.staff_id,email:state.profile.email,active:true,user_agent:navigator.userAgent,updated_at:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
  state.notificationReady=true;
  try{messaging.onMessage(payload=>{
    const title=payload.data?.title||'Cobertura ECT';
    const body=payload.data?.body||'Tenés un nuevo aviso.';
    const tag=payload.data?.tag||'';
    const m=/^(10m|uncovered)-(.+)$/.exec(tag);
    if(m){
      const kind=m[1]==='10m'?'10m':'uncovered';
      if(localAlertSeen(kind,m[2])) return;
      markLocalAlert(kind,m[2]);
    }
    toast(`${title}: ${body}`);
  })}catch{}
  toast('Notificaciones activadas en este dispositivo.');
  render();
}

async function showLocalNotification(title,body,tag){
  if(Notification.permission!=='granted')return;
  try{
    const reg=await navigator.serviceWorker.getRegistration('./');
    if(reg) await reg.showNotification(title,{body,icon:'./logo.png',badge:'./logo.png',tag,data:{url:'./'}});
    else new Notification(title,{body,icon:'./logo.png',tag});
  }catch{}
}
function localAlertKey(kind,id){return `ect-alert-${kind}-${id}`}
function localAlertSeen(kind,id){return localStorage.getItem(localAlertKey(kind,id))==='1'}
function markLocalAlert(kind,id){localStorage.setItem(localAlertKey(kind,id),'1')}
function checkLocalAlerts(){
  if(!state.profile||Notification.permission!=='granted')return;
  const now=nowMillis();
  for(const c of state.courses){
    const start=courseStartMillis(c); if(!Number.isFinite(start))continue;
    const mins=(start-now)/60000;
    if(c.assigned_staff_id===state.profile.staff_id && mins<=10 && mins>8 && !c.reminder_10_sent_at && !localAlertSeen('10m',c.id)){
      markLocalAlert('10m',c.id);
      showLocalNotification('Tu cobertura empieza en 10 minutos',`${c.title} · ${c.location||'Lugar sin definir'}`,`10m-${c.id}`);
    }
    const isOther=c.assigned_staff_id!==state.profile.staff_id;
    if(isOther && now>=start && now<start+5*60000 && !c.check_start && !c.uncovered_alert_sent_at && !localAlertSeen('uncovered',c.id)){
      markLocalAlert('uncovered',c.id);
      showLocalNotification('⚠️ Curso sin cubrir',`${c.title} todavía no tiene el inicio de cobertura marcado.`,`uncovered-${c.id}`);
    }
  }
}
function startLocalAlertLoop(){
  if(localAlertTimer)return;
  checkLocalAlerts();localAlertTimer=setInterval(checkLocalAlerts,30000);
}
function stopLocalAlertLoop(){if(localAlertTimer){clearInterval(localAlertTimer);localAlertTimer=null}}


function stopCaptureCamera(){
  if(captureTimer){clearInterval(captureTimer);captureTimer=null}
  if(captureRecorder && captureRecorder.state!=='inactive'){
    try{captureRecorder.stop()}catch{}
  }
  captureRecorder=null;
  if(captureStream){
    captureStream.getTracks().forEach(t=>{try{t.stop()}catch{}});
    captureStream=null;
  }
}
function closeCaptureModal(){
  stopCaptureCamera();
  captureFiles=[];
  document.querySelector('.capture-modal-bg')?.remove();
}
function todayISOParaguay(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Asuncion',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const o=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${o.year}-${o.month}-${o.day}`;
}
function captureCourseOptions(){
  const today=todayISOParaguay();
  let rows=state.courses.filter(c=>dateOf(c.start_at)===today);
  if(!rows.length) rows=state.courses.filter(c=>dateOf(c.start_at)===state.date);
  if(!isAdmin()) rows=rows.filter(c=>c.assigned_staff_id===state.profile.staff_id);
  return `<option value="">Sin curso específico</option>${rows.map(c=>`<option value="${E(c.id)}">${E(timeOf(c.start_at))} · ${E(c.title)}</option>`).join('')}`;
}
function captureModal(){
  if(!state.user||!state.profile) return;
  stopCaptureCamera();
  captureFiles=[];
  captureMode='photo';
  state.tab='capture';
  render();
}
function isMobileCaptureDevice(){
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints>1 && window.matchMedia?.('(max-width: 900px)').matches);
}
function setCaptureMode(mode){
  captureMode=mode;
  captureFiles=[];
  stopCaptureCamera();
  document.querySelectorAll('.capture-modes button').forEach(b=>b.classList.toggle('active',b.dataset.mediaMode===mode));
  renderCaptureFiles();
  const stage=document.querySelector('#captureStage'); if(!stage)return;
  if(mode==='gallery'){
    stage.innerHTML=`<label class="gallery-drop"><strong>Subir fotos y videos originales</strong><span>Elegí archivos de la galería o del teléfono. Se conservan sin recomprimir (máximo 15 MB por archivo).</span><input id="galleryInput" type="file" accept="image/*,video/*" multiple></label>`;
    return;
  }
  if(mode==='photo'){
    stage.innerHTML=`<label class="native-video-card"><div class="native-video-icon">📷</div><strong>Sacar foto</strong><span>Abre la cámara del celular. Para 4:3, elegí esa proporción en la cámara del teléfono.</span><b>Abrir cámara para foto</b><input id="nativePhotoInput" type="file" accept="image/*" capture="environment"></label>`;
    return;
  }
}
async function startCaptureCamera(mode){
  if(!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite usar la cámara.');
  const videoConstraints=mode==='video'
    ? {
        facingMode:{ideal:'environment'},
        width:{ideal:1080},
        height:{ideal:1920},
        aspectRatio:{ideal:9/16}
      }
    : {
        facingMode:{ideal:'environment'},
        width:{ideal:4096},
        height:{ideal:3072},
        aspectRatio:{ideal:4/3}
      };
  captureStream=await navigator.mediaDevices.getUserMedia({
    video:videoConstraints,
    audio:mode==='video'
  });
  const video=document.querySelector('#cameraPreview'); if(!video)return;
  video.srcObject=captureStream;
  await video.play();
}
function fullFramePhoto(video,canvas){
  const sw=video.videoWidth, sh=video.videoHeight;
  if(!sw||!sh) throw new Error('La cámara todavía no está lista.');
  // Conserva el cuadro completo que entrega la cámara y su resolución real.
  canvas.width=sw;
  canvas.height=sh;
  canvas.getContext('2d',{alpha:false}).drawImage(video,0,0,sw,sh);
}
async function takeCapturePhoto(){
  const video=document.querySelector('#cameraPreview'); if(!video)return;
  let blob=null;
  const track=captureStream?.getVideoTracks?.()[0];

  // En navegadores compatibles, ImageCapture toma una foto de alta resolución
  // directamente desde la cámara, no desde el preview de video.
  if(track && 'ImageCapture' in window){
    try{
      const ic=new ImageCapture(track);
      blob=await ic.takePhoto();
    }catch(err){
      console.warn('ImageCapture no disponible; usando frame completo del video.',err);
    }
  }

  // Compatibilidad para Firefox/Safari y otros navegadores.
  if(!blob){
    const canvas=document.createElement('canvas');
    fullFramePhoto(video,canvas);
    blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.98));
  }

  if(!blob) throw new Error('No se pudo generar la foto.');
  const type=blob.type||'image/jpeg';
  const ext=type.includes('png')?'png':type.includes('webp')?'webp':'jpg';
  const file=new File([blob],`foto_${Date.now()}.${ext}`,{type});
  captureFiles=[file];renderCaptureFiles();
}
function bestRecorderMime(){
  const options=['video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  return options.find(x=>window.MediaRecorder?.isTypeSupported?.(x))||'';
}
function formatElapsed(ms){
  const sec=Math.floor(ms/1000),m=Math.floor(sec/60),s=sec%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function toggleVideoRecord(){
  if(!captureStream) throw new Error('La cámara no está disponible.');
  const btn=document.querySelector('[data-toggle-record]');
  if(captureRecorder && captureRecorder.state==='recording'){
    captureRecorder.stop();return;
  }
  captureChunks=[];
  const mime=bestRecorderMime();
  captureRecorder=new MediaRecorder(captureStream,mime?{mimeType:mime,videoBitsPerSecond:1500000,audioBitsPerSecond:96000}:{videoBitsPerSecond:1500000,audioBitsPerSecond:96000});
  captureRecorder.ondataavailable=e=>{if(e.data?.size)captureChunks.push(e.data)};
  captureRecorder.onstop=()=>{
    if(captureTimer){clearInterval(captureTimer);captureTimer=null}
    btn?.classList.remove('recording');
    const finalType=captureRecorder?.mimeType||mime||'video/webm';
    const ext=finalType.includes('mp4')?'mp4':'webm';
    const blob=new Blob(captureChunks,{type:finalType});
    if(blob.size){captureFiles=[new File([blob],`video_${Date.now()}.${ext}`,{type:finalType})];renderCaptureFiles()}
  };
  captureRecorder.start(1000);captureStartedAt=Date.now();btn?.classList.add('recording');
  const label=document.querySelector('#recordTime');
  captureTimer=setInterval(()=>{
    const elapsed=Date.now()-captureStartedAt;
    if(label)label.textContent=formatElapsed(elapsed);
    if(elapsed>=20000 && captureRecorder?.state==='recording')captureRecorder.stop();
  },500);
}
function humanSize(bytes){
  if(bytes<1024*1024)return `${Math.max(1,Math.round(bytes/1024))} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}
function renderCaptureFiles(){
  const box=document.querySelector('#captureFiles');const send=document.querySelector('#sendCaptureBtn');
  if(!box)return;
  if(!captureFiles.length){box.innerHTML='';if(send)send.disabled=true;return}
  box.innerHTML=`<div class="selected-media">${captureFiles.map((f,i)=>{
    const image=f.type.startsWith('image/'); const url=URL.createObjectURL(f);
    return `<div class="selected-media-item">${image?`<img src="${url}" alt="">`:`<video src="${url}" muted playsinline controls></video>`}<div><strong>${E(f.name)}</strong><small>${E(humanSize(f.size))}</small></div><button data-remove-media="${i}" aria-label="Quitar">×</button></div>`;
  }).join('')}</div>`;
  if(send)send.disabled=false;
}
function setUploadProgress(pct,text){
  const wrap=document.querySelector('#captureUploadWrap'),bar=document.querySelector('#captureProgressBar'),label=document.querySelector('#captureProgressText');
  wrap?.classList.remove('hidden'); if(bar)bar.style.width=`${Math.max(0,Math.min(100,pct))}%`;if(label)label.textContent=text;
}
function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onerror=()=>reject(new Error('No se pudo leer el archivo.'));
    r.onload=()=>{
      const raw=String(r.result||'');
      resolve(raw.includes(',')?raw.split(',').pop():raw);
    };
    r.readAsDataURL(file);
  });
}
function postToAppsScript(payload,onSubmitted){
  return new Promise((resolve,reject)=>{
    const url=window.ECT_FIREBASE_CONFIG?.appsScriptUrl||'';
    if(!appsScriptConfigured()) return reject(new Error('Falta configurar appsScriptUrl en config.js.'));
    const requestId=`ect-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const iframe=document.createElement('iframe');
    iframe.name=`ect-upload-${requestId}`;
    iframe.style.display='none';
    iframe.setAttribute('aria-hidden','true');
    const form=document.createElement('form');
    form.method='POST';form.action=url;form.target=iframe.name;form.style.display='none';
    const add=(name,value)=>{const i=document.createElement('input');i.type='hidden';i.name=name;i.value=value;form.appendChild(i)};
    add('requestId',requestId);
    add('payload',JSON.stringify({...payload,requestId}));
    let done=false;
    const cleanup=()=>{window.removeEventListener('message',listener);form.remove();setTimeout(()=>iframe.remove(),1000)};
    const timer=setTimeout(()=>{if(done)return;done=true;cleanup();reject(new Error('Google Drive tardó demasiado en responder. Probá nuevamente.'));},150000);
    const listener=(event)=>{
      const origin=String(event.origin||'');
      const trusted=origin==='https://script.google.com'||origin.endsWith('.googleusercontent.com');
      // Apps Script puede renderizar la respuesta dentro de un iframe interno de Google,
      // por lo que event.source no siempre coincide con iframe.contentWindow.
      // Validamos el origen de Google + el requestId único de esta carga.
      if(!trusted && origin!=='null')return;
      const d=event.data||{};
      if(d.source!=='ECT_APPS_SCRIPT_UPLOAD'||d.requestId!==requestId)return;
      if(done)return;done=true;clearTimeout(timer);cleanup();
      if(d.ok)resolve(d); else reject(new Error(d.error||'Google Drive rechazó la carga.'));
    };
    window.addEventListener('message',listener);
    document.body.append(iframe,form);
    form.submit();
    onSubmitted?.();
  });
}
async function uploadCaptureFiles(){
  if(!captureFiles.length) throw new Error('Primero sacá una foto o elegí archivos.');
  if(!appsScriptConfigured()) throw new Error('Falta conectar Google Drive. Pegá la URL /exec de Apps Script en config.js.');
  const btn=document.querySelector('#sendCaptureBtn');if(btn)btn.disabled=true;
  const courseId=document.querySelector('#captureCourse')?.value||'';
  const course=state.courses.find(c=>c.id===courseId);
  let completed=0;
  try{
    const idToken=await state.user.getIdToken(true);
    for(let i=0;i<captureFiles.length;i++){
      const file=captureFiles[i];
      if(file.size>15*1024*1024) throw new Error(`${file.name}: supera 15 MB. Para esta versión sin Blaze usá videos cortos o comprimidos.`);
      setUploadProgress((i/captureFiles.length)*100,`Leyendo ${i+1} de ${captureFiles.length}…`);
      const dataBase64=await fileToBase64(file);
      setUploadProgress(((i+0.25)/captureFiles.length)*100,`Enviando ${i+1} de ${captureFiles.length} a Drive…`);
      const result=await postToAppsScript({
        idToken,
        originalName:file.name,
        mimeType:file.type||'application/octet-stream',
        size:file.size,
        dataBase64,
        courseId:courseId||'',
        courseTitle:course?.title||''
      },()=>setUploadProgress(((i+0.5)/captureFiles.length)*100,`Guardando ${i+1} de ${captureFiles.length} en Drive…`));
      completed++;
      try{
        await db.collection('media_uploads').add({
          uid:state.user.uid,staff_id:state.profile.staff_id,email:state.profile.email,
          file_id:result.fileId||null,file_name:result.fileName||file.name,drive_folder:result.folderPath||'',
          drive_url:result.fileUrl||null,course_id:courseId||null,course_title:course?.title||'',mime_type:file.type,size:file.size,
          created_at:firebase.firestore.FieldValue.serverTimestamp()
        });
      }catch{}
      setUploadProgress(((i+1)/captureFiles.length)*100,`${i+1} de ${captureFiles.length} guardado${i===0?'':'s'}…`);
    }
    setUploadProgress(100,`${completed} archivo${completed===1?'':'s'} enviado${completed===1?'':'s'} a Drive.`);
    toast('Archivos enviados a Drive.');
    captureFiles=[];
    renderCaptureFiles();
    setTimeout(()=>{document.querySelector('#captureUploadWrap')?.classList.add('hidden')},1200);
  }finally{if(btn)btn.disabled=false}
}

document.addEventListener('submit',async e=>{
  if(e.target.id==='loginForm'){
    e.preventDefault();const f=new FormData(e.target),b=e.target.querySelector('button[type="submit"]');b.disabled=true;
    try{await doLogin(f.get('email'),f.get('password'))}catch(err){toast(firebaseError(err),true)}finally{b.disabled=false}
  }
  if(e.target.id==='registerForm'){
    e.preventDefault();const f=new FormData(e.target),b=e.target.querySelector('button[type="submit"]');b.disabled=true;
    try{await registerStaff({code:f.get('code'),email:f.get('email'),password:f.get('password'),password2:f.get('password2')})}catch(err){toast(firebaseError(err),true)}finally{b.disabled=false}
  }
});

document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  try{
    if(b.dataset.authMode){state.authMode=b.dataset.authMode;state.error='';render()}
    else if(b.dataset.forgot!==undefined)await forgotPassword();
    else if(b.dataset.tab){if(state.tab==='capture'){stopCaptureCamera();captureFiles=[];}state.tab=b.dataset.tab;render()}
    else if(b.dataset.captureOpen!==undefined)captureModal();
    else if(b.dataset.closeCapture!==undefined)closeCaptureModal();
    else if(b.dataset.mediaMode)setCaptureMode(b.dataset.mediaMode);
    else if(b.dataset.takePhoto!==undefined)await takeCapturePhoto();
    else if(b.dataset.toggleRecord!==undefined)toggleVideoRecord();
    else if(b.dataset.removeMedia!==undefined){captureFiles.splice(Number(b.dataset.removeMedia),1);renderCaptureFiles();}
    else if(b.dataset.sendCapture!==undefined)await uploadCaptureFiles();
    else if(b.dataset.date){state.date=b.dataset.date;render()}
    else if(b.dataset.logout!==undefined)await doLogout();
    else if(b.dataset.assign)assignModal(b.dataset.assign);
    else if(b.dataset.editCourse)editCourseModal(b.dataset.editCourse);
    else if(b.dataset.saveCourse)await saveCourseEdit(b.dataset.saveCourse);
    else if(b.dataset.assignSelf)await assignSelf(b.dataset.assignSelf);
    else if(b.dataset.toggleAdmin)await toggleAdmin(b.dataset.toggleAdmin);
    else if(b.dataset.loginTutorial!==undefined)openLoginTutorial(0);
    else if(b.dataset.appTutorial!==undefined)openAppTutorial(0);
    else if(b.dataset.tutorialNext){b.dataset.tutorialNext==='login'?openLoginTutorial(Number(b.dataset.step||0)):openAppTutorial(Number(b.dataset.step||0));}
    else if(b.dataset.tutorialSkip)finishTutorial(b.dataset.tutorialSkip,true);
    else if(b.dataset.tutorialFinish)finishTutorial(b.dataset.tutorialFinish,false);
    else if(b.dataset.close!==undefined)b.closest('.modal-bg')?.remove();
    else if(b.dataset.saveAssign)await saveAssign(b.dataset.saveAssign);
    else if(b.dataset.check)await setCheck(b.dataset.id,b.dataset.check,b.dataset.done==='1');
    else if(b.dataset.confirmCover)await confirmCoverage(b.dataset.confirmCover);
    else if(b.dataset.generateInvite)await generateInvite(b.dataset.generateInvite);
    else if(b.dataset.copyInvite)await copyInvite(b.dataset.copyInvite);
    else if(b.dataset.enableNotifications!==undefined)await setupPushToken();
  }catch(err){toast(firebaseError(err),true)}
});


document.addEventListener('change',e=>{
  if(e.target.id==='galleryInput' || e.target.id==='nativePhotoInput'){
    const files=[...e.target.files].filter(f=>f.type.startsWith('image/')||f.type.startsWith('video/')).slice(0,20);
    captureFiles=files;
    renderCaptureFiles();
  }
});

function init(){
  if(!configOK()){state.ready=true;render();return;}
  try{
    firebase.initializeApp(window.ECT_FIREBASE_CONFIG);
    auth=firebase.auth();db=firebase.firestore();
    if(firebase.messaging){try{messaging=firebase.messaging()}catch{}}
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});
    auth.onAuthStateChanged(async user=>{
      if(state.registering)return;
      if(!user){clearListeners();stopLocalAlertLoop();state.user=null;state.profile=null;state.loading=false;render();return;}
      await afterLogin(user);
    });
  }catch(e){state.error=firebaseError(e);render()}
}
init();
