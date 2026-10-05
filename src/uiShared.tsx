import { useState, type FormEvent, type ReactNode } from 'react'
import './operations.css'
type Notify=(message:string)=>void
const message=(error:unknown)=>error instanceof Error?error.message:'No fue posible completar la operacion.'
export function ResourceState({loading,error,reload}:{loading:boolean;error:string;reload:()=>void}) {return error?<div className="ops-error" role="alert"><strong>No pudimos cargar esta sección</strong><p>{error}</p><button className="secondary-button" onClick={reload}>Reintentar</button></div>:loading?<div className="ops-skeleton" role="status" aria-label="Cargando información"><span/><span/><span/></div>:null}
export function ActionForm({onSave,children,label='Guardar',notify,resetOnSuccess=true,successMessage='Cambios guardados correctamente'}:{onSave:(form:FormData)=>Promise<unknown>;children:ReactNode;label?:string;notify:Notify;resetOnSuccess?:boolean;successMessage?:string}) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState('')
  const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(busy)return;const form=e.currentTarget;setBusy(true);setError('');try{await onSave(new FormData(form));if(resetOnSuccess)form.reset();if(successMessage)notify(successMessage)}catch(err){setError(message(err))}finally{setBusy(false)}}
  return <form className="ops-form" onSubmit={submit}><fieldset disabled={busy}>{children}{error&&<p className="ops-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy?'Guardando…':label}</button></fieldset></form>
}
