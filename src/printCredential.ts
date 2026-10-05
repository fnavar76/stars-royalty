/** Opens one credential in its own standard-card print document. */
export function printCredentialCard(card: HTMLElement | null) {
  if (!card) return
  const popup = window.open('', '_blank', 'width=420,height=300')
  if (!popup) return window.print()
  const styleText = Array.from(document.styleSheets).map((sheet) => {
    try { return Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n') } catch { return '' }
  }).join('\n')
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Credencial Stars Royalty</title><style>${styleText}
    @page { size: 85.6mm 54mm; margin: 0; }
    html, body { width: 85.6mm; height: 54mm; margin: 0; overflow: hidden; background: #fff; }
    .credential-card { box-sizing: border-box; width: 99.5mm !important; min-height: 62.8mm !important; height: 62.8mm !important; margin: 0 !important; border-radius: 0 !important; box-shadow: none !important; transform: scale(.86); transform-origin: top left; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    @media print { body *, .credential-card, .credential-card * { visibility: visible !important; } }
  </style></head><body>${card.outerHTML}</body></html>`)
  popup.document.close()
  const print = () => { popup.focus(); popup.print(); popup.onafterprint = () => popup.close() }
  window.setTimeout(print, 350)
}

/** Prints only the executive indicator section, outside the application layout. */
export function printReportSummary(section: HTMLElement | null) {
  if (!section) return
  const popup = window.open('', '_blank', 'width=900,height=700')
  if (!popup) return window.print()
  const styleText = Array.from(document.styleSheets).map((sheet) => {
    try { return Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n') } catch { return '' }
  }).join('\n')
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Reporte ejecutivo Stars Royalty</title><style>${styleText}
    @page { size: A4; margin: 14mm; }
    html, body { margin: 0; background: #fff; }
    .standalone-report { color: #25212b; }
    .standalone-report h1 { margin: 0 0 5mm; font: 700 20pt Georgia, serif; color: #35283b; }
    .standalone-report p { margin: 0 0 8mm; color: #716876; font-size: 10pt; }
    .standalone-report .module-stats { grid-template-columns: repeat(2, 1fr); margin: 0; }
    .standalone-report .stat-card { min-height: 0; box-shadow: none; break-inside: avoid; page-break-inside: avoid; }
    @media print { body *, .standalone-report, .standalone-report * { visibility: visible !important; } }
  </style></head><body><main class="standalone-report"><h1>Reporte Ejecutivo</h1><p>Stars Royalty · Resumen operativo y financiero</p>${section.outerHTML}</main></body></html>`)
  popup.document.close()
  const print = () => { popup.focus(); popup.print(); popup.onafterprint = () => popup.close() }
  window.setTimeout(print, 350)
}
