import type { Express, Request, RequestHandler } from 'express'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { idempotency } from './idempotency.js'

type UserRequest=Request & {user?:{id:number;permissions:string[]}}
export function registerWardrobe(app:Express,db:Database.Database,auth:RequestHandler) {
  const columns=new Set((db.prepare('PRAGMA table_info(wardrobe_assignments)').all() as {name:string}[]).map(c=>c.name))
  for(const [name,type] of Object.entries({expected_on:'TEXT',supplier:'TEXT',order_reference:'TEXT',notes:'TEXT',payment_id:'INTEGER REFERENCES payments(id)'})) {
    if(!columns.has(name)) db.exec(`ALTER TABLE wardrobe_assignments ADD COLUMN ${name} ${type}`)
  }
  db.exec('CREATE INDEX IF NOT EXISTS wardrobe_due ON wardrobe_assignments(status,expected_on)')
  const permit:RequestHandler=(req:UserRequest,res,next)=>{if(!req.user?.permissions.includes('coaching'))return void res.status(403).json({error:'No tienes acceso a vestuario.'});next()}
  app.get('/api/wardrobe-tracking',auth,permit,(req:UserRequest,res)=>{
    const parsed=z.object({page:z.coerce.number().int().min(1).default(1),size:z.coerce.number().int().min(1).max(100).default(20),q:z.string().max(120).default(''),status:z.enum(['all','pending','delivered','returned','late']).default('all')}).safeParse(req.query)
    if(!parsed.success)return void res.status(400).json({error:'Filtros inválidos.'})
    const {page,size,q,status}=parsed.data
    const pattern=`%${q.trim().replace(/[!%_]/g,'!$&')}%`
    const where="WHERE (a.name LIKE ? ESCAPE '!' OR w.garment LIKE ? ESCAPE '!' OR COALESCE(w.order_reference,'') LIKE ? ESCAPE '!') AND (?='all' OR w.status=? OR (?='late' AND w.status='pending' AND w.expected_on<CURRENT_DATE))"
    const params=[pattern,pattern,pattern,status,status,status]
    const total=(db.prepare(`SELECT COUNT(*) n FROM wardrobe_assignments w JOIN athletes a ON a.id=w.athlete_id ${where}`).get(...params) as {n:number}).n
    const finance=req.user!.permissions.includes('finance')
    const rows=db.prepare(`SELECT w.*,a.name AS athlete,t.name AS team FROM wardrobe_assignments w JOIN athletes a ON a.id=w.athlete_id LEFT JOIN teams t ON t.id=w.team_id ${where} ORDER BY CASE WHEN w.status='pending' THEN 0 ELSE 1 END,w.expected_on IS NULL,w.expected_on,w.id DESC LIMIT ? OFFSET ?`).all(...params,size,(page-1)*size) as Record<string,unknown>[]
    for(const row of rows) {
      if(finance&&row.payment_id)row.charge=db.prepare('SELECT id,amount,status FROM payments WHERE id=?').get(row.payment_id)
      if(!finance)delete row.payment_id
    }
    const stats=db.prepare("SELECT COUNT(*) AS total,SUM(status='pending') AS pending,SUM(status='delivered') AS delivered,SUM(status='pending' AND expected_on<CURRENT_DATE) AS late FROM wardrobe_assignments").get()
    res.json({rows,total,page,size,stats})
  })
  app.patch('/api/wardrobe-tracking/:id',auth,permit,idempotency(db),(req:UserRequest,res)=>{
    const p=z.object({expectedOn:z.string().date().nullable(),supplier:z.string().trim().max(120),orderReference:z.string().trim().max(120),notes:z.string().trim().max(2000)}).safeParse(req.body)
    if(!p.success)return void res.status(400).json({error:'Revisa fecha, proveedor, referencia y notas.'})
    const id=Number(req.params.id)
    if(!db.prepare('SELECT id FROM wardrobe_assignments WHERE id=?').get(id))return void res.status(404).json({error:'Asignación no encontrada.'})
    db.transaction(()=>{db.prepare('UPDATE wardrobe_assignments SET expected_on=?,supplier=?,order_reference=?,notes=? WHERE id=?').run(p.data.expectedOn,p.data.supplier,p.data.orderReference,p.data.notes,id);db.prepare("INSERT INTO audit_logs(user_id,action,entity,entity_id,metadata) VALUES(?,'tracking','wardrobe_assignments',?,?)").run(req.user!.id,id,JSON.stringify(p.data))})()
    res.json({ok:true})
  })
}
