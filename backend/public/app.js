/**
 * NEXORA Admin Console — Single-Page Vanilla JavaScript Application
 * Hash-routed, in-memory CSRF token, zero external runtime dependencies.
 */

(function () {
  'use strict';

  // --- In-Memory State ---
  const state = {
    user: null,          // { id, email, role, permissions }
    csrfToken: null,     // NEVER persisted to localStorage or sessionStorage
    currentRoute: '',
  };

  // --- API Client ---
  async function api(path, options = {}) {
    const opts = {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      credentials: 'include', // sends nexora_session cookie
      ...options,
    };

    // Attach in-memory CSRF token on mutating requests
    if (opts.method && opts.method !== 'GET' && state.csrfToken) {
      opts.headers['X-CSRF-Token'] = state.csrfToken;
    }

    const response = await fetch('/api' + path, opts);

    if (response.status === 401 && path !== '/admin/auth/login' && path !== '/admin/auth/me') {
      logoutCleanState();
      navigate('login');
      notify('Session expired. Please log in again.', 'error');
      throw new Error('Unauthorized');
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const msg = data.error?.message || `Request failed (${response.status})`;
      throw new Error(msg);
    }

    return data;
  }

  // --- Notification Toast ---
  function notify(message, type = 'info') {
    const container = document.getElementById('notificationArea');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `notification-toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // --- UI Router ---
  const routes = ['login', 'overview', 'licenses', 'customers', 'developers', 'audit'];

  function navigate(route) {
    if (!routes.includes(route)) {
      route = state.user ? 'overview' : 'login';
    }

    // Auth gate
    if (!state.user && route !== 'login') {
      route = 'login';
    } else if (state.user && route === 'login') {
      route = 'overview';
    }

    // Role gate for developers view (OWNER only)
    if (route === 'developers' && state.user?.role !== 'OWNER') {
      notify('Access restricted to OWNER role.', 'error');
      route = 'overview';
    }

    state.currentRoute = route;
    window.location.hash = '#/' + route;

    // Show/hide views
    routes.forEach((r) => {
      const viewEl = document.getElementById(`view-${r}`);
      if (viewEl) viewEl.style.display = r === route ? 'block' : 'none';
    });

    // Update nav links
    document.querySelectorAll('.nav-link').forEach((link) => {
      link.classList.toggle('active', link.dataset.route === route);
    });

    // Run view loader
    loadViewData(route);
  }

  function handleHashChange() {
    const hash = window.location.hash.replace(/^#\/?/, '').trim();
    navigate(hash);
  }

  function updateHeaderUI() {
    const header = document.getElementById('mainHeader');
    if (!state.user) {
      header.style.display = 'none';
      return;
    }

    header.style.display = 'block';
    document.getElementById('userEmail').textContent = state.user.email;
    const roleBadge = document.getElementById('headerRole');
    roleBadge.textContent = state.user.role;
    roleBadge.className = state.user.role === 'OWNER' ? 'badge badge-purple' : 'badge badge-neutral';

    // Show owner-only links
    document.querySelectorAll('.owner-only').forEach((el) => {
      el.style.display = state.user.role === 'OWNER' ? 'inline-block' : 'none';
    });
  }

  function logoutCleanState() {
    state.user = null;
    state.csrfToken = null;
    updateHeaderUI();
  }

  // --- View Data Loaders ---
  async function loadViewData(route) {
    switch (route) {
      case 'overview':
        await loadOverview();
        break;
      case 'licenses':
        await loadLicenses();
        break;
      case 'customers':
        await loadCustomers();
        break;
      case 'developers':
        await loadDevelopers();
        break;
      case 'audit':
        await loadAudit();
        break;
    }
  }

  // --- Overview ---
  async function loadOverview() {
    try {
      const data = await api('/admin/overview');

      document.getElementById('statTotalLicenses').textContent = data.licenses.total;
      document.getElementById('statActiveLicenses').textContent = `Active: ${data.licenses.active}`;
      document.getElementById('statUnusedLicenses').textContent = data.licenses.unused;
      document.getElementById('statInactiveLicenses').textContent = data.licenses.expired + data.licenses.revoked;
      document.getElementById('statRevokedBreakdown').textContent = `Revoked: ${data.licenses.revoked} · Expired: ${data.licenses.expired}`;

      document.getElementById('statTotalCustomers').textContent = data.customers.total;
      document.getElementById('statBannedCustomers').textContent = `Banned: ${data.customers.banned}`;

      const dbStatusBadge = document.getElementById('healthDbStatus');
      if (data.health.db) {
        dbStatusBadge.textContent = 'Operational';
        dbStatusBadge.className = 'badge badge-success';
      } else {
        dbStatusBadge.textContent = 'Degraded';
        dbStatusBadge.className = 'badge badge-error';
      }

      document.getElementById('healthUptime').textContent = `${Math.floor(data.health.uptime / 60)} min`;
      document.getElementById('statDevsActive').textContent = `${data.developers.total - data.developers.suspended} / ${data.developers.total}`;

      // Recent audit feed
      const auditList = document.getElementById('overviewAuditList');
      if (data.recentAudit.length === 0) {
        auditList.innerHTML = '<div class="subtitle text-center py-4">No recent activity</div>';
      } else {
        auditList.innerHTML = data.recentAudit
          .map(
            (item) => `
          <div class="activity-item">
            <span><strong>${escapeHtml(item.action)}</strong> (${escapeHtml(item.actorKind)})</span>
            <span class="text-subtle">${new Date(item.createdAt).toLocaleTimeString()}</span>
          </div>`
          )
          .join('');
      }
    } catch (err) {
      notify('Failed to load overview: ' + err.message, 'error');
    }
  }

  // --- Licenses ---
  async function loadLicenses() {
    const q = document.getElementById('licenseSearchInput')?.value.trim() || '';
    const status = document.getElementById('licenseStatusFilter')?.value || '';
    const plan = document.getElementById('licensePlanFilter')?.value || '';

    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (plan) params.set('plan', plan);

    const tbody = document.getElementById('licensesTableBody');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4">Loading licenses…</td></tr>';

    try {
      const data = await api(`/admin/licenses?${params.toString()}`);
      if (!data.licenses || data.licenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4">No licenses found.</td></tr>';
        return;
      }

      tbody.innerHTML = data.licenses
        .map((lic) => {
          const statusClass =
            lic.status === 'active'
              ? 'badge-success'
              : lic.status === 'unused'
              ? 'badge-purple'
              : lic.status === 'revoked'
              ? 'badge-error'
              : 'badge-neutral';

          const expires = lic.expires_at ? new Date(lic.expires_at).toLocaleDateString() : 'Lifetime';
          const created = new Date(lic.created_at).toLocaleDateString();

          const canRevoke = lic.status === 'active' || lic.status === 'unused';
          const canRestore = lic.status === 'revoked';

          return `
          <tr>
            <td><code class="code-pill">${escapeHtml(lic.id.substring(0, 8))}…</code></td>
            <td><strong>${escapeHtml(lic.plan)}</strong></td>
            <td><span class="badge ${statusClass}">${escapeHtml(lic.status)}</span></td>
            <td>${lic.device_limit}</td>
            <td>${expires}</td>
            <td>${created}</td>
            <td>
              <button class="btn btn-secondary btn-sm inspect-act-btn" data-id="${lic.id}">Devices</button>
              ${
                canRevoke
                  ? `<button class="btn btn-danger btn-sm revoke-lic-btn" data-id="${lic.id}">Revoke</button>`
                  : ''
              }
              ${
                canRestore
                  ? `<button class="btn btn-secondary btn-sm restore-lic-btn" data-id="${lic.id}">Restore</button>`
                  : ''
              }
            </td>
          </tr>`;
        })
        .join('');

      // Attach actions
      tbody.querySelectorAll('.inspect-act-btn').forEach((btn) => {
        btn.addEventListener('click', () => openActivationsModal(btn.dataset.id));
      });

      tbody.querySelectorAll('.revoke-lic-btn').forEach((btn) => {
        btn.addEventListener('click', () => confirmRevokeLicense(btn.dataset.id));
      });

      tbody.querySelectorAll('.restore-lic-btn').forEach((btn) => {
        btn.addEventListener('click', () => restoreLicense(btn.dataset.id));
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-warning">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function confirmRevokeLicense(licenseId) {
    const reason = prompt('Reason for license revocation (optional):');
    if (reason === null) return; // user cancelled

    try {
      await api(`/admin/licenses/${licenseId}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      notify('License revoked successfully.', 'info');
      await loadLicenses();
    } catch (err) {
      notify('Failed to revoke: ' + err.message, 'error');
    }
  }

  async function restoreLicense(licenseId) {
    if (!confirm('Are you sure you want to restore this revoked license?')) return;

    try {
      await api(`/admin/licenses/${licenseId}/restore`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      notify('License restored successfully.', 'info');
      await loadLicenses();
    } catch (err) {
      notify('Failed to restore: ' + err.message, 'error');
    }
  }

  async function openActivationsModal(licenseId) {
    const modal = document.getElementById('activationsModal');
    const title = document.getElementById('activationsLicenseTitle');
    const tbody = document.getElementById('activationsTableBody');

    title.textContent = `License ID: ${licenseId}`;
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3">Loading device records…</td></tr>';
    modal.style.display = 'flex';

    try {
      const data = await api(`/admin/licenses/${licenseId}/activations`);
      if (!data.activations || data.activations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3">No active or past devices for this license.</td></tr>';
        return;
      }

      tbody.innerHTML = data.activations
        .map((dev) => {
          const isDeactivated = !!dev.deactivatedAt;
          const status = isDeactivated
            ? '<span class="badge badge-neutral">Deactivated</span>'
            : '<span class="badge badge-success">Active</span>';

          return `
          <tr>
            <td><code class="code-pill">${escapeHtml(dev.deviceId.substring(0, 16))}…</code></td>
            <td>${escapeHtml(dev.ip || '—')}</td>
            <td>${new Date(dev.activatedAt).toLocaleString()}</td>
            <td>${new Date(dev.lastSeenAt).toLocaleString()}</td>
            <td>${status}</td>
          </tr>`;
        })
        .join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-warning">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // --- Customers ---
  async function loadCustomers() {
    const q = document.getElementById('customerSearchInput')?.value.trim() || '';
    const params = new URLSearchParams();
    if (q) params.set('q', q);

    const tbody = document.getElementById('customersTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4">Loading customers…</td></tr>';

    try {
      const data = await api(`/admin/customers?${params.toString()}`);
      if (!data.customers || data.customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4">No customers registered yet.</td></tr>';
        return;
      }

      tbody.innerHTML = data.customers
        .map((c) => {
          const statusBadge = c.isBanned
            ? '<span class="badge badge-error">Banned</span>'
            : '<span class="badge badge-success">Active</span>';

          return `
          <tr>
            <td><code class="code-pill">${escapeHtml(c.id.substring(0, 8))}…</code></td>
            <td>${escapeHtml(c.email || '—')}</td>
            <td>${statusBadge}</td>
            <td>${new Date(c.createdAt).toLocaleDateString()}</td>
            <td>
              ${
                c.isBanned
                  ? `<button class="btn btn-secondary btn-sm unban-cust-btn" data-id="${c.id}">Unban</button>`
                  : `<button class="btn btn-danger btn-sm ban-cust-btn" data-id="${c.id}">Ban</button>`
              }
            </td>
          </tr>`;
        })
        .join('');

      tbody.querySelectorAll('.ban-cust-btn').forEach((btn) => {
        btn.addEventListener('click', () => handleBanCustomer(btn.dataset.id, true));
      });

      tbody.querySelectorAll('.unban-cust-btn').forEach((btn) => {
        btn.addEventListener('click', () => handleBanCustomer(btn.dataset.id, false));
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-warning">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function handleBanCustomer(customerId, isBan) {
    const action = isBan ? 'ban' : 'unban';
    if (!confirm(`Are you sure you want to ${action} this customer?`)) return;

    try {
      await api(`/admin/customers/${customerId}/${action}`, { method: 'POST', body: '{}' });
      notify(`Customer ${action}ned successfully.`, 'info');
      await loadCustomers();
    } catch (err) {
      notify(`Failed to ${action}: ` + err.message, 'error');
    }
  }

  // --- Developers (OWNER only) ---
  async function loadDevelopers() {
    if (state.user?.role !== 'OWNER') return;

    const tbody = document.getElementById('developersTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">Loading developers…</td></tr>';

    try {
      const data = await api('/admin/developers');
      if (!data.developers || data.developers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">No developer accounts.</td></tr>';
        return;
      }

      tbody.innerHTML = data.developers
        .map((dev) => {
          const status = dev.isSuspended
            ? '<span class="badge badge-error">Suspended</span>'
            : '<span class="badge badge-success">Active</span>';

          const perms = dev.permissions && dev.permissions.length > 0
            ? dev.permissions.map((p) => `<code class="code-pill">${escapeHtml(p)}</code>`).join(' ')
            : '<span class="text-subtle">None</span>';

          return `
          <tr>
            <td><strong>${escapeHtml(dev.email)}</strong></td>
            <td><span class="badge badge-neutral">${escapeHtml(dev.role)}</span></td>
            <td>${perms}</td>
            <td>${status}</td>
            <td>${new Date(dev.createdAt).toLocaleDateString()}</td>
            <td>
              ${
                !dev.isSuspended
                  ? `<button class="btn btn-danger btn-sm suspend-dev-btn" data-id="${dev.id}">Suspend</button>`
                  : ''
              }
              <button class="btn btn-secondary btn-sm revoke-dev-sessions-btn" data-id="${dev.id}">Revoke Sessions</button>
            </td>
          </tr>`;
        })
        .join('');

      tbody.querySelectorAll('.suspend-dev-btn').forEach((btn) => {
        btn.addEventListener('click', () => suspendDeveloper(btn.dataset.id));
      });

      tbody.querySelectorAll('.revoke-dev-sessions-btn').forEach((btn) => {
        btn.addEventListener('click', () => revokeDeveloperSessions(btn.dataset.id));
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-warning">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function suspendDeveloper(devId) {
    if (!confirm('Are you sure you want to suspend this developer? All sessions will be terminated immediately.')) {
      return;
    }

    try {
      await api(`/admin/developers/${devId}/suspend`, { method: 'POST', body: '{}' });
      notify('Developer account suspended.', 'info');
      await loadDevelopers();
    } catch (err) {
      notify('Failed to suspend: ' + err.message, 'error');
    }
  }

  async function revokeDeveloperSessions(devId) {
    try {
      const res = await api(`/admin/developers/${devId}/revoke-sessions`, { method: 'POST', body: '{}' });
      notify(`Revoked ${res.sessionsRevoked} active session(s).`, 'info');
    } catch (err) {
      notify('Failed to revoke sessions: ' + err.message, 'error');
    }
  }

  // --- Audit & Security ---
  async function loadAudit() {
    const auditTbody = document.getElementById('auditTableBody');
    const secTbody = document.getElementById('securityTableBody');

    try {
      const data = await api('/admin/audit?limit=100');

      if (data.audit.length === 0) {
        auditTbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">No audit logs found.</td></tr>';
      } else {
        auditTbody.innerHTML = data.audit
          .map(
            (a) => `
          <tr>
            <td>${new Date(a.createdAt).toLocaleString()}</td>
            <td>${escapeHtml(a.actorKind)} ${a.actorId ? `(${escapeHtml(a.actorId.substring(0, 8))}…)` : ''}</td>
            <td><strong>${escapeHtml(a.action)}</strong></td>
            <td>${escapeHtml(a.targetKind || '—')}</td>
            <td>${escapeHtml(a.ip || '—')}</td>
            <td><code class="code-pill">${escapeHtml(JSON.stringify(a.metadata))}</code></td>
          </tr>`
          )
          .join('');
      }

      if (data.security.length === 0) {
        secTbody.innerHTML = '<tr><td colspan="5" class="text-center py-4">No security events recorded.</td></tr>';
      } else {
        secTbody.innerHTML = data.security
          .map(
            (s) => `
          <tr>
            <td>${new Date(s.createdAt).toLocaleString()}</td>
            <td><span class="badge badge-error">${escapeHtml(s.kind)}</span></td>
            <td>${escapeHtml(s.ip || '—')}</td>
            <td class="text-subtle">${escapeHtml((s.userAgent || '—').substring(0, 40))}…</td>
            <td><code class="code-pill">${escapeHtml(JSON.stringify(s.metadata))}</code></td>
          </tr>`
          )
          .join('');
      }
    } catch (err) {
      auditTbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-warning">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // --- Escape HTML Helper ---
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- DOM Setup & Event Listeners ---
  function init() {
    // Hash change handler
    window.addEventListener('hashchange', handleHashChange);

    // Login Form Submit
    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const errorEl = document.getElementById('loginError');
      const submitBtn = document.getElementById('loginSubmitBtn');

      errorEl.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in…';

      try {
        const data = await api('/admin/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });

        state.user = data.user;
        state.csrfToken = data.csrfToken;

        loginForm.reset();
        updateHeaderUI();
        navigate('overview');
        notify('Signed in successfully.', 'info');
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    });

    // Logout Button
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try {
        await api('/admin/auth/logout', { method: 'POST', body: '{}' });
      } catch (err) {
        // Continue logout anyway
      }
      logoutCleanState();
      navigate('login');
      notify('Logged out.', 'info');
    });

    // Refresh Buttons
    document.getElementById('refreshOverviewBtn')?.addEventListener('click', () => loadOverview());
    document.getElementById('applyLicenseFiltersBtn')?.addEventListener('click', () => loadLicenses());
    document.getElementById('searchCustomersBtn')?.addEventListener('click', () => loadCustomers());
    document.getElementById('refreshAuditBtn')?.addEventListener('click', () => loadAudit());

    // Audit Tab Pills
    document.querySelectorAll('.pill-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.pill-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');

        const isAudit = tab.dataset.auditTab === 'audit';
        document.getElementById('auditTabContent').style.display = isAudit ? 'block' : 'none';
        document.getElementById('securityTabContent').style.display = isAudit ? 'none' : 'block';
      });
    });

    // Modal Triggers & Closes
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.close;
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'none';
      });
    });

    document.getElementById('openBulkModalBtn')?.addEventListener('click', () => {
      document.getElementById('bulkModal').style.display = 'flex';
    });

    document.getElementById('openCreateDevModalBtn')?.addEventListener('click', () => {
      document.getElementById('createDevModal').style.display = 'flex';
    });

    // Bulk Activation Policy change (show/hide scheduled datetime input)
    document.getElementById('bulkActivationPolicy')?.addEventListener('change', (e) => {
      const scheduledGroup = document.getElementById('scheduledAtGroup');
      scheduledGroup.style.display = e.target.value === 'scheduled' ? 'block' : 'none';
    });

    // Bulk Generate Submit
    document.getElementById('bulkGenerateForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const plan = document.getElementById('bulkPlan').value;
      const count = parseInt(document.getElementById('bulkCount').value, 10);
      const deviceLimit = parseInt(document.getElementById('bulkDeviceLimit').value, 10);
      const activationPolicy = document.getElementById('bulkActivationPolicy').value;
      const activationAtVal = document.getElementById('bulkActivationAt').value;
      const notes = document.getElementById('bulkNotes').value.trim();
      const submitBtn = document.getElementById('generateSubmitBtn');

      const payload = { plan, count, deviceLimit, activationPolicy };
      if (activationPolicy === 'scheduled' && activationAtVal) {
        payload.activationAt = new Date(activationAtVal).toISOString();
      }
      if (notes) payload.notes = notes;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Generating…';

      try {
        const res = await api('/admin/licenses/bulk', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        // Close form modal
        document.getElementById('bulkModal').style.display = 'none';
        document.getElementById('bulkGenerateForm').reset();

        // Open one-time key display modal
        document.getElementById('keyCountDisplay').textContent = res.keys.length;
        document.getElementById('generatedKeysText').value = res.keys.join('\n');
        document.getElementById('keyDisplayModal').style.display = 'flex';

        await loadLicenses();
      } catch (err) {
        notify('Bulk generation failed: ' + err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Generate Keys';
      }
    });

    // Copy Keys Button
    document.getElementById('copyAllKeysBtn')?.addEventListener('click', () => {
      const text = document.getElementById('generatedKeysText').value;
      navigator.clipboard.writeText(text).then(() => {
        notify('All generated keys copied to clipboard.', 'info');
      });
    });

    // Create Developer Submit
    document.getElementById('createDevForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('devEmail').value.trim();
      const password = document.getElementById('devPassword').value;
      const permissions = Array.from(
        document.querySelectorAll('input[name="permissions"]:checked')
      ).map((el) => el.value);

      const submitBtn = document.getElementById('createDevSubmitBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating…';

      try {
        await api('/admin/developers', {
          method: 'POST',
          body: JSON.stringify({ email, password, permissions }),
        });

        notify('Developer account created successfully.', 'info');
        document.getElementById('createDevModal').style.display = 'none';
        document.getElementById('createDevForm').reset();
        await loadDevelopers();
      } catch (err) {
        notify('Failed to create developer: ' + err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
      }
    });

    // Initial check: check if already authenticated via cookie
    api('/admin/auth/me')
      .then((data) => {
        state.user = data.user;
        state.csrfToken = data.csrfToken;
        updateHeaderUI();
        handleHashChange();
      })
      .catch(() => {
        logoutCleanState();
        navigate('login');
      });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
