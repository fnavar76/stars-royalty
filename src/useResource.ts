import { useCallback, useEffect, useRef, useState } from 'react'
import { request } from './api'

export function useResource<T>(path: string, initial: T) {
  const [state, setState] = useState<{path:string;data?:T;error:string;loading:boolean}>({path:'',error:'',loading:true})
  const pending = useRef<AbortController|null>(null)
  const cancel = useCallback(() => pending.current?.abort(), [])
  const fetchData = useCallback(() => {
    cancel()
    const controller = new AbortController()
    pending.current = controller
    return request<T>(path, {signal:controller.signal}).then(data => {
      if (!controller.signal.aborted) setState({path,data,error:'',loading:false})
    }).catch((error:unknown) => {
      if (!controller.signal.aborted) setState({path,error:error instanceof Error ? error.message : 'No fue posible cargar la información.',loading:false})
    })
  }, [path,cancel])
  const reload = useCallback(() => {
    setState(previous => ({...previous,error:'',loading:true}))
    return fetchData()
  }, [fetchData])
  useEffect(() => {
    void fetchData()
    return cancel
  }, [fetchData,cancel])
  return {data:state.path===path ? state.data??initial : initial,reload,error:state.path===path?state.error:'',loading:state.path!==path||state.loading}
}
