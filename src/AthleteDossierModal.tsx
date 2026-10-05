import { downloadDocument } from './documents'
import { CredentialQR } from './CredentialQR'
import { request, hasPermission } from './api'
import { useEffect, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, Award, Calendar, Check,
  CreditCard, Dumbbell, FileCheck,
  FileText, HeartPulse, MessageCircle, Printer, QrCode,
  Target, Trophy, User, Users, X
} from 'lucide-react'
import { printCredentialCard } from './printCredential'

type Notify = (message: string) => void

interface FullAthleteResponse {
  athlete: {
    id: number
    name: string
    birth_date?: string
    phone?: string
    medical_notes?: string
    emergency_contact?: string
    status: string
    created_at: string
    photo_data?: string
    guardian_name?: string
    guardian_phone?: string
    guardian_email?: string
    team_id?: number
    team?: string
    team_role?: string
    team_position?: string
    discipline?: string
    category?: string
  }
  teamsHistory: Array<{
    athlete_id: number
    team_id: number
    role: string
    position?: string
    started_at: string
    ended_at?: string
    team_name: string
    category_name?: string
    discipline_name?: string
  }>
  attendance: Array<{
    id: number
    attended_on: string
    status: 'present' | 'late' | 'excused' | 'absent'
    notes?: string
    team_name?: string
  }>
  evaluations: Array<{
    id: number
    coach_id?: number
    coach_name?: string
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
    evaluated_at: string
  }>
  goals: Array<{
    id: number
    title: string
    horizon: string
    progress: number
    due_date?: string
  }>
  injuries: Array<{
    id: number
    description: string
    restriction?: string
    reported_at: string
    return_date?: string
    status: 'active' | 'cleared'
    private_notes?: string
  }>
  payments: Array<{
    id: number
    concept: string
    amount: number
    due_date?: string
    paid_at?: string
    status: string
    discount?: number
    late_fee?: number
    payment_method?: string
  }>
  wardrobe: Array<{
    id: number
    garment: string
    size?: string
    status: string
    team_name?: string
  }>
  documents: Array<{
    id: number
    name: string
    doc_type: string
    expires_at?: string
    file_data?: string
    created_at: string
  }>
  credentials: Array<{
    id: number
    code: string
    valid_until: string
  }>
}


type Tab = 'general' | 'medica' | 'equipos' | 'rendimiento' | 'metas' | 'asistencias' | 'finanzas' | 'documentos' | 'credencial'

export function AthleteDossierModal({
  athleteId,
  onClose,
  notify,
  onUpdated
}: {
  athleteId: number
  onClose: () => void
  notify: Notify
  onUpdated?: () => void
}) {
  const [referenceTime] = useState(() => Date.now())
  const [data, setData] = useState<FullAthleteResponse | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const [loading, setLoading] = useState(true)
  const [printDocument, setPrintDocument] = useState<'evaluacion' | 'recibo' | 'credencial' | null>(null)
  const [printPaymentItem, setPrintPaymentItem] = useState<FullAthleteResponse['payments'][0] | null>(null)
  const credentialRef = useRef<HTMLDivElement>(null)

  // Edit form state
  const [editGeneral, setEditGeneral] = useState(false)
  const [formName, setFormName] = useState('')
  const [formBirth, setFormBirth] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmergency, setFormEmergency] = useState('')
  const [formGuardianName, setFormGuardianName] = useState('')
  const [formGuardianPhone, setFormGuardianPhone] = useState('')
  const [formMedicalNotes, setFormMedicalNotes] = useState('')
  const [formStatus, setFormStatus] = useState('active')
  const [formPhotoData, setFormPhotoData] = useState('')

  // Injury form
  const [showAddInjury, setShowAddInjury] = useState(false)
  const [injuryDesc, setInjuryDesc] = useState('')
  const [injuryRestr, setInjuryRestr] = useState('')
  const [injuryReturn, setInjuryReturn] = useState('')

  // Goal form
  const [showAddGoal, setShowAddGoal] = useState(false)
  const [goalTitle, setGoalTitle] = useState('')
  const [goalHorizon, setGoalHorizon] = useState('Corto plazo')
  const [goalDate, setGoalDate] = useState('')

  // Payment form
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [payConcept, setPayConcept] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState('')

  // Document form
  const [showAddDoc, setShowAddDoc] = useState(false)
  const [docName, setDocName] = useState('')
  const [docType, setDocType] = useState('certificado_medico')
  const [docExpires, setDocExpires] = useState('')
  const [docFile, setDocFile] = useState('')
  const [docVisibility, setDocVisibility] = useState<'private' | 'family'>('private')

  const loadData = async () => {
    try {
      setLoading(true)
      const res = await request<FullAthleteResponse>(`/api/athletes/${athleteId}/full`)
      setData(res)
      setFormName(res.athlete.name)
      setFormBirth(res.athlete.birth_date ?? '')
      setFormPhone(res.athlete.phone ?? '')
      setFormEmergency(res.athlete.emergency_contact ?? '')
      setFormGuardianName(res.athlete.guardian_name ?? '')
      setFormGuardianPhone(res.athlete.guardian_phone ?? '')
      setFormMedicalNotes(res.athlete.medical_notes ?? '')
      setFormStatus(res.athlete.status)
      setFormPhotoData(res.athlete.photo_data ?? '')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al cargar expediente')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [athleteId])

  const saveGeneral = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await request(`/api/athletes/${athleteId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: formName,
          birthDate: formBirth || undefined,
          phone: formPhone || undefined,
          emergencyContact: formEmergency || undefined,
          guardianName: formGuardianName || undefined,
          guardianPhone: formGuardianPhone || undefined,
          medicalNotes: formMedicalNotes || undefined,
          status: formStatus,
          photoData: formPhotoData
        })
      })
      notify('Ficha general actualizada')
      setEditGeneral(false)
      await loadData()
      onUpdated?.()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No fue posible guardar cambios')
    }
  }

  const handleProfilePhoto = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return notify('Selecciona una imagen válida en formato JPG, PNG o WebP.')
    if (file.size > 5_000_000) return notify('La fotografía no debe superar 5 MB.')
    const reader = new FileReader()
    reader.onload = () => setFormPhotoData(String(reader.result))
    reader.onerror = () => notify('No fue posible leer la fotografía seleccionada.')
    reader.readAsDataURL(file)
  }

  const addInjury = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await request('/api/injuries', {
        method: 'POST',
        body: JSON.stringify({
          athleteId,
          description: injuryDesc,
          restriction: injuryRestr || undefined,
          returnDate: injuryReturn || undefined
        })
      })
      notify('Registro de lesión añadido')
      setInjuryDesc('')
      setInjuryRestr('')
      setInjuryReturn('')
      setShowAddInjury(false)
      await loadData()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al guardar lesión')
    }
  }

  const clearInjury = async (id: number) => {
    try {
      await request(`/api/injuries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cleared' })
      })
      notify('Atleta dado de alta médica')
      await loadData()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al actualizar lesión')
    }
  }

  const addGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await request('/api/goals', {
        method: 'POST',
        body: JSON.stringify({
          athleteId,
          title: goalTitle,
          horizon: goalHorizon,
          dueDate: goalDate || undefined
        })
      })
      notify('Meta deportiva registrada')
      setGoalTitle('')
      setGoalDate('')
      setShowAddGoal(false)
      await loadData()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al guardar meta')
    }
  }

  const updateGoalProgress = async (id: number, currentProgress: number, delta: number) => {
    const next = Math.max(0, Math.min(100, currentProgress + delta))
    try {
      await request(`/api/goals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ progress: next })
      })
      notify(`Progreso actualizado a ${next}%`)
      await loadData()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al actualizar meta')
    }
  }

  const addPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await request('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          athleteId,
          concept: payConcept,
          amount: Number(payAmount),
          dueDate: payDate || undefined
        })
      })
      notify('Cargo añadido a la cuenta')
      setPayConcept('')
      setPayAmount('')
      setPayDate('')
      setShowAddPayment(false)
      await loadData()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al generar cargo')
    }
  }

  const markPaymentPaid = async (id: number) => {
    try {
      await request(`/api/payments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'paid', paymentMethod: 'Transferencia / Caja' })
      })
      notify('Pago marcado como pagado')
      await loadData()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al actualizar pago')
    }
  }

  const addDocument = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await request(`/api/athletes/${athleteId}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          name: docName,
          docType,
          expiresAt: docExpires || undefined,
          fileData: docFile || undefined,
          visibility: docVisibility
        })
      })
      notify('Documento adjuntado al expediente')
      setDocName('')
      setDocExpires('')
      setDocFile('')
      setShowAddDoc(false)
      await loadData()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al adjuntar documento')
    }
  }

  const openWhatsApp = (phone?: string, text?: string) => {
    if (!phone) return notify('El atleta o tutor no tiene teléfono registrado')
    const clean = phone.replace(/\D/g, '')
    const msg = text ?? `Hola, te contactamos de Stars Royalty con respecto al atleta ${data?.athlete.name}.`
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // Calculate age
  const calculateAge = (birthDate?: string) => {
    if (!birthDate) return 'No registrada'
    const diff = referenceTime - new Date(birthDate).getTime()
    const ageDate = new Date(diff)
    return `${Math.abs(ageDate.getUTCFullYear() - 1970)} años`
  }

  // Attendance stats
  const totalAtt = data?.attendance.length ?? 0
  const presents = data?.attendance.filter(a => a.status === 'present').length ?? 0
  const lates = data?.attendance.filter(a => a.status === 'late').length ?? 0
  const excused = data?.attendance.filter(a => a.status === 'excused').length ?? 0
  const absents = data?.attendance.filter(a => a.status === 'absent').length ?? 0
  const attRate = totalAtt > 0 ? `${Math.round(((presents + lates) / totalAtt) * 100)}%` : 'Sin registros'

  // Financial stats
  const totalCharged = data?.payments.filter(p => p.status !== 'cancelled').reduce((sum, p) => sum + p.amount, 0) ?? 0
  const totalPaid = data?.payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0) ?? 0
  const totalPending = totalCharged - totalPaid

  // Latest evaluation
  const latestEval = data?.evaluations[0]
  const latestScore = latestEval
    ? Math.round((latestEval.technique + latestEval.flexibility + latestEval.strength + latestEval.attitude + latestEval.teamwork) / 5)
    : null

  if (loading || !data) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal dossier-modal" onClick={e => e.stopPropagation()}>
          <div className="loading-state">{loading ? 'Cargando expediente integral...' : 'No fue posible cargar el expediente.'}</div>
          {!loading && <button className="secondary-button" onClick={() => void loadData()}>Reintentar</button>}
          <button className="secondary-button" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    )
  }

  const a = data.athlete

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal dossier-modal" onClick={e => e.stopPropagation()}>
        {/* Dossier Header */}
        <div className="dossier-header">
          <div className="dossier-avatar">
            {a.photo_data ? (
              <img src={a.photo_data} alt={a.name} />
            ) : (
              <div className="dossier-avatar-placeholder">
                {a.name.split(' ').map(p => p[0]).slice(0, 2).join('')}
              </div>
            )}
          </div>
          <div className="dossier-headline">
            <div className="dossier-eyebrow">
              <span>EXPEDIENTE DIGITAL OFICIAL • SR-{String(a.id).padStart(6, '0')}</span>
              <span className={`status-pill ${a.status === 'active' ? 'success' : a.status === 'trial' ? 'warning' : a.status === 'injured' ? 'danger' : 'neutral'}`}>
                {a.status === 'active' ? 'Activo' : a.status === 'trial' ? 'En prueba' : a.status === 'injured' ? 'Lesión deportiva' : 'Inactivo'}
              </span>
            </div>
            <h2>{a.name}</h2>
            <div className="dossier-tags">
              <span><b>Disciplina:</b> {a.discipline ?? 'Cheerleading'}</span>
              <span>•</span>
              <span><b>Equipo:</b> {a.team ?? 'Sin equipo'}</span>
              <span>•</span>
              <span><b>Rol:</b> {a.team_role ?? 'Titular'}</span>
              <span>•</span>
              <span><b>Posición:</b> {a.team_position ?? 'General'}</span>
            </div>
          </div>
          <div className="dossier-quick-actions">
            <button
              className="whatsapp-button"
              onClick={() => openWhatsApp(a.guardian_phone || a.phone, `Hola Familia de ${a.name}, saludos desde la academia Stars Royalty.`)}
              title="Abrir WhatsApp con el tutor"
            >
              <MessageCircle size={15} /> WhatsApp
            </button>
            {latestEval && (
              <button
                className="secondary-button"
                onClick={() => setPrintDocument('evaluacion')}
                title="Generar boleta de evaluación oficial en PDF"
              >
                <Printer size={15} /> Boleta PDF
              </button>
            )}
            <button className="icon-button" onClick={onClose} aria-label="Cerrar expediente">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Dossier Nav Tabs */}
        <div className="dossier-tabs">
          <button className={activeTab === 'general' ? 'active' : ''} onClick={() => setActiveTab('general')}>
            <User size={15} /> Ficha General
          </button>
          {hasPermission('medical') && <button className={activeTab === 'medica' ? 'active' : ''} onClick={() => setActiveTab('medica')}>
            <HeartPulse size={15} /> Salud & Lesiones
            {data.injuries.some(i => i.status === 'active') && <i className="tab-alert-dot" />}
          </button>}
          <button className={activeTab === 'equipos' ? 'active' : ''} onClick={() => setActiveTab('equipos')}>
            <Users size={15} /> Equipos & Posición
          </button>
          <button className={activeTab === 'rendimiento' ? 'active' : ''} onClick={() => setActiveTab('rendimiento')}>
            <Activity size={15} /> Rendimiento
          </button>
          <button className={activeTab === 'metas' ? 'active' : ''} onClick={() => setActiveTab('metas')}>
            <Target size={15} /> Metas ({data.goals.length})
          </button>
          <button className={activeTab === 'asistencias' ? 'active' : ''} onClick={() => setActiveTab('asistencias')}>
            <Calendar size={15} /> Asistencias ({attRate})
          </button>
          {hasPermission('finance') && <button className={activeTab === 'finanzas' ? 'active' : ''} onClick={() => setActiveTab('finanzas')}>
            <CreditCard size={15} /> Finanzas
            {totalPending > 0 && <span className="tab-badge">${totalPending.toLocaleString('es-MX')}</span>}
          </button>}
          {hasPermission('documents') && <button className={activeTab === 'documentos' ? 'active' : ''} onClick={() => setActiveTab('documentos')}>
            <FileText size={15} /> Documentos ({data.documents.length})
          </button>}
          <button className={activeTab === 'credencial' ? 'active' : ''} onClick={() => setActiveTab('credencial')}>
            <QrCode size={15} /> Credencial
          </button>
        </div>

        {/* Tab Body */}
        <div className="dossier-body">
          {/* TAB: GENERAL */}
          {activeTab === 'general' && (
            <div className="tab-pane">
              {!editGeneral ? (
                <div className="split-grid">
                  <div className="panel sub-panel">
                    <div className="panel-heading">
                      <div>
                        <p className="eyebrow">Información Personal</p>
                        <h3>Datos del Atleta</h3>
                      </div>
                      <button className="text-button" disabled={!hasPermission('sportsLead')} onClick={() => setEditGeneral(true)}>Editar datos</button>
                    </div>
                    <div className="detail-rows">
                      <div className="detail-row"><span>Nombre completo:</span><strong>{a.name}</strong></div>
                      <div className="detail-row"><span>Fecha de nacimiento:</span><strong>{a.birth_date ? `${a.birth_date} (${calculateAge(a.birth_date)})` : 'No registrada'}</strong></div>
                      <div className="detail-row"><span>Teléfono del atleta:</span><strong>{a.phone || 'No registrado'}</strong></div>
                      <div className="detail-row"><span>Contacto de emergencia:</span><strong>{a.emergency_contact || 'No especificado'}</strong></div>
                      <div className="detail-row"><span>Fecha de ingreso:</span><strong>{new Date(a.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></div>
                    </div>
                  </div>

                  <div className="panel sub-panel">
                    <div className="panel-heading">
                      <div>
                        <p className="eyebrow">Familia / Tutor</p>
                        <h3>Contacto del Tutor</h3>
                      </div>
                      {a.guardian_phone && (
                        <button className="whatsapp-button small" onClick={() => openWhatsApp(a.guardian_phone)}>
                          <MessageCircle size={14} /> Chatear
                        </button>
                      )}
                    </div>
                    <div className="detail-rows">
                      <div className="detail-row"><span>Tutor responsable:</span><strong>{a.guardian_name || 'No registrado'}</strong></div>
                      <div className="detail-row"><span>Teléfono del tutor:</span><strong>{a.guardian_phone || 'No registrado'}</strong></div>
                      <div className="detail-row"><span>Correo electrónico:</span><strong>{a.guardian_email || 'No registrado'}</strong></div>
                      <div className="detail-row"><span>Modo de comunicación:</span><strong>WhatsApp institucional / Llamada</strong></div>
                    </div>
                  </div>
                </div>
              ) : (
                <form className="panel live-form" onSubmit={saveGeneral}>
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Edición</p>
                      <h3>Modificar Ficha del Atleta</h3>
                    </div>
                  </div>
                  <div className="athlete-photo-field dossier-photo-editor">
                    <div className="athlete-photo-preview">
                      {formPhotoData ? <img src={formPhotoData} alt="Vista previa de fotografía" /> : <User size={25} />}
                    </div>
                    <label className="photo-picker">
                      Fotografía del atleta
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => handleProfilePhoto(e.target.files?.[0])} />
                      <small>JPG, PNG o WebP; tamaño máximo de 5 MB.</small>
                    </label>
                    {formPhotoData && <button type="button" className="secondary-button small" onClick={() => setFormPhotoData('')}>Quitar foto</button>}
                  </div>
                  <div className="form-grid">
                    <label>Nombre completo<input required value={formName} onChange={e => setFormName(e.target.value)} /></label>
                    <label>Fecha de nacimiento<input type="date" value={formBirth} onChange={e => setFormBirth(e.target.value)} /></label>
                    <label>Teléfono atleta<input value={formPhone} onChange={e => setFormPhone(e.target.value)} /></label>
                    <label>Contacto de emergencia<input value={formEmergency} onChange={e => setFormEmergency(e.target.value)} /></label>
                    <label>Nombre del tutor<input value={formGuardianName} onChange={e => setFormGuardianName(e.target.value)} /></label>
                    <label>Teléfono del tutor<input value={formGuardianPhone} onChange={e => setFormGuardianPhone(e.target.value)} /></label>
                    <label>Estado deportivo
                      <select value={formStatus} onChange={e => setFormStatus(e.target.value)}>
                        <option value="active">Activo</option>
                        <option value="trial">En prueba</option>
                        <option value="injured">En rehabilitación / Lesión</option>
                        <option value="inactive">Inactivo / Baja temporal</option>
                      </select>
                    </label>
                  </div>
                  {hasPermission('medical') && <label>Notas médicas y alergias
                    <textarea rows={2} value={formMedicalNotes} onChange={e => setFormMedicalNotes(e.target.value)} />
                  </label>}
                  <div className="modal-actions">
                    <button type="button" className="secondary-button" onClick={() => { setFormPhotoData(a.photo_data ?? ''); setEditGeneral(false) }}>Cancelar</button>
                    <button className="primary-button"><Check size={16} /> Guardar cambios</button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* TAB: MEDICA & LESIONES */}
          {activeTab === 'medica' && (
            <div className="tab-pane">
              <div className="split-grid">
                <div className="panel sub-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Expediente Clínico</p>
                      <h3>Salud y Restricciones Físicas</h3>
                    </div>
                    <HeartPulse size={20} className="text-coral" />
                  </div>
                  <div className="medical-box">
                    <strong>Alergias y Condiciones Médicas:</strong>
                    <p>{a.medical_notes || 'Sin antecedentes alérgicos ni restricciones médicas reportadas.'}</p>
                  </div>
                  <div className="medical-certs-status">
                    <strong>Certificados Médicos Registrados:</strong>
                    {data.documents.filter(d => d.doc_type === 'certificado_medico').map(doc => (
                      <div className="cert-item" key={doc.id}>
                        <FileCheck size={16} />
                        <div>
                          <strong>{doc.name}</strong>
                          <small>Vence: {doc.expires_at ?? 'Sin vigencia definida'}</small>
                        </div>
                        <span className="status-pill success">Vigente</span>
                      </div>
                    ))}
                    {!data.documents.some(d => d.doc_type === 'certificado_medico') && (
                      <p className="empty-state">No hay certificado médico registrado.</p>
                    )}
                  </div>
                </div>

                <div className="panel sub-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Seguimiento</p>
                      <h3>Lesiones y Retorno Deportivo</h3>
                    </div>
                    <button className="primary-button small" onClick={() => setShowAddInjury(!showAddInjury)}>
                      + Registrar lesión
                    </button>
                  </div>

                  {showAddInjury && (
                    <form className="live-form mini-form" onSubmit={addInjury}>
                      <label>Descripción de la lesión<input required placeholder="Ej. Esguince de tobillo, contractura lumbar" value={injuryDesc} onChange={e => setInjuryDesc(e.target.value)} /></label>
                      <label>Restricción médica<input placeholder="Ej. Reposo absoluto de saltos, solo acondicionamiento" value={injuryRestr} onChange={e => setInjuryRestr(e.target.value)} /></label>
                      <label>Fecha estimada de retorno<input type="date" value={injuryReturn} onChange={e => setInjuryReturn(e.target.value)} /></label>
                      <button className="primary-button"><Check size={15} /> Guardar lesión</button>
                    </form>
                  )}

                  <div className="live-list">
                    {data.injuries.map(inj => (
                      <div className={`live-list-item ${inj.status === 'active' ? 'injury-active-item' : ''}`} key={inj.id}>
                        <AlertTriangle size={18} className={inj.status === 'active' ? 'text-coral' : 'text-muted'} />
                        <div>
                          <strong>{inj.description}</strong>
                          <span>Restricción: {inj.restriction || 'Sin restricción'}</span>
                          <small>Reportada: {inj.reported_at} • Retorno: {inj.return_date || 'Por definir'}</small>
                        </div>
                        {inj.status === 'active' ? (
                          <button className="status-pill danger" onClick={() => clearInjury(inj.id)} title="Dar de alta">
                            Activa (Dar alta)
                          </button>
                        ) : (
                          <span className="status-pill success">Superada</span>
                        )}
                      </div>
                    ))}
                    {!data.injuries.length && <p className="empty-state">Atleta sin historial de lesiones registradas.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: EQUIPOS & POSICION */}
          {activeTab === 'equipos' && (
            <div className="tab-pane">
              <div className="split-grid">
                <div className="panel sub-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Asignación Actual</p>
                      <h3>Equipo y Rol Deportivo</h3>
                    </div>
                    <Trophy size={20} />
                  </div>
                  <div className="team-badge-hero">
                    <div className="team-hero-icon"><Dumbbell size={28} /></div>
                    <div>
                      <strong>{a.team ?? 'Sin equipo asignado'}</strong>
                      <span>{a.discipline ?? 'Cheerleading'} • {a.category ?? 'Categoría por definir'}</span>
                    </div>
                  </div>
                  <div className="detail-rows" style={{ marginTop: '16px' }}>
                    <div className="detail-row"><span>Condición en el equipo:</span><span className="status-pill success">{a.team_role ?? 'Titular'}</span></div>
                    <div className="detail-row"><span>Posición técnica:</span><span className="position-pill">{a.team_position ?? 'General'}</span></div>
                    <div className="detail-row"><span>Posiciones en Cheerleading:</span><small>Flyer, Main Base, Side Base, Backspot, Tumbler</small></div>
                    <div className="detail-row"><span>Posiciones en Gimnasia:</span><small>All-Around, Salto, Barras, Viga, Piso</small></div>
                  </div>
                </div>

                <div className="panel sub-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Historial de Formación</p>
                      <h3>Trayectoria de Equipos</h3>
                    </div>
                  </div>
                  <div className="live-list">
                    {data.teamsHistory.map((th, idx) => (
                      <div className="live-list-item" key={idx}>
                        <div className="roster-index">{String(idx + 1).padStart(2, '0')}</div>
                        <div>
                          <strong>{th.team_name}</strong>
                          <span>{th.role} • {th.position || 'General'}</span>
                          <small>Desde: {th.started_at} {th.ended_at ? `hasta ${th.ended_at}` : '(Actual)'}</small>
                        </div>
                        <span className={`status-pill ${!th.ended_at ? 'success' : 'neutral'}`}>
                          {!th.ended_at ? 'Activo' : 'Concluido'}
                        </span>
                      </div>
                    ))}
                    {!data.teamsHistory.length && <p className="empty-state">Sin historial previo de equipos.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: RENDIMIENTO & BOLETA */}
          {activeTab === 'rendimiento' && (
            <div className="tab-pane">
              <div className="split-grid">
                <div className="panel sub-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Evaluación Oficial Más Reciente</p>
                      <h3>Desarrollo Técnico Integral</h3>
                    </div>
                    {latestEval && (
                      <button className="primary-button small" onClick={() => setPrintDocument('evaluacion')}>
                        <Printer size={15} /> Imprimir Boleta
                      </button>
                    )}
                  </div>
                  {latestEval ? (
                    <>
                      <div className="score-summary-row">
                        <div className="score-ring">
                          <div>
                            <strong>{latestScore}</strong>
                            <span>de 100</span>
                          </div>
                        </div>
                        <div className="score-meta">
                          <strong>Evaluado por: {latestEval.coach_name || 'Head Coach'}</strong>
                          <small>Fecha: {new Date(latestEval.evaluated_at).toLocaleDateString('es-MX')}</small>
                          <p>{latestEval.feedback || 'Excelente desempeño técnico y disciplina constante.'}</p>
                        </div>
                      </div>

                      <div className="skill-list" style={{ marginTop: '16px' }}>
                        {[
                          ['Técnica general', latestEval.technique],
                          ['Flexibilidad', latestEval.flexibility],
                          ['Fuerza y potencia', latestEval.strength],
                          ['Actitud y disciplina', latestEval.attitude],
                          ['Trabajo en equipo', latestEval.teamwork],
                          ...(latestEval.stunts ? [['Stunts / Acrobacia', latestEval.stunts] as const] : []),
                          ...(latestEval.tumbling ? [['Tumbling / Gimnasia', latestEval.tumbling] as const] : []),
                          ...(latestEval.jumps ? [['Saltos / Jumps', latestEval.jumps] as const] : [])
                        ].map(([name, val]) => (
                          <div className="skill-row" key={name}>
                            <span>{name}</span>
                            <div><i style={{ width: `${val}%` }} /></div>
                            <b>{val}%</b>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="empty-state">No hay evaluaciones registradas para este atleta aún.</p>
                  )}
                </div>

                <div className="panel sub-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Histórico</p>
                      <h3>Rúbricas Anteriores ({data.evaluations.length})</h3>
                    </div>
                  </div>
                  <div className="live-list">
                    {data.evaluations.map(ev => {
                      const avg = Math.round((ev.technique + ev.flexibility + ev.strength + ev.attitude + ev.teamwork) / 5)
                      return (
                        <div className="live-list-item" key={ev.id}>
                          <Award size={18} className="text-purple" />
                          <div>
                            <strong>{new Date(ev.evaluated_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                            <span>Coach: {ev.coach_name || 'Staff'} • Técnica {ev.technique}%</span>
                            <small>{ev.feedback || 'Sin notas adicionales'}</small>
                          </div>
                          <b>{avg} pts</b>
                        </div>
                      )
                    })}
                    {!data.evaluations.length && <p className="empty-state">Sin evaluaciones previas.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: METAS */}
          {activeTab === 'metas' && (
            <div className="tab-pane">
              <div className="panel sub-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Plan de Desarrollo Individual</p>
                    <h3>Metas Deportivas a Corto, Mediano y Largo Plazo</h3>
                  </div>
                  <button className="primary-button small" onClick={() => setShowAddGoal(!showAddGoal)}>
                    + Nueva meta
                  </button>
                </div>

                {showAddGoal && (
                  <form className="live-form mini-form" onSubmit={addGoal}>
                    <div className="form-grid">
                      <label>Meta técnica<input required placeholder="Ej. Lograr mortal atrás en piso firme" value={goalTitle} onChange={e => setGoalTitle(e.target.value)} /></label>
                      <label>Horizonte
                        <select value={goalHorizon} onChange={e => setGoalHorizon(e.target.value)}>
                          <option>Corto plazo</option>
                          <option>Mediano plazo</option>
                          <option>Largo plazo</option>
                        </select>
                      </label>
                      <label>Fecha objetivo<input type="date" value={goalDate} onChange={e => setGoalDate(e.target.value)} /></label>
                    </div>
                    <button className="primary-button"><Check size={15} /> Registrar meta</button>
                  </form>
                )}

                <div className="goals-grid" style={{ marginTop: '16px' }}>
                  {data.goals.map(g => (
                    <div className="goal-card" key={g.id}>
                      <div className="goal-card-top">
                        <span className={`horizon-tag ${g.horizon === 'Corto plazo' ? 'short' : g.horizon === 'Mediano plazo' ? 'medium' : 'long'}`}>
                          {g.horizon}
                        </span>
                        <small>{g.due_date ? `Vence: ${g.due_date}` : 'Sin fecha fija'}</small>
                      </div>
                      <strong>{g.title}</strong>
                      <div className="goal-progress-bar">
                        <div style={{ width: `${g.progress}%` }} />
                      </div>
                      <div className="goal-card-actions">
                        <span><b>{g.progress}%</b> completado</span>
                        <div className="progress-btn-group">
                          <button onClick={() => updateGoalProgress(g.id, g.progress, -10)}>-10%</button>
                          <button onClick={() => updateGoalProgress(g.id, g.progress, +10)}>+10%</button>
                          <button onClick={() => updateGoalProgress(g.id, g.progress, 100 - g.progress)}>✓ 100%</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!data.goals.length && <p className="empty-state">No hay metas registradas. Comienza definiendo una para el atleta.</p>}
                </div>
              </div>
            </div>
          )}

          {/* TAB: ASISTENCIAS */}
          {activeTab === 'asistencias' && (
            <div className="tab-pane">
              <section className="module-stats" style={{ marginBottom: '14px' }}>
                <div className="stat-card purple"><span>Tasa de asistencia</span><strong>{attRate}</strong><small>Últimos registros del expediente</small></div>
                <div className="stat-card mint"><span>Presentes</span><strong>{presents}</strong><small>Entrenamientos</small></div>
                <div className="stat-card yellow"><span>Retardos</span><strong>{lates}</strong><small>Con justificación</small></div>
                <div className="stat-card coral"><span>Faltas</span><strong>{absents + excused}</strong><small>{absents} injustificadas</small></div>
              </section>

              <div className="panel sub-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Registro Diario</p>
                    <h3>Historial de Asistencias</h3>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Equipo</th>
                        <th>Estado</th>
                        <th>Observación del Coach</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.attendance.map(att => (
                        <tr key={att.id}>
                          <td><strong>{att.attended_on}</strong></td>
                          <td>{att.team_name ?? a.team ?? 'Equipo principal'}</td>
                          <td>
                            <span className={`status-pill ${att.status === 'present' ? 'success' : att.status === 'late' ? 'warning' : att.status === 'excused' ? 'neutral' : 'danger'}`}>
                              {att.status === 'present' ? 'Presente' : att.status === 'late' ? 'Retardo' : att.status === 'excused' ? 'Falta justificada' : 'Falta injustificada'}
                            </span>
                          </td>
                          <td>{att.notes || '—'}</td>
                        </tr>
                      ))}
                      {!data.attendance.length && (
                        <tr><td colSpan={4} className="empty-state">Sin asistencias registradas aún.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: FINANZAS & ESTADO DE CUENTA */}
          {activeTab === 'finanzas' && (
            <div className="tab-pane">
              <section className="module-stats" style={{ marginBottom: '14px' }}>
                <div className="stat-card mint"><span>Total pagado</span><strong>${totalPaid.toLocaleString('es-MX')}</strong><small>Al corriente</small></div>
                <div className="stat-card yellow"><span>Saldo pendiente</span><strong>${totalPending.toLocaleString('es-MX')}</strong><small>Por cobrar</small></div>
                <div className="stat-card purple"><span>Cargos totales</span><strong>${totalCharged.toLocaleString('es-MX')}</strong><small>{data.payments.length} movimientos</small></div>
                <div className="stat-card coral"><span>Vencidos</span><strong>{data.payments.filter(p => p.status === 'overdue').length}</strong><small>Atención caja</small></div>
              </section>

              <div className="panel sub-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Estado de Cuenta</p>
                    <h3>Movimientos y Cuotas Registradas</h3>
                  </div>
                  <button className="primary-button small" disabled={!hasPermission('finance')} onClick={() => setShowAddPayment(!showAddPayment)}>
                    + Generar cargo
                  </button>
                </div>

                {showAddPayment && (
                  <form className="live-form mini-form" onSubmit={addPayment}>
                    <div className="form-grid">
                      <label>Concepto<input required placeholder="Ej. Mensualidad, Inscripción Copa, Uniforme" value={payConcept} onChange={e => setPayConcept(e.target.value)} /></label>
                      <label>Monto ($)<input required type="number" min="1" placeholder="2850" value={payAmount} onChange={e => setPayAmount(e.target.value)} /></label>
                      <label>Fecha límite<input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} /></label>
                    </div>
                    <button className="primary-button"><Check size={15} /> Aplicar cargo</button>
                  </form>
                )}

                <div className="table-scroll" style={{ marginTop: '12px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Concepto</th>
                        <th>Monto</th>
                        <th>Vencimiento</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.map(p => (
                        <tr key={p.id}>
                          <td><strong>{p.concept}</strong></td>
                          <td>${p.amount.toLocaleString('es-MX')}</td>
                          <td>{p.due_date ?? 'Sin fecha'}</td>
                          <td>
                            <span className={`status-pill ${p.status === 'paid' ? 'success' : p.status === 'overdue' ? 'danger' : 'warning'}`}>
                              {p.status === 'paid' ? 'Pagado' : p.status === 'overdue' ? 'Vencido' : 'Pendiente'}
                            </span>
                          </td>
                          <td style={{ display: 'flex', gap: '6px' }}>
                            {p.status !== 'paid' && (
                              <button className="primary-button small" onClick={() => markPaymentPaid(p.id)} title="Marcar como pagado">
                                <Check size={13} /> Cobrar
                              </button>
                            )}
                            <button
                              className="secondary-button small"
                              onClick={() => { setPrintPaymentItem(p); setPrintDocument('recibo') }}
                              title="Generar recibo de pago en PDF"
                            >
                              <Printer size={13} /> Recibo
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!data.payments.length && (
                        <tr><td colSpan={5} className="empty-state">No hay cargos registrados para este atleta.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: DOCUMENTOS & RESPONSIVAS */}
          {activeTab === 'documentos' && (
            <div className="tab-pane">
              <div className="panel sub-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Expediente Documental</p>
                    <h3>Certificados, Responsivas y Contratos</h3>
                  </div>
                  <button className="primary-button small" onClick={() => setShowAddDoc(!showAddDoc)}>
                    + Adjuntar documento
                  </button>
                </div>

                {showAddDoc && (
                  <form className="live-form mini-form" onSubmit={addDocument}>
                    <div className="form-grid">
                      <label>Nombre del documento<input required placeholder="Ej. Certificado Médico 2026, Carta Responsiva" value={docName} onChange={e => setDocName(e.target.value)} /></label>
                      <label>Tipo de documento
                        <select value={docType} onChange={e => setDocType(e.target.value)}>
                          <option value="certificado_medico">Certificado Médico</option>
                          <option value="responsiva">Carta Responsiva / Reglamento</option>
                          <option value="identificacion">Identificación Oficial (INE / Escolar)</option>
                          <option value="acta">Acta de Nacimiento</option>
                          <option value="otro">Otro documento</option>
                        </select>
                      </label>
                      <label>Archivo (PDF, imagen o TXT; máximo 5 MB)<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) { notify('El archivo debe pesar como máximo 5 MB'); event.target.value = ''; return } const reader = new FileReader(); reader.onload = () => { setDocFile(String(reader.result)); if (!docName) setDocName(file.name) }; reader.readAsDataURL(file) }} /></label>
                      <label>Visibilidad<select value={docVisibility} onChange={(event) => setDocVisibility(event.target.value as 'private' | 'family')}><option value="private">Solo personal autorizado</option><option value="family">Compartir con la familia</option></select></label>
                      <label>Fecha de vigencia / vencimiento<input type="date" value={docExpires} onChange={e => setDocExpires(e.target.value)} /></label>
                    </div>
                    <button className="primary-button"><Check size={15} /> Guardar documento</button>
                  </form>
                )}

                <div className="documents-grid" style={{ marginTop: '16px' }}>
                  {data.documents.map(d => (
                    <div className="doc-card" key={d.id}>
                      <div className="doc-card-icon"><FileCheck size={24} /></div>
                      <div>
                        <strong>{d.name}</strong>
                        <span>Tipo: {d.doc_type}</span>
                        <small>{d.expires_at ? `Vence: ${d.expires_at}` : 'Sin vencimiento'}</small>
                      </div>
                      <span className="status-pill success">Registrado</span>{d.file_data && <button className="secondary-button" onClick={() => void downloadDocument(d.id).catch((error: Error) => notify(error.message))}>Descargar</button>}
                    </div>
                  ))}
                  {!data.documents.length && (
                    <p className="empty-state">No hay documentos registrados para este atleta.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: CREDENCIAL */}
          {activeTab === 'credencial' && (
            <div className="tab-pane">
              <div className="split-grid">
                <div className="credential-card" ref={credentialRef}>
                  <div className="credential-brand">
                    <img src="/stars-royalty-logo.webp" alt="Stars Royalty" />
                    <div>
                      <strong>STARS ROYALTY</strong>
                      <span>ACADEMIA DE ALTO RENDIMIENTO</span>
                    </div>
                  </div>
                  <div className="credential-person">
                    <div className="credential-photo">
                      {a.photo_data ? <img src={a.photo_data} alt={`Fotografía de ${a.name}`} /> : a.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <strong>{a.name.toUpperCase()}</strong>
                      <span>ATLETA OFICIAL • {a.discipline?.toUpperCase() ?? 'CHEERLEADING'}</span>
                      <span>{a.team?.toUpperCase() ?? 'ROYALS SENIOR'} • {a.team_position?.toUpperCase() ?? 'FLYER'}</span>
                    </div>
                  </div>
                  <div className="credential-bottom">
                    <div>
                      <small>CÓDIGO DE IDENTIFICACIÓN</small>
                      <b>{data.credentials[0]?.code ?? 'Sin emitir'}</b>
                    </div>
                    <div className="fake-qr">
                      <CredentialQR code={data.credentials[0]?.code} />
                    </div>
                    <div>
                      <small>VIGENCIA TEMPORADA</small>
                      <b>{data.credentials[0]?.valid_until ?? 'Sin vigencia'}</b>
                    </div>
                  </div>
                </div>

                <div className="panel sub-panel credential-options-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Emisión y Validación</p>
                      <h3>Credencialización Institucional</h3>
                    </div>
                  </div>
                  <p className="section-copy">
                    El QR contiene el folio de la credencial. Recepción puede consultarlo en el validador de credenciales para verificar su vigencia.
                  </p>
                  <div className="detail-rows">
                    <div className="detail-row"><span>Número de credencial:</span><strong>{data.credentials[0]?.code ?? 'Sin emitir'}</strong></div>
                    <div className="detail-row"><span>Validación de acceso:</span><strong>Consultar vigencia y estado en recepción</strong></div>
                  </div>
                  <button
                    className="primary-button"
                    style={{ marginTop: '16px', width: '100%', justifyContent: 'center' }}
                    onClick={() => printCredentialCard(credentialRef.current)}
                    disabled={!data.credentials.length}
                  >
                    <Printer size={16} /> Imprimir Credencial Oficial
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PRINT / EXPORT VIEW MODAL */}
        {printDocument && (
          <div className="print-modal-overlay">
            <div className="print-modal-box">
              <div className="print-modal-controls no-print">
                <span>Vista previa del documento oficial para impresión</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="primary-button" onClick={() => window.print()}>
                    <Printer size={15} /> Imprimir / Guardar en PDF
                  </button>
                  <button className="secondary-button" onClick={() => { setPrintDocument(null); setPrintPaymentItem(null) }}>
                    Cerrar
                  </button>
                </div>
              </div>

              {/* BOLETA DE EVALUACION PDF */}
              {printDocument === 'evaluacion' && latestEval && (
                <div className="official-document-sheet">
                  <div className="doc-sheet-header">
                    <img src="/stars-royalty-logo.webp" alt="Stars Royalty" className="doc-logo" />
                    <div className="doc-title-box">
                      <h1>STARS ROYALTY</h1>
                      <h2>ACADEMIA DE CHEERLEADING Y GIMNASIA DE ALTO RENDIMIENTO</h2>
                      <p>BOLETA OFICIAL DE EVALUACIÓN TÉCNICA Y RENDIMIENTO DEPORTIVO</p>
                    </div>
                    <div className="doc-folio">
                      <span>FOLIO DE BOLETA</span>
                      <strong>EV-{String(latestEval.id).padStart(6, '0')}</strong>
                      <small>Fecha: {new Date(latestEval.evaluated_at).toLocaleDateString('es-MX')}</small>
                    </div>
                  </div>

                  <hr className="doc-divider" />

                  <div className="doc-info-grid">
                    <div><span>Atleta:</span> <strong>{a.name}</strong></div>
                    <div><span>Expediente:</span> <strong>SR-{String(a.id).padStart(6, '0')}</strong></div>
                    <div><span>Disciplina:</span> <strong>{a.discipline ?? 'Cheerleading'}</strong></div>
                    <div><span>Categoría / Nivel:</span> <strong>{a.category ?? 'Nivel 5'}</strong></div>
                    <div><span>Equipo:</span> <strong>{a.team ?? 'Royals Senior'}</strong></div>
                    <div><span>Posición técnica:</span> <strong>{a.team_position ?? 'Flyer'}</strong></div>
                  </div>

                  <h3 className="doc-section-title">RESULTADOS DE LA EVALUACIÓN POR RÚBRICA</h3>
                  <table className="doc-table">
                    <thead>
                      <tr>
                        <th>Criterio Deportivo Evaluado</th>
                        <th>Puntaje Obtenido</th>
                        <th>Nivel de Dominio</th>
                        <th>Observaciones Técnicas</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>Técnica de Ejecución</strong></td>
                        <td><b>{latestEval.technique} / 100</b></td>
                        <td>{latestEval.technique >= 90 ? 'Excelente' : latestEval.technique >= 80 ? 'Avanzado' : 'En desarrollo'}</td>
                        <td>Postura corporal, alineación y limpieza en figuras.</td>
                      </tr>
                      <tr>
                        <td><strong>Flexibilidad y Arcos</strong></td>
                        <td><b>{latestEval.flexibility} / 100</b></td>
                        <td>{latestEval.flexibility >= 90 ? 'Excelente' : latestEval.flexibility >= 80 ? 'Avanzado' : 'En desarrollo'}</td>
                        <td>Apertura de split, puentes y arcos en elevación.</td>
                      </tr>
                      <tr>
                        <td><strong>Fuerza y Potencia Muscular</strong></td>
                        <td><b>{latestEval.strength} / 100</b></td>
                        <td>{latestEval.strength >= 90 ? 'Excelente' : latestEval.strength >= 80 ? 'Avanzado' : 'En desarrollo'}</td>
                        <td>Fuerza en core, resistencia en acrobacias y sostén.</td>
                      </tr>
                      <tr>
                        <td><strong>Actitud y Disciplina</strong></td>
                        <td><b>{latestEval.attitude} / 100</b></td>
                        <td>{latestEval.attitude >= 90 ? 'Sobresaliente' : 'Aceptable'}</td>
                        <td>Compromiso, puntualidad, receptividad al feedback.</td>
                      </tr>
                      <tr>
                        <td><strong>Trabajo en Equipo y Confianza</strong></td>
                        <td><b>{latestEval.teamwork} / 100</b></td>
                        <td>{latestEval.teamwork >= 90 ? 'Sobresaliente' : 'Aceptable'}</td>
                        <td>Sincronía con bases/flyer y compañerismo en rutina.</td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="doc-overall-box">
                    <div>
                      <span>PROMEDIO GENERAL DE RENDIMIENTO</span>
                      <strong>{latestScore} / 100 PUNTOS</strong>
                    </div>
                    <p>
                      <b>Recomendaciones del equipo técnico:</b> {latestEval.feedback || 'Mantener el trabajo de flexibilidad diaria y continuar con la constancia técnica exhibida.'}
                    </p>
                  </div>

                  <div className="doc-signatures">
                    <div className="sig-block">
                      <div className="sig-line" />
                      <strong>{latestEval.coach_name || 'Coach Asignado'}</strong>
                      <span>Coach Titular de Equipo</span>
                    </div>
                    <div className="sig-block">
                      <div className="sig-line" />
                      <strong>Mariana Rivera</strong>
                      <span>Head Coach & Dirección Deportiva</span>
                    </div>
                  </div>

                  <div className="doc-footer">
                    <small>Stars Royalty Academia Deportiva • Documento oficial expedido con validez interna • www.starsroyalty.com</small>
                  </div>
                </div>
              )}

              {/* RECIBO DE PAGO PDF */}
              {printDocument === 'recibo' && printPaymentItem && (
                <div className="official-document-sheet receipt-sheet">
                  <div className="doc-sheet-header">
                    <img src="/stars-royalty-logo.webp" alt="Stars Royalty" className="doc-logo" />
                    <div className="doc-title-box">
                      <h1>STARS ROYALTY</h1>
                      <h2>ACADEMIA DE CHEERLEADING Y GIMNASIA</h2>
                      <p>COMPROBANTE OFICIAL DE PAGO Y COBRANZA</p>
                    </div>
                    <div className="doc-folio">
                      <span>RECIBO DE CAJA</span>
                      <strong>REC-{String(printPaymentItem.id).padStart(6, '0')}</strong>
                      <small>Fecha: {new Date().toLocaleDateString('es-MX')}</small>
                    </div>
                  </div>

                  <hr className="doc-divider" />

                  <div className="doc-info-grid">
                    <div><span>Atleta:</span> <strong>{a.name}</strong></div>
                    <div><span>Expediente:</span> <strong>SR-{String(a.id).padStart(6, '0')}</strong></div>
                    <div><span>Tutor Responsable:</span> <strong>{a.guardian_name || 'Familia del Atleta'}</strong></div>
                    <div><span>Equipo:</span> <strong>{a.team ?? 'Royals Senior'}</strong></div>
                  </div>

                  <table className="doc-table" style={{ marginTop: '20px' }}>
                    <thead>
                      <tr>
                        <th>Concepto de Cobro</th>
                        <th>Fecha de Vencimiento</th>
                        <th>Método</th>
                        <th>Monto Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>{printPaymentItem.concept}</strong></td>
                        <td>{printPaymentItem.due_date ?? 'Inmediato'}</td>
                        <td>{printPaymentItem.payment_method || 'Efectivo / Transferencia'}</td>
                        <td><b>${printPaymentItem.amount.toLocaleString('es-MX')} MXN</b></td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="receipt-total-bar">
                    <span>ESTADO: <b>{printPaymentItem.status === 'paid' ? 'PAGADO Y LIQUIDADO' : 'PENDIENTE DE PAGO'}</b></span>
                    <div>
                      <span>TOTAL RECIBIDO:</span>
                      <strong>${printPaymentItem.amount.toLocaleString('es-MX')} MXN</strong>
                    </div>
                  </div>

                  <div className="doc-signatures" style={{ marginTop: '50px' }}>
                    <div className="sig-block">
                      <div className="sig-line" />
                      <strong>Caja y Administración</strong>
                      <span>Stars Royalty Finanzas</span>
                    </div>
                    <div className="sig-block">
                      <div className="sig-line" />
                      <strong>Firma de Conformidad</strong>
                      <span>{a.guardian_name || 'Padre, Madre o Tutor'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* CREDENCIAL IMPRIMIBLE PDF */}
              {printDocument === 'credencial' && (
                <div className="official-document-sheet" style={{ maxWidth: '450px', margin: '0 auto' }}>
                  <div className="credential-card" style={{ boxShadow: 'none' }}>
                    <div className="credential-brand">
                      <img src="/stars-royalty-logo.webp" alt="Stars Royalty" />
                      <div>
                        <strong>STARS ROYALTY</strong>
                        <span>ACREDITACIÓN OFICIAL</span>
                      </div>
                    </div>
                    <div className="credential-person">
                      <div className="credential-photo">
                        {a.photo_data ? <img src={a.photo_data} alt={`Fotografía de ${a.name}`} /> : a.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <strong>{a.name.toUpperCase()}</strong>
                        <span>{a.discipline?.toUpperCase() ?? 'CHEERLEADING'}</span>
                        <span>{a.team?.toUpperCase() ?? 'ROYALS SENIOR'} • {a.team_position?.toUpperCase() ?? 'FLYER'}</span>
                      </div>
                    </div>
                    <div className="credential-bottom">
                      <div>
                        <small>ID</small>
                        <b>{data.credentials[0]?.code ?? 'Sin emitir'}</b>
                      </div>
                      <div className="fake-qr">
                        <CredentialQR code={data.credentials[0]?.code} />
                      </div>
                      <div>
                        <small>VIGENCIA</small>
                        <b>{data.credentials[0]?.valid_until ?? 'Sin vigencia'}</b>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
