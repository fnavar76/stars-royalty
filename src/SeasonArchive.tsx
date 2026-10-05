import { useState } from 'react'
import { Archive } from 'lucide-react'
import { useResource } from './useResource'
import { ResourceState } from './uiShared'
type Season={id:number;name:string;starts_on:string;ends_on:string;closed_at:string;athletes:number}
export function SeasonArchive() {
  const resource=useResource<Season[]>('/api/season-archives',[])
  const [selected,setSelected]=useState<number|null>(null)
  return <><div className="panel"><span className="ops-kicker"><Archive size={14}/> Memoria deportiva</span><h2>Archivo de temporadas</h2><p>Al activar una nueva temporada se conserva una copia de la plantilla al cierre, con sus equipos e indicadores del intervalo.</p><p className="ops-hint">Los cierres anteriores a esta función no se reconstruyen automáticamente. Los nombres y equipos archivados no cambian al editar el expediente actual.</p><ResourceState {...resource}/><div className="ops-card-grid">{resource.data.map(s=><button className="ops-action-card" key={s.id} onClick={()=>setSelected(s.id)}><span className="ops-kicker">{s.starts_on} — {s.ends_on}</span><h3>{s.name}</h3><p>{s.athletes} atletas en la plantilla al cierre</p><span>Consultar archivo</span></button>)}</div>{!resource.loading&&!resource.data.length&&<p className="empty-state">El primer archivo se creará al cerrar la temporada activa.</p>}</div>{selected!==null&&<ArchiveDetail key={selected} id={selected}/>}</>
}
function ArchiveDetail({id}:{id:number}) {
  const [page,setPage]=useState(1)
  const resource=useResource<{archive:Season;total:number;rows:{id:number;name:string;status:string;teams:{name:string;category:string;discipline:string}[];attendance_count:number;attendance_rate:number|null;evaluation_count:number}[]}|null>(`/api/season-archives/${id}?page=${page}`,null)
  return <div className="panel"><ResourceState {...resource}/>{resource.data&&<><h2>{resource.data.archive.name}</h2><p>Copia creada: {new Date(resource.data.archive.closed_at).toLocaleString('es-MX')}</p><div className="ops-card-grid">{resource.data.rows.map(a=><article className="ops-preview" key={a.id}><h3>{a.name}</h3><p>{a.teams.map(t=>`${t.name} · ${t.category??''}`).join(', ')||'Sin equipo al cierre'}</p><div className="ops-list-row"><span>Asistencia registrada</span><strong>{a.attendance_rate===null?'Sin registros':`${a.attendance_rate}%`}</strong></div><p>{a.attendance_count} asistencias capturadas · {a.evaluation_count} evaluaciones</p></article>)}</div><div className="ops-section-title" style={{marginTop:20}}><button className="secondary-button" disabled={page===1} onClick={()=>setPage(page-1)}>Anterior</button><span>{resource.data.total} atletas · Página {page}</span><button className="secondary-button" disabled={page*25>=resource.data.total} onClick={()=>setPage(page+1)}>Siguiente</button></div></>}</div>
}
