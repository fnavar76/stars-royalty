import 'dotenv/config'
import { registerEvolution } from './evolution.js'
import { idempotency } from './idempotency.js'
import { registerSports } from './sports.js'
import { registerBackups } from './backups.js'
import { registerCommercial } from './commercial.js'
import { registerWardrobe } from './wardrobe.js'
import { registerLedger } from './ledger.js'
import { registerSeasonArchive } from './seasonArchive.js'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import Database from 'better-sqlite3'
import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import { z } from 'zod'

const app = express()
const port = Number(process.env.API_PORT ?? 4000)
const production = process.env.NODE_ENV === 'production'
const demoEnabled = !production && process.env.SEED_DEMO !== 'false'
const jwtSecret = process.env.JWT_SECRET ?? 'stars-royalty-local-change-this-secret'
if (production && (jwtSecret.length < 32 || jwtSecret.includes('change') || jwtSecret.includes('replace'))) throw new Error('Configura JWT_SECRET con al menos 32 caracteres aleatorios antes de iniciar en producción.')
const db = new Database(process.env.DATABASE_FILE ?? 'starsroyalty.db')
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, permissions TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, role_id INTEGER NOT NULL REFERENCES roles(id), guardian_id INTEGER REFERENCES guardians(id), name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS disciplines (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, code TEXT, description TEXT, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, discipline_id INTEGER NOT NULL REFERENCES disciplines(id), name TEXT NOT NULL, season TEXT NOT NULL, min_age INTEGER, max_age INTEGER, level TEXT, gender TEXT DEFAULT 'Mixto', notes TEXT, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY, category_id INTEGER REFERENCES categories(id), name TEXT NOT NULL, coach_id INTEGER REFERENCES users(id), status TEXT NOT NULL DEFAULT 'active');
CREATE TABLE IF NOT EXISTS guardians (id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT);
CREATE TABLE IF NOT EXISTS athletes (id INTEGER PRIMARY KEY, guardian_id INTEGER REFERENCES guardians(id), category_id INTEGER REFERENCES categories(id), name TEXT NOT NULL, birth_date TEXT, gender TEXT, phone TEXT, address TEXT, medical_notes TEXT, emergency_contact TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, photo_data TEXT);
CREATE TABLE IF NOT EXISTS athlete_teams (athlete_id INTEGER NOT NULL REFERENCES athletes(id), team_id INTEGER NOT NULL REFERENCES teams(id), role TEXT NOT NULL DEFAULT 'Titular', position TEXT DEFAULT 'General', started_at TEXT NOT NULL DEFAULT CURRENT_DATE, ended_at TEXT, PRIMARY KEY (athlete_id, team_id, started_at));
CREATE TABLE IF NOT EXISTS evaluations (id INTEGER PRIMARY KEY, athlete_id INTEGER NOT NULL REFERENCES athletes(id), coach_id INTEGER REFERENCES users(id), technique INTEGER, flexibility INTEGER, strength INTEGER, attitude INTEGER, teamwork INTEGER, stunts INTEGER DEFAULT 0, tumbling INTEGER DEFAULT 0, jumps INTEGER DEFAULT 0, private_notes TEXT, feedback TEXT, evaluated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS rubrics (id INTEGER PRIMARY KEY, discipline_id INTEGER REFERENCES disciplines(id), name TEXT NOT NULL, description TEXT, criteria TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY, athlete_id INTEGER NOT NULL REFERENCES athletes(id), title TEXT NOT NULL, horizon TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, due_date TEXT);
CREATE TABLE IF NOT EXISTS injuries (id INTEGER PRIMARY KEY, athlete_id INTEGER NOT NULL REFERENCES athletes(id), description TEXT NOT NULL, restriction TEXT, reported_at TEXT NOT NULL DEFAULT CURRENT_DATE, return_date TEXT, status TEXT NOT NULL DEFAULT 'active', private_notes TEXT);
CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY, athlete_id INTEGER NOT NULL REFERENCES athletes(id), team_id INTEGER REFERENCES teams(id), attended_on TEXT NOT NULL, status TEXT NOT NULL, notes TEXT, UNIQUE(athlete_id, team_id, attended_on));
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL, location TEXT, starts_at TEXT NOT NULL, ends_at TEXT, cost REAL DEFAULT 0, notes TEXT, checklist TEXT, results TEXT);
CREATE TABLE IF NOT EXISTS event_teams (event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, team_id INTEGER NOT NULL REFERENCES teams(id), status TEXT NOT NULL DEFAULT 'convoked', notes TEXT, PRIMARY KEY (event_id, team_id));
CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY, athlete_id INTEGER REFERENCES athletes(id), concept TEXT NOT NULL, amount REAL NOT NULL, due_date TEXT, paid_at TEXT, status TEXT NOT NULL DEFAULT 'pending', discount REAL DEFAULT 0, late_fee REAL DEFAULT 0, payment_method TEXT);
CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, sku TEXT UNIQUE, name TEXT NOT NULL, category TEXT, size TEXT, color TEXT, cost REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0, min_stock INTEGER NOT NULL DEFAULT 2);
CREATE TABLE IF NOT EXISTS inventory_movements (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), kind TEXT NOT NULL, quantity INTEGER NOT NULL, reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS wardrobe_assignments (id INTEGER PRIMARY KEY, athlete_id INTEGER NOT NULL REFERENCES athletes(id), team_id INTEGER REFERENCES teams(id), garment TEXT NOT NULL, size TEXT, event_id INTEGER REFERENCES events(id), status TEXT NOT NULL DEFAULT 'pending', delivered_at TEXT, returned_at TEXT);
CREATE TABLE IF NOT EXISTS documents (id INTEGER PRIMARY KEY, athlete_id INTEGER REFERENCES athletes(id), name TEXT NOT NULL, path TEXT, doc_type TEXT DEFAULT 'otro', file_data TEXT, expires_at TEXT, visibility TEXT NOT NULL DEFAULT 'private', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS credentials (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), athlete_id INTEGER REFERENCES athletes(id), code TEXT NOT NULL UNIQUE, valid_until TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS communications (id INTEGER PRIMARY KEY, author_id INTEGER REFERENCES users(id), audience TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'app', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER, metadata TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY, concept TEXT NOT NULL, category TEXT NOT NULL, amount REAL NOT NULL, incurred_on TEXT NOT NULL, vendor TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS venues (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, location TEXT, capacity INTEGER DEFAULT 30, description TEXT, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS guardian_consents (guardian_id INTEGER PRIMARY KEY REFERENCES guardians(id), signer_name TEXT NOT NULL, signed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS family_messages (id INTEGER PRIMARY KEY, guardian_id INTEGER NOT NULL REFERENCES guardians(id), athlete_id INTEGER REFERENCES athletes(id), subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`)

// Safe column migrations
try { db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0') } catch {}
try { db.exec('ALTER TABLE athletes ADD COLUMN photo_data TEXT') } catch {}
try { db.exec('ALTER TABLE categories ADD COLUMN active INTEGER NOT NULL DEFAULT 1') } catch {}
try { db.exec('ALTER TABLE athlete_teams ADD COLUMN position TEXT DEFAULT "General"') } catch {}
try { db.exec('ALTER TABLE payments ADD COLUMN payment_method TEXT') } catch {}
try { db.exec('ALTER TABLE documents ADD COLUMN doc_type TEXT DEFAULT "otro"') } catch {}
try { db.exec('ALTER TABLE documents ADD COLUMN file_data TEXT') } catch {}
try { db.exec('ALTER TABLE documents ADD COLUMN created_at TEXT') } catch {}
try { db.exec('ALTER TABLE products ADD COLUMN active INTEGER NOT NULL DEFAULT 1') } catch {}
try { db.exec('ALTER TABLE events ADD COLUMN checklist TEXT') } catch {}
try { db.exec('ALTER TABLE events ADD COLUMN results TEXT') } catch {}
try { db.exec('ALTER TABLE evaluations ADD COLUMN stunts INTEGER DEFAULT 0') } catch {}
try { db.exec('ALTER TABLE evaluations ADD COLUMN tumbling INTEGER DEFAULT 0') } catch {}
try { db.exec('ALTER TABLE evaluations ADD COLUMN jumps INTEGER DEFAULT 0') } catch {}
try { db.exec('ALTER TABLE evaluations ADD COLUMN rubric_id INTEGER REFERENCES rubrics(id)') } catch {}
try { db.exec('ALTER TABLE disciplines ADD COLUMN code TEXT') } catch {}
try { db.exec('ALTER TABLE disciplines ADD COLUMN description TEXT') } catch {}
try { db.exec('ALTER TABLE categories ADD COLUMN min_age INTEGER') } catch {}
try { db.exec('ALTER TABLE categories ADD COLUMN max_age INTEGER') } catch {}
try { db.exec('ALTER TABLE categories ADD COLUMN level TEXT') } catch {}
try { db.exec('ALTER TABLE categories ADD COLUMN gender TEXT DEFAULT "Mixto"') } catch {}
try { db.exec('ALTER TABLE categories ADD COLUMN notes TEXT') } catch {}
try { db.exec('ALTER TABLE athletes ADD COLUMN category_id INTEGER REFERENCES categories(id)') } catch {}
try { db.exec('ALTER TABLE athletes ADD COLUMN gender TEXT') } catch {}
try { db.exec('ALTER TABLE athletes ADD COLUMN address TEXT') } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN guardian_id INTEGER REFERENCES guardians(id)') } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN photo_data TEXT') } catch {}
try { db.exec("ALTER TABLE roles ADD COLUMN permissions TEXT NOT NULL DEFAULT '[]'") } catch {}
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_unique ON categories (discipline_id, name, season)') } catch {}
try { db.exec("UPDATE documents SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)") } catch {}

const roles = [
  'Administrador general',
  'Head Coach',
  'Coach',
  'Personal administrativo',
  'Finanzas / caja',
  'Inventario / ventas',
  'Atleta',
  'Padres y tutores'
]
const addRole = db.prepare('INSERT OR IGNORE INTO roles (name) VALUES (?)')
roles.forEach((role) => addRole.run(role))

// Demo records are inserted once, never reapplied over operational data.
if (demoEnabled && !db.prepare("SELECT 1 FROM app_meta WHERE key = 'demo-seeded-v1'").get()) {
  db.transaction(() => {
const defaultUsers = [
  { name: 'Mariana Rivera', email: 'admin@starsroyalty.local', role: 'Administrador general', pass: 'ChangeMe123!' },
  { name: 'Andrea Salgado', email: 'headcoach@starsroyalty.local', role: 'Head Coach', pass: 'ChangeMe123!' },
  { name: 'Laura Torres', email: 'coach@starsroyalty.local', role: 'Coach', pass: 'ChangeMe123!' },
  { name: 'Carlos Méndez', email: 'finanzas@starsroyalty.local', role: 'Finanzas / caja', pass: 'ChangeMe123!' },
  { name: 'Familia González', email: 'tutor@starsroyalty.local', role: 'Padres y tutores', pass: 'ChangeMe123!' }
]

defaultUsers.forEach(u => {
  const roleObj = db.prepare('SELECT id FROM roles WHERE name = ?').get(u.role) as { id: number } | undefined
  if (roleObj) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email)
    if (!existing) {
      db.prepare('INSERT INTO users (role_id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(
        roleObj.id,
        u.name,
        u.email,
        bcrypt.hashSync(u.pass, 10)
      )
    }
  }
})

// Seed initial venues if empty
if ((db.prepare('SELECT COUNT(*) as cnt FROM venues').get() as { cnt: number }).cnt === 0) {
  const insertVenue = db.prepare('INSERT INTO venues (name, location, capacity, description) VALUES (?, ?, ?, ?)')
  insertVenue.run('Pista de Resorte Cheer (Spring Floor)', 'Planta Baja - Área Central', 35, 'Pista profesional de 9 franjas reglamentaria para Cheerleading nivel 1 al 6.')
  insertVenue.run('Salón de Tumbling y Trampolín', 'Planta Baja - Ala Norte', 20, 'Fosa de espuma, tumble track y trampolín para progresión acrobática.')
  insertVenue.run('Gimnasio Olímpico (Aparatos)', 'Planta Alta - Área Gimnasia', 25, 'Viga de equilibrio, barras asimétricas, salto y pista de piso acolchado.')
  insertVenue.run('Sala de Flexibilidad y Coreografía', 'Planta Alta - Sala C', 18, 'Espejos de cuerpo completo, barras de ballet y sistema de audio.')
}

// Seed initial expenses if empty
if ((db.prepare('SELECT COUNT(*) as cnt FROM expenses').get() as { cnt: number }).cnt === 0) {
  const insertExpense = db.prepare('INSERT INTO expenses (concept, category, amount, incurred_on, vendor, notes) VALUES (?, ?, ?, ?, ?, ?)')
  insertExpense.run('Renta de instalaciones principales', 'Instalaciones', 38000, '2026-09-01', 'Inmobiliaria Premier', 'Mensualidad nave deportiva')
  insertExpense.run('Mantenimiento y desinfección de colchonetas', 'Mantenimiento', 4500, '2026-09-05', 'Sanifix Deportes', 'Desinfección profunda de piso spring y fosa')
  insertExpense.run('Honorarios de Coaches quincena 1', 'Nómina', 42500, '2026-09-15', 'Nómina Staff Deportivo', 'Coaches Cheerleading y Gimnasia')
  insertExpense.run('Proveedor tela de vestuarios y moños', 'Vestuario', 12800, '2026-09-10', 'Textiles Royal Gold', 'Telas moradas con foil dorado para uniformes')
}

function ensureDiscipline(name: string, code: string, description: string) {
  const existing = db.prepare('SELECT id FROM disciplines WHERE name = ?').get(name) as { id: number } | undefined
  if (existing) return existing.id
  return Number(db.prepare('INSERT INTO disciplines (name, code, description) VALUES (?, ?, ?)').run(name, code, description).lastInsertRowid)
}

function ensureCategory(disciplineId: number, name: string, season: string, extras: { minAge?: number; maxAge?: number; level?: string; gender?: string; notes?: string }) {
  const existing = db.prepare('SELECT id FROM categories WHERE discipline_id = ? AND name = ? AND season = ?').get(disciplineId, name, season) as { id: number } | undefined
  if (existing) return existing.id
  return Number(db.prepare(`
    INSERT INTO categories (discipline_id, name, season, min_age, max_age, level, gender, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(disciplineId, name, season, extras.minAge ?? null, extras.maxAge ?? null, extras.level ?? null, extras.gender ?? 'Mixto', extras.notes ?? null).lastInsertRowid)
}

const cheerId = ensureDiscipline('Cheerleading', 'CHEER', 'Porristas All Star: stunts, pirámides, tumbling, jumps y coreografía.')
const gymId = ensureDiscipline('Gimnasia Artística', 'WAG', 'Aparatos olímpicos: salto, barras, viga y ejercicios de piso.')

if ((db.prepare('SELECT COUNT(*) AS value FROM rubrics').get() as { value: number }).value === 0) {
  const insertRubric = db.prepare('INSERT INTO rubrics (discipline_id, name, description, criteria) VALUES (?, ?, ?, ?)')
  insertRubric.run(cheerId, 'Rúbrica técnica Cheerleading', 'Seguimiento integral de ejecución, acrobacia y trabajo de equipo.', JSON.stringify(['Técnica y postura', 'Flexibilidad', 'Fuerza y resistencia', 'Actitud deportiva', 'Trabajo en equipo', 'Stunts y pirámides', 'Tumbling', 'Saltos']))
  insertRubric.run(gymId, 'Rúbrica técnica Gimnasia', 'Seguimiento técnico para aparatos, piso y preparación física.', JSON.stringify(['Técnica y postura', 'Flexibilidad', 'Fuerza específica', 'Actitud deportiva', 'Trabajo en equipo', 'Aparatos', 'Piso y acrobacia']))
}

const catJunior3 = ensureCategory(cheerId, 'Junior Nivel 3', '2026', { minAge: 12, maxAge: 18, level: 'Nivel 3', gender: 'Mixto', notes: 'All Star junior con tumbling y stunts de nivel 3.' })
const catSenior5 = ensureCategory(cheerId, 'Senior Nivel 5', '2026', { minAge: 14, maxAge: 18, level: 'Nivel 5', gender: 'Femenil', notes: 'Categoría elite de competencia nacional.' })
const catYouth2 = ensureCategory(cheerId, 'Youth Nivel 2', '2026', { minAge: 9, maxAge: 12, level: 'Nivel 2', gender: 'Mixto' })
const catGymInf = ensureCategory(gymId, 'Infantil Nivel 4', '2026', { minAge: 8, maxAge: 12, level: 'Nivel 4', gender: 'Femenil', notes: 'FIG infantil con all-around.' })
const catGymJuv = ensureCategory(gymId, 'Juvenil Nivel 6', '2026', { minAge: 13, maxAge: 17, level: 'Nivel 6', gender: 'Femenil' })

const coachAndrea = db.prepare("SELECT id FROM users WHERE email = 'headcoach@starsroyalty.local'").get() as { id: number } | undefined
const coachLaura = db.prepare("SELECT id FROM users WHERE email = 'coach@starsroyalty.local'").get() as { id: number } | undefined

function ensureTeam(name: string, categoryId: number, coachId?: number) {
  const existing = db.prepare('SELECT id FROM teams WHERE name = ?').get(name) as { id: number } | undefined
  if (existing) {
    db.prepare('UPDATE teams SET category_id = COALESCE(category_id, ?), coach_id = COALESCE(coach_id, ?) WHERE id = ?').run(categoryId, coachId ?? null, existing.id)
    return existing.id
  }
  return Number(db.prepare('INSERT INTO teams (name, category_id, coach_id) VALUES (?, ?, ?)').run(name, categoryId, coachId ?? null).lastInsertRowid)
}

const teamRoyalsSenior = ensureTeam('Royals Senior', catSenior5, coachAndrea?.id)
const teamRoyalsJunior = ensureTeam('Royals Junior', catJunior3, coachLaura?.id)
const teamRoyalsYouth = ensureTeam('Royals Youth', catYouth2, coachLaura?.id)
const teamGymStars = ensureTeam('Stars Artística Infantil', catGymInf, coachAndrea?.id)
ensureTeam('Stars Artística Juvenil', catGymJuv, coachAndrea?.id)

if ((db.prepare('SELECT COUNT(*) AS value FROM athletes').get() as { value: number }).value === 0) {
  const insertGuardian = db.prepare('INSERT INTO guardians (name, phone, email) VALUES (?, ?, ?)')
  const insertAthlete = db.prepare(`
    INSERT INTO athletes (guardian_id, category_id, name, birth_date, gender, phone, medical_notes, emergency_contact, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertRoster = db.prepare('INSERT INTO athlete_teams (athlete_id, team_id, role, position) VALUES (?, ?, ?, ?)')
  const insertPayment = db.prepare('INSERT INTO payments (athlete_id, concept, amount, due_date, status) VALUES (?, ?, ?, ?, ?)')

  const seedAthletes = [
    { name: 'Valentina González', birth: '2010-04-14', gender: 'Femenino', phone: '5512345678', guardian: 'Roberto González', gphone: '5598765432', medical: 'Alergia a la penicilina. Sin restricciones físicas.', emergency: 'Roberto González (Padre) 5598765432', categoryId: catSenior5, teamId: teamRoyalsSenior, role: 'Titular', position: 'Flyer', status: 'active' },
    { name: 'Camila Rodríguez', birth: '2011-11-05', gender: 'Femenino', phone: '5545678901', guardian: 'Carmen Rodríguez', gphone: '5565432109', medical: 'Sin antecedentes de riesgo.', emergency: 'Carmen Rodríguez 5565432109', categoryId: catSenior5, teamId: teamRoyalsSenior, role: 'Titular', position: 'Main Base', status: 'active' },
    { name: 'Emiliano Torres', birth: '2011-01-11', gender: 'Masculino', phone: '5534567890', guardian: 'Javier Torres', gphone: '5576543210', medical: 'Ninguna alergia.', emergency: 'Javier Torres (Padre) 5576543210', categoryId: catJunior3, teamId: teamRoyalsJunior, role: 'Titular', position: 'Backspot / Base', status: 'injured' },
    { name: 'Sofía Martínez', birth: '2012-08-20', gender: 'Femenino', phone: '5523456789', guardian: 'Lucía Martínez', gphone: '5587654321', medical: 'Asma leve controlada. Inhalador en maleta.', emergency: 'Lucía Martínez (Madre) 5587654321', categoryId: catGymInf, teamId: teamGymStars, role: 'Titular', position: 'All-Around (Gimnasta)', status: 'active' },
    { name: 'Renata López', birth: '2014-03-02', gender: 'Femenino', phone: '5556789012', guardian: 'Daniela López', gphone: '5550123456', medical: 'Ninguna.', emergency: 'Daniela López 5550123456', categoryId: catYouth2, teamId: teamRoyalsYouth, role: 'En prueba', position: 'Flyer', status: 'trial' }
  ]

  seedAthletes.forEach((item) => {
    const guardian = insertGuardian.run(item.guardian, item.gphone, null)
    const athlete = insertAthlete.run(Number(guardian.lastInsertRowid), item.categoryId, item.name, item.birth, item.gender, item.phone, item.medical, item.emergency, item.status)
    const athleteId = Number(athlete.lastInsertRowid)
    insertRoster.run(athleteId, item.teamId, item.role, item.position)
    insertPayment.run(athleteId, 'Mensualidad septiembre 2026', 2850, '2026-09-05', item.status === 'trial' ? 'pending' : 'paid')
  })
}

if ((db.prepare('SELECT COUNT(*) AS value FROM products').get() as { value: number }).value === 0) {
  const insertProduct = db.prepare('INSERT INTO products (sku, name, category, size, color, cost, price, stock, min_stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  insertProduct.run('SR-UNI26-M', 'Uniforme competencia 2026', 'Uniforme', 'M', 'Morado/Oro', 780, 1450, 12, 4)
  insertProduct.run('SR-MOÑO', 'Moño oficial Stars Royalty', 'Accesorio', 'Única', 'Morado', 35, 90, 40, 10)
  insertProduct.run('SR-GRIP', 'Grip y muñequeras', 'Gimnasia', 'S/M', 'Blanco', 80, 180, 6, 4)
  insertProduct.run('SR-SHORT', 'Short de práctica Royals', 'Práctica', 'S', 'Negro', 120, 280, 2, 5)
}

if ((db.prepare('SELECT COUNT(*) AS value FROM events').get() as { value: number }).value === 0) {
  const insertEvent = db.prepare('INSERT INTO events (title, type, location, starts_at, ends_at, cost, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
  insertEvent.run('Entrenamiento Royals Senior', 'Entrenamiento', 'Pista de Resorte Cheer (Spring Floor)', '2026-09-22T16:00', '2026-09-22T18:30', 0, 'Pirámides y tumbling de nivel 5')
  insertEvent.run('Copa All Star 2026', 'Competencia', 'Arena Ciudad de México', '2026-10-04T08:00', '2026-10-04T18:00', 1850, 'Inscripción por atleta. Checklist de vestuario obligatorio.')
  insertEvent.run('Clínica de flexibilidad', 'Evento', 'Sala de Flexibilidad y Coreografía', '2026-09-27T10:00', '2026-09-27T12:00', 350, 'Abierta a todas las categorías')
}

if ((db.prepare('SELECT COUNT(*) AS value FROM attendance').get() as { value: number }).value === 0) {
  const athletesForAttendance = db.prepare('SELECT id FROM athletes LIMIT 5').all() as { id: number }[]
  const insertAttendance = db.prepare('INSERT OR IGNORE INTO attendance (athlete_id, team_id, attended_on, status, notes) VALUES (?, ?, ?, ?, ?)')
  athletesForAttendance.forEach((athlete, index) => {
    insertAttendance.run(athlete.id, teamRoyalsSenior, '2026-09-18', index === 2 ? 'absent' : 'present', null)
    insertAttendance.run(athlete.id, teamRoyalsSenior, '2026-09-20', index === 4 ? 'late' : 'present', null)
  })
}

// Link the development family account to its real guardian record. In production
// this relationship is set when the family account is invited.
const demoGuardian = db.prepare('SELECT guardian_id FROM athletes WHERE guardian_id IS NOT NULL ORDER BY id LIMIT 1').get() as { guardian_id: number | null } | undefined
if (demoGuardian?.guardian_id) {
  db.prepare("UPDATE users SET guardian_id = ? WHERE email = 'tutor@starsroyalty.local' AND guardian_id IS NULL").run(demoGuardian.guardian_id)
}

    db.prepare("INSERT INTO app_meta (key, value) VALUES ('demo-seeded-v1', '1')").run()
  })()
}
// A clean installation receives only the explicitly configured administrator.
if (!(db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n) {
  const email = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD
  if (!email || !password || password.length < 12 || password === 'ChangeMe123!') throw new Error('Configura SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD (mínimo 12 caracteres) para inicializar la academia.')
  const role = db.prepare("SELECT id FROM roles WHERE name = 'Administrador general'").get() as { id: number }
  db.prepare('INSERT INTO users (name, email, role_id, password_hash) VALUES (?, ?, ?, ?)').run('Administración Stars Royalty', email.trim().toLowerCase(), role.id, bcrypt.hashSync(password, 12))
}

if (production) {
  const activeUsers = db.prepare('SELECT password_hash FROM users WHERE active = 1').all() as { password_hash: string }[]
  if (activeUsers.some(user => bcrypt.compareSync('ChangeMe123!', user.password_hash))) throw new Error('Hay cuentas activas con la contraseña de demostración. Cambia sus contraseñas o desactívalas antes de iniciar producción.')
}

app.use(helmet())
const configuredOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173'
app.use(cors({ origin: (origin, callback) => {
  const isLocalDevelopment = !origin || /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
  callback(null, (!production && isLocalDevelopment) || !origin || origin === configuredOrigin)
} }))
app.use(express.json({ limit: '15mb' }))

type AuthRequest = Request & { user?: { id: number; role: string; email: string; permissions: string[] } }
function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.header('authorization')?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Autenticación requerida' })
  try {
    const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as { sub: string; version?: number }
    const current = db.prepare('SELECT users.id, users.email, users.active, users.token_version, roles.name AS role, roles.permissions FROM users JOIN roles ON roles.id = users.role_id WHERE users.id = ?').get(Number(payload.sub)) as { id: number; email: string; active: number; token_version: number; role: string; permissions: string } | undefined
    if (!current?.active || (payload.version ?? 0) !== current.token_version) return res.status(401).json({ error: 'La cuenta o sesión ya no está activa. Inicia sesión nuevamente.' })
    req.user = { id: current.id, email: current.email, role: current.role, permissions: expandPermissions(JSON.parse(current.permissions)) }

    next()
  } catch { return res.status(401).json({ error: 'Sesión inválida o expirada' }) }
}

const access = {
  medical: ['Administrador general', 'Personal administrativo', 'Head Coach', 'Coach'],
  documents: ['Administrador general', 'Personal administrativo', 'Head Coach', 'Coach'],
  admin: ['Administrador general', 'Personal administrativo'],
  sportsLead: ['Administrador general', 'Personal administrativo', 'Head Coach'],
  coaching: ['Administrador general', 'Personal administrativo', 'Head Coach', 'Coach'],
  finance: ['Administrador general', 'Personal administrativo', 'Finanzas / caja'],
  inventory: ['Administrador general', 'Personal administrativo', 'Inventario / ventas', 'Finanzas / caja'],
  staff: ['Administrador general', 'Personal administrativo', 'Head Coach', 'Coach', 'Finanzas / caja', 'Inventario / ventas']
} as const

const scopeChildren: Record<string, string[]> = {
  admin: ['sportsLead', 'coaching', 'finance', 'inventory', 'staff', 'medical', 'documents'],
  sportsLead: ['coaching', 'staff'], coaching: ['staff'], finance: ['inventory', 'staff'], inventory: ['staff'], staff: []
}
function expandPermissions(scopes: string[]): string[] {
  return [...new Set(scopes.flatMap((scope) => [scope, ...(scopeChildren[scope] ?? [])]))]
}
if (!db.prepare("SELECT 1 FROM app_meta WHERE key = 'permissions-v1'").get()) {
  db.transaction(() => {
    for (const role of roles) {
      const defaults = Object.entries(access).filter(([, names]) => (names as readonly string[]).includes(role)).map(([scope]) => scope)
      db.prepare("UPDATE roles SET permissions = ? WHERE name = ? AND permissions = '[]'").run(JSON.stringify(defaults), role)
    }
    db.prepare("INSERT INTO app_meta (key,value) VALUES ('permissions-v1','1')").run()
  })()
}
if (!db.prepare("SELECT 1 FROM app_meta WHERE key='sensitive-permissions-v1'").get()) db.transaction(()=>{
  const records=db.prepare('SELECT id,permissions FROM roles').all() as {id:number;permissions:string}[]
  for (const role of records) {const scopes=JSON.parse(role.permissions) as string[];if(expandPermissions(scopes).includes('coaching'))db.prepare('UPDATE roles SET permissions=? WHERE id=?').run(JSON.stringify([...new Set([...scopes,'medical','documents'])]),role.id)}
  db.prepare("INSERT INTO app_meta(key,value) VALUES('sensitive-permissions-v1','1')").run()
})()
function requireRole(allowed: readonly string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const scope = Object.entries(access).find(([, names]) => names === allowed)?.[0]
    if (!scope || !req.user?.permissions.includes(scope)) return res.status(403).json({ error: 'No tienes permiso para realizar esta operación.' })
    next()
  }
}

function familyGuardianId(userId: number) {
  return (db.prepare('SELECT guardian_id FROM users WHERE id = ? AND active = 1').get(userId) as { guardian_id: number | null } | undefined)?.guardian_id ?? null
}

function parentOnly(req: AuthRequest, res: Response) {
  if (req.user?.role !== 'Padres y tutores') {
    res.status(403).json({ error: 'Este recurso solo está disponible para tutores.' })
    return false
  }
  if (!familyGuardianId(req.user.id)) {
    res.status(403).json({ error: 'La cuenta no está vinculada a un tutor.' })
    return false
  }
  return true
}

function audit(userId: number, action: string, entity: string, entityId?: number, metadata?: unknown) {
  try {
    db.prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata) VALUES (?, ?, ?, ?, ?)').run(
      userId, action, entity, entityId ?? null, metadata ? JSON.stringify(metadata) : null
    )
  } catch (err) {
    console.error('Audit log error:', err)
  }
}

// Health & Auth
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'stars-royalty-api', time: new Date().toISOString() }))

const loginAttempts = new Map<string, { count: number; until: number }>()
app.post('/api/auth/login', (req, res) => {
  const now = Date.now()
  for (const [key, value] of loginAttempts) if (value.until <= now) loginAttempts.delete(key)
  const client = req.ip ?? 'local'
  const attempt = loginAttempts.get(client)
  if (attempt && attempt.count >= 20) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.' })

  const body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(6).max(160) }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'Correo y contraseña inválidos' })
  const user = db.prepare('SELECT users.id, users.name, users.email, users.photo_data, users.password_hash, users.token_version, roles.name AS role, roles.permissions FROM users JOIN roles ON roles.id = users.role_id WHERE users.email = ? AND users.active = 1').get(body.data.email) as { id: number; name: string; email: string; photo_data?: string; password_hash: string; token_version: number; role: string; permissions: string } | undefined
  if (!user || !bcrypt.compareSync(body.data.password, user.password_hash)) { loginAttempts.set(client, { count: (attempt?.count ?? 0) + 1, until: attempt?.until ?? now + 900000 }); return res.status(401).json({ error: 'Credenciales incorrectas' }) }
  loginAttempts.delete(client)
  const token = jwt.sign({ version: user.token_version }, jwtSecret, { subject: String(user.id), expiresIn: '8h' })
  audit(user.id, 'login', 'users', user.id)
  let permissions: string[] = []
  try { permissions = expandPermissions(JSON.parse(user.permissions) as string[]) } catch {}
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email, photo_data: user.photo_data, role: user.role, permissions } })
})

// Role impersonation is available only in explicit local demo mode.
app.post('/api/auth/switch-role', auth, requireRole(access.admin), (req: AuthRequest, res) => {
  if (!demoEnabled) return res.status(404).json({ error: 'Función de demostración deshabilitada.' })
  const body = z.object({ targetRole: z.string() }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'Rol inválido.' })
  const user = db.prepare('SELECT users.id, users.name, users.email, users.photo_data, users.token_version, roles.name AS role, roles.permissions FROM users JOIN roles ON roles.id = users.role_id WHERE roles.name = ? AND users.active = 1 LIMIT 1').get(body.data.targetRole) as { id: number; name: string; email: string; token_version: number; role: string; permissions: string } | undefined
  if (!user) return res.status(404).json({ error: 'No existe una cuenta activa para ese rol.' })
  const token = jwt.sign({ version: user.token_version }, jwtSecret, { subject: String(user.id), expiresIn: '8h' })
  audit(req.user!.id, 'demo-switch', 'users', user.id)
  res.json({ token, user: { ...user, permissions: expandPermissions(JSON.parse(user.permissions)) } })
})

app.get('/api/auth/me', auth, (req: AuthRequest, res) => {
  const user = db.prepare('SELECT users.id, users.name, users.email, users.photo_data, roles.name AS role, roles.permissions FROM users JOIN roles ON roles.id = users.role_id WHERE users.id = ?').get(req.user!.id) as { id: number; name: string; email: string; photo_data?: string; role: string; permissions: string } | undefined
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' })
  let permissions: string[] = []
  try { permissions = expandPermissions(JSON.parse(user.permissions) as string[]) } catch {}
  res.json({ ...user, permissions })
})

const permissionScopes = z.enum(['admin', 'sportsLead', 'coaching', 'finance', 'inventory', 'staff', 'medical', 'documents'])
const systemRoleNames = new Set(roles)

app.get('/api/roles', auth, requireRole(access.admin), (_req, res) => {
  const roleRows = db.prepare('SELECT id, name, permissions FROM roles ORDER BY name').all() as { id: number; name: string; permissions: string }[]
  res.json(roleRows.map((role) => {
    let permissions: string[] = []
    try { permissions = JSON.parse(role.permissions) as string[] } catch {}
    return { ...role, permissions, system: systemRoleNames.has(role.name) }
  }))
})

app.post('/api/roles', auth, requireRole(access.admin), (req: AuthRequest, res) => {
  const body = z.object({ name: z.string().trim().min(3).max(80), permissions: z.array(permissionScopes).default([]) }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'Datos de rol inválidos.' })
  try {
    const result = db.prepare('INSERT INTO roles (name, permissions) VALUES (?, ?)').run(body.data.name, JSON.stringify([...new Set(body.data.permissions)]))
    audit(req.user!.id, 'create', 'roles', Number(result.lastInsertRowid), body.data)
    res.status(201).json({ id: Number(result.lastInsertRowid) })
  } catch { res.status(409).json({ error: 'Ya existe un rol con ese nombre.' }) }
})

app.patch('/api/roles/:id', auth, requireRole(access.admin), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const body = z.object({ name: z.string().trim().min(3).max(80).optional(), permissions: z.array(permissionScopes).optional() }).safeParse(req.body)
  if (!Number.isInteger(id) || !body.success || (!body.data.name && !body.data.permissions)) return res.status(400).json({ error: 'Actualización de rol inválida.' })
  const role = db.prepare('SELECT name FROM roles WHERE id = ?').get(id) as { name: string } | undefined
  if (!role) return res.status(404).json({ error: 'Rol no encontrado.' })
  if (systemRoleNames.has(role.name) && body.data.name && body.data.name !== role.name) return res.status(409).json({ error: 'Los roles del sistema no pueden cambiar de nombre.' })
  if (role.name === 'Administrador general' && body.data.permissions && !body.data.permissions.includes('admin')) return res.status(409).json({ error: 'El rol Administrador general debe conservar administración.' })
  try {
    db.prepare('UPDATE roles SET name = COALESCE(?, name), permissions = COALESCE(?, permissions) WHERE id = ?').run(
      body.data.name ?? null,
      body.data.permissions ? JSON.stringify([...new Set(body.data.permissions)]) : null,
      id
    )
    audit(req.user!.id, 'update', 'roles', id, body.data)
    res.json({ ok: true })
  } catch { res.status(409).json({ error: 'Ya existe un rol con ese nombre.' }) }
})

app.delete('/api/roles/:id', auth, requireRole(access.admin), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identificador de rol inválido.' })
  const role = db.prepare('SELECT name FROM roles WHERE id = ?').get(id) as { name: string } | undefined
  if (!role) return res.status(404).json({ error: 'Rol no encontrado.' })
  if (systemRoleNames.has(role.name)) return res.status(409).json({ error: 'Los roles del sistema no se pueden eliminar.' })
  const assigned = (db.prepare('SELECT COUNT(*) AS value FROM users WHERE role_id = ?').get(id) as { value: number }).value
  if (assigned) return res.status(409).json({ error: `No se puede eliminar: hay ${assigned} usuario(s) asignado(s) a este rol.` })
  db.prepare('DELETE FROM roles WHERE id = ?').run(id)
  audit(req.user!.id, 'delete', 'roles', id, { name: role.name })
  res.json({ ok: true })
})

app.get('/api/coaches', auth, requireRole(access.coaching), (_req, res) => {
  const users = db.prepare('SELECT users.id, users.name, roles.name AS role, roles.permissions FROM users JOIN roles ON roles.id = users.role_id WHERE users.active = 1 ORDER BY users.name').all() as { id: number; name: string; role: string; permissions: string }[]
  res.json(users.filter((user) => expandPermissions(JSON.parse(user.permissions)).includes('coaching')).map(({ id, name, role }) => ({ id, name, role })))
})

app.get('/api/users', auth, requireRole(access.admin), (_req, res) => {
  res.json(db.prepare('SELECT users.id, users.name, users.email, users.photo_data, users.active, users.role_id, users.guardian_id, roles.name as role FROM users JOIN roles ON roles.id = users.role_id ORDER BY roles.name, users.name').all())
})

app.get('/api/guardians', auth, requireRole(access.admin), (_req, res) => {
  res.json(db.prepare('SELECT id, name, email FROM guardians ORDER BY name').all())
})

app.patch('/api/users/:id/guardian', auth, requireRole(access.admin), (req: AuthRequest, res) => {
  const body = z.object({ guardianId: z.number().int().positive().nullable() }).safeParse(req.body)
  const id = Number(req.params.id)
  if (!body.success || !Number.isInteger(id)) return res.status(400).json({ error: 'Tutor inválido.' })
  if (body.data.guardianId && !db.prepare('SELECT id FROM guardians WHERE id = ?').get(body.data.guardianId)) return res.status(404).json({ error: 'Tutor no encontrado.' })
  const result = db.prepare('UPDATE users SET guardian_id = ?, token_version = token_version + 1 WHERE id = ?').run(body.data.guardianId, id)
  if (!result.changes) return res.status(404).json({ error: 'Usuario no encontrado.' })
  audit(req.user!.id, 'link-guardian', 'users', id, body.data)
  res.json({ ok: true })
})

app.post('/api/users', auth, requireRole(access.admin), (req: AuthRequest, res) => {
  const photoData = z.string().regex(/^data:image\/(jpeg|jpg|png|webp|gif);base64,/).max(3_000_000)
  const body = z.object({ name: z.string().trim().min(2).max(120), email: z.string().email().max(160), password: z.string().min(8).max(160), roleId: z.number().int().positive(), active: z.boolean().optional(), photoData: photoData.optional() }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'Datos de usuario inválidos. La contraseña debe tener al menos 8 caracteres.' })
  if (!db.prepare('SELECT id FROM roles WHERE id = ?').get(body.data.roleId)) return res.status(400).json({ error: 'El rol seleccionado no existe.' })
  try {
    const result = db.prepare('INSERT INTO users (role_id, name, email, password_hash, active, photo_data) VALUES (?, ?, ?, ?, ?, ?)').run(
      body.data.roleId, body.data.name, body.data.email.toLowerCase(), bcrypt.hashSync(body.data.password, 10), body.data.active === false ? 0 : 1, body.data.photoData ?? null
    )
    audit(req.user!.id, 'create', 'users', Number(result.lastInsertRowid), { name: body.data.name, email: body.data.email, roleId: body.data.roleId })
    res.status(201).json({ id: Number(result.lastInsertRowid) })
  } catch { res.status(409).json({ error: 'Ya existe una cuenta con ese correo electrónico.' }) }
})

app.patch('/api/users/:id', auth, requireRole(access.admin), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const photoData = z.string().regex(/^data:image\/(jpeg|jpg|png|webp|gif);base64,/).max(3_000_000)
  const body = z.object({ name: z.string().trim().min(2).max(120).optional(), roleId: z.number().int().positive().optional(), active: z.boolean().optional(), password: z.string().min(8).max(160).optional(), photoData: photoData.nullable().optional() }).safeParse(req.body)
  if (!Number.isInteger(id) || !body.success || Object.keys(body.data).length === 0) return res.status(400).json({ error: 'Actualización de usuario inválida.' })
  if (id === req.user!.id && (body.data.active === false || body.data.roleId !== undefined)) return res.status(409).json({ error: 'No puedes desactivar tu cuenta ni cambiar tu propio rol.' })
  if (body.data.roleId && !db.prepare('SELECT id FROM roles WHERE id = ?').get(body.data.roleId)) return res.status(400).json({ error: 'El rol seleccionado no existe.' })
  const result = db.prepare(`UPDATE users SET name = COALESCE(?, name), role_id = COALESCE(?, role_id), active = COALESCE(?, active), password_hash = COALESCE(?, password_hash), photo_data = CASE WHEN ? THEN ? ELSE photo_data END WHERE id = ?`).run(
    body.data.name ?? null, body.data.roleId ?? null, body.data.active === undefined ? null : Number(body.data.active), body.data.password ? bcrypt.hashSync(body.data.password, 10) : null, body.data.photoData !== undefined ? 1 : 0, body.data.photoData ?? null, id
  )
  if (!result.changes) return res.status(404).json({ error: 'Usuario no encontrado.' })
  if (body.data.password || body.data.active === false || body.data.roleId) db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(id)
  audit(req.user!.id, 'update', 'users', id, { ...body.data, photoData: body.data.photoData ? '[actualizada]' : body.data.photoData, password: body.data.password ? '[actualizada]' : undefined })
  res.json({ ok: true })
})

const rememberMutation = idempotency(db)

// Dashboard Summary
app.get('/api/dashboard', auth, requireRole(access.staff), (req: AuthRequest, res) => {
  const count = (query: string) => (db.prepare(query).get() as { value: number }).value
  const dateParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: string) => dateParts.find((item) => item.type === type)?.value ?? ''
  const today = `${part('year')}-${part('month')}-${part('day')}`
  const monthStart = `${today.slice(0, 7)}-01`
  const monthEnd = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1).toISOString().slice(0, 10)
  const performance = db.prepare(`
    SELECT
      ROUND(AVG((technique + flexibility + strength + attitude + teamwork) / 5.0), 1) AS average,
      ROUND(AVG(technique), 1) AS technique,
      ROUND(AVG(flexibility), 1) AS flexibility,
      ROUND(AVG(strength), 1) AS strength
    FROM evaluations
  `).get() as { average: number | null; technique: number | null; flexibility: number | null; strength: number | null }
  const history = db.prepare(`
    SELECT date(evaluated_at) AS date,
      ROUND(AVG((technique + flexibility + strength + attitude + teamwork) / 5.0), 1) AS score
    FROM evaluations
    GROUP BY date(evaluated_at)
    ORDER BY date(evaluated_at) DESC
    LIMIT 6
  `).all() as Array<{ date: string; score: number }>
  const upcomingEvents = db.prepare(`
    SELECT id, title, type, location, starts_at, ends_at, cost
    FROM events WHERE starts_at >= ?
    ORDER BY starts_at ASC LIMIT 5
  `).all(today)
  const attendanceByTeam = db.prepare(`
    SELECT teams.id, teams.name,
      ROUND(100.0 * SUM(CASE WHEN attendance.status IN ('present', 'late') THEN 1 ELSE 0 END) / NULLIF(COUNT(attendance.id), 0), 1) AS rate,
      COUNT(attendance.id) AS records
    FROM teams
    LEFT JOIN attendance ON attendance.team_id = teams.id
    WHERE teams.status = 'active'
    GROUP BY teams.id, teams.name
    HAVING COUNT(attendance.id) > 0
    ORDER BY rate DESC, teams.name ASC
    LIMIT 5
  `).all()
  const nextCompetition = db.prepare(`
    SELECT events.id, events.title, events.location, events.starts_at, events.ends_at, events.cost,
      COUNT(event_teams.team_id) AS teamCount
    FROM events
    LEFT JOIN event_teams ON event_teams.event_id = events.id
    WHERE events.type = 'Competencia' AND events.starts_at >= ?
    GROUP BY events.id
    ORDER BY events.starts_at ASC
    LIMIT 1
  `).get(today)
  const counts = {
    athletes: count("SELECT COUNT(*) AS value FROM athletes WHERE status = 'active'"),
    teams: count("SELECT COUNT(*) AS value FROM teams WHERE status = 'active'"),
    pendingPayments: count("SELECT COUNT(*) AS value FROM payments WHERE status IN ('pending', 'overdue')"),
    lowStock: count('SELECT COUNT(*) AS value FROM products WHERE stock <= min_stock'),
    activeInjuries: count("SELECT COUNT(*) AS value FROM injuries WHERE status = 'active'"),
    monthlyIncome: (db.prepare("SELECT COALESCE(SUM(amount), 0) AS value FROM payments WHERE status = 'paid' AND date(COALESCE(paid_at, due_date)) >= ? AND date(COALESCE(paid_at, due_date)) < ?").get(monthStart, monthEnd) as { value: number }).value,
    monthlyExpense: (db.prepare("SELECT COALESCE(SUM(amount), 0) AS value FROM expenses WHERE date(incurred_on) >= ? AND date(incurred_on) < ?").get(monthStart, monthEnd) as { value: number }).value,
    attendanceRate: (db.prepare(`
      SELECT ROUND(100.0 * SUM(CASE WHEN status IN ('present', 'late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS value
      FROM attendance
    `).get() as { value: number | null }).value,
    performance: { ...performance, history: history.reverse() },
    upcomingEvents,
    attendanceByTeam,
    nextCompetition
  }
  const visible: Record<string, unknown> = { ...counts }
  if (!req.user!.permissions.includes('finance')) { delete visible.pendingPayments; delete visible.monthlyIncome; delete visible.monthlyExpense }
  if (!req.user!.permissions.includes('coaching')) delete visible.performance
  if (!req.user!.permissions.includes('medical')) delete visible.activeInjuries
  if (!req.user!.permissions.includes('inventory')) delete visible.lowStock
  res.json(visible)
})

const athleteListSql = `
  SELECT athletes.*,
    guardians.name AS guardian_name, guardians.phone AS guardian_phone, guardians.email AS guardian_email,
    teams.id AS team_id, teams.name AS team, athlete_teams.role AS team_role, athlete_teams.position AS team_position,
    COALESCE(own_cat.id, team_cat.id) AS category_id,
    COALESCE(own_cat.name, team_cat.name) AS category,
    COALESCE(own_disc.name, team_disc.name) AS discipline,
    COALESCE(own_disc.id, team_disc.id) AS discipline_id
  FROM athletes
  LEFT JOIN guardians ON guardians.id = athletes.guardian_id
  LEFT JOIN categories own_cat ON own_cat.id = athletes.category_id
  LEFT JOIN disciplines own_disc ON own_disc.id = own_cat.discipline_id
  LEFT JOIN athlete_teams ON athlete_teams.athlete_id = athletes.id AND athlete_teams.ended_at IS NULL
  LEFT JOIN teams ON teams.id = athlete_teams.team_id
  LEFT JOIN categories team_cat ON team_cat.id = teams.category_id
  LEFT JOIN disciplines team_disc ON team_disc.id = team_cat.discipline_id
`

function categoryIdFromTeam(teamId?: number) {
  if (!teamId) return null
  const team = db.prepare('SELECT category_id FROM teams WHERE id = ?').get(teamId) as { category_id: number | null } | undefined
  return team?.category_id ?? null
}

function assignAthleteToTeam(athleteId: number, teamId: number, role: string, position: string) {
  db.transaction(() => {
    db.prepare('UPDATE athlete_teams SET ended_at = CURRENT_DATE WHERE athlete_id = ? AND ended_at IS NULL').run(athleteId)
    db.prepare(`INSERT INTO athlete_teams (athlete_id, team_id, role, position) VALUES (?, ?, ?, ?)
      ON CONFLICT(athlete_id, team_id, started_at) DO UPDATE SET role = excluded.role, position = excluded.position, ended_at = NULL`).run(athleteId, teamId, role, position)
    db.prepare('UPDATE athletes SET category_id = ? WHERE id = ?').run(categoryIdFromTeam(teamId), athleteId)
  })()
}

db.prepare(`
  UPDATE athletes SET category_id = (
    SELECT teams.category_id
    FROM athlete_teams
    JOIN teams ON teams.id = athlete_teams.team_id
    WHERE athlete_teams.athlete_id = athletes.id AND athlete_teams.ended_at IS NULL
    LIMIT 1
  )
  WHERE category_id IS NULL
`).run()

// Athletes
app.get('/api/athletes', auth, requireRole(access.staff), (req: AuthRequest, res) => {
  const sanitize=(row:Record<string,unknown>)=>{if(!req.user!.permissions.includes('medical'))delete row.medical_notes;if(!req.user!.permissions.includes('coaching')){delete row.emergency_contact;delete row.address;delete row.birth_date}return row}
  if(req.query.page!==undefined) {
    const p=z.object({page:z.coerce.number().int().min(1),size:z.coerce.number().int().min(1).max(100).default(25),q:z.string().max(120).default(''),status:z.enum(['all','active','trial','injured','inactive']).default('all'),discipline:z.string().max(120).default('all')}).safeParse(req.query)
    if(!p.success)return res.status(400).json({error:'Filtros de atletas inválidos.'})
    const {page,size,q,status,discipline}=p.data
    const pattern=`%${q.trim().replace(/[!%_]/g,'!$&')}%`
    const where="WHERE (name||' '||COALESCE(team,'')||' '||COALESCE(discipline,'')||' '||COALESCE(category,'')||' '||COALESCE(team_position,'')) LIKE ? ESCAPE '!' AND (?='all' OR status=?) AND (?='all' OR discipline=?)"
    const params=[pattern,status,status,discipline,discipline]
    const total=(db.prepare(`SELECT COUNT(*) n FROM (${athleteListSql}) ${where}`).get(...params) as {n:number}).n
    const rows=(db.prepare(`SELECT * FROM (${athleteListSql}) ${where} ORDER BY name,id LIMIT ? OFFSET ?`).all(...params,size,(page-1)*size) as Record<string,unknown>[]).map(sanitize)
    const stats=db.prepare("SELECT COUNT(*) total,COALESCE(SUM(status='active'),0) active,COALESCE(SUM(status='trial'),0) trial,COALESCE(SUM(status='injured'),0) injured FROM athletes").get()
    const disciplines=db.prepare(`SELECT DISTINCT discipline AS name FROM (${athleteListSql}) WHERE discipline IS NOT NULL ORDER BY discipline`).all()
    return res.json({rows,total,page,size,stats,disciplines})
  }
  res.json((db.prepare(`${athleteListSql} ORDER BY athletes.name`).all() as Record<string,unknown>[]).map(sanitize))
})

// Comprehensive 360° Athlete dossier
app.get('/api/athletes/:id/full', auth, requireRole(access.coaching), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID de atleta inválido' })

  const athlete = db.prepare(`${athleteListSql} WHERE athletes.id = ?`).get(id) as Record<string, unknown> | undefined

  if (!athlete) return res.status(404).json({ error: 'Atleta no encontrado' })

  if (!req.user!.permissions.includes('medical')) delete athlete.medical_notes
  const teamsHistory = db.prepare(`
    SELECT athlete_teams.*, teams.name as team_name, categories.name as category_name, disciplines.name as discipline_name
    FROM athlete_teams
    JOIN teams ON teams.id = athlete_teams.team_id
    LEFT JOIN categories ON categories.id = teams.category_id
    LEFT JOIN disciplines ON disciplines.id = categories.discipline_id
    WHERE athlete_id = ?
    ORDER BY started_at DESC
  `).all(id)

  const attendance = db.prepare(`
    SELECT attendance.*, teams.name as team_name
    FROM attendance
    LEFT JOIN teams ON teams.id = attendance.team_id
    WHERE athlete_id = ?
    ORDER BY attended_on DESC
    LIMIT 60
  `).all(id)

  const evaluations = db.prepare(`
    SELECT evaluations.*, users.name as coach_name
    FROM evaluations
    LEFT JOIN users ON users.id = evaluations.coach_id
    WHERE athlete_id = ?
    ORDER BY evaluated_at DESC
  `).all(id)

  const goals = db.prepare('SELECT * FROM goals WHERE athlete_id = ? ORDER BY due_date').all(id)
  const injuries = req.user!.permissions.includes('medical') ? db.prepare('SELECT * FROM injuries WHERE athlete_id = ? ORDER BY reported_at DESC').all(id) : []
  const payments = req.user!.permissions.includes('finance') ? db.prepare('SELECT * FROM payments WHERE athlete_id = ? ORDER BY due_date DESC').all(id) : []
  const wardrobe = db.prepare('SELECT wardrobe_assignments.*, teams.name as team_name FROM wardrobe_assignments LEFT JOIN teams ON teams.id = wardrobe_assignments.team_id WHERE athlete_id = ? ORDER BY id DESC').all(id)
  const documents = req.user!.permissions.includes('documents') ? db.prepare('SELECT id, athlete_id, name, doc_type, expires_at, visibility, created_at, CASE WHEN file_data IS NOT NULL THEN 1 ELSE 0 END AS file_data FROM documents WHERE athlete_id = ? ORDER BY id DESC').all(id) : []
  const credentials = db.prepare('SELECT * FROM credentials WHERE athlete_id = ? AND revoked = 0 ORDER BY id DESC').all(id)

  res.json({
    athlete,
    teamsHistory,
    attendance,
    evaluations,
    goals,
    injuries,
    payments,
    wardrobe,
    documents,
    credentials
  })
})

app.post('/api/athletes', auth, requireRole(access.sportsLead), rememberMutation, (req: AuthRequest, res) => {
  if (req.body.medicalNotes && !req.user!.permissions.includes('medical')) return res.status(403).json({error:'No tienes permiso para modificar datos de salud.'})
  const body = z.object({
    name: z.string().min(2),
    birthDate: z.string().optional(),
    phone: z.string().optional(),
    medicalNotes: z.string().optional(),
    emergencyContact: z.string().optional(),
    guardianName: z.string().optional(),
    guardianPhone: z.string().optional(),
    guardianEmail: z.string().optional(),
    photoData: z.string().startsWith('data:image/').max(8000000).optional(),
    categoryId: z.number().int().optional(),
    teamId: z.number().int().optional(),
    position: z.string().optional(),
    gender: z.string().optional(),
    address: z.string().optional(),
    status: z.enum(['active', 'trial', 'inactive', 'injured']).optional()
  }).safeParse(req.body)

  if (!body.success) return res.status(400).json({ error: 'Datos del atleta incompletos', details: body.error.flatten() })

  const create = db.transaction(() => {
    let guardianId: number | null = null
    if (body.data.guardianName) {
      const guardian = db.prepare('INSERT INTO guardians (name, phone, email) VALUES (?, ?, ?)').run(
        body.data.guardianName,
        body.data.guardianPhone ?? null,
        body.data.guardianEmail ?? null
      )
      guardianId = Number(guardian.lastInsertRowid)
    }
    const categoryId = body.data.categoryId ?? categoryIdFromTeam(body.data.teamId)
    const result = db.prepare(`
      INSERT INTO athletes (guardian_id, category_id, name, birth_date, gender, phone, address, medical_notes, emergency_contact, photo_data, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      guardianId,
      categoryId,
      body.data.name,
      body.data.birthDate ?? null,
      body.data.gender ?? null,
      body.data.phone ?? null,
      body.data.address ?? null,
      body.data.medicalNotes ?? null,
      body.data.emergencyContact ?? null,
      body.data.photoData ?? null,
      body.data.status ?? 'active'
    )
    const athleteId = Number(result.lastInsertRowid)
    if (body.data.teamId) {
      assignAthleteToTeam(
        athleteId,
        body.data.teamId,
        body.data.status === 'trial' ? 'En prueba' : 'Titular',
        body.data.position ?? 'General'
      )
      if (body.data.categoryId) db.prepare('UPDATE athletes SET category_id = ? WHERE id = ?').run(body.data.categoryId, athleteId)
    }
    return athleteId
  })

  const id = create()
  audit(req.user!.id, 'create', 'athletes', id)
  return res.status(201).json({ id })
})

app.patch('/api/athletes/:id', auth, requireRole(access.sportsLead), (req: AuthRequest, res) => {
  if (req.body.medicalNotes && !req.user!.permissions.includes('medical')) return res.status(403).json({error:'No tienes permiso para modificar datos de salud.'})
  const id = Number(req.params.id)
  const body = z.object({
    name: z.string().min(2).optional(),
    birthDate: z.string().optional(),
    phone: z.string().optional(),
    medicalNotes: z.string().optional(),
    emergencyContact: z.string().optional(),
    guardianName: z.string().optional(),
    guardianPhone: z.string().optional(),
    guardianEmail: z.string().optional(),
    status: z.enum(['active', 'trial', 'inactive', 'injured']).optional(),
    photoData: z.string().refine((val) => val === '' || val.startsWith('data:image/'), 'Foto inválida').max(8000000).nullable().optional(),
    teamId: z.number().int().optional(),
    categoryId: z.number().int().optional(),
    position: z.string().optional(),
    gender: z.string().optional(),
    address: z.string().optional(),
    role: z.enum(['Titular', 'Suplente', 'En prueba', 'Baja']).optional()
  }).safeParse(req.body)

  if (!body.success || !Number.isInteger(id)) return res.status(400).json({ error: 'Actualización de atleta inválida' })
  const values = body.data
  const current = db.prepare('SELECT * FROM athletes WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!current) return res.status(404).json({ error: 'Atleta no encontrado' })

  const update = db.transaction(() => {
    let guardianId = current.guardian_id as number | null
    if (!guardianId && values.guardianName) {
      const guardian = db.prepare('INSERT INTO guardians (name, phone, email) VALUES (?, ?, ?)').run(
        values.guardianName,
        values.guardianPhone ?? null,
        values.guardianEmail ?? null
      )
      guardianId = Number(guardian.lastInsertRowid)
    } else if (guardianId && (values.guardianName !== undefined || values.guardianPhone !== undefined || values.guardianEmail !== undefined)) {
      db.prepare('UPDATE guardians SET name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email) WHERE id = ?').run(
        values.guardianName ?? null,
        values.guardianPhone ?? null,
        values.guardianEmail ?? null,
        guardianId
      )
    }

    const nextCategoryId = values.categoryId ?? current.category_id
    db.prepare(`
      UPDATE athletes SET
        guardian_id = ?, name = ?, birth_date = ?, gender = ?, phone = ?, address = ?, medical_notes = ?, emergency_contact = ?, status = ?, photo_data = ?, category_id = ?
      WHERE id = ?
    `).run(
      guardianId,
      values.name ?? current.name,
      values.birthDate ?? current.birth_date,
      values.gender ?? current.gender,
      values.phone ?? current.phone,
      values.address ?? current.address,
      req.user!.permissions.includes('medical') ? values.medicalNotes ?? current.medical_notes : current.medical_notes,
      values.emergencyContact ?? current.emergency_contact,
      values.status ?? current.status,
      values.photoData === undefined ? current.photo_data : (values.photoData || null),
      nextCategoryId ?? null,
      id
    )

    if (values.teamId) {
      assignAthleteToTeam(id, values.teamId, values.role ?? 'Titular', values.position ?? 'General')
      if (values.categoryId) db.prepare('UPDATE athletes SET category_id = ? WHERE id = ?').run(values.categoryId, id)
    }
  })

  update()
  audit(req.user!.id, 'update', 'athletes', id, values)
  res.json({ ok: true })
})

// Attendance
app.get('/api/attendance', auth, requireRole(access.coaching), (req, res) => {
  const teamId = req.query.teamId ? Number(req.query.teamId) : undefined
  const attendedOn = typeof req.query.attendedOn === 'string' ? req.query.attendedOn : undefined
  if ((teamId !== undefined && !Number.isInteger(teamId)) || (attendedOn !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(attendedOn))) {
    return res.status(400).json({ error: 'Consulta de asistencia inválida' })
  }
  const where = [teamId === undefined ? '' : 'attendance.team_id = ?', attendedOn === undefined ? '' : 'attendance.attended_on = ?'].filter(Boolean).join(' AND ')
  const values = [teamId, attendedOn].filter((val) => val !== undefined)
  res.json(db.prepare(`
    SELECT attendance.*, athletes.name AS athlete, teams.name AS team
    FROM attendance
    JOIN athletes ON athletes.id = attendance.athlete_id
    LEFT JOIN teams ON teams.id = attendance.team_id
    ${where ? ` WHERE ${where}` : ''}
    ORDER BY attendance.attended_on DESC, athletes.name
  `).all(...values))
})

app.post('/api/attendance', auth, requireRole(access.coaching), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({
    athleteId: z.number().int(),
    teamId: z.number().int().optional(),
    attendedOn: z.string().date(),
    status: z.enum(['present', 'late', 'excused', 'absent']),
    notes: z.string().max(1000).optional()
  }).safeParse(req.body)

  if (!body.success) return res.status(400).json({ error: 'Registro de asistencia inválido' })
  if (!body.data.teamId) {
    const existing = db.prepare('SELECT id FROM attendance WHERE athlete_id = ? AND team_id IS NULL AND attended_on = ?').get(body.data.athleteId, body.data.attendedOn) as { id: number } | undefined
    if (existing) {
      db.prepare('UPDATE attendance SET status = ?, notes = ? WHERE id = ?').run(body.data.status, body.data.notes ?? null, existing.id)
      audit(req.user!.id, 'upsert', 'attendance', existing.id)
      return res.status(201).json({ ok: true })
    }
  }
  db.prepare(`
    INSERT INTO attendance (athlete_id, team_id, attended_on, status, notes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(athlete_id, team_id, attended_on)
    DO UPDATE SET status = excluded.status, notes = excluded.notes
  `).run(body.data.athleteId, body.data.teamId ?? null, body.data.attendedOn, body.data.status, body.data.notes ?? null)

  audit(req.user!.id, 'upsert', 'attendance', body.data.athleteId)
  res.status(201).json({ ok: true })
})

// Payments & Billing
app.get('/api/payments', auth, requireRole(access.finance), (_req, res) => {
  res.json(db.prepare(`
    SELECT payments.*, athletes.name AS athlete, guardians.phone AS guardian_phone, guardians.name AS guardian_name
    FROM payments
    LEFT JOIN athletes ON athletes.id = payments.athlete_id
    LEFT JOIN guardians ON guardians.id = athletes.guardian_id
    ORDER BY payments.due_date DESC
  `).all())
})

app.post('/api/payments', auth, requireRole(access.finance), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({
    athleteId: z.number().int().optional(),
    concept: z.string().min(2),
    amount: z.number().positive(),
    dueDate: z.string().optional(),
    discount: z.number().nonnegative().optional(),
    lateFee: z.number().nonnegative().optional(),
    paymentMethod: z.string().optional(),
    status: z.enum(['pending', 'paid', 'overdue', 'cancelled']).optional()
  }).safeParse(req.body)

  if (!body.success) return res.status(400).json({ error: 'Cargo inválido' })
  if ((body.data.discount ?? 0) > body.data.amount) return res.status(400).json({ error: 'El descuento no puede superar el importe.' })
  const paidAt = body.data.status === 'paid' ? new Date().toISOString() : null
  const result = db.prepare(`
    INSERT INTO payments (athlete_id, concept, amount, due_date, discount, late_fee, payment_method, status, paid_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    body.data.athleteId ?? null,
    body.data.concept,
    Math.round((body.data.amount - (body.data.discount ?? 0) + (body.data.lateFee ?? 0)) * 100) / 100,
    body.data.dueDate ?? null,
    body.data.discount ?? 0,
    body.data.lateFee ?? 0,
    body.data.paymentMethod ?? null,
    body.data.status ?? 'pending',
    paidAt
  )
  audit(req.user!.id, 'create', 'payments', Number(result.lastInsertRowid), body.data)
  res.status(201).json({ id: Number(result.lastInsertRowid) })
})

app.patch('/api/payments/:id/status', auth, requireRole(access.finance), (req: AuthRequest, res) => {
  const body = z.object({
    status: z.enum(['pending', 'paid', 'overdue', 'cancelled']),
    paymentMethod: z.string().optional()
  }).safeParse(req.body)
  const id = Number(req.params.id)
  if (!body.success || !Number.isInteger(id)) return res.status(400).json({ error: 'Estado de pago inválido' })
  const existing = db.prepare('SELECT status, paid_at, ledger_parent_id FROM payments WHERE id = ?').get(id) as { status: string; paid_at: string | null; ledger_parent_id:number|null } | undefined
  if (!existing) return res.status(404).json({ error: 'Cargo no encontrado.' })
  if (existing.ledger_parent_id || (existing.status==='paid' && body.data.status!=='paid')) return res.status(409).json({error:'Utiliza el historial de cobranza para reversar un cobro con su motivo.'})
  const paidAt = body.data.status === 'paid' ? existing.paid_at ?? new Date().toISOString() : null
  db.prepare('UPDATE payments SET status = ?, paid_at = ?, payment_method = COALESCE(?, payment_method) WHERE id = ?').run(
    body.data.status, paidAt, body.data.paymentMethod ?? null, id
  )
  audit(req.user!.id, 'update', 'payments', id, body.data)
  res.json({ ok: true })
})

// Family portal: this endpoint deliberately returns only the data belonging to
// the authenticated guardian. It avoids exposing medical notes or other families.
app.get('/api/family/overview', auth, (req: AuthRequest, res) => {
  if (!parentOnly(req, res)) return
  const guardianId = familyGuardianId(req.user!.id)!
  const athletes = db.prepare(`
    SELECT athletes.id, athletes.name, athletes.status, athletes.photo_data,
      teams.name AS team, categories.name AS category, disciplines.name AS discipline, users.name AS coach
    FROM athletes
    LEFT JOIN athlete_teams ON athlete_teams.athlete_id = athletes.id AND athlete_teams.ended_at IS NULL
    LEFT JOIN teams ON teams.id = athlete_teams.team_id
    LEFT JOIN categories ON categories.id = teams.category_id
    LEFT JOIN disciplines ON disciplines.id = categories.discipline_id
    LEFT JOIN users ON users.id = teams.coach_id
    WHERE athletes.guardian_id = ?
    ORDER BY athletes.name
  `).all(guardianId) as { id: number }[]
  const athleteIds = athletes.map((athlete) => athlete.id)
  const placeholders = athleteIds.map(() => '?').join(',')
  const payments = athleteIds.length ? db.prepare(`
    SELECT id, athlete_id, concept, amount, due_date, paid_at, status
    FROM payments WHERE athlete_id IN (${placeholders}) ORDER BY due_date DESC, id DESC
  `).all(...athleteIds) : []
  const attendance = athleteIds.length ? db.prepare(`
    SELECT ROUND(100.0 * SUM(CASE WHEN status IN ('present', 'late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) AS rate
    FROM attendance WHERE athlete_id IN (${placeholders})
  `).get(...athleteIds) as { rate: number | null } : { rate: null }
  const lastEvaluation = athleteIds.length ? db.prepare(`
    SELECT ROUND((technique + flexibility + strength + attitude + teamwork) / 5.0) AS score, evaluated_at
    FROM evaluations WHERE athlete_id IN (${placeholders}) ORDER BY evaluated_at DESC LIMIT 1
  `).get(...athleteIds) : null
  const events = athleteIds.length ? db.prepare(`
    SELECT DISTINCT events.id, events.title, events.type, events.location, events.starts_at, events.ends_at
    FROM events
    LEFT JOIN event_teams ON event_teams.event_id = events.id
    LEFT JOIN athlete_teams ON athlete_teams.team_id = event_teams.team_id AND athlete_teams.ended_at IS NULL
    WHERE events.starts_at >= ? AND (event_teams.event_id IS NULL OR athlete_teams.athlete_id IN (${placeholders}))
    ORDER BY events.starts_at LIMIT 8
  `).all(new Date().toISOString().slice(0, 10), ...athleteIds) : []
  const attendanceRows = athleteIds.length ? db.prepare(`
    SELECT attendance.attended_on, attendance.status, attendance.notes, attendance.athlete_id, athletes.name AS athlete, teams.name AS team
    FROM attendance JOIN athletes ON athletes.id = attendance.athlete_id LEFT JOIN teams ON teams.id = attendance.team_id
    WHERE attendance.athlete_id IN (${placeholders}) ORDER BY attendance.attended_on DESC LIMIT 40
  `).all(...athleteIds) : []
  const evaluations = athleteIds.length ? db.prepare(`
    SELECT evaluations.id, evaluations.athlete_id, athletes.name AS athlete, evaluations.technique, evaluations.flexibility, evaluations.strength, evaluations.attitude, evaluations.teamwork, evaluations.stunts, evaluations.tumbling, evaluations.jumps, evaluations.feedback, evaluations.evaluated_at, rubrics.name AS rubric
    FROM evaluations JOIN athletes ON athletes.id = evaluations.athlete_id LEFT JOIN rubrics ON rubrics.id = evaluations.rubric_id
    WHERE evaluations.athlete_id IN (${placeholders}) ORDER BY evaluations.evaluated_at DESC LIMIT 20
  `).all(...athleteIds) : []
  const documents = athleteIds.length ? db.prepare(`
    SELECT documents.id, documents.athlete_id, documents.name, documents.doc_type, documents.expires_at, documents.created_at
    FROM documents WHERE documents.athlete_id IN (${placeholders}) AND documents.visibility IN ('family', 'public') ORDER BY documents.created_at DESC
  `).all(...athleteIds) : []
  const credentials = athleteIds.length ? db.prepare(`
    SELECT id, athlete_id, code, valid_until FROM credentials WHERE athlete_id IN (${placeholders}) AND revoked = 0 ORDER BY id DESC
  `).all(...athleteIds) : []
  const messages = db.prepare('SELECT id, athlete_id, subject, body, status, created_at FROM family_messages WHERE guardian_id = ? ORDER BY created_at DESC LIMIT 20').all(guardianId)
  const guardian = db.prepare('SELECT name, phone, email FROM guardians WHERE id = ?').get(guardianId) as { name: string; phone?: string; email?: string }
  const consents = db.prepare("SELECT athlete_id,signer_name,signed_at FROM consent_history WHERE guardian_id=? AND season_id=(SELECT id FROM seasons WHERE status='active') AND version=(SELECT consent_version FROM academy_settings WHERE id=1) ORDER BY id DESC").all(guardianId)
  const consent = consents[0] ?? null

  res.json({ guardian, athletes, payments, attendanceRate: attendance.rate, lastEvaluation, events, attendanceRows, evaluations, documents, credentials, messages, consent, consents })
})

app.post('/api/payments/:id/installments', auth, requireRole(access.finance), rememberMutation, (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const body = z.object({ amount: z.number().positive().multipleOf(0.01), paymentMethod: z.string().trim().min(1).max(80) }).safeParse(req.body)
  if (!Number.isInteger(id) || !body.success) return res.status(400).json({ error: 'Abono inválido. Indica un importe y método de pago.' })
  const charge = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as { athlete_id: number | null; concept: string; amount: number; status: string } | undefined
  if (!charge) return res.status(404).json({ error: 'Cargo no encontrado.' })
  if (!['pending', 'overdue'].includes(charge.status) || body.data.amount > charge.amount) return res.status(409).json({ error: 'El abono excede el saldo o el cargo ya está cerrado.' })
  const result = db.transaction(() => {
    const balance = Math.round((charge.amount - body.data.amount) * 100) / 100
    if (balance === 0) {
      db.prepare("UPDATE payments SET status = 'paid', paid_at = ?, payment_method = ? WHERE id = ?").run(new Date().toISOString(), body.data.paymentMethod, id)
      return { paymentId: id, remaining: 0 }
    }
    db.prepare('UPDATE payments SET amount = ? WHERE id = ?').run(balance, id)
    const receipt = db.prepare("INSERT INTO payments (athlete_id, concept, amount, paid_at, status, payment_method, ledger_parent_id) VALUES (?, ?, ?, ?, 'paid', ?, ?)").run(charge.athlete_id, `Abono a cargo #${id}: ${charge.concept}`, body.data.amount, new Date().toISOString(), body.data.paymentMethod, id)
    return { paymentId: Number(receipt.lastInsertRowid), remaining: balance }
  })()
  audit(req.user!.id, 'installment', 'payments', id, { ...body.data, ...result, previousBalance: charge.amount })
  res.status(201).json(result)
})

app.post('/api/family/consent', auth, (req: AuthRequest, res) => {
  if (!parentOnly(req, res)) return
  const body = z.object({ signerName: z.string().trim().min(3).max(160), version: z.string().min(1), athleteId: z.number().int().positive() }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'Indica el nombre completo de quien firma.' })
  const guardianId = familyGuardianId(req.user!.id)!
  const policy = db.prepare('SELECT consent_version,consent_text FROM academy_settings WHERE id=1').get() as {consent_version:string;consent_text:string}
  const season = db.prepare("SELECT id FROM seasons WHERE status='active'").get() as {id:number}|undefined
  if (!season || body.data.version !== policy.consent_version) return res.status(409).json({error:'La responsiva cambió. Actualiza la página y revisa el texto vigente.'})
  if (!db.prepare('SELECT id FROM athletes WHERE id=? AND guardian_id=?').get(body.data.athleteId,guardianId)) return res.status(404).json({error:'Atleta no disponible.'})
  db.prepare('INSERT INTO consent_history(guardian_id,athlete_id,season_id,version,document_text,signer_name) VALUES(?,?,?,?,?,?)').run(guardianId,body.data.athleteId,season.id,policy.consent_version,policy.consent_text,body.data.signerName)
  db.prepare(`
    INSERT INTO guardian_consents (guardian_id, signer_name, signed_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(guardian_id) DO UPDATE SET signer_name = excluded.signer_name, signed_at = CURRENT_TIMESTAMP
  `).run(guardianId, body.data.signerName)
  audit(req.user!.id, 'sign', 'guardian_consents', guardianId)
  res.status(201).json({ ok: true })
})

app.post('/api/family/messages', auth, (req: AuthRequest, res) => {
  if (!parentOnly(req, res)) return
  const body = z.object({ athleteId: z.number().int().positive().optional(), subject: z.string().trim().min(3).max(140), body: z.string().trim().min(5).max(2000) }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'Mensaje inválido.' })
  const guardianId = familyGuardianId(req.user!.id)!
  if (body.data.athleteId && !db.prepare('SELECT id FROM athletes WHERE id = ? AND guardian_id = ?').get(body.data.athleteId, guardianId)) return res.status(403).json({ error: 'El atleta seleccionado no pertenece a tu familia.' })
  const result = db.prepare('INSERT INTO family_messages (guardian_id, athlete_id, subject, body) VALUES (?, ?, ?, ?)').run(guardianId, body.data.athleteId ?? null, body.data.subject, body.data.body)
  audit(req.user!.id, 'create', 'family_messages', Number(result.lastInsertRowid), { subject: body.data.subject, athleteId: body.data.athleteId })
  res.status(201).json({ id: Number(result.lastInsertRowid) })
})

app.get('/api/family/messages', auth, requireRole(access.staff), (_req, res) => {
  res.json(db.prepare(`
    SELECT family_messages.*, guardians.name AS guardian, athletes.name AS athlete
    FROM family_messages
    JOIN guardians ON guardians.id = family_messages.guardian_id
    LEFT JOIN athletes ON athletes.id = family_messages.athlete_id
    ORDER BY CASE family_messages.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, family_messages.created_at DESC
  `).all())
})

app.patch('/api/family/messages/:id', auth, requireRole(access.staff), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const body = z.object({ status: z.enum(['open', 'in_progress', 'closed']) }).safeParse(req.body)
  if (!Number.isInteger(id) || !body.success) return res.status(400).json({ error: 'Actualización de mensaje inválida.' })
  const result = db.prepare('UPDATE family_messages SET status = ? WHERE id = ?').run(body.data.status, id)
  if (!result.changes) return res.status(404).json({ error: 'Mensaje no encontrado.' })
  audit(req.user!.id, 'update', 'family_messages', id, body.data)
  res.json({ ok: true })
})

// Expenses / Egresos
app.get('/api/expenses', auth, requireRole(access.finance), (_req, res) => {
  res.json(db.prepare('SELECT * FROM expenses ORDER BY incurred_on DESC').all())
})

app.post('/api/expenses', auth, requireRole(access.finance), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({
    concept: z.string().min(2),
    category: z.string().min(2),
    amount: z.number().positive(),
    incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    vendor: z.string().optional(),
    notes: z.string().optional()
  }).safeParse(req.body)

  if (!body.success) return res.status(400).json({ error: 'Egreso inválido' })
  const result = db.prepare('INSERT INTO expenses (concept, category, amount, incurred_on, vendor, notes) VALUES (?, ?, ?, ?, ?, ?)').run(
    body.data.concept, body.data.category, body.data.amount, body.data.incurredOn, body.data.vendor ?? null, body.data.notes ?? null
  )
  audit(req.user!.id, 'create', 'expenses', Number(result.lastInsertRowid), body.data)
  res.status(201).json({ id: Number(result.lastInsertRowid) })
})

app.delete('/api/expenses/:id', auth, requireRole(access.finance), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' })
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id)
  audit(req.user!.id, 'delete', 'expenses', id)
  res.json({ ok: true })
})

// Venues / Sedes y Salones
app.get('/api/venues', auth, requireRole(access.staff), (_req, res) => {
  res.json(db.prepare('SELECT * FROM venues WHERE active = 1 ORDER BY name').all())
})

app.get('/api/venues/all', auth, requireRole(access.admin), (_req, res) => {
  res.json(db.prepare('SELECT * FROM venues ORDER BY active DESC, name').all())
})

app.post('/api/venues', auth, requireRole(access.admin), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({
    name: z.string().min(2),
    location: z.string().optional(),
    capacity: z.number().int().positive().optional(),
    description: z.string().optional()
  }).safeParse(req.body)

  if (!body.success) return res.status(400).json({ error: 'Sede/salón inválido' })
  try {
    const result = db.prepare('INSERT INTO venues (name, location, capacity, description) VALUES (?, ?, ?, ?)').run(
      body.data.name, body.data.location ?? null, body.data.capacity ?? 30, body.data.description ?? null
    )
    audit(req.user!.id, 'create', 'venues', Number(result.lastInsertRowid))
    res.status(201).json({ id: Number(result.lastInsertRowid) })
  } catch {
    res.status(409).json({ error: 'Ya existe una sede o salón con ese nombre' })
  }
})

app.patch('/api/venues/:id', auth, requireRole(access.admin), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const body = z.object({ name: z.string().trim().min(2).max(120).optional(), location: z.string().trim().max(200).nullable().optional(), capacity: z.number().int().positive().max(10000).optional(), description: z.string().trim().max(500).nullable().optional(), active: z.boolean().optional() }).safeParse(req.body)
  if (!Number.isInteger(id) || !body.success || Object.keys(body.data).length === 0) return res.status(400).json({ error: 'Datos de sede inválidos.' })
  const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(id) as { name: string; location: string | null; capacity: number; description: string | null; active: number } | undefined
  if (!venue) return res.status(404).json({ error: 'Sede no encontrada.' })
  try {
    db.prepare('UPDATE venues SET name = ?, location = ?, capacity = ?, description = ?, active = ? WHERE id = ?').run(body.data.name ?? venue.name, body.data.location === undefined ? venue.location : body.data.location, body.data.capacity ?? venue.capacity, body.data.description === undefined ? venue.description : body.data.description, body.data.active === undefined ? venue.active : Number(body.data.active), id)
    audit(req.user!.id, 'update', 'venues', id, body.data)
    res.json({ ok: true })
  } catch { res.status(409).json({ error: 'Ya existe una sede o salón con ese nombre.' }) }
})

app.delete('/api/venues/:id', auth, requireRole(access.admin), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identificador de sede inválido.' })
  const venue = db.prepare('SELECT name FROM venues WHERE id = ?').get(id) as { name: string } | undefined
  if (!venue) return res.status(404).json({ error: 'Sede no encontrada.' })
  const used = (db.prepare('SELECT COUNT(*) AS value FROM events WHERE location = ?').get(venue.name) as { value: number }).value
  if (used) return res.status(409).json({ error: 'No se puede eliminar porque existen eventos registrados en esta sede. Archívala para conservar el historial.' })
  db.prepare('DELETE FROM venues WHERE id = ?').run(id)
  audit(req.user!.id, 'delete', 'venues', id, { name: venue.name })
  res.json({ ok: true })
})

// Teams, Categories, Disciplines
app.get('/api/teams', auth, requireRole(access.coaching), (_req, res) => {
  res.json(db.prepare(`
    SELECT teams.*, categories.name AS category, disciplines.name AS discipline, users.name AS coach,
      (SELECT COUNT(*) FROM athlete_teams WHERE team_id = teams.id AND ended_at IS NULL) as athlete_count
    FROM teams
    LEFT JOIN categories ON categories.id = teams.category_id
    LEFT JOIN disciplines ON disciplines.id = categories.discipline_id
    LEFT JOIN users ON users.id = teams.coach_id
    ORDER BY teams.name
  `).all())
})

app.get('/api/categories', auth, requireRole(access.coaching), (_req, res) => {
  res.json(db.prepare(`
    SELECT categories.id, categories.name, categories.season, categories.active, disciplines.id AS discipline_id, disciplines.name AS discipline
    FROM categories
    JOIN disciplines ON disciplines.id = categories.discipline_id
    ORDER BY disciplines.name, categories.name
  `).all())
})

app.get('/api/disciplines', auth, requireRole(access.coaching), (_req, res) => res.json(db.prepare('SELECT * FROM disciplines WHERE active = 1 ORDER BY name').all()))
app.get('/api/disciplines/all', auth, requireRole(access.coaching), (_req, res) => res.json(db.prepare('SELECT * FROM disciplines ORDER BY name').all()))

app.post('/api/disciplines', auth, requireRole(access.sportsLead), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({ name: z.string().min(2).max(120) }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'Disciplina inválida' })
  try {
    const result = db.prepare('INSERT INTO disciplines (name) VALUES (?)').run(body.data.name.trim())
    audit(req.user!.id, 'create', 'disciplines', Number(result.lastInsertRowid), body.data)
    res.status(201).json({ id: Number(result.lastInsertRowid) })
  } catch { res.status(409).json({ error: 'Ya existe una disciplina con ese nombre' }) }
})

app.patch('/api/disciplines/:id', auth, requireRole(access.sportsLead), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const body = z.object({ name: z.string().min(2).max(120).optional(), active: z.boolean().optional() }).refine((val) => Object.keys(val).length > 0).safeParse(req.body)
  if (!Number.isInteger(id) || !body.success) return res.status(400).json({ error: 'Actualización inválida' })
  const current = db.prepare('SELECT * FROM disciplines WHERE id = ?').get(id) as { name: string; active: number } | undefined
  if (!current) return res.status(404).json({ error: 'Disciplina no encontrada' })
  try {
    db.prepare('UPDATE disciplines SET name = ?, active = ? WHERE id = ?').run(
      body.data.name?.trim() ?? current.name,
      body.data.active === undefined ? current.active : Number(body.data.active),
      id
    )
    audit(req.user!.id, 'update', 'disciplines', id, body.data)
    res.json({ ok: true })
  } catch { res.status(409).json({ error: 'Ya existe una disciplina con ese nombre' }) }
})

// Rubrics are linked to a discipline and can be selected on every evaluation.
const rubricBody = z.object({
  name: z.string().trim().min(3).max(120),
  disciplineId: z.number().int().positive().nullable().optional(),
  description: z.string().trim().max(500).optional(),
  criteria: z.array(z.string().trim().min(2).max(100)).min(1).max(20),
  active: z.boolean().optional()
})

app.get('/api/rubrics', auth, requireRole(access.coaching), (_req, res) => {
  const rows = db.prepare(`SELECT rubrics.*, disciplines.name AS discipline
    FROM rubrics LEFT JOIN disciplines ON disciplines.id = rubrics.discipline_id
    ORDER BY rubrics.active DESC, disciplines.name, rubrics.name`).all() as Array<{ criteria: string } & Record<string, unknown>>
  res.json(rows.map((item) => {
    let criteria: string[] = []
    try { criteria = JSON.parse(item.criteria) as string[] } catch {}
    return { ...item, criteria }
  }))
})

app.post('/api/rubrics', auth, requireRole(access.sportsLead), rememberMutation, (req: AuthRequest, res) => {
  const body = rubricBody.safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'Datos de rúbrica inválidos.' })
  if (body.data.disciplineId && !db.prepare('SELECT id FROM disciplines WHERE id = ?').get(body.data.disciplineId)) return res.status(400).json({ error: 'La disciplina seleccionada no existe.' })
  const result = db.prepare('INSERT INTO rubrics (discipline_id, name, description, criteria, active) VALUES (?, ?, ?, ?, ?)').run(
    body.data.disciplineId ?? null, body.data.name, body.data.description ?? null, JSON.stringify(body.data.criteria), body.data.active === false ? 0 : 1
  )
  audit(req.user!.id, 'create', 'rubrics', Number(result.lastInsertRowid), body.data)
  res.status(201).json({ id: Number(result.lastInsertRowid) })
})

app.patch('/api/rubrics/:id', auth, requireRole(access.sportsLead), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const body = rubricBody.partial().safeParse(req.body)
  if (!Number.isInteger(id) || !body.success || Object.keys(body.data).length === 0) return res.status(400).json({ error: 'Actualización de rúbrica inválida.' })
  if (body.data.disciplineId && !db.prepare('SELECT id FROM disciplines WHERE id = ?').get(body.data.disciplineId)) return res.status(400).json({ error: 'La disciplina seleccionada no existe.' })
  const result = db.prepare(`UPDATE rubrics SET discipline_id = COALESCE(?, discipline_id), name = COALESCE(?, name), description = COALESCE(?, description), criteria = COALESCE(?, criteria), active = COALESCE(?, active) WHERE id = ?`).run(
    body.data.disciplineId ?? null, body.data.name ?? null, body.data.description ?? null, body.data.criteria ? JSON.stringify(body.data.criteria) : null, body.data.active === undefined ? null : Number(body.data.active), id
  )
  if (!result.changes) return res.status(404).json({ error: 'Rúbrica no encontrada.' })
  audit(req.user!.id, 'update', 'rubrics', id, body.data)
  res.json({ ok: true })
})

app.delete('/api/rubrics/:id', auth, requireRole(access.sportsLead), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identificador de rúbrica inválido.' })
  const rubric = db.prepare('SELECT name FROM rubrics WHERE id = ?').get(id) as { name: string } | undefined
  if (!rubric) return res.status(404).json({ error: 'Rúbrica no encontrada.' })
  const used = (db.prepare('SELECT COUNT(*) AS value FROM evaluations WHERE rubric_id = ?').get(id) as { value: number }).value
  if (used) return res.status(409).json({ error: 'No se puede eliminar una rúbrica con evaluaciones registradas. Archívala para conservar el historial.' })
  db.prepare('DELETE FROM rubrics WHERE id = ?').run(id)
  audit(req.user!.id, 'delete', 'rubrics', id, { name: rubric.name })
  res.json({ ok: true })
})

app.post('/api/categories', auth, requireRole(access.sportsLead), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({ disciplineId: z.number().int(), name: z.string().min(2).max(120), season: z.string().min(4).max(30) }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'Categoría inválida' })
  const result = db.prepare('INSERT INTO categories (discipline_id, name, season) VALUES (?, ?, ?)').run(body.data.disciplineId, body.data.name, body.data.season)
  audit(req.user!.id, 'create', 'categories', Number(result.lastInsertRowid), body.data)
  res.status(201).json({ id: Number(result.lastInsertRowid) })
})

app.patch('/api/categories/:id', auth, requireRole(access.sportsLead), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const body = z.object({ name: z.string().min(2).max(120).optional(), season: z.string().min(4).max(30).optional(), active: z.boolean().optional() }).refine((val) => Object.keys(val).length > 0).safeParse(req.body)
  if (!Number.isInteger(id) || !body.success) return res.status(400).json({ error: 'Actualización inválida' })
  const current = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as { name: string; season: string; active: number } | undefined
  if (!current) return res.status(404).json({ error: 'Categoría no encontrada' })
  db.prepare('UPDATE categories SET name = ?, season = ?, active = ? WHERE id = ?').run(
    body.data.name ?? current.name,
    body.data.season ?? current.season,
    body.data.active === undefined ? current.active : Number(body.data.active),
    id
  )
  audit(req.user!.id, 'update', 'categories', id, body.data)
  res.json({ ok: true })
})

app.get('/api/teams/:teamId/athletes', auth, requireRole(access.coaching), (req, res) => {
  const teamId = Number(req.params.teamId)
  if (!Number.isInteger(teamId)) return res.status(400).json({ error: 'Equipo inválido' })
  res.json(db.prepare(`
    SELECT athletes.*, athlete_teams.role, athlete_teams.position, athlete_teams.started_at
    FROM athlete_teams
    JOIN athletes ON athletes.id = athlete_teams.athlete_id
    WHERE athlete_teams.team_id = ? AND athlete_teams.ended_at IS NULL
    ORDER BY athletes.name
  `).all(teamId))
})

app.post('/api/teams', auth, requireRole(access.sportsLead), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({
    name: z.string().min(2),
    categoryId: z.number().int().optional(),
    coachId: z.number().int().optional()
  }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'Equipo inválido' })
  const result = db.prepare('INSERT INTO teams (name, category_id, coach_id) VALUES (?, ?, ?)').run(
    body.data.name, body.data.categoryId ?? null, body.data.coachId ?? null
  )
  audit(req.user!.id, 'create', 'teams', Number(result.lastInsertRowid), body.data)
  res.status(201).json({ id: Number(result.lastInsertRowid) })
})

app.patch('/api/teams/:id', auth, requireRole(access.sportsLead), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const body = z.object({ name: z.string().trim().min(2), categoryId: z.number().int().positive().nullable(), coachId: z.number().int().positive().nullable() }).safeParse(req.body)
  if (!body.success || !Number.isInteger(id)) return res.status(400).json({ error: 'Datos de equipo inválidos.' })
  const result = db.transaction(() => {
    const updated = db.prepare('UPDATE teams SET name = ?, category_id = ?, coach_id = ? WHERE id = ?').run(body.data.name, body.data.categoryId, body.data.coachId, id)
    if (updated.changes) db.prepare('UPDATE athletes SET category_id = ? WHERE id IN (SELECT athlete_id FROM athlete_teams WHERE team_id = ? AND ended_at IS NULL)').run(body.data.categoryId, id)
    return updated
  })()
  if (!result.changes) return res.status(404).json({ error: 'Equipo no encontrado.' })
  audit(req.user!.id, 'update', 'teams', id, body.data)
  res.json({ ok: true })
})

app.post('/api/teams/:teamId/athletes', auth, requireRole(access.sportsLead), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({
    athleteId: z.number().int(),
    role: z.enum(['Titular', 'Suplente', 'En prueba', 'Baja']),
    position: z.string().optional()
  }).safeParse(req.body)
  const teamId = Number(req.params.teamId)
  if (!body.success || !Number.isInteger(teamId)) return res.status(400).json({ error: 'Asignación inválida' })
  assignAthleteToTeam(body.data.athleteId, teamId, body.data.role, body.data.position ?? 'General')
  audit(req.user!.id, 'assign', 'athlete_teams', body.data.athleteId, { teamId, role: body.data.role, position: body.data.position })
  res.status(201).json({ ok: true })
})

// Events & Competitions
app.get('/api/events', auth, requireRole(access.staff), (_req: AuthRequest, res) => {
  res.json(db.prepare('SELECT * FROM events ORDER BY starts_at').all())
})

app.post('/api/events', auth, requireRole(access.coaching), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({
    title: z.string().min(2),
    type: z.string().min(2),
    location: z.string().optional(),
    startsAt: z.string(),
    endsAt: z.string().optional(),
    cost: z.number().nonnegative().optional(),
    notes: z.string().optional(),
    checklist: z.string().optional(),
    results: z.string().optional()
  }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'Evento inválido' })
  const startsAt = new Date(body.data.startsAt)
  const endsAt = body.data.endsAt ? new Date(body.data.endsAt) : null
  if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime())) || (endsAt && endsAt < startsAt)) {
    return res.status(400).json({ error: 'El rango de fechas del evento no es válido.' })
  }
  const result = db.prepare('INSERT INTO events (title, type, location, starts_at, ends_at, cost, notes, checklist, results) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    body.data.title, body.data.type, body.data.location ?? null, body.data.startsAt, body.data.endsAt ?? null, body.data.cost ?? 0, body.data.notes ?? null, body.data.checklist ?? null, body.data.results ?? null
  )
  audit(req.user!.id, 'create', 'events', Number(result.lastInsertRowid), body.data)
  res.status(201).json({ id: Number(result.lastInsertRowid) })
})

app.patch('/api/events/:id', auth, requireRole(access.coaching), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const body = z.object({
    title: z.string().trim().min(2).max(180).optional(),
    type: z.string().trim().min(2).max(80).optional(),
    location: z.string().trim().max(200).nullable().optional(),
    startsAt: z.string().optional(),
    endsAt: z.string().nullable().optional(),
    cost: z.number().nonnegative().optional(),
    checklist: z.string().optional(),
    results: z.string().optional(),
    notes: z.string().optional()
  }).safeParse(req.body)
  if (!body.success || !Number.isInteger(id)) return res.status(400).json({ error: 'Datos inválidos' })
  if (Object.keys(body.data).length === 0) return res.status(400).json({ error: 'Indica al menos un dato para actualizar.' })
  const current = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as { title: string; type: string; location: string | null; starts_at: string; ends_at: string | null; cost: number; checklist: string | null; results: string | null; notes: string | null } | undefined
  if (!current) return res.status(404).json({ error: 'Evento no encontrado.' })
  const startsAt = body.data.startsAt ?? current.starts_at
  const endsAt = body.data.endsAt === undefined ? current.ends_at : body.data.endsAt
  const startDate = new Date(startsAt)
  const endDate = endsAt ? new Date(endsAt) : null
  if (Number.isNaN(startDate.getTime()) || (endDate && Number.isNaN(endDate.getTime())) || (endDate && endDate < startDate)) return res.status(400).json({ error: 'El rango de fechas no es válido.' })
  db.prepare('UPDATE events SET title = ?, type = ?, location = ?, starts_at = ?, ends_at = ?, cost = ?, checklist = ?, results = ?, notes = ? WHERE id = ?').run(
    body.data.title ?? current.title, body.data.type ?? current.type, body.data.location === undefined ? current.location : body.data.location, startsAt, endsAt, body.data.cost ?? current.cost, body.data.checklist ?? current.checklist, body.data.results ?? current.results, body.data.notes ?? current.notes, id
  )
  audit(req.user!.id, 'update', 'events', id, body.data)
  res.json({ ok: true })
})

app.delete('/api/events/:id', auth, requireRole(access.coaching), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identificador de evento inválido.' })
  const event = db.prepare('SELECT title FROM events WHERE id = ?').get(id) as { title: string } | undefined
  if (!event) return res.status(404).json({ error: 'Evento no encontrado.' })
  db.prepare('DELETE FROM events WHERE id = ?').run(id)
  audit(req.user!.id, 'delete', 'events', id, { title: event.title })
  res.json({ ok: true })
})

app.get('/api/events/:id/teams', auth, requireRole(access.coaching), (req, res) => {
  const eventId = Number(req.params.id)
  if (!Number.isInteger(eventId)) return res.status(400).json({ error: 'Competencia inválida.' })
  res.json(db.prepare(`
    SELECT event_teams.event_id, event_teams.team_id, event_teams.status, event_teams.notes,
      teams.name, categories.name AS category, disciplines.name AS discipline, users.name AS coach
    FROM event_teams
    JOIN teams ON teams.id = event_teams.team_id
    LEFT JOIN categories ON categories.id = teams.category_id
    LEFT JOIN disciplines ON disciplines.id = categories.discipline_id
    LEFT JOIN users ON users.id = teams.coach_id
    WHERE event_teams.event_id = ?
    ORDER BY teams.name
  `).all(eventId))
})

app.post('/api/events/:id/teams', auth, requireRole(access.coaching), rememberMutation, (req: AuthRequest, res) => {
  const eventId = Number(req.params.id)
  const body = z.object({ teamId: z.number().int().positive(), status: z.enum(['convoked', 'confirmed', 'withdrawn']).optional(), notes: z.string().max(500).optional() }).safeParse(req.body)
  if (!Number.isInteger(eventId) || !body.success) return res.status(400).json({ error: 'Asignación de equipo inválida.' })
  if (!db.prepare('SELECT id FROM events WHERE id = ? AND type = ?').get(eventId, 'Competencia')) return res.status(404).json({ error: 'Competencia no encontrada.' })
  if (!db.prepare('SELECT id FROM teams WHERE id = ?').get(body.data.teamId)) return res.status(404).json({ error: 'Equipo no encontrado.' })
  db.prepare(`INSERT INTO event_teams (event_id, team_id, status, notes) VALUES (?, ?, ?, ?)
    ON CONFLICT(event_id, team_id) DO UPDATE SET status = excluded.status, notes = excluded.notes`).run(eventId, body.data.teamId, body.data.status ?? 'convoked', body.data.notes ?? null)
  audit(req.user!.id, 'assign', 'event_teams', body.data.teamId, { eventId, ...body.data })
  res.status(201).json({ ok: true })
})

app.delete('/api/events/:id/teams/:teamId', auth, requireRole(access.coaching), (req: AuthRequest, res) => {
  const eventId = Number(req.params.id)
  const teamId = Number(req.params.teamId)
  if (!Number.isInteger(eventId) || !Number.isInteger(teamId)) return res.status(400).json({ error: 'Asignación inválida.' })
  const result = db.prepare('DELETE FROM event_teams WHERE event_id = ? AND team_id = ?').run(eventId, teamId)
  if (!result.changes) return res.status(404).json({ error: 'El equipo no estaba convocado.' })
  audit(req.user!.id, 'remove', 'event_teams', teamId, { eventId })
  res.json({ ok: true })
})

// Evaluations & Sports Performance
app.get('/api/evaluations', auth, requireRole(access.coaching), (_req, res) => {
  res.json(db.prepare(`
    SELECT evaluations.*, athletes.name AS athlete, users.name AS coach, rubrics.name AS rubric_name
    FROM evaluations
    JOIN athletes ON athletes.id = evaluations.athlete_id
    LEFT JOIN users ON users.id = evaluations.coach_id
    LEFT JOIN rubrics ON rubrics.id = evaluations.rubric_id
    ORDER BY evaluated_at DESC
  `).all())
})

app.post('/api/evaluations', auth, requireRole(access.coaching), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({
    athleteId: z.number().int(),
    technique: z.number().int().min(0).max(100),
    flexibility: z.number().int().min(0).max(100),
    strength: z.number().int().min(0).max(100),
    attitude: z.number().int().min(0).max(100),
    teamwork: z.number().int().min(0).max(100),
    stunts: z.number().int().min(0).max(100).optional(),
    tumbling: z.number().int().min(0).max(100).optional(),
    jumps: z.number().int().min(0).max(100).optional(),
    rubricId: z.number().int().positive().optional(),
    feedback: z.string().optional(),
    privateNotes: z.string().optional()
  }).safeParse(req.body)

  if (!body.success) return res.status(400).json({ error: 'Evaluación inválida' })
  if (body.data.rubricId && !db.prepare('SELECT id FROM rubrics WHERE id = ? AND active = 1').get(body.data.rubricId)) return res.status(400).json({ error: 'La rúbrica seleccionada no está disponible.' })
  const result = db.prepare(`
    INSERT INTO evaluations (athlete_id, coach_id, rubric_id, technique, flexibility, strength, attitude, teamwork, stunts, tumbling, jumps, feedback, private_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    body.data.athleteId, req.user!.id, body.data.rubricId ?? null, body.data.technique, body.data.flexibility, body.data.strength, body.data.attitude, body.data.teamwork,
    body.data.stunts ?? 0, body.data.tumbling ?? 0, body.data.jumps ?? 0, body.data.feedback ?? null, body.data.privateNotes ?? null
  )
  audit(req.user!.id, 'create', 'evaluations', Number(result.lastInsertRowid))
  res.status(201).json({ id: Number(result.lastInsertRowid) })
})

// Goals
app.get('/api/goals', auth, requireRole(access.coaching), (_req, res) => {
  res.json(db.prepare('SELECT goals.*, athletes.name AS athlete FROM goals JOIN athletes ON athletes.id = goals.athlete_id ORDER BY goals.due_date IS NULL, goals.due_date, goals.id DESC').all())
})

app.post('/api/goals', auth, requireRole(access.coaching), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({
    athleteId: z.number().int(),
    title: z.string().min(2).max(300),
    horizon: z.enum(['Corto plazo', 'Mediano plazo', 'Largo plazo']),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'Meta inválida' })
  const result = db.prepare('INSERT INTO goals (athlete_id, title, horizon, due_date) VALUES (?, ?, ?, ?)').run(
    body.data.athleteId, body.data.title, body.data.horizon, body.data.dueDate ?? null
  )
  audit(req.user!.id, 'create', 'goals', Number(result.lastInsertRowid), body.data)
  res.status(201).json({ id: Number(result.lastInsertRowid) })
})

app.patch('/api/goals/:id', auth, requireRole(access.coaching), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const body = z.object({ progress: z.number().int().min(0).max(100) }).safeParse(req.body)
  if (!Number.isInteger(id) || !body.success) return res.status(400).json({ error: 'Progreso inválido' })
  const result = db.prepare('UPDATE goals SET progress = ? WHERE id = ?').run(body.data.progress, id)
  if (!result.changes) return res.status(404).json({ error: 'Meta no encontrada' })
  audit(req.user!.id, 'update', 'goals', id, body.data)
  res.json({ ok: true })
})

// Injuries & Rehabilitation
app.get('/api/injuries', auth, requireRole(access.medical), (_req, res) => {
  res.json(db.prepare("SELECT injuries.*, athletes.name AS athlete FROM injuries JOIN athletes ON athletes.id = injuries.athlete_id ORDER BY injuries.status = 'active' DESC, injuries.reported_at DESC").all())
})

app.post('/api/injuries', auth, requireRole(access.medical), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({
    athleteId: z.number().int(),
    description: z.string().min(2).max(500),
    restriction: z.string().max(500).optional(),
    reportedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    privateNotes: z.string().max(1000).optional()
  }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'Registro de lesión inválido' })
  const result = db.prepare('INSERT INTO injuries (athlete_id, description, restriction, reported_at, return_date, private_notes) VALUES (?, ?, ?, ?, ?, ?)').run(
    body.data.athleteId, body.data.description, body.data.restriction ?? null, body.data.reportedAt ?? new Date().toISOString().slice(0, 10), body.data.returnDate ?? null, body.data.privateNotes ?? null
  )
  audit(req.user!.id, 'create', 'injuries', Number(result.lastInsertRowid))
  res.status(201).json({ id: Number(result.lastInsertRowid) })
})

app.patch('/api/injuries/:id', auth, requireRole(access.medical), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const body = z.object({ status: z.enum(['active', 'cleared']) }).safeParse(req.body)
  if (!Number.isInteger(id) || !body.success) return res.status(400).json({ error: 'Actualización de lesión inválida' })
  const result = db.prepare('UPDATE injuries SET status = ? WHERE id = ?').run(body.data.status, id)
  if (!result.changes) return res.status(404).json({ error: 'Lesión no encontrada' })
  audit(req.user!.id, 'update', 'injuries', id, body.data)
  res.json({ ok: true })
})

// Products & Inventory
app.get('/api/products', auth, requireRole(access.inventory), (_req, res) => {
  res.json(db.prepare('SELECT *, stock <= min_stock AS low_stock FROM products ORDER BY active DESC, name').all())
})

app.post('/api/products', auth, requireRole(access.inventory), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({
    sku: z.string().min(2),
    name: z.string().min(2),
    category: z.string().optional(),
    size: z.string().optional(),
    color: z.string().optional(),
    cost: z.number().nonnegative(),
    price: z.number().nonnegative(),
    stock: z.number().int().nonnegative(),
    minStock: z.number().int().nonnegative().optional()
  }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'Producto inválido' })
  const result = db.prepare('INSERT INTO products (sku, name, category, size, color, cost, price, stock, min_stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    body.data.sku, body.data.name, body.data.category ?? null, body.data.size ?? null, body.data.color ?? null, body.data.cost, body.data.price, body.data.stock, body.data.minStock ?? 2
  )
  audit(req.user!.id, 'create', 'products', Number(result.lastInsertRowid))
  res.status(201).json({ id: Number(result.lastInsertRowid) })
})

app.patch('/api/products/:id', auth, requireRole(access.inventory), (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const body = z.object({ sku: z.string().min(2).optional(), name: z.string().min(2).optional(), category: z.string().nullable().optional(), size: z.string().nullable().optional(), color: z.string().nullable().optional(), cost: z.number().nonnegative().optional(), price: z.number().nonnegative().optional(), minStock: z.number().int().nonnegative().optional(), active: z.boolean().optional() }).safeParse(req.body)
  if (!Number.isInteger(id) || !body.success || Object.keys(body.data).length === 0) return res.status(400).json({ error: 'Actualización de producto inválida.' })
  try {
    const result = db.prepare(`UPDATE products SET sku = COALESCE(?, sku), name = COALESCE(?, name), category = COALESCE(?, category), size = COALESCE(?, size), color = COALESCE(?, color), cost = COALESCE(?, cost), price = COALESCE(?, price), min_stock = COALESCE(?, min_stock), active = COALESCE(?, active) WHERE id = ?`).run(body.data.sku ?? null, body.data.name ?? null, body.data.category ?? null, body.data.size ?? null, body.data.color ?? null, body.data.cost ?? null, body.data.price ?? null, body.data.minStock ?? null, body.data.active === undefined ? null : Number(body.data.active), id)
    if (!result.changes) return res.status(404).json({ error: 'Producto no encontrado.' })
    audit(req.user!.id, 'update', 'products', id, body.data)
    res.json({ ok: true })
  } catch { res.status(409).json({ error: 'El SKU ya está asignado a otro producto.' }) }
})

app.post('/api/products/:id/movements', auth, requireRole(access.inventory), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({
    kind: z.enum(['entry', 'exit', 'return', 'adjustment']),
    quantity: z.number().int().positive(),
    reason: z.string().optional()
  }).safeParse(req.body)
  const id = Number(req.params.id)
  if (!body.success || !Number.isInteger(id)) return res.status(400).json({ error: 'Movimiento inválido' })
  const delta = body.data.kind === 'entry' || body.data.kind === 'return' ? body.data.quantity : -body.data.quantity
  const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(id) as { stock: number } | undefined
  if (!product || product.stock + delta < 0) return res.status(409).json({ error: 'Existencia insuficiente' })
  const movement = db.transaction(() => {
    db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(delta, id)
    return db.prepare('INSERT INTO inventory_movements (product_id, kind, quantity, reason) VALUES (?, ?, ?, ?)').run(id, body.data.kind, body.data.quantity, body.data.reason ?? null)
  })()
  audit(req.user!.id, 'create', 'inventory_movements', Number(movement.lastInsertRowid), body.data)
  res.status(201).json({ ok: true })
})

// Point of Sale / Venta Directa a Atleta
app.post('/api/sales', auth, requireRole(access.inventory), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({
    productId: z.number().int(),
    athleteId: z.number().int().optional(),
    quantity: z.number().int().positive(),
    createCharge: z.boolean().default(true),
    isPaid: z.boolean().default(false),
    paymentMethod: z.string().optional()
  }).safeParse(req.body)

  if (!body.success) return res.status(400).json({ error: 'Venta inválida' })
  if (!body.data.createCharge && !body.data.isPaid) return res.status(400).json({ error: 'Registra la venta como pagada o genera el cargo pendiente.' })
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(body.data.productId) as { id: number; name: string; price: number; stock: number } | undefined
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' })
  if (product.stock < body.data.quantity) return res.status(409).json({ error: `Existencia insuficiente (${product.stock} disponibles)` })

  const total = Math.round(product.price * body.data.quantity * 100) / 100
  const saleTransaction = db.transaction(() => {
    // 1. Deduct stock & create movement
    db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(body.data.quantity, product.id)
    db.prepare("INSERT INTO inventory_movements (product_id, kind, quantity, reason) VALUES (?, 'exit', ?, ?)").run(
      product.id, body.data.quantity, `Venta en mostrador (${body.data.athleteId ? 'Atleta #' + body.data.athleteId : 'Público'})`
    )

    // 2. If createCharge and athleteId provided, insert into payments
    let paymentId: number | null = null
    if (body.data.createCharge || body.data.isPaid) {
      const pResult = db.prepare(`
        INSERT INTO payments (athlete_id, concept, amount, due_date, status, paid_at, payment_method)
        VALUES (?, ?, ?, CURRENT_DATE, ?, ?, ?)
      `).run(
        body.data.athleteId ?? null,
        `Venta de producto: ${product.name} (x${body.data.quantity})`,
        total,
        body.data.isPaid ? 'paid' : 'pending',
        body.data.isPaid ? new Date().toISOString() : null,
        body.data.paymentMethod ?? null
      )
      paymentId = Number(pResult.lastInsertRowid)
    }
    return { total, paymentId }
  })

  const result = saleTransaction()
  audit(req.user!.id, 'sale', 'products', product.id, { quantity: body.data.quantity, total: result.total, athleteId: body.data.athleteId })
  res.status(201).json({ ok: true, total: result.total, paymentId: result.paymentId })
})

// Wardrobe / Vestuarios
app.get('/api/wardrobe', auth, requireRole(access.coaching), (_req, res) => {
  res.json(db.prepare(`
    SELECT wardrobe_assignments.*, athletes.name AS athlete, teams.name AS team
    FROM wardrobe_assignments
    JOIN athletes ON athletes.id = wardrobe_assignments.athlete_id
    LEFT JOIN teams ON teams.id = wardrobe_assignments.team_id
    ORDER BY wardrobe_assignments.id DESC
  `).all())
})

app.post('/api/wardrobe', auth, requireRole(access.coaching), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({
    athleteId: z.number().int(),
    teamId: z.number().int().optional(),
    garment: z.string().min(2),
    size: z.string().optional(),
    eventId: z.number().int().optional(),
    createCharge: z.boolean().default(false),
    price: z.number().nonnegative().max(1000000).optional(),
    expectedOn:z.string().date().optional(),
    supplier:z.string().trim().max(120).optional(),
    orderReference:z.string().trim().max(120).optional()
  }).safeParse(req.body)

  if (!body.success) return res.status(400).json({ error: 'Asignación inválida' })
  if (body.data.createCharge && !req.user!.permissions.includes('finance')) return res.status(403).json({ error: 'Solo finanzas puede generar un cargo. Desactiva la opción de cargo para asignar la prenda.' })
  if (body.data.createCharge && !body.data.price) return res.status(400).json({ error: 'Indica un importe mayor a cero.' })
  const result = db.transaction(() => {
    const assignment = db.prepare('INSERT INTO wardrobe_assignments (athlete_id, team_id, garment, size, event_id) VALUES (?, ?, ?, ?, ?)').run(
      body.data.athleteId, body.data.teamId ?? null, body.data.garment, body.data.size ?? null, body.data.eventId ?? null
    )
    db.prepare('UPDATE wardrobe_assignments SET expected_on=?,supplier=?,order_reference=? WHERE id=?').run(body.data.expectedOn??null,body.data.supplier??null,body.data.orderReference??null,assignment.lastInsertRowid)
    if (body.data.createCharge) {
      const charge = db.prepare("INSERT INTO payments (athlete_id, concept, amount, due_date) VALUES (?, ?, ?, date('now', '+7 days'))").run(body.data.athleteId, `Vestuario: ${body.data.garment} (Talla ${body.data.size ?? 'Única'})`, body.data.price)
      db.prepare('UPDATE wardrobe_assignments SET payment_id=? WHERE id=?').run(charge.lastInsertRowid,assignment.lastInsertRowid)
      audit(req.user!.id, 'create', 'payments', Number(charge.lastInsertRowid), { wardrobeId: Number(assignment.lastInsertRowid) })
    }
    return assignment
  })()
  audit(req.user!.id, 'create', 'wardrobe_assignments', Number(result.lastInsertRowid))
  res.status(201).json({ id: Number(result.lastInsertRowid) })
})

app.patch('/api/wardrobe/:id/status', auth, requireRole(access.coaching), (req: AuthRequest, res) => {
  const body = z.object({ status: z.enum(['pending', 'delivered', 'returned']) }).safeParse(req.body)
  const id = Number(req.params.id)
  if (!body.success || !Number.isInteger(id)) return res.status(400).json({ error: 'Estado inválido' })
  if (!db.prepare('SELECT id FROM wardrobe_assignments WHERE id=?').get(id)) return res.status(404).json({error:'Prenda no encontrada.'})
  const date = new Date().toISOString()
  db.prepare(`
    UPDATE wardrobe_assignments SET 
      status = ?, 
      delivered_at = CASE WHEN ? = 'delivered' THEN ? ELSE delivered_at END, 
      returned_at = CASE WHEN ? = 'returned' THEN ? ELSE returned_at END 
    WHERE id = ?
  `).run(body.data.status, body.data.status, date, body.data.status, date, id)
  audit(req.user!.id, 'update', 'wardrobe_assignments', id, body.data)
  res.json({ ok: true })
})

// Communications & WhatsApp Templates
app.post('/api/communications', auth, requireRole(access.staff), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({
    audience: z.string().min(2),
    subject: z.string().min(2),
    body: z.string().min(2),
    channel: z.enum(['app', 'whatsapp', 'email']).optional()
  }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'Comunicado inválido' })
  const result = db.prepare('INSERT INTO communications (author_id, audience, subject, body, channel) VALUES (?, ?, ?, ?, ?)').run(
    req.user!.id, body.data.audience, body.data.subject, body.data.body, body.data.channel ?? 'app'
  )
  audit(req.user!.id, 'create', 'communications', Number(result.lastInsertRowid))
  res.status(201).json({ id: Number(result.lastInsertRowid) })
})

app.get('/api/communications', auth, (req: AuthRequest, res) => {
  if (req.user?.role !== 'Padres y tutores' && !req.user?.permissions.includes('staff')) return res.status(403).json({ error: 'No tienes permiso para consultar comunicados.' })
  res.json(db.prepare(`
    SELECT communications.*, users.name AS author
    FROM communications
    LEFT JOIN users ON users.id = communications.author_id
    WHERE ? = 0 OR communications.audience IN ('Todos', 'Padres y tutores', 'Familias', 'Toda la academia', 'Todos los atletas y familias')
      OR communications.audience IN (
        SELECT 'Padres y tutores de ' || teams.name FROM teams
        JOIN athlete_teams ON athlete_teams.team_id = teams.id AND athlete_teams.ended_at IS NULL
        JOIN athletes ON athletes.id = athlete_teams.athlete_id WHERE athletes.guardian_id = ?
      )
    ORDER BY created_at DESC
  `).all(req.user?.role === 'Padres y tutores' ? 1 : 0, familyGuardianId(req.user!.id) ?? null))
})

// Documents & Responsivas
function downloadDocument(req: AuthRequest, res: Response, family: boolean) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Documento inválido.' })
  const doc = db.prepare('SELECT documents.*, athletes.guardian_id FROM documents LEFT JOIN athletes ON athletes.id = documents.athlete_id WHERE documents.id = ?').get(id) as { name: string; file_data: string | null; guardian_id: number; visibility: string } | undefined
  if (!doc || (family && (doc.guardian_id !== familyGuardianId(req.user!.id) || !['family', 'public'].includes(doc.visibility)))) return res.status(404).json({ error: 'Documento no disponible.' })
  if (!doc.file_data) return res.status(404).json({ error: 'Este registro no tiene un archivo adjunto. Solicítalo a la academia.' })
  res.json({ name: doc.name, fileData: doc.file_data })
}
app.get('/api/documents/:id/download', auth, requireRole(access.documents), (req: AuthRequest, res) => downloadDocument(req, res, false))
app.get('/api/family/documents/:id/download', auth, (req: AuthRequest, res) => { if (parentOnly(req, res)) downloadDocument(req, res, true) })

app.get('/api/athletes/:id/documents', auth, requireRole(access.documents), (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' })
  res.json(db.prepare('SELECT * FROM documents WHERE athlete_id = ? ORDER BY id DESC').all(id))
})

app.post('/api/athletes/:id/documents', auth, requireRole(access.documents), rememberMutation, (req: AuthRequest, res) => {
  const athleteId = Number(req.params.id)
  const body = z.object({
    name: z.string().min(2),
    docType: z.string().default('otro'),
    expiresAt: z.string().optional(),
    fileData: z.string().max(7_000_000).regex(/^data:(application\/pdf|image\/(png|jpeg|webp)|text\/plain);base64,[A-Za-z0-9+/=\r\n]+$/).optional(),
    visibility: z.enum(['private', 'family']).default('private')
  }).safeParse(req.body)

  if (!body.success || !Number.isInteger(athleteId)) return res.status(400).json({ error: 'Documento inválido' })
  const result = db.prepare('INSERT INTO documents (athlete_id, name, path, doc_type, expires_at, file_data, visibility) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    athleteId, body.data.name, body.data.name, body.data.docType, body.data.expiresAt ?? null, body.data.fileData ?? null, body.data.visibility
  )
  audit(req.user!.id, 'upload', 'documents', Number(result.lastInsertRowid), { athleteId, name: body.data.name })
  res.status(201).json({ id: Number(result.lastInsertRowid) })
})

// Credentials & QR verification
app.post('/api/credentials', auth, requireRole(access.staff), rememberMutation, (req: AuthRequest, res) => {
  const body = z.object({
    athleteId: z.number().int().optional(),
    userId: z.number().int().optional(),
    validUntil: z.string().date()
  }).refine((val) => Boolean(val.athleteId) !== Boolean(val.userId), 'Debe indicar solo atleta o usuario').safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'Credencial inválida' })
  const code = `SR-${randomBytes(10).toString('hex').toUpperCase()}`
  const result = db.prepare('INSERT INTO credentials (athlete_id, user_id, code, valid_until) VALUES (?, ?, ?, ?)').run(
    body.data.athleteId ?? null, body.data.userId ?? null, code, body.data.validUntil
  )
  audit(req.user!.id, 'create', 'credentials', Number(result.lastInsertRowid))
  res.status(201).json({ id: Number(result.lastInsertRowid), code })
})

app.get('/api/credentials', auth, (req: AuthRequest, res) => {
  const isParent = req.user?.role === 'Padres y tutores'
  if (!isParent && !req.user?.permissions.includes('staff')) return res.status(403).json({ error: 'No tienes permiso para consultar credenciales.' })
  const guardianId = isParent ? familyGuardianId(req.user!.id) : null
  if (isParent && !guardianId) return res.status(403).json({ error: 'La cuenta no está vinculada a un tutor.' })
  res.json(db.prepare(`
    SELECT credentials.*, athletes.name AS athlete, athletes.photo_data, teams.name as team_name, disciplines.name as discipline_name
    FROM credentials
    LEFT JOIN athletes ON athletes.id = credentials.athlete_id
    LEFT JOIN athlete_teams ON athlete_teams.athlete_id = athletes.id AND athlete_teams.ended_at IS NULL
    LEFT JOIN teams ON teams.id = athlete_teams.team_id
    LEFT JOIN categories ON categories.id = teams.category_id
    LEFT JOIN disciplines ON disciplines.id = categories.discipline_id
    WHERE revoked = 0 ${guardianId ? 'AND athletes.guardian_id = ?' : ''}
    ORDER BY credentials.id DESC
  `).all(...(guardianId ? [guardianId] : [])))
})

// QR Code verification for gate / access reception
app.get('/api/credentials/verify/:code', auth, requireRole(access.staff), (_req, res) => {
  const code = _req.params.code
  const cred = db.prepare(`
    SELECT credentials.*, athletes.name AS athlete_name, athletes.status AS athlete_status, athletes.photo_data,
      teams.name as team_name, disciplines.name as discipline_name, users.name as user_name, users.active AS user_active, roles.name as user_role
    FROM credentials
    LEFT JOIN athletes ON athletes.id = credentials.athlete_id
    LEFT JOIN athlete_teams ON athlete_teams.athlete_id = athletes.id AND athlete_teams.ended_at IS NULL
    LEFT JOIN teams ON teams.id = athlete_teams.team_id
    LEFT JOIN categories ON categories.id = teams.category_id
    LEFT JOIN disciplines ON disciplines.id = categories.discipline_id
    LEFT JOIN users ON users.id = credentials.user_id
    LEFT JOIN roles ON roles.id = users.role_id
    WHERE credentials.code = ?
  `).get(code) as Record<string, unknown> | undefined

  if (!cred) return res.status(404).json({ valid: false, message: 'Credencial no encontrada' })
  const isExpired = String(cred.valid_until) < new Date().toLocaleDateString('en-CA')
  const inactive = (cred.athlete_id && !['active', 'trial'].includes(String(cred.athlete_status))) || (cred.user_id && !cred.user_active)
  const isValid = !cred.revoked && !isExpired && !inactive
  return res.json({
    valid: isValid,
    credential: cred,
    status: cred.revoked ? 'Revocada' : isExpired ? 'Vencida' : inactive ? 'Atleta inactivo' : 'Vigente y Autorizada'
  })
})

// Reports & Financial Summary
app.get('/api/reports/summary', auth, requireRole(access.finance), (_req, res) => {
  const count = (query: string) => (db.prepare(query).get() as { value: number }).value
  const revenue = count("SELECT COALESCE(SUM(amount), 0) AS value FROM payments WHERE status = 'paid'")
  const receivable = count("SELECT COALESCE(SUM(amount), 0) AS value FROM payments WHERE status IN ('pending', 'overdue')")
  const expenses = count("SELECT COALESCE(SUM(amount), 0) AS value FROM expenses")
  const netCashFlow = revenue - expenses

  res.json({
    athletes: count("SELECT COUNT(*) AS value FROM athletes WHERE status = 'active'"),
    teams: count("SELECT COUNT(*) AS value FROM teams WHERE status = 'active'"),
    revenue,
    receivable,
    expenses,
    netCashFlow,
    lowStock: count('SELECT COUNT(*) AS value FROM products WHERE stock <= min_stock'),
    auditEntries: count('SELECT COUNT(*) AS value FROM audit_logs'),
    activeInjuries: count("SELECT COUNT(*) AS value FROM injuries WHERE status = 'active'")
  })
})

// Audit log
app.get('/api/audit', auth, requireRole(access.admin), (req: AuthRequest, res) => {
  res.json(db.prepare('SELECT audit_logs.*, users.name AS user FROM audit_logs LEFT JOIN users ON users.id = audit_logs.user_id ORDER BY audit_logs.created_at DESC LIMIT 200').all())
})

registerEvolution(app, db, auth)
registerSports(app, db, auth)
registerBackups(app, db, auth)
registerCommercial(app, db, auth)
registerWardrobe(app,db,auth)
registerLedger(app,db,auth)
registerSeasonArchive(app,db,auth)
app.use('/api', (_req, res) => res.status(404).json({ error: 'Recurso no encontrado' }))
if (production) {
  app.use(express.static(resolve('dist')))
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')))
}
app.use((err: Error & { code?: string; status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  if (err.code?.includes('CONSTRAINT_UNIQUE')) return res.status(409).json({ error: 'Ya existe un registro con esos datos.' })
  if (err.code?.includes('CONSTRAINT_FOREIGNKEY')) return res.status(400).json({ error: 'El registro relacionado no existe o está en uso.' })
  if (err.status === 413) return res.status(413).json({ error: 'El archivo supera el tamaño permitido.' })
  if (err instanceof SyntaxError) return res.status(400).json({ error: 'La solicitud contiene datos inválidos.' })
  console.error(err)
  res.status(500).json({ error: 'No fue posible completar la operación. Intenta nuevamente.' })
})
app.listen(port, () => console.log(`Stars Royalty API listening on http://localhost:${port}`))
