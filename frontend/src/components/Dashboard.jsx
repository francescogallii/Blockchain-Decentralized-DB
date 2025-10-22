// Percorso: ./frontend/src/components/Dashboard.jsx (CORRETTO)

import React from 'react'
import { useQuery } from 'react-query'
import { apiCall } from '../utils/api'
import { Users, Blocks, Shield, Activity } from 'lucide-react'

function Dashboard() {
  const { data, isLoading, error } = useQuery(
    'dashboard-stats',
    async () => {
      const [creatorsStats, blocksStats] = await Promise.all([
        apiCall('/creators/stats/summary').catch(() => ({ stats: { total_creators: 0 } })),
        apiCall('/blocks/stats/summary').catch(() => ({ stats: { total_blocks: 0, verified_blocks: 0, avg_mining_time_ms: 0 } }))
      ]);
      return [creatorsStats, blocksStats];
    }
  )

  if (isLoading) return <div className="p-6 text-gray-600">Caricamento statistiche...</div>
  if (error) return <div className="p-6 text-red-600">Errore nel caricamento delle statistiche. Assicurati che il backend sia attivo.</div>

  const [creatorsStats, blocksStats] = data || [{ stats: {} }, { stats: {} }]

  // Calcola la percentuale di verifica in modo sicuro
  const totalBlocks = parseInt(blocksStats.stats?.total_blocks) || 0;
  const verifiedBlocks = parseInt(blocksStats.stats?.verified_blocks) || 0;
  const verificationRate = totalBlocks > 0
    ? Math.round((verifiedBlocks / totalBlocks) * 100)
    : 0;
  
  // Calcola il tempo di mining medio
  const avgMiningTimeMs = parseFloat(blocksStats.stats?.avg_mining_time_ms) || 0;
  const avgMiningTime = avgMiningTimeMs > 0 
    ? (avgMiningTimeMs / 1000).toFixed(2) + 's' 
    : 'N/A';
    

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-6 text-gray-800">Panoramica del Sistema</h2>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Creators */}
        <div className="bg-white p-6 rounded-xl shadow-lg flex flex-col items-center border border-gray-200">
          <Users className="w-8 h-8 text-blue-600 mb-3" />
          <div className="text-3xl font-bold text-gray-900">{creatorsStats.stats?.total_creators || 0}</div>
          <div className="text-sm text-gray-600 mt-1">Creators Registrati</div>
        </div>
        {/* Blocchi */}
        <div className="bg-white p-6 rounded-xl shadow-lg flex flex-col items-center border border-gray-200">
          <Blocks className="w-8 h-8 text-green-600 mb-3" />
          <div className="text-3xl font-bold text-gray-900">{totalBlocks}</div>
          <div className="text-sm text-gray-600 mt-1">Blocchi in Catena</div>
        </div>
        {/* Tasso verifica */}
        <div className="bg-white p-6 rounded-xl shadow-lg flex flex-col items-center border border-gray-200">
          <Shield className="w-8 h-8 text-yellow-600 mb-3" />
          <div className="text-3xl font-bold text-gray-900">{verificationRate}%</div>
          <div className="text-sm text-gray-600 mt-1">Tasso di Verifica</div>
        </div>
        {/* Tempo Mining medio */}
        <div className="bg-white p-6 rounded-xl shadow-lg flex flex-col items-center border border-gray-200">
          <Activity className="w-8 h-8 text-purple-600 mb-3" />
          <div className="mt-2 text-3xl font-bold">{avgMiningTime}</div>
          <div className="text-sm text-gray-600 mt-1">Tempo Mining Medio</div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard