import { API_BASE, request as apiRequest, hasPermission } from './api'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity, ArrowUpRight, BarChart3, Bell, Building2, CalendarDays, Check,
  ChevronDown, ClipboardCheck, CreditCard, DollarSign, Dumbbell, FileText,
  LayoutDashboard, LogOut, Menu, MessageCircle, Moon, Package, Plus, QrCode,
  Search, Settings, Shirt, ShieldCheck, Trophy, UserCheck, UserPlus, Users,
  Sun, UsersRound, X
} from 'lucide-react'
import './App.css'
import './visual-refinements.css'
const LiveAttendanceView = lazy(() => import('./LiveModules').then(module => ({ default: module.LiveAttendanceView })))
const LivePerformanceView = lazy(() => import('./LiveModules').then(module => ({ default: module.LivePerformanceView })))
const LiveCalendarView = lazy(() => import('./LiveOperations').then(module => ({ default: module.LiveCalendarView })))
const LiveCompetitionsView = lazy(() => import('./LiveOperations').then(module => ({ default: module.LiveCompetitionsView })))
const LiveBillingView = lazy(() => import('./LiveAdminModules').then(module => ({ default: module.LiveBillingView })))
const LiveInventoryView = lazy(() => import('./LiveAdminModules').then(module => ({ default: module.LiveInventoryView })))
const LiveCommunicationsView = lazy(() => import('./LivePeopleModules').then(module => ({ default: module.LiveCommunicationsView })))
const LiveCredentialsView = lazy(() => import('./LivePeopleModules').then(module => ({ default: module.LiveCredentialsView })))
const LiveWardrobeView = lazy(() => import('./WardrobeView').then(module => ({ default: module.WardrobeView })))
const LiveFamilyView = lazy(() => import('./LiveReports').then(module => ({ default: module.LiveFamilyView })))
const LiveReportsView = lazy(() => import('./LiveReports').then(module => ({ default: module.LiveReportsView })))
const LiveAthletesView = lazy(() => import('./LiveAthletes').then(module => ({ default: module.LiveAthletesView })))
const LiveCategoriesView = lazy(() => import('./LiveCategories').then(module => ({ default: module.LiveCategoriesView })))
const LiveTeamsView = lazy(() => import('./LiveTeamsFunctional').then(module => ({ default: module.LiveTeamsFunctionalView })))
import { printReportSummary } from './printCredential'
import { daysUntil } from './dateUtils'
import { ActionForm } from './uiShared'
const OperationsCenter = lazy(() => import('./OperationsCenter').then(module => ({ default: module.OperationsCenter })))
import { Modal } from './Modal'
import { useAcademy } from './academy'
import { GlobalSearch } from './GlobalSearch'

export type Module =
  | 'Centro operativo'
  | 'Resumen'
  | 'Atletas'
  | 'Rendimiento'
  | 'Asistencia'
  | 'Calendario'
  | 'Cobranza'
  | 'Inventario'
  | 'Competencias'
  | 'Comunicados'
  | 'Categorías'
  | 'Equipos'
  | 'Vestuario'
  | 'Credenciales'
  | 'Reportes'
  | 'Portal familiar'
  | 'Configuración'

type NavItem = { label: Module; icon: typeof LayoutDashboard }
type DashboardData = {
  athletes: number
  teams: number
  pendingPayments: number
  lowStock: number
  activeInjuries?: number
  monthlyIncome?: number
  monthlyExpense?: number
  attendanceRate?: number | null
  performance?: {
    average: number | null
    technique: number | null
    flexibility: number | null
    strength: number | null
    history: Array<{ date: string; score: number }>
  }
  upcomingEvents?: Array<{ id: number; title: string; type: string; location: string | null; starts_at: string; ends_at: string | null; cost: number }>
  attendanceByTeam?: Array<{ id: number; name: string; rate: number; records: number }>
  nextCompetition?: { id: number; title: string; location: string | null; starts_at: string; ends_at: string | null; cost: number; teamCount: number } | null
}
export type Session = { token: string; user: { id: number; name: string; email: string; role: string; photo_data?: string | null; permissions?: string[] } }

function readSession(): Session | null {
  try {
    const saved = localStorage.getItem('stars-session')
    return saved ? JSON.parse(saved) as Session : null
  } catch {
    localStorage.removeItem('stars-session')
    return null
  }
}

function UserAvatar({ name, photo, className }: { name: string; photo?: string | null; className: string }) {
  const initials = name.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2)
  return <div className={`avatar ${className}`} aria-label={`Foto de ${name}`}>{photo ? <img src={photo} alt={`Foto de ${name}`} /> : initials}</div>
}

const ROLE_PERMISSIONS: Record<string, Module[]> = {
  'Administrador general': [
    'Resumen', 'Atletas', 'Rendimiento', 'Asistencia', 'Calendario',
    'Cobranza', 'Inventario', 'Competencias', 'Comunicados',
    'Categorías', 'Equipos', 'Vestuario', 'Credenciales', 'Reportes',
    'Configuración'
  ],
  'Administradora general': [
    'Resumen', 'Atletas', 'Rendimiento', 'Asistencia', 'Calendario',
    'Cobranza', 'Inventario', 'Competencias', 'Comunicados',
    'Categorías', 'Equipos', 'Vestuario', 'Credenciales', 'Reportes',
    'Configuración'
  ],
  'Head Coach': [
    'Resumen', 'Atletas', 'Rendimiento', 'Asistencia', 'Calendario',
    'Competencias', 'Categorías', 'Equipos', 'Comunicados',
    'Vestuario'
  ],
  'Coach': [
    'Resumen', 'Atletas', 'Rendimiento', 'Asistencia', 'Calendario',
    'Competencias', 'Equipos', 'Comunicados'
  ],
  'Finanzas / caja': [
    'Resumen', 'Cobranza', 'Inventario', 'Reportes', 'Comunicados'
  ],
  'Padres y tutores': [
    'Portal familiar'
  ]
}

const SCOPE_MODULES: Record<string, Module[]> = {
  staff: ['Centro operativo', 'Resumen', 'Calendario', 'Comunicados', 'Credenciales'],
  coaching: ['Resumen', 'Atletas', 'Rendimiento', 'Asistencia', 'Calendario', 'Competencias', 'Equipos', 'Vestuario', 'Comunicados'],
  sportsLead: ['Categorías', 'Equipos', 'Rendimiento'],
  finance: ['Resumen', 'Cobranza', 'Reportes', 'Comunicados'],
  inventory: ['Resumen', 'Inventario'],
  admin: ['Resumen', 'Atletas', 'Rendimiento', 'Asistencia', 'Calendario', 'Cobranza', 'Inventario', 'Competencias', 'Comunicados', 'Categorías', 'Equipos', 'Vestuario', 'Credenciales', 'Reportes', 'Configuración']
}

function modulesForUser(role: string, permissions?: string[]) {
  if (role === 'Padres y tutores') return ['Portal familiar'] as Module[]
  if (!permissions) return ROLE_PERMISSIONS[role] ?? []
  return [...new Set(permissions.flatMap((scope) => SCOPE_MODULES[scope] ?? []))]
}

const ALL_NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Espacio de trabajo',
    items: [
      { label: 'Resumen', icon: LayoutDashboard },
      { label: 'Centro operativo', icon: ClipboardCheck },
      { label: 'Atletas', icon: Users },
      { label: 'Rendimiento', icon: Activity },
      { label: 'Asistencia', icon: ClipboardCheck },
      { label: 'Calendario', icon: CalendarDays }
    ]
  },
  {
    label: 'Administración',
    items: [
      { label: 'Cobranza', icon: DollarSign },
      { label: 'Inventario', icon: Package },
      { label: 'Competencias', icon: Trophy },
      { label: 'Comunicados', icon: MessageCircle }
    ]
  },
  {
    label: 'Operación y acceso',
    items: [
      { label: 'Categorías', icon: Dumbbell },
      { label: 'Equipos', icon: UsersRound },
      { label: 'Vestuario', icon: Shirt },
      { label: 'Credenciales', icon: QrCode },
      { label: 'Reportes', icon: BarChart3 },
      { label: 'Portal familiar', icon: CreditCard }
    ]
  }
]

const DEMO_ROLES = [
  'Administrador general',
  'Head Coach',
  'Coach',
  'Finanzas / caja',
  'Padres y tutores'
]


function App() {
  const [requestedActive, setActive] = useState<Module>('Resumen')
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [athleteFocus,setAthleteFocus]=useState<{id:number;key:string}|null>(null)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(false)
  const [showRoleDropdown, setShowRoleDropdown] = useState(false)
  const [toast, setToast] = useState('')
  const [privacyMode, setPrivacyMode] = useState(() => localStorage.getItem('stars-privacy') === 'true')
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('stars-theme') === 'dark')
  const [summary, setSummary] = useState<DashboardData | null>(null)
  const [session, setSession] = useState<Session | null>(readSession)
  const [checkingSession, setCheckingSession] = useState(() => Boolean(readSession()))

  useEffect(() => {
    localStorage.setItem('stars-privacy', String(privacyMode))
  }, [privacyMode])

  useEffect(() => {
    localStorage.setItem('stars-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    const expireSession = () => {
      localStorage.removeItem('stars-session')
      setSession(null)
      setCheckingSession(false)
      setToast('Tu sesión venció. Inicia sesión nuevamente.')
    }
    window.addEventListener('stars-session-expired', expireSession)
    return () => window.removeEventListener('stars-session-expired', expireSession)
  }, [])

  useEffect(() => {
    if (!checkingSession || !session) return
    apiRequest<Session['user']>('/api/auth/me')
      .then((user) => {
        const refreshed = { ...session, user }
        localStorage.setItem('stars-session', JSON.stringify(refreshed))
        setSession(refreshed)
        setCheckingSession(false)
      })
      .catch(() => {
        localStorage.removeItem('stars-session')
        setSession(null)
        setCheckingSession(false)
      })
  }, [checkingSession, session])

  useEffect(() => {
    const roleCanViewDashboard = session ? modulesForUser(session.user.role, session.user.permissions).includes('Resumen') : false
    if (session && !checkingSession && roleCanViewDashboard) {
      apiRequest<DashboardData>('/api/dashboard')
        .then((data) => data && setSummary(data))
        .catch(() => undefined)
    }
  }, [checkingSession, session])

  useEffect(() => {
    if (!session || !modulesForUser(session.user.role, session.user.permissions).includes('Resumen')) return
    const refresh = () => { void apiRequest<DashboardData>('/api/dashboard').then(setSummary).catch(() => undefined) }
    window.addEventListener('stars-data-changed', refresh)
    return () => window.removeEventListener('stars-data-changed', refresh)
  }, [session])

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 4000)
  }, [])

  const navigate = (module: Module) => {
    if (!session || !modulesForUser(session.user.role, session.user.permissions).includes(module)) { notify('Tu cuenta no tiene acceso a este módulo.'); return }
    setActive(module)
    window.scrollTo({ top: 0, behavior: 'instant' })
    setMenuOpen(false)
    setShowQuickActions(false)
    setShowNotifications(false)
    setShowRoleDropdown(false)
  }

  const currentRole = session?.user.role ?? 'Administrador general'
  const canSwitchRole = import.meta.env.DEV && session?.user.permissions?.includes('admin')
  const allowedModules = useMemo(() => {
    return modulesForUser(currentRole, session?.user.permissions)
  }, [currentRole, session?.user.permissions])
  const active = allowedModules.includes(requestedActive) ? requestedActive : allowedModules[0] ?? 'Resumen'

  // Filter navigation items by role permissions
  const filteredNavGroups = useMemo(() => {
    return ALL_NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => allowedModules.includes(item.label))
    })).filter((group) => group.items.length > 0)
  }, [allowedModules])

  // Fast Role Switcher
  const switchRole = async (targetRole: string) => {
    setShowRoleDropdown(false)
    try {
      const res = await apiRequest<{ token: string; user: Session['user'] }>('/api/auth/switch-role', {
        method: 'POST',
        body: JSON.stringify({ targetRole })
      })
      localStorage.setItem('stars-session', JSON.stringify(res))
      setSession(res)
      notify(`Rol cambiado a: ${res.user.role} (${res.user.name})`)
      const nextAllowed = modulesForUser(res.user.role, res.user.permissions)
      if (!nextAllowed.includes(active)) {
        setActive(nextAllowed[0] ?? 'Resumen')
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al cambiar rol')
    }
  }

  const logout = () => {
    localStorage.removeItem('stars-session')
    setSession(null)
    setSummary(null)
  }

  if (checkingSession) {
    return <div className="login-shell"><div className="login-card"><p className="eyebrow">Stars Royalty</p><h1>Verificando sesión</h1><p>Un momento, por favor.</p></div></div>
  }

  if (!session) {
    return (
      <LoginScreen
        onLogin={(nextSession) => {
          setToast('')
          localStorage.setItem('stars-session', JSON.stringify(nextSession))
          setSession(nextSession)
          const nextAllowed = modulesForUser(nextSession.user.role, nextSession.user.permissions)
          if (!nextAllowed.includes(active)) {
            setActive(nextAllowed[0] ?? 'Resumen')
          }
        }}
      />
    )
  }

  if (!allowedModules.length) return <div className="login-shell"><div className="login-card"><h1>Cuenta sin módulos asignados</h1><p>Solicita a administración los permisos para tu puesto.</p><button onClick={logout}>Cerrar sesión</button></div></div>

  return (
    <div className={`app-shell ${darkMode ? 'dark-mode' : ''}`}>
      {/* SIDEBAR NAVIGATION */}
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <img src="/stars-royalty-logo.webp" alt="Stars Royalty" />
          <div>
            <strong>STARS ROYALTY</strong>
            <span>Performance platform</span>
          </div>
          <button
            className="icon-button mobile-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>

        <div className="academy-switcher" onClick={() => canSwitchRole && setShowRoleDropdown(!showRoleDropdown)} style={{ cursor: canSwitchRole ? 'pointer' : 'default' }}>
          <span className="academy-mark">SR</span>
          <div>
            <strong>Stars Royalty</strong>
            <small>{session.user.role}</small>
          </div>
          <ChevronDown size={15} />
        </div>

        <nav>
          {filteredNavGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map(({ label, icon: Icon }) => (
                <button
                  className={`nav-item ${active === label ? 'active' : ''}`}
                  aria-current={active === label ? 'page' : undefined}
                  key={label}
                  onClick={() => navigate(label)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  {label === 'Cobranza' && summary?.pendingPayments ? (
                    <b className="nav-badge">{summary.pendingPayments}</b>
                  ) : null}
                  {label === 'Inventario' && summary?.lowStock ? (
                    <b className="nav-badge" style={{ background: '#ee755e', color: '#fff' }}>
                      {summary.lowStock}
                    </b>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {allowedModules.includes('Configuración') && (
            <button
              className={`nav-item ${active === 'Configuración' ? 'active' : ''}`}
              onClick={() => navigate('Configuración')}
            >
              <Settings size={18} />
              <span>Configuración</span>
            </button>
          )}

          <div className="help-card" onClick={() => notify('Stars Royalty Platform v1.0 • Soporte activo')}>
            <ShieldCheck size={18} />
            <div>
              <strong>Centro de ayuda</strong>
              <span>Soporte y normativas</span>
            </div>
            <ArrowUpRight size={16} />
          </div>

          <div className="profile-row">
            <UserAvatar name={session.user.name} photo={session.user.photo_data} className="avatar-small" />
            <div>
              <strong>{session.user.name}</strong>
              <span>{session.user.role}</span>
            </div>
            <button className="logout-button" onClick={logout} title="Cerrar sesión">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="main-content">
        {/* TOPBAR */}
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="icon-button menu-toggle"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu size={21} />
            </button>
            <div className="breadcrumbs">
              <span>Stars Royalty</span>
              <b>/</b>
              <strong>{active}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            {/* Search Box */}
            <div className="search-box">
              <Search size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar atleta, equipo..."
                aria-label="Buscar"
                onKeyDown={event=>{if(event.key==='Escape')setSearch('')}}
              />
              {hasPermission('staff')&&<GlobalSearch query={search} onSelect={result=>{if(result.module==='Atletas')setAthleteFocus({id:result.id,key:crypto.randomUUID()});setSearch('');navigate(result.module)}}/>}
            </div>

            {/* Quick Role Switcher */}
            <div style={{ position: 'relative' }}>
              <button
                className="select-button"
                disabled={!canSwitchRole}
                onClick={() => canSwitchRole && setShowRoleDropdown(!showRoleDropdown)}
                style={{ background: '#f5ecf8', color: '#6f008f', fontWeight: 600, cursor: canSwitchRole ? 'pointer' : 'default' }}
                title={canSwitchRole ? 'Cambiar rol activo para pruebas de visualización' : 'Rol activo'}
              >
                <UserCheck size={14} />
                <span>{session.user.role}</span>
                <ChevronDown size={13} />
              </button>
              {canSwitchRole && showRoleDropdown && (
                <div className="popover" style={{ top: '38px', right: 0, width: '200px', padding: '6px' }}>
                  <p className="eyebrow" style={{ padding: '6px 8px 2px' }}>Cambiar Perfil (Demo)</p>
                  {DEMO_ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => switchRole(r)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: r === session.user.role ? '#f3e8f6' : 'transparent',
                        color: r === session.user.role ? '#6f008f' : '#4d4452',
                        borderRadius: '5px',
                        fontSize: '11px',
                        textAlign: 'left'
                      }}
                    >
                      <span>{r}</span>
                      {r === session.user.role && <Check size={14} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Notifications */}
            <button className="icon-button theme-toggle" onClick={() => setDarkMode((current) => !current)} aria-label={darkMode ? 'Activar modo claro' : 'Activar modo oscuro'} title={darkMode ? 'Modo claro' : 'Modo oscuro'}>
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="notification-wrap">
              <button
                className="icon-button"
                onClick={() => setShowNotifications(!showNotifications)}
                aria-label="Notificaciones"
              >
                <Bell size={19} />
                {(summary?.pendingPayments || summary?.lowStock) ? <i /> : null}
              </button>
              {showNotifications && (
                <div className="popover notification-popover">
                  <strong>Notificaciones del Sistema</strong>
                  <p>• {summary?.pendingPayments ?? 0} cuentas en cobranza requieren seguimiento.</p>
                  <p>• {summary?.lowStock ?? 0} productos en inventario con existencias bajo el mínimo.</p>
                  <p>• {summary?.nextCompetition ? `Próxima competencia: ${summary.nextCompetition.title}.` : 'No hay competencias próximas registradas.'}</p>
                </div>
              )}
            </div>

            {/* User Avatar */}
            <UserAvatar name={session.user.name} photo={session.user.photo_data} className="avatar-top" />
          </div>
        </header>

        {/* PAGE CONTENT */}
        <div className="page-content">
          <PageHeader
            active={active}
            onQuick={() => setShowQuickActions(!showQuickActions)}
            showQuickActions={showQuickActions}
            navigate={navigate}
          />

          {/* MODULE VIEWS ROUTER */}
          <Suspense fallback={<div className="ops-skeleton" role="status" aria-label="Cargando modulo"><span/><span/><span/></div>}>
          {active === 'Resumen' && <Dashboard navigate={navigate} summary={summary} />}
          {active === 'Centro operativo' && <OperationsCenter navigate={navigate} notify={notify} />}
          {active === 'Atletas' && <LiveAthletesView key={athleteFocus?.key??'directory'} initialAthleteId={athleteFocus?.id} query={search} notify={notify} />}
          {active === 'Rendimiento' && <LivePerformanceView notify={notify} />}
          {active === 'Asistencia' && <LiveAttendanceView notify={notify} />}
          {active === 'Calendario' && <LiveCalendarView notify={notify} />}
          {active === 'Cobranza' && <LiveBillingView notify={notify} />}
          {active === 'Inventario' && <LiveInventoryView notify={notify} />}
          {active === 'Competencias' && <LiveCompetitionsView notify={notify} />}
          {active === 'Comunicados' && <LiveCommunicationsView notify={notify} />}
          {active === 'Categorías' && <LiveCategoriesView notify={notify} />}
          {active === 'Equipos' && <LiveTeamsView notify={notify} />}
          {active === 'Vestuario' && <LiveWardrobeView notify={notify} />}
          {active === 'Credenciales' && <LiveCredentialsView notify={notify} />}
          {active === 'Reportes' && <LiveReportsView notify={notify} />}
          {active === 'Portal familiar' && <LiveFamilyView notify={notify} />}
          {active === 'Configuración' && (
            <SettingsView
              privacyMode={privacyMode}
              setPrivacyMode={setPrivacyMode}
              notify={notify}
              onCurrentUserUpdated={() => setCheckingSession(true)}
            />
          )}
          </Suspense>
        </div>
      </main>

      {/* TOAST FEEDBACK */}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  )
}

function LoginScreen({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState(import.meta.env.DEV ? 'admin@starsroyalty.local' : '')
  const [password, setPassword] = useState(import.meta.env.DEV ? 'ChangeMe123!' : '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'No fue posible iniciar sesión')
      onLogin(data)
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'No fue posible iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-art">
        <img src="/stars-royalty-logo.webp" alt="Stars Royalty" />
        <p>Disciplina. Técnica. Equipo.</p>
        <span>Gestión integral de alto rendimiento para una academia que nació para brillar.</span>
      </div>
      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow">Stars Royalty</p>
        <h1>Bienvenido de vuelta</h1>
        <p>Accede a tu plataforma deportiva y administrativa.</p>

        <label>
          Correo electrónico
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button className="primary-button login-button" disabled={loading}>
          {loading ? 'Validando...' : 'Iniciar sesión'}
        </button>

        <button
          type="button"
          className="forgot-button"
          onClick={() => setError('Contacta al Administrador General para restablecer credenciales.')}
        >
          ¿Olvidaste tu contraseña?
        </button>

        {import.meta.env.DEV && <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '14px' }}>
          <small style={{ color: '#8d8591', display: 'block', marginBottom: '6px' }}>Cuentas de prueba rápida:</small>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            <button
              type="button"
              className="select-button"
              style={{ fontSize: '9px' }}
              onClick={() => { setEmail('admin@starsroyalty.local'); setPassword('ChangeMe123!') }}
            >
              Admin
            </button>
            <button
              type="button"
              className="select-button"
              style={{ fontSize: '9px' }}
              onClick={() => { setEmail('headcoach@starsroyalty.local'); setPassword('ChangeMe123!') }}
            >
              Head Coach
            </button>
            <button
              type="button"
              className="select-button"
              style={{ fontSize: '9px' }}
              onClick={() => { setEmail('coach@starsroyalty.local'); setPassword('ChangeMe123!') }}
            >
              Coach
            </button>
            <button
              type="button"
              className="select-button"
              style={{ fontSize: '9px' }}
              onClick={() => { setEmail('finanzas@starsroyalty.local'); setPassword('ChangeMe123!') }}
            >
              Finanzas
            </button>
            <button
              type="button"
              className="select-button"
              style={{ fontSize: '9px' }}
              onClick={() => { setEmail('tutor@starsroyalty.local'); setPassword('ChangeMe123!') }}
            >
              Tutor
            </button>
          </div>
        </div>}
      </form>
    </div>
  )
}

function PageHeader({
  active,
  onQuick,
  showQuickActions,
  navigate
}: {
  active: Module
  onQuick: () => void
  showQuickActions: boolean
  navigate: (module: Module) => void
}) {
  const academy = useAcademy()
  const titles: Record<Module, [string, string]> = {
    'Centro operativo': ['Centro operativo', 'Pendientes, familias y planificación para una academia organizada.'],
    Resumen: ['Buenos días, Familia Stars Royalty', 'Panel ejecutivo de operaciones, atletas y rendimiento.'],
    Atletas: ['Expediente Integral del Atleta (360°)', 'Fichas médicas, rúbricas de evaluación, asistencias, documentos y credenciales.'],
    Rendimiento: ['Rendimiento Deportivo y Rúbricas', 'Evaluación por criterios Cheerleading y Gimnasia, lesiones y boleta oficial PDF.'],
    Asistencia: ['Control de Asistencias y Horarios', 'Registro por equipos, 4 estados, cálculo de tasa y alertas de inasistencia.'],
    Calendario: ['Calendario Académico y Sedes', 'Entrenamientos, eventos y distribución en salones y pistas de resorte.'],
    Cobranza: ['Cobranza, Pagos y Flujo de Caja', 'Cargos, mensualidades, egresos operativos, recibos PDF con folio y WhatsApp.'],
    Inventario: ['Inventario y Ventas Mostrador', 'Uniformes, productos, alertas de stock bajo y venta directa a atletas.'],
    Competencias: ['Competencias y Eventos Oficiales', 'Cuenta regresiva, checklist logístico, resultados y convocatorias por WhatsApp.'],
    Comunicados: ['Centro de Comunicados y Difusión', 'Mensajería institucional con plantillas automatizadas vía WhatsApp Web.'],
    Categorías: ['Categorías Deportivas y Niveles', 'Administración de temporadas, edades y niveles por disciplina.'],
    Equipos: ['Disciplinas, Equipos y Plantillas', 'Configuración de posiciones Cheerleading y Gimnasia Artística con coaches.'],
    Vestuario: ['Control de Vestuario y Uniformes', 'Asignación de tallas, entregas, devoluciones y cargo automático a cuenta.'],
    Credenciales: ['Credencialización y Validador QR', 'Emisión de identificaciones oficiales y sistema de control de acceso.'],
    Reportes: ['Reportes Ejecutivos y Auditoría', 'Métricas de retención, flujo financiero, descargas en CSV/Excel y logs de auditoría.'],
    'Portal familiar': ['Portal para Familias y Tutores', 'Consulta de estados de cuenta, calendario, asistencias y firma de responsivas.'],
    Configuración: ['Configuración y Preferencias', 'Usuarios, roles, sedes/salones deportivos, rúbricas y privacidad.']
  }

  return (
    <section className="welcome-row">
      <div>
        <p className="eyebrow">
          {active === 'Resumen' ? (academy?.season?.name ?? 'Temporada actual') : academy?.name ?? 'Gestión Stars Royalty'}
        </p>
        <h1>
          {titles[active][0]} {active === 'Resumen' && <span>✦</span>}
        </h1>
        <p className="subtitle">{titles[active][1]}</p>
      </div>

      <div className="welcome-actions">
        <button className="secondary-button" onClick={() => {
          const reportSection = document.querySelector<HTMLElement>('.report-print-area > .module-stats')
          if (reportSection) printReportSummary(reportSection)
          else window.print()
        }}>
          <FileText size={16} /> Exportar PDF
        </button>

        <button className="primary-button" onClick={onQuick}>
          <Plus size={17} /> Acciones Rápidas
        </button>

        {showQuickActions && (
          <div className="popover quick-popover">
            <button onClick={() => navigate('Atletas')}>
              <UserPlus size={16} /> Registrar Atleta
            </button>
            <button onClick={() => navigate('Asistencia')}>
              <ClipboardCheck size={16} /> Tomar Asistencia
            </button>
            <button onClick={() => navigate('Cobranza')}>
              <DollarSign size={16} /> Generar Cargo
            </button>
            <button onClick={() => navigate('Inventario')}>
              <Package size={16} /> Vender en Mostrador
            </button>
            <button onClick={() => navigate('Rendimiento')}>
              <Activity size={16} /> Nueva Evaluación
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function PanelHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: string }) {
  return (
    <div className="panel-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action && (
        <button className="select-button">
          {action} <ChevronDown size={15} />
        </button>
      )}
    </div>
  )
}

function MetricCard({ icon, label, value, change, tone }: { icon: ReactNode; label: string; value: string; change: string; tone: string }) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tone}`}>{icon}</div>
      <div className="metric-info">
        <span>{label}</span>
        <strong>{value}</strong>
        <small className="positive">↗ {change}</small>
      </div>
    </div>
  )
}

function Dashboard({
  navigate,
  summary
}: {
  navigate: (module: Module) => void
  summary: DashboardData | null
}) {
  const formatMoney = (amount: number | undefined) => `$${(amount ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
  const formatDate = (value: string) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  const typeLabel = (type: string) => ({ training: 'Entrenamiento', competition: 'Competencia', evaluation: 'Evaluación', meeting: 'Reunión' }[type.toLowerCase()] ?? type)
  const performance = summary?.performance
  const score = performance?.average
  const history = performance?.history ?? []
  const chartPoints = history.map((item, index) => {
    const x = history.length === 1 ? 310 : (index / (history.length - 1)) * 620
    const y = 145 - Math.max(0, Math.min(100, item.score)) * 1.35
    return `${x},${y}`
  }).join(' ')
  const chartFill = chartPoints ? `${chartPoints} 620,150 0,150` : ''
  const nextEvent = summary?.upcomingEvents?.[0]
  const nextCompetition = summary?.nextCompetition
  const daysToCompetition = nextCompetition ? daysUntil(nextCompetition.starts_at) : null

  return (
    <>
      <section className="metrics-grid">
        <MetricCard
          icon={<Users />}
          label="Atletas activos"
          value={summary ? String(summary.athletes) : '—'}
          change="Sincronizado con base de datos"
          tone="purple"
        />
        {hasPermission('finance') && <MetricCard
          icon={<DollarSign />}
          label="Cobranza del periodo"
          value={summary ? formatMoney(summary.monthlyIncome) : '—'}
          change={`${summary?.pendingPayments ?? 0} ${summary?.pendingPayments === 1 ? 'pago pendiente' : 'pagos pendientes'}`}
          tone="yellow"
        />}
        <MetricCard
          icon={<ClipboardCheck />}
          label="Asistencia promedio"
          value={summary?.attendanceRate == null ? 'Sin registros' : `${summary.attendanceRate}%`}
          change="Registros de asistencia capturados"
          tone="coral"
        />
        <MetricCard
          icon={<Trophy />}
          label="Próxima competencia"
          value={daysToCompetition == null ? 'Sin fecha' : `${daysToCompetition} ${daysToCompetition === 1 ? 'día' : 'días'}`}
          change={nextCompetition ? `${nextCompetition.teamCount} ${nextCompetition.teamCount === 1 ? 'equipo convocado' : 'equipos convocados'}` : 'Registra una competencia'}
          tone="mint"
        />
      </section>

      <section className="dashboard-grid">
        <div className="panel performance-panel">
          <PanelHeading eyebrow="Seguimiento Deportivo" title="Rendimiento General de la Academia" />
          <div className="performance-body">
            <div className="score-ring" style={{ background: score == null ? undefined : `conic-gradient(#870aa6 0 ${score}%, #f0e8f4 ${score}% 100%)` }}>
              <div>
                <strong>{score == null ? '—' : score}</strong>
                <span>score</span>
              </div>
            </div>
            <div className="performance-copy">
              <strong>{score == null ? 'Aún no hay evaluaciones' : 'Promedio de evaluaciones registradas'}</strong>
              <p>{score == null ? 'Registra evaluaciones para visualizar el seguimiento deportivo de la academia.' : 'Indicadores calculados con las evaluaciones capturadas en la base de datos.'}</p>
              <div className="legend">
                <span><i className="dot purple-dot" />Técnica <b>{performance?.technique ?? '—'}%</b></span>
                <span><i className="dot yellow-dot" />Flexibilidad <b>{performance?.flexibility ?? '—'}%</b></span>
                <span><i className="dot coral-dot" />Fuerza <b>{performance?.strength ?? '—'}%</b></span>
              </div>
            </div>
          </div>

          <div className="chart">
            <div className="chart-labels">
              <span>100</span><span>75</span><span>50</span><span>25</span><span>0</span>
            </div>
            <div className="chart-area">
              <div className="grid-lines"><i /><i /><i /><i /><i /></div>
              <svg viewBox="0 0 620 150" preserveAspectRatio="none">
                {chartFill && <polygon className="chart-fill" points={chartFill} />}
                {chartPoints && <polyline className="chart-line" points={chartPoints} fill="none" />}
              </svg>
              <div className="chart-months">
                {history.length ? history.map((item) => <span key={item.date}>{new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' }).format(new Date(`${item.date}T12:00:00`)).toUpperCase()}</span>) : <span>Sin historial de evaluaciones</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Schedule Panel */}
        <div className="panel schedule-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Agenda</p>
              <h2>Próximos eventos</h2>
            </div>
            <button className="text-button" onClick={() => navigate('Calendario')}>
              Ver calendario <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="schedule-list">
            {(summary?.upcomingEvents ?? []).map((event, index) => {
              const colors = ['purple', 'yellow', 'coral']
              return (
                <div className="schedule-item" key={event.id}>
                  <time dateTime={event.starts_at}>
                    <span>{new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(event.starts_at))}</span>
                    <span>{new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(new Date(event.starts_at))}</span>
                  </time>
                  <span className={`event-line ${colors[index % colors.length]}`} />
                  <div>
                    <strong>{event.title}</strong>
                    <p>{typeLabel(event.type)}{event.location ? ` • ${event.location}` : ''}</p>
                  </div>
                </div>
              )
            })}
            {!summary?.upcomingEvents?.length && <p className="empty-state">No hay eventos próximos registrados.</p>}
          </div>
          <div className="next-event" onClick={() => navigate('Calendario')} style={{ cursor: 'pointer' }}>
            <div className="next-icon"><Dumbbell size={18} /></div>
            <div>
              <span>{nextEvent ? formatDate(nextEvent.starts_at) : 'Agenda disponible'}</span>
              <strong>{nextEvent?.title ?? 'Registra tu primer evento'}</strong>
            </div>
            <ArrowUpRight size={17} />
          </div>
        </div>

        {/* Attendance Mini */}
        <div className="panel attendance-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Control Diario</p>
              <h2>Asistencia por Equipo</h2>
            </div>
            <button className="text-button" onClick={() => navigate('Asistencia')}>
              Ver detalle <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="attendance-stat">
            <strong>{summary?.attendanceRate == null ? '—' : `${summary.attendanceRate}%`}</strong>
            <span className="positive">actual</span>
            <small>promedio de registros capturados</small>
          </div>
          {(summary?.attendanceByTeam ?? []).map((team) => (
            <div className="bar-row" key={team.id}>
              <span>{team.name}</span>
              <div><i style={{ width: `${team.rate}%` }} /></div>
              <b>{team.rate}%</b>
            </div>
          ))}
          {!summary?.attendanceByTeam?.length && <p className="empty-state">Sin asistencias por equipo registradas.</p>}
        </div>

        {/* Alerts Mini */}
        <div className="panel alerts-panel">
          <PanelHeading eyebrow="Atención Inmediata" title="Alertas Operativas" />
          <div className="alert-list">
            {hasPermission('finance') && <button className="alert-item" onClick={() => navigate('Cobranza')}>
              <div className="alert-icon yellow"><DollarSign size={15} /></div>
              <div>
                <strong>Cuentas por cobrar</strong>
                <p>{summary?.pendingPayments ?? 0} {summary?.pendingPayments === 1 ? 'pago pendiente' : 'pagos pendientes'} de confirmación</p>
              </div>
              <ArrowUpRight size={16} />
            </button>}
            {hasPermission('inventory') && <button className="alert-item" onClick={() => navigate('Inventario')}>
              <div className="alert-icon coral"><Package size={15} /></div>
              <div>
                <strong>Stock bajo en almacén</strong>
                <p>{summary?.lowStock ?? 0} {summary?.lowStock === 1 ? 'producto' : 'productos'} por debajo del mínimo</p>
              </div>
              <ArrowUpRight size={16} />
            </button>}
            {hasPermission('medical') && <button className="alert-item" onClick={() => navigate('Rendimiento')}>
              <div className="alert-icon purple"><Activity size={15} /></div>
              <div>
                <strong>Protocolo de lesiones</strong>
                <p>{summary?.activeInjuries ?? 0} {summary?.activeInjuries === 1 ? 'atleta' : 'atletas'} en seguimiento médico activo</p>
              </div>
              <ArrowUpRight size={16} />
            </button>}
          </div>
        </div>
      </section>

      {/* Motivational / Countdown Banner */}
      <section className="bottom-row">
        <div className="quote">
          <span className="quote-mark">“</span>
          <p>La excelencia no es un acto, es un hábito diario de disciplina y pasión.</p>
          <small>— Filosofía Stars Royalty Cheerleading & Gymnastics</small>
        </div>
        <div className="season-card">
          <div>
            <span>Competencia próxima</span>
            <strong>{nextCompetition?.title ?? 'Sin competencias programadas'}</strong>
            <p>{nextCompetition ? `${nextCompetition.location ?? 'Sede por confirmar'} · ${nextCompetition.teamCount} ${nextCompetition.teamCount === 1 ? 'equipo convocado' : 'equipos convocados'}.` : 'Da de alta una competencia para verla aquí.'}</p>
          </div>
          <div className="season-badge">
            <Trophy size={20} />
            <strong>{daysToCompetition ?? '—'}</strong>
            <span>{daysToCompetition === 1 ? 'día' : 'días'}</span>
          </div>
        </div>
      </section>
    </>
  )
}

function SettingsView({
  privacyMode,
  setPrivacyMode,
  notify,
  onCurrentUserUpdated
}: {
  privacyMode: boolean
  setPrivacyMode: (val: boolean) => void
  notify: (msg: string) => void
  onCurrentUserUpdated: () => void
}) {
  const [activeTab, setActiveTab] = useState<'usuarios' | 'sedes' | 'rubricas' | 'privacidad'>('usuarios')
  const [users, setUsers] = useState<Array<{ id: number; name: string; email: string; photo_data?: string | null; role: string; role_id: number; guardian_id?: number | null; active: number }>>([])
  const [roles, setRoles] = useState<Array<{ id: number; name: string; permissions: string[]; system: boolean }>>([])
  const [editingRole,setEditingRole]=useState<{id:number;name:string;permissions:string[];system:boolean}|null>(null)
  const [venues, setVenues] = useState<Array<{ id: number; name: string; location?: string; capacity: number; description?: string; active: number }>>([])
  const [rubrics, setRubrics] = useState<Array<{ id: number; name: string; discipline?: string; discipline_id?: number; description?: string; criteria: string[]; active: number }>>([])
  const [disciplines, setDisciplines] = useState<Array<{ id: number; name: string }>>([])
  const [guardians, setGuardians] = useState<Array<{ id: number; name: string }>>([])
  const [showUserForm, setShowUserForm] = useState(false)
  const [showRoleForm, setShowRoleForm] = useState(false)
  const [showRubricForm, setShowRubricForm] = useState(false)
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', roleId: '', photoData: '' })
  const [roleForm, setRoleForm] = useState({ name: '', permissions: [] as string[] })
  const [rubricForm, setRubricForm] = useState({ name: '', disciplineId: '', description: '', criteria: 'Técnica\nFlexibilidad\nFuerza\nActitud\nTrabajo en equipo' })

  // Form new venue
  const [showAddVenue, setShowAddVenue] = useState(false)
  const [venueName, setVenueName] = useState('')
  const [venueLocation, setVenueLocation] = useState('')
  const [venueCapacity, setVenueCapacity] = useState('30')
  const [venueDesc, setVenueDesc] = useState('')
  const [editingVenue, setEditingVenue] = useState<number | null>(null)

  const load = useCallback(() => {
    apiRequest<typeof guardians>('/api/guardians').then(setGuardians).catch((err: unknown) => notify(err instanceof Error ? err.message : 'Error al cargar tutores'))
    apiRequest<typeof users>('/api/users')
      .then(setUsers)
      .catch(() => undefined)
    apiRequest<typeof roles>('/api/roles')
      .then((items) => {
        setRoles(items)
        setUserForm((current) => current.roleId || !items[0] ? current : { ...current, roleId: String(items[0].id) })
      })
      .catch(() => undefined)
    apiRequest<typeof venues>('/api/venues/all')
      .then(setVenues)
      .catch(() => undefined)
    apiRequest<typeof rubrics>('/api/rubrics').then(setRubrics).catch(() => undefined)
    apiRequest<typeof disciplines>('/api/disciplines/all').then(setDisciplines).catch(() => undefined)
  }, [notify])

  useEffect(() => {
    load()
  }, [load])

  const handleAddVenue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!venueName.trim()) return
    try {
      await apiRequest(editingVenue ? `/api/venues/${editingVenue}` : '/api/venues', {
        method: editingVenue ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: venueName,
          location: venueLocation || undefined,
          capacity: Number(venueCapacity) || 30,
          description: venueDesc || undefined
        })
      })
      notify(`Sede/salón "${venueName}" ${editingVenue ? 'actualizado' : 'registrado'}`)
      setVenueName('')
      setVenueLocation('')
      setVenueDesc('')
      setEditingVenue(null)
      setShowAddVenue(false)
      load()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al registrar sede')
    }
  }

  const editVenue = (venue: { id: number; name: string; location?: string; capacity: number; description?: string }) => {
    setEditingVenue(venue.id)
    setVenueName(venue.name)
    setVenueLocation(venue.location ?? '')
    setVenueCapacity(String(venue.capacity))
    setVenueDesc(venue.description ?? '')
    setShowAddVenue(true)
  }

  const updateVenueStatus = (venue: { id: number; name: string; active: number }) => {
    const activate = !venue.active
    if (!window.confirm(`¿Deseas ${activate ? 'reactivar' : 'archivar'} la sede “${venue.name}”?`)) return
    void apiRequest(`/api/venues/${venue.id}`, { method: 'PATCH', body: JSON.stringify({ active: activate }) }).then(() => { notify(`Sede ${activate ? 'reactivada' : 'archivada'}`); load() }).catch((err: unknown) => notify(err instanceof Error ? err.message : 'No fue posible actualizar la sede'))
  }

  const deleteVenue = (venue: { id: number; name: string }) => {
    if (!window.confirm(`¿Eliminar definitivamente la sede “${venue.name}”? Esta acción sólo será posible si no tiene eventos asociados.`)) return
    void apiRequest(`/api/venues/${venue.id}`, { method: 'DELETE' }).then(() => { notify('Sede eliminada'); load() }).catch((err: unknown) => notify(err instanceof Error ? err.message : 'No fue posible eliminar la sede'))
  }

  const readUserPhoto = (file: File, onReady: (photoData: string) => void) => {
    if (!file.type.startsWith('image/')) return notify('Selecciona una imagen en formato JPG, PNG, WEBP o GIF.')
    if (file.size > 2 * 1024 * 1024) return notify('La foto debe pesar máximo 2 MB.')
    const reader = new FileReader()
    reader.onload = () => onReady(String(reader.result))
    reader.onerror = () => notify('No fue posible leer la imagen seleccionada.')
    reader.readAsDataURL(file)
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const { photoData, ...userData } = userForm
      await apiRequest('/api/users', { method: 'POST', body: JSON.stringify({ ...userData, roleId: Number(userForm.roleId), photoData: photoData || undefined }) })
      notify(`Usuario ${userForm.name} creado correctamente`)
      setUserForm((current) => ({ ...current, name: '', email: '', password: '', photoData: '' }))
      setShowUserForm(false)
      load()
    } catch (err) { notify(err instanceof Error ? err.message : 'No fue posible crear el usuario') }
  }

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await apiRequest('/api/roles', { method: 'POST', body: JSON.stringify(roleForm) })
      notify(`Rol ${roleForm.name} creado correctamente`)
      setRoleForm({ name: '', permissions: [] })
      setShowRoleForm(false)
      load()
    } catch (err) { notify(err instanceof Error ? err.message : 'No fue posible crear el rol') }
  }

  const handleCreateRubric = async (e: React.FormEvent) => {
    e.preventDefault()
    const criteria = rubricForm.criteria.split('\n').map((item) => item.trim()).filter(Boolean)
    if (!rubricForm.name.trim() || !criteria.length) return notify('Indica el nombre y al menos un criterio para la rúbrica')
    try {
      await apiRequest('/api/rubrics', { method: 'POST', body: JSON.stringify({ name: rubricForm.name, disciplineId: rubricForm.disciplineId ? Number(rubricForm.disciplineId) : null, description: rubricForm.description, criteria }) })
      notify(`Rúbrica ${rubricForm.name} creada y disponible para evaluaciones`)
      setRubricForm({ name: '', disciplineId: '', description: '', criteria: 'Técnica\nFlexibilidad\nFuerza\nActitud\nTrabajo en equipo' })
      setShowRubricForm(false)
      load()
    } catch (err) { notify(err instanceof Error ? err.message : 'No fue posible guardar la rúbrica') }
  }

  const toggleRubric = async (rubric: { id: number; name: string; active: number }) => {
    try { await apiRequest(`/api/rubrics/${rubric.id}`, { method: 'PATCH', body: JSON.stringify({ active: !rubric.active }) }); notify(`Rúbrica ${rubric.active ? 'archivada' : 'activada'}: ${rubric.name}`); load() }
    catch (err) { notify(err instanceof Error ? err.message : 'No fue posible actualizar la rúbrica') }
  }

  const editRubric = async (rubric: { id: number; name: string; criteria: string[] }) => {
    const name = window.prompt('Nombre de la rúbrica:', rubric.name)
    if (!name?.trim()) return
    const criteriaText = window.prompt('Criterios (uno por renglón):', rubric.criteria.join('\n'))
    if (criteriaText === null) return
    const criteria = criteriaText.split('\n').map((item) => item.trim()).filter(Boolean)
    if (!criteria.length) return notify('La rúbrica debe tener al menos un criterio')
    try { await apiRequest(`/api/rubrics/${rubric.id}`, { method: 'PATCH', body: JSON.stringify({ name, criteria }) }); notify('Rúbrica actualizada'); load() }
    catch (err) { notify(err instanceof Error ? err.message : 'No fue posible editar la rúbrica') }
  }

  const updateUser = async (id: number, changes: Record<string, unknown>) => {
    try {
      await apiRequest(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(changes) })
      notify('Usuario actualizado')
      if (readSession()?.user.id === id) onCurrentUserUpdated()
      load()
    } catch (err) { notify(err instanceof Error ? err.message : 'No fue posible actualizar el usuario') }
  }

  const changeUserStatus = (user: { id: number; name: string; active: number }) => {
    const activating = !user.active
    if (!activating && readSession()?.user.id === user.id) return notify('No puedes desactivar la cuenta con la que tienes la sesión iniciada.')
    const action = activating ? 'reactivar' : 'desactivar'
    if (!window.confirm(`¿Deseas ${action} la cuenta de ${user.name}? ${activating ? 'Podrá volver a iniciar sesión.' : 'No podrá iniciar sesión, pero su historial se conservará.'}`)) return
    void updateUser(user.id, { active: activating })
  }

  const editRole = (role: { id: number; name: string; permissions: string[]; system: boolean }) => {
    setEditingRole(role)
  }

  const deleteRole = (role: { id: number; name: string }) => {
    if (!window.confirm(`¿Eliminar el rol “${role.name}”? Sólo se permitirá si no tiene usuarios asignados.`)) return
    void apiRequest(`/api/roles/${role.id}`, { method: 'DELETE' }).then(() => { notify('Rol eliminado'); load() }).catch((err: unknown) => notify(err instanceof Error ? err.message : 'No fue posible eliminar el rol'))
  }

  const deleteRubric = (rubric: { id: number; name: string }) => {
    if (!window.confirm(`¿Eliminar la rúbrica “${rubric.name}”? Sólo se permitirá si no tiene evaluaciones asociadas.`)) return
    void apiRequest(`/api/rubrics/${rubric.id}`, { method: 'DELETE' }).then(() => { notify('Rúbrica eliminada'); load() }).catch((err: unknown) => notify(err instanceof Error ? err.message : 'No fue posible eliminar la rúbrica'))
  }

  return (
    <div className="settings-layout">
      {editingRole&&<Modal title="Permisos del rol" onClose={()=>setEditingRole(null)}><ActionForm notify={notify} label="Guardar permisos" onSave={async form=>{await apiRequest(`/api/roles/${editingRole.id}`,{method:'PATCH',body:JSON.stringify({...(editingRole.system?{}:{name:String(form.get('name'))}),permissions:form.getAll('permissions')})});setEditingRole(null);load();onCurrentUserUpdated()}}><label>Nombre<input name="name" defaultValue={editingRole.name} required readOnly={editingRole.system}/></label><p className="ops-hint">Los permisos superiores incluyen funciones de apoyo: dirección incluye deporte; finanzas incluye inventario. Administración permite todas las funciones.</p>{[['staff','Recepción y comunicación'],['coaching','Deporte y expedientes'],['sportsLead','Dirección deportiva y altas'],['medical','Salud y lesiones'],['documents','Archivos del expediente'],['finance','Cobranza e información financiera'],['inventory','Inventario y ventas'],['admin','Administración completa']].map(([value,label])=><label className="ops-checkbox" key={value}><input type="checkbox" name="permissions" value={value} defaultChecked={editingRole.permissions.includes(value)}/>{label}</label>)}</ActionForm></Modal>}
      {/* Side Settings Menu */}
      <div className="settings-menu panel">
        <button
          className={activeTab === 'usuarios' ? 'active' : ''}
          onClick={() => setActiveTab('usuarios')}
        >
          <Users size={16} /> Usuarios y Roles
        </button>
        <button
          className={activeTab === 'sedes' ? 'active' : ''}
          onClick={() => setActiveTab('sedes')}
        >
          <Building2 size={16} /> Sedes y Salones
        </button>
        <button
          className={activeTab === 'rubricas' ? 'active' : ''}
          onClick={() => setActiveTab('rubricas')}
        >
          <Dumbbell size={16} /> Rúbricas Deportivas
        </button>
        <button
          className={activeTab === 'privacidad' ? 'active' : ''}
          onClick={() => setActiveTab('privacidad')}
        >
          <ShieldCheck size={16} /> Privacidad y Datos
        </button>
      </div>

      {/* Settings Content Pane */}
      <div className="panel settings-content">
        {activeTab === 'usuarios' && (
          <div>
            <PanelHeading eyebrow="Control de Acceso Institucional" title="Gestión de Usuarios y Roles" />
            <p className="section-copy">
              Crea roles con alcances específicos, da de alta cuentas y mantén sus perfiles activos, inactivos o reasignados.
            </p>

            <div className="toolbar-actions" style={{ margin: '18px 0' }}>
              <button className="primary-button" onClick={() => setShowUserForm(!showUserForm)}><UserPlus size={15} /> Nuevo usuario</button>
              <button className="secondary-button" onClick={() => setShowRoleForm(!showRoleForm)}><ShieldCheck size={15} /> Nuevo rol</button>
            </div>

            {showUserForm && <form className="live-form mini-form" onSubmit={handleCreateUser}>
              <div className="panel-heading"><div><p className="eyebrow">Alta de cuenta</p><h3>Nuevo usuario</h3></div></div>
              <div className="form-grid">
                <label>Nombre completo<input required value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} /></label>
                <label>Correo electrónico<input required type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} /></label>
                <label>Contraseña temporal<input required type="password" minLength={8} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} /><small>Mínimo 8 caracteres.</small></label>
                <label>Rol<select required value={userForm.roleId} onChange={(e) => setUserForm({ ...userForm, roleId: e.target.value })}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
                <label>Foto de perfil<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => { const file = e.target.files?.[0]; if (file) readUserPhoto(file, (photoData) => setUserForm({ ...userForm, photoData })) }} /><small>JPG, PNG, WEBP o GIF · máximo 2 MB.</small></label>
                {userForm.photoData && <div className="user-photo-preview"><img src={userForm.photoData} alt="Vista previa de foto de usuario" /><button type="button" className="text-button" onClick={() => setUserForm({ ...userForm, photoData: '' })}>Quitar foto</button></div>}
              </div>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowUserForm(false)}>Cancelar</button><button className="primary-button"><Check size={15} /> Crear usuario</button></div>
            </form>}

            {showRoleForm && <form className="live-form mini-form" onSubmit={handleCreateRole}>
              <div className="panel-heading"><div><p className="eyebrow">Perfil de acceso</p><h3>Nuevo rol personalizado</h3></div></div>
              <label>Nombre del rol<input required value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} placeholder="Ej. Recepción y control de acceso" /></label>
              <fieldset style={{ marginTop: '14px', border: '1px solid #e8e1ea', borderRadius: '8px', padding: '12px' }}><legend style={{ padding: '0 5px', color: '#786e7b', fontSize: '10px', fontWeight: 700 }}>Permisos operativos</legend>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px' }}>{[['staff', 'Consulta operativa'], ['coaching', 'Coaching'], ['sportsLead', 'Dirección deportiva'], ['medical', 'Salud'], ['documents', 'Documentos'], ['finance', 'Finanzas'], ['inventory', 'Inventario'], ['admin', 'Administración']].map(([key, label]) => <label key={key} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 400 }}><input type="checkbox" checked={roleForm.permissions.includes(key)} onChange={(e) => setRoleForm({ ...roleForm, permissions: e.target.checked ? [...roleForm.permissions, key] : roleForm.permissions.filter((item) => item !== key) })} />{label}</label>)}</div>
              </fieldset>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowRoleForm(false)}>Cancelar</button><button className="primary-button"><Check size={15} /> Crear rol</button></div>
            </form>}

            <h3 style={{ fontSize: '14px', margin: '20px 0 10px', color: '#403747' }}>
              Cuentas Registradas en Stars Royalty
            </h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Correo Electrónico</th>
                    <th>Rol en Academia</th>
                    <th>Estado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td><div className="person-cell"><UserAvatar name={u.name} photo={u.photo_data} className="avatar-table" /><div><strong>{u.name}</strong><span>Foto de perfil</span></div></div></td>
                      <td>{u.email}{u.role === 'Padres y tutores' && <label>Tutor vinculado<select aria-label={`Tutor de ${u.name}`} value={u.guardian_id ?? ''} onChange={async (event) => { try { await apiRequest(`/api/users/${u.id}/guardian`, { method: 'PATCH', body: JSON.stringify({ guardianId: event.target.value ? Number(event.target.value) : null }) }); notify('Tutor vinculado. La familia debe iniciar sesión nuevamente.'); load() } catch (error) { notify(error instanceof Error ? error.message : 'No se pudo vincular') } }}><option value="">Sin vínculo</option>{guardians.map((guardian) => <option key={guardian.id} value={guardian.id}>{guardian.name}</option>)}</select></label>}</td>
                      <td>
                        <select value={u.role_id} onChange={(e) => void updateUser(u.id, { roleId: Number(e.target.value) })} aria-label={`Rol de ${u.name}`}>
                          {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                        </select>
                      </td>
                      <td><span className={`status-pill ${u.active ? 'success' : 'neutral'}`}>{u.active ? 'Activo' : 'Inactivo / baja'}</span></td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => {
                            const password = window.prompt(`Nueva contraseña para ${u.name} (mínimo 8 caracteres):`)
                            if (password) void updateUser(u.id, { password })
                          }}
                          title="Restablecer contraseña"
                        >
                          Restablecer acceso
                        </button>
                        <label className="text-button user-photo-action">Cambiar foto<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => { const file = e.target.files?.[0]; if (file) readUserPhoto(file, (photoData) => void updateUser(u.id, { photoData })) }} /></label>
                        {u.photo_data && <button className="text-button" onClick={() => void updateUser(u.id, { photoData: null })}>Quitar foto</button>}
                        <button className={`text-button ${u.active ? 'danger-action' : ''}`} onClick={() => changeUserStatus(u)}>{u.active ? 'Dar de baja / desactivar' : 'Reactivar usuario'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 style={{ fontSize: '14px', margin: '24px 0 10px', color: '#403747' }}>Roles y permisos configurados</h3>
            <div className="table-scroll"><table><thead><tr><th>Rol</th><th>Permisos</th><th>Tipo</th><th>Administrar</th></tr></thead><tbody>
              {roles.map((role) => <tr key={role.id}><td><strong>{role.name}</strong></td><td>{role.permissions.length ? role.permissions.join(', ') : 'Sin permisos asignados'}</td><td><span className={`status-pill ${role.system ? 'neutral' : 'success'}`}>{role.system ? 'Sistema' : 'Personalizado'}</span></td><td><button className="text-button" onClick={() => editRole(role)}>Editar permisos</button>{!role.system && <button className="text-button danger-action" onClick={() => deleteRole(role)}>Eliminar</button>}</td></tr>)}
              {!roles.length && <tr><td colSpan={4}><p className="empty-state">No hay roles registrados.</p></td></tr>}
            </tbody></table></div>
          </div>
        )}

        {activeTab === 'sedes' && (
          <div>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Infraestructura Deportiva</p>
                <h2>Sedes, Salones y Pistas de Entrenamiento</h2>
              </div>
              <button
                className="primary-button"
                onClick={() => { setEditingVenue(null); setVenueName(''); setVenueLocation(''); setVenueCapacity('30'); setVenueDesc(''); setShowAddVenue(!showAddVenue) }}
              >
                <Plus size={15} /> {showAddVenue ? 'Cerrar Formulario' : 'Nueva Sede/Salón'}
              </button>
            </div>

            {showAddVenue && (
              <form onSubmit={handleAddVenue} className="live-form" style={{ margin: '16px 0 24px', padding: '16px', background: '#fcfafc', borderRadius: '8px', border: '1px solid #eee' }}>
                <div className="form-grid">
                  <label>
                    Nombre del Espacio *
                    <input
                      placeholder="Ej. Pista Spring Floor 2"
                      value={venueName}
                      onChange={(e) => setVenueName(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Ubicación / Área
                    <input
                      placeholder="Ej. Planta Baja - Ala Este"
                      value={venueLocation}
                      onChange={(e) => setVenueLocation(e.target.value)}
                    />
                  </label>
                  <label>
                    Capacidad (Atletas)
                    <input
                      type="number"
                      value={venueCapacity}
                      onChange={(e) => setVenueCapacity(e.target.value)}
                    />
                  </label>
                  <label>
                    Descripción
                    <input
                      placeholder="Equipamiento, fosa, aparatos..."
                      value={venueDesc}
                      onChange={(e) => setVenueDesc(e.target.value)}
                    />
                  </label>
                </div>
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="secondary-button" onClick={() => { setShowAddVenue(false); setEditingVenue(null) }}>
                    Cancelar
                  </button>
                  <button className="primary-button">
                    <Check size={15} /> {editingVenue ? 'Guardar cambios' : 'Guardar espacio'}
                  </button>
                </div>
              </form>
            )}

            <div className="table-scroll" style={{ marginTop: '14px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Nombre de la Sede / Salón</th>
                    <th>Ubicación</th>
                    <th>Capacidad</th>
                    <th>Descripción</th>
                    <th>Estado</th>
                    <th>Administrar</th>
                  </tr>
                </thead>
                <tbody>
                  {venues.map((v) => (
                    <tr key={v.id}>
                      <td><strong>{v.name}</strong></td>
                      <td>{v.location || 'Área Principal'}</td>
                      <td><b>{v.capacity} atletas</b></td>
                      <td>{v.description || 'Instalación de alto rendimiento'}</td>
                      <td><span className={`status-pill ${v.active ? 'success' : 'neutral'}`}>{v.active ? 'Activa' : 'Archivada'}</span></td>
                      <td><button className="text-button" onClick={() => editVenue(v)}>Editar</button> <button className="text-button" onClick={() => updateVenueStatus(v)}>{v.active ? 'Archivar' : 'Reactivar'}</button> <button className="text-button danger-action" onClick={() => deleteVenue(v)}>Eliminar</button></td>
                    </tr>
                  ))}
                  {!venues.length && <tr><td colSpan={6}><p className="empty-state">No hay sedes registradas.</p></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'rubricas' && (
          <div>
            <div className="panel-heading">
              <div><p className="eyebrow">Estándares Técnicos</p><h2>Rúbricas Oficiales de Evaluación Deportiva</h2></div>
              <button className="primary-button" onClick={() => setShowRubricForm(!showRubricForm)}><Plus size={15} /> {showRubricForm ? 'Cerrar formulario' : 'Nueva rúbrica'}</button>
            </div>
            <p className="section-copy">
              Parámetros de calificación oficial por disciplina deportiva para la expedición de boletas técnicas con firma de Head Coach.
            </p>

            {showRubricForm && <form className="live-form mini-form" onSubmit={handleCreateRubric} style={{ marginTop: '16px' }}>
              <div className="form-grid">
                <label>Nombre de la rúbrica<input required value={rubricForm.name} onChange={(e) => setRubricForm({ ...rubricForm, name: e.target.value })} placeholder="Ej. Cheer nivel 3 · evaluación mensual" /></label>
                <label>Disciplina<select value={rubricForm.disciplineId} onChange={(e) => setRubricForm({ ...rubricForm, disciplineId: e.target.value })}><option value="">Aplicable a todas</option>{disciplines.map((discipline) => <option key={discipline.id} value={discipline.id}>{discipline.name}</option>)}</select></label>
              </div>
              <label>Descripción<input value={rubricForm.description} onChange={(e) => setRubricForm({ ...rubricForm, description: e.target.value })} placeholder="Objetivo y alcance de esta evaluación" /></label>
              <label>Criterios de evaluación <small>Uno por renglón.</small><textarea required rows={6} value={rubricForm.criteria} onChange={(e) => setRubricForm({ ...rubricForm, criteria: e.target.value })} /></label>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowRubricForm(false)}>Cancelar</button><button className="primary-button"><Check size={15} /> Guardar rúbrica</button></div>
            </form>}

            <div className="table-scroll" style={{ marginTop: '16px' }}>
              <table><thead><tr><th>Rúbrica</th><th>Disciplina</th><th>Criterios</th><th>Estado</th><th>Administrar</th></tr></thead><tbody>
                {rubrics.map((rubric) => <tr key={rubric.id}><td><strong>{rubric.name}</strong><small style={{ display: 'block' }}>{rubric.description || 'Sin descripción'}</small></td><td>{rubric.discipline || 'Todas'}</td><td>{rubric.criteria.join(' · ')}</td><td><span className={`status-pill ${rubric.active ? 'success' : 'neutral'}`}>{rubric.active ? 'Activa' : 'Archivada'}</span></td><td><button className="text-button" onClick={() => void editRubric(rubric)}>Editar</button> <button className="text-button" onClick={() => void toggleRubric(rubric)}>{rubric.active ? 'Archivar' : 'Activar'}</button> <button className="text-button danger-action" onClick={() => deleteRubric(rubric)}>Eliminar</button></td></tr>)}
                {!rubrics.length && <tr><td colSpan={5}><p className="empty-state">No hay rúbricas registradas.</p></td></tr>}
              </tbody></table>
            </div>

            <div className="split-grid" style={{ marginTop: '16px' }}>
              <div className="panel sub-panel">
                <h3 style={{ margin: '0 0 10px', color: '#6f008f', fontSize: '15px' }}>
                  ✦ Rúbrica Cheerleading (Porrista)
                </h3>
                <div className="detail-rows">
                  <div className="detail-row"><span>Técnica de Ejecución:</span><strong>0 a 100 pts (Alineación y nitidez)</strong></div>
                  <div className="detail-row"><span>Stunts & Pirámides:</span><strong>0 a 100 pts (Estabilidad, subidas y desmontes)</strong></div>
                  <div className="detail-row"><span>Tumbling Acrobático:</span><strong>0 a 100 pts (Round-off, flic-flac, mortales)</strong></div>
                  <div className="detail-row"><span>Saltos (Jumps):</span><strong>0 a 100 pts (Toe-touch, pike, hurdler)</strong></div>
                  <div className="detail-row"><span>Flexibilidad & Arcos:</span><strong>0 a 100 pts (Splits, arabesque, heel-stretch)</strong></div>
                  <div className="detail-row"><span>Fuerza y Resistencia:</span><strong>0 a 100 pts (Core, empuje y sostén)</strong></div>
                  <div className="detail-row"><span>Trabajo en Equipo:</span><strong>0 a 100 pts (Sincronía, confianza y Hit Zero)</strong></div>
                </div>
              </div>

              <div className="panel sub-panel">
                <h3 style={{ margin: '0 0 10px', color: '#3a9e8c', fontSize: '15px' }}>
                  ✦ Rúbrica Gimnasia Artística
                </h3>
                <div className="detail-rows">
                  <div className="detail-row"><span>Salto de Caballo:</span><strong>0 a 100 pts (Carrera, rechace y caída)</strong></div>
                  <div className="detail-row"><span>Barras Asimétricas:</span><strong>0 a 100 pts (Vuelos, transiciones y salida)</strong></div>
                  <div className="detail-row"><span>Viga de Equilibrio:</span><strong>0 a 100 pts (Giros, saltos y elementos acrobáticos)</strong></div>
                  <div className="detail-row"><span>Ejercicios de Piso:</span><strong>0 a 100 pts (Líneas acrobáticas y coreografía)</strong></div>
                  <div className="detail-row"><span>Flexibilidad General:</span><strong>0 a 100 pts (Aperturas y extensión corporal)</strong></div>
                  <div className="detail-row"><span>Fuerza Específica:</span><strong>0 a 100 pts (Parada de manos y suspensiones)</strong></div>
                  <div className="detail-row"><span>All-Around Global:</span><strong>Promedio integral de los 4 aparatos</strong></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'privacidad' && (
          <div>
            <PanelHeading eyebrow="Seguridad y Protección de Datos" title="Privacidad y Fichas Médicas" />
            <p className="section-copy">
              Ajustes de confidencialidad para proteger la integridad de los atletas y menores de edad.
            </p>

            <label className="privacy-toggle" style={{ marginTop: '16px' }}>
              <input
                type="checkbox"
                checked={privacyMode}
                onChange={(e) => setPrivacyMode(e.target.checked)}
              />
              <span>
                <strong>Activar Modo de Privacidad Estricto</strong>
                <small>
                  Oculta fotografías, notas médicas y teléfonos en vistas públicas para usuarios sin rol de Coach o Administración.
                </small>
              </span>
              <ShieldCheck size={20} />
            </label>

            <div style={{ marginTop: '20px', padding: '16px', background: '#fbf9fc', borderRadius: '8px', border: '1px solid #eee' }}>
              <strong style={{ fontSize: '12px', color: '#4d4452', display: 'block', marginBottom: '6px' }}>
                Registro y Auditoría de Acciones
              </strong>
              <p style={{ margin: 0, fontSize: '11px', color: '#7a7080' }}>
                Cada modificación de expediente, evaluación técnica, asignación de equipo o cobro financiero queda registrada con ID de usuario, fecha y hora en la tabla de auditoría del sistema para garantizar trazabilidad total.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
