// File: frontend/src/utils/api.js (Nessuna modifica necessaria)
// Usa percorso relativo - Nginx gestirà il routing
const API_BASE_URL = '/api'; // Corretto per Nginx

export async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
    };

    try {
        const response = await fetch(url, config);

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { message: `HTTP error! Status: ${response.status} ${response.statusText}` };
            }

            // Aggiunge più dettagli all'errore
            const error = new Error(errorData.message || errorData.error || `Request failed with status ${response.status}`);
            error.status = response.status;
            error.details = errorData.details || (errorData.errors ? errorData.errors : []) || errorData; // Include dettagli o l'intero corpo se message/error non esistono
            console.error("API Error Response:", errorData); // Logga l'intera risposta d'errore
            throw error;
        }

        if (response.status === 204) { // No Content
            return null;
        }

        // Prova a parsare JSON, ma gestisce anche risposte non-JSON se necessario
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        } else {
             // Potrebbe essere testo semplice o altro, ritorna il testo
             console.warn(`API response for ${endpoint} was not JSON. Content-Type: ${contentType}`);
             return await response.text();
        }


    } catch (error) {
        // Migliora log degli errori di rete
         if (error instanceof TypeError && error.message === 'Failed to fetch') {
             console.error(`Network error calling API endpoint: ${endpoint}. Is the backend reachable?`, error);
             throw new Error(`Network error: Could not reach the server at ${url}.`);
         }
         console.error(`API call failed for endpoint: ${endpoint}`, error.status, error.message, error.details || error);
        // Rilancia l'errore perché react-query possa gestirlo
        throw error;
    }
}