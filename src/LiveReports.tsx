import { downloadDocument } from './documents'
import { CredentialQR } from './CredentialQR'
import { request, hasPermission } from './api'
import { useCallback, useEffect, useState } from 'react'
import {
  ArrowUpRight, CalendarDays, Check,
  CheckCircle2, CreditCard, Download, FileSpreadsheet,
  FileText, MessageCircle, Printer, Send, ShieldCheck, UsersRound
} from 'lucide-react'
import { printReportSummary } from './printCredential'
import { Conversations, FamilyProofs } from './OperationsCenter'
import { useAcademy } from './academy'
import { SkillHistory } from './SportsStudio'
import { DocumentChecklist } from './ManagementTools'

type Notify = (message: string) => void

type Summary = {
  athletes: number
  teams: number
  revenue: number
  receivable: number
  expenses: number
  netCashFlow: number
  lowStock: number
  auditEntries: number
  activeInjuries: number
}

type Payment = {
  id: number
  athlete_id?: number
  concept: string
  amount: number
  due_date?: string
  status: string
  paid_at?: string
  athlete?: string
}

type AuditLog = {
  id: number
  user?: string
  action: string
  entity: string
  entity_id?: number
  metadata?: string
  created_at: string
}


function downloadCSV(filename: string, rows: (string | number)[][]) {
  const processRow = (row: (string | number)[]) =>
    row.map((val) => {
      const safeValue = typeof val === 'string' && /^[=+@\-\t\r]/.test(val) ? `'${val}` : val
      const text = String(safeValue ?? '').replace(/"/g, '""')
      return `"${text}"`
    }).join(',')

  const csvContent = '\uFEFF' + rows.map(processRow).join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// --------------------------------------------------------------------------
// MODULE 12: REPORTS & ANALYTICS
// --------------------------------------------------------------------------
export function LiveReportsView({ notify }: { notify: Notify }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [showAudit, setShowAudit] = useState(false)

  useEffect(() => {
    request<Summary>('/api/reports/summary')
      .then(setSummary)
      .catch((err: unknown) => notify(err instanceof Error ? err.message : 'Error al cargar reportes'))
    if (hasPermission('admin')) request<AuditLog[]>('/api/audit')
      .then(setAuditLogs)
      .catch(() => [])
  }, [notify])

  const exportFinancialReport = async () => {
    try {
      const payments = await request<Payment[]>('/api/payments')
      const rows: (string | number)[][] = [
        ['REPORTE FINANCIERO STARS ROYALTY 2026'],
        ['Fecha de exportación:', new Date().toLocaleString('es-MX')],
        [],
        ['ID', 'Atleta / Cuenta', 'Concepto', 'Monto (MXN)', 'Fecha Vencimiento', 'Estado']
      ]
      payments.forEach((p) => {
        rows.push([p.id, p.athlete ?? 'General', p.concept, p.amount, p.due_date ?? 'Inmediato', p.status])
      })
      downloadCSV('StarsRoyalty_Reporte_Financiero.csv', rows)
      notify('Reporte financiero descargado en CSV / Excel')
    } catch {
      notify('Error al generar reporte financiero')
    }
  }

  const exportAthletesReport = async () => {
    try {
      const athletes = await request<Record<string, unknown>[]>('/api/athletes')
      const rows: (string | number)[][] = [
        ['DIRECTORIO DE ATLETAS STARS ROYALTY'],
        ['Fecha de exportación:', new Date().toLocaleString('es-MX')],
        [],
        ['ID', 'Nombre', 'Disciplina', 'Equipo', 'Posición', 'Estatus', 'Teléfono', 'Tutor']
      ]
      athletes.forEach((a) => {
        rows.push([
          `SR-${String(a.id).padStart(6, '0')}`,
          String(a.name),
          String(a.discipline ?? 'Cheerleading'),
          String(a.team ?? 'Sin equipo'),
          String(a.team_position ?? 'General'),
          String(a.status),
          String(a.phone ?? ''),
          String(a.guardian_name ?? '')
        ])
      })
      downloadCSV('StarsRoyalty_Directorio_Atletas.csv', rows)
      notify('Directorio de atletas exportado a CSV / Excel')
    } catch {
      notify('Error al generar reporte de atletas')
    }
  }

  const exportAttendanceReport = async () => {
    try {
      const att = await request<Record<string, unknown>[]>('/api/attendance')
      const rows: (string | number)[][] = [
        ['REPORTE DE ASISTENCIA DIARIA STARS ROYALTY'],
        ['Fecha de exportación:', new Date().toLocaleString('es-MX')],
        [],
        ['Fecha', 'Atleta', 'Equipo', 'Estado de Asistencia', 'Notas del Coach']
      ]
      att.forEach((r) => {
        rows.push([
          String(r.attended_on),
          String(r.athlete ?? ''),
          String(r.team ?? ''),
          String(r.status === 'present' ? 'Presente' : r.status === 'late' ? 'Retardo' : r.status === 'excused' ? 'Justificada' : 'Falta'),
          String(r.notes ?? '')
        ])
      })
      downloadCSV('StarsRoyalty_Reporte_Asistencias.csv', rows)
      notify('Reporte de asistencia exportado a CSV / Excel')
    } catch {
      notify('Error al exportar asistencias')
    }
  }

  const exportInventoryReport = async () => {
    try {
      const products = await request<Record<string, unknown>[]>('/api/products')
      const rows: (string | number)[][] = [
        ['REPORTE DE EXISTENCIAS Y VALUACIÓN DE INVENTARIO'],
        ['Fecha de exportación:', new Date().toLocaleString('es-MX')],
        [],
        ['SKU', 'Producto', 'Categoría', 'Talla', 'Costo Unitario', 'Precio Venta', 'Stock Actual', 'Mínimo', 'Alerta']
      ]
      products.forEach((p) => {
        rows.push([
          String(p.sku),
          String(p.name),
          String(p.category ?? ''),
          String(p.size ?? ''),
          Number(p.cost),
          Number(p.price),
          Number(p.stock),
          Number(p.min_stock),
          Number(p.stock) <= Number(p.min_stock) ? 'STOCK BAJO' : 'OK'
        ])
      })
      downloadCSV('StarsRoyalty_Reporte_Inventario.csv', rows)
      notify('Reporte de inventario exportado a CSV / Excel')
    } catch {
      notify('Error al exportar inventario')
    }
  }

  return (
    <div className="report-print-area">
      {/* Executive Indicators */}
      <section className="module-stats">
        <div className="stat-card purple">
          <span>Atletas Activos</span>
          <strong>{summary?.athletes ?? '...'}</strong>
          <small><UsersRound size={12} /> Academia regular</small>
        </div>
        <div className="stat-card mint">
          <span>Ingresos Cobrados</span>
          <strong>${(summary?.revenue ?? 0).toLocaleString('es-MX')}</strong>
          <small>Acumulado histórico</small>
        </div>
        <div className="stat-card yellow">
          <span>Saldo por Cobrar</span>
          <strong>${(summary?.receivable ?? 0).toLocaleString('es-MX')}</strong>
          <small>Cuentas pendientes</small>
        </div>
        <div className="stat-card coral">
          <span>Flujo Neto</span>
          <strong>${(summary?.netCashFlow ?? 0).toLocaleString('es-MX')}</strong>
          <small>{(summary?.expenses ?? 0) > 0 ? `-$${summary?.expenses} egresos` : 'Superávit'}</small>
        </div>
      </section>

      {/* Export Cards Grid */}
      <div className="panel table-panel">
        <div className="table-toolbar">
          <div>
            <h2>Centro de Exportación de Datos</h2>
            <p>Descarga en formato compatible con Microsoft Excel, Google Sheets y PDF.</p>
          </div>
          <button className="secondary-button" onClick={() => printReportSummary(document.querySelector('.report-print-area > .module-stats'))}>
            <Printer size={15} /> Imprimir Resumen PDF
          </button>
        </div>

        <div className="report-grid">
          <button className="report-card" onClick={exportFinancialReport}>
            <div className="report-icon"><CreditCard size={20} /></div>
            <div>
              <strong>Reporte Financiero Completo</strong>
              <span>Ingresos pagados, cuentas por cobrar, estados y montos por atleta.</span>
            </div>
            <Download size={16} />
          </button>

          <button className="report-card" onClick={exportAthletesReport}>
            <div className="report-icon"><UsersRound size={20} /></div>
            <div>
              <strong>Directorio y Expedientes de Atletas</strong>
              <span>Equipos, disciplinas, categorías, posiciones, tutores y contacto.</span>
            </div>
            <Download size={16} />
          </button>

          <button className="report-card" disabled={!hasPermission('coaching')} title={!hasPermission('coaching') ? 'Requiere permiso deportivo' : undefined} onClick={exportAttendanceReport}>
            <div className="report-icon"><CalendarDays size={20} /></div>
            <div>
              <strong>Historial de Asistencias y Faltas</strong>
              <span>Pase de lista por fecha, equipo, retardos y justificaciones.</span>
            </div>
            <Download size={16} />
          </button>

          <button className="report-card" onClick={exportInventoryReport}>
            <div className="report-icon"><FileSpreadsheet size={20} /></div>
            <div>
              <strong>Valuación y Existencias de Almacén</strong>
              <span>Catálogo, precios, costos, existencias y alertas de stock bajo.</span>
            </div>
            <Download size={16} />
          </button>

          <button className="report-card" disabled={!hasPermission('admin')} title={!hasPermission('admin') ? 'Requiere permiso de administración' : undefined} onClick={() => setShowAudit(!showAudit)}>
            <div className="report-icon"><ShieldCheck size={20} /></div>
            <div>
              <strong>Bitácora de Auditoría de Cambios</strong>
              <span>{auditLogs.length} movimientos de usuarios registrados en el sistema.</span>
            </div>
            <ArrowUpRight size={16} />
          </button>
        </div>
      </div>

      {/* Audit Logs Table */}
      {showAudit && (
        <div className="panel table-panel" style={{ marginTop: '14px' }}>
          <div className="table-toolbar">
            <div>
              <h2>Bitácora de Seguridad y Auditoría del Sistema</h2>
              <p>Trazabilidad estricta de quién creó, modificó o eliminó registros.</p>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha y Hora</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Entidad Afectada</th>
                  <th>ID Registro</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString('es-MX')}</td>
                    <td><strong>{log.user ?? 'Administrador General'}</strong></td>
                    <td><span className="category-pill">{log.action}</span></td>
                    <td>{log.entity}</td>
                    <td>#{log.entity_id ?? 'N/A'}</td>
                  </tr>
                ))}
                {!auditLogs.length && (
                  <tr>
                    <td colSpan={5} className="empty-state">No hay registros de auditoría disponibles.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------
// PROPOSAL: FAMILY PORTAL & DIGITAL CONSENT
// --------------------------------------------------------------------------
export function LiveFamilyView({ notify }: { notify: Notify }) {
  const academy = useAcademy()
  const [announcements, setAnnouncements] = useState<{ id: number; subject: string; body: string; created_at: string }[]>([])
  const [overview, setOverview] = useState<{
    guardian: { name: string; phone?: string; email?: string }
    athletes: { id: number; name: string; photo_data?: string; team?: string; category?: string; discipline?: string; coach?: string }[]
    payments: Payment[]; attendanceRate: number | null; lastEvaluation: { score: number; evaluated_at: string } | null
    events: { id: number; title: string; type: string; location?: string; starts_at: string }[]
    attendanceRows: { athlete_id: number; athlete: string; attended_on: string; status: string; notes?: string; team?: string }[]
    evaluations: { id: number; athlete_id: number; athlete: string; technique: number; flexibility: number; strength: number; attitude: number; teamwork: number; feedback?: string; rubric?: string; evaluated_at: string }[]
    documents: { id: number; athlete_id: number; name: string; doc_type: string; expires_at?: string; created_at: string }[]
    credentials: { id: number; athlete_id: number; code: string; valid_until: string }[]
    messages: { id: number; athlete_id?: number; subject: string; body: string; status: string; created_at: string }[]
    consent: { signer_name: string; signed_at: string } | null
    consents: { athlete_id: number; signer_name:string; signed_at:string }[]
  } | null>(null)
  const [guardianSignature, setGuardianSignature] = useState('')
  const [activeTab, setActiveTab] = useState<'resumen' | 'asistencia' | 'rendimiento' | 'documentos' | 'mensajes'>('resumen')
  const [selectedAthleteId, setSelectedAthleteId] = useState('')
  const [messageSubject, setMessageSubject] = useState('')
  const [messageBody, setMessageBody] = useState('')

  const loadOverview = useCallback(() => request<typeof overview>('/api/family/overview')
    .then((data) => { setOverview(data); setSelectedAthleteId((current) => current || String(data?.athletes[0]?.id ?? '')) })
    .catch((err: unknown) => notify(err instanceof Error ? err.message : 'No fue posible cargar el portal familiar')), [notify])

  useEffect(() => {
    void loadOverview()
    request<typeof announcements>('/api/communications').then(setAnnouncements).catch((error: unknown) => notify(error instanceof Error ? error.message : 'No fue posible cargar los avisos'))
  }, [notify,loadOverview])

  const handleSignConsent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!guardianSignature.trim()) return notify('Por favor escribe tu nombre completo como firma digital')
    try {
      await request('/api/family/consent', { method: 'POST', body: JSON.stringify({ signerName: guardianSignature, athleteId: Number(selectedAthleteId), version: academy?.consent_version }) })
      await loadOverview()
      setGuardianSignature('')
      notify('Carta responsiva y consentimiento médico firmados digitalmente')
    } catch (err) { notify(err instanceof Error ? err.message : 'No fue posible registrar la firma') }
  }

  const payments = (overview?.payments ?? []).filter((payment) => !selectedAthleteId || payment.athlete_id === Number(selectedAthleteId))
  const athlete = overview?.athletes.find((item) => item.id === Number(selectedAthleteId)) ?? overview?.athletes[0]
  const signedConsent = Boolean(overview?.consents?.some(consent => consent.athlete_id === Number(selectedAthleteId)))
  const pendingAmount = payments.filter((p) => ['pending', 'overdue'].includes(p.status)).reduce((s, p) => s + p.amount, 0)
  const paidCount = payments.filter((p) => p.status === 'paid').length
  const athletePayments = payments.filter((payment) => !athlete || payment.athlete_id === athlete.id)
  const athleteAttendance = (overview?.attendanceRows ?? []).filter((item) => !athlete || item.athlete_id === athlete.id)
  const athleteEvaluations = (overview?.evaluations ?? []).filter((item) => !athlete || item.athlete_id === athlete.id)
  const athleteDocuments = (overview?.documents ?? []).filter((item) => !athlete || item.athlete_id === athlete.id)

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await request('/api/family/messages', { method: 'POST', body: JSON.stringify({ athleteId: athlete?.id, subject: messageSubject, body: messageBody }) })
      setMessageSubject(''); setMessageBody(''); notify('Mensaje enviado a la administración'); await loadOverview()
    } catch (err) { notify(err instanceof Error ? err.message : 'No fue posible enviar el mensaje') }
  }

  return (
    <>
      {/* Family Banner */}
      <div className="family-banner">
        <div className="avatar avatar-family">{athlete?.photo_data ? <img src={athlete.photo_data} alt="" /> : athlete?.name.slice(0, 2).toUpperCase() ?? 'SR'}</div>
        <div>
          <p className="eyebrow">Portal Familiar Stars Royalty</p>
          <h2>{overview?.guardian.name ?? 'Familia'} • Atleta: {athlete?.name ?? 'Cargando...'}</h2>
          <span>{athlete?.team ?? 'Sin equipo'} • {athlete?.discipline ?? 'Sin disciplina'} {athlete?.category ? `• ${athlete.category}` : ''} {athlete?.coach ? `• Coach: ${athlete.coach}` : ''}</span>
        </div>
        <span className="portal-label">Modo Tutor Seguro</span>
      </div>

      <div className="dossier-tabs" style={{ marginBottom: '14px' }}>
        {overview?.athletes.length && <select value={selectedAthleteId} onChange={(e) => setSelectedAthleteId(e.target.value)} aria-label="Seleccionar atleta de la familia">
          {overview.athletes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>}
        <button className={activeTab === 'resumen' ? 'active' : ''} onClick={() => setActiveTab('resumen')}>Resumen</button>
        <button className={activeTab === 'asistencia' ? 'active' : ''} onClick={() => setActiveTab('asistencia')}>Asistencia</button>
        <button className={activeTab === 'rendimiento' ? 'active' : ''} onClick={() => setActiveTab('rendimiento')}>Rendimiento</button>
        <button className={activeTab === 'documentos' ? 'active' : ''} onClick={() => setActiveTab('documentos')}><FileText size={14} /> Documentos</button>
        <button className={activeTab === 'mensajes' ? 'active' : ''} onClick={() => setActiveTab('mensajes')}><MessageCircle size={14} /> Mensajes</button>
      </div>

      {/* Stats Row */}
      {activeTab === 'resumen' && <>
      <section className="module-stats">
        <div className="stat-card yellow">
          <span>Saldo por Liquidar</span>
          <strong>${pendingAmount.toLocaleString('es-MX')}</strong>
          <small>Estado de cuenta</small>
        </div>
        <div className="stat-card mint">
          <span>Pagos Confirmados</span>
          <strong>{paidCount} cuotas</strong>
          <small>Recibos disponibles</small>
        </div>
        <div className="stat-card purple">
          <span>Asistencia registrada</span>
          <strong>{athleteAttendance.length ? `${Math.round(100 * athleteAttendance.filter((item) => ['present', 'late'].includes(item.status)).length / athleteAttendance.length)}%` : '--'}</strong>
          <small>Historial registrado</small>
        </div>
        <div className="stat-card coral">
          <span>Evaluación Reciente</span>
          <strong>{athleteEvaluations[0] ? Math.round((athleteEvaluations[0].technique + athleteEvaluations[0].flexibility + athleteEvaluations[0].strength + athleteEvaluations[0].attitude + athleteEvaluations[0].teamwork) / 5) : '--'} / 100</strong>
          <small>{overview?.lastEvaluation ? 'Última evaluación' : 'Sin evaluaciones aún'}</small>
        </div>
      </section>

      {/* Grid: Financial status & Upcoming schedule */}
      <section className="panel">
        <h2>Avisos de la academia</h2>
        <div className="live-list">{announcements.map(item => <article className="live-list-item" key={item.id}><div><strong>{item.subject}</strong><p style={{ whiteSpace: 'pre-wrap' }}>{item.body}</p><small>{new Date(item.created_at).toLocaleString('es-MX')}</small></div></article>)}</div>
        {!announcements.length && <p className="empty-state">No hay avisos para tu familia.</p>}
      </section>
      <div className="split-grid">
        {/* Estado de Cuenta */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Finanzas Familiares</p>
              <h2>Cuotas y Estado de Cuenta</h2>
            </div>
            <CreditCard size={20} className="text-purple" />
          </div>

          <div className="live-list" style={{ marginTop: '12px' }}>
            {athletePayments.slice(0, 5).map((p) => (
              <div className="live-list-item" key={p.id}>
                <div>
                  <strong>{p.concept}</strong>
                  <span>Vence: {p.due_date ?? 'Inmediato'}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <b style={{ display: 'block', fontSize: '13px' }}>${p.amount.toLocaleString('es-MX')}</b>
                  <span className={`status-pill ${p.status === 'paid' ? 'success' : 'warning'}`}>
                    {p.status === 'paid' ? 'Pagado ✓' : p.status === 'cancelled' ? 'Cancelado' : 'Pendiente'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {pendingAmount > 0 && (
            <button
              className="whatsapp-button"
              style={{ width: '100%', marginTop: '14px', justifyContent: 'center' }}
              onClick={() => {
                const text = `Hola administración Stars Royalty, soy el tutor de ${athlete?.name ?? 'mi atleta'} y deseo enviar mi comprobante de pago por $${pendingAmount.toLocaleString('es-MX')}.`
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
              }}
            >
              <MessageCircle size={15} /> Notificar Pago a Recepción por WhatsApp
            </button>
          )}
        </div>

        {/* Próximas Actividades */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Agenda</p>
              <h2>Próximas Actividades del Atleta</h2>
            </div>
            <CalendarDays size={20} />
          </div>

          <div className="live-list" style={{ marginTop: '12px' }}>
            {(overview?.events ?? []).map((event) => {
              const date = new Date(event.starts_at)
              return <div className="live-list-item" key={event.id}><div className="date-block"><strong>{date.getDate()}</strong><span>{date.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '').toUpperCase()}</span></div><div><strong>{event.title}</strong><span>{event.location ?? 'Sede por confirmar'} • {date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span></div><span className="status-pill neutral">{event.type}</span></div>
            })}
            {!overview?.events.length && <p className="empty-state">No hay actividades próximas.</p>}
          </div>
        </div>
      </div>

      {/* Digital Consent & Responsibility Form */}
      <div className="panel" style={{ marginTop: '14px' }}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Consentimiento y Responsiva Institucional</p>
            <h2>Responsiva · Temporada {academy?.season?.name ?? 'actual'}</h2>
          </div>
          <ShieldCheck size={22} style={{ color: signedConsent ? '#2c8979' : '#e87763' }} />
        </div>

        {signedConsent ? (
          <div
            style={{
              padding: '16px',
              borderRadius: '8px',
              background: '#e8f7f2',
              color: '#2c8979',
              marginTop: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <CheckCircle2 size={24} />
            <div>
              <strong>Carta Responsiva y Reglamento Vigentes Firmados Digitalmente</strong>
              <p style={{ margin: '3px 0 0', fontSize: '10px', color: '#527c71' }}>
                Registro conservado para {academy?.season?.name}. Versión {academy?.consent_version} del documento.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSignConsent} style={{ marginTop: '12px' }}>
            <p className="section-copy">
              {academy?.consent_text ?? 'Cargando documento vigente…'}
            </p>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ flex: 1, minWidth: '220px' }}>
                Nombre completo del tutor (Firma Digital):
                <input
                  required
                  placeholder="Escribe tu nombre completo como firma legal"
                  value={guardianSignature}
                  onChange={(e) => setGuardianSignature(e.target.value)}
                />
              </label>
              <button className="primary-button">
                <Check size={16} /> Firmar y Aceptar Responsiva
              </button>
            </div>
          </form>
        )}
      </div>
      </>}

      {activeTab === 'rendimiento' && <SkillHistory athleteId={Number(selectedAthleteId)} />}
      {activeTab === 'mensajes' && <Conversations key={overview?.messages.length} notify={notify}/>}
      {activeTab === 'documentos' && selectedAthleteId && <DocumentChecklist athleteId={Number(selectedAthleteId)} />}
      {activeTab === 'documentos' && <FamilyProofs notify={notify} payments={payments}/>}
      {activeTab === 'asistencia' && <div className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Historial verificado</p><h2>Asistencia de {athlete?.name ?? 'atleta'}</h2></div><CalendarDays size={20} /></div>
        <div className="live-list">{athleteAttendance.map((item, index) => <div className="live-list-item" key={`${item.attended_on}-${index}`}><div><strong>{new Date(`${item.attended_on}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</strong><span>{item.team ?? 'Entrenamiento'}{item.notes ? ` · ${item.notes}` : ''}</span></div><span className={`status-pill ${item.status === 'present' || item.status === 'late' ? 'success' : 'warning'}`}>{item.status === 'present' ? 'Presente' : item.status === 'late' ? 'Retardo' : item.status === 'excused' ? 'Justificada' : 'Falta'}</span></div>)}{!athleteAttendance.length && <p className="empty-state">Aún no hay asistencias registradas.</p>}</div>
      </div>}

      {activeTab === 'rendimiento' && <div className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Seguimiento deportivo</p><h2>Evaluaciones de {athlete?.name ?? 'atleta'}</h2></div></div>
        <div className="live-list">{athleteEvaluations.map((item) => { const average = Math.round((item.technique + item.flexibility + item.strength + item.attitude + item.teamwork) / 5); return <div className="live-list-item" key={item.id}><div><strong>{item.rubric ?? 'Evaluación técnica'} · {new Date(item.evaluated_at).toLocaleDateString('es-MX')}</strong><span>Técnica {item.technique}% · Flexibilidad {item.flexibility}% · Fuerza {item.strength}%</span><small>{item.feedback || 'Sin comentarios públicos.'}</small></div><b>{average}/100</b></div> })}{!athleteEvaluations.length && <p className="empty-state">Aún no hay evaluaciones publicadas.</p>}</div>
      </div>}

      {activeTab === 'documentos' && <div className="split-grid"><div className="panel"><div className="panel-heading"><div><p className="eyebrow">Documentación compartida</p><h2>Documentos disponibles</h2></div><FileText size={20} /></div><div className="live-list">{athleteDocuments.map((item) => <div className="live-list-item" key={item.id}><div><strong>{item.name}</strong><span>{item.doc_type.replaceAll('_', ' ')} · {item.expires_at ? `Vence: ${item.expires_at}` : 'Vigente'}</span></div><button className="secondary-button" onClick={() => void downloadDocument(item.id, true).catch((error: Error) => notify(error.message))}>Descargar</button></div>)}{!athleteDocuments.length && <p className="empty-state">La academia aún no ha compartido documentos.</p>}</div></div><div className="panel"><div className="panel-heading"><div><p className="eyebrow">Identificación</p><h2>Credencial del atleta</h2></div></div><div className="live-list">{(overview?.credentials ?? []).filter((item) => !athlete || item.athlete_id === athlete.id).map((item) => <div className="live-list-item" key={item.id}><div><strong>{item.code}</strong><span>Vigencia hasta: {item.valid_until}</span></div><CredentialQR code={item.code} /><span className="status-pill neutral">{item.valid_until < new Date().toLocaleDateString('en-CA') ? 'Vencida' : 'Vigente'}</span></div>)}{!(overview?.credentials ?? []).some((item) => !athlete || item.athlete_id === athlete.id) && <p className="empty-state">No hay una credencial vigente.</p>}</div></div></div>}

      {activeTab === 'mensajes' && <div className="split-grid"><form className="panel live-form" onSubmit={sendMessage}><div className="panel-heading"><div><p className="eyebrow">Contacto institucional</p><h2>Enviar mensaje a la academia</h2></div><Send size={20} /></div><label>Asunto<input required value={messageSubject} onChange={(e) => setMessageSubject(e.target.value)} placeholder="Ej. Duda sobre mensualidad" /></label><label>Mensaje<textarea required rows={5} value={messageBody} onChange={(e) => setMessageBody(e.target.value)} placeholder="Escribe tu consulta para recepción o el cuerpo técnico." /></label><button className="primary-button"><Send size={15} /> Enviar mensaje</button></form><div className="panel"><div className="panel-heading"><div><p className="eyebrow">Seguimiento</p><h2>Mensajes enviados</h2></div></div><div className="live-list">{(overview?.messages ?? []).map((item) => <div className="live-list-item" key={item.id}><div><strong>{item.subject}</strong><span>{item.body}</span><small>{new Date(item.created_at).toLocaleString('es-MX')}</small></div><span className="status-pill neutral">{item.status === 'open' ? 'Enviado' : item.status}</span></div>)}{!overview?.messages.length && <p className="empty-state">No hay mensajes enviados.</p>}</div></div></div>}
    </>
  )
}
