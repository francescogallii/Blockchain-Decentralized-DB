// File: frontend/src/components/DataDecryption.jsx
import React, { useState, useEffect } from 'react';
// ** CORREZIONE: Aggiunto useQueryClient all'import **
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import {
    Key, User, Unlock, Download, Eye, EyeOff, Shield, AlertTriangle, CheckCircle, Clock, FileText, Upload, Copy, Hash, Loader2
} from 'lucide-react';
import { apiCall } from '../utils/api';
import cryptoUtils from '../utils/cryptoUtils';

// --- Helper Components (InfoItem, SummaryCard, ActionButton, DecryptedBlockItem) ---
// (Definizioni dei componenti helper - invariate rispetto alla versione precedente)
const InfoItem = ({ icon: Icon, color, text }) => (
     <div className="flex items-center space-x-2">
         <Icon className={`h-4 w-4 ${color} flex-shrink-0`} />
         <span className="text-gray-600">{text}</span>
     </div>
 );

 const SummaryCard = ({ value, label, color }) => (
    <div className={`bg-${color}-50 p-4 rounded-lg text-center border border-${color}-200`}>
        <div className={`text-2xl font-bold text-${color}-600`}>{value}</div>
        <div className={`text-${color}-700 text-sm mt-1`}>{label}</div>
    </div>
);

const ActionButton = ({ icon: Icon, onClick, title, color, disabled = false }) => (
    <button
        onClick={onClick}
        className={`text-${color}-600 hover:text-${color}-700 p-1 rounded hover:bg-${color}-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
        title={title}
        disabled={disabled}
    >
        <Icon className="h-4 w-4" />
    </button>
);

const DecryptedBlockItem = ({ block, expandedBlock, setExpandedBlock, copyToClipboard, downloadDecryptedData }) => {
    const isExpanded = expandedBlock === block.block_id;
    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden transition-shadow duration-200 hover:shadow-md">
            <div className="p-4 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center justify-between">
                     <h3 className="font-semibold text-gray-800 flex items-center space-x-2">
                         <span>Blocco #{block.block_number}</span>
                         {block.verified ? <CheckCircle className="h-4 w-4 text-green-500" title="Verificato"/> : <Clock className="h-4 w-4 text-yellow-500" title="Non Verificato"/>}
                         {block.error && <AlertTriangle className="h-4 w-4 text-red-500" title="Errore Decifratura"/>}
                     </h3>
                    <div className="flex space-x-1">
                        {block.decrypted_data && (
                            <>
                                <ActionButton icon={Copy} onClick={() => copyToClipboard(block.decrypted_data, 'Dati decifrati')} title="Copia dati" color="blue" />
                                <ActionButton icon={Download} onClick={() => downloadDecryptedData(block.decrypted_data, `block_${block.block_number}_data.txt`)} title="Scarica dati" color="green" />
                            </>
                        )}
                         <ActionButton
                            icon={isExpanded ? EyeOff : Eye}
                            onClick={() => setExpandedBlock(isExpanded ? null : block.block_id)}
                            title={isExpanded ? 'Nascondi dettagli' : 'Mostra dettagli'}
                            color="gray"
                         />
                    </div>
                 </div>
                 <div className="mt-2 text-xs text-gray-500 flex items-center space-x-2 flex-wrap">
                     <Hash className="h-3 w-3"/>
                     <span className="font-mono">{block.block_hash?.substring(0, 16)}...</span>
                     <span className="ml-auto flex-shrink-0">{new Date(block.created_at).toLocaleString()}</span>
                 </div>
             </div>

            {/* Expanded Content */}
             {isExpanded && (
                 <div className="p-4 bg-white">
                     {block.error ? (
                         <div className="bg-red-100 p-3 rounded text-red-700 text-sm border border-red-200">
                             <p className="font-medium mb-1">Errore decifratura:</p>
                             <p className="break-words">{block.error_details}</p>
                         </div>
                     ) : block.decrypted_data ? (
                         <div>
                             <h4 className="text-sm font-medium text-gray-700 mb-2">Dati Decifrati:</h4>
                             <div className="bg-gray-100 p-3 rounded border max-h-60 overflow-y-auto">
                                 <pre className="text-sm text-gray-800 whitespace-pre-wrap break-words">{block.decrypted_data}</pre>
                             </div>
                         </div>
                     ) : (
                         <p className="text-gray-500 text-sm">Nessun dato decifrato disponibile o decifratura non riuscita.</p>
                     )}
                 </div>
             )}
         </div>
     );
 };


// --- Main DataDecryption Component ---
const DataDecryption = () => {
    const [showPrivateKey, setShowPrivateKey] = useState(false);
    const [decryptedBlocksData, setDecryptedBlocksData] = useState(null);
    const [expandedBlock, setExpandedBlock] = useState(null);
    const [decryptionState, setDecryptionState] = useState({ status: 'idle' });
    const [publicKeyPem, setPublicKeyPem] = useState(null);

    // ** CORREZIONE: useQueryClient() chiamato dopo l'import **
    const queryClient = useQueryClient();

    const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = useForm();

    // Fetch creators list
    const { data: creatorsData, isLoading: loadingCreators } = useQuery(
        'creators',
        () => apiCall('/creators'),
        { refetchOnWindowFocus: false }
    );

    // Watch form values
    const selectedCreatorName = watch('display_name');
    const privateKeyPem = watch('private_key_pem'); // Keep watch

    // --- Mutations ---
    const fetchPublicKeyMutation = useMutation(
        (displayName) => apiCall(`/creators/${displayName}/public-key`),
        {
            onSuccess: (data) => {
                setPublicKeyPem(data.public_key_pem);
                setDecryptionState({ status: 'verifying', creatorId: data.creator_id });
                toast.success('Chiave pubblica recuperata.');
            },
            onError: (error) => {
                setPublicKeyPem(null);
                setDecryptionState({ status: 'failed', error: `Recupero chiave pubblica fallito: ${error.message}` });
                toast.error(`Recupero chiave pubblica fallito: ${error.message}`);
            },
        }
    );

     const fetchEncryptedBlocksMutation = useMutation(
        (creatorId) => apiCall(`/decrypt/blocks/${creatorId}`),
        {
            onSuccess: (data) => {
                setDecryptionState({ status: 'decrypting', blocksToDecrypt: data.blocks, creatorName: data.display_name, creatorId: data.creator_id });
                toast.success(`Recuperati ${data.blocks.length} blocchi crittografati.`);
            },
            onError: (error) => {
                setDecryptionState({ status: 'failed', error: `Recupero blocchi fallito: ${error.message}` });
                toast.error(`Recupero blocchi fallito: ${error.message}`);
            },
        }
    );

    // --- Event Handlers ---
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

    const onSubmit = async (formData) => {
        setDecryptedBlocksData(null);
        setPublicKeyPem(null);
        setExpandedBlock(null);

        if (errors.private_key_pem) {
            toast.error("Correggi gli errori nel formato della chiave privata.");
            return;
        }
        try {
            const isValidFormat = await cryptoUtils.validatePrivateKeyPem(formData.private_key_pem);
            if (!isValidFormat) {
                toast.error("La chiave privata inserita non è valida o supportata.");
                return;
            }
        } catch (e) {
             toast.error("Errore durante la validazione iniziale della chiave privata.");
             return;
        }

        setDecryptionState({ status: 'fetching_key' });
        fetchPublicKeyMutation.mutate(formData.display_name);
    };

     const copyToClipboard = async (text, type) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(`${type} copiato negli appunti!`);
        } catch (error) {
            toast.error('Impossibile copiare negli appunti');
            console.error("Clipboard copy failed:", error);
        }
    };

    const downloadDecryptedData = (blockData, filename) => {
        try {
            const element = document.createElement('a');
            const file = new Blob([blockData], { type: 'text/plain;charset=utf-8' });
            element.href = URL.createObjectURL(file);
            element.download = filename || 'decrypted_data.txt';
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
            URL.revokeObjectURL(element.href);
            toast.success('Dati scaricati!');
        } catch (error) {
             toast.error('Errore durante il download dei dati.');
             console.error("Download failed:", error);
        }
    };


    // --- Effect for Decryption Flow ---
     useEffect(() => {
        const processDecryption = async () => {
            // Step 2: Verify Key
            if (decryptionState.status === 'verifying' && publicKeyPem && privateKeyPem) {
                toast.loading('Verifica corrispondenza chiavi...', { id: 'key-verify-decrypt' });
                const isValidPair = await cryptoUtils.verifyKeyPair(publicKeyPem, privateKeyPem);

                if (!isValidPair) {
                    toast.error('Chiave privata non corrisponde alla chiave pubblica del creator selezionato.', { id: 'key-verify-decrypt' });
                    setDecryptionState({ status: 'failed', error: 'Key mismatch' });
                    setPublicKeyPem(null);
                    return;
                }

                toast.success('Chiavi verificate con successo!', { id: 'key-verify-decrypt' });
                setDecryptionState({ status: 'fetching_blocks', creatorId: decryptionState.creatorId });

                // Step 3: Fetch Encrypted Blocks
                fetchEncryptedBlocksMutation.mutate(decryptionState.creatorId);
            }

            // Step 4: Decrypt Blocks (Client-Side)
            if (decryptionState.status === 'decrypting' && decryptionState.blocksToDecrypt && privateKeyPem) {
                 toast.loading(`Decifratura di ${decryptionState.blocksToDecrypt.length} blocchi...`, { id: 'decrypting-blocks' });
                 let successfullyDecrypted = 0;
                 let failedDecryption = 0;
                 const results = [];
                 const blocks = decryptionState.blocksToDecrypt;
                 const chunkSize = 10;

                 for (let i = 0; i < blocks.length; i += chunkSize) {
                     const chunk = blocks.slice(i, i + chunkSize);
                     const chunkPromises = chunk.map(async (block) => {
                         try {
                             const encryptedAesKey = cryptoUtils.base64ToAb(block.encrypted_data_key_b64);
                             const aesKeyBytes = await cryptoUtils.decryptAESKeyWithPrivateKey(encryptedAesKey, privateKeyPem);
                             const iv = cryptoUtils.base64ToAb(block.data_iv_b64);
                             const ciphertext = cryptoUtils.base64ToAb(block.encrypted_data_b64);
                             const plaintext = await cryptoUtils.decryptAESData(ciphertext, aesKeyBytes, iv);
                             return { ...block, decrypted_data: plaintext, error: null, error_details: null };
                         } catch (error) {
                             console.error(`Failed to decrypt block #${block.block_number}:`, error);
                             return { ...block, decrypted_data: null, error: 'Decryption failed', error_details: error.message };
                         }
                     });

                     const chunkResults = await Promise.all(chunkPromises);
                     results.push(...chunkResults);

                     toast.loading(`Decifratura ${i + chunk.length}/${blocks.length} blocchi...`, { id: 'decrypting-blocks' });
                     await new Promise(resolve => setTimeout(resolve, 0)); // Yield
                 }

                 results.forEach(r => {
                     if (r.error) failedDecryption++;
                     else successfullyDecrypted++;
                 });

                 setDecryptedBlocksData({
                     creator_id: decryptionState.creatorId,
                     display_name: decryptionState.creatorName,
                     summary: {
                         total_blocks: blocks.length,
                         successfully_decrypted: successfullyDecrypted,
                         failed_decryption: failedDecryption,
                     },
                     blocks: results,
                 });

                 setDecryptionState({ status: 'completed' });
                 toast.success(`Decifratura completata! ${successfullyDecrypted} successi, ${failedDecryption} fallimenti.`, { id: 'decrypting-blocks' });
            }
        };

        processDecryption();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [decryptionState.status, publicKeyPem, privateKeyPem]);


    const isLoading = loadingCreators || fetchPublicKeyMutation.isLoading || fetchEncryptedBlocksMutation.isLoading || ['fetching_key', 'verifying', 'fetching_blocks', 'decrypting'].includes(decryptionState.status);


    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                    <Key className="h-7 w-7 mr-3" />
                    Decifratura Dati Sensibili
                </h1>
                <p className="text-gray-600 mt-2">
                    Usa la tua chiave privata per decifrare i dati. La decifratura avviene interamente nel tuo browser.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Form */}
                <div className="lg:col-span-2 space-y-6">
                     {/* Decryption Form */}
                     <div className="bg-white rounded-lg shadow p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-6">Parametri Decifratura</h2>
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

                             {/* Private Key Input */}
                             <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Chiave Privata RSA *</label>
                                <div className="space-y-3">
                                    <div>
                                        <input type="file" accept=".pem,.key,.txt" onChange={handleKeyFileUpload} className="hidden" id="keyFileUploadDecrypt" disabled={isLoading}/>
                                        <label htmlFor="keyFileUploadDecrypt" className={`inline-flex items-center btn border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
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
                                className="w-full btn bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white flex items-center justify-center space-x-2"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        <span>
                                            {decryptionState.status === 'fetching_key' && 'Recupero info...'}
                                            {decryptionState.status === 'verifying' && 'Verifica chiave...'}
                                            {decryptionState.status === 'fetching_blocks' && 'Caricamento blocchi...'}
                                            {decryptionState.status === 'decrypting' && 'Decifratura...'}
                                            {(loadingCreators && decryptionState.status === 'idle') && 'Caricamento...'}
                                         </span>
                                    </>
                                ) : (
                                    <>
                                        <Unlock className="h-5 w-5" />
                                        <span>Decifra Blocchi</span>
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
                               <p className="font-medium text-amber-800 mb-2">Processo di Decifratura Sicura (Client-Side)</p>
                               <ol className="text-amber-700 space-y-1 list-decimal list-inside">
                                   <li>Il backend invia la chiave pubblica del creator.</li>
                                   <li>Verifica locale della corrispondenza chiave privata/pubblica.</li>
                                   <li>Il backend invia i blocchi crittografati.</li>
                                   <li>Decifratura della chiave AES con RSA (nel browser).</li>
                                   <li>Decifratura dei dati con AES-GCM (nel browser).</li>
                                   <li>La chiave privata non lascia MAI il browser.</li>
                               </ol>
                           </div>
                       </div>
                   </div>
                </div>

                {/* Side Panel */}
                <div className="space-y-6">
                     {/* Decryption Status/Info */}
                     {(decryptionState.status !== 'idle' && decryptionState.status !== 'completed') && (
                         <div className={`bg-white rounded-lg shadow p-6 border-l-4 ${
                             decryptionState.status === 'failed' ? 'border-red-500' : 'border-blue-500'
                         }`}>
                             <h3 className="text-lg font-semibold text-gray-900 mb-4">Stato Decifratura</h3>
                             <div className="flex items-center space-x-3">
                                 {['fetching_key', 'verifying', 'fetching_blocks'].includes(decryptionState.status) && <Loader2 className="h-5 w-5 text-gray-500 animate-spin" />}
                                 {decryptionState.status === 'decrypting' && <Key className="h-5 w-5 text-purple-500 animate-pulse" />}
                                 {decryptionState.status === 'failed' && <AlertTriangle className="h-5 w-5 text-red-500" />}
                                 <div>
                                     <p className={`font-medium ${decryptionState.status === 'failed' ? 'text-red-600' : 'text-gray-700'}`}>
                                         {decryptionState.status === 'fetching_key' && 'Recupero chiave pubblica...'}
                                         {decryptionState.status === 'verifying' && 'Verifica chiave privata...'}
                                         {decryptionState.status === 'fetching_blocks' && 'Recupero blocchi crittografati...'}
                                         {decryptionState.status === 'decrypting' && `Decifratura di ${decryptionState.blocksToDecrypt?.length || '?'} blocchi...`}
                                         {decryptionState.status === 'failed' && 'Processo fallito'}
                                     </p>
                                     {decryptionState.error && <p className="text-xs text-red-500 mt-1 break-words">{decryptionState.error}</p>}
                                 </div>
                             </div>
                         </div>
                     )}

                    {/* General Decryption Info */}
                    <div className="bg-white rounded-lg shadow p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Informazioni Decifratura</h3>
                        <div className="space-y-4 text-sm">
                            <InfoItem icon={Key} color="text-purple-500" text="Algoritmo: RSA-OAEP + AES-256-GCM" />
                            <InfoItem icon={Shield} color="text-green-500" text="Validazione: Integrità dati (GCM)" />
                            <InfoItem icon={Clock} color="text-orange-500" text="Tempo: Dipende dal numero di blocchi" />
                            <InfoItem icon={FileText} color="text-blue-500" text="Output: Testo in chiaro" />
                        </div>
                        <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
                            La decifratura avviene localmente. Assicurati di usare la chiave privata corretta.
                        </div>
                    </div>
                </div>
            </div>

             {/* Decrypted Data Display */}
            {decryptedBlocksData && decryptionState.status === 'completed' && (
                <div className="mt-8 bg-white rounded-lg shadow p-6 animate-fade-in">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold text-gray-900">
                            Dati Decifrati per {decryptedBlocksData.display_name}
                        </h2>
                        <button onClick={() => { setDecryptedBlocksData(null); setDecryptionState({status: 'idle'}); setPublicKeyPem(null); reset(); setValue('private_key_pem', ''); }} className="text-gray-500 hover:text-gray-700">&times;</button>
                    </div>

                    {/* Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <SummaryCard value={decryptedBlocksData.summary.total_blocks} label="Blocchi Totali" color="blue" />
                        <SummaryCard value={decryptedBlocksData.summary.successfully_decrypted} label="Decifrati con Successo" color="green" />
                        <SummaryCard value={decryptedBlocksData.summary.failed_decryption} label="Decifratura Fallita" color="red" />
                    </div>

                    {/* Blocks List */}
                    <div className="space-y-4">
                        {decryptedBlocksData.blocks.map((block) => (
                            <DecryptedBlockItem
                                key={block.block_id}
                                block={block}
                                expandedBlock={expandedBlock}
                                setExpandedBlock={setExpandedBlock}
                                copyToClipboard={copyToClipboard}
                                downloadDecryptedData={downloadDecryptedData}
                            />
                        ))}
                    </div>

                     {/* Download All Button */}
                     {decryptedBlocksData.blocks.some(b => b.decrypted_data) && (
                        <div className="mt-6 text-center">
                            <button
                                onClick={() => {
                                    const allData = decryptedBlocksData.blocks
                                        .filter(b => b.decrypted_data)
                                        .map(b => `=== Blocco #${b.block_number} (${new Date(b.created_at).toLocaleString()}) ===\nHash: ${b.block_hash}\n\n${b.decrypted_data}`)
                                        .join('\n\n\n');
                                    downloadDecryptedData(allData, `${decryptedBlocksData.display_name}_all_decrypted_blocks.txt`);
                                }}
                                className="btn bg-green-600 hover:bg-green-700 text-white flex items-center space-x-2 mx-auto"
                            >
                                <Download className="h-4 w-4" />
                                <span>Scarica Tutti i Dati Decifrati</span>
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};


export default DataDecryption;