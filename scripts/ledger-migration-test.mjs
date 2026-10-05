import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import express from 'express'
import { registerLedger } from '../.server-dist/ledger.js'
const db=new Database(':memory:')
db.pragma('foreign_keys=ON')
db.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);
CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT);
CREATE TABLE athletes(id INTEGER PRIMARY KEY,name TEXT);
CREATE TABLE audit_logs(id INTEGER PRIMARY KEY,user_id INTEGER,action TEXT,entity TEXT,entity_id INTEGER,metadata TEXT);
CREATE TABLE payments(id INTEGER PRIMARY KEY,athlete_id INTEGER,concept TEXT,amount REAL,status TEXT,paid_at TEXT,payment_method TEXT);
INSERT INTO payments VALUES(1,1,'Cuota antigua',650,'paid','2026-01-05','Efectivo'),(2,1,'Abono antiguo',300,'paid','2026-01-01','Efectivo'),(3,1,'Cuota pendiente',200,'pending',NULL,NULL);
INSERT INTO audit_logs(action,entity,entity_id,metadata) VALUES('installment','payments',1,'{"paymentId":2,"previousBalance":950,"amount":300}');`)
const setup=()=>registerLedger(express(),db,(_req,_res,next)=>next())
try {
  setup()
  assert.equal(db.prepare('SELECT original_cents FROM ledger_charges WHERE payment_id=1').get().original_cents,95000)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ledger_charges').get().n,2)
  assert.equal(db.prepare('SELECT SUM(amount_cents) n FROM ledger_applications').get().n,95000)
  assert.equal(db.prepare('SELECT SUM(amount) n FROM payments WHERE status=\'paid\'').get().n,950)
  setup()
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ledger_receipts').get().n,2)
  assert.throws(()=>db.prepare('UPDATE ledger_receipts SET amount_cents=1 WHERE id=1').run())
  assert.throws(()=>db.prepare('DELETE FROM ledger_receipts WHERE id=1').run())
  db.prepare("INSERT INTO payments(athlete_id,concept,amount,status,paid_at,payment_method) VALUES(1,'Venta nueva',25,'paid','2026-01-06','Efectivo')").run()
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ledger_charges').get().n,3)
  assert.equal(db.prepare('SELECT SUM(amount_cents) n FROM ledger_applications').get().n,97500)
  assert.deepEqual(db.pragma('foreign_key_check'),[])
  console.log('OK: migración contable, reinicio, importes originales e inmutabilidad verificados.')
} finally { db.close() }
