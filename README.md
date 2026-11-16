# One Less One — Gloriana

Versión personalizada de **One Less One** basada en el código de **one-less-one-lab** (v8.4.0). Incluye Inicio, Presupuesto y Movimientos, además de las herramientas opcionales Deudas, Cobros y Metas.

## Migración automática desde Finanzas de Gloriana v1.3.1

Al abrir la aplicación, si existe el registro anterior `gloriana_finanzas_local_v1` en el **mismo origen (protocolo + dominio + puerto)** del navegador y todavía no hay actividad financiera en el nuevo almacenamiento, la aplicación:

1. Convierte períodos y presupuestos, movimientos, deudas, conciliaciones y fondos (junto con sus movimientos).
2. Transforma los registros antiguos de «Por cobrar» en Cobros, respetando su estado pagado o pendiente.
3. Valida cantidades de registros e importes totales y crea una copia independiente del JSON anterior dentro del almacenamiento del navegador.
4. Escribe y verifica la nueva información en la clave `gloriana_one_less_one_data_v2`, **sin borrar el registro anterior**.
5. Muestra un aviso de resultado dentro de la aplicación.

**No hace falta descargar ni importar un JSON manualmente si ambos enlaces comparten el mismo origen, se usa el mismo navegador y la migración termina correctamente.** Si el enlace antiguo pertenece a otro dominio, otro navegador o dispositivo, el nuevo sitio no puede acceder a sus datos locales: será necesario exportarlos del sitio anterior y restaurarlos mediante una conversión compatible.

La migración **no sobreescribe ni mezcla** registros financieros ya existentes en la versión nueva. En ese caso muestra un aviso de conflicto y conserva intactas ambas versiones para revisión.

## Respaldo y recuperación

- Datos anteriores: `gloriana_finanzas_local_v1`.
- Respaldo adicional anterior: `gloriana_one_less_one_legacy_backup_v131`.
- Almacenamiento nuevo: `gloriana_one_less_one_data_v2`.
- Respaldo del destino previo a la migración (cuando existe): `gloriana_one_less_one_before_legacy_import_v2`.
- La información vive en el navegador, no en GitHub. Borrar datos del sitio puede eliminar también estos respaldos locales: usá el botón «Respaldar» para conservar un archivo externo cuando sea necesario.

La rama `backup/pre-actualizacion-2026-11-15` conserva el código de v1.3.1.
