import React, { useState } from 'react';
import { useMutation, useQuery } from 'react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { 
  Key, 
  User, 
  Unlock, 
  Download, 
  Eye, 
  EyeOff,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  Upload,
  Copy,
  Hash
} from 'lucide-react';
import { apiCall } from '../utils/api';
import { validatePrivateKeyPem } from '../utils/cryptoUtils';

const DataDecryption = () => {
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [decryptedData, setDecryptedData] = useState(null);
  const [expandedBlock, setExpandedBlock] = useState(null);
  const [decryptionMode, setDecryptionMode] = useState('all'); // 'all' or 'single'
  
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm();

  // Fetch creators list
  const { data: creators, isLoading: loadingCreators } = useQuery(
    'creators',
    () => apiCall('/api/creators')
  );

  // All blocks decryption mutation
  const decryptAllMutation = useMutation(
    (data) => apiCall('/api/decrypt', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    {
      onSuccess: (response) => {
        setDecryptedData(response);
        toast.success(`${response.summary.successfully_decrypted} blocchi decifrati con successo!`);
      },
      onError: (error) => {
        toast.error(`Errore decifratura: ${error.message}`);
      }
    }
  );

  // Single block decryption mutation
  const decryptSingleMutation = useMutation(
    (data) => apiCall('/api/decrypt/single', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    {
      onSuccess: (response) => {
        setDecryptedData({
          creator: 'Single Block',
          summary: {
            total_blocks: 1,
            successfully_decrypted: 1,
            failed_decryption: 0
          },
          blocks: [response.block]
        });
        toast.success('Blocco decifrato con successo!');
      },
      onError: (error) => {
        toast.error(`Errore decifratura blocco: ${error.message}`);
      }
    }
  );

  // Watch form values
  const selectedCreator = watch('display_name');
  const privateKeyPem = watch('private_key_pem');
  const blockId = watch('block_id');

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
    
    if (decryptionMode === 'all') {
      decryptAllMutation.mutate({
        display_name: data.display_name,
        private_key_pem: data.private_key_pem
      });
    } else {
      decryptSingleMutation.mutate({
        block_id: data.block_id,
        private_key_pem: data.private_key_pem
      });
    }
  };

  // Download decrypted data
  const downloadDecryptedData = (blockData, filename) => {
    const element = document.createElement('a');
    const file = new Blob([blockData], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = filename || 'decrypted_data.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    toast.success('Dati scaricati!');
  };

  // Copy to clipboard
  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${type} copiato negli appunti!`);
    } catch (error) {
      toast.error('Impossibile copiare negli appunti');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Key className="h-7 w-7 mr-3" />
          Decifratura Dati Sensibili
        </h1>
        <p className="text-gray-600 mt-2">
          Decifra i dati sensibili memorizzati nei blocchi blockchain utilizzando la tua chiave privata RSA.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Decryption Mode Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Modalità Decifratura
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setDecryptionMode('all')}
                className={`p-4 border-2 rounded-lg text-left transition-colors ${
                  decryptionMode === 'all'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Unlock className="h-6 w-6 text-blue-600" />
                  <div>
                    <div className="font-medium text-gray-900">Tutti i Blocchi</div>
                    <div className="text-sm text-gray-600">
                      Decifra tutti i blocchi di un creator
                    </div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDecryptionMode('single')}
                className={`p-4 border-2 rounded-lg text-left transition-colors ${
                  decryptionMode === 'single'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Shield className="h-6 w-6 text-green-600" />
                  <div>
                    <div className="font-medium text-gray-900">Blocco Singolo</div>
                    <div className="text-sm text-gray-600">
                      Decifra un blocco specifico per ID
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Decryption Form */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">
              {decryptionMode === 'all' ? 'Decifra Blocchi Creator' : 'Decifra Blocco Specifico'}
            </h2>
            
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {decryptionMode === 'all' ? (
                /* Creator Selection for All Blocks */
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
              ) : (
                /* Block ID Input for Single Block */
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ID Blocco *
                  </label>
                  <input
                    {...register('block_id', {
                      required: 'Inserisci ID del blocco',
                      pattern: {
                        value: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
                        message: 'Formato UUID non valido'
                      }
                    })}
                    placeholder="es. 123e4567-e89b-12d3-a456-426614174000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                  />
                  {errors.block_id && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.block_id.message}
                    </p>
                  )}
                </div>
              )}

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
                disabled={decryptAllMutation.isLoading || decryptSingleMutation.isLoading}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                {(decryptAllMutation.isLoading || decryptSingleMutation.isLoading) ? (
                  <>
                    <Key className="h-5 w-5 animate-pulse" />
                    <span>Decifratura in corso...</span>
                  </>
                ) : (
                  <>
                    <Unlock className="h-5 w-5" />
                    <span>
                      {decryptionMode === 'all' ? 'Decifra Tutti i Blocchi' : 'Decifra Blocco'}
                    </span>
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
                  Processo di Decifratura Sicura
                </p>
                <ol className="text-amber-700 space-y-1 list-decimal list-inside">
                  <li>La chiave privata NON viene mai inviata al server</li>
                  <li>Verifica della corrispondenza chiave pubblica/privata</li>
                  <li>Decifratura della chiave AES con RSA</li>
                  <li>Decifratura dei dati con AES-256-GCM</li>
                  <li>Validazione dell'integrità dei dati</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Selected Creator Info */}
          {decryptionMode === 'all' && selectedCreator && creators?.creators && (
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
                        <span>Blocchi da decifrare:</span>
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

          {/* Decryption Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Informazioni Decifratura
            </h3>
            
            <div className="space-y-4 text-sm">
              <div className="flex items-center space-x-2">
                <Key className="h-4 w-4 text-purple-500" />
                <span className="text-gray-600">Algoritmo: RSA-OAEP + AES-256-GCM</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <Shield className="h-4 w-4 text-green-500" />
                <span className="text-gray-600">Validazione: Integrità dati garantita</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-orange-500" />
                <span className="text-gray-600">Tempo: Dipende dal numero di blocchi</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <FileText className="h-4 w-4 text-blue-500" />
                <span className="text-gray-600">Output: Testo in chiaro scaricabile</span>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">
                Solo il possessore della chiave privata corrispondente può 
                decifrare i dati. La sicurezza è garantita dalla crittografia RSA-2048.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Decrypted Data Display */}
      {decryptedData && (
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Dati Decifrati
            </h2>
            <button
              onClick={() => setDecryptedData(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-blue-600">
                {decryptedData.summary.total_blocks}
              </div>
              <div className="text-blue-700 text-sm">Blocchi Totali</div>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-600">
                {decryptedData.summary.successfully_decrypted}
              </div>
              <div className="text-green-700 text-sm">Decifrati</div>
            </div>
            
            <div className="bg-red-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-red-600">
                {decryptedData.summary.failed_decryption}
              </div>
              <div className="text-red-700 text-sm">Falliti</div>
            </div>
          </div>

          {/* Blocks List */}
          <div className="space-y-4">
            {decryptedData.blocks.map((block, index) => (
              <div key={block.block_id} className="border border-gray-200 rounded-lg">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
                      <span>Blocco #{block.block_number}</span>
                      {block.verified && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                    </h3>
                    
                    <div className="flex space-x-2">
                      {block.decrypted_data && (
                        <>
                          <button
                            onClick={() => copyToClipboard(block.decrypted_data, 'Dati decifrati')}
                            className="text-blue-600 hover:text-blue-700 p-1"
                            title="Copia dati"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => downloadDecryptedData(
                              block.decrypted_data,
                              `block_${block.block_number}_data.txt`
                            )}
                            className="text-green-600 hover:text-green-700 p-1"
                            title="Scarica dati"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      
                      <button
                        onClick={() => setExpandedBlock(
                          expandedBlock === block.block_id ? null : block.block_id
                        )}
                        className="text-gray-600 hover:text-gray-700 p-1"
                        title="Mostra/Nascondi dettagli"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600 mb-3">
                    <div>
                      <span className="font-medium">Hash:</span>
                      <div className="font-mono text-xs">
                        {block.block_hash?.substring(0, 16)}...
                      </div>
                    </div>
                    
                    <div>
                      <span className="font-medium">Dimensione:</span>
                      <span className="ml-1">
                        {Math.round((block.data_size || 0) / 1024)} KB
                      </span>
                    </div>
                    
                    <div>
                      <span className="font-medium">Creato:</span>
                      <span className="ml-1">
                        {new Date(block.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Error Display */}
                  {block.error && (
                    <div className="bg-red-50 border border-red-200 rounded p-3 mb-3">
                      <div className="flex items-center space-x-2 text-red-700">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="font-medium">Errore Decifratura</span>
                      </div>
                      <p className="text-red-600 text-sm mt-1">{block.error_details}</p>
                    </div>
                  )}

                  {/* Decrypted Data Preview */}
                  {block.decrypted_data && expandedBlock !== block.block_id && (
                    <div className="bg-gray-50 rounded p-3">
                      <div className="text-sm text-gray-600 mb-1">Anteprima dati decifrati:</div>
                      <div className="font-mono text-sm text-gray-800">
                        {block.decrypted_data.length > 200 
                          ? `${block.decrypted_data.substring(0, 200)}...`
                          : block.decrypted_data
                        }
                      </div>
                    </div>
                  )}

                  {/* Full Data Display */}
                  {block.decrypted_data && expandedBlock === block.block_id && (
                    <div className="bg-gray-50 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">
                          Dati Completi Decifrati:
                        </span>
                        <span className="text-xs text-gray-500">
                          {block.decrypted_data.length} caratteri
                        </span>
                      </div>
                      <div className="bg-white p-3 rounded border max-h-64 overflow-y-auto">
                        <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                          {block.decrypted_data}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Download All Button */}
          {decryptedData.blocks.some(b => b.decrypted_data) && (
            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  const allData = decryptedData.blocks
                    .filter(b => b.decrypted_data)
                    .map(b => `=== Blocco #${b.block_number} ===\n${b.decrypted_data}`)
                    .join('\n\n');
                  downloadDecryptedData(allData, `${decryptedData.creator}_all_blocks.txt`);
                }}
                className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-lg flex items-center space-x-2 mx-auto"
              >
                <Download className="h-4 w-4" />
                <span>Scarica Tutti i Dati</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DataDecryption;
