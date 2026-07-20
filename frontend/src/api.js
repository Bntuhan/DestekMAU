/* eslint-disable */
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
    if (res.status === 401) {
      localStorage.removeItem('destek_token')
      localStorage.removeItem('destek_user')
      if (window.location.pathname !== '/') {
        window.location.href = '/'
      }
    }
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

export function fetchTicket(id) {
  return api(`/api/tickets/${id}`)
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

export function createUser(payload) {
  return api('/api/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function uploadFile(file) {
  const formData = new FormData()
  formData.append('file', file)
  
  const token = getToken()
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`

  return fetch('/api/upload', {
    method: 'POST',
    headers,
    body: formData
  }).then(async res => {
    const text = await res.text()
    let data = {}
    try { data = JSON.parse(text) } catch(e) {}
    if (!res.ok) throw new Error(data.error || 'Yükleme başarısız')
    return data
  })
}

export function fetchTicketHistory(id) {
  return api(`/api/tickets/${id}/history`)
}

export function fetchNotifications() {
  return api('/api/notifications')
}

export function markNotificationRead(id) {
  return api(`/api/notifications/${id}/read`, { method: 'PATCH' })
}

export function addTicketHistory(id, actionText) {
  return api(`/api/tickets/${id}/history`, {
    method: 'POST',
    body: JSON.stringify({ action: actionText }),
  })
}

export function requestTicketClose(id) {
  return api(`/api/tickets/${id}/request_close`, {
    method: 'POST'
  })
}

export function pingTicketView(id) {
  return api(`/api/tickets/${id}/ping_view`, { method: 'POST' })
}

export function fetchTicketViewers(id) {
  return api(`/api/tickets/${id}/viewers`)
}

export function requestTicketBackup(id) {
  return api(`/api/tickets/${id}/backup`, { method: 'POST' })
}

export function fetchAnalytics() {
  return api('/api/analytics')
}

export function completeTicketPart(id) {
  return api(`/api/tickets/${id}/complete_part`, { method: 'POST' })
}

export function fetchComments(id) {
  return api(`/api/tickets/${id}/comments`)
}

export function addComment(id, body, isInternal = false) {
  return api(`/api/tickets/${id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body, is_internal: isInternal }),
  })
}

// ── Duyurular ──
export function fetchAnnouncements() {
  return api('/api/announcements')
}

export function createAnnouncement(title, body) {
  return api('/api/announcements', {
    method: 'POST',
    body: JSON.stringify({ title, body }),
  })
}

export function patchAnnouncement(id, payload) {
  return api(`/api/announcements/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

// ── Audit Log ──
export function fetchAuditLog() {
  return api('/api/audit-log')
}

// ── Trend Analizi ──
export function fetchAnalyticsTrend() {
  return api('/api/analytics/trend')
}
