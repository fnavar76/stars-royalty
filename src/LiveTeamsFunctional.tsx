import { request, hasPermission } from './api'
import { useEffect, useState } from 'react'
import { Dumbbell, Plus, Save, UsersRound } from 'lucide-react'

type Notify = (message: string) => void

type Team = {
  id: number
  name: string
  category_id?: number | null
  coach_id?: number | null
  category?: string
  discipline?: string
  coach?: string
  athlete_count?: number
}

type Category = { id: number; name: string; season: string; discipline: string }
type CoachUser = { id: number; name: string; role: string }
type Athlete = {
  id: number
  name: string
  role?: string
  position?: string
  photo_data?: string
}


export function LiveTeamsFunctionalView({ notify }: { notify: Notify }) {
  const [teams, setTeams] = useState<Team[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [coaches, setCoaches] = useState<CoachUser[]>([])
  const [allAthletes, setAllAthletes] = useState<Athlete[]>([])
  const [roster, setRoster] = useState<Athlete[]>([])
  const [teamId, setTeamId] = useState('')

  // Create team form
  const [teamName, setTeamName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [catId, setCatId] = useState('')
  const [coachId, setCoachId] = useState('')

  // Assign athlete form
  const [assignAthleteId, setAssignAthleteId] = useState('')
  const [role, setRole] = useState('Titular')
  const [position, setPosition] = useState('Flyer')

  const loadTeams = async () => {
    try {
      const items = await request<Team[]>('/api/teams')
      setTeams(items)
      if (!teamId && items[0]) setTeamId(String(items[0].id))
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al cargar equipos')
    }
  }

  const loadRoster = async () => {
    if (!teamId) return
    try {
      const athletesInTeam = await request<Athlete[]>(`/api/teams/${teamId}/athletes`)
      setRoster(athletesInTeam)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al cargar plantilla')
    }
  }

  useEffect(() => {
    void loadTeams()
    Promise.all([
      request<Category[]>('/api/categories'),
      request<CoachUser[]>('/api/coaches'),
      request<Athlete[]>('/api/athletes')
    ]).then(([cats, users, aths]) => {
      setCategories(cats)
      setCoaches(users)
      setAllAthletes(aths)
      if (cats[0]) setCatId(String(cats[0].id))
      if (users[0]) setCoachId(String(users[0].id))
    }).catch((err: unknown) => notify(err instanceof Error ? err.message : 'No fue posible cargar los catálogos'))
  }, [])

  useEffect(() => {
    void loadRoster()
  }, [teamId])

  const createTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!teamName.trim()) return notify('Indica el nombre del equipo')
    try {
      await request(editingId ? `/api/teams/${editingId}` : '/api/teams', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: teamName,
          categoryId: catId ? Number(catId) : editingId ? null : undefined,
          coachId: coachId ? Number(coachId) : editingId ? null : undefined
        })
      })
      setTeamName('')
      setEditingId(null)
      notify(editingId ? 'Equipo actualizado' : 'Equipo creado exitosamente')
      await loadTeams()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al crear equipo')
    }
  }

  const assignAthlete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!teamId || !assignAthleteId) return notify('Selecciona equipo y atleta')
    try {
      await request(`/api/teams/${teamId}/athletes`, {
        method: 'POST',
        body: JSON.stringify({
          athleteId: Number(assignAthleteId),
          role,
          position
        })
      })
      notify('Atleta asignado a la plantilla técnica')
      setAssignAthleteId('')
      await loadRoster()
      await loadTeams()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al asignar atleta')
    }
  }

  const selectedTeamObj = teams.find((t) => String(t.id) === teamId)
  const isCheer = !selectedTeamObj?.discipline?.toLowerCase().includes('gimnasia')

  const titularCount = roster.filter((a) => a.role === 'Titular').length
  const suplenteCount = roster.filter((a) => a.role === 'Suplente').length
  const trialCount = roster.filter((a) => a.role === 'En prueba').length

  return (
    <>
      {/* Module Stats */}
      <section className="module-stats">
        <div className="stat-card purple">
          <span>Equipos Activos</span>
          <strong>{teams.length}</strong>
          <small><UsersRound size={12} /> Plantillas oficiales</small>
        </div>
        <div className="stat-card mint">
          <span>Titulares en Plantilla</span>
          <strong>{titularCount}</strong>
          <small>{selectedTeamObj?.name ?? 'Equipo seleccionado'}</small>
        </div>
        <div className="stat-card yellow">
          <span>Suplentes / En prueba</span>
          <strong>{suplenteCount + trialCount}</strong>
          <small>{trialCount} en periodo de prueba</small>
        </div>
        <div className="stat-card coral">
          <span>Atletas Totales</span>
          <strong>{allAthletes.length}</strong>
          <small>Disponibles en la academia</small>
        </div>
      </section>

      {/* Team Creation Form */}
      {hasPermission('sportsLead') && <form className="panel live-create-form" onSubmit={createTeam}>
        <div>
          <p className="eyebrow">Organización Deportiva</p>
          <h2>{editingId ? 'Editar Equipo' : 'Crear Nuevo Equipo'}</h2>
        </div>
        <input
          required
          placeholder="Nombre del equipo (ej. Royals Coed Nivel 4)"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
        />
        <select value={catId} onChange={(e) => setCatId(e.target.value)} aria-label="Categoría">
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.discipline} • {c.name} ({c.season})</option>
          ))}
        </select>
        <select value={coachId} onChange={(e) => setCoachId(e.target.value)} aria-label="Coach responsable">
          <option value="">Sin coach asignado</option>
          {coaches.map((coach) => (
            <option key={coach.id} value={coach.id}>Coach: {coach.name}</option>
          ))}
        </select>
        <button className="primary-button">
          <Plus size={16} /> {editingId ? 'Guardar Equipo' : 'Crear Equipo'}
        </button>
        {editingId && <button type="button" className="secondary-button" onClick={() => { setEditingId(null); setTeamName('') }}>Cancelar edición</button>}
      </form>}

      {/* Grid: Roster Viewer & Technical Assignment Form */}
      <div className="split-grid">
        {/* Roster Viewer */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Integración Visual</p>
              <h2>Plantilla: {selectedTeamObj?.name ?? 'Selecciona un equipo'}</h2>
            </div>
            <select
              className="filter-button"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              aria-label="Seleccionar equipo a visualizar"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.category ?? 'General'})</option>
              ))}
            </select>
          </div>

          <p className="section-copy" style={{ marginTop: '6px' }}>
            Disciplina: <b>{selectedTeamObj?.discipline ?? 'Sin asignar'}</b> • Coach Asignado: <b>{selectedTeamObj?.coach ?? 'Sin asignar'}</b>
          </p>
          {hasPermission('sportsLead') && selectedTeamObj && <button className="secondary-button" onClick={() => { setEditingId(selectedTeamObj.id); setTeamName(selectedTeamObj.name); setCatId(String(selectedTeamObj.category_id ?? '')); setCoachId(String(selectedTeamObj.coach_id ?? '')) }}>Editar equipo seleccionado</button>}

          <div className="live-list" style={{ marginTop: '14px' }}>
            {roster.map((ath) => (
              <div className="live-list-item" key={ath.id}>
                <div className="avatar avatar-table">
                  {ath.photo_data ? <img src={ath.photo_data} alt="" /> : ath.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong>{ath.name}</strong>
                  <span>
                    Posición: <b>{ath.position ?? 'General'}</b> • {ath.role ?? 'Titular'}
                  </span>
                </div>
                <span
                  className={`status-pill ${
                    ath.role === 'Titular'
                      ? 'success'
                      : ath.role === 'Suplente'
                      ? 'neutral'
                      : ath.role === 'En prueba'
                      ? 'warning'
                      : 'danger'
                  }`}
                >
                  {ath.role ?? 'Titular'}
                </span>
              </div>
            ))}
            {!roster.length && (
              <p className="empty-state">No hay atletas asignados a este equipo. Agrega uno usando el formulario.</p>
            )}
          </div>
        </div>

        {/* Technical Assignment Form */}
        {hasPermission('sportsLead') && <form className="panel live-form" onSubmit={assignAthlete}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Posición y Formación</p>
              <h2>Asignar Atleta a Plantilla</h2>
            </div>
            <Dumbbell size={19} />
          </div>

          <label>
            Seleccionar Atleta:
            <select
              required
              value={assignAthleteId}
              onChange={(e) => setAssignAthleteId(e.target.value)}
            >
              <option value="">Selecciona un atleta...</option>
              {allAthletes.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>

          <label>
            Condición en el Equipo:
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option>Titular</option>
              <option>Suplente</option>
              <option>En prueba</option>
              <option>Baja</option>
            </select>
          </label>

          <label>
            Posición Técnica Deportiva:
            <select value={position} onChange={(e) => setPosition(e.target.value)}>
              {isCheer ? (
                <>
                  <option value="Flyer">Flyer (Acróbata Elevada)</option>
                  <option value="Main Base">Main Base (Base Principal)</option>
                  <option value="Side Base">Side Base (Base Lateral)</option>
                  <option value="Backspot">Backspot (Cuidador Trasero)</option>
                  <option value="Frontspot">Frontspot (Apoyo Frontal)</option>
                  <option value="Tumbler">Tumbler (Acróbata de Piso)</option>
                </>
              ) : (
                <>
                  <option value="All-Around">All-Around (Gimnasta Completa)</option>
                  <option value="Salto y Piso">Especialista Salto y Piso</option>
                  <option value="Barras Asimétricas">Especialista Barras Asimétricas</option>
                  <option value="Viga de Equilibrio">Especialista Viga de Equilibrio</option>
                </>
              )}
            </select>
          </label>

          <button className="primary-button" style={{ marginTop: '12px' }}>
            <Save size={16} /> Guardar Asignación en Formación
          </button>
        </form>}
      </div>
    </>
  )
}
