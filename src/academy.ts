import { useEffect, useState } from 'react'
import { request } from './api'
import type { Academy } from './OperationsCenter'

export function useAcademy() {
  const [academy,setAcademy]=useState<Academy|null>(null)
  useEffect(()=>{let active=true;const load=()=>{void request<Academy>('/api/academy').then(data=>{if(active)setAcademy(data)}).catch(()=>{})};load();window.addEventListener('stars-academy-changed',load);return()=>{active=false;window.removeEventListener('stars-academy-changed',load)}},[])
  return academy
}
