// File: frontend/src/components/BlockCreation.jsx
import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import {
    Blocks, User, Lock, Cpu, Clock, Hash, AlertTriangle, CheckCircle, Eye, EyeOff, Upload, Loader2
} from 'lucide-react';
import { apiCall } from '../utils/api';
import cryptoUtils from '../utils/cryptoUtils'; // Importa tutte le funzioni crypto

// ** NUOVA COSTANTE: Timeout per il mining lato client (in millisecondi) **
// Puoi aggiustare questo valore. 120000 = 2 minuti.
const CLIENT_SIDE_MINING_TIMEOUT_MS = 120000;

const BlockCreation = () => {
    const [showPrivateKey, setShowPrivateKey] = useState(false);
    const [miningState, setMiningState] = useState({ status: 'idle' }); // idle, preparing, verifying, mining, committing, completed, failed
    const [createdBlock, setCreatedBlock] = useState(null);
    const [preparationData, setPreparationData] = useState(null); // Dati ricevuti da /prepare-mining

    const queryClient = useQueryClient();

    const { register, handleSubmit, formState: { errors }, watch, setValue, reset } = useForm();

    // Fetch creators list
    const { data: creatorsData, isLoading: loadingCreators } = useQuery(
        'creators',
        () => apiCall('/creators'),
        { refetchOnWindowFocus: false }
    );

    // Fase 1: Preparazione Mining
    const prepareMiningMutation = useMutation(
        (data) => apiCall('/blocks/prepare-mining', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
        {
            onSuccess: (data) => {
                setMiningState({ status: 'verifying' });
                setPreparationData(data);
                toast.success('Pronto per la verifica della chiave.');
            },
            onError: (error) => {
                setMiningState({ status: 'failed', error: `Errore preparazione mining: ${error.message}` });
                toast.error(`Errore preparazione mining: ${error.message}`);
            },
        }
    );

     // Fase 2: Commit del Blocco Minato
     const commitBlockMutation = useMutation(
        (blockData) => apiCall('/blocks/commit', {
            method: 'POST',
            body: JSON.stringify(blockData),
        }),
        {
            onSuccess: (response) => {
                setMiningState({ status: 'completed', duration: response.block?.mining_duration_ms || 0 });
                setCreatedBlock(response.block);
                toast.success('Blocco creato, minato e salvato con successo!');
                queryClient.invalidateQueries('blocks');
                queryClient.invalidateQueries('dashboard-stats');
                reset();
                setPreparationData(null);
                setValue('private_key_pem', ''); // Clear private key field for security
                setTimeout(() => setMiningState({ status: 'idle' }), 5000);
            },
            onError: (error) => {
                setMiningState({ status: 'failed', error: error.message });
                toast.error(`Errore nel commit del blocco: ${error.message}`);
            },
        }
    );

    // Watch form values
    const selectedCreatorName = watch('display_name');
    const dataText = watch('data_text');
    const privateKeyPem = watch('private_key_pem');

    // Load private key from file
    const handleKeyFileUpload = (event) => {
         const file = event.target.files[0];
         if (!file) return;
         if (file.size > 10000) { toast.error('File chiave troppo grande (max 10KB)'); return; }
         const reader = new FileReader();
         reader.onload = async (e) => {
             const content = e.target.result;
             if (!content.includes('-----BEGIN PRIVATE KEY-----')) {
                 toast.error('File non sembra contenere una chiave privata PEM valida.');
                 return;
             }
             try {
                const isValid = await cryptoUtils.validatePrivateKeyPem(content);
                 if (!isValid) {
                     toast.error('Il contenuto del file non è una chiave privata RSA valida.');
                     return;
                 }
                 setValue('private_key_pem', content, { shouldValidate: true });
                 toast.success('Chiave privata caricata e validata.');
             } catch (err) {
                 toast.error('Errore durante la validazione della chiave privata dal file.');
             }
         };
         reader.onerror = () => toast.error('Errore lettura file.');
         reader.readAsText(file);
         event.target.value = '';
    };

    // Form submission
    const onSubmit = async (formData) => {
        setCreatedBlock(null);
        setMiningState({ status: 'preparing' });
        setPreparationData(null);

        // Basic client-side validation first
        if (errors.display_name || errors.data_text || errors.private_key_pem) {
             toast.error("Correggi gli errori nel form prima di procedere.");
             setMiningState({ status: 'idle' });
             return;
        }
        try {
            const isValidKey = await cryptoUtils.validatePrivateKeyPem(formData.private_key_pem);
            if (!isValidKey) {
                toast.error("La chiave privata inserita non è valida o supportata.");
                setMiningState({ status: 'idle' });
                return;
            }
        } catch (e) {
             toast.error("Errore durante la validazione iniziale della chiave privata.");
              setMiningState({ status: 'idle' });
             return;
        }

        prepareMiningMutation.mutate({
            display_name: formData.display_name,
            data_text: formData.data_text,
        });
    };

     // Effect for handling client-side operations after preparation
     useEffect(() => {
        const performClientSideOperations = async () => {
            if (miningState.status === 'verifying' && preparationData && privateKeyPem) {
                toast.loading('Verifica corrispondenza chiavi...', { id: 'key-verify' });
                const isValidPair = await cryptoUtils.verifyKeyPair(preparationData.public_key_pem, privateKeyPem);

                if (!isValidPair) {
                    toast.error('Chiave privata non corrisponde alla chiave pubblica del creator selezionato.', { id: 'key-verify' });
                    setMiningState({ status: 'failed', error: 'Key mismatch' });
                    setPreparationData(null); // Clear preparation data on failure
                    return;
                }

                toast.success('Chiavi verificate con successo!', { id: 'key-verify' });
                setMiningState({ status: 'mining', startTime: Date.now() });

                let encryptedData, iv, encryptedAesKey, dataSize;
                try {
                     const aesKey = cryptoUtils.generateAESKey();
                     iv = cryptoUtils.generateIV();
                     const ciphertext = await cryptoUtils.encryptAESData(dataText, aesKey, iv);
                     encryptedAesKey = await cryptoUtils.encryptAESKeyWithPublicKey(aesKey, preparationData.public_key_pem);
                     encryptedData = ciphertext;
                     dataSize = encryptedData.byteLength + iv.byteLength + encryptedAesKey.byteLength;
                 } catch (error) {
                     toast.error(`Errore crittografia: ${error.message}`);
                     setMiningState({ status: 'failed', error: `Encryption error: ${error.message}` });
                     setPreparationData(null);
                     return;
                 }

                try {
                     const createdAt = new Date();
                     const blockDataForMining = {
                         previous_hash: preparationData.previous_hash,
                         encrypted_data: encryptedData,
                         data_iv: iv,
                         encrypted_data_key: encryptedAesKey,
                         created_at: createdAt,
                         creator_id: preparationData.creator_id,
                         difficulty: preparationData.difficulty,
                     };

                     // ** CORREZIONE: Usa la costante definita nel frontend **
                     const miningResult = await cryptoUtils.mineBlock(
                         blockDataForMining,
                         preparationData.difficulty,
                         CLIENT_SIDE_MINING_TIMEOUT_MS // <--- Usa la costante frontend
                     );

                    let signature;
                    try {
                         signature = await cryptoUtils.signData(privateKeyPem, miningResult.hash);
                    } catch (error) {
                          toast.error(`Errore firma: ${error.message}`);
                          setMiningState({ status: 'failed', error: `Signing error: ${error.message}` });
                          setPreparationData(null);
                          return;
                     }

                    const commitData = {
                         creator_id: preparationData.creator_id,
                         previous_hash: preparationData.previous_hash,
                         block_hash: miningResult.hash,
                         nonce: miningResult.nonce.toString(),
                         difficulty: preparationData.difficulty,
                         encrypted_data_hex: cryptoUtils.abToHex(encryptedData),
                         data_iv_hex: cryptoUtils.abToHex(iv),
                         encrypted_data_key_hex: cryptoUtils.abToHex(encryptedAesKey),
                         data_size: dataSize,
                         signature_hex: cryptoUtils.abToHex(signature),
                         created_at_iso: createdAt.toISOString(),
                         mining_duration_ms: miningResult.duration,
                     };

                     setMiningState({ status: 'committing' });
                     commitBlockMutation.mutate(commitData);

                 } catch (error) { // Catch mining errors (e.g., timeout)
                      toast.error(`Errore mining: ${error.message}`);
                      setMiningState({ status: 'failed', error: `Mining error: ${error.message}` });
                      setPreparationData(null);
                 }
            }
        };

        performClientSideOperations();
     // eslint-disable-next-line react-hooks/exhaustive-deps
     }, [miningState.status, preparationData, privateKeyPem, dataText]); // Added dataText


    const estimatedSize = dataText ? new Blob([dataText]).size : 0;
    const isLoading = loadingCreators || prepareMiningMutation.isLoading || commitBlockMutation.isLoading || ['preparing', 'verifying', 'mining', 'committing'].includes(miningState.status);


    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                    <Blocks className="h-7 w-7 mr-3" />
                    Creazione Blocco Blockchain
                </h1>
                <p className="text-gray-600 mt-2">
                    Crea un nuovo blocco. La crittografia, il mining e la firma avvengono localmente nel tuo browser.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Form */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-lg shadow p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-6">Informazioni Blocco</h2>
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                            {/* Creator Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Seleziona Creator *</label>
                                <select
                                    {...register('display_name', { required: 'Seleziona un creator' })}
                                    className={`w-full form-select ${errors.display_name ? 'border-red-500' : 'border-gray-300'}`}
                                    disabled={loadingCreators || isLoading}
                                >
                                    <option value="">{loadingCreators ? 'Caricamento...' : '-- Seleziona --'}</option>
                                    {creatorsData?.creators?.map((creator) => (
                                        <option key={creator.creator_id} value={creator.display_name}>
                                            {creator.display_name} ({creator.block_count} blocchi)
                                        </option>
                                    ))}
                                </select>
                                {errors.display_name && <p className="text-red-500 text-sm mt-1">{errors.display_name.message}</p>}
                            </div>

                            {/* Data Input */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Dati Sensibili *</label>
                                <textarea
                                    {...register('data_text', {
                                        required: 'Inserisci i dati da crittografare',
                                        maxLength: { value: 1024 * 1024, message: 'Dati troppo lunghi (max 1MB)' }
                                    })}
                                    rows={8}
                                    className={`w-full form-textarea ${errors.data_text ? 'border-red-500' : 'border-gray-300'}`}
                                    placeholder="Inserisci qui i dati sensibili..."
                                    disabled={isLoading}
                                />
                                {errors.data_text && <p className="text-red-500 text-sm mt-1">{errors.data_text.message}</p>}
                                <div className="flex justify-between items-center mt-2 text-sm text-gray-500">
                                    <span>Dimensione stimata: {cryptoUtils.formatBytes(estimatedSize)}</span>
                                    <span>{dataText?.length || 0} caratteri</span>
                                </div>
                            </div>

                             {/* Private Key Input */}
                             <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Chiave Privata RSA *</label>
                                <div className="space-y-3">
                                    <div>
                                        <input type="file" accept=".pem,.key,.txt" onChange={handleKeyFileUpload} className="hidden" id="keyFileUpload" disabled={isLoading}/>
                                        <label htmlFor="keyFileUpload" className={`inline-flex items-center btn border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                                            <Upload className="h-4 w-4 mr-2" /> Carica da file
                                        </label>
                                    </div>
                                    <div className="relative">
                                        <textarea
                                            {...register('private_key_pem', {
                                                required: 'Chiave privata richiesta',
                                                validate: async (value) => await cryptoUtils.validatePrivateKeyPem(value) || 'Formato chiave privata non valido o non supportato'
                                            })}
                                            rows={6}
                                            className={`w-full form-textarea font-mono text-sm pr-10 ${errors.private_key_pem ? 'border-red-500' : 'border-gray-300'}`}
                                            placeholder="-----BEGIN PRIVATE KEY-----..."
                                            style={!showPrivateKey ? { WebkitTextSecurity: 'disc', textSecurity: 'disc' } : {}}
                                            disabled={isLoading}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPrivateKey(!showPrivateKey)}
                                            className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                                            disabled={isLoading}
                                            aria-label={showPrivateKey ? 'Nascondi chiave' : 'Mostra chiave'}
                                        >
                                            {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                                {errors.private_key_pem && <p className="text-red-500 text-sm mt-1">{errors.private_key_pem.message}</p>}
                            </div>


                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full btn-primary disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        <span>
                                            {miningState.status === 'preparing' && 'Preparazione...'}
                                            {miningState.status === 'verifying' && 'Verifica chiave...'}
                                            {miningState.status === 'mining' && 'Mining locale...'}
                                            {miningState.status === 'committing' && 'Salvataggio blocco...'}
                                            {loadingCreators && 'Caricamento...'}
                                         </span>
                                    </>
                                ) : (
                                    <>
                                        <Blocks className="h-5 w-5" />
                                        <span>Avvia Creazione Blocco</span>
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
                                <p className="font-medium text-amber-800 mb-2">Processo di Creazione Blocco (Client-Side)</p>
                                <ol className="text-amber-700 space-y-1 list-decimal list-inside">
                                     <li>Il backend invia la chiave pubblica del creator.</li>
                                    <li>Verifica locale della corrispondenza chiave privata/pubblica.</li>
                                    <li>Crittografia AES + cifratura chiave AES con RSA (nel browser).</li>
                                    <li>Mining Proof-of-Work (nel browser).</li>
                                    <li>Firma digitale dell'hash del blocco (nel browser).</li>
                                     <li>Invio del blocco completo (firmato e minato) al backend per il salvataggio.</li>
                                     <li>La chiave privata non lascia MAI il browser.</li>
                                </ol>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Side Panel */}
                <div className="space-y-6">
                     {/* Mining Progress/Status */}
                     {(miningState.status !== 'idle' && miningState.status !== 'completed') && (
                        <div className={`bg-white rounded-lg shadow p-6 border-l-4 ${
                            miningState.status === 'failed' ? 'border-red-500' : 'border-blue-500'
                        }`}>
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Stato Processo</h3>
                            <div className="flex items-center space-x-3">
                                {['preparing', 'verifying', 'fetching_blocks', 'committing'].includes(miningState.status) && <Loader2 className="h-5 w-5 text-gray-500 animate-spin" />}
                                {miningState.status === 'mining' && <Cpu className="h-5 w-5 text-blue-500 animate-pulse" />}
                                {miningState.status === 'failed' && <AlertTriangle className="h-5 w-5 text-red-500" />}

                                <div>
                                    <p className={`font-medium ${miningState.status === 'failed' ? 'text-red-600' : 'text-gray-700'}`}>
                                        {miningState.status === 'preparing' && 'Preparazione mining...'}
                                        {miningState.status === 'verifying' && 'Verifica chiave privata...'}
                                        {miningState.status === 'mining' && 'Mining Proof-of-Work nel browser...'}
                                        {miningState.status === 'committing' && 'Invio e salvataggio blocco...'}
                                        {miningState.status === 'failed' && 'Processo fallito'}
                                    </p>
                                     {miningState.status === 'mining' && <p className="text-xs text-gray-500">Potrebbe richiedere tempo...</p>}
                                    {miningState.error && <p className="text-xs text-red-500 mt-1">{miningState.error}</p>}
                                </div>
                            </div>
                        </div>
                    )}


                    {/* Created Block Info */}
                    {createdBlock && (
                        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
                             <div className="flex justify-between items-start mb-4">
                                <h3 className="text-lg font-semibold text-green-700 flex items-center">
                                     <CheckCircle className="h-5 w-5 mr-2"/> Blocco Creato con Successo
                                </h3>
                                 <button onClick={() => setCreatedBlock(null)} className="text-gray-400 hover:text-gray-600">&times;</button>
                             </div>
                            <div className="space-y-3 text-sm">
                                <DetailItem label="ID Blocco" value={`${createdBlock.block_id.substring(0, 8)}...`} isMono />
                                <DetailItem label="Numero" value={`#${createdBlock.block_number}`} />
                                <DetailItem label="Hash" value={`${createdBlock.block_hash.substring(0, 16)}...`} isMono />
                                <DetailItem label="Nonce" value={createdBlock.nonce} isMono />
                                <DetailItem label="Difficoltà" value={createdBlock.difficulty} />
                                {/* <DetailItem label="Tentativi" value={createdBlock.attempts?.toLocaleString()} /> */}
                                <DetailItem label="Tempo Mining" value={cryptoUtils.formatDuration(createdBlock.mining_duration_ms)} />
                                <DetailItem label="Dimensione" value={cryptoUtils.formatBytes(createdBlock.data_size)} />
                                <DetailItem label="Creator" value={createdBlock.creator_name || 'N/A'} />
                            </div>
                        </div>
                    )}

                    {/* Mining Info */}
                    <div className="bg-white rounded-lg shadow p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Informazioni Mining</h3>
                        <div className="space-y-4 text-sm">
                            <InfoItem icon={Hash} color="text-blue-500" text="Algoritmo: SHA-256" />
                            <InfoItem icon={Blocks} color="text-green-500" text={`Difficoltà: ${preparationData?.difficulty || 'N/D (default 4)'}`} />
                            <InfoItem icon={Clock} color="text-orange-500" text={`Timeout: ${CLIENT_SIDE_MINING_TIMEOUT_MS / 1000 / 60} minuti (client)`} />
                            <InfoItem icon={Lock} color="text-purple-500" text="Cifratura: AES-256-GCM + RSA-OAEP" />
                        </div>
                        <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
                            Il mining Proof-of-Work viene eseguito nel tuo browser. Le prestazioni dipendono dal tuo dispositivo.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Helper Components --- (Invariati)
const DetailItem = ({ label, value, isMono = false }) => (
    <div className="flex justify-between items-center">
        <span className="text-gray-600 shrink-0 mr-2">{label}:</span>
        <span className={`font-medium text-gray-800 text-right break-all ${isMono ? 'font-mono text-xs' : ''}`}>{value ?? 'N/A'}</span>
    </div>
);

const InfoItem = ({ icon: Icon, color, text }) => (
     <div className="flex items-center space-x-2">
         <Icon className={`h-4 w-4 ${color} flex-shrink-0`} />
         <span className="text-gray-600">{text}</span>
     </div>
 );


export default BlockCreation;