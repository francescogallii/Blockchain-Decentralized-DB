import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { 
  Blocks, 
  Search, 
  Filter, 
  Hash, 
  User, 
  Clock, 
  Shield, 
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  Database
} from 'lucide-react';
import { apiCall } from '../utils/api';

const BlockChain = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState('all'); // 'all', 'verified', 'unverified'
  const [expandedBlock, setExpandedBlock] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState('newest'); // 'newest', 'oldest', 'block_number'
  
  const pageSize = 10;

  // Fetch blocks with pagination
  const { data: blocksData, isLoading, error, refetch } = useQuery(
    ['blocks', currentPage, verifiedFilter, sortBy],
    () => apiCall(`/blocks?page=${currentPage}&limit=${pageSize}${
      verifiedFilter !== 'all' ? `&verified=${verifiedFilter === 'verified'}` : ''
    }`),
    {
      keepPreviousData: true,
      refetchInterval: 30000, // Refetch ogni 30 secondi
    }
  );

  // Filtra i blocchi in base alla ricerca
  const filteredBlocks = blocksData?.blocks?.filter(block => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      block.block_hash.toLowerCase().includes(searchLower) ||
      block.creator_name?.toLowerCase().includes(searchLower) ||
      block.block_id.toLowerCase().includes(searchLower) ||
      block.block_number.toString().includes(searchLower)
    );
  }) || [];

  // Componente per i dettagli del blocco espanso
  const BlockDetail = ({ block }) => (
    <div className="mt-4 p-4 bg-gray-50 rounded-lg border-l-4 border-blue-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Block ID:</span>
            <span className="font-mono text-xs">{block.block_id}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-600">Hash Precedente:</span>
            <span className="font-mono text-xs">
              {block.previous_hash 
                ? `${block.previous_hash.substring(0, 16)}...`
                : 'Genesis Block'
              }
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-600">Nonce:</span>
            <span className="font-mono">{block.nonce}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-600">Dimensione Dati:</span>
            <span className="font-medium">
              {Math.round(block.data_size / 1024)} KB
            </span>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Creator:</span>
            <span className="font-medium">
              {block.creator_name || 'Anonimo'}
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-600">Creato:</span>
            <span className="font-medium">
              {new Date(block.created_at).toLocaleString()}
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-600">Tempo Mining:</span>
            <span className="font-medium">
              {block.mining_duration_ms 
                ? `${Math.round(block.mining_duration_ms / 1000)}s`
                : 'N/A'
              }
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-600">Verificato:</span>
            <span className={`font-medium ${
              block.verified ? 'text-green-600' : 'text-yellow-600'
            }`}>
              {block.verified ? 'Sì' : 'Pendente'}
              {block.verified_at && (
                <span className="text-xs text-gray-500 ml-1">
                  ({new Date(block.verified_at).toLocaleDateString()})
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
      
      {/* Hash Breakdown */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="text-xs text-gray-600 mb-2">Hash Completo:</div>
        <div className="font-mono text-xs bg-white p-2 rounded border break-all">
          {block.block_hash}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Difficoltà {block.difficulty}: Inizia con {block.difficulty} zeri
        </div>
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <span className="text-red-700">
              Errore nel caricamento della blockchain: {error.message}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Database className="h-7 w-7 mr-3" />
          Esplora Blockchain
        </h1>
        <p className="text-gray-600 mt-2">
          Visualizza e esplora tutti i blocchi della blockchain con dati crittografati
        </p>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0 md:space-x-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cerca per hash, creator, ID blocco..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Filters */}
          <div className="flex space-x-4">
            <select
              value={verifiedFilter}
              onChange={(e) => setVerifiedFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Tutti i blocchi</option>
              <option value="verified">Solo verificati</option>
              <option value="unverified">Non verificati</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="newest">Più recenti</option>
              <option value="oldest">Più vecchi</option>
              <option value="block_number">Numero blocco</option>
            </select>
          </div>
        </div>

        {/* Stats */}
        {blocksData && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center">
                <div className="font-semibold text-lg text-blue-600">
                  {blocksData.pagination.totalCount}
                </div>
                <div className="text-gray-600">Blocchi Totali</div>
              </div>
              
              <div className="text-center">
                <div className="font-semibold text-lg text-green-600">
                  {filteredBlocks.filter(b => b.verified).length}
                </div>
                <div className="text-gray-600">Verificati</div>
              </div>
              
              <div className="text-center">
                <div className="font-semibold text-lg text-yellow-600">
                  {filteredBlocks.filter(b => !b.verified).length}
                </div>
                <div className="text-gray-600">Pendenti</div>
              </div>
              
              <div className="text-center">
                <div className="font-semibold text-lg text-purple-600">
                  {new Set(filteredBlocks.map(b => b.creator_name).filter(Boolean)).size}
                </div>
                <div className="text-gray-600">Creators</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Blocks List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
              <div className="flex items-center justify-between mb-4">
                <div className="h-6 bg-gray-200 rounded w-32"></div>
                <div className="h-4 bg-gray-200 rounded w-24"></div>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-full"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredBlocks.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Blocks className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nessun blocco trovato
          </h3>
          <p className="text-gray-600">
            {searchTerm 
              ? 'Nessun blocco corrisponde ai criteri di ricerca.'
              : 'Non ci sono ancora blocchi nella blockchain.'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBlocks.map((block) => (
            <div key={block.block_id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
              <div className="p-6">
                {/* Block Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-full ${
                      block.verified ? 'bg-green-100' : 'bg-yellow-100'
                    }`}>
                      {block.verified ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <Clock className="h-5 w-5 text-yellow-600" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Blocco #{block.block_number}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {new Date(block.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setExpandedBlock(
                      expandedBlock === block.block_id ? null : block.block_id
                    )}
                    className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Eye className="h-4 w-4" />
                    <span>
                      {expandedBlock === block.block_id ? 'Nascondi' : 'Dettagli'}
                    </span>
                    {expandedBlock === block.block_id ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Block Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="flex items-center space-x-2">
                    <Hash className="h-4 w-4 text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">Hash</div>
                      <div className="font-mono text-sm">
                        {block.block_hash.substring(0, 16)}...
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <User className="h-4 w-4 text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">Creator</div>
                      <div className="font-medium text-sm">
                        {block.creator_name || 'Anonimo'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Shield className="h-4 w-4 text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">Difficoltà</div>
                      <div className="font-medium text-sm">
                        {block.difficulty}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Hash visualization */}
                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                  <div className="text-xs text-gray-600 mb-1">Hash del Blocco:</div>
                  <div className="font-mono text-xs break-all">
                    <span className="text-green-600 font-bold">
                      {'0'.repeat(block.difficulty)}
                    </span>
                    <span className="text-gray-800">
                      {block.block_hash.substring(block.difficulty)}
                    </span>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedBlock === block.block_id && (
                  <BlockDetail block={block} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {blocksData && blocksData.pagination.totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Pagina {blocksData.pagination.page} di {blocksData.pagination.totalPages}
            ({blocksData.pagination.totalCount} blocchi totali)
          </div>

          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={!blocksData.pagination.hasPrev}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Precedente
            </button>

            <div className="flex space-x-1">
              {[...Array(Math.min(5, blocksData.pagination.totalPages))].map((_, i) => {
                const pageNum = Math.max(1, currentPage - 2) + i;
                if (pageNum > blocksData.pagination.totalPages) return null;

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-2 rounded-lg ${
                      pageNum === currentPage
                        ? 'bg-blue-600 text-white'
                        : 'border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={!blocksData.pagination.hasNext}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Successivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlockChain;