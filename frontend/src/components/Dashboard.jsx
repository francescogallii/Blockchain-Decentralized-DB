import React from 'react'
import { useQuery } from 'react-query'
import { apiCall } from '../utils/api'
import { Users, Blocks, Shield, Activity } from 'lucide-react'

function Dashboard() {
  const { data, isLoading, error } = useQuery(
    'system-stats',
    () => Promise.all([apiCall('/api/creators/stats/summary'), apiCall('/api/blocks/stats/summary')])
  )

  if (isLoading) return <div>Caricamento...</div>
  if (error) return <div>Errore nel caricamento</div>

  const [creatorsStats, blocksStats] = data

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Creators */}
      <div className="bg-white p-4 rounded shadow flex flex-col items-center">
        <Users className="w-8 h-8 text-blue-600" />
        <div className="mt-2 text-xl font-bold">{creatorsStats.stats.total_creators}</div>
        <div className="text-sm text-gray-600">Creators</div>
      </div>
      {/* Blocchi */}
      <div className="bg-white p-4 rounded shadow flex flex-col items-center">
        <Blocks className="w-8 h-8 text-green-600" />
        <div className="mt-2 text-xl font-bold">{blocksStats.stats.total_blocks}</div>
        <div className="text-sm text-gray-600">Blocchi</div>
      </div>
      {/* Tasso verifica */}
      <div className="bg-white p-4 rounded shadow flex flex-col items-center">
        <Shield className="w-8 h-8 text-yellow-600" />
        <div className="mt-2 text-xl font-bold">{Math.round((blocksStats.stats.verified_blocks / blocksStats.stats.total_blocks) * 100)}%</div>
        <div className="text-sm text-gray-600">Verificato & Pendenti</div>
      </div>
      {/* Tempo Mining medio */}
      <div className="bg-white p-4 rounded shadow flex flex-col items-center">
        <Activity className="w-8 h-8 text-purple-600" />
        <div className="mt-2 text-xl font-bold">N/A</div>
        <div className="text-sm text-gray-600">Tempo Medio</div>
      </div>
    </div>
  )
}

export default Dashboard
