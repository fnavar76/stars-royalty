import { CredentialQR } from './CredentialQR'
import { request } from './api'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight, CheckCircle2,
  MessageCircle, Printer, QrCode, Search, Send,
  ShieldCheck, XCircle
} from 'lucide-react'
import { printCredentialCard } from './printCredential'

type Notify = (message: string) => void

type Athlete = {
  id: number
  name: string
  team?: string
  discipline?: string
  guardian_phone?: string
  guardian_name?: string
  photo_data?: string
}

type Communication = {
  id: number
  subject: string
  audience: string
  body: string
  channel: string
  created_at: string
  author?: string
}
type FamilyMessage = { id: number; guardian: string; athlete?: string; subject: string; body: string; status: 'open' | 'in_progress' | 'closed'; created_at: string }

type Credential = {
  athlete_id?: number
  id: number
  code: string
  valid_until: string
  athlete?: string
  photo_data?: string
  team_name?: string
  discipline_name?: string
  revoked: number
}


// --------------------------------------------------------------------------
// MODULE 8: COMMUNICATIONS & WHATSAPP ASSISTANT
// --------------------------------------------------------------------------
export function LiveCommunicationsView({ notify }: { notify: Notify }) {
  const [communications, setCommunications] = useState<Communication[]>([])
  const [familyMessages, setFamilyMessages] = useState<FamilyMessage[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('entrenamiento')
  const [targetAthleteId, setTargetAthleteId] = useState('')

  // Form state
  const [subject, setSubject] = useState('')
  const [audience, setAudience] = useState('Todos los atletas y familias')
  const [body, setBody] = useState('')

  // Pre-configured templates
  const templates: Record<string, { label: string; subject: string; body: (ath?: Athlete) => string }> = {
    entrenamiento: {
      label: 'Recordatorio de Entrenamiento',
      subject: 'Recordatorio de entrenamiento Stars Royalty',
      body: (ath) =>
        `Hola Familia de ${ath?.name ?? 'nuestro atleta'},\n\nLe recordamos que hoy tenemos sesión programada en la Pista Central de Resorte a las 16:00 hrs.\n\nFavor de asistir con uniforme de práctica, cabello recogido con moño institucional y botella de agua. ¡Puntualidad y disciplina para brillar!`
    },
    cambio_horario: {
      label: 'Aviso de Cambio de Horario',
      subject: 'Aviso importante: Ajuste en horario de práctica',
      body: (ath) =>
        `Estimada comunidad Stars Royalty (Familia de ${ath?.name ?? 'Atleta'}):\n\nLes informamos que por motivo de montaje de rutina técnica, el entrenamiento de este sábado se adelanta a las 09:00 hrs en el Salón de Tumbling. Agradecemos su comprensión y puntualidad.`
    },
    cobranza: {
      label: 'Recordatorio de Cuota Mensual',
      subject: 'Recordatorio cordial de mensualidad Stars Royalty',
      body: (ath) =>
        `Estimada Familia de ${ath?.name ?? 'nuestro atleta'}:\n\nEsperamos se encuentren muy bien. Les enviamos este recordatorio cordial de su cuota de mensualidad correspondiente al mes en curso. Pueden liquidar en caja de recepción o enviarnos su comprobante por este medio. ¡Muchas gracias por su apoyo!`
    },
    competencia: {
      label: 'Convocatoria a Campeonato',
      subject: 'Convocatoria Oficial Copa All Star 2026',
      body: (ath) =>
        `👑 STARS ROYALTY - CONVOCATORIA DE COMPETENCIA 👑\n\nNos complace convocar a ${ath?.name ?? 'nuestro atleta'} para representar a la academia en el próximo campeonato.\n\n📍 Sede: Monterrey, Nuevo León\n📅 Fechas: 30 de septiembre al 2 de octubre\n\nFavor de revisar la entrega de certificados médicos y uniforme oficial de gala en recepción.`
    },
    inasistencia: {
      label: 'Notificación de Inasistencia',
      subject: 'Falta registrada en sesión de entrenamiento',
      body: (ath) =>
        `Hola Familia de ${ath?.name ?? 'Atleta'}:\n\nLes informamos que el día de hoy el atleta no estuvo presente en el pase de lista de su equipo. Agradecemos notificarnos el motivo o enviar justificante médico para reprogramar sus acondicionamientos.`
    }
  }

  const load = () => {
    Promise.all([
      request<Communication[]>('/api/communications'),
      request<Athlete[]>('/api/athletes'),
      request<FamilyMessage[]>('/api/family/messages')
    ])
      .then(([commList, aList, messageList]) => {
        setCommunications(commList)
        setAthletes(aList)
        setFamilyMessages(messageList)
        if (!targetAthleteId && aList[0]) {
          setTargetAthleteId(String(aList[0].id))
          applyTemplate('entrenamiento', aList[0])
        }
      })
      .catch((err: unknown) => notify(err instanceof Error ? err.message : 'Error al cargar comunicados'))
  }

  useEffect(() => {
    void load()
  }, [])

  function applyTemplate(key: string, customAthlete?: Athlete) {
    setSelectedTemplate(key)
    const ath = customAthlete ?? athletes.find((a) => String(a.id) === targetAthleteId)
    const tpl = templates[key]
    if (tpl) {
      setSubject(tpl.subject)
      setBody(tpl.body(ath))
    }
  }

  const handleAthleteChange = (idStr: string) => {
    setTargetAthleteId(idStr)
    const ath = athletes.find((a) => String(a.id) === idStr)
    const tpl = templates[selectedTemplate]
    if (tpl) setBody(tpl.body(ath))
  }

  const publishCommunication = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !body.trim()) return notify('Indica asunto y cuerpo del mensaje')
    try {
      await request('/api/communications', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          audience,
          body,
          channel: 'app'
        })
      })
      notify('Comunicado oficial publicado en la plataforma')
      setSubject('')
      setBody('')
      load()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al publicar comunicado')
    }
  }

  const sendDirectWhatsApp = () => {
    const ath = athletes.find((a) => String(a.id) === targetAthleteId)
    const phone = ath?.guardian_phone
    if (!phone) return notify('El atleta seleccionado no tiene teléfono de contacto registrado')
    const clean = phone.replace(/\D/g, '')
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(body)}`, '_blank')
    notify('Abriendo WhatsApp Web con el mensaje pre-cargado')
  }

  const updateFamilyMessage = async (id: number, status: FamilyMessage['status']) => {
    try { await request(`/api/family/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); notify('Seguimiento del mensaje actualizado'); load() }
    catch (err) { notify(err instanceof Error ? err.message : 'No fue posible actualizar el mensaje') }
  }

  return (
    <>
      <div className="communication-layout">
        {/* Left: WhatsApp & Internal Composer */}
        <div className="panel compose-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Centro de Mensajería</p>
              <h2>Generador de Comunicados y WhatsApp</h2>
            </div>
            <MessageCircle size={20} className="text-purple" />
          </div>

          {/* Quick Templates Selector */}
          <label style={{ marginTop: '12px' }}>
            Seleccionar plantilla preconfigurada:
            <div className="template-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
              {Object.entries(templates).map(([key, tpl]) => (
                <button
                  type="button"
                  key={key}
                  className={`select-button ${selectedTemplate === key ? 'active' : ''}`}
                  onClick={() => applyTemplate(key)}
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </label>

          <div className="form-grid" style={{ marginTop: '12px' }}>
            <label>
              Personalizar para atleta específico:
              <select value={targetAthleteId} onChange={(e) => handleAthleteChange(e.target.value)}>
                {athletes.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.guardian_phone || 'Sin tel'})</option>
                ))}
              </select>
            </label>

            <label>
              Audiencia del comunicado:
              <select value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option>Todos los atletas y familias</option>
                <option>Padres y tutores de Royals Senior</option>
                <option>Atletas convocados a competencia</option>
                <option>Cuerpo de entrenadores y coaches</option>
              </select>
            </label>
          </div>

          <label>
            Asunto del mensaje:
            <input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Asunto oficial"
            />
          </label>

          <label>
            Contenido del mensaje (se enviará por WhatsApp o Plataforma):
            <textarea
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escribe el mensaje institucional..."
            />
          </label>

          <div className="compose-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
            <button
              type="button"
              className="whatsapp-button"
              onClick={sendDirectWhatsApp}
              title="Abrir WhatsApp Web con este mensaje"
            >
              <MessageCircle size={15} /> Abrir en WhatsApp Web
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={publishCommunication}
            >
              <Send size={15} /> Publicar en Plataforma
            </button>
          </div>
        </div>

        {/* Right: History of Published Communications */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Bitácora</p>
              <h2>Comunicados Recientes ({communications.length})</h2>
            </div>
          </div>

          <div className="live-list">
            {communications.map((comm) => (
              <div className="live-list-item" key={comm.id}>
                <div className="message-icon">
                  <MessageCircle size={16} />
                </div>
                <div>
                  <strong>{comm.subject}</strong>
                  <span>Audiencia: {comm.audience} • {new Date(comm.created_at).toLocaleDateString('es-MX')}</span>
                  <small>{comm.body.slice(0, 90)}...</small>
                </div>
                <ArrowUpRight size={15} />
              </div>
            ))}
            {!communications.length && (
              <p className="empty-state">No hay comunicados publicados aún.</p>
            )}
          </div>
        </div>
      </div>
      <div className="panel" style={{ marginTop: '14px' }}>
        <div className="panel-heading"><div><p className="eyebrow">Atención a familias</p><h2>Bandeja de solicitudes ({familyMessages.filter((item) => item.status !== 'closed').length} abiertas)</h2></div></div>
        <div className="live-list">{familyMessages.map((item) => <div className="live-list-item" key={item.id}><div><strong>{item.subject}</strong><span>{item.guardian}{item.athlete ? ` · ${item.athlete}` : ''} · {new Date(item.created_at).toLocaleString('es-MX')}</span><small>{item.body}</small></div><select value={item.status} onChange={(event) => void updateFamilyMessage(item.id, event.target.value as FamilyMessage['status'])} aria-label={`Estado de ${item.subject}`}><option value="open">Nuevo</option><option value="in_progress">En proceso</option><option value="closed">Cerrado</option></select></div>)}{!familyMessages.length && <p className="empty-state">No hay solicitudes de familias pendientes.</p>}</div>
      </div>
    </>
  )
}

// --------------------------------------------------------------------------
// MODULE 11: CREDENTIALS & ACCESS VALIDATOR
// --------------------------------------------------------------------------
export function LiveCredentialsView({ notify }: { notify: Notify }) {
  const credentialRef = useRef<HTMLDivElement>(null)
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [athleteId, setAthleteId] = useState('')
  const [validUntil, setValidUntil] = useState('2027-08-31')

  // QR verification state
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean
    status: string
    credential?: {
      athlete_name?: string
      athlete_status?: string
      photo_data?: string
      team_name?: string
      discipline_name?: string
      valid_until: string
    }
  } | null>(null)

  const load = () => {
    Promise.all([
      request<Athlete[]>('/api/athletes'),
      request<Credential[]>('/api/credentials')
    ])
      .then(([aList, cList]) => {
        setAthletes(aList)
        setCredentials(cList)
        if (!athleteId && aList[0]) setAthleteId(String(aList[0].id))
      })
      .catch((err: unknown) => notify(err instanceof Error ? err.message : 'Error al cargar credenciales'))
  }

  useEffect(() => {
    void load()
  }, [])

  const generateCredential = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!athleteId) return notify('Selecciona un atleta')
    try {
      const res = await request<{ id: number; code: string }>('/api/credentials', {
        method: 'POST',
        body: JSON.stringify({
          athleteId: Number(athleteId),
          validUntil
        })
      })
      notify(`Credencial emitida con código: ${res.code}`)
      load()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al emitir credencial')
    }
  }

  const checkCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!verifyCode.trim()) return
    try {
      const res = await request<{
        valid: boolean
        status: string
        credential?: Record<string, unknown>
      }>(`/api/credentials/verify/${verifyCode.trim().toUpperCase()}`)
      setVerifyResult(res as typeof verifyResult)
      if (res.valid) {
        notify('Acceso Autorizado: Credencial vigente')
      } else {
        notify('Acceso Denegado: Credencial no válida')
      }
    } catch {
      setVerifyResult({ valid: false, status: 'No encontrada o no registrada en el sistema' })
      notify('Código no encontrado')
    }
  }

  const selectedCred = credentials.find((item) => item.athlete_id === Number(athleteId))
  const sampleAthlete = athletes.find((a) => a.id === Number(athleteId))

  return (
    <div className="credentials-print-area">
      <div className="split-grid no-print">
        {/* Formulario de Emisión */}
        <form className="panel live-create-form" onSubmit={generateCredential} style={{ gridColumn: 'span 2' }}>
          <div>
            <p className="eyebrow">Control de Acreditaciones</p>
            <h2>Emitir Nueva Credencial Oficial</h2>
          </div>

          <select
            value={athleteId}
            onChange={(e) => setAthleteId(e.target.value)}
            aria-label="Seleccionar atleta"
          >
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.team ?? 'Sin equipo'})</option>
            ))}
          </select>

          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            title="Fecha de vigencia"
          />

          <button className="primary-button">
            <QrCode size={16} /> Generar Credencial QR
          </button>
        </form>
      </div>

      <div className="credential-layout">
        {/* Visual Card Preview */}
        <div className="credential-card" ref={credentialRef}>
          <div className="credential-brand">
            <img src="/stars-royalty-logo.webp" alt="Stars Royalty" />
            <div>
              <strong>STARS ROYALTY</strong>
              <span>IDENTIFICACIÓN OFICIAL DEPORTIVA</span>
            </div>
          </div>

          <div className="credential-person">
            <div className="credential-photo">
              {sampleAthlete?.photo_data ? (
                <img src={sampleAthlete.photo_data} alt={`Fotografía de ${sampleAthlete.name}`} />
              ) : (
                sampleAthlete?.name?.slice(0, 2).toUpperCase() ?? 'SR'
              )}
            </div>
            <div>
              <strong>{sampleAthlete?.name?.toUpperCase() ?? 'Selecciona un atleta'}</strong>
              <span>ATLETA • {sampleAthlete?.discipline?.toUpperCase() ?? 'CHEERLEADING'}</span>
              <span>{sampleAthlete?.team?.toUpperCase() ?? 'SIN EQUIPO'}</span>
            </div>
          </div>

          <div className="credential-bottom">
            <div>
              <small>FOLIO OFICIAL</small>
              <b>{selectedCred?.code ?? 'Sin emitir'}</b>
            </div>
            <div className="fake-qr">
              <CredentialQR code={selectedCred?.code} />
            </div>
            <div>
              <small>VIGENCIA</small>
              <b>{selectedCred?.valid_until ?? 'Sin vigencia'}</b>
            </div>
          </div>
        </div>

        {/* Access Validator & Verification Box */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Recepción y Puerta</p>
              <h2>Validador de Credencial en Acceso</h2>
            </div>
            <ShieldCheck size={20} className="text-mint" />
          </div>

          <p className="section-copy">
            Ingresa o escanea el código impreso en la credencial del atleta o coach para validar vigencia y estatus médico.
          </p>

          <form onSubmit={checkCode} style={{ display: 'flex', gap: '8px', margin: '14px 0' }}>
            <input
              placeholder="Ej. SR-001284 o código de credencial"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              style={{
                flex: 1,
                padding: '10px',
                border: '1px solid #e8e3e9',
                borderRadius: '6px',
                fontFamily: 'monospace'
              }}
            />
            <button className="primary-button">
              <Search size={15} /> Verificar Acceso
            </button>
          </form>

          {verifyResult && (
            <div
              className={`access-result-box ${verifyResult.valid ? 'access-granted' : 'access-denied'}`}
              style={{
                padding: '16px',
                borderRadius: '8px',
                border: `1px solid ${verifyResult.valid ? '#a8d9cd' : '#f0bbb0'}`,
                background: verifyResult.valid ? '#f0fbf7' : '#fff5f3',
                marginTop: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {verifyResult.valid ? (
                  <CheckCircle2 size={24} style={{ color: '#2c8979' }} />
                ) : (
                  <XCircle size={24} style={{ color: '#cd5d49' }} />
                )}
                <div>
                  <strong style={{ fontSize: '14px', color: verifyResult.valid ? '#2c8979' : '#cd5d49' }}>
                    {verifyResult.valid ? '✓ ACCESO AUTORIZADO' : '✕ ACCESO NO PERMITIDO'}
                  </strong>
                  <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#685d6c' }}>
                    Estatus: <b>{verifyResult.status}</b>
                  </p>
                </div>
              </div>

              {verifyResult.credential && (
                <div className="detail-rows" style={{ marginTop: '12px', fontSize: '11px' }}>
                  <div className="detail-row"><span>Nombre:</span><strong>{verifyResult.credential.athlete_name}</strong></div>
                  <div className="detail-row"><span>Equipo:</span><strong>{verifyResult.credential.team_name ?? 'Principal'}</strong></div>
                  <div className="detail-row"><span>Vigencia hasta:</span><strong>{verifyResult.credential.valid_until}</strong></div>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
            <button className="secondary-button" style={{ flex: 1, justifyContent: 'center' }} onClick={() => printCredentialCard(credentialRef.current)}>
              <Printer size={15} /> Imprimir Credencial Actual
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
