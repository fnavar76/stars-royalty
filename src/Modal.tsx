import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);const id=useId()
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close()},[])
  return <dialog ref={ref} className="ops-dialog" aria-labelledby={id} onCancel={e=>{e.preventDefault();onClose()}}><div className="ops-dialog-header"><h2 id={id}>{title}</h2><button className="icon-button" type="button" aria-label="Cerrar ventana" onClick={onClose}><X size={20}/></button></div>{children}</dialog>
}
