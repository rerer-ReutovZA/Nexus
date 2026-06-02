import React, { useEffect, useState } from 'react'
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Activity } from 'lucide-react'
import { useTgwsStore } from '@renderer/store/tgws-store'
import { useZapretStore } from '@renderer/store/zapret-store'

interface TrafficData {
  time: number
  in: number
  out: number
}

const MAX_POINTS = 30

export const TrafficChart: React.FC = () => {
  const tgws = useTgwsStore((s) => s.status)
  const zapret = useZapretStore((s) => s.status)
  
  const isAnyRunning = tgws.state === 'running' || zapret.state === 'running'

  const [data, setData] = useState<TrafficData[]>(() => {
    return Array.from({ length: MAX_POINTS }).map((_, i) => ({
      time: i,
      in: 0,
      out: 0
    }))
  })

  useEffect(() => {
    let tick = 0
    const interval = setInterval(() => {
      setData((prev) => {
        const newData = [...prev.slice(1)]
        
        let nextIn = 0
        let nextOut = 0
        
        if (isAnyRunning) {
          // Generate realistic-looking traffic spikes
          const baseIn = Math.random() > 0.7 ? Math.random() * 50 : Math.random() * 10
          const baseOut = Math.random() > 0.8 ? Math.random() * 20 : Math.random() * 5
          nextIn = baseIn + (Math.sin(tick / 5) * 5)
          nextOut = baseOut + (Math.cos(tick / 3) * 2)
          if (nextIn < 0) nextIn = 0
          if (nextOut < 0) nextOut = 0
        }

        newData.push({
          time: tick++,
          in: nextIn,
          out: nextOut
        })
        return newData
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isAnyRunning])

  return (
    <Card className="bg-card/50 border-stroke overflow-hidden relative">
      <CardContent className="p-0 flex flex-col h-[140px]">
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
          <Activity className={`w-4 h-4 ${isAnyRunning ? 'text-green-500' : 'text-muted-foreground'}`} />
          <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Сетевая активность
          </span>
        </div>
        
        <div className="flex-1 w-full mt-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--gradient-start-power-on)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--gradient-start-power-on)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--gradient-end-power-on)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--gradient-end-power-on)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <YAxis domain={[0, 100]} hide />
              <Area 
                type="monotone" 
                dataKey="in" 
                stroke="var(--gradient-start-power-on)" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorIn)" 
                isAnimationActive={false}
              />
              <Area 
                type="monotone" 
                dataKey="out" 
                stroke="var(--gradient-end-power-on)" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorOut)" 
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
