# Cobertura ECT 2026 — Firebase + GitHub Pages + Google Drive sin Blaze

Versión mobile-first para el Staff ECT 2026.

## Incluye

- 67 cursos ECT 2026.
- Sergio Quiroga como **Administrador principal + Staff**.
- Administradores adicionales configurables desde la app.
- Registro inicial del Staff mediante código de invitación.
- Asignación, autoasignación, confirmación, inicio y fin de cobertura.
- Edición de nombre, fecha, horario y aula/lugar de cursos por administradores.
- Tutoriales con Polito.
- Firebase Authentication + Cloud Firestore.
- Botón **+** fijo estilo TikTok.
- Foto completa a máxima resolución disponible, video corto y carga original desde galería.
- Google Drive organizado automáticamente por día y Staff.
- **Google Apps Script para Drive: no requiere Blaze, Cloud Functions ni Secret Manager.**
- Frontend listo para GitHub Pages.

## Drive

Configuración completa en `GUIA_CAMARA_DRIVE.txt`.
El código que tenés que pegar en Google Apps Script está en `GOOGLE_APPS_SCRIPT_Code.gs`.

La estructura creada es:

`ECT COBERTURA 2026 / Día + fecha / Nombre del Staff / archivo`

Al crearse un día se crean también las carpetas de los 11 integrantes del Staff.

### Límite del modo sin Blaze

Máximo **15 MB por archivo** y grabación integrada de hasta **20 segundos**. Es excelente para fotos y clips cortos; no está pensado para videos largos.

## GitHub Pages

Todos los archivos web están en la raíz para poder subirlos directamente al repositorio.
Después de desplegar Apps Script, pegá su URL `/exec` en `config.js` y subí el cambio a GitHub.

## Notificaciones

Los avisos locales con la app abierta siguen funcionando. La automatización push con la app cerrada mediante Cloud Functions sigue siendo opcional y requiere Blaze.

Desarrollado por **Sergio Quiroga**.


## Nombres automáticos en Drive
Los archivos se renombran al guardarse dentro de la carpeta del Staff/día:
- `IMG_0001-Nombre-del-curso.jpg`
- `IMG_0002-Nombre-del-curso.jpg`
- `VID_0003-Nombre-del-curso.webm`

La numeración continúa automáticamente según los archivos ya guardados en esa carpeta. Para aplicar este cambio, actualizá `Code.gs` en Apps Script y creá una nueva versión de la implementación web.
