import { captureSeason } from './seasonArchive.js'
import type { Express, Request, RequestHandler } from 'express'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { idempotency } from './idempotency.js'

type UserRequest = Request & { user?: { id: number; permissions: string[]; role: string } }
export function registerEvolution(app: Express, db: Database.Database, auth: RequestHandler) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS seasons (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, starts_on TEXT NOT NULL, ends_on TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planned');
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_season ON seasons(status) WHERE status = 'active';
    CREATE TABLE IF NOT EXISTS academy_settings (id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL, timezone TEXT NOT NULL DEFAULT 'America/Mexico_City', consent_version TEXT NOT NULL DEFAULT '1', consent_text TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS consent_history (id INTEGER PRIMARY KEY, guardian_id INTEGER NOT NULL REFERENCES guardians(id), athlete_id INTEGER REFERENCES athletes(id), season_id INTEGER REFERENCES seasons(id), version TEXT NOT NULL, document_text TEXT NOT NULL, signer_name TEXT NOT NULL, signed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS billing_plans (id INTEGER PRIMARY KEY, name TEXT NOT NULL, amount_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL DEFAULT 0, due_day INTEGER NOT NULL, team_id INTEGER REFERENCES teams(id), active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS billing_runs (plan_id INTEGER NOT NULL REFERENCES billing_plans(id), period TEXT NOT NULL, athlete_id INTEGER NOT NULL REFERENCES athletes(id), payment_id INTEGER NOT NULL REFERENCES payments(id), PRIMARY KEY(plan_id,period,athlete_id));
    CREATE TABLE IF NOT EXISTS prospects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, contact TEXT NOT NULL, source TEXT NOT NULL DEFAULT '', trial_on TEXT, stage TEXT NOT NULL DEFAULT 'new', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS training_plans (id INTEGER PRIMARY KEY, team_id INTEGER NOT NULL REFERENCES teams(id), coach_id INTEGER NOT NULL REFERENCES users(id), scheduled_on TEXT NOT NULL, objective TEXT NOT NULL, exercises TEXT NOT NULL, observations TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS message_replies (id INTEGER PRIMARY KEY, message_id INTEGER NOT NULL REFERENCES family_messages(id), author_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS payment_proofs (id INTEGER PRIMARY KEY, guardian_id INTEGER NOT NULL REFERENCES guardians(id), payment_id INTEGER NOT NULL REFERENCES payments(id), file_data TEXT NOT NULL, reference TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reviewed_by INTEGER REFERENCES users(id), review_note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS payments_athlete_status ON payments(athlete_id,status);
    CREATE INDEX IF NOT EXISTS attendance_athlete_date ON attendance(athlete_id,attended_on);
    CREATE INDEX IF NOT EXISTS documents_athlete_visibility ON documents(athlete_id,visibility);
    CREATE INDEX IF NOT EXISTS athlete_teams_current ON athlete_teams(athlete_id,ended_at);
  `)
  db.transaction(() => {
    if (!db.prepare("SELECT 1 FROM schema_migrations WHERE version='1.1-operations'").get()) {
      const year = new Date().getFullYear()
      db.prepare("INSERT INTO seasons(name,starts_on,ends_on,status) VALUES(?,?,?,'active')").run(String(year), `${year}-01-01`, `${year}-12-31`)
      db.prepare('INSERT INTO academy_settings(id,name,consent_text) VALUES(1,?,?)').run('Stars Royalty', 'Como padre, madre o tutor legal, autorizo la práctica deportiva del atleta y acepto el reglamento de seguridad institucional de la academia.')
      db.prepare("INSERT INTO consent_history(guardian_id,version,document_text,signer_name,signed_at) SELECT guardian_id,'legacy','Aceptación previa a la gestión por temporadas; texto histórico no versionado.',signer_name,signed_at FROM guardian_consents").run()
      db.prepare("INSERT INTO schema_migrations(version) VALUES('1.1-operations')").run()
    }
  })()
  const permit = (scope: string): RequestHandler => (req: UserRequest, res, next) => {
    if (!req.user?.permissions.includes(scope)) return void res.status(403).json({ error: 'No tienes permiso para esta operación.' })
    next()
  }
  const audit = (req: UserRequest, action: string, entity: string, id: number, metadata: unknown = {}) => db.prepare('INSERT INTO audit_logs(user_id,action,entity,entity_id,metadata) VALUES(?,?,?,?,?)').run(req.user!.id,action,entity,id,JSON.stringify(metadata))
  const guardian = (req: UserRequest) => (db.prepare('SELECT guardian_id FROM users WHERE id=?').get(req.user!.id) as { guardian_id: number | null })?.guardian_id

  const rememberMutation=idempotency(db)
  app.get('/api/operations/team-options',auth,permit('staff'),(_req,res)=>res.json(db.prepare("SELECT id,name FROM teams WHERE status='active' ORDER BY name").all()))
  app.get('/api/guardian-directory',auth,permit('sportsLead'),(_req,res)=>res.json(db.prepare('SELECT id,name,phone,email FROM guardians ORDER BY name').all()))
  const enrollmentSchema=z.object({name:z.string().trim().min(2).max(120),birthDate:z.string().date().optional(),phone:z.string().max(60).optional(),guardianId:z.number().int().positive().optional(),guardianName:z.string().trim().min(2).max(120).optional(),guardianPhone:z.string().trim().max(60).optional(),guardianEmail:z.string().email().optional(),teamId:z.number().int().positive(),amount:z.number().nonnegative().max(1000000).default(0),concept:z.string().trim().min(2).max(120).default('Inscripción')}).refine(v=>v.guardianId||v.guardianName,{message:'Selecciona o registra un tutor.'})
  app.post('/api/enrollments',auth,permit('sportsLead'),rememberMutation,(req:UserRequest,res)=>{
    const p=enrollmentSchema.safeParse(req.body);if(!p.success)return void res.status(400).json({error:'Revisa los datos del atleta, tutor y equipo.'})
    if(p.data.amount>0&&!req.user!.permissions.includes('finance'))return void res.status(403).json({error:'Solo finanzas puede incluir un cargo de inscripción.'})
    const team=db.prepare("SELECT category_id FROM teams WHERE id=? AND status='active'").get(p.data.teamId) as {category_id:number|null}|undefined
    if(!team)return void res.status(404).json({error:'Equipo no disponible.'})
    if(p.data.guardianId&&!db.prepare('SELECT id FROM guardians WHERE id=?').get(p.data.guardianId))return void res.status(404).json({error:'Tutor no encontrado.'})
    const result=db.transaction(()=>{
      let gid=p.data.guardianId
      if(!gid && (p.data.guardianPhone||p.data.guardianEmail))gid=(db.prepare('SELECT id FROM guardians WHERE name=? AND ((? IS NOT NULL AND phone=?) OR (? IS NOT NULL AND email=?))').get(p.data.guardianName,p.data.guardianPhone??null,p.data.guardianPhone??null,p.data.guardianEmail??null,p.data.guardianEmail??null) as {id:number}|undefined)?.id
      if(!gid)gid=Number(db.prepare('INSERT INTO guardians(name,phone,email) VALUES(?,?,?)').run(p.data.guardianName,p.data.guardianPhone??null,p.data.guardianEmail??null).lastInsertRowid)
      const existing=db.prepare('SELECT id FROM athletes WHERE name=? AND guardian_id=? AND birth_date IS ?').get(p.data.name,gid,p.data.birthDate??null)
      if(existing)throw Object.assign(new Error('Ya existe un atleta con ese nombre, tutor y fecha de nacimiento.'),{code:'SQLITE_CONSTRAINT_UNIQUE'})
      const athleteId=Number(db.prepare('INSERT INTO athletes(name,birth_date,phone,guardian_id,category_id) VALUES(?,?,?,?,?)').run(p.data.name,p.data.birthDate??null,p.data.phone??null,gid,team.category_id).lastInsertRowid)
      db.prepare('INSERT INTO athlete_teams(athlete_id,team_id) VALUES(?,?)').run(athleteId,p.data.teamId)
      let paymentId:number|null=null
      if(p.data.amount>0)paymentId=Number(db.prepare('INSERT INTO payments(athlete_id,concept,amount,due_date) VALUES(?,?,?,CURRENT_DATE)').run(athleteId,p.data.concept,Math.round(p.data.amount*100)/100).lastInsertRowid)
      audit(req,'enroll','athletes',athleteId,{guardianId:gid,teamId:p.data.teamId,paymentId});return{athleteId,guardianId:gid,paymentId}
    })();res.status(201).json(result)
  })
  const importSchema=z.object({rows:z.array(z.object({name:z.string().trim().min(2).max(120),birthDate:z.string().date(),guardianName:z.string().trim().min(2).max(120),guardianPhone:z.string().trim().min(5).max(60),teamId:z.number().int().positive()})).min(1).max(500)})
  function importAthletes(commit:boolean):RequestHandler{return(req:UserRequest,res)=>{
    const p=importSchema.safeParse(req.body)
    if(!p.success)return void res.status(400).json({error:'El archivo requiere nombre, fecha AAAA-MM-DD, tutor, teléfono e ID de equipo en cada fila (máximo 500).',details:p.error.issues.map(i=>({row:Number(i.path[1])+2,message:i.message}))})
    const seen=new Set<string>();const errors:{row:number;message:string}[]=[]
    p.data.rows.forEach((r,index)=>{const key=`${r.name.toLowerCase()}|${r.birthDate}|${r.guardianPhone}`;if(seen.has(key))errors.push({row:index+2,message:'Registro repetido en el archivo.'});seen.add(key);if(!db.prepare("SELECT id FROM teams WHERE id=? AND status='active'").get(r.teamId))errors.push({row:index+2,message:'Equipo no disponible.'});if(db.prepare('SELECT athletes.id FROM athletes JOIN guardians ON guardians.id=guardian_id WHERE lower(athletes.name)=lower(?) AND birth_date=? AND guardians.phone=?').get(r.name,r.birthDate,r.guardianPhone))errors.push({row:index+2,message:'El atleta ya está registrado.'})})
    if(!commit)return void res.json({count:p.data.rows.length,errors,rows:p.data.rows})
    if(errors.length)return void res.status(409).json({error:'Corrige los registros antes de importar. No se guardó ninguna fila.',details:errors})
    db.transaction(()=>{for(const row of p.data.rows){let gid=(db.prepare('SELECT id FROM guardians WHERE name=? AND phone=?').get(row.guardianName,row.guardianPhone) as {id:number}|undefined)?.id;if(!gid)gid=Number(db.prepare('INSERT INTO guardians(name,phone) VALUES(?,?)').run(row.guardianName,row.guardianPhone).lastInsertRowid);const team=db.prepare('SELECT category_id FROM teams WHERE id=?').get(row.teamId) as {category_id:number|null};const id=Number(db.prepare('INSERT INTO athletes(name,birth_date,guardian_id,category_id) VALUES(?,?,?,?)').run(row.name,row.birthDate,gid,team.category_id).lastInsertRowid);db.prepare('INSERT INTO athlete_teams(athlete_id,team_id) VALUES(?,?)').run(id,row.teamId)}audit(req,'import','athletes',0,{count:p.data.rows.length})})()
    res.status(201).json({count:p.data.rows.length})
  }}
  app.post('/api/import/athletes/preview',auth,permit('sportsLead'),importAthletes(false))
  app.post('/api/import/athletes/commit',auth,permit('sportsLead'),rememberMutation,importAthletes(true))
  app.get('/api/academy', auth, (_req,res) => res.json({ ...db.prepare('SELECT * FROM academy_settings WHERE id=1').get() as object, season: db.prepare("SELECT * FROM seasons WHERE status='active'").get() ?? null }))
  app.patch('/api/academy', auth, permit('admin'), (req: UserRequest,res) => {
    const parsed = z.object({ name:z.string().trim().min(2).max(120), consentText:z.string().trim().min(20).max(12000) }).safeParse(req.body)
    if (!parsed.success) return void res.status(400).json({error:'Nombre o texto de responsiva inválido.'})
    const previous = db.prepare('SELECT consent_text,consent_version FROM academy_settings WHERE id=1').get() as {consent_text:string;consent_version:string}
    const version = previous.consent_text === parsed.data.consentText ? previous.consent_version : String(Number(previous.consent_version)+1)
    db.prepare('UPDATE academy_settings SET name=?,consent_text=?,consent_version=? WHERE id=1').run(parsed.data.name,parsed.data.consentText,version)
    audit(req,'update','academy_settings',1,{version}); res.json({ok:true})
  })
  app.get('/api/seasons',auth,permit('staff'),(_req,res)=>res.json(db.prepare('SELECT * FROM seasons ORDER BY starts_on DESC').all()))
  app.post('/api/seasons',auth,permit('admin'),rememberMutation,(req:UserRequest,res)=>{
    const p=z.object({name:z.string().trim().min(2).max(60),startsOn:z.string().date(),endsOn:z.string().date()}).safeParse(req.body)
    if(!p.success || p.data.endsOn<p.data.startsOn) return void res.status(400).json({error:'La temporada necesita nombre y fechas válidas.'})
    const r=db.prepare('INSERT INTO seasons(name,starts_on,ends_on) VALUES(?,?,?)').run(p.data.name,p.data.startsOn,p.data.endsOn)
    audit(req,'create','seasons',Number(r.lastInsertRowid));res.status(201).json({id:Number(r.lastInsertRowid)})
  })
  app.patch('/api/seasons/:id/activate',auth,permit('admin'),(req:UserRequest,res)=>{
    const id=Number(req.params.id)
    if(!db.prepare('SELECT id FROM seasons WHERE id=?').get(id)) return void res.status(404).json({error:'Temporada no encontrada.'})
    const selected=db.prepare('SELECT status FROM seasons WHERE id=?').get(id) as {status:string}
    if(selected.status==='closed')return void res.status(409).json({error:'Una temporada cerrada conserva su archivo. Crea otra temporada para continuar.'})
    db.transaction(()=>{const previous=db.prepare("SELECT id FROM seasons WHERE status='active' AND id!=?").get(id) as {id:number}|undefined;if(previous)captureSeason(db,previous.id);db.prepare("UPDATE seasons SET status='closed' WHERE status='active' AND id!=?").run(id);db.prepare("UPDATE seasons SET status='active' WHERE id=?").run(id)})()
    audit(req,'activate','seasons',id);res.json({ok:true})
  })
  app.get('/api/action-center',auth,permit('staff'),(req:UserRequest,res)=>{
    const items: {key:string;title:string;detail:string;module:string;count:number;severity:string}[]=[]
    const add=(key:string,title:string,detail:string,module:string,query:string,severity='warning')=>{ const count=(db.prepare(query).get() as {n:number}).n;if(count)items.push({key,title,detail,module,count,severity}) }
    if(req.user!.permissions.includes('finance')) {
      add('debt','Cargos vencidos','Revisa saldos y registra el seguimiento.','Cobranza',"SELECT COUNT(*) n FROM payments WHERE status IN ('pending','overdue') AND due_date < CURRENT_DATE")
      add('proofs','Comprobantes por revisar','Valida la referencia antes de registrar el pago.','Centro operativo',"SELECT COUNT(*) n FROM payment_proofs WHERE status='pending'")
    }
    if(req.user!.permissions.includes('coaching')) {
      if(req.user!.permissions.includes('documents'))add('documents','Documentos por vencer','Vencidos o con vencimiento en los próximos 30 días.','Atletas',"SELECT COUNT(*) n FROM documents WHERE expires_at IS NOT NULL AND expires_at <= date('now','+30 days')")
      add('evaluations','Evaluaciones pendientes','Atletas activos sin evaluación en los últimos 30 días.','Rendimiento',"SELECT COUNT(*) n FROM athletes a WHERE status='active' AND NOT EXISTS(SELECT 1 FROM evaluations e WHERE e.athlete_id=a.id AND date(e.evaluated_at)>=date('now','-30 days'))")
      add('goals','Metas vencidas','Metas que necesitan actualización del coach.','Rendimiento',"SELECT COUNT(*) n FROM goals WHERE progress<100 AND due_date<CURRENT_DATE")
    }
    if(req.user!.permissions.includes('inventory')) add('stock','Reponer inventario','Productos activos en el nivel mínimo.','Inventario','SELECT COUNT(*) n FROM products WHERE active=1 AND stock<=min_stock')
    add('messages','Consultas de familias','Mensajes abiertos o en seguimiento.','Centro operativo',"SELECT COUNT(*) n FROM family_messages WHERE status!='closed'",'info')
    res.json(items)
  })
  app.get('/api/billing-plans',auth,permit('finance'),(_req,res)=>res.json(db.prepare('SELECT billing_plans.*,teams.name AS team FROM billing_plans LEFT JOIN teams ON teams.id=team_id ORDER BY billing_plans.id DESC').all()))
  app.post('/api/billing-plans',auth,permit('finance'),rememberMutation,(req:UserRequest,res)=>{
    const p=z.object({name:z.string().trim().min(2).max(120),amount:z.number().positive().max(1000000),discount:z.number().nonnegative().default(0),dueDay:z.number().int().min(1).max(28),teamId:z.number().int().positive().nullable().default(null)}).safeParse(req.body)
    if(!p.success || p.data.discount>p.data.amount) return void res.status(400).json({error:'Revisa importe, descuento y día de vencimiento (1 a 28).'})
    const r=db.prepare('INSERT INTO billing_plans(name,amount_cents,discount_cents,due_day,team_id) VALUES(?,?,?,?,?)').run(p.data.name,Math.round(p.data.amount*100),Math.round(p.data.discount*100),p.data.dueDay,p.data.teamId)
    audit(req,'create','billing_plans',Number(r.lastInsertRowid));res.status(201).json({id:Number(r.lastInsertRowid)})
  })
  app.post('/api/billing-plans/:id/preview',auth,permit('finance'),rememberMutation,billing(false))
  app.post('/api/billing-plans/:id/generate',auth,permit('finance'),rememberMutation,billing(true))
  function billing(commit:boolean):RequestHandler {return(req:UserRequest,res)=>{
    const p=z.object({period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}).safeParse(req.body)
    if(!p.success)return void res.status(400).json({error:'Selecciona un mes válido.'})
    const plan=db.prepare('SELECT * FROM billing_plans WHERE id=? AND active=1').get(Number(req.params.id)) as {id:number;name:string;amount_cents:number;discount_cents:number;due_day:number;team_id:number|null}|undefined
    if(!plan)return void res.status(404).json({error:'Plan no disponible.'})
    const result=db.transaction(()=>{
      const athletes=db.prepare("SELECT id,name FROM athletes WHERE status='active' AND (? IS NULL OR id IN(SELECT athlete_id FROM athlete_teams WHERE team_id=? AND ended_at IS NULL)) AND id NOT IN(SELECT athlete_id FROM billing_runs WHERE plan_id=? AND period=?) ORDER BY name").all(plan.team_id,plan.team_id,plan.id,p.data.period) as {id:number;name:string}[]
      const amount=(plan.amount_cents-plan.discount_cents)/100
      const dueDate=`${p.data.period}-${String(plan.due_day).padStart(2,'0')}`
      if(commit)for(const a of athletes){const pay=db.prepare('INSERT INTO payments(athlete_id,concept,amount,due_date,discount) VALUES(?,?,?,?,?)').run(a.id,`${plan.name} · ${p.data.period}`,amount,dueDate,plan.discount_cents/100);db.prepare('INSERT INTO billing_runs(plan_id,period,athlete_id,payment_id) VALUES(?,?,?,?)').run(plan.id,p.data.period,a.id,pay.lastInsertRowid)}
      return {athletes,count:athletes.length,amount,total:Math.round(amount*athletes.length*100)/100,dueDate}
    })()
    if(commit)audit(req,'generate','billing_plans',plan.id,{period:p.data.period,count:result.count})
    res.json(result)
  }}
  app.get('/api/prospects',auth,permit('staff'),(_req,res)=>res.json(db.prepare('SELECT * FROM prospects ORDER BY created_at DESC,id DESC').all()))
  app.post('/api/prospects',auth,permit('staff'),rememberMutation,(req:UserRequest,res)=>{
    const p=z.object({name:z.string().trim().min(2).max(120),contact:z.string().trim().min(3).max(160),source:z.string().max(120).default(''),trialOn:z.string().date().optional(),notes:z.string().max(2000).default('')}).safeParse(req.body)
    if(!p.success)return void res.status(400).json({error:'Completa nombre y contacto; revisa la fecha.'})
    const r=db.prepare('INSERT INTO prospects(name,contact,source,trial_on,notes) VALUES(?,?,?,?,?)').run(p.data.name,p.data.contact,p.data.source,p.data.trialOn??null,p.data.notes)
    audit(req,'create','prospects',Number(r.lastInsertRowid));res.status(201).json({id:Number(r.lastInsertRowid)})
  })
  app.patch('/api/prospects/:id',auth,permit('staff'),(req:UserRequest,res)=>{
    const p=z.object({stage:z.enum(['new','contacted','trial','enrolled','lost'])}).safeParse(req.body)
    if(!p.success)return void res.status(400).json({error:'Estado inválido.'})
    const r=db.prepare('UPDATE prospects SET stage=? WHERE id=?').run(p.data.stage,Number(req.params.id));if(!r.changes)return void res.status(404).json({error:'Prospecto no encontrado.'})
    audit(req,'update','prospects',Number(req.params.id),p.data);res.json({ok:true})
  })
  app.get('/api/training-plans',auth,permit('coaching'),(_req,res)=>res.json(db.prepare('SELECT training_plans.*,teams.name AS team FROM training_plans JOIN teams ON teams.id=team_id ORDER BY scheduled_on DESC,id DESC').all()))
  app.post('/api/training-plans',auth,permit('coaching'),rememberMutation,(req:UserRequest,res)=>{
    const p=z.object({teamId:z.number().int().positive(),scheduledOn:z.string().date(),objective:z.string().trim().min(3).max(300),exercises:z.string().trim().min(3).max(5000)}).safeParse(req.body)
    if(!p.success)return void res.status(400).json({error:'Completa equipo, fecha, objetivo y actividades.'})
    const r=db.prepare('INSERT INTO training_plans(team_id,coach_id,scheduled_on,objective,exercises) VALUES(?,?,?,?,?)').run(p.data.teamId,req.user!.id,p.data.scheduledOn,p.data.objective,p.data.exercises)
    audit(req,'create','training_plans',Number(r.lastInsertRowid));res.status(201).json({id:Number(r.lastInsertRowid)})
  })
  app.patch('/api/training-plans/:id',auth,permit('coaching'),(req:UserRequest,res)=>{
    const p=z.object({observations:z.string().max(5000)}).safeParse(req.body)
    if(!p.success)return void res.status(400).json({error:'Observaciones inválidas.'})
    const r=db.prepare('UPDATE training_plans SET observations=? WHERE id=?').run(p.data.observations,Number(req.params.id));if(!r.changes)return void res.status(404).json({error:'Sesión no encontrada.'})
    audit(req,'update','training_plans',Number(req.params.id));res.json({ok:true})
  })
  app.get('/api/conversations',auth,(req:UserRequest,res)=>{
    const staff=req.user!.permissions.includes('staff');const gid=guardian(req)
    if(!staff && (!gid||req.user!.role!=='Padres y tutores'))return void res.status(403).json({error:'Cuenta no vinculada a una familia.'})
    const messages=db.prepare('SELECT family_messages.*,guardians.name AS guardian FROM family_messages JOIN guardians ON guardians.id=guardian_id WHERE ?=1 OR guardian_id=? ORDER BY family_messages.id DESC').all(Number(staff),gid??null) as {id:number}[]
    res.json(messages.map(m=>({...m,replies:db.prepare('SELECT message_replies.id,body,message_replies.created_at,users.name AS author FROM message_replies JOIN users ON users.id=author_id WHERE message_id=? ORDER BY message_replies.id').all(m.id)})))
  })
  app.post('/api/conversations/:id/replies',auth,(req:UserRequest,res)=>{
    const p=z.object({body:z.string().trim().min(2).max(3000)}).safeParse(req.body);if(!p.success)return void res.status(400).json({error:'Escribe una respuesta de 2 a 3000 caracteres.'})
    const id=Number(req.params.id);const m=db.prepare('SELECT guardian_id FROM family_messages WHERE id=?').get(id) as {guardian_id:number}|undefined
    if(!m || (!req.user!.permissions.includes('staff') && (req.user!.role!=='Padres y tutores'||guardian(req)!==m.guardian_id)))return void res.status(404).json({error:'Conversación no disponible.'})
    const r=db.transaction(()=>{const result=db.prepare('INSERT INTO message_replies(message_id,author_id,body) VALUES(?,?,?)').run(id,req.user!.id,p.data.body);db.prepare("UPDATE family_messages SET status=? WHERE id=?").run(req.user!.permissions.includes('staff')?'in_progress':'open',id);return result})()
    audit(req,'reply','family_messages',id);res.status(201).json({id:Number(r.lastInsertRowid)})
  })
  app.get('/api/payment-proofs',auth,(req:UserRequest,res)=>{
    const finance=req.user!.permissions.includes('finance');const gid=guardian(req)
    if(!finance && (!gid||req.user!.role!=='Padres y tutores'))return void res.status(403).json({error:'Acceso no autorizado.'})
    res.json(db.prepare('SELECT payment_proofs.id,payment_id,reference,payment_proofs.status,review_note,payment_proofs.created_at,payments.concept,guardians.name AS guardian FROM payment_proofs JOIN payments ON payments.id=payment_id JOIN guardians ON guardians.id=payment_proofs.guardian_id WHERE ?=1 OR payment_proofs.guardian_id=? ORDER BY payment_proofs.id DESC').all(Number(finance),gid??null))
  })
  app.post('/api/payment-proofs',auth,(req:UserRequest,res)=>{
    const gid=guardian(req);if(!gid||req.user!.role!=='Padres y tutores')return void res.status(403).json({error:'Solo familias vinculadas pueden subir comprobantes.'})
    const p=z.object({paymentId:z.number().int().positive(),reference:z.string().trim().min(2).max(160),fileData:z.string().max(7000000).regex(/^data:(application\/pdf|image\/(png|jpeg|webp));base64,[A-Za-z0-9+/=\r\n]+$/)}).safeParse(req.body)
    if(!p.success)return void res.status(400).json({error:'Selecciona cargo, referencia y archivo PDF o imagen.'})
    if(!db.prepare('SELECT payments.id FROM payments JOIN athletes ON athletes.id=athlete_id WHERE payments.id=? AND guardian_id=?').get(p.data.paymentId,gid))return void res.status(404).json({error:'Cargo no disponible.'})
    const r=db.prepare('INSERT INTO payment_proofs(guardian_id,payment_id,reference,file_data) VALUES(?,?,?,?)').run(gid,p.data.paymentId,p.data.reference,p.data.fileData);audit(req,'upload','payment_proofs',Number(r.lastInsertRowid));res.status(201).json({id:Number(r.lastInsertRowid)})
  })
  app.get('/api/payment-proofs/:id/file',auth,permit('finance'),(req,res)=>{const file=db.prepare('SELECT file_data AS fileData FROM payment_proofs WHERE id=?').get(Number(req.params.id));if(!file)return void res.status(404).json({error:'Archivo no encontrado.'});res.json(file)})
  app.patch('/api/payment-proofs/:id',auth,permit('finance'),(req:UserRequest,res)=>{
    const p=z.object({status:z.enum(['reviewed','rejected']),note:z.string().trim().min(3).max(1000)}).safeParse(req.body);if(!p.success)return void res.status(400).json({error:'Agrega estado y observación de revisión.'})
    const r=db.prepare('UPDATE payment_proofs SET status=?,review_note=?,reviewed_by=? WHERE id=?').run(p.data.status,p.data.note,req.user!.id,Number(req.params.id));if(!r.changes)return void res.status(404).json({error:'Comprobante no encontrado.'});audit(req,'review','payment_proofs',Number(req.params.id),p.data);res.json({ok:true})
  })
}
