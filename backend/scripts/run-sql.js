#!/usr/bin/env node
/**
 * Ejecuta un archivo .sql contra la base de datos del sistema.
 *
 * Se usa en lugar de "psql -f" porque la distribucion de PostgreSQL que trae
 * embedded-postgres NO incluye el cliente psql. Enviando el archivo completo
 * por el driver "pg" se obtiene el mismo resultado y funciona igual con
 * PostgreSQL instalado, con Docker o con la version embebida.
 *
 * Uso:
 *   node scripts/run-sql.js ../database/schema.sql
 *   npm run db:schema
 *   npm run db:seed
 *
 * La ruta puede ser relativa a backend/ o absoluta.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const { config } = require('../src/config/env');

/** Imprime un error legible y termina con codigo 1. */
function fail(message) {
  console.error(`\n  ERROR: ${message}\n`);
  process.exit(1);
}

async function main() {
  const argument = process.argv[2];
  if (!argument) {
    fail('Falta la ruta del archivo .sql\n  Ejemplo: node scripts/run-sql.js ../database/schema.sql');
  }

  const filePath = path.resolve(__dirname, '..', argument);
  if (!fs.existsSync(filePath)) {
    fail(`No existe el archivo:\n    ${filePath}`);
  }

  const sql = fs.readFileSync(filePath, 'utf8').trim();
  if (!sql) fail(`El archivo esta vacio:\n    ${filePath}`);

  const client = new Client({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.name,
    // Igual que el pool de la aplicacion (config/database.js): las bases
    // alojadas (Render, Railway, Neon) rechazan la conexion sin SSL, y sus
    // certificados no los firma una autoridad que Node reconozca por defecto.
    ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
  });

  console.log('');
  console.log(`  Archivo : ${path.basename(filePath)}`);
  console.log(`  Destino : ${config.database.host}:${config.database.port}/${config.database.name}`);

  try {
    await client.connect();
  } catch (error) {
    fail(
      `No se pudo conectar con PostgreSQL: ${error.message}\n` +
        '  Arrancalo con:  npm run db:up'
    );
  }

  const startedAt = Date.now();

  try {
    /*
     * Se envia el archivo completo en una sola llamada: el protocolo simple de
     * PostgreSQL admite varias sentencias y las ejecuta dentro de una
     * transaccion implicita, asi que un error a mitad de camino no deja el
     * esquema a medias. Ademas el servidor interpreta correctamente los
     * cuerpos de funcion delimitados con $$, que un separador por ";" del
     * lado de Node partiria mal.
     */
    await client.query(sql);

    const seconds = ((Date.now() - startedAt) / 1000).toFixed(2);
    console.log(`  Estado  : ejecutado correctamente en ${seconds} s`);
    console.log('');
  } catch (error) {
    console.error('');
    console.error(`  ERROR SQL: ${error.message}`);
    if (error.position) {
      // PostgreSQL indica la posicion del caracter: se traduce a linea.
      const upToError = sql.slice(0, Number.parseInt(error.position, 10));
      const line = upToError.split('\n').length;
      console.error(`  Linea aproximada: ${line} de ${path.basename(filePath)}`);
    }
    if (error.detail) console.error(`  Detalle: ${error.detail}`);
    if (error.hint) console.error(`  Sugerencia: ${error.hint}`);
    console.error('');
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => fail(error.message));
