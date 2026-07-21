# CRM de Leads - Alta Studio

App web estática para operar un pipeline de leads de Meta Lead Ads con foco en tiempo de respuesta.

## Uso

Para usar auto-sincronización con Google Sheets, levanta el servidor local:

```bash
python3 server.py
```

Luego abre `http://localhost:5173`.

La app incluye datos demo y ya apunta al Sheet compartido. Para conectar otro archivo:

1. Pega el link normal de Google Sheets o una URL CSV.
2. En la app, pulsa `Fuente de datos`.
3. Pega la URL CSV o el contenido CSV.
4. Importa leads.

La app revisa la fuente configurada cada 2 minutos y agrega leads nuevos sin borrar el pipeline local.

Puedes borrar contactos desde la ficha del lead. Ese borrado es local al CRM y evita que el contacto reaparezca al sincronizar; no elimina filas del Google Sheet.

La app ignora columnas técnicas de Meta y conserva el pipeline, notas, próximas acciones, razones de pérdida y transiciones en `localStorage`, sin escribir sobre el Sheet.

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
