import { Component, type ReactNode } from 'react'
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false}
  static getDerivedStateFromError(){return {failed:true}}
  render(){return this.state.failed?<main className="login-shell"><section className="login-card"><p className="eyebrow">Stars Royalty</p><h1>Vamos a recuperar tu espacio de trabajo</h1><p>Ocurrió un problema al mostrar esta pantalla. Los registros guardados se conservan; revisa el último movimiento antes de repetir una operación.</p><button className="primary-button" onClick={()=>window.location.reload()}>Volver a cargar</button></section></main>:this.props.children}
}
