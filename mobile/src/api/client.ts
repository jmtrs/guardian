import axios, { AxiosError } from 'axios';
import { getApiBaseUrl, API_TIMEOUT } from './config';

export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: API_TIMEOUT,
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
