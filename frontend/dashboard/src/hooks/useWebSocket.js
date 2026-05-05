import { useEffect, useRef, useCallback } from 'react'
import { getWSUrl } from '../api'

/**
 * useWebSocket — connects to the backend WS and fires onEvent for each message.
 * Auto-reconnects on disconnect with exponential backoff.
 *
 * onEvent(event, data) is called for:
 *   bill_created    → new bill arrived from Foodics or manual entry
 *   payment_update  → partial payment completed on a bill
 *   bill_settled    → bill fully paid, table is free
 */
export function useWebSocket(onEvent, enabled = true) {
  const wsRef = useRef(null)
  const reconnectTimeout = useRef(null)
  const attempts = useRef(0)

  const connect = useCallback(() => {
    if (!enabled) return
    const url = getWSUrl()
    if (!url.includes('token=') || url.includes('token=null')) return

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      attempts.current = 0
    }

    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data)
        onEvent(event, data)
      } catch (_) {}
    }

    ws.onclose = () => {
      if (!enabled) return
      const delay = Math.min(1000 * 2 ** attempts.current, 30000)
      attempts.current++
      reconnectTimeout.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [enabled, onEvent])

  useEffect(() => {
    connect()
    return () => {
      enabled && wsRef.current?.close()
      clearTimeout(reconnectTimeout.current)
    }
  }, [connect, enabled])
}
