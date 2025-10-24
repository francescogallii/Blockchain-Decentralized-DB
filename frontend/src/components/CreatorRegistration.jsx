import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { 
  User, 
  Key, 
  Download, 
  Copy, 
  AlertTriangle,
  CheckCircle,
  Users,
  Eye,
  EyeOff
} from 'lucide-react';
import { apiCall } from '../utils/api';
import { generateRSAKeyPair, exportKey } from '../utils/cryptoUtils';

const CreatorRegistration = () => {
  const [generatedKeys, setGeneratedKeys] = useState(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);
  
  const queryClient = useQueryClient();
  
  const { register, handleSubmit, formState: { errors }, setValue, reset } = useForm();

  // Fetch existing creators
  const { data: creators, isLoading: loadingCreators } = useQuery(
    'creators',
    // CORREZIONE: Rimosso /api/
    () => apiCall('/creators'),
    {
      refetchOnWindowFocus: false
    }
  );

  // Registration mutation
  const registerMutation = useMutation(
    // CORREZIONE: Rimosso /api/
    (data) => apiCall('/creators', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    {
      onSuccess: (response) => {
        toast.success('Creator registrato con successo!');
        queryClient.invalidateQueries('creators');
        queryClient.invalidateQueries('dashboard-stats');
        reset();
        setGeneratedKeys(null);
      },
      onError: (error) => {
        toast.error(`Errore registrazione: ${error.message}`);
      }
    }
  );

  // Generate RSA key pair
  const generateKeys = async () => {
    setIsGeneratingKeys(true);
    try {
      toast.loading('Generazione chiavi RSA in corso...', { id: 'key-generation' });
      
      const keyPair = await generateRSAKeyPair();
      const publicKeyPem = await exportKey(keyPair.publicKey, 'spki');
      const privateKeyPem = await exportKey(keyPair.privateKey, 'pkcs8');
      
      setGeneratedKeys({
        publicKey: publicKeyPem,
        privateKey: privateKeyPem
      });
      
      setValue('public_key_pem', publicKeyPem);
      
      toast.success('Chiavi RSA generate con successo!', { id: 'key-generation' });
    } catch (error) {
      console.error('Errore generazione chiavi:', error);
      toast.error('Errore nella generazione delle chiavi', { id: 'key-generation' });
    } finally {
      setIsGeneratingKeys(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${type} copiata negli appunti!`);
    } catch (error) {
      toast.error('Impossibile copiare negli appunti');
    }
  };

  // Download private key
  const downloadPrivateKey = () => {
    if (!generatedKeys?.privateKey) return;
    
    const element = document.createElement('a');
    const file = new Blob([generatedKeys.privateKey], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'blockchain_private_key.pem';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    
    toast.success('Chiave privata scaricata!');
  };

  // Form submission
  const onSubmit = async (data) => {
    if (!generatedKeys) {
      toast.error('Genera prima le chiavi RSA');
      return;
    }
    
    registerMutation.mutate({
      display_name: data.display_name,
      public_key_pem: generatedKeys.publicKey
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <User className="h-7 w-7 mr-3" />
          Registrazione Creator
        </h1>
        <p className="text-gray-600 mt-2">
          Registra un nuovo creator nel sistema blockchain. Le chiavi RSA verranno generate localmente nel browser.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Registration Form */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Informazioni Creator
            </h2>
            
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome Display *
                </label>
                <input
                  {...register('display_name', {
                    required: 'Nome display richiesto',
                    minLength: {
                      value: 3,
                      message: 'Nome deve essere almeno 3 caratteri'
                    },
                    maxLength: {
                      value: 255,
                      message: 'Nome deve essere massimo 255 caratteri'
                    },
                    pattern: {
                      value: /^[a-zA-Z0-9_-]+$/,
                      message: 'Solo lettere, numeri, _ e - consentiti'
                    }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="es. creator_blockchain_2025"
                />
                {errors.display_name && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.display_name.message}
                  </p>
                )}
              </div>

              {/* Key Generation Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chiavi RSA *
                </label>
                <div className="border border-gray-300 rounded-md p-4 bg-gray-50">
                  {!generatedKeys ? (
                    <div className="text-center">
                      <Key className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600 mb-4">
                        Genera una coppia di chiavi RSA-2048 per questo creator
                      </p>
                      <button
                        type="button"
                        onClick={generateKeys}
                        disabled={isGeneratingKeys}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-4 py-2 rounded-lg transition-colors"
                      >
                        {isGeneratingKeys ? 'Generazione...' : 'Genera Chiavi RSA'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center text-green-600">
                        <CheckCircle className="h-5 w-5 mr-2" />
                        <span className="font-medium">Chiavi RSA generate con successo!</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        <p>✓ Chiave pubblica: Inserita automaticamente</p>
                        <p>✓ Chiave privata: Pronta per il download</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!generatedKeys || registerMutation.isLoading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                {registerMutation.isLoading ? 'Registrazione...' : 'Registra Creator'}
              </button>
            </form>
          </div>

          {/* Security Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 mb-1">
                  Importante - Sicurezza Chiave Privata
                </p>
                <ul className="text-amber-700 space-y-1">
                  <li>• La chiave privata NON viene mai inviata al server</li>
                  <li>• Scarica e conserva la chiave privata in modo sicuro</li>
                  <li>• Senza la chiave privata non potrai decifrare i tuoi dati</li>
                  <li>• Non condividere mai la chiave privata</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Keys Display and Existing Creators */}
        <div className="space-y-6">
          {/* Generated Keys Display */}
          {generatedKeys && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Chiavi Generate
              </h3>
              
              {/* Public Key */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    Chiave Pubblica
                  </label>
                  <button
                    onClick={() => copyToClipboard(generatedKeys.publicKey, 'Chiave pubblica')}
                    className="text-blue-600 hover:text-blue-700 p-1"
                    title="Copia chiave pubblica"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <textarea
                  value={generatedKeys.publicKey}
                  readOnly
                  className="w-full h-32 px-3 py-2 text-xs font-mono border border-gray-300 rounded-md bg-gray-50"
                />
              </div>

              {/* Private Key */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    Chiave Privata
                  </label>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setShowPrivateKey(!showPrivateKey)}
                      className="text-gray-600 hover:text-gray-700 p-1"
                      title={showPrivateKey ? 'Nascondi' : 'Mostra'}
                    >
                      {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(generatedKeys.privateKey, 'Chiave privata')}
                      className="text-blue-600 hover:text-blue-700 p-1"
                      title="Copia chiave privata"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <textarea
                  value={showPrivateKey ? generatedKeys.privateKey : '••••••••••••••••••••••••••••••••••••••••••••••••••'}
                  readOnly
                  className="w-full h-32 px-3 py-2 text-xs font-mono border border-gray-300 rounded-md bg-gray-50"
                />
              </div>

              {/* Download Button */}
              <button
                onClick={downloadPrivateKey}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center space-x-2 transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>Scarica Chiave Privata</span>
              </button>
            </div>
          )}

          {/* Existing Creators */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Users className="h-5 w-5 mr-2" />
              Creators Esistenti ({creators?.creators?.length || 0})
            </h3>
            
            {loadingCreators ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : creators?.creators?.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {creators.creators.map((creator) => (
                  <div key={creator.creator_id} className="border border-gray-200 rounded-lg p-3">
                    <div className="font-medium text-gray-900">
                      {creator.display_name}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      Creato: {new Date(creator.created_at).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Blocchi: {creator.block_count} | Chiave: {creator.key_size}-bit
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">
                Nessun creator registrato ancora
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreatorRegistration;