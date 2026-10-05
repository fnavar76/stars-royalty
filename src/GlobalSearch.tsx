import { useEffect, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { request } from './api'
import type { Module } from './App'
export type SearchResult={id:number;title:string;detail:string;module:Module}
export function GlobalSearch({query,onSelect}:{query:string;onSelect:(result:SearchResult)=>void}) {
  const [state,setState]=useState<{query:string;results:SearchResult[];error:string}>({query:'',results:[],error:''});const {results,error}=state
  useEffect(()=>{if(query.trim().length<2)return;const controller=new AbortController();const timer=setTimeout(()=>{void request<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setState({query,results:data,error:''})}).catch(e=>{if(!controller.signal.aborted)setState({query,results:[],error:e instanceof Error?e.message:'No se pudo buscar'})})},250);return()=>{clearTimeout(timer);controller.abort()}},[query])
  if(query.trim().length<2)return null
  return <div className="ops-search-results" aria-label="Resultados de búsqueda"><div className="ops-kicker">Buscar en la academia</div>{state.query!==query?<p role="status">Buscando...</p>:error?<p role="alert">{error}</p>:results.length?results.map(r=><button key={`${r.module}-${r.id}`} onClick={()=>onSelect(r)}><span><strong>{r.title}</strong><small>{r.detail} · {r.module}</small></span><ArrowUpRight size={15}/></button>):<p>Sin coincidencias. Prueba con otro nombre, concepto o folio.</p>}</div>
}
