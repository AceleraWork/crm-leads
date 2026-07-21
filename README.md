# CRM de Leads - Alta Studio

App web estática para operar un pipeline de leads de Meta Lead Ads con foco en tiempo de respuesta.

## Uso

Para usar auto-sincronización con Google Sheets, levanta el servidor local:

```bash
python3 server.py
```

Luego abre `http://localhost:5173`.

La app incluye datos demo y por defecto se conecta al Google Apps Script Web App del Sheet
compartido del equipo (`DEFAULT_SOURCE_URL` en `app.js`), que sirve como base de datos común:
cualquiera que abra la app sin configurar nada ve y actualiza los mismos leads. Para conectar
otro archivo:

1. Pega el link normal de Google Sheets o una URL CSV.
2. En la app, pulsa `Fuente de datos`.
3. Pega la URL CSV o el contenido CSV.
4. Importa leads.

La app revisa la fuente configurada cada 2 minutos y agrega leads nuevos sin borrar el pipeline local.

### Conectar un Sheet privado con lectura y escritura de estado

Para Sheets que no son públicos, o cuando además de leer leads se necesita que el CRM escriba
de vuelta la etapa del pipeline en una columna `estado_crm`, se usa un Google Apps Script Web App
en vez del link normal del Sheet:

1. En el Sheet, abre `Extensiones` → `Apps Script`.
2. Pega el contenido de [`apps-script/Code.gs`](./apps-script/Code.gs).
3. `Implementar` → `Nueva implementación` → tipo `Aplicación web`, `Ejecutar como: Yo`,
   `Quién tiene acceso: Cualquier usuario`.
4. Copia la URL que termina en `/exec` y pégala en `Fuente de datos` del CRM en vez del link del Sheet.
5. Cuando se cambia la etapa de un lead en el CRM, se hace un `POST` automático a esa URL que
   escribe el nombre de la etapa en la columna `estado_crm` de la fila con ese `id` (la crea si no existe).
6. En cada sincronización (cada 2 min), si el Sheet tiene un `estado_crm` distinto al que el CRM
   tiene guardado localmente para un lead ya existente, se actualiza la etapa local con el valor
   del Sheet. Así el pipeline queda igual para cualquiera que abra la página, con el Sheet como
   fuente de verdad para la etapa (notas, próxima acción y motivo de pérdida siguen siendo solo
   locales, no se escriben en el Sheet).
7. Si el CRM que traía los leads inserta filas nuevas arriba del encabezado (por ejemplo, la
   integración nativa de CRM de Meta Ads Manager), `Code.gs` detecta y corrige la posición del
   encabezado automáticamente en cada `doGet`/`doPost`, así que no es necesario fijarlo a mano.

Si luego editas `Code.gs`, debes volver a implementar la misma implementación (`Gestionar
implementaciones` → editar → `Nueva versión` → `Implementar`) para que los cambios tomen efecto
en la misma URL.

Puedes borrar contactos desde la ficha del lead. Ese borrado es local al CRM y evita que el contacto reaparezca al sincronizar; no elimina filas del Google Sheet.

La app ignora columnas técnicas de Meta y conserva notas, próximas acciones, razones de pérdida
y transiciones en `localStorage`, sin escribir sobre el Sheet. La etapa del pipeline sí se
sincroniza con la columna `estado_crm` cuando la fuente es un Apps Script Web App (ver arriba).

Etapas del pipeline: `Nuevo`, `Contactado`, `No respondió`, `MQL`, `Cita agendada`, `Show`, `Persona interesada`, `Cliente`, `Perdido`.

En `No respondió`, cada lead permite marcar intentos: `Contactado 1 vez`, `Contactado 2 veces` o `Contactado 3 veces`.

## Campos esperados

- `id`
- `created_time`
- `ad_name`
- `adset_name`
- `campaign_name`
- `cuál_describe_mejor_tu_situación_actual?`
- `cuál_es_tu_principal_objetivo_al_aprender_ia?`
- `full_name`
- `número_de_whatsapp`

No se requiere email.
