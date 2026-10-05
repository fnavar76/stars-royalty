import { useResource } from './useResource'
import { ResourceState } from './uiShared'
import { request as api, hasPermission } from './api'
import { useState } from 'react'
import { Check, Edit3, Eye, Trash2, UserPlus, Users, X } from 'lucide-react'
import { AthleteDossierModal } from './AthleteDossierModal'

type Notify = (message: string) => void

export type Athlete = {
  id: number
  name: string
  birth_date?: string
  phone?: string
  photo_data?: string
  status: string
  team?: string
  team_role?: string
  team_position?: string
  discipline?: string
  category?: string
  guardian_name?: string
  guardian_phone?: string
  medical_notes?: string
  emergency_contact?: string
}

type Category = { id: number; name: string; season: string; discipline: string; discipline_id: number }
type Team = { id: number; name: string }

type CreateForm = {
  name: string
  birthDate: string
  phone: string
  guardianName: string
  guardianPhone: string
  emergencyContact: string
  medicalNotes: string
  photoData: string
  categoryId: string
  teamId: string
  position: string
  status: 'active' | 'trial' | 'inactive' | 'injured'
}

const initialForm: CreateForm = {
  name: '',
  birthDate: '',
  phone: '',
  guardianName: '',
  guardianPhone: '',
  emergencyContact: '',
  medicalNotes: '',
  photoData: '',
  categoryId: '',
  teamId: '',
  position: 'General',
  status: 'active'
}


export function LiveAthletesView({ query, notify, initialAthleteId }: { query: string; notify: Notify; initialAthleteId?: number }) {
  const [form, setForm] = useState<CreateForm>(initialForm)
  const [editing, setEditing] = useState<Athlete | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedAthleteId, setSelectedAthleteId] = useState<number | null>(initialAthleteId??null)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [disciplineFilter, setDisciplineFilter] = useState('all')

  const [pagination,setPagination]=useState({key:'',page:1})
  const filterKey=JSON.stringify([query,statusFilter,disciplineFilter])
  const page=pagination.key===filterKey?pagination.page:1
  const resource=useResource<{rows:Athlete[];total:number;stats:{total:number;active:number;trial:number;injured:number};disciplines:{name:string}[]}|null>(`/api/athletes?page=${page}&size=25&q=${encodeURIComponent(query)}&status=${statusFilter}&discipline=${encodeURIComponent(disciplineFilter)}`,null)
  const categoryResource=useResource<Category[]>('/api/categories',[])
  const teamResource=useResource<Team[]>('/api/teams',[])
  const categories=categoryResource.data,teams=teamResource.data
  const shown=resource.data?.rows??[]
  const load=resource.reload
  const goPage=(next:number)=>setPagination({key:filterKey,page:next})

  const openCreate = () => {
    setEditing(null)
    setForm(initialForm)
    setError('')
    setModalOpen(true)
  }

  const openEdit = (row: Athlete) => {
    setEditing(row)
    setForm({
      name: row.name,
      birthDate: row.birth_date ?? '',
      phone: row.phone ?? '',
      guardianName: row.guardian_name ?? '',
      guardianPhone: row.guardian_phone ?? '',
      emergencyContact: row.emergency_contact ?? '',
      medicalNotes: row.medical_notes ?? '',
      photoData: row.photo_data ?? '',
      categoryId: '',
      teamId: '',
      position: row.team_position ?? 'General',
      status: (row.status as CreateForm['status']) || 'active'
    })
    setError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
    setForm(initialForm)
    setError('')
  }

  const handlePhoto = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('Usa archivo de imagen (JPG o PNG)')
    if (file.size > 5000000) return setError('La imagen no debe pesar más de 5 MB')
    const reader = new FileReader()
    reader.onload = () => setForm((prev) => ({ ...prev, photoData: String(reader.result) }))
    reader.readAsDataURL(file)
  }

  const saveAthlete = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        name: form.name,
        birthDate: form.birthDate || undefined,
        phone: form.phone || undefined,
        guardianName: form.guardianName || undefined,
        guardianPhone: form.guardianPhone || undefined,
        emergencyContact: form.emergencyContact || undefined,
        medicalNotes: form.medicalNotes || undefined,
        photoData: form.photoData || undefined,
        categoryId: form.categoryId ? Number(form.categoryId) : undefined,
        teamId: form.teamId ? Number(form.teamId) : undefined,
        position: form.position,
        status: form.status
      }

      if (editing) {
        await api(`/api/athletes/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        })
        notify('Expediente del atleta actualizado')
      } else {
        await api('/api/athletes', {
          method: 'POST',
          body: JSON.stringify(payload)
        })
        notify('Nuevo atleta registrado con éxito')
      }
      closeModal()
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No fue posible guardar')
    }
  }

  const activeCount = resource.data?.stats.active??0
  const trialCount = resource.data?.stats.trial??0
  const injuredCount = resource.data?.stats.injured??0

  return (
    <>
      {/* Metrics Row */}
      <section className="module-stats">
        <div className="stat-card purple">
          <span>Atletas Registrados</span>
          <strong>{resource.data?.stats.total??0}</strong>
          <small><Users size={12} /> Base de datos activa</small>
        </div>
        <div className="stat-card mint">
          <span>Activos Regulares</span>
          <strong>{activeCount}</strong>
          <small>Con equipo asignado</small>
        </div>
        <div className="stat-card yellow">
          <span>Atletas en Prueba</span>
          <strong>{trialCount}</strong>
          <small>Seguimiento de coach</small>
        </div>
        <div className="stat-card coral">
          <span>En Rehabilitación</span>
          <strong>{injuredCount}</strong>
          <small>Lesión temporal</small>
        </div>
      </section>

      {/* Main Table Panel */}
      <div className="panel table-panel">
        <div className="table-toolbar">
          <div>
            <h2>Expediente Integral de Atletas</h2>
            <p>Haz clic en cualquier atleta para abrir su expediente digital 360°.</p>
          </div>
          <div className="toolbar-actions">
            <select
              className="filter-button"
              value={disciplineFilter}
              onChange={(e) => setDisciplineFilter(e.target.value)}
              aria-label="Filtrar por disciplina"
            >
              <option value="all">Todas las disciplinas</option>
              {resource.data?.disciplines.map(({name}) => <option key={name} value={name}>{name}</option>)}
            </select>

            <select
              className="filter-button"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filtrar por estatus"
            >
              <option value="all">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="trial">En prueba</option>
              <option value="injured">En rehabilitación</option>
              <option value="inactive">Inactivos</option>
            </select>

            <button className="primary-button" disabled={!hasPermission('sportsLead')} onClick={openCreate}>
              <UserPlus size={16} /> Nuevo Atleta
            </button>
          </div>
        </div>

        <ResourceState {...resource}/><div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Atleta / Expediente</th>
                <th>Disciplina</th>
                <th>Categoría</th>
                <th>Equipo</th>
                <th>Posición</th>
                <th>Estatus</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} className="interactive-row" onClick={() => setSelectedAthleteId(row.id)}>
                  <td>
                    <div className="person-cell">
                      <div className="avatar avatar-table">
                        {row.photo_data ? (
                          <img src={row.photo_data} alt={row.name} />
                        ) : (
                          row.name.slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div>
                        <strong>{row.name}</strong>
                        <span>SR-{String(row.id).padStart(6, '0')}</span>
                      </div>
                    </div>
                  </td>
                  <td>{row.discipline ?? 'Sin disciplina'}</td>
                  <td>
                    <span className="category-pill">{row.category ?? 'Sin categoría'}</span>
                  </td>
                  <td><strong>{row.team ?? 'Sin equipo'}</strong></td>
                  <td>
                    <span className="position-pill">{row.team_position ?? 'General'}</span>
                  </td>
                  <td>
                    <span
                      className={`status-pill ${
                        row.status === 'active'
                          ? 'success'
                          : row.status === 'trial'
                          ? 'warning'
                          : row.status === 'injured'
                          ? 'danger'
                          : 'neutral'
                      }`}
                    >
                      {row.status === 'active'
                        ? 'Activo'
                        : row.status === 'trial'
                        ? 'En prueba'
                        : row.status === 'injured'
                        ? 'Lesionado'
                        : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        className="primary-button small"
                        onClick={() => setSelectedAthleteId(row.id)}
                        title="Ver expediente 360°"
                      >
                        <Eye size={14} /> Expediente
                      </button>
                      <button
                        className="more-button"
                        onClick={() => openEdit(row)}
                        disabled={!hasPermission('sportsLead')}
                        title="Editar datos básicos"
                      >
                        <Edit3 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!resource.loading && !shown.length && (
                <tr>
                  <td colSpan={7} className="empty-state">
                    No se encontraron atletas con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ops-section-title"><button className="secondary-button" disabled={page===1||resource.loading} onClick={()=>goPage(page-1)}>Anterior</button><span>{resource.data?.total??0} resultados · Página {page}</span><button className="secondary-button" disabled={resource.loading||page*25>=(resource.data?.total??0)} onClick={()=>goPage(page+1)}>Siguiente</button></div>

      {/* CREATE / EDIT MODAL */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={closeModal}>
          <form
            className="modal athlete-modal"
            onSubmit={saveAthlete}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Expediente Digital</p>
                <h2>{editing ? 'Editar Ficha del Atleta' : 'Nuevo Registro de Atleta'}</h2>
              </div>
              <button type="button" className="icon-button" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>

            <div className="athlete-photo-field">
              <div className="athlete-photo-preview">
                {form.photoData ? (
                  <img src={form.photoData} alt="Vista previa" />
                ) : (
                  <UserPlus size={25} />
                )}
              </div>
              <label className="photo-picker">
                Fotografía oficial
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePhoto(e.target.files?.[0])}
                />
                <small>Foto de perfil en JPG o PNG (máx. 5 MB)</small>
              </label>
              {form.photoData && (
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setForm((p) => ({ ...p, photoData: '' }))}
                  title="Eliminar foto"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div className="form-grid">
              <label>
                Nombre completo
                <input
                  required
                  placeholder="Nombre y apellidos"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                Fecha de nacimiento
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                />
              </label>
              <label>
                Teléfono del atleta
                <input
                  placeholder="10 dígitos"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label>
                Contacto de emergencia
                <input
                  placeholder="Nombre y teléfono de emergencia"
                  value={form.emergencyContact}
                  onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                />
              </label>
              <label>
                Nombre del tutor
                <input
                  placeholder="Padre, madre o tutor"
                  value={form.guardianName}
                  onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
                />
              </label>
              <label>
                Teléfono del tutor (WhatsApp)
                <input
                  placeholder="Para notificaciones y avisos"
                  value={form.guardianPhone}
                  onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })}
                />
              </label>
              <label>
                Categoría deportiva
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                >
                  <option value="">Selecciona categoría</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.discipline}: {c.name} ({c.season})</option>
                  ))}
                </select>
              </label>
              <label>
                Equipo asignado
                <select
                  value={form.teamId}
                  onChange={(e) => setForm({ ...form, teamId: e.target.value })}
                >
                  <option value="">Sin equipo inicial</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Posición deportiva
                <select
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                >
                  <option value="General">General</option>
                  <option value="Flyer">Flyer (Cheer)</option>
                  <option value="Main Base">Main Base (Cheer)</option>
                  <option value="Side Base">Side Base (Cheer)</option>
                  <option value="Backspot">Backspot (Cheer)</option>
                  <option value="Frontspot">Frontspot (Cheer)</option>
                  <option value="Tumbler">Tumbler Acróbata</option>
                  <option value="All-Around">All-Around (Gimnasta)</option>
                  <option value="Salto y Piso">Salto y Piso (Gimnasia)</option>
                  <option value="Barras y Viga">Barras y Viga (Gimnasia)</option>
                </select>
              </label>
              <label>
                Condición deportiva
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as CreateForm['status'] })}
                >
                  <option value="active">Activo titular</option>
                  <option value="trial">Atleta en prueba</option>
                  <option value="injured">En recuperación médica</option>
                  <option value="inactive">Inactivo temporal</option>
                </select>
              </label>
            </div>

            {hasPermission('medical') && <label>
              Información médica relevante, alergias o restricciones
              <textarea
                rows={2}
                placeholder="Alergias, medicamentos, antecedentes de lesiones o precauciones especiales"
                value={form.medicalNotes}
                onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })}
              />
            </label>}

            {error && <div className="login-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeModal}>
                Cancelar
              </button>
              <button className="primary-button">
                <Check size={16} /> {editing ? 'Actualizar' : 'Guardar Atleta'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 360° ATHLETE DOSSIER MODAL */}
      {selectedAthleteId !== null && (
        <AthleteDossierModal
          athleteId={selectedAthleteId}
          onClose={() => setSelectedAthleteId(null)}
          notify={notify}
          onUpdated={load}
        />
      )}
    </>
  )
}
