function getToken() {
  return localStorage.getItem('destek_token')
}

export async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(path, { ...options, headers })
  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }
  }
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText || 'İstek başarısız')
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export function login(email, password) {
  return api('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function fetchMe() {
  return api('/api/me')
}

export function fetchTickets(status = 'all') {
  const q = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : ''
  return api(`/api/tickets${q}`)
}

export function createTicket(payload) {
  return api('/api/tickets', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function patchTicket(id, payload) {
  return api(`/api/tickets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function fetchSupportStaff() {
  return api('/api/support-staff')
}
