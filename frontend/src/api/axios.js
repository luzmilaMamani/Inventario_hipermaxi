import axios from "axios";

const apiUrl = (import.meta.env.VITE_API_URL || "http://localhost:3000/api")
  .replace(/\/+$/, "");
const apiBaseUrl = /\/api$/i.test(apiUrl) ? apiUrl : `${apiUrl}/api`;

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;