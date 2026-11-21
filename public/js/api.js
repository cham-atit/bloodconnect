// ═══════════════════════════════════════════
//  API CLIENT MODULE
// ═══════════════════════════════════════════

const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('bc_token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('bc_token', token);
    } else {
      localStorage.removeItem('bc_token');
    }
  }

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async request(method, path, body = null) {
    const options = {
      method,
      headers: this.getHeaders(),
    };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }
    const res = await fetch(`${API_BASE}${path}`, options);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong');
    }
    return data;
  }

  // Auth
  register(data) { return this.request('POST', '/auth/register', data); }
  login(email, password) { return this.request('POST', '/auth/login', { email, password }); }
  getMe() { return this.request('GET', '/auth/me'); }
  updateProfile(data) { return this.request('PUT', '/auth/profile', data); }

  // Donors
  searchDonors(params) {
    const qs = new URLSearchParams(params).toString();
    return this.request('GET', `/donors/search?${qs}`);
  }
  toggleAvailability(is_available) { return this.request('PUT', '/donors/availability', { is_available }); }
  getDonorStats() { return this.request('GET', '/donors/stats'); }

  // Requests
  createRequest(data) { return this.request('POST', '/requests', data); }
  getRequests(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request('GET', `/requests?${qs}`);
  }
  getRequest(id) { return this.request('GET', `/requests/${id}`); }
  respondToRequest(id) { return this.request('POST', `/requests/${id}/respond`); }
  updateRequestStatus(id, status) { return this.request('PUT', `/requests/${id}/status`, { status }); }
  deleteRequest(id) { return this.request('DELETE', `/requests/${id}`); }
  getMyRequests() { return this.request('GET', '/requests/my/list'); }
  getMyDonations() { return this.request('GET', '/requests/my/donations'); }

  // Notifications
  getNotifications() { return this.request('GET', '/notifications'); }
  markRead(id) { return this.request('PUT', `/notifications/${id}/read`); }
  markAllRead() { return this.request('PUT', '/notifications/read-all'); }
}

const api = new ApiClient();
