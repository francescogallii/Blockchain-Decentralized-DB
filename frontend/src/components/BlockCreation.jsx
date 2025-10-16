import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { 
  Blocks, 
  User, 
  Lock, 
  Cpu, 
  Clock, 
  Hash,
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Upload
} from 'lucide-react';
import { apiCall } from '../utils/api';
import { validatePrivateKeyPem } from '../utils/cryptoUtils';

const BlockCreation = () => {
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [miningProgress, setMiningProgress] = useState(null);
  const [createdBlock, setCreatedBlock] = useState(null);
  
  const queryClient = useQueryClient();
  
  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm();

  // Fetch creators list
  const { data: creators, isLoading: loadingCreators } = useQuery(
    'creators',
    () => apiCall('/api/creators')
  );

  // Block creation mutation
  const createBlockMutation = useMutation(
    (data) => {
      // Setup mining progress tracking
      setMiningProgress({ status: 'starting', startTime: Date.now() });
      
      return apiCall('/api/blocks', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    {
      onSuccess: (response) => {
        setMiningProgress({ 
          status: 'completed', 
          duration: Date.now() - (miningProgress?.startTime || Date.now())
        });
        
        setCreatedBlock(response.block);
        toast.success('Blocco creato e minato con successo!');
        
        // Invalidate queries to refresh data
        queryClient.invalidateQueries('blocks');
        queryClient.invalidateQueries('dashboard-stats');
        
        setTimeout(() => {
          setMiningProgress(null);
        }, 3000);
      },
      onError: (error) => {
        setMiningProgress({ 
          status: 'failed', 
          error: error.message,
          duration: Date.now() - (miningProgress?.startTime || Date.now())
        });
        
        toast.error(`Errore creazione blocco: ${error.message}`);
        
        setTimeout(() => {
          setMiningProgress(null);
        }, 5000);
      }
    }
  );

  // Watch form values
  const selectedCreator = watch('display_name');
  const dataText = watch('data_text');
  const privateKeyPem = watch('private_key_pem');

  // Load private key from file
  const handleKeyFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 10000) { // 10KB limit
      toast.error('File della chiave troppo grande (max 10KB)');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      
      // Basic validation
      if (!content.includes('-----BEGIN PRIVATE KEY-----')) {
        toast.error('File non sembra essere una chiave privata RSA valida');
        return;
      }
      
      setValue('private_key_pem', content);
      toast.success('Chiave privata caricata dal file');
    };
    
    reader.onerror = () => {
      toast.error('Errore nella lettura del file');
    };
    
    reader.readAsText(file);
  };

  // Form submission
  const onSubmit = async (data) => {
    // Validate private key format
    try {
      const isValidKey = await validatePrivateKeyPem(data.private_key_pem);
      if (!isValidKey) {
        toast.error('Formato chiave privata non valido');
        return;
      }
    } catch (error) {
      toast.error('Errore validazione chiave privata');
      return;
    }
    
    createBlockMutation.mutate(data);
  };

  // Calculate estimated data size
  const estimatedSize = dataText ? new Blob([dataText]).size : 0;
  
  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Blocks className="h-7 w-7 mr-3" />
          Creazione Blocco Blockchain
        </h1>
        <p className="text-gray-600 mt-2">
          Crea un nuovo blocco con dati crittografati nella blockchain. Il processo include cifratura AES, 
          mining Proof-of-Work e firma digitale.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">
              Informazioni Blocco
            </h2>
            
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Creator Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Seleziona Creator *
                </label>
                <select
                  {...register('display_name', {
                    required: 'Seleziona un creator'
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loadingCreators}
                >
                  <option value="">
                    {loadingCreators ? 'Caricamento...' : 'Seleziona creator'}
                  </option>
                  {creators?.creators?.map((creator) => (
                    <option key={creator.creator_id} value={creator.display_name}>
                      {creator.display_name} ({creator.block_count} blocchi)
                    </option>
                  ))}
                </select>
                {errors.display_name && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.display_name.message}
                  </p>
                )}
              </div>

              {/* Data Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dati Sensibili da Crittografare *
                </label>
                <textarea
                  {...register('data_text', {
                    required: 'Inserisci i dati da crittografare',
                    maxLength: {
                      value: 1024 * 1024, // 1MB
                      message: 'Dati troppo lunghi (max 1MB)'
                    }
                  })}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Inserisci qui i dati sensibili che verranno crittografati e salvati nel blocco..."
                />
                {errors.data_text && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.data_text.message}
                  </p>
                )}
                <div className="flex justify-between items-center mt-2 text-sm text-gray-500">
                  <span>Dimensione stimata: {estimatedSize} bytes</span>
                  <span>{dataText ? dataText.length : 0} caratteri</span>
                </div>
              </div>

              {/* Private Key Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chiave Privata RSA *
                </label>
                <div className="space-y-3">
                  {/* File upload option */}
                  <div>
                    <input
                      type="file"
                      accept=".pem,.key,.txt"
                      onChange={handleKeyFileUpload}
                      className="hidden"
                      id="keyFileUpload"
                    />
                    <label
                      htmlFor="keyFileUpload"
                      className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Carica da file
                    </label>
                  </div>
                  
                  {/* Manual input */}
                  <div className="relative">
                    <textarea
                      {...register('private_key_pem', {
                        required: 'Chiave privata richiesta',
                        pattern: {
                          value: /-----BEGIN PRIVATE KEY-----/,
                          message: 'Formato chiave privata non valido'
                        }
                      })}
                      rows={6}
                      type={showPrivateKey ? 'text' : 'password'}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                      placeholder="-----BEGIN PRIVATE KEY-----&#10;MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...&#10;-----END PRIVATE KEY-----"
                      style={!showPrivateKey ? { 
                        WebkitTextSecurity: 'disc',
                        textSecurity: 'disc'
                      } : {}}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPrivateKey(!showPrivateKey)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                    >
                      {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {errors.private_key_pem && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.private_key_pem.message}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={createBlockMutation.isLoading || !!miningProgress}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                {createBlockMutation.isLoading ? (
                  <>
                    <Cpu className="h-5 w-5 animate-spin" />
                    <span>Mining in corso...</span>
                  </>
                ) : (
                  <>
                    <Blocks className="h-5 w-5" />
                    <span>Crea e Mina Blocco</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Security Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 mb-2">
                  Processo di Creazione Blocco
                </p>
                <ol className="text-amber-700 space-y-1 list-decimal list-inside">
                  <li>I dati vengono crittografati con AES-256-GCM</li>
                  <li>La chiave AES viene cifrata con la tua chiave pubblica RSA</li>
                  <li>Viene eseguito il mining Proof-of-Work</li>
                  <li>Il blocco viene firmato digitalmente</li>
                  <li>Il blocco viene salvato nella blockchain</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Mining Progress */}
          {miningProgress && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Stato Mining
              </h3>
              
              {miningProgress.status === 'starting' && (
                <div className="text-center">
                  <Cpu className="h-12 w-12 text-blue-500 mx-auto mb-3 animate-spin" />
                  <p className="font-medium text-blue-600">Mining in corso...</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Ricerca nonce per Proof-of-Work
                  </p>
                </div>
              )}
              
              {miningProgress.status === 'completed' && (
                <div className="text-center">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <p className="font-medium text-green-600">Mining completato!</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Tempo: {Math.round(miningProgress.duration / 1000)}s
                  </p>
                </div>
              )}
              
              {miningProgress.status === 'failed' && (
                <div className="text-center">
                  <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-3" />
                  <p className="font-medium text-red-600">Mining fallito</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {miningProgress.error}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Created Block Info */}
          {createdBlock && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Blocco Creato
              </h3>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">ID Blocco:</span>
                  <span className="font-mono text-xs">
                    {createdBlock.block_id.substring(0, 8)}...
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Numero:</span>
                  <span className="font-medium">#{createdBlock.block_number}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Hash:</span>
                  <span className="font-mono text-xs">
                    {createdBlock.block_hash.substring(0, 16)}...
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Nonce:</span>
                  <span className="font-mono">{createdBlock.nonce}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Difficoltà:</span>
                  <span className="font-medium">{createdBlock.difficulty}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Tentativi:</span>
                  <span className="font-medium">{createdBlock.attempts?.toLocaleString()}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Tempo Mining:</span>
                  <span className="font-medium">
                    {Math.round(createdBlock.mining_duration_ms / 1000)}s
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Dimensione:</span>
                  <span className="font-medium">
                    {Math.round(createdBlock.data_size / 1024)} KB
                  </span>
                </div>
              </div>
              
              <button
                onClick={() => setCreatedBlock(null)}
                className="w-full mt-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Chiudi
              </button>
            </div>
          )}

          {/* Mining Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Informazioni Mining
            </h3>
            
            <div className="space-y-4 text-sm">
              <div className="flex items-center space-x-2">
                <Hash className="h-4 w-4 text-blue-500" />
                <span className="text-gray-600">Algoritmo: SHA-256</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <Blocks className="h-4 w-4 text-green-500" />
                <span className="text-gray-600">Difficoltà: 4 (default)</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-orange-500" />
                <span className="text-gray-600">Timeout: 2 minuti</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <Lock className="h-4 w-4 text-purple-500" />
                <span className="text-gray-600">Cifratura: AES-256-GCM</span>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">
                Il mining Proof-of-Work garantisce l'integrità del blocco 
                richiedendo potenza computazionale per trovare un hash valido.
              </p>
            </div>
          </div>

          {/* Selected Creator Info */}
          {selectedCreator && creators?.creators && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Creator Selezionato
              </h3>
              
              {(() => {
                const creator = creators.creators.find(c => c.display_name === selectedCreator);
                if (!creator) return null;
                
                return (
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center space-x-2">
                      <User className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">{creator.display_name}</span>
                    </div>
                    
                    <div className="space-y-2 text-gray-600">
                      <div className="flex justify-between">
                        <span>Blocchi creati:</span>
                        <span className="font-medium">{creator.block_count}</span>
                      </div>
                      
                      <div className="flex justify-between">
                        <span>Algoritmo chiave:</span>
                        <span className="font-medium">{creator.key_algorithm}</span>
                      </div>
                      
                      <div className="flex justify-between">
                        <span>Dimensione chiave:</span>
                        <span className="font-medium">{creator.key_size}-bit</span>
                      </div>
                      
                      <div className="flex justify-between">
                        <span>Registrato:</span>
                        <span className="font-medium">
                          {new Date(creator.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlockCreation;
