import Database from 'better-sqlite3'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
const source=process.argv[2]
if(!source)throw new Error('Indica la ruta de un respaldo: npm.cmd run restore:check -- backups/archivo.db')
await mkdir('.review',{recursive:true})
const target=resolve('.review',`restore-check-${Date.now()}.db`)
const backup=new Database(resolve(source),{readonly:true,fileMustExist:true})
try{await backup.backup(target)}finally{backup.close()}
const restored=new Database(target,{readonly:true})
try{
  if(restored.pragma('integrity_check',{simple:true})!=='ok')throw new Error('La copia restaurada no pasó integridad.')
  if(restored.pragma('foreign_key_check').length)throw new Error('La copia restaurada tiene referencias inválidas.')
  console.log(JSON.stringify({restoredCopy:target,integrity:'ok',athletes:restored.prepare('SELECT COUNT(*) n FROM athletes').get().n,payments:restored.prepare('SELECT COUNT(*) n FROM payments').get().n},null,2))
}finally{restored.close()}
