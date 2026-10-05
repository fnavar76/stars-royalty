import type Database from 'better-sqlite3'
import type { Express, Request, RequestHandler } from 'express'
import { z } from 'zod'
import { idempotency } from './idempotency.js'
type UserRequest=Request & {user?:{id:number;permissions:string[]}}

// Payments remains the compatibility projection used by existing reports.
// These tables preserve original charges, receipts and compensating reversals.
export function registerLedger(app:Express,db:Database.Database,auth:RequestHandler) {
  if(!(db.prepare('PRAGMA table_info(payments)').all() as {name:string}[]).some(c=>c.name==='ledger_parent_id'))db.exec('ALTER TABLE payments ADD COLUMN ledger_parent_id INTEGER REFERENCES payments(id)')
  db.exec(`CREATE TABLE IF NOT EXISTS ledger_charges(id INTEGER PRIMARY KEY,payment_id INTEGER NOT NULL UNIQUE REFERENCES payments(id),original_cents INTEGER NOT NULL CHECK(original_cents>=0),origin TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS ledger_receipts(id INTEGER PRIMARY KEY,legacy_payment_id INTEGER NOT NULL REFERENCES payments(id),amount_cents INTEGER NOT NULL CHECK(amount_cents>0),method TEXT,received_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS ledger_applications(id INTEGER PRIMARY KEY,charge_id INTEGER NOT NULL REFERENCES ledger_charges(id),receipt_id INTEGER NOT NULL UNIQUE REFERENCES ledger_receipts(id),amount_cents INTEGER NOT NULL CHECK(amount_cents>0));
    CREATE TABLE IF NOT EXISTS ledger_reversals(id INTEGER PRIMARY KEY,receipt_id INTEGER NOT NULL UNIQUE REFERENCES ledger_receipts(id),reason TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS ledger_charge_applications ON ledger_applications(charge_id);
  `)
  if(!db.prepare("SELECT 1 FROM app_meta WHERE key='ledger-v1'").get())db.transaction(()=>{
    // Only explicit historical audit links are used; concept text is not proof.
    const logs=db.prepare("SELECT entity_id,metadata FROM audit_logs WHERE entity='payments' AND action='installment' ORDER BY id").all() as {entity_id:number;metadata:string}[]
    for(const log of logs) {
      try {const metadata=JSON.parse(log.metadata);if(Number.isInteger(metadata.paymentId)&&metadata.paymentId!==log.entity_id&&db.prepare('SELECT 1 FROM payments WHERE id=?').get(log.entity_id))db.prepare('UPDATE payments SET ledger_parent_id=? WHERE id=? AND athlete_id IS (SELECT athlete_id FROM payments WHERE id=?)').run(log.entity_id,metadata.paymentId,log.entity_id)} catch { /* Unlinked legacy records remain explicitly independent snapshots. */ }
    }
    db.exec(`INSERT INTO ledger_charges(payment_id,original_cents,origin)
      SELECT p.id,CAST(ROUND(p.amount*100) AS INTEGER)+COALESCE((SELECT SUM(CAST(ROUND(r.amount*100) AS INTEGER)) FROM payments r WHERE r.ledger_parent_id=p.id),0),'legacy-snapshot' FROM payments p WHERE p.ledger_parent_id IS NULL;
      INSERT INTO ledger_receipts(legacy_payment_id,amount_cents,method,received_at) SELECT id,CAST(ROUND(amount*100) AS INTEGER),payment_method,COALESCE(paid_at,CURRENT_TIMESTAMP) FROM payments WHERE status='paid' AND amount>0;
      INSERT INTO ledger_applications(charge_id,receipt_id,amount_cents) SELECT c.id,r.id,r.amount_cents FROM ledger_receipts r JOIN payments p ON p.id=r.legacy_payment_id JOIN ledger_charges c ON c.payment_id=COALESCE(p.ledger_parent_id,p.id);
      INSERT INTO app_meta(key,value) VALUES('ledger-v1','1');`)
  })()
  db.exec(`CREATE TRIGGER IF NOT EXISTS ledger_insert_charge AFTER INSERT ON payments WHEN NEW.ledger_parent_id IS NULL AND NOT EXISTS(SELECT 1 FROM app_meta WHERE key='ledger-projection') BEGIN
      INSERT OR IGNORE INTO ledger_charges(payment_id,original_cents,origin) VALUES(NEW.id,CAST(ROUND(NEW.amount*100) AS INTEGER),'native'); END;
    CREATE TRIGGER IF NOT EXISTS ledger_insert_receipt AFTER INSERT ON payments WHEN NEW.status='paid' AND NEW.amount>0 AND NOT EXISTS(SELECT 1 FROM app_meta WHERE key='ledger-projection') BEGIN
      INSERT OR IGNORE INTO ledger_charges(payment_id,original_cents,origin) SELECT NEW.id,CAST(ROUND(NEW.amount*100) AS INTEGER),'native' WHERE NEW.ledger_parent_id IS NULL;
      INSERT INTO ledger_receipts(legacy_payment_id,amount_cents,method,received_at) VALUES(NEW.id,CAST(ROUND(NEW.amount*100) AS INTEGER),NEW.payment_method,COALESCE(NEW.paid_at,CURRENT_TIMESTAMP));
      INSERT INTO ledger_applications(charge_id,receipt_id,amount_cents) SELECT id,last_insert_rowid(),CAST(ROUND(NEW.amount*100) AS INTEGER) FROM ledger_charges WHERE payment_id=COALESCE(NEW.ledger_parent_id,NEW.id); END;
    CREATE TRIGGER IF NOT EXISTS ledger_paid_receipt AFTER UPDATE OF status ON payments WHEN NEW.status='paid' AND OLD.status!='paid' AND NEW.amount>0 AND NOT EXISTS(SELECT 1 FROM app_meta WHERE key='ledger-projection') BEGIN
      INSERT INTO ledger_receipts(legacy_payment_id,amount_cents,method,received_at) VALUES(NEW.id,CAST(ROUND(NEW.amount*100) AS INTEGER),NEW.payment_method,COALESCE(NEW.paid_at,CURRENT_TIMESTAMP));
      INSERT INTO ledger_applications(charge_id,receipt_id,amount_cents) SELECT id,last_insert_rowid(),CAST(ROUND(NEW.amount*100) AS INTEGER) FROM ledger_charges WHERE payment_id=COALESCE(NEW.ledger_parent_id,NEW.id); END;
    CREATE TRIGGER IF NOT EXISTS ledger_receipts_no_delete BEFORE DELETE ON ledger_receipts BEGIN SELECT RAISE(ABORT,'Los cobros se reversan; no se eliminan'); END;
    CREATE TRIGGER IF NOT EXISTS ledger_receipts_immutable BEFORE UPDATE OF amount_cents,method,received_at ON ledger_receipts BEGIN SELECT RAISE(ABORT,'El cobro original es inmutable'); END;
    CREATE TRIGGER IF NOT EXISTS ledger_charges_immutable BEFORE UPDATE ON ledger_charges BEGIN SELECT RAISE(ABORT,'El cargo original es inmutable'); END;
    CREATE TRIGGER IF NOT EXISTS ledger_applications_immutable BEFORE UPDATE ON ledger_applications BEGIN SELECT RAISE(ABORT,'La aplicación original es inmutable'); END;
    CREATE TRIGGER IF NOT EXISTS ledger_reversals_immutable BEFORE UPDATE ON ledger_reversals BEGIN SELECT RAISE(ABORT,'El reverso es inmutable'); END;
  `)
  const permit:RequestHandler=(req:UserRequest,res,next)=>{if(!req.user?.permissions.includes('finance'))return void res.status(403).json({error:'Esta función requiere permiso de finanzas.'});next()}
  app.get('/api/ledger',auth,permit,(req,res)=>{
    const p=z.object({page:z.coerce.number().int().min(1).default(1),q:z.string().max(120).default('')}).safeParse(req.query)
    if(!p.success)return void res.status(400).json({error:'Filtros inválidos.'})
    const pattern=`%${p.data.q.replace(/[!%_]/g,'!$&')}%`
    const where="WHERE p.concept LIKE ? ESCAPE '!' OR COALESCE(a.name,'') LIKE ? ESCAPE '!'"
    const total=(db.prepare(`SELECT COUNT(*) n FROM ledger_charges c JOIN payments p ON p.id=c.payment_id LEFT JOIN athletes a ON a.id=p.athlete_id ${where}`).get(pattern,pattern) as {n:number}).n
    const rows=db.prepare(`SELECT c.*,p.concept,p.status,a.name AS athlete,
      COALESCE((SELECT SUM(x.amount_cents) FROM ledger_applications x WHERE x.charge_id=c.id AND NOT EXISTS(SELECT 1 FROM ledger_reversals v WHERE v.receipt_id=x.receipt_id)),0) AS collected_cents
      FROM ledger_charges c JOIN payments p ON p.id=c.payment_id LEFT JOIN athletes a ON a.id=p.athlete_id ${where} ORDER BY c.id DESC LIMIT 20 OFFSET ?`).all(pattern,pattern,(p.data.page-1)*20)
    res.json({rows,total,page:p.data.page})
  })
  app.get('/api/ledger/:id',auth,permit,(req,res)=>{
    const charge=db.prepare('SELECT c.*,p.concept,p.status,a.name AS athlete FROM ledger_charges c JOIN payments p ON p.id=c.payment_id LEFT JOIN athletes a ON a.id=p.athlete_id WHERE c.id=?').get(Number(req.params.id))
    if(!charge)return void res.status(404).json({error:'Cargo no encontrado.'})
    const receipts=db.prepare('SELECT r.*,x.amount_cents AS applied_cents,v.reason AS reversal_reason,v.created_at AS reversed_at,u.name AS reversed_by FROM ledger_applications x JOIN ledger_receipts r ON r.id=x.receipt_id LEFT JOIN ledger_reversals v ON v.receipt_id=r.id LEFT JOIN users u ON u.id=v.user_id WHERE x.charge_id=? ORDER BY r.id').all(Number(req.params.id))
    res.json({charge,receipts})
  })
  app.post('/api/ledger/receipts/:id/reverse',auth,permit,idempotency(db),(req:UserRequest,res)=>{
    const p=z.object({reason:z.string().trim().min(10).max(1000)}).safeParse(req.body)
    if(!p.success)return void res.status(400).json({error:'Explica el motivo del reverso con al menos 10 caracteres.'})
    const receipt=db.prepare('SELECT r.*,c.payment_id AS charge_payment_id,c.id AS charge_id FROM ledger_receipts r JOIN ledger_applications x ON x.receipt_id=r.id JOIN ledger_charges c ON c.id=x.charge_id WHERE r.id=?').get(Number(req.params.id)) as {id:number;amount_cents:number;legacy_payment_id:number;charge_payment_id:number;charge_id:number}|undefined
    if(!receipt)return void res.status(404).json({error:'Cobro no encontrado.'})
    if(db.prepare('SELECT 1 FROM ledger_reversals WHERE receipt_id=?').get(receipt.id))return void res.status(409).json({error:'Este cobro ya fue reversado.'})
    const charge=db.prepare('SELECT * FROM payments WHERE id=?').get(receipt.charge_payment_id) as {status:string;amount:number;athlete_id:number|null;concept:string;paid_at:string;payment_method:string}
    if(charge.status==='cancelled')return void res.status(409).json({error:'Reabre el cargo cancelado antes de reversar un cobro.'})
    db.transaction(()=>{
      db.prepare("INSERT INTO app_meta(key,value) VALUES('ledger-projection','1')").run()
      // If the final receipt occupied the original legacy row, preserve it as
      // a separate report row before reopening that charge for another reversal.
      if(charge.status==='paid'&&receipt.legacy_payment_id!==receipt.charge_payment_id) {
        const finalReceipt=db.prepare('SELECT r.id FROM ledger_receipts r WHERE r.legacy_payment_id=? AND NOT EXISTS(SELECT 1 FROM ledger_reversals v WHERE v.receipt_id=r.id)').get(receipt.charge_payment_id) as {id:number}|undefined
        if(finalReceipt) {
          const projection=db.prepare("INSERT INTO payments(athlete_id,concept,amount,paid_at,status,payment_method,ledger_parent_id) VALUES(?,?,?,?,'paid',?,?)").run(charge.athlete_id,`Cobro de cargo #${receipt.charge_payment_id}: ${charge.concept}`,charge.amount,charge.paid_at,charge.payment_method,receipt.charge_payment_id)
          db.prepare('UPDATE ledger_receipts SET legacy_payment_id=? WHERE id=?').run(projection.lastInsertRowid,finalReceipt.id)
        }
      }
      db.prepare('INSERT INTO ledger_reversals(receipt_id,reason,user_id) VALUES(?,?,?)').run(receipt.id,p.data.reason,req.user!.id)
      if(receipt.legacy_payment_id!==receipt.charge_payment_id)db.prepare("UPDATE payments SET status='cancelled',paid_at=NULL WHERE id=?").run(receipt.legacy_payment_id)
      const balance=(charge.status==='paid'?0:Math.round(charge.amount*100))+receipt.amount_cents
      db.prepare("UPDATE payments SET status='pending',amount=?,paid_at=NULL WHERE id=?").run(balance/100,receipt.charge_payment_id)
      db.prepare("DELETE FROM app_meta WHERE key='ledger-projection'").run()
      db.prepare("INSERT INTO audit_logs(user_id,action,entity,entity_id,metadata) VALUES(?,'reverse','ledger_receipts',?,?)").run(req.user!.id,receipt.id,JSON.stringify({reason:p.data.reason,amountCents:receipt.amount_cents,chargeId:receipt.charge_id}))
    })()
    res.json({ok:true})
  })
}
