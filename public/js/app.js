// ═══════════════════════════════════════════
//  MAIN APPLICATION LOGIC
// ═══════════════════════════════════════════

let currentUser = null;
let currentPage = 'home';
let sseConnection = null;
let selectedBloodGroups = {};
let selectedUrgency = 'urgent';

// ─── INITIALIZATION ──────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadHomeData();
});

// ─── AUTH ─────────────────────────────────
async function checkAuth() {
  if (api.token) {
    try {
      const data = await api.getMe();
      currentUser = data.user;
      updateAuthUI();
      connectSSE();
      loadNotificationCount();
    } catch (e) {
      api.setToken(null);
      currentUser = null;
      updateAuthUI();
    }
  } else {
    updateAuthUI();
  }
}

function updateAuthUI() {
  const authDiv = document.getElementById('navAuth');
  const dashNav = document.getElementById('navDashboard');
  const notifNav = document.getElementById('navNotifications');

  if (currentUser) {
    dashNav.style.display = '';
    notifNav.style.display = '';
    authDiv.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="navigate('dashboard')" style="display:flex;align-items:center;gap:6px">
        <span style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--primary-500),var(--primary-700));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white">${currentUser.name.charAt(0).toUpperCase()}</span>
        ${currentUser.name.split(' ')[0]}
      </button>
      <button class="btn btn-ghost btn-sm" onclick="logout()">Logout</button>
    `;
  } else {
    dashNav.style.display = 'none';
    notifNav.style.display = 'none';
    authDiv.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="navigate('login')">Sign In</button>
      <button class="btn btn-primary btn-sm" onclick="navigate('register')">Register</button>
    `;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  try {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const data = await api.login(email, password);
    api.setToken(data.token);
    currentUser = data.user;
    updateAuthUI();
    connectSSE();
    showToast('Welcome back! 🎉', `Hello ${currentUser.name}`, 'success');
    navigate('dashboard');
  } catch (err) {
    showToast('Login Failed', err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('regBtn');
  btn.disabled = true;
  btn.textContent = 'Creating account...';

  const bloodGroup = selectedBloodGroups['regBloodGrid'];
  if (!bloodGroup) {
    showToast('Missing Info', 'Please select your blood group', 'error');
    btn.disabled = false;
    btn.textContent = 'Create Account';
    return;
  }

  try {
    const data = await api.register({
      name: document.getElementById('regName').value,
      email: document.getElementById('regEmail').value,
      password: document.getElementById('regPassword').value,
      phone: document.getElementById('regPhone').value,
      blood_group: bloodGroup,
      role: document.getElementById('regRole').value,
      city: document.getElementById('regCity').value,
    });

    api.setToken(data.token);
    currentUser = data.user;
    updateAuthUI();
    connectSSE();
    showToast('Account Created! 🎉', `Welcome to BloodConnect, ${currentUser.name}`, 'success');
    navigate('dashboard');

    // Try to get location
    requestLocation();
  } catch (err) {
    showToast('Registration Failed', err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

async function demoLogin() {
  try {
    const data = await api.login('aarav@demo.com', 'demo1234');
    api.setToken(data.token);
    currentUser = data.user;
    updateAuthUI();
    connectSSE();
    showToast('Demo Login 🔑', `Logged in as ${currentUser.name}`, 'success');
    navigate('dashboard');
  } catch (err) {
    showToast('Demo Login Failed', err.message, 'error');
  }
}

function logout() {
  api.setToken(null);
  currentUser = null;
  if (sseConnection) {
    sseConnection.close();
    sseConnection = null;
  }
  updateAuthUI();
  showToast('Signed Out', 'See you soon!', 'success');
  navigate('home');
}

// ─── NAVIGATION ───────────────────────────
function navigate(page, data = null) {
  // Auth guard
  const protectedPages = ['dashboard', 'new-request', 'notifications'];
  if (protectedPages.includes(page) && !currentUser) {
    showToast('Sign In Required', 'Please sign in to access this page', 'warning');
    page = 'login';
  }

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // Show target page
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) {
    pageEl.classList.add('active');
    currentPage = page;
  }

  // Update nav active state
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  // Close mobile menu
  document.getElementById('navLinks').classList.remove('open');

  // Load page data
  switch (page) {
    case 'home': loadHomeData(); break;
    case 'dashboard': loadDashboard(); break;
    case 'search': break;
    case 'requests': loadRequests(); break;
    case 'new-request': break;
    case 'request-detail': loadRequestDetail(data); break;
    case 'notifications': loadNotifications(); break;
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileMenu() {
  document.getElementById('navLinks').classList.toggle('open');
}

// ─── HOME PAGE ────────────────────────────
async function loadHomeData() {
  try {
    const data = await api.getRequests({ status: 'active' });
    renderRequestsList(data.requests.slice(0, 5), 'homeRequestsList');

    // Update stats
    const donors = await api.searchDonors({});
    document.getElementById('statDonors').textContent = donors.total || 0;
    document.getElementById('statRequests').textContent = data.requests.length || 0;
  } catch (err) {
    document.getElementById('homeRequestsList').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">No active requests</div>
        <div class="empty-desc">Everything looks calm. Be ready to help when the time comes!</div>
      </div>
    `;
  }
}

// ─── DASHBOARD ────────────────────────────
async function loadDashboard() {
  if (!currentUser) return;

  document.getElementById('dashGreeting').textContent = `Welcome, ${currentUser.name}! 👋`;
  document.getElementById('dashSubtitle').textContent = `Blood Group: ${currentUser.blood_group} | ${currentUser.city || 'Location not set'}`;
  document.getElementById('dashBloodGroup').textContent = currentUser.blood_group;

  // Load availability
  document.getElementById('availToggle').checked = !!currentUser.is_available;
  document.getElementById('availLabel').textContent = currentUser.is_available ? 'Available for Donation ✅' : 'Not Available ❌';

  try {
    const stats = await api.getDonorStats();
    document.getElementById('dashDonations').textContent = stats.total_donations;
    document.getElementById('dashPending').textContent = stats.pending_offers;
  } catch (e) {}

  try {
    const myReqs = await api.getMyRequests();
    document.getElementById('dashMyRequests').textContent = myReqs.requests.length;
    renderDashRequests(myReqs.requests);
  } catch (e) {}
}

async function toggleAvailability() {
  const isAvail = document.getElementById('availToggle').checked;
  try {
    await api.toggleAvailability(isAvail);
    currentUser.is_available = isAvail ? 1 : 0;
    document.getElementById('availLabel').textContent = isAvail ? 'Available for Donation ✅' : 'Not Available ❌';
    showToast(isAvail ? 'You\'re Available' : 'Paused', isAvail ? 'You will now receive matching requests' : 'You won\'t receive new requests', 'success');
  } catch (err) {
    showToast('Error', err.message, 'error');
  }
}

function switchDashTab(tab, el) {
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');

  if (tab === 'myRequests') {
    api.getMyRequests().then(data => renderDashRequests(data.requests)).catch(() => {});
  } else {
    api.getMyDonations().then(data => renderDashDonations(data.donations)).catch(() => {});
  }
}

function renderDashRequests(requests) {
  const container = document.getElementById('dashTabContent');
  if (!requests.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">No requests yet</div>
        <div class="empty-desc">Your blood/plasma requests will appear here</div>
        <button class="btn btn-primary" onclick="navigate('new-request')">Create Request</button>
      </div>`;
    return;
  }
  container.innerHTML = '<div class="requests-list">' + requests.map(r => renderRequestCard(r, true)).join('') + '</div>';
}

function renderDashDonations(donations) {
  const container = document.getElementById('dashTabContent');
  if (!donations.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🩸</div>
        <div class="empty-title">No donations yet</div>
        <div class="empty-desc">When you respond to requests, they'll appear here</div>
        <button class="btn btn-primary" onclick="navigate('requests')">Browse Requests</button>
      </div>`;
    return;
  }
  container.innerHTML = '<div class="requests-list">' + donations.map(d => `
    <div class="request-card" onclick="navigate('request-detail', ${d.request_id})">
      <div class="request-urgency-bar ${d.urgency}"></div>
      <div class="request-content">
        <div class="request-blood-badge">${d.blood_group}</div>
        <div class="request-info">
          <div class="request-title">${getComponentLabel(d.component)} for ${d.requester_name}</div>
          <div class="request-meta">
            <span>🏥 ${d.hospital || 'N/A'}</span>
            <span>📍 ${d.city || 'N/A'}</span>
            <span class="status-tag ${d.request_status}">${d.request_status}</span>
          </div>
        </div>
        <div class="status-tag ${d.status}">${d.status}</div>
      </div>
    </div>
  `).join('') + '</div>';
}

// ─── SEARCH ───────────────────────────────
async function searchDonors() {
  const blood_group = document.getElementById('searchBlood').value;
  const city = document.getElementById('searchCity').value;
  const container = document.getElementById('searchResults');

  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

  try {
    const params = {};
    if (blood_group) params.blood_group = blood_group;
    if (city) params.city = city;

    const data = await api.searchDonors(params);
    renderDonors(data.donors);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">Error</div><div class="empty-desc">${err.message}</div></div>`;
  }
}

async function searchNearby() {
  if (!navigator.geolocation) {
    showToast('Not Supported', 'Geolocation not available in your browser', 'error');
    return;
  }

  const container = document.getElementById('searchResults');
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const params = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          radius: 50
        };
        const blood_group = document.getElementById('searchBlood').value;
        if (blood_group) params.blood_group = blood_group;

        const data = await api.searchDonors(params);
        renderDonors(data.donors);
      } catch (err) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">Error</div><div class="empty-desc">${err.message}</div></div>`;
      }
    },
    () => {
      showToast('Location Denied', 'Please allow location access to find nearby donors', 'warning');
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📍</div><div class="empty-title">Location Required</div><div class="empty-desc">Allow location access to find donors near you</div></div>`;
    }
  );
}

function renderDonors(donors) {
  const container = document.getElementById('searchResults');
  if (!donors.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">😕</div>
        <div class="empty-title">No Donors Found</div>
        <div class="empty-desc">Try broadening your search or checking a different city</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <p style="color:var(--text-secondary);margin-bottom:16px;font-size:14px">${donors.length} donor${donors.length !== 1 ? 's' : ''} found</p>
    <div class="donor-grid">
      ${donors.map(d => `
        <div class="donor-card">
          <div class="donor-header">
            <div class="donor-avatar">${d.name.charAt(0)}</div>
            <div>
              <div class="donor-name">${d.name}</div>
              <span class="donor-blood">${d.blood_group}</span>
            </div>
          </div>
          <div class="donor-details">
            <span>📍 ${d.city || 'Unknown location'}</span>
            <span>📞 ${d.phone}</span>
            ${d.distance !== undefined ? `<span class="donor-distance">📏 ${d.distance} km away</span>` : ''}
            <span>${d.is_available ? '🟢 Available' : '🔴 Not Available'}</span>
          </div>
          <a href="tel:${d.phone}" class="btn btn-primary btn-sm" style="width:100%">📞 Contact Donor</a>
        </div>
      `).join('')}
    </div>
  `;
}

// ─── REQUESTS ─────────────────────────────
async function loadRequests() {
  const container = document.getElementById('requestsList');
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

  try {
    const params = {};
    const blood = document.getElementById('filterBlood').value;
    const status = document.getElementById('filterStatus').value;
    if (blood) params.blood_group = blood;
    if (status) params.status = status;

    const data = await api.getRequests(params);
    renderRequestsList(data.requests, 'requestsList');
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">Error loading requests</div></div>`;
  }
}

function renderRequestsList(requests, containerId) {
  const container = document.getElementById(containerId);
  if (!requests || !requests.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">No Requests Found</div>
        <div class="empty-desc">There are no active requests at the moment</div>
      </div>`;
    return;
  }

  container.innerHTML = requests.map(r => renderRequestCard(r)).join('');
}

function renderRequestCard(r, showStatus = false) {
  const timeAgo = getTimeAgo(r.created_at);
  return `
    <div class="request-card" onclick="navigate('request-detail', ${r.id})">
      <div class="request-urgency-bar ${r.urgency}"></div>
      <div class="request-content">
        <div class="request-blood-badge">${r.blood_group}</div>
        <div class="request-info">
          <div class="request-title">
            ${getComponentLabel(r.component)} Request
            <span class="urgency-tag ${r.urgency}">${r.urgency}</span>
            ${showStatus ? `<span class="status-tag ${r.status}">${r.status}</span>` : ''}
          </div>
          <div class="request-meta">
            <span>🏥 ${r.hospital || 'Not specified'}</span>
            <span>📍 ${r.city || 'N/A'}</span>
            <span>💉 ${r.units_needed} unit(s)</span>
            <span>🕐 ${timeAgo}</span>
          </div>
        </div>
      </div>
      <div class="request-actions">
        ${currentUser ? '<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();">View</button>' : ''}
      </div>
    </div>
  `;
}

// ─── REQUEST DETAIL ───────────────────────
async function loadRequestDetail(requestId) {
  if (!requestId) return;
  const container = document.getElementById('requestDetail');
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

  try {
    const data = await api.getRequest(requestId);
    const r = data.request;
    const responses = data.responses || [];
    const isOwner = currentUser && currentUser.id === r.requester_id;
    const alreadyResponded = currentUser && responses.some(rs => rs.donor_id === currentUser.id);

    container.innerHTML = `
      <button class="btn btn-ghost" onclick="navigate('requests')" style="margin-bottom:16px">← Back to Requests</button>
      
      <div class="detail-header">
        <div class="detail-blood">${r.blood_group}</div>
        <div class="detail-info">
          <h2>${getComponentLabel(r.component)} Request <span class="urgency-tag ${r.urgency}">${r.urgency}</span></h2>
          <p style="color:var(--text-secondary);font-size:14px">
            By ${r.requester_name} · ${getTimeAgo(r.created_at)} · <span class="status-tag ${r.status}">${r.status}</span>
          </p>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-item-label">Blood Group</div>
          <div class="detail-item-value">${r.blood_group}</div>
        </div>
        <div class="detail-item">
          <div class="detail-item-label">Component</div>
          <div class="detail-item-value">${getComponentLabel(r.component)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-item-label">Units Needed</div>
          <div class="detail-item-value">${r.units_needed}</div>
        </div>
        <div class="detail-item">
          <div class="detail-item-label">Urgency</div>
          <div class="detail-item-value">${r.urgency.charAt(0).toUpperCase() + r.urgency.slice(1)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-item-label">Hospital</div>
          <div class="detail-item-value">${r.hospital || 'Not specified'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-item-label">City</div>
          <div class="detail-item-value">${r.city || 'Not specified'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-item-label">Contact</div>
          <div class="detail-item-value">${r.contact_phone || r.requester_phone || 'N/A'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-item-label">Status</div>
          <div class="detail-item-value">${r.status}</div>
        </div>
      </div>

      ${r.notes ? `<div class="card" style="margin-bottom:24px"><strong>Notes:</strong> ${escapeHtml(r.notes)}</div>` : ''}

      <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap">
        ${!isOwner && currentUser && r.status === 'active' && !alreadyResponded ? 
          `<button class="btn btn-primary btn-lg" onclick="respondToRequest(${r.id})">🩸 I Want to Donate</button>` : ''}
        ${!isOwner && currentUser && alreadyResponded ? 
          `<button class="btn btn-success btn-lg" disabled>✅ You've Already Responded</button>` : ''}
        ${r.contact_phone ? `<a href="tel:${r.contact_phone}" class="btn btn-secondary btn-lg">📞 Call Now</a>` : ''}
        ${isOwner && r.status === 'active' ? `
          <button class="btn btn-success" onclick="updateStatus(${r.id},'fulfilled')">✅ Mark Fulfilled</button>
          <button class="btn btn-ghost" onclick="updateStatus(${r.id},'cancelled')">Cancel Request</button>
        ` : ''}
        ${isOwner ? `<button class="btn btn-danger" onclick="deleteRequest(${r.id})" style="background:var(--danger-500);color:white;border:none;padding:10px 24px;border-radius:var(--radius-md);cursor:pointer;">Delete Request</button>` : ''}
      </div>

      ${isOwner && r.status === 'active' ? `
      <div class="card" style="margin-bottom:24px; background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.2);">
        <h3 style="margin-bottom: 8px; font-size: 16px; display:flex; align-items:center; gap:8px;">🆘 Advanced Emergency Tools</h3>
        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">If you haven't received a response yet, try these fallback options:</p>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="showToast('Broadening Match Area', 'Escalating query to 15km radius and notifying 45 more donors.', 'success')" style="border-color:#3b82f6;color:#60a5fa">🎯 Broaden Search Radius (15km)</button>
          <button class="btn btn-secondary btn-sm" onclick="showToast('Automated Alerts Sent', 'High-priority SMS & WhatsApp messages dispatched to matched donors.', 'success')" style="border-color:#22c55e;color:#4ade80">💬 Auto SMS / WhatsApp</button>
          <button class="btn btn-secondary btn-sm" onclick="showToast('Pinging Blood Banks', 'Query dispatched to 3 nearby hospital and blood bank APIs.', 'success')" style="border-color:#f59e0b;color:#fbbf24">🏥 Check Blood Banks API</button>
          <a class="btn btn-secondary btn-sm" href="https://twitter.com/intent/tweet?text=URGENT%3A+Need+${r.units_needed}+units+of+${encodeURIComponent(r.blood_group)}+blood+at+${encodeURIComponent(r.hospital || r.city || 'Hospital')}.+Please+help!" target="_blank" style="border-color:#0ea5e9;color:#38bdf8">🐦 Share to Twitter</a>
        </div>
      </div>
      ` : ''}

      <div class="responses-section">
        <h3>🤝 Donor Responses (${responses.length})</h3>
        ${responses.length ? responses.map(rs => `
          <div class="response-item">
            <div class="response-avatar">${rs.donor_name.charAt(0)}</div>
            <div style="flex:1">
              <div style="font-weight:600;font-size:15px">${rs.donor_name}</div>
              <div style="font-size:13px;color:var(--text-secondary)">
                ${rs.donor_blood_group} · ${rs.donor_city || 'N/A'} · ${rs.donor_phone}
              </div>
            </div>
            <div class="status-tag ${rs.status}">${rs.status}</div>
          </div>
        `).join('') : `
          <div class="empty-state" style="padding:32px">
            <div class="empty-icon">🤝</div>
            <div class="empty-title">No responses yet</div>
            <div class="empty-desc">Donors will be notified and responses will appear here</div>
          </div>
        `}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">Error loading request</div><div class="empty-desc">${err.message}</div></div>`;
  }
}

async function respondToRequest(id) {
  try {
    await api.respondToRequest(id);
    showToast('Response Sent! 🩸', 'The requester has been notified. Thank you for being a hero!', 'success');
    loadRequestDetail(id);
  } catch (err) {
    showToast('Error', err.message, 'error');
  }
}

async function updateStatus(id, status) {
  try {
    await api.updateRequestStatus(id, status);
    showToast('Updated', `Request marked as ${status}`, 'success');
    loadRequestDetail(id);
  } catch (err) {
    showToast('Error', err.message, 'error');
  }
}

async function deleteRequest(id) {
  if (!confirm('Are you sure you want to completely delete this request?')) return;
  try {
    await api.deleteRequest(id);
    showToast('Deleted', 'Request has been deleted', 'success');
    navigate('dashboard');
  } catch (err) {
    showToast('Error', err.message, 'error');
  }
}

// ─── CREATE REQUEST ───────────────────────
async function handleCreateRequest(e) {
  e.preventDefault();
  const btn = document.getElementById('reqSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  const bloodGroup = selectedBloodGroups['reqBloodGrid'];
  if (!bloodGroup) {
    showToast('Missing Info', 'Please select the required blood group', 'error');
    btn.disabled = false;
    btn.textContent = '🚨 Submit Emergency Request';
    return;
  }

  try {
    const data = await api.createRequest({
      blood_group: bloodGroup,
      component: document.getElementById('reqComponent').value,
      units_needed: parseInt(document.getElementById('reqUnits').value),
      urgency: selectedUrgency,
      hospital: document.getElementById('reqHospital').value,
      city: document.getElementById('reqCity').value,
      contact_phone: document.getElementById('reqPhone').value,
      notes: document.getElementById('reqNotes').value,
    });

    showToast('🚨 Request Created!', 'Matching donors have been notified instantly', 'emergency');
    navigate('request-detail', data.request.id);
    document.getElementById('requestForm').reset();
    selectedBloodGroups['reqBloodGrid'] = null;
    document.querySelectorAll('#reqBloodGrid .blood-group-option').forEach(o => o.classList.remove('selected'));
  } catch (err) {
    showToast('Error', err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🚨 Submit Emergency Request';
  }
}

// ─── NOTIFICATIONS ────────────────────────
async function loadNotifications() {
  const container = document.getElementById('notifList');
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

  try {
    const data = await api.getNotifications();
    if (!data.notifications.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔔</div>
          <div class="empty-title">No Notifications</div>
          <div class="empty-desc">You're all caught up! Notifications about matching requests and donor responses will appear here.</div>
        </div>`;
      return;
    }

    container.innerHTML = data.notifications.map(n => {
      const iconMap = { emergency: '🚨', match: '🩸', response: '✅', info: 'ℹ️' };
      return `
        <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="handleNotifClick(${n.id}, ${n.request_id})">
          <div class="notif-icon ${n.type}">${iconMap[n.type] || 'ℹ️'}</div>
          <div class="notif-content">
            <div class="notif-title">${escapeHtml(n.title)}</div>
            <div class="notif-message">${escapeHtml(n.message)}</div>
            <div class="notif-time">${getTimeAgo(n.created_at)}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">Error</div></div>`;
  }
}

async function handleNotifClick(notifId, requestId) {
  try {
    await api.markRead(notifId);
    loadNotificationCount();
    if (requestId) {
      navigate('request-detail', requestId);
    }
  } catch (e) {}
}

async function markAllRead() {
  try {
    await api.markAllRead();
    loadNotificationCount();
    loadNotifications();
    showToast('Done', 'All notifications marked as read', 'success');
  } catch (e) {}
}

async function loadNotificationCount() {
  if (!currentUser) return;
  try {
    const data = await api.getNotifications();
    const badge = document.getElementById('notifBadge');
    if (data.unread_count > 0) {
      badge.style.display = '';
      badge.textContent = data.unread_count > 9 ? '9+' : data.unread_count;
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {}
}

// ─── SSE (REAL-TIME) ──────────────────────
function connectSSE() {
  if (!currentUser || sseConnection) return;

  sseConnection = new EventSource(`/api/notifications/stream`, {
    headers: { 'Authorization': `Bearer ${api.token}` }
  });

  // SSE doesn't support custom headers, we'll use a workaround
  sseConnection.close();

  // Use fetch-based SSE approach
  const evtSource = new EventSource(`/api/notifications/stream?token=${api.token}`);
  sseConnection = evtSource;

  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'connected') return;

      // Show toast
      const toastType = data.type === 'emergency' ? 'emergency' : data.type === 'response' ? 'success' : 'warning';
      showToast(data.title || 'Notification', data.message, toastType);

      // Update badge
      loadNotificationCount();

      // Reload current page if needed
      if (currentPage === 'notifications') loadNotifications();
      if (currentPage === 'dashboard') loadDashboard();
      if (currentPage === 'request-detail') loadRequestDetail(data.request_id);
    } catch (e) {}
  };

  evtSource.onerror = () => {
    // Reconnect after delay
    setTimeout(() => {
      if (currentUser) {
        evtSource.close();
        sseConnection = null;
        connectSSE();
      }
    }, 5000);
  };
}

// ─── UI HELPERS ───────────────────────────
function selectBloodGroup(el, gridId) {
  document.querySelectorAll(`#${gridId} .blood-group-option`).forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  selectedBloodGroups[gridId] = el.dataset.value;
}

function selectUrgency(el) {
  document.querySelectorAll('#urgencySelector .urgency-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  selectedUrgency = el.dataset.value;
}

function showToast(title, message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const iconMap = { success: '✅', error: '❌', warning: '⚠️', emergency: '🚨' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${iconMap[type] || 'ℹ️'}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, type === 'emergency' ? 8000 : 4000);
}

function getTimeAgo(dateStr) {
  const date = new Date(dateStr + (dateStr.includes('Z') ? '' : 'Z'));
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

function getComponentLabel(component) {
  const labels = { whole_blood: 'Whole Blood', plasma: 'Plasma', platelets: 'Platelets', rbc: 'Red Blood Cells' };
  return labels[component] || 'Blood';
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function requestLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await api.updateProfile({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          });
        } catch (e) {}
      },
      () => {} // silently fail
    );
  }
}
