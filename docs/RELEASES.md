# Publicacion segura

`npm` y `package-lock.json` son la fuente unica de dependencias del proyecto.

1. Probar el cambio en una computadora piloto con el artefacto generado por la accion `Windows build and release`.
2. Cambiar `version` en `package.json` y ejecutar `npm install --package-lock-only`.
3. Confirmar que `npm run lint`, `npm run release:validate` y `npm run electron:build` terminan correctamente.
4. Crear el tag sobre el mismo commit: `git tag vX.Y.Z`.
5. Subir commit y tag. GitHub Actions valida que tag, paquete y artefactos coincidan; además prueba instalación, actualización, arranque y desinstalación antes de publicar.

`npm run electron:publish` queda disponible como contingencia, pero se negara a publicar si hay cambios sin commit o si `HEAD` no tiene exactamente el tag `vX.Y.Z` correspondiente.

La edición portable no se actualiza automáticamente. Para usuarios normales se debe distribuir el instalador `Setup`; la portable queda reservada para diagnóstico o uso temporal.

Los binarios permanecen sin firma digital hasta que exista presupuesto para un certificado. No se configuro ninguna clave, certificado ni servicio de firma. `signAndEditExecutable` permanece desactivado porque la herramienta auxiliar de Electron Builder requiere privilegios adicionales en el entorno actual y no produciria una firma valida sin certificado.
