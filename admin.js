// ==========================================
// BODRUM ADMIN - SKRINSHOT TASDIQLASH VERSION
// ==========================================

const SERVER_URL = 'https://backend-production-1bf4.up.railway.app';

let currentOrderKey = null;
let orders = [];
let customers = [];
let chartInstance = null;
let currentOrderView = 'new';
let lastCheckTime = null;
let pollingInterval = null;
let isPolling = false;

// ==========================================
// INIT
// ==========================================

function init() {
  console.log('🚀 Admin panel init (Screenshot Verification)');
  
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.expand();
    tg.ready();
  }
  
  startPolling();
  loadCustomers();
}

// ==========================================
// HTTP POLLING
// ==========================================

function startPolling() {
  if (isPolling) return;
  isPolling = true;
  
  console.log('🔄 HTTP Polling boshlandi');
  
  loadOrders();
  
  pollingInterval = setInterval(async () => {
    await checkNewOrders();
  }, 5000);
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  isPolling = false;
}

async function checkNewOrders() {
  try {
    const response = await fetch(`${SERVER_URL}/api/orders/new`);
    const newOrders = await response.json();
    
    let hasNew = false;
    
    newOrders.forEach(order => {
      const exists = orders.find(o => o.orderId === order.orderId || o.order_id === order.order_id);
      if (!exists) {
        orders.unshift({
          firebaseKey: order.orderId || order.order_id,
          ...order
        });
        hasNew = true;
        playNotificationSound();
        showToast(`🛎️ Yangi buyurtma!\n${order.name} - ${order.total?.toLocaleString()} so'm`);
      } else {
        const idx = orders.findIndex(o => o.orderId === order.orderId || o.order_id === order.order_id);
        if (idx !== -1) {
          const oldStatus = orders[idx].status;
          orders[idx] = {
            firebaseKey: order.orderId || order.order_id,
            ...order
          };
          if (oldStatus !== order.status) {
            console.log('🔄 Status o\'zgardi:', order.orderId, order.status);
          }
        }
      }
    });
    
    if (hasNew || newOrders.length > 0) {
      renderOrders();
      updateNewOrdersBadge();
      updateStats();
    }
    
  } catch (error) {
    console.error('❌ Polling xatosi:', error);
  }
}

// ==========================================
// LOAD ORDERS
// ==========================================

async function loadOrders() {
  try {
    const response = await fetch(`${SERVER_URL}/api/orders`);
    const data = await response.json();
    
    orders = data.map(order => ({
      firebaseKey: order.orderId || order.order_id,
      ...order
    })).sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at));
    
    renderOrders();
    loadCustomers();
    updateStats();
    updateNewOrdersBadge();
  } catch (error) {
    console.error('❌ Buyurtmalarni yuklash xatosi:', error);
  }
}

function updateNewOrdersBadge() {
  const newCount = orders.filter(o => 
    o.status === 'pending_verification' || o.status === 'payment_pending'
  ).length;
  
  document.getElementById('newOrdersCount').textContent = newCount;
  document.getElementById('newBadge').textContent = newCount;
  document.getElementById('ordersNavBadge').textContent = newCount;
  
  if (window.Telegram?.WebApp?.MainButton) {
    const tg = window.Telegram.WebApp;
    if (newCount > 0) {
      tg.MainButton.setText(`🛎️ ${newCount} yangi`);
      tg.MainButton.show();
    } else {
      tg.MainButton.hide();
    }
  }
}

// ==========================================
// RENDER ORDERS
// ==========================================

function renderOrders() {
  const container = document.getElementById('ordersListContainer');
  if (!container) return;
  
  const filtered = orders.filter(o => {
    if (currentOrderView === 'new') {
      return o.status === 'pending_verification' || o.status === 'payment_pending';
    }
    return o.status === 'accepted';
  });
  
  const newCount = orders.filter(o => 
    o.status === 'pending_verification' || o.status === 'payment_pending'
  ).length;
  
  document.getElementById('newOrdersCount').textContent = newCount;
  document.getElementById('newBadge').textContent = newCount;
  document.getElementById('ordersNavBadge').textContent = newCount;
  
  const today = new Date().toDateString();
  const todayRev = orders
    .filter(o => {
      const isToday = new Date(o.createdAt || o.created_at).toDateString() === today;
      const isPaidOrAccepted = o.paymentStatus === 'paid' || o.status === 'accepted';
      return isToday && isPaidOrAccepted;
    })
    .reduce((sum, o) => sum + (o.total || 0), 0);
  
  document.getElementById('todayRevenue').textContent = (todayRev / 1000).toFixed(0) + 'k';
  
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <p>${currentOrderView === 'new' ? 'Yangi buyurtmalar yo\'q' : 'Qabul qilingan buyurtmalar yo\'q'}</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filtered.map(order => createOrderCard(order)).join('');
  
  container.querySelectorAll('.order-card').forEach(card => {
    card.addEventListener('click', () => openOrderModal(card.dataset.id));
  });
}

function createOrderCard(order) {
  const date = new Date(order.created_at || order.createdAt);
  const time = date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  
  let itemsText = '';
  if (order.items && Array.isArray(order.items)) {
    itemsText = order.items.map(i => `${i.name} x${i.qty}`).join(', ');
  }
  
  const isPending = (order.status === 'pending_verification' || order.status === 'payment_pending');
  const hasScreenshot = order.screenshot ? true : false;
  
  return `
    <div class="order-card ${isPending ? 'new' : ''}" data-id="${order.firebaseKey}">
      ${hasScreenshot ? '<div class="screenshot-badge">📸</div>' : ''}
      <div class="order-header">
        <span class="order-id">#${(order.order_id || order.orderId)?.slice(-6)}</span>
        <span class="order-time">${time}</span>
      </div>
      <div class="order-customer">${order.name || "Noma'lum"}</div>
      <div class="order-phone">+998 ${order.phone}</div>
      <div class="order-items-preview">${itemsText}</div>
      <div class="order-footer">
        <span class="order-total">${order.total?.toLocaleString()} so'm</span>
        <span class="order-status ${order.status}">
          ${isPending ? (hasScreenshot ? '⏳ Tekshirilmoqda 📸' : '⏳ Tekshirilmoqda') : 'Qabul qilingan'}
        </span>
      </div>
    </div>
  `;
}

// ==========================================
// MODAL - SKRINSHOT KO'RISH VA TASDIQLASH
// ==========================================

window.openOrderModal = async function(orderId) {
  const order = orders.find(o => o.firebaseKey === orderId);
  if (!order) return;
  
  currentOrderKey = orderId;
  
  document.getElementById('modalOrderId').textContent = (order.order_id || order.orderId)?.slice(-6);
  document.getElementById('modalCustomer').textContent = order.name;
  document.getElementById('modalPhone').textContent = '+998 ' + order.phone;
  document.getElementById('modalTotal').textContent = (order.total || 0).toLocaleString() + ' so\'m';
  
  // Location
  const loc = document.getElementById('modalLocation');
  if (loc && order.location?.includes(',')) {
    const [lat, lng] = order.location.split(',');
    loc.href = `https://maps.google.com/?q=${lat},${lng}`;
    loc.parentElement.parentElement.style.display = 'flex';
  } else if (loc) {
    loc.parentElement.parentElement.style.display = 'none';
  }
  
  // Payment method
  const paymentMethod = order.paymentMethod || 'payme';
  const paymentStatus = order.paymentStatus || 'pending';
  const paymentText = paymentStatus === 'paid' ? `${paymentMethod.toUpperCase()} ✅` : paymentMethod.toUpperCase();
  
  document.getElementById('modalPayment').textContent = paymentText;
  document.getElementById('modalPayment').style.color = paymentStatus === 'paid' ? 'var(--success)' : '';
  
  // Items
  const items = order.items || [];
  document.getElementById('modalItems').innerHTML = items.map(i => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-name">${i.name}</div>
        <div class="item-qty">${i.qty} x ${i.price?.toLocaleString()} so'm</div>
      </div>
      <div class="item-price">${(i.qty * i.price).toLocaleString()} so'm</div>
    </div>
  `).join('');
  
  // ⭐ SKRINSHOT KO'RISH
  const modalBody = document.querySelector('#orderModal .modal-body');
  
  // Eski screenshot ni o'chirish
  const oldScreenshot = document.getElementById('modalScreenshot');
  if (oldScreenshot) oldScreenshot.remove();
  
  // Yangi screenshot qo'shish
  if (order.screenshot) {
    const screenshotSection = document.createElement('div');
    screenshotSection.id = 'modalScreenshot';
    screenshotSection.className = 'screenshot-section';
    screenshotSection.innerHTML = `
      <h4>📸 To'lov skrinshoti</h4>
      <div class="screenshot-image-wrapper">
        <img src="${order.screenshot}" alt="Payment Screenshot" onclick="openScreenshotFullscreen('${order.screenshot}')">
      </div>
      <p class="screenshot-hint">Kattalashtirish uchun bosing</p>
    `;
    
    // Items section dan oldin qo'shish
    const itemsSection = modalBody.querySelector('.items-section');
    modalBody.insertBefore(screenshotSection, itemsSection);
  }
  
  // Tasdiqlash tugmalari
  const isPending = order.status === 'pending_verification' || order.status === 'payment_pending';
  const actionsDiv = document.getElementById('modalActions');
  
  if (isPending) {
    actionsDiv.style.display = 'flex';
    actionsDiv.innerHTML = `
      <button class="action-btn reject" onclick="rejectOrder()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        Bekor qilish
      </button>
      <button class="action-btn accept" onclick="acceptOrder()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Qabul qilish
      </button>
    `;
  } else {
    actionsDiv.style.display = 'none';
  }
  
  document.getElementById('orderModal').classList.add('show');
};

window.closeModal = function() {
  document.getElementById('orderModal').classList.remove('show');
  currentOrderKey = null;
};

// ⭐ SKRINSHOTNI KATTAROQ KO'RISH
window.openScreenshotFullscreen = function(src) {
  const overlay = document.createElement('div');
  overlay.className = 'screenshot-fullscreen-overlay';
  overlay.innerHTML = `
    <div class="screenshot-fullscreen-content">
      <button class="close-fullscreen" onclick="this.parentElement.parentElement.remove()">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      <img src="${src}" alt="Fullscreen Screenshot">
    </div>
  `;
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  
  document.body.appendChild(overlay);
};

// ==========================================
// ACCEPT / REJECT
// ==========================================

window.acceptOrder = async function() {
  if (!currentOrderKey) return;
  
  const btn = document.querySelector('.action-btn.accept');
  const originalContent = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span> Jarayonda...';
  
  try {
    const order = orders.find(o => o.firebaseKey === currentOrderKey);
    if (!order) throw new Error('Buyurtma topilmadi');

    const response = await fetch(`${SERVER_URL}/api/orders/${order.order_id || order.orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'accepted',
        paymentStatus: 'paid',
        acceptedAt: new Date().toISOString()
      })
    });
    
    if (!response.ok) throw new Error('Server error');
    
    const updatedOrder = await response.json();
    
    showToast('✅ Buyurtma qabul qilindi');
    closeModal();
    
    // Mahalliy ro'yxatni yangilash
    const idx = orders.findIndex(o => o.order_id === order.order_id || o.orderId === order.orderId);
    if (idx !== -1) {
      orders[idx] = {
        firebaseKey: order.order_id || order.orderId,
        ...updatedOrder
      };
      renderOrders();
      updateNewOrdersBadge();
    }
    
  } catch (e) {
    console.error('❌ Accept error:', e);
    showToast('❌ Xatolik: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalContent;
  }
};

window.rejectOrder = async function() {
  if (!currentOrderKey) return;
  
  const reason = prompt('Bekor qilish sababini kiriting:');
  if (!reason) return;
  
  if (!confirm(`Rostdan ham bekor qilmoqchimisiz?\nSabab: ${reason}`)) return;
  
  const btn = document.querySelector('.action-btn.reject');
  const originalContent = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span> Jarayonda...';
  
  try {
    const order = orders.find(o => o.firebaseKey === currentOrderKey);
    if (!order) throw new Error('Buyurtma topilmadi');

    const response = await fetch(`${SERVER_URL}/api/orders/${order.order_id || order.orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'rejected',
        paymentStatus: 'failed',
        rejectedAt: new Date().toISOString(),
        adminNote: reason
      })
    });
    
    if (!response.ok) throw new Error('Server error');
    
    const updatedOrder = await response.json();
    
    showToast('❌ Buyurtma bekor qilindi');
    closeModal();
    
    const idx = orders.findIndex(o => o.order_id === order.order_id || o.orderId === order.orderId);
    if (idx !== -1) {
      orders[idx] = {
        firebaseKey: order.order_id || order.orderId,
        ...updatedOrder
      };
      renderOrders();
    }
    
  } catch (e) {
    console.error('❌ Reject error:', e);
    showToast('❌ Xatolik: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalContent;
  }
};

// ==========================================
// CUSTOMERS
// ==========================================

async function loadCustomers() {
  try {
    const customerMap = new Map();
    
    orders.forEach(order => {
      if (!customerMap.has(order.phone)) {
        customerMap.set(order.phone, {
          name: order.name,
          phone: order.phone,
          orders: 0,
          totalSpent: 0,
          lastOrder: order.created_at || order.createdAt
        });
      }
      const c = customerMap.get(order.phone);
      c.orders++;
      c.totalSpent += order.total || 0;
      if (new Date(order.created_at || order.createdAt) > new Date(c.lastOrder)) {
        c.lastOrder = order.created_at || order.createdAt;
      }
    });
    
    customers = Array.from(customerMap.values()).sort((a, b) => b.totalSpent - a.totalSpent);
    renderCustomers();
  } catch (error) {
    console.error('❌ Mijozlar xato:', error);
  }
}

function renderCustomers() {
  const container = document.getElementById('customersList');
  const searchInput = document.getElementById('customerSearch');
  const search = searchInput ? searchInput.value.toLowerCase() : '';
  
  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(search) || c.phone.includes(search)
  );
  
  document.getElementById('totalCustomers').textContent = customers.length;
  document.getElementById('vipCustomers').textContent = customers.filter(c => c.orders >= 5).length;
  
  const today = new Date().toDateString();
  const activeToday = customers.filter(c => new Date(c.lastOrder).toDateString() === today).length;
  document.getElementById('activeToday').textContent = activeToday;
  
  if (!container) return;
  
  container.innerHTML = filtered.map((c, i) => `
    <div class="customer-item" onclick="viewCustomer('${c.phone}')">
      <div class="customer-avatar">${c.name.charAt(0).toUpperCase()}</div>
      <div class="customer-info">
        <div class="customer-name">${c.name}</div>
        <div class="customer-meta">
          <span>+998 ${c.phone}</span>
          ${c.orders >= 5 ? '<span class="customer-badge">VIP</span>' : ''}
        </div>
      </div>
      <div class="customer-spent">
        <span class="spent-amount">${(c.totalSpent/1000).toFixed(0)}k</span>
        <span class="spent-label">so'm</span>
      </div>
    </div>
  `).join('');
}

window.switchTab = function(tabName) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if(item.dataset.tab === tabName) item.classList.add('active');
  });
  
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  
  const section = document.getElementById(tabName + 'Section');
  if (section) section.classList.add('active');
  
  if(tabName === 'stats') updateStats();
};

window.switchOrderView = function(view) {
  currentOrderView = view;
  document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  renderOrders();
};

window.searchCustomers = function() {
  renderCustomers();
};

window.viewCustomer = function(phone) {
  const c = customers.find(x => x.phone === phone);
  if (!c) return;
  
  const customerOrders = orders.filter(o => o.phone === phone).sort((a,b) => 
    new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt)
  );
  
  const content = document.getElementById('customerDetailContent');
  if (!content) return;
  
  content.innerHTML = `
    <div class="customer-info-card">
      <div class="info-row">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff6600" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <div class="info-content">
          <span class="info-label">Mijoz</span>
          <span class="info-value">${c.name}</span>
        </div>
      </div>
      <div class="info-row">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff6600" stroke-width="2">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
        <div class="info-content">
          <span class="info-label">Telefon</span>
          <span class="info-value">+998 ${c.phone}</span>
        </div>
      </div>
    </div>
    <h4 style="margin: 20px 0 12px; color: #888; font-size: 14px; text-transform: uppercase;">
      Buyurtmalar tarixi (${customerOrders.length})
    </h4>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${customerOrders.slice(0, 10).map(o => `
        <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; border: 1px solid #333;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-weight: 600;">#${(o.order_id || o.orderId)?.slice(-6)}</span>
            <span style="color: #00ff88; font-weight: 700;">${o.total?.toLocaleString()} so'm</span>
          </div>
          <div style="font-size: 12px; color: #666;">
            ${new Date(o.created_at || o.createdAt).toLocaleDateString('uz-UZ')} • ${(o.items || []).length} ta mahsulot
            ${o.screenshot ? ' • 📸' : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
  
  document.getElementById('customerModal').classList.add('show');
};

window.closeCustomerModal = function() {
  document.getElementById('customerModal').classList.remove('show');
};

window.setPeriod = function(period) {
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  updateStats(period);
};

function updateStats(period = 'day') {
  const now = new Date();
  let startDate = new Date();
  
  if (period === 'day') startDate.setHours(0,0,0,0);
  else if (period === 'week') startDate.setDate(now.getDate() - 7);
  else if (period === 'month') startDate.setMonth(now.getMonth() - 1);
  
  const filtered = orders.filter(o => {
    const d = new Date(o.created_at || o.createdAt);
    return d >= startDate && d <= now && (o.status === 'accepted' || o.paymentStatus === 'paid');
  });
  
  const revenue = filtered.reduce((sum, o) => sum + (o.total || 0), 0);
  
  document.getElementById('statRevenue').textContent = (revenue/1000).toFixed(0) + 'k';
  document.getElementById('statOrders').textContent = filtered.length;
  
  const ctx = document.getElementById('mainChart');
  if (!ctx) return;
  
  if (chartInstance) chartInstance.destroy();
  
  const dailyData = {};
  filtered.forEach(o => {
    const d = new Date(o.created_at || o.createdAt).toLocaleDateString('uz-UZ', { weekday: 'short' });
    dailyData[d] = (dailyData[d] || 0) + o.total;
  });
  
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: Object.keys(dailyData),
      datasets: [{
        label: 'Daromad',
        data: Object.values(dailyData),
        borderColor: '#FFD700',
        backgroundColor: 'rgba(255, 215, 0, 0.1)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#FFD700',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { 
          grid: { color: 'rgba(212, 175, 55, 0.1)' }, 
          ticks: { 
            color: '#888',
            callback: function(value) { return (value/1000) + 'k'; }
          } 
        },
        x: { 
          grid: { display: false }, 
          ticks: { color: '#888' } 
        }
      }
    }
  });
  
  const productStats = {};
  filtered.forEach(o => {
    (o.items || []).forEach(i => {
      productStats[i.name] = (productStats[i.name] || 0) + i.qty;
    });
  });
  
  const sorted = Object.entries(productStats).sort((a,b) => b[1] - a[1]).slice(0, 5);
  
  document.getElementById('topProductsList').innerHTML = sorted.map((item, i) => `
    <div class="top-item">
      <div class="top-rank ${i < 3 ? ['gold', 'silver', 'bronze'][i] : ''}">${i + 1}</div>
      <div class="top-info">
        <div class="top-name">${item[0]}</div>
        <div class="top-count">${item[1]} ta sotildi</div>
      </div>
    </div>
  `).join('');
}

// ==========================================
// UTILS
// ==========================================

function playNotificationSound() {
  const audio = document.getElementById('notifySound');
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(e => console.log('🔇 Audio xato:', e));
  }
}

function showToast(msg) {
  const existing = document.querySelector('.admin-toast');
  if (existing) existing.remove();
  
  const div = document.createElement('div');
  div.className = 'admin-toast';
  div.style.cssText = `
    position: fixed; 
    top: 50%; 
    left: 50%; 
    transform: translate(-50%, -50%);
    background: rgba(10,10,10,0.95); 
    color: white; 
    padding: 20px 28px;
    border-radius: 16px; 
    z-index: 9999; 
    font-weight: 600;
    font-size: 16px;
    border: 2px solid #FFD700; 
    max-width: 80%; 
    text-align: center;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    animation: fadeIn 0.3s ease;
    white-space: pre-line;
  `;
  div.textContent = msg;
  document.body.appendChild(div);
  
  setTimeout(() => {
    div.style.opacity = '0';
    div.style.transform = 'translate(-50%, -60%)';
    div.style.transition = 'all 0.3s ease';
    setTimeout(() => div.remove(), 300);
  }, 3000);
}

// CSS qo'shish
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translate(-50%, -40%); }
    to { opacity: 1; transform: translate(-50%, -50%); }
  }
  .loader {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(0,0,0,0.3);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-right: 8px;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* Screenshot styles */
  .screenshot-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    background: linear-gradient(135deg, var(--gold-primary) 0%, var(--gold-dark) 100%);
    color: #000;
    font-size: 10px;
    font-weight: 800;
    padding: 4px 8px;
    border-radius: 6px;
  }
  
  .screenshot-section {
    margin: 20px 0;
    padding: 16px;
    background: rgba(212, 175, 55, 0.05);
    border-radius: 16px;
    border: 1px solid rgba(212, 175, 55, 0.2);
  }
  
  .screenshot-section h4 {
    color: var(--gold-primary);
    margin-bottom: 12px;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  
  .screenshot-image-wrapper {
    border-radius: 12px;
    overflow: hidden;
    border: 2px solid rgba(212, 175, 55, 0.3);
    cursor: pointer;
  }
  
  .screenshot-image-wrapper img {
    width: 100%;
    max-height: 300px;
    object-fit: contain;
    display: block;
    background: #000;
  }
  
  .screenshot-hint {
    text-align: center;
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 8px;
  }
  
  /* Fullscreen screenshot */
  .screenshot-fullscreen-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.95);
    z-index: 3000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  
  .screenshot-fullscreen-content {
    position: relative;
    max-width: 90%;
    max-height: 90%;
  }
  
  .screenshot-fullscreen-content img {
    max-width: 100%;
    max-height: 80vh;
    border-radius: 12px;
  }
  
  .close-fullscreen {
    position: absolute;
    top: -50px;
    right: 0;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
`;
document.head.appendChild(style);

// Init
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 DOMContentLoaded - Admin Screenshot Version');
  init();
});

// Sahifa yopilganda
window.addEventListener('beforeunload', () => {
  stopPolling();
});