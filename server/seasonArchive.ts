import type Database from 'better-sqlite3'
import type { Express, Request, RequestHandler } from 'express'
import { z } from 'zod'
type UserRequest=Request & {user?:{permissions:string[]}}
export function captureSeason(db:Database.Database,id:number) {
  if(db.prepare('SELECT 1 FROM season_archives WHERE season_id=?').get(id))return
  const season=db.prepare('SELECT * FROM seasons WHERE id=?').get(id) as {name:string;starts_on:string;ends_on:string}
  const result=db.prepare('INSERT INTO season_archives(season_id,name,starts_on,ends_on) VALUES(?,?,?,?)').run(id,season.name,season.starts_on,season.ends_on)
  const athletes=db.prepare('SELECT id,name,status FROM athletes ORDER BY name').all() as {id:number;name:string;status:string}[]
  const insert=db.prepare('INSERT INTO season_archive_athletes(archive_id,athlete_id,name,status,teams,attendance_count,attendance_rate,evaluation_count) VALUES(?,?,?,?,?,?,?,?)')
  for(const athlete of athletes) {
    const teams=db.prepare('SELECT t.name,c.name AS category,d.name AS discipline FROM athlete_teams x JOIN teams t ON t.id=x.team_id LEFT JOIN categories c ON c.id=t.category_id LEFT JOIN disciplines d ON d.id=c.discipline_id WHERE x.athlete_id=? AND x.ended_at IS NULL').all(athlete.id)
    const attendance=db.prepare("SELECT COUNT(*) n,ROUND(100.0*SUM(status IN ('present','late'))/NULLIF(COUNT(*),0),1) rate FROM attendance WHERE athlete_id=? AND attended_on BETWEEN ? AND ?").get(athlete.id,season.starts_on,season.ends_on) as {n:number;rate:number|null}
    const evaluations=db.prepare('SELECT (SELECT COUNT(*) FROM evaluations WHERE athlete_id=? AND date(evaluated_at) BETWEEN ? AND ?)+(SELECT COUNT(*) FROM skill_assessments WHERE athlete_id=? AND assessed_on BETWEEN ? AND ?) n').get(athlete.id,season.starts_on,season.ends_on,athlete.id,season.starts_on,season.ends_on) as {n:number}
    insert.run(result.lastInsertRowid,athlete.id,athlete.name,athlete.status,JSON.stringify(teams),attendance.n,attendance.rate,evaluations.n)
  }
}
export function registerSeasonArchive(app:Express,db:Database.Database,auth:RequestHandler) {
  db.exec(`CREATE TABLE IF NOT EXISTS season_archives(id INTEGER PRIMARY KEY,season_id INTEGER NOT NULL UNIQUE REFERENCES seasons(id),name TEXT NOT NULL,starts_on TEXT NOT NULL,ends_on TEXT NOT NULL,closed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS season_archive_athletes(id INTEGER PRIMARY KEY,archive_id INTEGER NOT NULL REFERENCES season_archives(id),athlete_id INTEGER NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL,teams TEXT NOT NULL,attendance_count INTEGER NOT NULL,attendance_rate REAL,evaluation_count INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS season_archive_roster ON season_archive_athletes(archive_id,name);
  `)
  const permit:RequestHandler=(req:UserRequest,res,next)=>{if(!req.user?.permissions.includes('coaching'))return void res.status(403).json({error:'Esta función requiere acceso deportivo.'});next()}
  app.get('/api/season-archives',auth,permit,(_req,res)=>res.json(db.prepare('SELECT a.*,(SELECT COUNT(*) FROM season_archive_athletes WHERE archive_id=a.id) AS athletes FROM season_archives a ORDER BY a.id DESC').all()))
  app.get('/api/season-archives/:id',auth,permit,(req,res)=>{
    const p=z.object({page:z.coerce.number().int().min(1).default(1)}).safeParse(req.query)
    if(!p.success)return void res.status(400).json({error:'Página inválida.'})
    const archive=db.prepare('SELECT * FROM season_archives WHERE id=?').get(Number(req.params.id))
    if(!archive)return void res.status(404).json({error:'Archivo no encontrado.'})
    const total=(db.prepare('SELECT COUNT(*) n FROM season_archive_athletes WHERE archive_id=?').get(Number(req.params.id)) as {n:number}).n
    const rows=(db.prepare('SELECT * FROM season_archive_athletes WHERE archive_id=? ORDER BY name LIMIT 25 OFFSET ?').all(Number(req.params.id),(p.data.page-1)*25) as {teams:string}[]).map(r=>({...r,teams:JSON.parse(r.teams)}))
    res.json({archive,total,rows,page:p.data.page})
  })
}
