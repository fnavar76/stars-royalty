import type { Express, Request, RequestHandler } from 'express'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { idempotency } from './idempotency.js'
type UserRequest=Request & {user?:{id:number;permissions:string[]}}
const criterion=z.object({name:z.string().trim().min(2).max(100),weight:z.number().positive().max(100)})
export function registerSports(app:Express,db:Database.Database,auth:RequestHandler) {
  db.exec(`CREATE TABLE IF NOT EXISTS skill_rubrics(id INTEGER PRIMARY KEY,name TEXT NOT NULL,discipline_id INTEGER REFERENCES disciplines(id),active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS skill_rubric_versions(id INTEGER PRIMARY KEY,rubric_id INTEGER NOT NULL REFERENCES skill_rubrics(id),version INTEGER NOT NULL,criteria TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(rubric_id,version));
    CREATE TABLE IF NOT EXISTS skill_assessments(id INTEGER PRIMARY KEY,athlete_id INTEGER NOT NULL REFERENCES athletes(id),coach_id INTEGER NOT NULL REFERENCES users(id),version_id INTEGER NOT NULL REFERENCES skill_rubric_versions(id),scores TEXT NOT NULL,score REAL NOT NULL,feedback TEXT NOT NULL,assessed_on TEXT NOT NULL DEFAULT CURRENT_DATE);
    CREATE TABLE IF NOT EXISTS scheduled_sessions(event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,team_id INTEGER NOT NULL REFERENCES teams(id),coach_id INTEGER NOT NULL REFERENCES users(id),venue_id INTEGER NOT NULL REFERENCES venues(id),series_code TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS competition_tasks(id INTEGER PRIMARY KEY,event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,title TEXT NOT NULL,owner TEXT NOT NULL DEFAULT '',due_on TEXT,status TEXT NOT NULL DEFAULT 'pending');
  `)
  const permit=(scope:string):RequestHandler=>(req:UserRequest,res,next)=>{if(!req.user?.permissions.includes(scope))return void res.status(403).json({error:'No tienes permiso para esta función.'});next()}
  const remember=idempotency(db)
  const audit=(req:UserRequest,action:string,entity:string,id:number)=>db.prepare('INSERT INTO audit_logs(user_id,action,entity,entity_id) VALUES(?,?,?,?)').run(req.user!.id,action,entity,id)
  app.get('/api/skill-rubrics',auth,permit('coaching'),(_req,res)=>res.json(db.prepare('SELECT skill_rubrics.*,v.id AS version_id,v.version,v.criteria FROM skill_rubrics JOIN skill_rubric_versions v ON v.rubric_id=skill_rubrics.id WHERE v.version=(SELECT MAX(version) FROM skill_rubric_versions WHERE rubric_id=skill_rubrics.id) ORDER BY name').all().map(row=>{const r=row as {criteria:string};return {...r,criteria:JSON.parse(r.criteria)}})))
  app.post('/api/skill-rubrics',auth,permit('sportsLead'),remember,(req:UserRequest,res)=>{
    const p=z.object({name:z.string().trim().min(2).max(120),rubricId:z.number().int().positive().optional(),criteria:z.array(criterion).min(1).max(20)}).safeParse(req.body)
    if(!p.success || Math.abs(p.data.criteria.reduce((n,c)=>n+c.weight,0)-100)>.001 || new Set(p.data.criteria.map(c=>c.name.toLowerCase())).size!==p.data.criteria.length)return void res.status(400).json({error:'Los criterios deben tener nombres únicos y sus pesos sumar 100%.'})
    if(p.data.rubricId&&!db.prepare('SELECT id FROM skill_rubrics WHERE id=?').get(p.data.rubricId))return void res.status(404).json({error:'Rúbrica no encontrada.'})
    const id=db.transaction(()=>{const rubricId=p.data.rubricId??Number(db.prepare('INSERT INTO skill_rubrics(name) VALUES(?)').run(p.data.name).lastInsertRowid);const version=(db.prepare('SELECT COALESCE(MAX(version),0)+1 n FROM skill_rubric_versions WHERE rubric_id=?').get(rubricId) as {n:number}).n;const v=db.prepare('INSERT INTO skill_rubric_versions(rubric_id,version,criteria) VALUES(?,?,?)').run(rubricId,version,JSON.stringify(p.data.criteria));audit(req,'version','skill_rubrics',rubricId);return Number(v.lastInsertRowid)})();res.status(201).json({id})
  })
  app.post('/api/skill-assessments',auth,permit('coaching'),remember,(req:UserRequest,res)=>{
    const p=z.object({athleteId:z.number().int().positive(),versionId:z.number().int().positive(),scores:z.array(z.number().min(0).max(100)).min(1).max(20),feedback:z.string().max(3000).default('')}).safeParse(req.body)
    if(!p.success)return void res.status(400).json({error:'Revisa atleta, rúbrica y puntuaciones de 0 a 100.'})
    const version=db.prepare('SELECT criteria FROM skill_rubric_versions WHERE id=?').get(p.data.versionId) as {criteria:string}|undefined
    if(!version)return void res.status(404).json({error:'Versión de rúbrica no disponible.'})
    const criteria=JSON.parse(version.criteria) as {name:string;weight:number}[]
    if(criteria.length!==p.data.scores.length)return void res.status(400).json({error:'Debes calificar todos los criterios de esta versión.'})
    const score=Math.round(criteria.reduce((sum,c,i)=>sum+c.weight*p.data.scores[i]/100,0)*100)/100
    const r=db.prepare('INSERT INTO skill_assessments(athlete_id,coach_id,version_id,scores,score,feedback) VALUES(?,?,?,?,?,?)').run(p.data.athleteId,req.user!.id,p.data.versionId,JSON.stringify(p.data.scores),score,p.data.feedback)
    audit(req,'create','skill_assessments',Number(r.lastInsertRowid));res.status(201).json({id:Number(r.lastInsertRowid),score})
  })
  app.get('/api/skill-assessments',auth,(req:UserRequest,res)=>{
    const coaching=req.user!.permissions.includes('coaching');const guardian=(db.prepare('SELECT guardian_id FROM users WHERE id=?').get(req.user!.id) as {guardian_id:number|null}).guardian_id
    if(!coaching&&!guardian)return void res.status(403).json({error:'Acceso no autorizado.'})
    res.json(db.prepare('SELECT a.*,athletes.name AS athlete,r.name AS rubric,v.version,v.criteria FROM skill_assessments a JOIN athletes ON athletes.id=a.athlete_id JOIN skill_rubric_versions v ON v.id=a.version_id JOIN skill_rubrics r ON r.id=v.rubric_id WHERE ?=1 OR athletes.guardian_id=? ORDER BY a.id DESC LIMIT 200').all(Number(coaching),guardian).map(row=>{const r=row as {criteria:string;scores:string};return {...r,criteria:JSON.parse(r.criteria),scores:JSON.parse(r.scores)}}))
  })
  app.post('/api/schedules/series',auth,permit('coaching'),remember,(req:UserRequest,res)=>{
    const p=z.object({title:z.string().trim().min(2).max(120),teamId:z.number().int().positive(),coachId:z.number().int().positive(),venueId:z.number().int().positive(),startsAt:z.string().datetime(),durationMinutes:z.number().int().min(15).max(480),weeks:z.number().int().min(1).max(52),preview:z.boolean().default(true)}).safeParse(req.body)
    if(!p.success)return void res.status(400).json({error:'Revisa fechas, duración (15 a 480 minutos) y repeticiones (1 a 52). '})
    const venue=db.prepare('SELECT name,capacity FROM venues WHERE id=? AND active=1').get(p.data.venueId) as {name:string;capacity:number}|undefined
    if(!venue||!db.prepare("SELECT id FROM teams WHERE id=? AND status='active'").get(p.data.teamId)||!db.prepare('SELECT id FROM users WHERE id=? AND active=1').get(p.data.coachId))return void res.status(404).json({error:'Sede, equipo o coach no disponible.'})
    const count=(db.prepare('SELECT COUNT(*) n FROM athlete_teams WHERE team_id=? AND ended_at IS NULL').get(p.data.teamId) as {n:number}).n
    if(count>venue.capacity)return void res.status(409).json({error:`El equipo tiene ${count} atletas y la sede admite ${venue.capacity}.`})
    const existing=db.prepare('SELECT events.id,events.title,events.starts_at,events.ends_at,events.location,scheduled_sessions.coach_id,scheduled_sessions.team_id FROM events LEFT JOIN scheduled_sessions ON event_id=events.id').all() as {id:number;title:string;starts_at:string;ends_at:string|null;location:string|null;coach_id:number|null;team_id:number|null}[]
    const sessions=Array.from({length:p.data.weeks},(_,i)=>{const start=new Date(p.data.startsAt);start.setUTCDate(start.getUTCDate()+i*7);const end=new Date(start.getTime()+p.data.durationMinutes*60000);const conflicts=existing.filter(e=>(e.location===venue.name||e.coach_id===p.data.coachId||e.team_id===p.data.teamId)&&new Date(e.starts_at).getTime()<end.getTime()&&(e.ends_at?new Date(e.ends_at).getTime():new Date(e.starts_at).getTime()+3600000)>start.getTime()).map(e=>e.title);return {startsAt:start.toISOString(),endsAt:end.toISOString(),conflicts}})
    if(!p.data.preview&&sessions.some(s=>s.conflicts.length))return void res.status(409).json({error:'Hay conflictos de horario. Revisa la vista previa antes de guardar.'})
    if(p.data.preview)return void res.json({sessions,count:sessions.length})
    const seriesCode=crypto.randomUUID()
    db.transaction(()=>{for(const s of sessions){const r=db.prepare("INSERT INTO events(title,type,location,starts_at,ends_at) VALUES(?,'Entrenamiento',?,?,?)").run(p.data.title,venue.name,s.startsAt,s.endsAt);db.prepare('INSERT INTO scheduled_sessions(event_id,team_id,coach_id,venue_id,series_code) VALUES(?,?,?,?,?)').run(r.lastInsertRowid,p.data.teamId,p.data.coachId,p.data.venueId,seriesCode);db.prepare('INSERT INTO event_teams(event_id,team_id) VALUES(?,?)').run(r.lastInsertRowid,p.data.teamId)}audit(req,'create-series','events',0)})()
    res.status(201).json({count:sessions.length,seriesCode})
  })
  app.post('/api/attendance/qr',auth,permit('coaching'),remember,(req:UserRequest,res)=>{
    const p=z.object({code:z.string().trim().min(5).max(100),teamId:z.number().int().positive(),attendedOn:z.string().date()}).safeParse(req.body)
    if(!p.success)return void res.status(400).json({error:'Selecciona equipo, fecha y folio de credencial.'})
    const credential=db.prepare("SELECT credentials.athlete_id FROM credentials JOIN athletes ON athletes.id=athlete_id WHERE code=? AND revoked=0 AND valid_until>=? AND athletes.status IN ('active','trial')").get(p.data.code.toUpperCase(),new Date().toLocaleDateString('en-CA')) as {athlete_id:number}|undefined
    if(!credential)return void res.status(409).json({error:'Credencial no válida, vencida o atleta inactivo.'})
    if(!db.prepare('SELECT 1 FROM athlete_teams WHERE athlete_id=? AND team_id=? AND ended_at IS NULL').get(credential.athlete_id,p.data.teamId))return void res.status(409).json({error:'El atleta no pertenece al equipo seleccionado.'})
    const r=db.prepare("INSERT INTO attendance(athlete_id,team_id,attended_on,status,notes) VALUES(?,?,?,'present','Registro por QR') ON CONFLICT(athlete_id,team_id,attended_on) DO NOTHING").run(credential.athlete_id,p.data.teamId,p.data.attendedOn)
    if(r.changes)audit(req,'scan','attendance',Number(r.lastInsertRowid));res.json({created:!!r.changes,athlete:(db.prepare('SELECT name FROM athletes WHERE id=?').get(credential.athlete_id) as {name:string}).name})
  })
  app.get('/api/competition-tasks',auth,permit('coaching'),(req,res)=>{
    const eventId=Number(req.query.eventId);if(!Number.isInteger(eventId))return void res.status(400).json({error:'Selecciona una competencia.'})
    res.json(db.prepare('SELECT * FROM competition_tasks WHERE event_id=? ORDER BY due_on,id').all(eventId))
  })
  app.post('/api/competition-tasks',auth,permit('coaching'),remember,(req:UserRequest,res)=>{
    const p=z.object({eventId:z.number().int().positive(),title:z.string().trim().min(2).max(200),owner:z.string().max(120).default(''),dueOn:z.string().date().optional()}).safeParse(req.body)
    if(!p.success)return void res.status(400).json({error:'Indica competencia y tarea.'})
    if(!db.prepare("SELECT id FROM events WHERE id=? AND type='Competencia'").get(p.data.eventId))return void res.status(404).json({error:'Competencia no encontrada.'})
    const r=db.prepare('INSERT INTO competition_tasks(event_id,title,owner,due_on) VALUES(?,?,?,?)').run(p.data.eventId,p.data.title,p.data.owner,p.data.dueOn??null);audit(req,'create','competition_tasks',Number(r.lastInsertRowid));res.status(201).json({id:Number(r.lastInsertRowid)})
  })
  app.patch('/api/competition-tasks/:id',auth,permit('coaching'),(req:UserRequest,res)=>{
    const p=z.object({status:z.enum(['pending','done'])}).safeParse(req.body);if(!p.success)return void res.status(400).json({error:'Estado inválido.'})
    const r=db.prepare('UPDATE competition_tasks SET status=? WHERE id=?').run(p.data.status,Number(req.params.id));if(!r.changes)return void res.status(404).json({error:'Tarea no encontrada.'});audit(req,'update','competition_tasks',Number(req.params.id));res.json({ok:true})
  })
}
