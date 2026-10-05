import { request, hasPermission } from './api'
import { useEffect, useMemo, useState } from 'react'
import {
  Award, CalendarDays, CheckSquare,
  ChevronLeft, ChevronRight, MessageCircle, Plus, Trophy
} from 'lucide-react'
import { daysUntil, toLocalDate } from './dateUtils'

type Notify = (message: string) => void

type Team = { id: number; name: string; category?: string; discipline?: string; coach?: string }
type Venue = { id: number; name: string; location?: string }

type EventItem = {
  id: number
  title: string
  type: string
  location?: string
  starts_at: string
  ends_at?: string
  cost: number
  notes?: string
  checklist?: string
  results?: string
}
type CompetitionTeam = { event_id: number; team_id: number; status: 'convoked' | 'confirmed' | 'withdrawn'; notes?: string; name: string; category?: string; discipline?: string; coach?: string }


// --------------------------------------------------------------------------
// MODULE 5: CALENDAR VIEW
// --------------------------------------------------------------------------
export function LiveCalendarView({ notify }: { notify: Notify }) {
  const [events, setEvents] = useState<EventItem[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [filterType, setFilterType] = useState('all')
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const current = new Date()
    return new Date(current.getFullYear(), current.getMonth(), 1)
  })
  const [form, setForm] = useState({
    title: '',
    type: 'Entrenamiento',
    startsAt: '',
    endsAt: '',
    location: '',
    cost: '0',
    notes: ''
  })

  const load = () => {
    Promise.all([
      request<EventItem[]>('/api/events'),
      request<Venue[]>('/api/venues').catch(() => [])
    ])
      .then(([evData, vData]) => {
        setEvents(evData)
        setVenues(vData)
        if (!form.location && vData[0]) {
          setForm((prev) => ({ ...prev, location: vData[0].name }))
        }
      })
      .catch((error: unknown) => notify(error instanceof Error ? error.message : 'Error al cargar agenda'))
  }

  useEffect(() => {
    void load()
  }, [])

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || !form.startsAt) return notify('Indica el nombre y la fecha del evento')
    if (form.endsAt && new Date(form.endsAt).getTime() < new Date(form.startsAt).getTime()) return notify('La fecha de finalización debe ser posterior al inicio')
    try {
      await request(editingEvent ? `/api/events/${editingEvent.id}` : '/api/events', {
        method: editingEvent ? 'PATCH' : 'POST',
        body: JSON.stringify({
          title: form.title,
          type: form.type,
          startsAt: form.startsAt,
          endsAt: form.endsAt || undefined,
          location: form.location,
          cost: Number(form.cost || 0),
          notes: form.notes || undefined
        })
      })
      setForm({
        title: '',
        type: 'Entrenamiento',
        startsAt: '',
        endsAt: '',
        location: venues[0]?.name ?? '',
        cost: '0',
        notes: ''
      })
      notify(editingEvent ? 'Evento actualizado correctamente' : 'Evento registrado en el calendario')
      setEditingEvent(null)
      load()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Error al guardar evento')
    }
  }

  const beginEdit = (event: EventItem) => {
    setEditingEvent(event)
    setForm({ title: event.title, type: eventTypeLabel(event.type), startsAt: event.starts_at.slice(0, 16), endsAt: event.ends_at?.slice(0, 16) ?? '', location: event.location ?? '', cost: String(event.cost ?? 0), notes: event.notes ?? '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const deleteEvent = async (event: EventItem) => {
    if (!window.confirm(`¿Eliminar “${event.title}”? También se retirarán sus equipos convocados.`)) return
    try {
      await request(`/api/events/${event.id}`, { method: 'DELETE' })
      if (editingEvent?.id === event.id) { setEditingEvent(null); setForm({ title: '', type: 'Entrenamiento', startsAt: '', endsAt: '', location: venues[0]?.name ?? '', cost: '0', notes: '' }) }
      notify('Evento eliminado')
      load()
    } catch (error) { notify(error instanceof Error ? error.message : 'No fue posible eliminar el evento') }
  }

  const canManageSchedule = hasPermission('coaching')

  const eventTypeLabel = (type: string) => ({ training: 'Entrenamiento', competition: 'Competencia', evaluation: 'Evaluación', meeting: 'Reunión', exhibition: 'Exhibición' }[type.toLowerCase()] ?? type)

  const filteredEvents = useMemo(() => {
    if (filterType === 'all') return events
    return events.filter((e) => eventTypeLabel(e.type).toLowerCase() === filterType.toLowerCase())
  }, [events, filterType])

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const mondayOffset = (firstDay.getDay() + 6) % 7
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    return Array.from({ length: 42 }, (_, index) => {
      const day = index - mondayOffset + 1
      if (day < 1 || day > daysInMonth) return null
      const dayEvents = filteredEvents.filter((event) => {
        const date = toLocalDate(event.starts_at)
        if (!date) return false
        return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
      })
      return { day, events: dayEvents }
    })
  }, [calendarMonth, filteredEvents])

  const currentDate = new Date()
  const isToday = (day: number) => day === currentDate.getDate() && calendarMonth.getMonth() === currentDate.getMonth() && calendarMonth.getFullYear() === currentDate.getFullYear()
  const eventTone = (type: string) => eventTypeLabel(type) === 'Competencia' ? 'yellow' : eventTypeLabel(type) === 'Reunión' ? 'coral' : eventTypeLabel(type) === 'Evaluación' ? 'mint' : 'purple'

  return (
    <>
      {/* Calendar Toolbar with filters */}
      <div className="calendar-toolbar">
        <select
          className="filter-button"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          aria-label="Filtrar por tipo"
        >
          <option value="all">Todos los eventos</option>
          <option value="Entrenamiento">Entrenamientos</option>
          <option value="Competencia">Competencias</option>
          <option value="Evaluación">Evaluaciones</option>
          <option value="Reunión">Juntas de padres</option>
          <option value="Exhibición">Exhibiciones</option>
        </select>

        <div className="calendar-legend">
          <span><i className="purple-dot dot" /> Entrenamientos</span>
          <span><i className="yellow-dot dot" /> Competencias</span>
          <span><i className="coral-dot dot" /> Reuniones</span>
        </div>
      </div>

      {/* Calendar Form & Layout */}
      {canManageSchedule && <div className="panel calendar-create">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Programación de Actividades</p>
            <h2>{editingEvent ? 'Editar Evento o Entrenamiento' : 'Nuevo Evento o Entrenamiento'}</h2>
          </div>
          <CalendarDays size={20} />
        </div>

        <form className="calendar-form" onSubmit={createEvent}>
          <label>
            Nombre de la actividad
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ej. Práctica de pirámides Royals"
            />
          </label>

          <label>
            Tipo
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>Entrenamiento</option>
              <option>Competencia</option>
              <option>Evaluación</option>
              <option>Reunión</option>
              <option>Exhibición</option>
            </select>
          </label>

          <label>
            Fecha y hora de inicio
            <input
              required
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />
          </label>

          <label>
            Fecha y hora de finalización
            <input
              type="datetime-local"
              min={form.startsAt || undefined}
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            />
          </label>

          <label>
            Sede o salón asignado
            <select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>
              {venues.map((v) => (
                <option key={v.id} value={v.name}>{v.name}</option>
              ))}
              {!venues.length && <option value="Pista Central">Pista Central</option>}
            </select>
          </label>

          <label>
            Costo estimado
            <input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          </label>

          <label>
            Notas operativas
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ej. material, responsable o indicaciones" />
          </label>

          <button className="primary-button"><Plus size={16} /> {editingEvent ? 'Guardar cambios' : 'Agregar'}</button>
          {editingEvent && <button type="button" className="secondary-button" onClick={() => { setEditingEvent(null); setForm({ title: '', type: 'Entrenamiento', startsAt: '', endsAt: '', location: venues[0]?.name ?? '', cost: '0', notes: '' }) }}>Cancelar edición</button>}
        </form>
      </div>}

      {/* Calendar Grid & Agenda */}
      <div className="calendar-layout">
        <div className="panel calendar-grid">
          <div className="calendar-month-navigation">
            <button className="icon-button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} aria-label="Mes anterior"><ChevronLeft size={18} /></button>
            <div><p className="eyebrow">Vista mensual</p><h2>{calendarMonth.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</h2></div>
            <button className="icon-button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} aria-label="Mes siguiente"><ChevronRight size={18} /></button>
          </div>
          <div className="week-head">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          <div className="month-cells">
            {calendarCells.map((cell, idx) => {
              const dayNumber = cell?.day
              return (
                <div
                  className={`month-cell ${dayNumber && isToday(dayNumber) ? 'today' : ''} ${!dayNumber ? 'outside-month' : ''}`}
                  key={idx}
                >
                  <b>{dayNumber}</b>
                  {cell?.events.slice(0, 2).map((event) => <span className={`calendar-event ${eventTone(event.type)}`} key={event.id} title={`${event.title} — ${event.location ?? 'Sede por confirmar'}`}>{event.title}</span>)}
                  {(cell?.events.length ?? 0) > 2 && <small className="calendar-more">+{cell!.events.length - 2} más</small>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Agenda View */}
        <div className="panel event-agenda">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Próximos Días</p>
              <h2>Agenda Central ({filteredEvents.length})</h2>
            </div>
          </div>

          <div className="agenda-list">
            {filteredEvents.map((item) => {
              const d = toLocalDate(item.starts_at)
              if (!d) return null
              return (
                <div className="agenda-item" key={item.id}>
                  <div className="date-block">
                    <strong>{d.getDate() || 18}</strong>
                    <span>{d.toLocaleDateString('es-MX', { month: 'short' }).toUpperCase()}</span>
                  </div>
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {eventTypeLabel(item.type)} • {item.location ?? 'Sede central'} • {d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {item.notes && <small style={{ display: 'block', color: '#8d8591' }}>{item.notes}</small>}
                  </div>
                  <span className={`status-pill ${eventTypeLabel(item.type) === 'Competencia' ? 'warning' : 'success'}`}>
                    {eventTypeLabel(item.type)}
                  </span>
                  {canManageSchedule && <div className="agenda-actions"><button className="text-button" onClick={() => beginEdit(item)}>Editar</button><button className="text-button danger-action" onClick={() => void deleteEvent(item)}>Eliminar</button></div>}
                </div>
              )
            })}
            {!filteredEvents.length && (
              <p className="empty-state">No hay eventos registrados en este periodo.</p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// --------------------------------------------------------------------------
// MODULE 6: COMPETITIONS & CHAMPIONSHIPS VIEW
// --------------------------------------------------------------------------
export function LiveCompetitionsView({ notify }: { notify: Notify }) {
  const [competitions, setCompetitions] = useState<EventItem[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [competitionTeams, setCompetitionTeams] = useState<CompetitionTeam[]>([])
  const [selectedComp, setSelectedComp] = useState<EventItem | null>(null)
  const [form, setForm] = useState({
    title: '',
    startsAt: '',
    endsAt: '',
    location: '',
    cost: '',
    notes: ''
  })

  // Checklist items
  const defaultChecklist = [
    { text: 'Confirmar transporte y autobuses', done: true },
    { text: 'Reservar hospedaje oficial de la delegación', done: true },
    { text: 'Completar pagos de inscripción por equipo', done: false },
    { text: 'Validar certificados médicos y cartas responsivas', done: true },
    { text: 'Cerrar rutina musical oficial y tiempos (2:30 min)', done: true },
    { text: 'Entrega de uniformes oficiales de gala', done: false },
    { text: 'Reunión informativa con padres y tutores', done: false }
  ]

  const [checklist, setChecklist] = useState(defaultChecklist)
  const [resultsText, setResultsText] = useState('')

  const selectCompetition = (competition: EventItem) => {
    setSelectedComp(competition)
    try { setChecklist(competition.checklist ? JSON.parse(competition.checklist) : defaultChecklist) } catch { setChecklist(defaultChecklist) }
    setResultsText(competition.results ?? '')
    void request<CompetitionTeam[]>(`/api/events/${competition.id}/teams`).then(setCompetitionTeams).catch((error: unknown) => notify(error instanceof Error ? error.message : 'No fue posible cargar los equipos convocados'))
  }

  const load = () => {
    Promise.all([
      request<EventItem[]>('/api/events'),
      request<Team[]>('/api/teams')
    ])
      .then(([evs, tms]) => {
        const comps = evs.filter((e) => e.type === 'Competencia')
        setCompetitions(comps)
        setTeams(tms)
        const today = new Date()
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
        const upcoming = comps.find((competition) => (toLocalDate(competition.starts_at)?.getTime() ?? 0) >= todayStart)
        const next = comps.find((competition) => competition.id === selectedComp?.id) ?? upcoming ?? comps[0]
        if (next) selectCompetition(next)
        else setSelectedComp(null)
      })
      .catch((error: unknown) => notify(error instanceof Error ? error.message : 'Error al cargar competencias'))
  }

  useEffect(() => {
    void load()
  }, [])

  const createComp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || !form.startsAt) return notify('Indica nombre y fecha de la competencia')
    if (form.endsAt && new Date(form.endsAt).getTime() < new Date(form.startsAt).getTime()) return notify('La fecha de finalización debe ser posterior al inicio')
    try {
      await request('/api/events', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          type: 'Competencia',
          location: form.location,
          startsAt: form.startsAt,
          endsAt: form.endsAt || undefined,
          cost: Number(form.cost || 0),
          notes: form.notes || undefined,
          checklist: JSON.stringify(defaultChecklist)
        })
      })
      setForm({ title: '', startsAt: '', endsAt: '', location: '', cost: '', notes: '' })
      notify('Competencia deportiva registrada')
      load()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Error al guardar competencia')
    }
  }

  const toggleCheck = async (index: number) => {
    const updated = [...checklist]
    updated[index].done = !updated[index].done
    setChecklist(updated)
    if (selectedComp) {
      try {
        await request(`/api/events/${selectedComp.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ checklist: JSON.stringify(updated) })
        })
      } catch {}
    }
  }

  const saveResults = async () => {
    if (!selectedComp) return
    try {
      await request(`/api/events/${selectedComp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ results: resultsText })
      })
      notify('Resultados y reconocimientos deportivos guardados')
      load()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Error al guardar resultados')
    }
  }

  const toggleTeamCall = async (team: Team) => {
    if (!activeComp) return notify('Selecciona una competencia primero')
    const assigned = competitionTeams.find((item) => item.team_id === team.id)
    try {
      if (assigned) await request(`/api/events/${activeComp.id}/teams/${team.id}`, { method: 'DELETE' })
      else await request(`/api/events/${activeComp.id}/teams`, { method: 'POST', body: JSON.stringify({ teamId: team.id, status: 'convoked' }) })
      const updated = await request<CompetitionTeam[]>(`/api/events/${activeComp.id}/teams`)
      setCompetitionTeams(updated)
      notify(assigned ? `${team.name} retirado de la convocatoria` : `${team.name} convocado a la competencia`)
    } catch (error) { notify(error instanceof Error ? error.message : 'No fue posible actualizar la convocatoria') }
  }

  const activeComp = selectedComp ?? competitions[0]
  const daysLeft = activeComp ? daysUntil(activeComp.starts_at) ?? 0 : 0

  const shareWhatsApp = () => {
    if (!activeComp) return
    const competitionDate = toLocalDate(activeComp.starts_at)?.toLocaleDateString('es-MX') ?? 'Por confirmar'
    const msg = `👑 STARS ROYALTY - CONVOCATORIA OFICIAL 👑\n\nNos preparamos para competir en: *${activeComp.title}*\n📍 Sede: ${activeComp.location ?? 'Por confirmar'}\n📅 Fecha: ${competitionDate}\n⏳ Faltan: ${daysLeft} días.\n\nFavor de verificar que certificados médicos y cuotas de inscripción se encuentren al corriente.`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  return (
    <>
      {/* Hero Competition Card with Countdown */}
      {activeComp ? (
        <div className="hero-competition">
          <div>
            <p className="eyebrow">Próximo Reto de Campeonato</p>
            <h2>{activeComp.title}</h2>
            <p>
              📍 {activeComp.location ?? 'Monterrey, Nuevo León'} • Fecha:{' '}
              {(toLocalDate(activeComp.starts_at) ?? new Date()).toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
            <div className="competition-meta">
              <span><strong>{daysLeft}</strong> días restantes</span>
              <span><strong>{competitionTeams.length}</strong> equipos convocados</span>
              <span><strong>Cuota:</strong> ${activeComp.cost.toLocaleString('es-MX')} MXN</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div className="season-badge">
              <Trophy size={22} />
              <strong>{daysLeft}</strong>
              <span>DÍAS</span>
            </div>
            <button className="whatsapp-button small" onClick={shareWhatsApp} title="Compartir con familias en WhatsApp">
              <MessageCircle size={14} /> Convocatoria WhatsApp
            </button>
          </div>
        </div>
      ) : (
        <div className="hero-competition">
          <h2>Copa All Star 2026</h2>
          <p>Registra las próximas competencias de la temporada.</p>
        </div>
      )}

      {/* Form to Register New Competition */}
      <form className="panel live-create-form" onSubmit={createComp}>
        <div>
          <p className="eyebrow">Nueva Competencia</p>
          <h2>Registrar Campeonato</h2>
        </div>
        <input
          required
          placeholder="Nombre del torneo o copa"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <input
          required
          type="datetime-local"
          value={form.startsAt}
          onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
        />
        <input
          type="datetime-local"
          min={form.startsAt || undefined}
          aria-label="Fecha y hora de finalización"
          title="Fecha y hora de finalización (opcional)"
          value={form.endsAt}
          onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
        />
        <input
          placeholder="Sede / Ciudad"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
        />
        <input
          type="number"
          min="0"
          placeholder="Costo inscripción"
          value={form.cost}
          onChange={(e) => setForm({ ...form, cost: e.target.value })}
        />
        <input
          placeholder="Notas logísticas (opcional)"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        <button className="primary-button">
          <Trophy size={16} /> Guardar
        </button>
      </form>

      <section className="panel competition-directory">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Temporada competitiva</p>
            <h2>Competencias registradas</h2>
          </div>
          <span className="status-pill neutral">{competitions.length} {competitions.length === 1 ? 'competencia' : 'competencias'}</span>
        </div>
        <div className="competition-list">
          {competitions.map((competition) => {
            const date = toLocalDate(competition.starts_at)
            if (!date) return null
            const isSelected = activeComp?.id === competition.id
            return <button key={competition.id} className={`competition-list-item ${isSelected ? 'selected' : ''}`} onClick={() => selectCompetition(competition)}>
              <span className="competition-date"><b>{date.getDate()}</b><small>{date.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '').toUpperCase()}</small></span>
              <span className="competition-list-copy"><strong>{competition.title}</strong><small>{competition.location ?? 'Sede por confirmar'} • {date.toLocaleDateString('es-MX', { year: 'numeric' })}</small></span>
              <span className="competition-fee">${competition.cost.toLocaleString('es-MX')}</span>
              <span className={`status-pill ${isSelected ? 'success' : 'neutral'}`}>{isSelected ? 'Gestionando' : 'Ver detalles'}</span>
            </button>
          })}
          {!competitions.length && <p className="empty-state">Aún no hay competencias registradas. Usa el formulario superior para añadir la primera.</p>}
        </div>
      </section>

      {/* Split Grid: Checklist Logístico & Equipos Convocados */}
      <div className="split-grid">
        {/* Checklist */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Preparación Logística</p>
              <h2>Checklist del Torneo</h2>
            </div>
            <CheckSquare size={19} />
          </div>

          <div className="check-list">
            {checklist.map((item, idx) => (
              <label key={idx} className="check-item-row" onClick={() => toggleCheck(idx)}>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => toggleCheck(idx)}
                />
                <span style={{ textDecoration: item.done ? 'line-through' : 'none', opacity: item.done ? 0.7 : 1 }}>
                  {item.text}
                </span>
                <small className={item.done ? 'text-positive' : 'text-coral'}>
                  {item.done ? 'Listo ✓' : 'Pendiente'}
                </small>
              </label>
            ))}
          </div>
        </div>

        {/* Equipos Convocados & Resultados */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Delegación Stars Royalty</p>
              <h2>Equipos convocados ({competitionTeams.length})</h2>
            </div>
            <Award size={19} />
          </div>

          <div className="team-roster">
            {teams.map((t, idx) => (
              (() => {
                const assigned = competitionTeams.find((item) => item.team_id === t.id)
                return (
              <div className="team-roster-row" key={t.id}>
                <div className={`team-icon team-${idx % 3}`}>
                  <Trophy size={16} />
                </div>
                <div>
                  <strong>{t.name}</strong>
                  <span>{t.discipline ?? 'Cheerleading'} • {t.category ?? 'Nivel 5'} • Coach: {t.coach || 'Andrea Salgado'}</span>
                </div>
                <button className={assigned ? 'status-pill success' : 'status-pill neutral'} onClick={() => void toggleTeamCall(t)} title={assigned ? 'Retirar de competencia' : 'Convocar a competencia'}>{assigned ? 'Convocado ✓' : '+ Convocar'}</button>
              </div>
                )
              })()
            ))}
            {!teams.length && <p className="empty-state">No hay equipos disponibles para convocar.</p>}
          </div>

          {/* Historial de Resultados y Premios */}
          <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #f0edf1' }}>
            <div className="panel-heading" style={{ marginBottom: '10px' }}>
              <div>
                <p className="eyebrow">Reconocimientos & Puntuación</p>
                <h3>Resultados Deportivos</h3>
              </div>
              <button className="primary-button small" onClick={saveResults}>
                Guardar Resultados
              </button>
            </div>
            <textarea
              rows={3}
              placeholder="Ej. Royals Senior: 1er Lugar Nacional (Score 96.4), Premio HIT ZERO (cero deducciones). Royals Junior: 2do Lugar."
              value={resultsText}
              onChange={(e) => setResultsText(e.target.value)}
            />
          </div>
        </div>
      </div>
    </>
  )
}
