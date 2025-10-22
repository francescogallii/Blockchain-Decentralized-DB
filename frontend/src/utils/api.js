// Usa percorso relativo - Nginx gestirà il routing
const API_BASE_URL = '/api';

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
        errorData = { message: `HTTP error! Status: ${response.status}` };
      }
      
      const error = new Error(errorData.error || errorData.message || 'An unknown error occurred.');
      error.status = response.status;
      error.details = errorData.details || [];
      console.error("API Error:", errorData);
      throw error;
    }
    
    // Handle responses with no content
    if (response.status === 204) {
      return null;
    }

    return await response.json();

  } catch (error) {
    console.error(`API call failed for endpoint: ${endpoint}`, error);
    throw error;
  }
}