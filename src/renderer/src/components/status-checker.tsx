import React, { useEffect, useState } from 'react'
import { pingServices, type PingResult } from '@renderer/utils/ipc'
import { Card, CardContent } from '@renderer/components/ui/card'
import { RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react'

export const StatusChecker: React.FC = () => {
  const [results, setResults] = useState<PingResult[]>([])
  const [checking, setChecking] = useState(false)

  const check = async () => {
    setChecking(true)
    try {
      const res = await pingServices()
      setResults(res)
    } catch (e) {
      console.error(e)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    check()
    const interval = setInterval(check, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Card className="bg-card/50 border-stroke">
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Статус сервисов
          </div>
          <button 
            onClick={check} 
            disabled={checking}
            className={`text-muted-foreground hover:text-foreground transition-colors ${checking ? 'animate-spin' : ''}`}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {results.length > 0 ? (
            results.map((r) => (
              <div key={r.service} className="flex flex-col items-center justify-center p-2 rounded-md bg-background/50 border border-border">
                <span className="text-xs font-medium mb-1">{r.service}</span>
                {r.status === 'ok' ? (
                  <div className="flex items-center gap-1 text-green-500">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-[10px] font-mono">{r.latencyMs}ms</span>
                  </div>
                ) : r.status === 'timeout' ? (
                  <div className="flex items-center gap-1 text-yellow-500">
                    <Clock className="w-4 h-4" />
                    <span className="text-[10px]">Таймаут</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-500">
                    <XCircle className="w-4 h-4" />
                    <span className="text-[10px]">Ошибка</span>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="col-span-full text-center text-xs text-muted-foreground">
              Проверка доступности...
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
