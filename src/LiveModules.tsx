import { hasPermission, request } from './api'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, Check,
  ClipboardCheck, HeartPulse, MessageCircle,
  Printer, Save, Target, Trophy
} from 'lucide-react'

type Notify = (message: string) => void

type Athlete = {
  id: number
  name: string
  team?: string
  discipline?: string
  category?: string
  guardian_phone?: string
  guardian_name?: string
  status: string
}

type Team = { id: number; name: string; category?: string; discipline?: string; coach?: string }
type Venue = { id: number; name: string; location?: string }

type Evaluation = {
  id: number
  athlete_id: number
  athlete: string
  coach?: string
  technique: number
  flexibility: number
  strength: number
  attitude: number
  teamwork: number
  stunts?: number
  tumbling?: number
  jumps?: number
  feedback?: string
  private_notes?: string
  rubric_id?: number
  rubric_name?: string
  evaluated_at: string
}

type Rubric = { id: number; name: string; discipline?: string; description?: string; criteria: string[]; active: number }

type Goal = {
  id: number
  athlete_id: number
  athlete: string
  title: string
  horizon: string
  progress: number
  due_date?: string
}

type Injury = {
  id: number
  athlete_id: number
  athlete: string
  description: string
  restriction?: string
  reported_at: string
  return_date?: string
  status: 'active' | 'cleared'
  private_notes?: string
}

type AttendanceStatus = 'present' | 'late' | 'excused' | 'absent'
type AttendanceItem = {
  id?: number
  athlete_id: number
  athlete?: string
  team?: string
  attended_on: string
  status: AttendanceStatus
  notes?: string
}


// --------------------------------------------------------------------------
// MODULE 3: PERFORMANCE VIEW
// --------------------------------------------------------------------------
export function LivePerformanceView({ notify }: { notify: Notify }) {
  const [activeTab, setActiveTab] = useState<'evaluaciones' | 'rubricas' | 'ranking' | 'lesiones' | 'metas'>('evaluaciones')
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [injuries, setInjuries] = useState<Injury[]>([])
  const [rubrics, setRubrics] = useState<Rubric[]>([])

  // Form evaluation
  const [athleteId, setAthleteId] = useState('')
  const [disciplineType, setDisciplineType] = useState<'Cheerleading' | 'Gimnasia'>('Cheerleading')
  const [rubricId, setRubricId] = useState('')
  const [scores, setScores] = useState({
    technique: 90,
    flexibility: 85,
    strength: 88,
    attitude: 95,
    teamwork: 92,
    stunts: 88,
    tumbling: 85,
    jumps: 90,
    feedback: '',
    privateNotes: ''
  })

  // Goal state
  const [goalTitle, setGoalTitle] = useState('')
  const [goalHorizon, setGoalHorizon] = useState('Corto plazo')
  const [goalDueDate, setGoalDueDate] = useState('')

  // Injury form
  const [injAthleteId, setInjAthleteId] = useState('')
  const [injDescription, setInjDescription] = useState('')
  const [injRestriction, setInjRestriction] = useState('')
  const [injReturnDate, setInjReturnDate] = useState('')
  const [injPrivateNotes, setInjPrivateNotes] = useState('')

  // Print evaluation state
  const [printingEval, setPrintingEval] = useState<Evaluation | null>(null)

  const load = useCallback(() => Promise.all([
        request<Athlete[]>('/api/athletes'),
        request<Evaluation[]>('/api/evaluations'),
        request<Goal[]>('/api/goals'),
        hasPermission('medical') ? request<Injury[]>('/api/injuries') : Promise.resolve([] as Injury[]),
        request<Rubric[]>('/api/rubrics')
      ]).then(([ath, ev, g, inj, loadedRubrics]) => {
      setAthletes(ath)
      setEvaluations(ev)
      setGoals(g)
      setInjuries(inj)
      setRubrics(loadedRubrics)
      setRubricId(current=>current||String(loadedRubrics[0]?.id??''))
      setAthleteId(current=>current||String(ath[0]?.id??''))
      setInjAthleteId(current=>current||String(ath[0]?.id??''))
    }).catch((error:unknown) => {
      notify(error instanceof Error ? error.message : 'Error al cargar rendimiento')
    }), [notify])

  useEffect(() => {
    void load()
  }, [load])

  const calcOverall = (ev: Evaluation) => {
    const base = [ev.technique, ev.flexibility, ev.strength, ev.attitude, ev.teamwork]
    if (ev.stunts) base.push(ev.stunts)
    if (ev.tumbling) base.push(ev.tumbling)
    if (ev.jumps) base.push(ev.jumps)
    return Math.round(base.reduce((a, b) => a + b, 0) / base.length)
  }

  const saveEvaluation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!athleteId) return notify('Selecciona un atleta')
    try {
      await request('/api/evaluations', {
        method: 'POST',
        body: JSON.stringify({
          athleteId: Number(athleteId),
          technique: scores.technique,
          flexibility: scores.flexibility,
          strength: scores.strength,
          attitude: scores.attitude,
          teamwork: scores.teamwork,
          stunts: disciplineType === 'Cheerleading' ? scores.stunts : 0,
          tumbling: scores.tumbling,
          jumps: disciplineType === 'Cheerleading' ? scores.jumps : 0,
          rubricId: rubricId ? Number(rubricId) : undefined,
          feedback: scores.feedback,
          privateNotes: scores.privateNotes
        })
      })
      notify('Evaluación deportiva guardada exitosamente')
      setScores({ ...scores, feedback: '', privateNotes: '' })
      await load()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Error al guardar evaluación')
    }
  }

  const saveGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!athleteId || !goalTitle.trim()) return notify('Indica atleta y meta')
    try {
      await request('/api/goals', {
        method: 'POST',
        body: JSON.stringify({
          athleteId: Number(athleteId),
          title: goalTitle,
          horizon: goalHorizon,
          dueDate: goalDueDate || undefined
        })
      })
      notify('Meta registrada con éxito')
      setGoalTitle('')
      setGoalDueDate('')
      await load()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Error al guardar meta')
    }
  }

  const updateGoalProgress = async (id: number, currentProgress: number, delta: number) => {
    const next = Math.max(0, Math.min(100, currentProgress + delta))
    try {
      await request(`/api/goals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ progress: next })
      })
      notify(`Progreso actualizado al ${next}%`)
      await load()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al actualizar meta')
    }
  }

  const saveInjury = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!injAthleteId || !injDescription.trim()) return notify('Selecciona atleta y describe la lesión')
    try {
      await request('/api/injuries', {
        method: 'POST',
        body: JSON.stringify({
          athleteId: Number(injAthleteId),
          description: injDescription,
          restriction: injRestriction || undefined,
          returnDate: injReturnDate || undefined,
          privateNotes: injPrivateNotes || undefined
        })
      })
      notify('Lesión y protocolo de retorno registrados')
      setInjDescription('')
      setInjRestriction('')
      setInjReturnDate('')
      setInjPrivateNotes('')
      await load()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al registrar lesión')
    }
  }

  const clearInjury = async (id: number) => {
    try {
      await request(`/api/injuries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cleared' })
      })
      notify('Atleta dado de alta médica y retorno seguro confirmado')
      await load()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al actualizar')
    }
  }

  // Ranking calculation
  const rankings = useMemo(() => {
    const map = new Map<string, { athlete: string; avg: number; count: number; team?: string; discipline?: string }>()
    evaluations.forEach((ev) => {
      const overall = calcOverall(ev)
      const current = map.get(ev.athlete)
      const ath = athletes.find((a) => a.name === ev.athlete)
      if (!current) {
        map.set(ev.athlete, {
          athlete: ev.athlete,
          avg: overall,
          count: 1,
          team: ath?.team,
          discipline: ath?.discipline
        })
      } else {
        map.set(ev.athlete, {
          ...current,
          avg: Math.round((current.avg * current.count + overall) / (current.count + 1)),
          count: current.count + 1
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => b.avg - a.avg)
  }, [evaluations, athletes])

  const activeInjuries = injuries.filter((i) => i.status === 'active')
  const avgTech = evaluations.length
    ? Math.round(evaluations.reduce((sum, e) => sum + e.technique, 0) / evaluations.length)
    : 0

  return (
    <>
      {/* Performance Stats */}
      <section className="module-stats">
        <div className="stat-card purple">
          <span>Evaluaciones Registradas</span>
          <strong>{evaluations.length}</strong>
          <small><Activity size={12} /> Rúbricas completadas</small>
        </div>
        <div className="stat-card yellow">
          <span>Promedio Técnico</span>
          <strong>{avgTech} / 100</strong>
          <small>Desempeño general</small>
        </div>
        <div className="stat-card mint">
          <span>Metas en Progreso</span>
          <strong>{goals.filter((g) => g.progress < 100).length}</strong>
          <small>Desarrollo continuo</small>
        </div>
        {hasPermission('medical') && <div className="stat-card coral">
          <span>Lesiones Activas</span>
          <strong>{activeInjuries.length}</strong>
          <small>{activeInjuries.length > 0 ? 'Con restricción' : 'Sin lesiones registradas'}</small>
        </div>}
      </section>

      {/* Nav Subtabs */}
      <div className="dossier-tabs" style={{ marginBottom: '14px' }}>
        <button className={activeTab === 'evaluaciones' ? 'active' : ''} onClick={() => setActiveTab('evaluaciones')}>
          <ClipboardCheck size={15} /> Evaluar Atleta
        </button>
        <button className={activeTab === 'ranking' ? 'active' : ''} onClick={() => setActiveTab('ranking')}>
          <Trophy size={15} /> Ranking Deportivo Interno
        </button>
        {hasPermission('medical') && <button className={activeTab === 'lesiones' ? 'active' : ''} onClick={() => setActiveTab('lesiones')}>
          <HeartPulse size={15} /> Lesiones & Retorno
          {activeInjuries.length > 0 && <span className="tab-badge">{activeInjuries.length}</span>}
        </button>}
        <button className={activeTab === 'metas' ? 'active' : ''} onClick={() => setActiveTab('metas')}>
          <Target size={15} /> Metas Individuales ({goals.length})
        </button>
      </div>

      {/* TAB 1: EVALUACIONES */}
      {activeTab === 'evaluaciones' && (
        <div className="split-grid">
          {/* Formulario de Evaluación por Rúbrica */}
          <form className="panel live-form" onSubmit={saveEvaluation}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Rúbrica Oficial</p>
                <h2>Nueva Evaluación Técnica</h2>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className={`select-button ${disciplineType === 'Cheerleading' ? 'active' : ''}`}
                  onClick={() => setDisciplineType('Cheerleading')}
                >
                  Cheerleading
                </button>
                <button
                  type="button"
                  className={`select-button ${disciplineType === 'Gimnasia' ? 'active' : ''}`}
                  onClick={() => setDisciplineType('Gimnasia')}
                >
                  Gimnasia
                </button>
              </div>
            </div>

            <label>
              Atleta a evaluar
              <select value={athleteId} onChange={(e) => setAthleteId(e.target.value)}>
                {athletes.map((ath) => (
                  <option key={ath.id} value={ath.id}>
                    {ath.name} ({ath.team ?? 'Sin equipo'})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Rúbrica aplicada
              <select value={rubricId} onChange={(e) => setRubricId(e.target.value)}>
                <option value="">Evaluación general sin rúbrica</option>
                {rubrics.filter((rubric) => rubric.active).map((rubric) => (
                  <option key={rubric.id} value={rubric.id}>{rubric.name}{rubric.discipline ? ` · ${rubric.discipline}` : ''}</option>
                ))}
              </select>
              {rubricId && <small>{rubrics.find((rubric) => rubric.id === Number(rubricId))?.criteria.join(' · ')}</small>}
            </label>

            <div className="score-fields">
              <label>
                Técnica
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={scores.technique}
                  onChange={(e) => setScores({ ...scores, technique: Number(e.target.value) })}
                />
              </label>
              <label>
                Flexibilidad
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={scores.flexibility}
                  onChange={(e) => setScores({ ...scores, flexibility: Number(e.target.value) })}
                />
              </label>
              <label>
                Fuerza
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={scores.strength}
                  onChange={(e) => setScores({ ...scores, strength: Number(e.target.value) })}
                />
              </label>
              <label>
                Actitud
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={scores.attitude}
                  onChange={(e) => setScores({ ...scores, attitude: Number(e.target.value) })}
                />
              </label>
              <label>
                Equipo
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={scores.teamwork}
                  onChange={(e) => setScores({ ...scores, teamwork: Number(e.target.value) })}
                />
              </label>
            </div>

            {disciplineType === 'Cheerleading' && (
              <div className="score-fields" style={{ marginTop: '6px' }}>
                <label>
                  Stunts / Pirámides
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={scores.stunts}
                    onChange={(e) => setScores({ ...scores, stunts: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Tumbling Acrobacia
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={scores.tumbling}
                    onChange={(e) => setScores({ ...scores, tumbling: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Saltos / Jumps
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={scores.jumps}
                    onChange={(e) => setScores({ ...scores, jumps: Number(e.target.value) })}
                  />
                </label>
              </div>
            )}

            {disciplineType === 'Gimnasia' && (
              <div className="score-fields" style={{ marginTop: '6px' }}>
                <label>
                  Aparatos / Viga / Barras
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={scores.stunts}
                    onChange={(e) => setScores({ ...scores, stunts: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Piso / Suelo
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={scores.tumbling}
                    onChange={(e) => setScores({ ...scores, tumbling: Number(e.target.value) })}
                  />
                </label>
              </div>
            )}

            <label>
              Retroalimentación oficial y recomendaciones para el atleta y la familia
              <textarea
                rows={2}
                placeholder="Puntos fuertes, correcciones técnicas y motivación para los próximos entrenamientos"
                value={scores.feedback}
                onChange={(e) => setScores({ ...scores, feedback: e.target.value })}
              />
            </label>

            <label>
              Anotaciones privadas del coach (solo visibles para el cuerpo técnico)
              <input
                placeholder="Observaciones confidenciales de nivel, proyección o temperamento"
                value={scores.privateNotes}
                onChange={(e) => setScores({ ...scores, privateNotes: e.target.value })}
              />
            </label>

            <button className="primary-button">
              <Save size={16} /> Guardar Evaluación Oficial
            </button>
          </form>

          {/* Historial de Evaluaciones */}
          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Historial Registrado</p>
                <h2>Evaluaciones Recientes</h2>
              </div>
            </div>

            <div className="live-list">
              {evaluations.slice(0, 10).map((item) => (
                <div className="live-list-item" key={item.id}>
                  <div className="avatar avatar-table">{item.athlete.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <strong>{item.athlete}</strong>
                    <span>
                      {item.rubric_name ? `${item.rubric_name} · ` : ''}Técnica {item.technique}% • Flex {item.flexibility}% • Fuerza {item.strength}% • Coach: {item.coach || 'Head Coach'}
                    </span>
                    <small>{item.feedback || 'Evaluación periódica registrada'}</small>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <b className="rank-score">{calcOverall(item)} pts</b>
                    <button
                      className="primary-button small"
                      onClick={() => setPrintingEval(item)}
                      title="Imprimir Boleta Oficial en PDF"
                    >
                      <Printer size={13} /> Boleta
                    </button>
                  </div>
                </div>
              ))}
              {!evaluations.length && (
                <p className="empty-state">Aún no hay evaluaciones registradas en el sistema.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RANKING */}
      {activeTab === 'ranking' && (
        <div className="panel table-panel">
          <div className="table-toolbar">
            <div>
              <h2>Ranking Deportivo Interno Stars Royalty</h2>
              <p>Clasificación interna calculada por promedio ponderado de evaluaciones técnicas.</p>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Lugar</th>
                  <th>Atleta</th>
                  <th>Equipo</th>
                  <th>Disciplina</th>
                  <th>Evaluaciones</th>
                  <th>Score Promedio</th>
                  <th>Estatus</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r, index) => (
                  <tr key={r.athlete}>
                    <td>
                      <b className={`rank-number ${index < 3 ? 'top-rank' : ''}`}>
                        {index === 0 ? '🥇 #1' : index === 1 ? '🥈 #2' : index === 2 ? '🥉 #3' : `#${index + 1}`}
                      </b>
                    </td>
                    <td>
                      <strong>{r.athlete}</strong>
                    </td>
                    <td>{r.team ?? 'Royals Senior'}</td>
                    <td>{r.discipline ?? 'Cheerleading'}</td>
                    <td>{r.count} pruebas</td>
                    <td>
                      <b className="table-positive">{r.avg} / 100</b>
                    </td>
                    <td>
                      <span className="status-pill success">Destacado</span>
                    </td>
                  </tr>
                ))}
                {!rankings.length && (
                  <tr>
                    <td colSpan={7} className="empty-state">
                      No hay suficientes evaluaciones para generar el ranking interno.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: LESIONES & RETORNO */}
      {activeTab === 'lesiones' && (
        <div className="split-grid">
          {/* Formulario de Lesión */}
          <form className="panel live-form" onSubmit={saveInjury}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Protocolo Médico</p>
                <h2>Registrar Lesión Deportiva</h2>
              </div>
              <HeartPulse size={19} className="text-coral" />
            </div>

            <label>
              Atleta lesionado
              <select value={injAthleteId} onChange={(e) => setInjAthleteId(e.target.value)}>
                {athletes.map((ath) => (
                  <option key={ath.id} value={ath.id}>{ath.name} ({ath.team ?? 'Sin equipo'})</option>
                ))}
              </select>
            </label>

            <label>
              Descripción de la lesión
              <input
                required
                placeholder="Ej. Esguince de tobillo, distensión de ligamento, contractura"
                value={injDescription}
                onChange={(e) => setInjDescription(e.target.value)}
              />
            </label>

            <label>
              Restricciones temporales de entrenamiento
              <input
                placeholder="Ej. Reposo de saltos, no acrobacias de altura, solo acondicionamiento"
                value={injRestriction}
                onChange={(e) => setInjRestriction(e.target.value)}
              />
            </label>

            <label>
              Fecha estimada de retorno / alta médica
              <input
                type="date"
                value={injReturnDate}
                onChange={(e) => setInjReturnDate(e.target.value)}
              />
            </label>

            <label>
              Anotaciones de fisioterapia / médico tratante
              <textarea
                rows={2}
                placeholder="Indicaciones del médico, vendajes, terapias requeridas"
                value={injPrivateNotes}
                onChange={(e) => setInjPrivateNotes(e.target.value)}
              />
            </label>

            <button className="primary-button">
              <Check size={16} /> Guardar Lesión y Restricción
            </button>
          </form>

          {/* Lista de Lesiones Activas e Históricas */}
          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Monitoreo de Salud</p>
                <h2>Registro de Lesiones ({injuries.length})</h2>
              </div>
            </div>

            <div className="live-list">
              {injuries.map((inj) => (
                <div
                  className={`live-list-item ${inj.status === 'active' ? 'injury-active-item' : ''}`}
                  key={inj.id}
                >
                  <AlertTriangle size={18} className={inj.status === 'active' ? 'text-coral' : 'text-muted'} />
                  <div>
                    <strong>{inj.athlete} — {inj.description}</strong>
                    <span>Restricción: {inj.restriction || 'Sin restricción'}</span>
                    <small>Reporte: {inj.reported_at} • Retorno estimado: {inj.return_date || 'Por evaluar'}</small>
                  </div>
                  {inj.status === 'active' ? (
                    <button
                      className="status-pill danger"
                      onClick={() => clearInjury(inj.id)}
                      title="Confirmar retorno seguro y dar de alta"
                    >
                      Dar Alta Médica
                    </button>
                  ) : (
                    <span className="status-pill success">Alta médica</span>
                  )}
                </div>
              ))}
              {!injuries.length && (
                <p className="empty-state">No hay atletas con lesiones registradas en la academia.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: METAS */}
      {activeTab === 'metas' && (
        <div className="split-grid">
          {/* Formulario de Metas */}
          <form className="panel live-form" onSubmit={saveGoal}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Plan de Desarrollo</p>
                <h2>Definir Nueva Meta Deportiva</h2>
              </div>
              <Target size={19} />
            </div>

            <label>
              Atleta
              <select value={athleteId} onChange={(e) => setAthleteId(e.target.value)}>
                {athletes.map((ath) => (
                  <option key={ath.id} value={ath.id}>{ath.name}</option>
                ))}
              </select>
            </label>

            <label>
              Objetivo / Meta técnica
              <input
                required
                placeholder="Ej. Salto Toe Touch con apertura a 180°, Mortal atrás sin spotter"
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
              />
            </label>

            <div className="form-grid">
              <label>
                Horizonte
                <select value={goalHorizon} onChange={(e) => setGoalHorizon(e.target.value)}>
                  <option>Corto plazo</option>
                  <option>Mediano plazo</option>
                  <option>Largo plazo</option>
                </select>
              </label>

              <label>
                Fecha objetivo
                <input
                  type="date"
                  value={goalDueDate}
                  onChange={(e) => setGoalDueDate(e.target.value)}
                />
              </label>
            </div>

            <button className="primary-button">
              <Target size={16} /> Guardar Meta
            </button>
          </form>

          {/* Listado de Metas con barra de progreso */}
          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Seguimiento</p>
                <h2>Metas Registradas</h2>
              </div>
            </div>

            <div className="live-list">
              {goals.map((g) => (
                <div className="live-list-item" key={g.id} style={{ display: 'block', padding: '10px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <strong>{g.title}</strong>
                    <span className="status-pill neutral">{g.horizon}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#8d8591' }}>
                    <span>Atleta: <b>{g.athlete}</b></span>
                    <span>{g.due_date ? `Vence: ${g.due_date}` : ''} • <b>{g.progress}%</b></span>
                  </div>
                  <div className="goal-progress-bar" style={{ margin: '8px 0 6px' }}>
                    <div style={{ width: `${g.progress}%` }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '5px' }}>
                    <button className="text-button" onClick={() => updateGoalProgress(g.id, g.progress, -10)}>-10%</button>
                    <button className="text-button" onClick={() => updateGoalProgress(g.id, g.progress, +10)}>+10%</button>
                    <button className="text-button" onClick={() => updateGoalProgress(g.id, g.progress, 100 - g.progress)}>✓ Cumplida</button>
                  </div>
                </div>
              ))}
              {!goals.length && <p className="empty-state">Sin metas deportivas registradas.</p>}
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRINT BOLETA OFICIAL PDF */}
      {printingEval && (
        <div className="print-modal-overlay">
          <div className="print-modal-box">
            <div className="print-modal-controls no-print">
              <span>Vista previa de Boleta Oficial Stars Royalty</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="primary-button" onClick={() => window.print()}>
                  <Printer size={15} /> Imprimir / Guardar en PDF
                </button>
                <button className="secondary-button" onClick={() => setPrintingEval(null)}>
                  Cerrar
                </button>
              </div>
            </div>

            <div className="official-document-sheet">
              <div className="doc-sheet-header">
                <img src="/stars-royalty-logo.webp" alt="Stars Royalty" className="doc-logo" />
                <div className="doc-title-box">
                  <h1>STARS ROYALTY</h1>
                  <h2>ACADEMIA DE CHEERLEADING Y GIMNASIA DE ALTO RENDIMIENTO</h2>
                  <p>BOLETA OFICIAL DE EVALUACIÓN Y RENDIMIENTO DEPORTIVO</p>
                </div>
                <div className="doc-folio">
                  <span>FOLIO OFICIAL</span>
                  <strong>EV-{String(printingEval.id).padStart(6, '0')}</strong>
                  <small>Fecha: {new Date(printingEval.evaluated_at).toLocaleDateString('es-MX')}</small>
                </div>
              </div>

              <hr className="doc-divider" />

              <div className="doc-info-grid">
                <div><span>Atleta:</span> <strong>{printingEval.athlete}</strong></div>
                <div><span>Coach Evaluador:</span> <strong>{printingEval.coach || 'Staff Técnico Stars Royalty'}</strong></div>
                <div><span>Temporada:</span> <strong>2026</strong></div>
                <div><span>Estatus:</span> <strong>Evaluación Aprobada</strong></div>
              </div>

              <h3 className="doc-section-title">DESGLOSE DE PUNTUACIÓN POR RÚBRICA</h3>
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>Criterio Técnico</th>
                    <th>Puntaje Obtenido</th>
                    <th>Nivel de Dominio</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Técnica General y Postura</td>
                    <td><b>{printingEval.technique} / 100</b></td>
                    <td>{printingEval.technique >= 90 ? 'Sobresaliente' : 'Avanzado'}</td>
                  </tr>
                  <tr>
                    <td>Flexibilidad y Amplitud</td>
                    <td><b>{printingEval.flexibility} / 100</b></td>
                    <td>{printingEval.flexibility >= 90 ? 'Sobresaliente' : 'Avanzado'}</td>
                  </tr>
                  <tr>
                    <td>Fuerza y Resistencia</td>
                    <td><b>{printingEval.strength} / 100</b></td>
                    <td>{printingEval.strength >= 90 ? 'Sobresaliente' : 'Avanzado'}</td>
                  </tr>
                  <tr>
                    <td>Actitud, Disciplina y Compromiso</td>
                    <td><b>{printingEval.attitude} / 100</b></td>
                    <td>{printingEval.attitude >= 90 ? 'Sobresaliente' : 'Avanzado'}</td>
                  </tr>
                  <tr>
                    <td>Trabajo en Equipo y Confianza</td>
                    <td><b>{printingEval.teamwork} / 100</b></td>
                    <td>{printingEval.teamwork >= 90 ? 'Sobresaliente' : 'Avanzado'}</td>
                  </tr>
                </tbody>
              </table>

              <div className="doc-overall-box">
                <div>
                  <span>SCORE GLOBAL PONDERADO</span>
                  <strong>{calcOverall(printingEval)} / 100 PUNTOS</strong>
                </div>
                <p>
                  <b>Comentarios del cuerpo técnico:</b> {printingEval.feedback || 'Progreso técnico constante y disciplina comprobada durante el periodo.'}
                </p>
              </div>

              <div className="doc-signatures">
                <div className="sig-block">
                  <div className="sig-line" />
                  <strong>{printingEval.coach || 'Coach Responsable'}</strong>
                  <span>Coach Certificado Stars Royalty</span>
                </div>
                <div className="sig-block">
                  <div className="sig-line" />
                  <strong>Mariana Rivera</strong>
                  <span>Head Coach & Dirección Deportiva</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// --------------------------------------------------------------------------
// MODULE 5: ATTENDANCE & SCHEDULES VIEW
// --------------------------------------------------------------------------
export function LiveAttendanceView({ notify }: { notify: Notify }) {
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [teamId, setTeamId] = useState('')
  const [selectedVenue, setSelectedVenue] = useState('Pista de Resorte Cheer (Spring Floor)')
  const [attendedOn, setAttendedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [marked, setMarked] = useState<Record<number, AttendanceStatus>>({})
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceItem[]>([])

  // Load initial teams and venues
  useEffect(() => {
    Promise.all([
      request<Team[]>('/api/teams'),
      request<Athlete[]>('/api/athletes'),
      request<Venue[]>('/api/venues').catch(() => [])
    ])
      .then(([teamData, athleteData, venueData]) => {
        setTeams(teamData)
        setVenues(venueData)
        const initialTeam = teamId || String(teamData[0]?.id ?? '')
        if (!teamId) setTeamId(initialTeam)
        const current = teamData.find((t) => String(t.id) === initialTeam)
        setAthletes(current ? athleteData.filter((a) => a.team === current.name) : athleteData)
      })
      .catch((error: unknown) => notify(error instanceof Error ? error.message : 'Error al cargar asistencia'))
  }, [teamId, notify])

  // Load existing attendance on date / team change
  useEffect(() => {
    if (!teamId) return
    Promise.all([
      request<AttendanceItem[]>(`/api/attendance?teamId=${teamId}&attendedOn=${attendedOn}`),
      request<AttendanceItem[]>(`/api/attendance?teamId=${teamId}`)
    ])
      .then(([entries, hist]) => {
        setMarked(Object.fromEntries(entries.map((item) => [item.athlete_id, item.status])))
        setNotes(Object.fromEntries(entries.map((item) => [item.athlete_id, item.notes ?? ''])))
        setAttendanceHistory(hist)
      })
      .catch((error: unknown) => notify(error instanceof Error ? error.message : 'Error al consultar lista'))
  }, [teamId, attendedOn, notify])

  // Detect recurrent absentees (>1 absence in history)
  const recurrentAbsentees = useMemo(() => {
    const counts: Record<number, number> = {}
    attendanceHistory.forEach((h) => {
      if (h.status === 'absent' || h.status === 'late') {
        counts[h.athlete_id] = (counts[h.athlete_id] || 0) + 1
      }
    })
    return athletes.filter((a) => (counts[a.id] || 0) >= 2)
  }, [attendanceHistory, athletes])

  const saveAttendance = async () => {
    if (!teamId || !athletes.length) return notify('Selecciona un equipo con atletas')
    try {
      await Promise.all(
        athletes.map((athlete) =>
          request('/api/attendance', {
            method: 'POST',
            body: JSON.stringify({
              athleteId: athlete.id,
              teamId: Number(teamId),
              attendedOn,
              status: marked[athlete.id] ?? 'present',
              notes: notes[athlete.id] || undefined
            })
          })
        )
      )
      notify(`Pase de lista guardado (${athletes.length} atletas)`)
      // Refresh history
      const hist = await request<AttendanceItem[]>(`/api/attendance?teamId=${teamId}`)
      setAttendanceHistory(hist)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No fue posible guardar asistencia')
    }
  }

  const notifyTutorAbsence = (athlete: Athlete) => {
    if (!athlete.guardian_phone) return notify('El atleta no tiene teléfono de tutor registrado')
    const text = `Hola ${athlete.guardian_name || 'Familia'}, le contactamos de Stars Royalty para informarle que el día de hoy ${attendedOn}, ${athlete.name} no asistió a su entrenamiento programado. Agradecemos nos informe si requiere justificación médica.`
    window.open(`https://wa.me/${athlete.guardian_phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank')
  }

  const markAll = (status: AttendanceStatus) => {
    const updated: Record<number, AttendanceStatus> = {}
    athletes.forEach((a) => {
      updated[a.id] = status
    })
    setMarked(updated)
  }

  return (
    <>
      {/* Attendance Header */}
      <div className="attendance-header panel">
        <div>
          <p className="eyebrow">Control Diario de Asistencia • Stars Royalty</p>
          <h2>Pase de Lista y Control de Entrenamiento</h2>
          <p>
            {athletes.length} atletas asignados al equipo. Selecciona la fecha y la sede de entrenamiento.
          </p>
        </div>
        <div className="attendance-actions">
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Seleccionar equipo">
            {teams.map((team) => (
              <option value={team.id} key={team.id}>{team.name}</option>
            ))}
          </select>
          <select value={selectedVenue} onChange={(e) => setSelectedVenue(e.target.value)} aria-label="Seleccionar área">
            {venues.map((v) => (
              <option key={v.id} value={v.name}>{v.name}</option>
            ))}
            {!venues.length && <option>Pista Central de Resorte</option>}
          </select>
          <input type="date" value={attendedOn} onChange={(e) => setAttendedOn(e.target.value)} />
          <button className="primary-button" onClick={saveAttendance}>
            <Check size={16} /> Guardar Asistencia
          </button>
        </div>
      </div>

      {/* Recurrent Absence Alert Banner */}
      {recurrentAbsentees.length > 0 && (
        <div className="attendance-alert-banner">
          <AlertTriangle size={20} className="text-coral" />
          <div>
            <strong>Alerta de Inasistencias Recurrentes:</strong>
            <p>
              {recurrentAbsentees.length} atleta(s) acumulan 2 o más faltas/retardos en este equipo.
              Se recomienda contactar al tutor para seguimiento.
            </p>
            <div className="absentee-tags">
              {recurrentAbsentees.map((a) => (
                <button
                  key={a.id}
                  className="whatsapp-button small"
                  onClick={() => notifyTutorAbsence(a)}
                  title="Enviar mensaje por WhatsApp al tutor"
                >
                  <MessageCircle size={13} /> {a.name} (Avisar a Tutor)
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Roster & Quick Actions */}
      <div className="panel attendance-table-panel">
        <div className="table-toolbar">
          <div>
            <h2>Plantilla de Convocados ({athletes.length} Atletas)</h2>
            <p>Área: <b>{selectedVenue}</b> • Fecha: <b>{attendedOn}</b></p>
          </div>
          <div className="toolbar-actions">
            <button className="filter-button" onClick={() => markAll('present')}>
              ✓ Marcar todos presentes
            </button>
          </div>
        </div>

        <div className="attendance-roster">
          {athletes.map((athlete, idx) => (
            <div className="roster-row" key={athlete.id}>
              <div className="person-cell">
                <div className="avatar avatar-table">{athlete.name.slice(0, 2).toUpperCase()}</div>
                <div>
                  <strong>{athlete.name}</strong>
                  <span>{athlete.discipline ?? 'Cheerleading'} • SR-{String(athlete.id).padStart(4, '0')}</span>
                </div>
              </div>

              <div className="attendance-options">
                {([
                  ['present', 'Presente'],
                  ['late', 'Retardo'],
                  ['excused', 'Justificada'],
                  ['absent', 'Falta']
                ] as const).map(([status, label]) => (
                  <button
                    key={status}
                    className={
                      marked[athlete.id] === status
                        ? `selected ${status === 'absent' ? 'absent' : status === 'present' ? 'present' : status === 'late' ? 'late' : 'excused'}`
                        : ''
                    }
                    onClick={() => setMarked({ ...marked, [athlete.id]: status })}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <input
                className="attendance-note"
                value={notes[athlete.id] ?? ''}
                onChange={(e) => setNotes({ ...notes, [athlete.id]: e.target.value })}
                placeholder="Observación del coach (ej. dolor muscular, retraso por tráfico)"
              />

              {marked[athlete.id] === 'absent' && athlete.guardian_phone && (
                <button
                  className="whatsapp-button small"
                  onClick={() => notifyTutorAbsence(athlete)}
                  title="Notificar falta al tutor por WhatsApp"
                >
                  <MessageCircle size={13} /> Notificar
                </button>
              )}

              <span className="roster-index">{String(idx + 1).padStart(2, '0')}</span>
            </div>
          ))}

          {!athletes.length && (
            <p className="empty-state">No hay atletas asignados a este equipo actualmente.</p>
          )}
        </div>
      </div>
    </>
  )
}
