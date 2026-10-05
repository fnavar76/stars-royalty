import 'dotenv/config'
import Database from 'better-sqlite3'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const source = resolve(process.env.DATABASE_FILE ?? 'starsroyalty.db')
await mkdir('backups', { recursive: true })
const target = resolve('backups', `starsroyalty-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
const db = new Database(source, { readonly: true, fileMustExist: true })
try {
  await db.backup(target)
  const copy = new Database(target, { readonly: true })
  try {
    if (copy.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('El respaldo no pasó la comprobación de integridad.')
  } finally { copy.close() }
  console.log(`Respaldo verificado: ${target}`)
} finally { db.close() }
