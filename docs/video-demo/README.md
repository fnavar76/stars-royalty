# Video demo — Stars Royalty

## Presentación animada

`Stars-Royalty-Demo.mp4`: presentación ilustrativa en 1920 × 1080, 24 fps, H.264 y audio AAC. Incluye narración sintética en español de México y una pista opcional de subtítulos en español. Los tiempos de los subtítulos son aproximados por oración.

Basada en `../guion-demo-video.md`. Utiliza el logotipo del proyecto y ocho capítulos. Es una presentación del alcance descrito en el guion; no constituye una grabación ni una validación funcional de la aplicación.

- `Stars-Royalty-Demo.srt`: subtítulos externos.
- `vista-previa.jpg`: vista de los ocho capítulos.
- `capitulos.json`: tiempos de inicio.
- `assets/`: narraciones, imágenes y clips intermedios.

## Reproducción y regeneración

Abrir el MP4 en un reproductor compatible. Activar la pista de subtítulos en español si se desea.

Herramientas Python locales: `pillow`, `imageio-ffmpeg` y `edge-tts`, instaladas en `.demo-tools` en la raíz del proyecto. La generación de voz requiere conexión a Internet; el renderizado utiliza las voces descargadas.

```powershell
python docs/video-demo/generar.py --voice
python docs/video-demo/generar.py
```

## Recorrido de la aplicación

`Stars-Royalty-Recorrido-App.mp4`: recorrido editado de aproximadamente 3:19 minutos, realizado con capturas reales de la aplicación abierta en Chrome, narración en español y subtítulos opcionales. Es un montaje de pantallas capturadas durante la navegación, no una grabación continua del cursor ni una prueba de todas las operaciones CRUD.

Se recorrieron Resumen, Atletas y expediente de prueba, Categorías, Equipos, Asistencia, Rendimiento, Calendario, Competencias, Cobranza y flujo de efectivo, Inventario, Vestuario, Credenciales, Reportes y Configuración. El portal familiar se capturó iniciando sesión con la cuenta de prueba Tutor. Al terminar se restauró la cuenta de prueba Admin. No se guardaron cambios en registros deportivos o financieros.

- `recorrido/`: capturas originales de la interfaz.
- `capitulos-recorrido.json`: tiempos y capturas utilizadas.
- `vista-previa-recorrido.jpg`: vista de los ocho capítulos.
- `generar-recorrido.py`: edición reproducible con las narraciones existentes.
- `ver-videos.html`: reproductor local para ambas versiones.

```powershell
python docs/video-demo/generar-recorrido.py
```

El guion narrado es el previamente aprobado y describe el alcance de la plataforma; las capturas muestran su estado al 28 de septiembre de 2026. La exportación comprueba la decodificación completa de imagen y audio mediante FFmpeg.
