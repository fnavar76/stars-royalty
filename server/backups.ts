import { mkdir, readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import type { Express, Request, RequestHandler } from 'express'

export function registerBackups(app:Express,db:Database.Database,auth:RequestHandler) {
  const directory=resolve(process.env.BACKUP_DIRECTORY??'backups')
  let busy=false
  const status={lastSuccess:'',lastFile:'',lastError:'',enabled:process.env.BACKUP_ENABLED!=='false',intervalHours:24}
  const saved=db.prepare("SELECT value FROM app_meta WHERE key='backup-status'").get() as {value:string}|undefined
  if(saved)try{Object.assign(status,JSON.parse(saved.value),{enabled:process.env.BACKUP_ENABLED!=='false',intervalHours:24})}catch{/* Use an empty status if historical metadata is invalid. */}
  const saveStatus=()=>db.prepare("INSERT INTO app_meta(key,value) VALUES('backup-status',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(status))
  async function backup() {
    if(busy)throw new Error('Ya hay un respaldo en proceso.')
    busy=true
    try{
      await mkdir(directory,{recursive:true})
      const name=`auto-starsroyalty-${new Date().toISOString().replace(/[:.]/g,'-')}.db`
      const target=resolve(directory,name);await db.backup(target)
      const copy=new Database(target,{readonly:true,fileMustExist:true});try{if(copy.pragma('integrity_check',{simple:true})!=='ok')throw new Error('La copia no pasó la verificación de integridad.')}finally{copy.close()}
      status.lastSuccess=new Date().toISOString();status.lastFile=name;status.lastError='';saveStatus();return{name,verified:true}
    }catch(e){status.lastError=e instanceof Error?e.message:'Fallo al crear respaldo';saveStatus();throw e}finally{busy=false}
  }
  const admin:RequestHandler=(req:Request & {user?:{permissions:string[]}},res,next)=>{if(!req.user?.permissions.includes('admin'))return void res.status(403).json({error:'Solo administración puede gestionar respaldos.'});next()}
  app.get('/api/backups',auth,admin,async(_req,res,next)=>{try{await mkdir(directory,{recursive:true});const names=(await readdir(directory)).filter(name=>/^(auto-)?starsroyalty-[\dTZ.-]+\.db$/.test(name)).sort().reverse();const files=await Promise.all(names.slice(0,60).map(async name=>({name,bytes:(await stat(resolve(directory,name))).size})));res.json({...status,busy,files})}catch(e){next(e)}})
  app.post('/api/backups/run',auth,admin,async(_req,res)=>{try{res.status(201).json(await backup())}catch(e){res.status(busy?409:500).json({error:e instanceof Error?e.message:'No se pudo crear el respaldo.'})}})
  const tick=()=>{if(status.enabled&&!busy&&(!status.lastSuccess||Date.now()-new Date(status.lastSuccess).getTime()>=86400000))void backup().catch(()=>{})}
  if(status.enabled){const start=setTimeout(tick,60000);start.unref();const interval=setInterval(tick,3600000);interval.unref()}
}
