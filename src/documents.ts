import { request } from './api'

export async function downloadDocument(id: number, family = false) {
  const result = await request<{ name: string; fileData: string }>(`${family ? '/api/family' : '/api'}/documents/${id}/download`)
  const match = /^data:(application\/pdf|image\/(?:png|jpeg|webp)|text\/plain);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(result.fileData)
  if (!match) throw new Error('El archivo no tiene un formato descargable.')
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: match[1] }))
  const link = document.createElement('a')
  link.href = url
  link.download = result.name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
