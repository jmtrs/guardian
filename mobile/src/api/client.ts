import axios, { AxiosError } from 'axios';
import { getApiBaseUrl, API_TIMEOUT } from './config';
import { authClient } from './auth-client';

export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: API_TIMEOUT,
});

// Better Auth Expo guarda la cookie de sesion en SecureStore; hay que
// inyectarla a mano en cada llamada al API REST del dominio.
apiClient.interceptors.request.use(async (config) => {
  const cookie = await authClient.getCookie();
  if (cookie) {
    config.headers.Cookie = cookie;
  }
  return config;
});

// Response interceptor for handling auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // TODO: Clear auth and redirect to login (handled by auth context)
      console.error('Unauthorized - need to clear auth');
    }
    return Promise.reject(error);
  }
);

// Health check
export const healthCheck = async () => {
  const response = await apiClient.get('/health');
  return response.data;
};
