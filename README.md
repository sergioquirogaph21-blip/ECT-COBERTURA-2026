# Cobertura ECT 2026 — Firebase + GitHub Pages

Versión mobile-first para el Staff ECT 2026.

## Incluye

- 67 cursos ECT 2026.
- Sergio Quiroga como **Administrador principal + Staff**.
- Posibilidad de dar o quitar privilegios de **Administrador** a otros integrantes del Staff.
- Los integrantes que NO son administradores no ven la sección de administración de Staff.
- Registro de primera vez con código de invitación de un solo uso.
- Cada Staff elige su propio correo y contraseña.
- Asignación de cursos por administradores.
- Botón **Asignarme** para que un administrador pueda tomar una cobertura y verla inmediatamente en **Mis coberturas**.
- Confirmación “Voy a cubrir”, marcar inicio y marcar fin.
- Polito como tutorial guiado tanto en el primer ingreso como dentro de la app; todos los pasos se pueden omitir.
- Polito integrado visualmente sin el rectángulo blanco de fondo.
- Actualización en tiempo real con Cloud Firestore.
- Avisos locales y Firebase Cloud Messaging preparado para push.
- Función programada preparada para avisar 10 minutos antes y avisar al resto del Staff si un curso comenzó sin inicio marcado.
- Frontend listo para GitHub Pages.

## Archivos principales

- `index.html`
- `app.js`
- `styles.css`
- `config.js`
- `data.js`
- `firebase-messaging-sw.js`
- `firestore.rules.txt`
- `FUNCIONES_FIREBASE.zip`
- `GUIA_CONFIGURACION_FINAL.txt`
- `GUIA_NOTIFICACIONES_PUSH.txt`

## Importante al actualizar esta versión

1. Subí los archivos nuevos a GitHub.
2. **Volvé a publicar `firestore.rules.txt` en Firebase**, porque ahora las reglas admiten varios administradores.
3. Entrá una vez como Sergio para que se mantenga como administrador principal.

Las notificaciones push automáticas con la app cerrada siguen requiriendo Cloud Functions + plan Blaze.

Desarrollado por **Sergio Quiroga**.

- Los administradores pueden editar nombre, fecha, horario y aula/lugar de cada curso directamente desde la agenda.
