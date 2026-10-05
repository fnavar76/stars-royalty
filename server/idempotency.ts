import { createHash } from 'node:crypto'
import type { RequestHandler, Request } from 'express'
import type Database from 'better-sqlite3'

/** Install after authentication and authorization, before a synchronous SQLite mutation. */
export function idempotency(db:Database.Database):RequestHandler {
  db.exec('CREATE TABLE IF NOT EXISTS request_results (user_id INTEGER NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, status INTEGER NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,request_key))')
  return (req:Request & {user?:{id:number}},res,next)=>{
    const key=req.header('Idempotency-Key')
    if(!key)return next()
    if(!/^[a-zA-Z0-9-]{16,100}$/.test(key))return void res.status(400).json({error:'Identificador de operación inválido.'})
    const userId=req.user?.id
    if(!userId)return void res.status(401).json({error:'Autenticación requerida.'})
    const fingerprint=createHash('sha256').update(`${req.method}:${req.originalUrl}:${JSON.stringify(req.body)}`).digest('hex')
    const previous=db.prepare('SELECT * FROM request_results WHERE user_id=? AND request_key=?').get(userId,key) as {fingerprint:string;status:number;response:string}|undefined
    if(previous){if(previous.fingerprint!==fingerprint)return void res.status(409).json({error:'La operación ya fue utilizada con otros datos.'});res.setHeader('Idempotency-Replayed','true');return void res.status(previous.status).json(JSON.parse(previous.response))}
    const send=res.json.bind(res)
    let payload:unknown;let captured=false
    res.json=((body:unknown)=>{payload=body;captured=true;return res}) as typeof res.json
    const rollback=Symbol('rollback')
    try {
      db.transaction(()=>{
        next()
        if(!captured)throw new Error('La operación no produjo una respuesta síncrona.')
        if(res.statusCode>=400)throw rollback
        db.prepare('INSERT INTO request_results(user_id,request_key,fingerprint,status,response) VALUES(?,?,?,?,?)').run(userId,key,fingerprint,res.statusCode,JSON.stringify(payload))
      })()
    } catch(error) {
      if(error!==rollback){res.json=send;return next(error)}
    }
    res.json=send
    send(payload)
  }
}
