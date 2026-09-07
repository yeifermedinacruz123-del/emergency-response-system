/**
 * Configuracion del sistema (clave / valor).
 *
 * Los valores se guardan como texto junto con su tipo declarado, y se
 * convierten al leerlos. Asi el administrador puede editar la configuracion sin
 * tocar el archivo .env ni reiniciar el servidor.
 */

'use strict';

const { query, queryAll } = require('../database');

/** Convierte el texto guardado al tipo que declara la fila. */
function castValue(row) {
  switch (row.data_type) {
    case 'number': {
      const parsed = Number(row.value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    case 'boolean':
      return row.value === 'true';
    case 'json':
      try {
        return JSON.parse(row.value);
      } catch {
        return null;
      }
    default:
      return row.value;
  }
}

/** Todas las opciones, con el valor ya convertido. */
async function getAll() {
  const rows = await queryAll(
    `SELECT s.key, s.value, s.data_type, s.description, s.updated_at,
            u.first_name || ' ' || u.last_name AS updated_by_name
       FROM system_settings s
       LEFT JOIN users u ON u.id = s.updated_by
      ORDER BY s.key`
  );

  return rows.map((row) => ({
    key: row.key,
    value: castValue(row),
    rawValue: row.value,
    dataType: row.data_type,
    description: row.description,
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
  }));
}

/** Las opciones como un objeto plano { clave: valor }. */
async function getAsObject() {
  const settings = await getAll();
  return settings.reduce((accumulator, setting) => {
    accumulator[setting.key] = setting.value;
    return accumulator;
  }, {});
}

/**
 * Actualiza varias opciones a la vez.
 * Solo se tocan las claves que YA existen: la configuracion es un catalogo
 * cerrado, no un almacen libre donde cualquiera pueda inventar claves.
 *
 * @param {Object<string, any>} changes
 * @param {number} userId Quien hace el cambio.
 * @returns {Promise<string[]>} Claves realmente actualizadas.
 */
async function updateMany(changes, userId) {
  const updated = [];

  for (const [key, value] of Object.entries(changes)) {
    const serialised =
      typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);

    const result = await query(
      `UPDATE system_settings
          SET value = $2, updated_by = $3, updated_at = NOW()
        WHERE key = $1`,
      [key, serialised, userId]
    );

    if (result.rowCount > 0) updated.push(key);
  }

  return updated;
}

module.exports = { getAll, getAsObject, updateMany };
