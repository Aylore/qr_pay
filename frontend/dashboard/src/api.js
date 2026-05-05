const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function getToken() {
  return localStorage.getItem('qrpay_token')
}

async function request(path, options = {}) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const auth = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (data) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
}

export const restaurant = {
  me: () => request('/restaurants/me'),
  update: (data) => request('/restaurants/me', { method: 'PATCH', body: JSON.stringify(data) }),
  tables: () => request('/restaurants/me/tables'),
  createTable: (data) =>
    request('/restaurants/me/tables', { method: 'POST', body: JSON.stringify(data) }),
  deleteTable: (id) =>
    request(`/restaurants/me/tables/${id}`, { method: 'DELETE' }),
  tableQR: (id) => request(`/restaurants/me/tables/${id}/qr`),
}

export const bills = {
  list: () => request('/bills'),
  get: (id) => request(`/bills/${id}`),
  create: (data) => request('/bills', { method: 'POST', body: JSON.stringify(data) }),
  cancel: (id) => request(`/bills/${id}`, { method: 'DELETE' }),
}

export const webhooks = {
  simulateFoodics: (data) =>
    request('/webhooks/foodics/simulate', { method: 'POST', body: JSON.stringify(data) }),
}

export function getWSUrl() {
  const token = getToken()
  const wsBase = BASE.replace(/^http/, 'ws')
  return `${wsBase}/ws/dashboard?token=${token}`
}
