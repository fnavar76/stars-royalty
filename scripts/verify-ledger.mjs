import Database from 'better-sqlite3'
import { resolve } from 'node:path'
const db=new Database(resolve(process.argv[2]??'starsroyalty.db'),{readonly:true,fileMustExist:true})
try {
  const legacy=db.prepare("SELECT COALESCE(SUM(CAST(ROUND(amount*100) AS INTEGER)),0) cents FROM payments WHERE status='paid'").get().cents
  const ledger=db.prepare('SELECT COALESCE(SUM(amount_cents),0) cents FROM ledger_receipts r WHERE NOT EXISTS(SELECT 1 FROM ledger_reversals v WHERE v.receipt_id=r.id)').get().cents
  const balances=db.prepare(`SELECT c.id,p.id AS payment_id,c.original_cents,p.amount,p.status,COALESCE(SUM(CASE WHEN v.id IS NULL THEN x.amount_cents ELSE 0 END),0) collected
    FROM ledger_charges c JOIN payments p ON p.id=c.payment_id LEFT JOIN ledger_applications x ON x.charge_id=c.id LEFT JOIN ledger_reversals v ON v.receipt_id=x.receipt_id
    GROUP BY c.id HAVING collected>c.original_cents OR (p.status IN ('pending','overdue') AND c.original_cents-collected!=CAST(ROUND(p.amount*100) AS INTEGER)) OR (p.status='paid' AND c.original_cents!=collected)`).all()
  const unassigned=db.prepare('SELECT COUNT(*) n FROM ledger_receipts r LEFT JOIN ledger_applications x ON x.receipt_id=r.id WHERE x.id IS NULL OR x.amount_cents!=r.amount_cents').get().n
  const integrity=db.pragma('integrity_check',{simple:true})
  const foreignKeys=db.pragma('foreign_key_check').length
  console.log(JSON.stringify({integrity,foreignKeyErrors:foreignKeys,legacyIncomeCents:legacy,ledgerIncomeCents:ledger,balanceDifferences:balances,unassignedReceipts:unassigned},null,2))
  if(integrity!=='ok'||foreignKeys||legacy!==ledger||balances.length||unassigned)process.exitCode=1
} finally { db.close() }
