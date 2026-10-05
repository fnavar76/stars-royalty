import type { Express, Request, RequestHandler } from 'express'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { idempotency } from './idempotency.js'
type UserRequest=Request & {user?:{id:number;permissions:string[]}}
export function registerCommercial(app:Express,db:Database.Database,auth:RequestHandler) {
  db.exec(`CREATE TABLE IF NOT EXISTS suppliers(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,contact TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS purchase_orders(id INTEGER PRIMARY KEY,supplier_id INTEGER NOT NULL REFERENCES suppliers(id),reference TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS purchase_lines(id INTEGER PRIMARY KEY,purchase_id INTEGER NOT NULL REFERENCES purchase_orders(id),product_id INTEGER NOT NULL REFERENCES products(id),quantity INTEGER NOT NULL,received INTEGER NOT NULL DEFAULT 0,cost_cents INTEGER NOT NULL,UNIQUE(purchase_id,product_id));
    CREATE TABLE IF NOT EXISTS document_requirements(id INTEGER PRIMARY KEY,doc_type TEXT NOT NULL,label TEXT NOT NULL,category_id INTEGER REFERENCES categories(id),active INTEGER NOT NULL DEFAULT 1);
  `)
  const permit=(scope:string):RequestHandler=>(req:UserRequest,res,next)=>{if(!req.user?.permissions.includes(scope))return void res.status(403).json({error:'No tienes permiso para esta función.'});next()}
  const remember=idempotency(db)
  const audit=(req:UserRequest,action:string,entity:string,id:number)=>db.prepare('INSERT INTO audit_logs(user_id,action,entity,entity_id) VALUES(?,?,?,?)').run(req.user!.id,action,entity,id)
  app.get('/api/suppliers',auth,permit('inventory'),(_req,res)=>res.json(db.prepare('SELECT * FROM suppliers ORDER BY name').all()))
  app.post('/api/suppliers',auth,permit('inventory'),remember,(req:UserRequest,res)=>{const p=z.object({name:z.string().trim().min(2).max(120),contact:z.string().max(180).default('')}).safeParse(req.body);if(!p.success)return void res.status(400).json({error:'Indica el nombre del proveedor.'});const r=db.prepare('INSERT INTO suppliers(name,contact) VALUES(?,?)').run(p.data.name,p.data.contact);audit(req,'create','suppliers',Number(r.lastInsertRowid));res.status(201).json({id:Number(r.lastInsertRowid)})})
  app.get('/api/purchases',auth,permit('inventory'),(_req,res)=>res.json(db.prepare('SELECT purchase_orders.*,suppliers.name AS supplier FROM purchase_orders JOIN suppliers ON suppliers.id=supplier_id ORDER BY purchase_orders.id DESC').all().map(row=>{const r=row as {id:number};return {...r,lines:db.prepare('SELECT purchase_lines.*,products.name AS product,products.sku FROM purchase_lines JOIN products ON products.id=product_id WHERE purchase_id=?').all(r.id)}})))
  app.post('/api/purchases',auth,permit('inventory'),remember,(req:UserRequest,res)=>{
    const p=z.object({supplierId:z.number().int().positive(),reference:z.string().trim().min(2).max(120),lines:z.array(z.object({productId:z.number().int().positive(),quantity:z.number().int().positive().max(100000),cost:z.number().nonnegative().max(1000000)})).min(1).max(100)}).safeParse(req.body)
    if(!p.success||new Set(p.data.lines.map(l=>l.productId)).size!==p.data.lines.length)return void res.status(400).json({error:'Revisa proveedor, referencia y productos sin repetir.'})
    const id=db.transaction(()=>{const id=Number(db.prepare('INSERT INTO purchase_orders(supplier_id,reference) VALUES(?,?)').run(p.data.supplierId,p.data.reference).lastInsertRowid);for(const l of p.data.lines)db.prepare('INSERT INTO purchase_lines(purchase_id,product_id,quantity,cost_cents) VALUES(?,?,?,?)').run(id,l.productId,l.quantity,Math.round(l.cost*100));audit(req,'create','purchase_orders',id);return id})();res.status(201).json({id})
  })
  app.post('/api/purchase-lines/:id/receive',auth,permit('inventory'),remember,(req:UserRequest,res)=>{
    const p=z.object({quantity:z.number().int().positive()}).safeParse(req.body);if(!p.success)return void res.status(400).json({error:'Indica cuántas unidades recibiste.'})
    const line=db.prepare('SELECT * FROM purchase_lines WHERE id=?').get(Number(req.params.id)) as {id:number;purchase_id:number;product_id:number;quantity:number;received:number;cost_cents:number}|undefined
    if(!line)return void res.status(404).json({error:'Partida no encontrada.'})
    if(p.data.quantity>line.quantity-line.received)return void res.status(409).json({error:'La recepción supera las unidades pendientes.'})
    db.transaction(()=>{db.prepare('UPDATE purchase_lines SET received=received+? WHERE id=?').run(p.data.quantity,line.id);db.prepare('UPDATE products SET stock=stock+?,cost=? WHERE id=?').run(p.data.quantity,line.cost_cents/100,line.product_id);db.prepare("INSERT INTO inventory_movements(product_id,kind,quantity,reason) VALUES(?,'entry',?,?)").run(line.product_id,p.data.quantity,`Recepción de compra #${line.purchase_id}`);if(!(db.prepare('SELECT COUNT(*) n FROM purchase_lines WHERE purchase_id=? AND received<quantity').get(line.purchase_id) as {n:number}).n)db.prepare("UPDATE purchase_orders SET status='received' WHERE id=?").run(line.purchase_id);audit(req,'receive','purchase_lines',line.id)})();res.json({ok:true})
  })
  app.get('/api/analytics',auth,permit('finance'),(req,res)=>{
    const p=z.object({from:z.string().date(),to:z.string().date()}).safeParse(req.query);if(!p.success||p.data.from>p.data.to)return void res.status(400).json({error:'Selecciona un intervalo de fechas válido.'})
    const {from,to}=p.data
    const income=(db.prepare("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE status='paid' AND date(paid_at) BETWEEN ? AND ?").get(from,to) as {n:number}).n
    const expenses=(db.prepare('SELECT COALESCE(SUM(amount),0) n FROM expenses WHERE incurred_on BETWEEN ? AND ?').get(from,to) as {n:number}).n
    const concepts=db.prepare("SELECT concept,COUNT(*) AS count,SUM(amount) AS amount FROM payments WHERE status='paid' AND date(paid_at) BETWEEN ? AND ? GROUP BY concept ORDER BY amount DESC LIMIT 100").all(from,to)
    const aging=db.prepare("SELECT CASE WHEN due_date IS NULL OR due_date>=CURRENT_DATE THEN 'Al corriente' WHEN julianday('now')-julianday(due_date)<=30 THEN '1–30 días' WHEN julianday('now')-julianday(due_date)<=60 THEN '31–60 días' ELSE 'Más de 60 días' END AS bucket,SUM(amount) AS amount,COUNT(*) AS count FROM payments WHERE status IN ('pending','overdue') GROUP BY bucket").all()
    const enrollments=(db.prepare('SELECT COUNT(*) n FROM athletes WHERE date(created_at) BETWEEN ? AND ?').get(from,to) as {n:number}).n
    res.json({from,to,income,expenses,net:income-expenses,concepts,aging,enrollments})
  })
  app.get('/api/document-requirements',auth,permit('coaching'),(_req,res)=>res.json(db.prepare('SELECT document_requirements.*,categories.name AS category FROM document_requirements LEFT JOIN categories ON categories.id=category_id WHERE document_requirements.active=1 ORDER BY label').all()))
  app.post('/api/document-requirements',auth,permit('sportsLead'),remember,(req:UserRequest,res)=>{
    const p=z.object({docType:z.string().trim().regex(/^[a-z_]{2,60}$/),label:z.string().trim().min(2).max(120),categoryId:z.number().int().positive().nullable().default(null)}).safeParse(req.body);if(!p.success)return void res.status(400).json({error:'Indica tipo (letras minúsculas y guiones bajos), nombre y categoría.'})
    const r=db.prepare('INSERT INTO document_requirements(doc_type,label,category_id) VALUES(?,?,?)').run(p.data.docType,p.data.label,p.data.categoryId);audit(req,'create','document_requirements',Number(r.lastInsertRowid));res.status(201).json({id:Number(r.lastInsertRowid)})
  })
  app.get('/api/document-checklist/:athleteId',auth,(req:UserRequest,res)=>{
    const id=Number(req.params.athleteId);const athlete=db.prepare('SELECT guardian_id,category_id FROM athletes WHERE id=?').get(id) as {guardian_id:number|null;category_id:number|null}|undefined
    const gid=(db.prepare('SELECT guardian_id FROM users WHERE id=?').get(req.user!.id) as {guardian_id:number|null}).guardian_id
    if(!athlete||(!req.user!.permissions.includes('documents')&&(!gid||gid!==athlete.guardian_id)))return void res.status(404).json({error:'Expediente no disponible.'})
    res.json(db.prepare("SELECT r.id,r.label,r.doc_type,EXISTS(SELECT 1 FROM documents d WHERE d.athlete_id=? AND d.doc_type=r.doc_type AND d.file_data IS NOT NULL AND (d.expires_at IS NULL OR d.expires_at>=CURRENT_DATE)) AS complete FROM document_requirements r WHERE r.active=1 AND (r.category_id IS NULL OR r.category_id=?) ORDER BY r.label").all(id,athlete.category_id))
  })
  app.get('/api/search',auth,permit('staff'),(req:UserRequest,res)=>{
    const q=typeof req.query.q==='string'?req.query.q.trim().slice(0,100):'';if(q.length<2)return void res.json([])
    const pattern=`%${q.replace(/[!%_]/g,'!$&')}%`;const rows:{id:number;title:string;detail:string;module:string}[]=[]
    if(req.user!.permissions.includes('coaching')){
      rows.push(...(db.prepare("SELECT athletes.id,athletes.name AS title,COALESCE(guardians.name,'Sin tutor') AS detail,'Atletas' AS module FROM athletes LEFT JOIN guardians ON guardians.id=guardian_id WHERE athletes.name LIKE ? ESCAPE '!' OR guardians.name LIKE ? ESCAPE '!' LIMIT 8").all(pattern,pattern) as typeof rows))
      rows.push(...(db.prepare("SELECT id,name AS title,'Equipo' AS detail,'Equipos' AS module FROM teams WHERE name LIKE ? ESCAPE '!' LIMIT 5").all(pattern) as typeof rows))
    }
    if(req.user!.permissions.includes('finance'))rows.push(...(db.prepare("SELECT id,concept AS title,'Cargo #'||id AS detail,'Cobranza' AS module FROM payments WHERE concept LIKE ? ESCAPE '!' LIMIT 5").all(pattern) as typeof rows))
    rows.push(...(db.prepare("SELECT credentials.id,code AS title,COALESCE(athletes.name,'Credencial de personal') AS detail,'Credenciales' AS module FROM credentials LEFT JOIN athletes ON athletes.id=athlete_id WHERE code LIKE ? ESCAPE '!' LIMIT 5").all(pattern) as typeof rows))
    res.json(rows)
  })
}
