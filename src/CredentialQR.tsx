import { useEffect, useState } from 'react'

/** The encoded folio is resolved by the authenticated reception validator. */
export function CredentialQR({ code }: { code?: string }) {
  const [image, setImage] = useState<{ code: string; url: string } | null>(null)
  useEffect(() => {
    let current = true
    if (code) void import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(code, { width: 180, margin: 4, errorCorrectionLevel: 'M' }))
      .then((url) => { if (current) setImage({ code, url }) })
      .catch(() => { if (current) setImage(null) })
    return () => { current = false }
  }, [code])
  return image && image.code === code && code
    ? <img src={image.url} alt={`Código QR de la credencial ${code}`} width={90} height={90} />
    : <span style={{ color: '#3b2147', fontSize: 10 }}>{code ? 'Preparando QR…' : 'Sin credencial emitida'}</span>
}
