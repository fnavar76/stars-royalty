import { request } from './api'
import { Modal } from './Modal'
import { ActionForm } from './uiShared'
import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDownRight, Check, DollarSign,
  Edit3, MessageCircle, Package, Plus, Printer, RefreshCw, ShoppingCart, Trash2, TrendingUp, X
} from 'lucide-react'

type Notify = (message: string) => void

type Athlete = { id: number; name: string; guardian_phone?: string; guardian_name?: string }
type Payment = {
  id: number
  concept: string
  athlete?: string
  guardian_phone?: string
  guardian_name?: string
  amount: number
  due_date?: string
  paid_at?: string
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
  discount?: number
  late_fee?: number
  payment_method?: string
}

type Expense = {
  id: number
  concept: string
  category: string
  amount: number
  incurred_on: string
  vendor?: string
  notes?: string
}

type Product = {
  id: number
  name: string
  sku: string
  category?: string
  size?: string
  color?: string
  cost: number
  price: number
  stock: number
  min_stock: number
  low_stock: number
  active?: number
}


// --------------------------------------------------------------------------
// MODULE 7: BILLING & FINANCES VIEW
// --------------------------------------------------------------------------
export function LiveBillingView({ notify }: { notify: Notify }) {
  const [installment,setInstallment]=useState<{id:number;balance:number}|null>(null)
  const [activeTab, setActiveTab] = useState<'ingresos' | 'egresos' | 'flujo'>('ingresos')
  const [payments, setPayments] = useState<Payment[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])

  // New charge form
  const [form, setForm] = useState({
    athleteId: '',
    concept: '',
    amount: '',
    dueDate: '',
    discount: '0',
    lateFee: '0'
  })

  // New expense form
  const [expenseForm, setExpenseForm] = useState({
    concept: '',
    category: 'Instalaciones',
    amount: '',
    incurredOn: new Date().toISOString().slice(0, 10),
    vendor: '',
    notes: ''
  })

  // Receipt printing modal state
  const [printingPayment, setPrintingPayment] = useState<Payment | null>(null)

  const load = useCallback(() => Promise.all([
        request<Payment[]>('/api/payments'),
        request<Expense[]>('/api/expenses'),
        request<Athlete[]>('/api/athletes')
      ]).then(([pays, exps, aths]) => {
      setPayments(pays)
      setExpenses(exps)
      setAthletes(aths)
    }).catch((err:unknown) => {
      notify(err instanceof Error ? err.message : 'Error al cargar finanzas')
    }), [notify])

  useEffect(() => {
    void load()
  }, [load])

  const createPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.concept || !form.amount) return notify('Indica concepto y monto')
    try {
      await request('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          athleteId: form.athleteId ? Number(form.athleteId) : undefined,
          concept: form.concept,
          amount: Number(form.amount),
          dueDate: form.dueDate || undefined,
          discount: Number(form.discount || 0),
          lateFee: Number(form.lateFee || 0)
        })
      })
      setForm({ athleteId: '', concept: '', amount: '', dueDate: '', discount: '0', lateFee: '0' })
      notify('Cargo generado y añadido al estado de cuenta')
      load()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Error al guardar cargo')
    }
  }

  const recordInstallment = (id: number, balance: number) => setInstallment({id,balance})

  const markPaid = async (id: number, method = 'Transferencia / Caja') => {
    try {
      await request(`/api/payments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'paid', paymentMethod: method })
      })
      notify('Pago registrado y liquidado con éxito')
      load()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Error al actualizar pago')
    }
  }

  const createExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!expenseForm.concept || !expenseForm.amount) return notify('Indica concepto y monto del egreso')
    try {
      await request('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          concept: expenseForm.concept,
          category: expenseForm.category,
          amount: Number(expenseForm.amount),
          incurredOn: expenseForm.incurredOn,
          vendor: expenseForm.vendor || undefined,
          notes: expenseForm.notes || undefined
        })
      })
      setExpenseForm({
        concept: '',
        category: 'Instalaciones',
        amount: '',
        incurredOn: new Date().toISOString().slice(0, 10),
        vendor: '',
        notes: ''
      })
      notify('Egreso operativo registrado en contabilidad')
      load()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al registrar egreso')
    }
  }

  const deleteExpense = async (id: number) => {
    try {
      await request(`/api/expenses/${id}`, { method: 'DELETE' })
      notify('Egreso eliminado')
      load()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al eliminar egreso')
    }
  }

  const sendWhatsAppReminder = (item: Payment) => {
    if (!item.guardian_phone) return notify('El atleta no tiene teléfono de contacto registrado')
    const clean = item.guardian_phone.replace(/\D/g, '')
    const msg = `👑 STARS ROYALTY - RECORDATORIO DE PAGO 👑\n\nEstimada familia de *${item.athlete ?? 'nuestro atleta'}*:\nLe saludamos cordialmente para recordarle su cuota pendiente:\n\n📌 *Concepto:* ${item.concept}\n💰 *Monto:* $${item.amount.toLocaleString('es-MX')} MXN\n📅 *Fecha Límite:* ${item.due_date ?? 'Próximo vencimiento'}\n\nFavor de confirmar su pago en recepción o responder con su comprobante digital. ¡Gracias por formar parte de la realeza Stars Royalty!`
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // El flujo considera únicamente dinero efectivamente cobrado y gastado en el mes calendario actual.
  const now = new Date()
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const periodLabel = now.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  const isInPeriod = (value?: string) => Boolean(value?.startsWith(periodKey))
  const paidThisPeriod = payments.filter((p) => p.status === 'paid' && isInPeriod(p.paid_at ?? p.due_date))
  const openPayments = payments.filter((p) => p.status === 'pending' || p.status === 'overdue')
  const expensesThisPeriod = expenses.filter((e) => isInPeriod(e.incurred_on))
  const totalIncomePaid = paidThisPeriod.reduce((sum, p) => sum + p.amount, 0)
  const totalReceivable = openPayments.reduce((sum, p) => sum + p.amount, 0)
  const totalExpenses = expensesThisPeriod.reduce((sum, e) => sum + e.amount, 0)
  const netCashFlow = totalIncomePaid - totalExpenses

  return (
    <>
      {/* Financial Metrics */}
      {installment&&<Modal title="Registrar abono" onClose={()=>setInstallment(null)}><p className="ops-dialog-subtitle">Cargo #{installment.id} · Saldo disponible <strong>${installment.balance.toFixed(2)}</strong></p><ActionForm notify={notify} label="Confirmar abono" onSave={async form=>{const amount=Number(form.get('amount'));if(amount<=0||amount>installment.balance)throw new Error('El abono debe ser mayor que cero y no superar el saldo.');await request(`/api/payments/${installment.id}/installments`,{method:'POST',body:JSON.stringify({amount,paymentMethod:String(form.get('method'))})});await load();setInstallment(null)}}><label>Importe del abono MXN<input autoFocus name="amount" type="number" required min="0.01" max={installment.balance} step="0.01"/></label><label>Método de pago<select name="method"><option>Transferencia</option><option>Efectivo</option><option>Tarjeta</option><option>Depósito</option></select></label><p className="ops-hint">Se registrará el ingreso y se actualizará el saldo del cargo.</p></ActionForm></Modal>}
      <section className="module-stats">
        <div className="stat-card mint">
          <span>Ingresos cobrados · {periodLabel}</span>
          <strong>${totalIncomePaid.toLocaleString('es-MX')}</strong>
          <small><DollarSign size={12} /> {paidThisPeriod.length} pagos cobrados en el periodo</small>
        </div>
        <div className="stat-card yellow">
          <span>Cuentas por cobrar vigentes</span>
          <strong>${totalReceivable.toLocaleString('es-MX')}</strong>
          <small>{openPayments.filter((p) => p.status === 'overdue').length} {openPayments.filter((p) => p.status === 'overdue').length === 1 ? 'pago vencido' : 'pagos vencidos'} · no integra flujo</small>
        </div>
        <div className="stat-card coral">
          <span>Egresos · {periodLabel}</span>
          <strong>${totalExpenses.toLocaleString('es-MX')}</strong>
          <small>{expensesThisPeriod.length} gastos registrados en el periodo</small>
        </div>
        <div className="stat-card purple">
          <span>Flujo de caja neto · {periodLabel}</span>
          <strong className={netCashFlow >= 0 ? 'text-positive' : 'text-coral'}>
            ${netCashFlow.toLocaleString('es-MX')}
          </strong>
          <small>{netCashFlow >= 0 ? 'Balance superavitario' : 'Déficit operativo'}</small>
        </div>
      </section>

      {/* Subtabs for Finance */}
      <div className="dossier-tabs" style={{ marginBottom: '14px' }}>
        <button className={activeTab === 'ingresos' ? 'active' : ''} onClick={() => setActiveTab('ingresos')}>
          <DollarSign size={15} /> Cobranza & Mensualidades ({payments.length})
        </button>
        <button className={activeTab === 'egresos' ? 'active' : ''} onClick={() => setActiveTab('egresos')}>
          <ArrowDownRight size={15} /> Egresos & Gastos Operativos ({expenses.length})
        </button>
        <button className={activeTab === 'flujo' ? 'active' : ''} onClick={() => setActiveTab('flujo')}>
          <TrendingUp size={15} /> Estado de Flujo de Efectivo
        </button>
      </div>

      {/* TAB 1: INGRESOS & COBRANZA */}
      {activeTab === 'ingresos' && (
        <>
          <form className="panel live-create-form" onSubmit={createPayment}>
            <div>
              <p className="eyebrow">Cuentas por Cobrar</p>
              <h2>Generar Nuevo Cargo</h2>
            </div>
            <select
              value={form.athleteId}
              onChange={(e) => setForm({ ...form, athleteId: e.target.value })}
              aria-label="Seleccionar atleta"
            >
              <option value="">Cargo general a la academia</option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <input
              required
              placeholder="Concepto (Mensualidad, Copa, Uniforme)"
              value={form.concept}
              onChange={(e) => setForm({ ...form, concept: e.target.value })}
            />
            <input
              required
              type="number"
              min="1"
              placeholder="Monto ($)"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
            <button className="primary-button">
              <Plus size={16} /> Generar Cargo
            </button>
          </form>

          <div className="panel table-panel">
            <div className="table-toolbar">
              <div>
                <h2>Historial de Cobranza y Movimientos</h2>
                <p>Emite recibos en PDF o envía recordatorios instantáneos por WhatsApp.</p>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th>Atleta / Cuenta</th>
                    <th>Monto</th>
                    <th>Vencimiento</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.concept}</strong></td>
                      <td>{item.athlete ?? 'Cuenta General Academia'}</td>
                      <td><b>${item.amount.toLocaleString('es-MX')}</b></td>
                      <td>{item.due_date ?? 'Inmediato'}</td>
                      <td>
                        <span
                          className={`status-pill ${
                            item.status === 'paid'
                              ? 'success'
                              : item.status === 'overdue'
                              ? 'danger'
                              : 'warning'
                          }`}
                        >
                          {item.status === 'paid' ? 'Pagado' : item.status === 'overdue' ? 'Vencido' : item.status === 'cancelled' ? 'Cancelado' : 'Pendiente'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {['pending', 'overdue'].includes(item.status) && (
                            <>
                              <button
                                className="primary-button small"
                                onClick={() => markPaid(item.id)}
                                title="Liquidar y marcar como pagado"
                              >
                                <Check size={13} /> Cobrar
                              </button>
                              <button className="secondary-button small" onClick={() => void recordInstallment(item.id, item.amount)}>Abonar</button>
                              <button
                                className="whatsapp-button small"
                                onClick={() => sendWhatsAppReminder(item)}
                                title="Enviar recordatorio por WhatsApp"
                              >
                                <MessageCircle size={13} /> Cobro WA
                              </button>
                            </>
                          )}
                          <button
                            className="secondary-button small"
                            onClick={() => setPrintingPayment(item)}
                            title="Imprimir Recibo Oficial en PDF"
                          >
                            <Printer size={13} /> Recibo PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!payments.length && (
                    <tr>
                      <td colSpan={6} className="empty-state">No hay registros de pago en el sistema.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* TAB 2: EGRESOS OPERATIVOS */}
      {activeTab === 'egresos' && (
        <>
          <form className="panel live-create-form" onSubmit={createExpense}>
            <div>
              <p className="eyebrow">Control de Gastos</p>
              <h2>Registrar Egreso Operativo</h2>
            </div>
            <input
              required
              placeholder="Concepto del gasto (ej. Renta, Mantenimiento, Nómina)"
              value={expenseForm.concept}
              onChange={(e) => setExpenseForm({ ...expenseForm, concept: e.target.value })}
            />
            <select
              value={expenseForm.category}
              onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
            >
              <option value="Instalaciones">Renta e Instalaciones</option>
              <option value="Mantenimiento">Mantenimiento y Equipo</option>
              <option value="Nómina">Nómina y Honorarios Coaches</option>
              <option value="Vestuario">Vestuario y Proveedores</option>
              <option value="Viáticos">Viáticos y Competencias</option>
              <option value="Servicios">Servicios Generales</option>
            </select>
            <input
              required
              type="number"
              min="1"
              placeholder="Monto ($)"
              value={expenseForm.amount}
              onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
            />
            <input
              placeholder="Proveedor o beneficiario"
              value={expenseForm.vendor}
              onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })}
            />
            <button className="primary-button">
              <Plus size={16} /> Guardar Egreso
            </button>
          </form>

          <div className="panel table-panel">
            <div className="table-toolbar">
              <div>
                <h2>Libro Diario de Egresos</h2>
                <p>Gastos operativos, nómina de entrenadores y pagos a proveedores.</p>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Concepto</th>
                    <th>Categoría</th>
                    <th>Proveedor / Beneficiario</th>
                    <th>Monto</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <td>{e.incurred_on}</td>
                      <td><strong>{e.concept}</strong></td>
                      <td><span className="category-pill">{e.category}</span></td>
                      <td>{e.vendor ?? 'General'}</td>
                      <td><b style={{ color: '#cd5d49' }}>-${e.amount.toLocaleString('es-MX')}</b></td>
                      <td>
                        <button
                          className="icon-button"
                          onClick={() => deleteExpense(e.id)}
                          title="Eliminar gasto"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!expenses.length && (
                    <tr>
                      <td colSpan={6} className="empty-state">No hay egresos registrados este mes.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* TAB 3: ESTADO DE FLUJO DE EFECTIVO */}
      {activeTab === 'flujo' && (
        <div className="split-grid">
          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Estado financiero consolidado</p>
                <h2>Balance de {periodLabel}</h2>
              </div>
            </div>

            <div className="detail-rows" style={{ marginTop: '16px' }}>
              <div className="detail-row">
                <span>(+) Cobros realmente pagados en el periodo:</span>
                <strong style={{ color: '#2c8979', fontSize: '15px' }}>
                  +${totalIncomePaid.toLocaleString('es-MX')} MXN
                </strong>
              </div>
              <div className="detail-row">
                <span>(-) Egresos con fecha en el periodo:</span>
                <strong style={{ color: '#cd5d49', fontSize: '15px' }}>
                  -${totalExpenses.toLocaleString('es-MX')} MXN
                </strong>
              </div>
              <hr style={{ margin: '14px 0', borderColor: '#f0edf1' }} />
              <div className="detail-row">
                <span style={{ fontWeight: 'bold' }}>(=) Flujo neto de efectivo:</span>
                <strong style={{ fontSize: '18px', color: netCashFlow >= 0 ? '#2c8979' : '#cd5d49' }}>
                  ${netCashFlow.toLocaleString('es-MX')} MXN
                </strong>
              </div>
              <div className="detail-row">
                <span>Cuentas pendientes/vencidas (informativo, no se suma al flujo):</span>
                <span style={{ color: '#af7d05' }}>${totalReceivable.toLocaleString('es-MX')} MXN</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Desglose</p>
                <h2>Egresos por Categoría</h2>
              </div>
            </div>

            <div className="skill-list" style={{ marginTop: '16px' }}>
              {Array.from(new Set(expensesThisPeriod.map((e) => e.category))).map((cat) => {
                const totalCat = expensesThisPeriod.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0)
                const pct = totalExpenses > 0 ? Math.round((totalCat / totalExpenses) * 100) : 0
                return (
                  <div className="skill-row" key={cat}>
                    <span>{cat}</span>
                    <div><i style={{ width: `${pct}%`, background: '#ee755e' }} /></div>
                    <b>${totalCat.toLocaleString('es-MX')} ({pct}%)</b>
                  </div>
                )
              })}
              {!expensesThisPeriod.length && <p className="empty-state">No hay egresos en este periodo.</p>}
            </div>
          </div>
        </div>
      )}

      {/* PRINT RECEIPT MODAL */}
      {printingPayment && (
        <div className="print-modal-overlay">
          <div className="print-modal-box">
            <div className="print-modal-controls no-print">
              <span>Recibo Oficial de Pago</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="primary-button" onClick={() => window.print()}>
                  <Printer size={15} /> Imprimir / Guardar en PDF
                </button>
                <button className="secondary-button" onClick={() => setPrintingPayment(null)}>
                  Cerrar
                </button>
              </div>
            </div>

            <div className="official-document-sheet receipt-sheet">
              <div className="doc-sheet-header">
                <img src="/stars-royalty-logo.webp" alt="Stars Royalty" className="doc-logo" />
                <div className="doc-title-box">
                  <h1>STARS ROYALTY</h1>
                  <h2>ACADEMIA DE CHEERLEADING Y GIMNASIA</h2>
                  <p>COMPROBANTE OFICIAL DE COBRANZA Y RECIBO DE PAGO</p>
                </div>
                <div className="doc-folio">
                  <span>RECIBO DE CAJA</span>
                  <strong>REC-{String(printingPayment.id).padStart(6, '0')}</strong>
                  <small>Fecha: {new Date().toLocaleDateString('es-MX')}</small>
                </div>
              </div>

              <hr className="doc-divider" />

              <div className="doc-info-grid">
                <div><span>Atleta:</span> <strong>{printingPayment.athlete ?? 'Cuenta General'}</strong></div>
                <div><span>Tutor / Contacto:</span> <strong>{printingPayment.guardian_name || 'Familia'}</strong></div>
                <div><span>Método de pago:</span> <strong>{printingPayment.payment_method || 'Caja / Transferencia'}</strong></div>
                <div><span>Estatus de pago:</span> <strong>{printingPayment.status === 'paid' ? 'Liquidado' : 'Pendiente'}</strong></div>
              </div>

              <table className="doc-table" style={{ marginTop: '20px' }}>
                <thead>
                  <tr>
                    <th>Concepto de Cobro</th>
                    <th>Vencimiento</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>{printingPayment.concept}</strong></td>
                    <td>{printingPayment.due_date ?? 'Inmediato'}</td>
                    <td><b>${printingPayment.amount.toLocaleString('es-MX')} MXN</b></td>
                  </tr>
                </tbody>
              </table>

              <div className="receipt-total-bar">
                <span>ESTADO: <b>{printingPayment.status === 'paid' ? 'PAGADO Y CONFIRMADO' : 'POR COBRAR'}</b></span>
                <div>
                  <span>TOTAL:</span>
                  <strong>${printingPayment.amount.toLocaleString('es-MX')} MXN</strong>
                </div>
              </div>

              <div className="doc-signatures" style={{ marginTop: '50px' }}>
                <div className="sig-block">
                  <div className="sig-line" />
                  <strong>Caja y Administración Stars Royalty</strong>
                  <span>Firma Autorizada</span>
                </div>
                <div className="sig-block">
                  <div className="sig-line" />
                  <strong>Firma del Cliente / Tutor</strong>
                  <span>Conformidad</span>
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
// MODULE 10: INVENTORY & DIRECT SALES VIEW
// --------------------------------------------------------------------------
export function LiveInventoryView({ notify }: { notify: Notify }) {
  const [products, setProducts] = useState<Product[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [showSaleModal, setShowSaleModal] = useState<Product | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [stockProduct, setStockProduct] = useState<Product | null>(null)
  const [stockEntryQty, setStockEntryQty] = useState('1')
  const [stockEntryReason, setStockEntryReason] = useState('Reabastecimiento de almacén')
  const [showCatalogAdmin, setShowCatalogAdmin] = useState(false)
  const [saleQty, setSaleQty] = useState(1)
  const [saleAthleteId, setSaleAthleteId] = useState('')
  const [saleChargeAccount, setSaleChargeAccount] = useState(true)
  const [saleIsPaid, setSaleIsPaid] = useState(true)

  const [form, setForm] = useState({
    sku: '',
    name: '',
    category: 'Uniformes',
    size: 'M',
    color: 'Royal Purple',
    price: '',
    cost: '',
    stock: '',
    minStock: '3'
  })

  const load = useCallback(() => Promise.all([
        request<Product[]>('/api/products'),
        request<Athlete[]>('/api/athletes')
      ]).then(([prods, aths]) => {
      setProducts(prods)
      setAthletes(aths)
    }).catch((err:unknown) => {
      notify(err instanceof Error ? err.message : 'Error al cargar inventario')
    }), [notify])

  useEffect(() => {
    void load()
  }, [load])

  const createProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.sku || !form.name || !form.price) return notify('Completa los datos obligatorios del producto')
    try {
      await request('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          sku: form.sku,
          name: form.name,
          category: form.category,
          size: form.size,
          color: form.color,
          cost: Number(form.cost || Number(form.price) * 0.5),
          price: Number(form.price),
          stock: Number(form.stock || 0),
          minStock: Number(form.minStock || 3)
        })
      })
      setForm({
        sku: '',
        name: '',
        category: 'Uniformes',
        size: 'M',
        color: 'Royal Purple',
        price: '',
        cost: '',
        stock: '',
        minStock: '3'
      })
      notify('Producto registrado en el inventario')
      load()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al guardar producto')
    }
  }

  const movement = async (id: number, kind: 'entry' | 'exit', qty = 1) => {
    try {
      await request(`/api/products/${id}/movements`, {
        method: 'POST',
        body: JSON.stringify({
          kind,
          quantity: qty,
          reason: kind === 'entry' ? 'Reabastecimiento de almacén' : 'Ajuste de inventario'
        })
      })
      notify(kind === 'entry' ? 'Existencias agregadas (+1)' : 'Existencias descontadas (-1)')
      load()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al actualizar existencias')
    }
  }

  const handleDirectSale = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!showSaleModal) return
    try {
      const res = await request<{ ok: boolean; total: number; paymentId?: number }>('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          productId: showSaleModal.id,
          athleteId: saleAthleteId ? Number(saleAthleteId) : undefined,
          quantity: Number(saleQty),
          createCharge: saleChargeAccount,
          isPaid: saleIsPaid,
          paymentMethod: 'Caja Mostrador'
        })
      })
      notify(`Venta completada por $${res.total.toLocaleString('es-MX')}${res.paymentId ? ' (añadida a cobranza)' : ''}`)
      setShowSaleModal(null)
      setSaleQty(1)
      setSaleAthleteId('')
      load()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al procesar venta')
    }
  }

  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProduct) return
    try {
      await request(`/api/products/${editingProduct.id}`, { method: 'PATCH', body: JSON.stringify({ sku: editingProduct.sku, name: editingProduct.name, category: editingProduct.category || null, size: editingProduct.size || null, color: editingProduct.color || null, cost: Number(editingProduct.cost), price: Number(editingProduct.price), minStock: Number(editingProduct.min_stock) }) })
      notify('Producto actualizado correctamente'); setEditingProduct(null); load()
    } catch (err) { notify(err instanceof Error ? err.message : 'No fue posible actualizar el producto') }
  }

  const toggleProduct = async (product: Product) => {
    try { await request(`/api/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ active: !(product.active !== 0) }) }); notify(product.active !== 0 ? 'Producto archivado: ya no estará disponible para venta' : 'Producto activado para venta'); load() }
    catch (err) { notify(err instanceof Error ? err.message : 'No fue posible actualizar el producto') }
  }

  const addStock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stockProduct) return
    const quantity = Number(stockEntryQty)
    if (!Number.isInteger(quantity) || quantity < 1) return notify('Indica una cantidad válida para ingresar')
    try {
      await request(`/api/products/${stockProduct.id}/movements`, { method: 'POST', body: JSON.stringify({ kind: 'entry', quantity, reason: stockEntryReason || 'Reabastecimiento de almacén' }) })
      notify(`${quantity} unidades agregadas a ${stockProduct.name}`)
      setStockProduct(null); setStockEntryQty('1'); setStockEntryReason('Reabastecimiento de almacén'); load()
    } catch (err) { notify(err instanceof Error ? err.message : 'No fue posible agregar existencias') }
  }

  const totalInventoryUnits = products.reduce((sum, p) => sum + p.stock, 0)
  const totalInventoryValue = products.reduce((sum, p) => sum + p.stock * p.price, 0)
  const lowStockCount = products.filter((p) => p.stock <= p.min_stock).length

  return (
    <>
      {/* Inventory Stats */}
      <section className="module-stats">
        <div className="stat-card purple">
          <span>Artículos en Catálogo</span>
          <strong>{products.length}</strong>
          <small><Package size={12} /> Productos dados de alta</small>
        </div>
        <div className="stat-card mint">
          <span>Existencias Físicas</span>
          <strong>{totalInventoryUnits} pzs</strong>
          <small>Unidades en almacén</small>
        </div>
        <div className="stat-card coral">
          <span>Alerta de Stock Bajo</span>
          <strong>{lowStockCount}</strong>
          <small>{lowStockCount > 0 ? 'Reponer existencias' : 'Inventario óptimo'}</small>
        </div>
        <div className="stat-card yellow">
          <span>Valor de Inventario</span>
          <strong>${totalInventoryValue.toLocaleString('es-MX')}</strong>
          <small>Precio venta estimado</small>
        </div>
      </section>

      {/* New Product Form */}
      <form className="panel live-create-form" onSubmit={createProduct}>
        <div>
          <p className="eyebrow">Catálogo Pro Shop</p>
          <h2>Nuevo Producto o Prenda</h2>
        </div>
        <input
          required
          placeholder="SKU (ej. SR-UNI26)"
          value={form.sku}
          onChange={(e) => setForm({ ...form, sku: e.target.value })}
        />
        <input
          required
          placeholder="Nombre del artículo"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          <option value="Uniformes">Uniformes Oficiales</option>
          <option value="Calzado">Calzado y Tenis</option>
          <option value="Accesorios">Moños y Accesorios</option>
          <option value="Ropa Deportiva">Ropa Deportiva de Práctica</option>
          <option value="Souvenirs">Souvenirs y Botellas</option>
        </select>
        <input
          required
          type="number"
          min="0"
          placeholder="Precio Venta ($)"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
        />
        <input
          required
          type="number"
          min="0"
          placeholder="Existencias iniciales"
          value={form.stock}
          onChange={(e) => setForm({ ...form, stock: e.target.value })}
        />
        <button className="primary-button">
          <Plus size={16} /> Guardar Producto
        </button>
      </form>

      {/* Products Grid with Stock Indicators & Direct Sale */}
      <div className="panel table-panel">
        <div className="table-toolbar">
          <div>
            <h2>Inventario en Almacén y Venta en Mostrador</h2>
            <p>Vende productos directamente a atletas con cargo automático a su expediente.</p>
          </div>
          <button className="secondary-button" onClick={() => setShowCatalogAdmin((current) => !current)}><Edit3 size={15} /> {showCatalogAdmin ? 'Cerrar administración' : 'Administrar catálogo'}</button>
        </div>

        <div className="product-grid">
          {products.map((p) => {
            const isLow = p.stock <= p.min_stock
            const isActive = p.active !== 0
            return (
              <div className={`product-card ${isLow ? 'low-stock-card' : ''} ${!isActive ? 'product-inactive' : ''}`} key={p.id}>
                <div className="product-thumb">
                  <Package size={26} />
                </div>
                <div>
                  <span className="product-cat-pill">{isActive ? (p.category ?? 'General') : 'Archivado'}</span>
                  <strong>{p.name}</strong>
                  <small>
                    ${p.price.toLocaleString('es-MX')} •{' '}
                    <b className={isLow ? 'low-stock' : ''}>
                      {p.stock} piezas {isLow && '(Stock bajo)'}
                    </b>
                  </small>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <button
                    className="primary-button small"
                    onClick={() => setShowSaleModal(p)}
                    title="Venta mostrador a atleta"
                    disabled={!isActive || p.stock < 1}
                  >
                    <ShoppingCart size={13} /> Vender
                  </button>
                  <button
                    className="more-button"
                    onClick={() => movement(p.id, 'entry')}
                    title="Agregar 1 unidad al stock"
                  >
                    <RefreshCw size={13} /> +1
                  </button>
                  <button className="more-button" onClick={() => setEditingProduct({ ...p })} title="Editar producto"><Edit3 size={13} /></button>
                  <button className="text-button" onClick={() => void toggleProduct(p)}>{isActive ? 'Archivar' : 'Activar'}</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showCatalogAdmin && <div className="panel table-panel" style={{ marginTop: '14px' }}>
        <div className="table-toolbar"><div><p className="eyebrow">Mantenimiento de productos</p><h2>Administración del catálogo</h2><p>Edita precios, datos de producto, mínimos de inventario y controla si está disponible para venta.</p></div></div>
        <div className="table-scroll"><table><thead><tr><th>SKU</th><th>Producto</th><th>Precio / Costo</th><th>Stock</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td>{product.sku}</td><td><strong>{product.name}</strong><small style={{ display: 'block' }}>{product.category ?? 'General'} · {product.size ?? 'Sin talla'} · {product.color ?? 'Sin color'}</small></td><td>${product.price.toLocaleString('es-MX')}<small style={{ display: 'block' }}>Costo: ${product.cost.toLocaleString('es-MX')}</small></td><td><b>{product.stock}</b><small style={{ display: 'block' }}>Mínimo: {product.min_stock}</small></td><td><span className={`status-pill ${product.active !== 0 ? 'success' : 'neutral'}`}>{product.active !== 0 ? 'Disponible' : 'Archivado'}</span></td><td><button className="text-button" onClick={() => { setStockProduct(product); setStockEntryQty('1'); setStockEntryReason('Reabastecimiento de almacén') }}>Agregar stock</button> <button className="text-button" onClick={() => setEditingProduct({ ...product })}>Editar</button> <button className="text-button" onClick={() => void toggleProduct(product)}>{product.active !== 0 ? 'Archivar' : 'Activar'}</button></td></tr>)}</tbody></table></div>
      </div>}

      {stockProduct && <div className="modal-backdrop" onClick={() => setStockProduct(null)}><form className="modal athlete-modal" onSubmit={addStock} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header"><div><p className="eyebrow">Movimiento de almacén</p><h2>Agregar existencias</h2></div><button type="button" className="icon-button" onClick={() => setStockProduct(null)}><X size={18} /></button></div>
        <div className="detail-rows" style={{ margin: '14px 0' }}><div className="detail-row"><span>Producto:</span><strong>{stockProduct.name}</strong></div><div className="detail-row"><span>Stock actual:</span><strong>{stockProduct.stock} unidades</strong></div></div>
        <label>Cantidad a ingresar<input required autoFocus type="number" min="1" step="1" value={stockEntryQty} onChange={(event) => setStockEntryQty(event.target.value)} /></label>
        <label>Motivo del movimiento<input value={stockEntryReason} onChange={(event) => setStockEntryReason(event.target.value)} placeholder="Ej. compra a proveedor o ajuste de conteo" /></label>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setStockProduct(null)}>Cancelar</button><button className="primary-button"><Plus size={16} /> Registrar entrada</button></div>
      </form></div>}

      {editingProduct && <div className="modal-backdrop" onClick={() => setEditingProduct(null)}><form className="modal athlete-modal" onSubmit={saveProduct} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header"><div><p className="eyebrow">Administración de catálogo</p><h2>Editar producto</h2></div><button type="button" className="icon-button" onClick={() => setEditingProduct(null)}><X size={18} /></button></div>
        <div className="form-grid"><label>SKU<input required value={editingProduct.sku} onChange={(event) => setEditingProduct({ ...editingProduct, sku: event.target.value })} /></label><label>Nombre<input required value={editingProduct.name} onChange={(event) => setEditingProduct({ ...editingProduct, name: event.target.value })} /></label><label>Categoría<input value={editingProduct.category ?? ''} onChange={(event) => setEditingProduct({ ...editingProduct, category: event.target.value })} /></label><label>Talla<input value={editingProduct.size ?? ''} onChange={(event) => setEditingProduct({ ...editingProduct, size: event.target.value })} /></label><label>Color<input value={editingProduct.color ?? ''} onChange={(event) => setEditingProduct({ ...editingProduct, color: event.target.value })} /></label><label>Costo<input required type="number" min="0" value={editingProduct.cost} onChange={(event) => setEditingProduct({ ...editingProduct, cost: Number(event.target.value) })} /></label><label>Precio de venta<input required type="number" min="0" value={editingProduct.price} onChange={(event) => setEditingProduct({ ...editingProduct, price: Number(event.target.value) })} /></label><label>Stock mínimo<input required type="number" min="0" value={editingProduct.min_stock} onChange={(event) => setEditingProduct({ ...editingProduct, min_stock: Number(event.target.value) })} /></label></div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditingProduct(null)}>Cancelar</button><button className="primary-button"><Check size={16} /> Guardar producto</button></div>
      </form></div>}

      {/* DIRECT SALE MODAL */}
      {showSaleModal && (
        <div className="modal-backdrop" onClick={() => setShowSaleModal(null)}>
          <form
            className="modal athlete-modal"
            onSubmit={handleDirectSale}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Punto de Venta Stars Royalty</p>
                <h2>Venta Directa: {showSaleModal.name}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowSaleModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="detail-rows" style={{ margin: '14px 0' }}>
              <div className="detail-row"><span>Precio Unitario:</span><strong>${showSaleModal.price.toLocaleString('es-MX')} MXN</strong></div>
              <div className="detail-row"><span>Existencias disponibles:</span><strong>{showSaleModal.stock} unidades</strong></div>
            </div>

            <div className="form-grid">
              <label>
                Cantidad
                <input
                  required
                  type="number"
                  min="1"
                  max={showSaleModal.stock}
                  value={saleQty}
                  onChange={(e) => setSaleQty(Math.max(1, Number(e.target.value)))}
                />
              </label>

              <label>
                Vender a Atleta (opcional)
                <select value={saleAthleteId} onChange={(e) => setSaleAthleteId(e.target.value)}>
                  <option value="">Venta mostrador a público</option>
                  {athletes.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
            </div>

            {saleAthleteId && (
              <>
                <label className="privacy-toggle" style={{ marginTop: '12px' }}>
                  <input
                    type="checkbox"
                    checked={saleChargeAccount}
                    onChange={(e) => setSaleChargeAccount(e.target.checked)}
                  />
                  <span>
                    <strong>Generar cargo en el expediente del atleta</strong>
                    <small>Añade el movimiento automáticamente a cobranza.</small>
                  </span>
                </label>
                {saleChargeAccount && (
                  <label className="privacy-toggle" style={{ marginTop: '8px' }}>
                    <input
                      type="checkbox"
                      checked={saleIsPaid}
                      onChange={(e) => setSaleIsPaid(e.target.checked)}
                    />
                    <span>
                      <strong>Cobrado en este momento (liquidado)</strong>
                      <small>Si se desmarca, quedará como saldo pendiente de pago.</small>
                    </span>
                  </label>
                )}
              </>
            )}

            <div className="detail-row" style={{ marginTop: '16px', fontSize: '15px' }}>
              <span>Total a Pagar:</span>
              <strong style={{ color: '#85109d' }}>
                ${(showSaleModal.price * saleQty).toLocaleString('es-MX')} MXN
              </strong>
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowSaleModal(null)}>
                Cancelar
              </button>
              <button className="primary-button">
                <ShoppingCart size={16} /> Confirmar Venta
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
