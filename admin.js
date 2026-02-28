// ==========================================
// BODRUM ADMIN - FIXED VERSION
// ==========================================

const SERVER_URL = 'https://backend-production-1bf4.up.railway.app';

let currentOrderKey = null;
let orders = [];
let customers = [];
let chartInstance = null;
let currentOrderView = 'accepted'; // ⭐ Default to 'accepted' instead of 'new'
let lastCheckTime = null;
let pollingInterval = null;
let isPolling = false;

// ==========================================
// INIT
// ==========================================

function init() {
  console.log('🚀 Admin panel init (Fixed Version)');
  
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
    // ⭐ Yangi buyurtmalarni tekshirish (faqat notification uchun)
    const response = await fetch(`${SERVER_URL}/api/orders/new`);
    const newOrders = await response.json();
    
    let hasNew = false;
    
    newOrders.forEach(order => {
      const exists = orders.find(o => o.orderId === order.orderId || o.order_id === order.order_id);
      if (!exists) {
        // Yangi buyurtma - notification ko'rsatish
        orders.unshift({
          firebaseKey: order.orderId || order.order_id,
          ...order
        });
        hasNew = true;
        playNotificationSound();
        showToast(`🛎️ Yangi buyurtma!\n${order.name} - ${order.total?.toLocaleString()} so'm`);
      }
    });
    
    // Agar yangi buyurtmalar bo'lsa, badge yangilash
    if (hasNew || newOrders.length > 0) {
      updateNewOrdersBadge(newOrders.length);
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
    // ⭐ /api/orders endi FAQAT 'accepted' buyurtmalarni qaytaradi
    const response = await fetch(`${SERVER_URL}/api/orders`);
    const data = await response.json();
    
    orders = data.map(order => ({
      firebaseKey: order.orderId || order.order_id,
      ...order
    })).sort((a, b) => {
      // ⭐ accepted_at bo'yicha sortlash
      const dateA = new Date(a.acceptedAt || a.accepted_at || a.createdAt || a.created_at);
      const dateB = new Date(b.acceptedAt || b.accepted_at || b.createdAt || b.created_at);
      return dateB - dateA;
    });
    
    renderOrders();
    loadCustomers();
    updateStats();
    
    // Yangi buyurtmalar sonini alohida olish
    const newResponse = await fetch(`${SERVER_URL}/api/orders/new`);
    const newOrders = await newResponse.json();
    updateNewOrdersBadge(newOrders.length);
    
  } catch (error) {
    console.error('❌ Buyurtmalarni yuklash xatosi:', error);
  }
}

function updateNewOrdersBadge(count) {
  document.getElementById('newOrdersCount').textContent = count;
  document.getElementById('newBadge').textContent = count;
  document.getElementById('ordersNavBadge').textContent = count;
  
  if (window.Telegram?.WebApp?.MainButton) {
    const tg = window.Telegram.WebApp;
    if (count > 0) {
      tg.MainButton.setText(`🛎️ ${count} yangi`);
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
  
  // ⭐ Toggle buttonlarni yangilash
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.textContent.includes('Yangi') && currentOrderView === 'new') {
      btn.classList.add('active');
    } else if (btn.textContent.includes('Qabul') && currentOrderView === 'accepted') {
      btn.classList.add('active');
    }
  });
  
  // ⭐ Agar 'new' tanlangan bo'lsa, bo'sh ko'rsatish (chunki /api/orders endi faqat accepted qaytaradi)
  // Yangi buyurtmalar faqat notification uchun, admin panelda ko'rinmaydi
  if (currentOrderView === 'new') {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <p>Yangi buyurtmalar Telegram orqali keladi</p>
        <p style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">Admin panelda faqat qabul qilingan buyurtmalar ko'rinadi</p>
      </div>
    `;
    return;
  }
  
  // Bugungi daromad
  const today = new Date().toDateString();
  const todayRev = orders
    .filter(o => {
      const isToday = new Date(o.acceptedAt || o.accepted_at || o.createdAt || o.created_at).toDateString() === today;
      return isToday;
    })
    .reduce((sum, o) => sum + (o.total || 0), 0);
  
  document.getElementById('todayRevenue').textContent = (todayRev / 1000).toFixed(0) + 'k';
  
  if (orders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <p>Qabul qilingan buyurtmalar yo'q</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = orders.map((order, index) => createOrderCard(order, index)).join('');
  
  // ⭐ Animation uchun staggered delay
  const cards = container.querySelectorAll('.order-card');
  cards.forEach((card, i) => {
    card.style.animationDelay = `${i * 0.05}s`;
    card.addEventListener('click', () => openOrderModal(card.dataset.id));
  });
}

function createOrderCard(order, index) {
  const date = new Date(order.acceptedAt || order.accepted_at || order.created_at || order.createdAt);
  const time = date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' });
  
  let itemsText = '';
  if (order.items && Array.isArray(order.items)) {
    itemsText = order.items.map(i => `${i.name} x${i.qty}`).join(', ');
  }
  
  const hasScreenshot = order.screenshot ? true : false;
  
  return `
    <div class="order-card accepted" data-id="${order.firebaseKey}" style="animation: slideIn 0.4s ease backwards;">
      ${hasScreenshot ? '<div class="screenshot-badge">📸</div>' : ''}
      <div class="order-header">
        <span class="order-id">#${(order.order_id || order.orderId)?.slice(-6)}</span>
        <span class="order-time">${dateStr} ${time}</span>
      </div>
      <div class="order-customer">${order.name || "Noma'lum"}</div>
      <div class="order-phone">+998 ${order.phone}</div>
      <div class="order-items-preview">${itemsText}</div>
      <div class="order-footer">
        <span class="order-total">${order.total?.toLocaleString()} so'm</span>
        <span class="order-status accepted">✅ Qabul qilingan</span>
      </div>
    </div>
  `;
}

// ==========================================
// MODAL
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
  const paymentStatus = order.paymentStatus || 'paid';
  const paymentText = paymentStatus === 'paid' ? `${paymentMethod.toUpperCase()} ✅` : paymentMethod.toUpperCase();
  
  document.getElementById('modalPayment').textContent = paymentText;
  document.getElementById('modalPayment').style.color = 'var(--success)';
  
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
  
  // Skrinshot
  const modalBody = document.querySelector('#orderModal .modal-body');
  const oldScreenshot = document.getElementById('modalScreenshot');
  if (oldScreenshot) oldScreenshot.remove();
  
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
    const itemsSection = modalBody.querySelector('.items-section');
    modalBody.insertBefore(screenshotSection, itemsSection);
  }
  
  // ⭐ Qabul qilingan buyurtma uchun tugmalarni yashirish
  const actionsDiv = document.getElementById('modalActions');
  actionsDiv.style.display = 'none';
  
  // Modalni ko'rsatish
  const modal = document.getElementById('orderModal');
  modal.classList.add('show');
  
  // ⭐ Smooth animation
  const content = modal.querySelector('.modal-content');
  content.style.animation = 'none';
  setTimeout(() => {
    content.style.animation = 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
  }, 10);
};

window.closeModal = function() {
  const modal = document.getElementById('orderModal');
  const content = modal.querySelector('.modal-content');
  
  // ⭐ Smooth close animation
  content.style.animation = 'slideDown 0.3s ease forwards';
  
  setTimeout(() => {
    modal.classList.remove('show');
    currentOrderKey = null;
    content.style.animation = '';
  }, 300);
};

window.openScreenshotFullscreen = function(src) {
  const overlay = document.createElement('div');
  overlay.className = 'screenshot-fullscreen-overlay';
  overlay.style.animation = 'fadeIn 0.3s ease';
  overlay.innerHTML = `
    <div class="screenshot-fullscreen-content" style="animation: scaleIn 0.3s ease;">
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
    if (e.target === overlay) {
      overlay.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => overlay.remove(), 300);
    }
  });
  
  document.body.appendChild(overlay);
};

// ==========================================
// TAB SWITCHING
// ==========================================

window.switchTab = function(tabName) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if(item.dataset.tab === tabName) item.classList.add('active');
  });
  
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('active');
    panel.style.animation = '';
  });
  
  const section = document.getElementById(tabName + 'Section');
  if (section) {
    section.classList.add('active');
    // ⭐ Smooth tab transition
    section.style.animation = 'fadeInUp 0.4s ease';
  }
  
  if(tabName === 'stats') updateStats();
};

window.switchOrderView = function(view) {
  currentOrderView = view;
  renderOrders();
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
          lastOrder: order.acceptedAt || order.accepted_at || order.created_at || order.createdAt
        });
      }
      const c = customerMap.get(order.phone);
      c.orders++;
      c.totalSpent += order.total || 0;
      const orderDate = new Date(order.acceptedAt || order.accepted_at || order.created_at || order.createdAt);
      if (orderDate > new Date(c.lastOrder)) {
        c.lastOrder = order.acceptedAt || order.accepted_at || order.created_at || order.createdAt;
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
    <div class="customer-item" onclick="viewCustomer('${c.phone}')" style="animation: slideInLeft 0.4s ease ${i * 0.05}s backwards;">
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

window.searchCustomers = function() {
  renderCustomers();
};

window.viewCustomer = function(phone) {
  const c = customers.find(x => x.phone === phone);
  if (!c) return;
  
  const customerOrders = orders.filter(o => o.phone === phone).sort((a,b) => 
    new Date(b.acceptedAt || b.accepted_at || b.created_at || b.createdAt) - new Date(a.acceptedAt || a.accepted_at || a.created_at || a.createdAt)
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
      ${customerOrders.slice(0, 10).map((o, i) => `
        <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; border: 1px solid #333; animation: slideInRight 0.3s ease ${i * 0.05}s backwards;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-weight: 600;">#${(o.order_id || o.orderId)?.slice(-6)}</span>
            <span style="color: #00ff88; font-weight: 700;">${o.total?.toLocaleString()} so'm</span>
          </div>
          <div style="font-size: 12px; color: #666;">
            ${new Date(o.acceptedAt || o.accepted_at || o.created_at || o.createdAt).toLocaleDateString('uz-UZ')} • ${(o.items || []).length} ta mahsulot
            ${o.screenshot ? ' • 📸' : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
  
  const modal = document.getElementById('customerModal');
  modal.classList.add('show');
  
  const content2 = modal.querySelector('.modal-content');
  content2.style.animation = 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
};

window.closeCustomerModal = function() {
  const modal = document.getElementById('customerModal');
  const content = modal.querySelector('.modal-content');
  
  content.style.animation = 'slideDown 0.3s ease forwards';
  
  setTimeout(() => {
    modal.classList.remove('show');
    content.style.animation = '';
  }, 300);
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
    const d = new Date(o.acceptedAt || o.accepted_at || o.created_at || o.createdAt);
    return d >= startDate && d <= now;
  });
  
  const revenue = filtered.reduce((sum, o) => sum + (o.total || 0), 0);
  
  document.getElementById('statRevenue').textContent = (revenue/1000).toFixed(0) + 'k';
  document.getElementById('statOrders').textContent = filtered.length;
  
  const ctx = document.getElementById('mainChart');
  if (!ctx) return;
  
  if (chartInstance) chartInstance.destroy();
  
  const dailyData = {};
  filtered.forEach(o => {
    const d = new Date(o.acceptedAt || o.accepted_at || o.created_at || o.createdAt).toLocaleDateString('uz-UZ', { weekday: 'short' });
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
    <div class="top-item" style="animation: slideInLeft 0.4s ease ${i * 0.05}s backwards;">
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
    transform: translate(-50%, -50%) scale(0.9);
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
    animation: toastIn 0.3s ease forwards;
    white-space: pre-line;
  `;
  div.textContent = msg;
  document.body.appendChild(div);
  
  setTimeout(() => {
    div.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => div.remove(), 300);
  }, 3000);
}

// CSS qo'shish
const style = document.createElement('style');
style.textContent = `
  @keyframes toastIn {
    from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
  @keyframes toastOut {
    from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    to { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(-20px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-30px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(30px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideDown {
    from { transform: translateY(0); opacity: 1; }
    to { transform: translateY(100%); opacity: 0; }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.9); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
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
    transition: all 0.3s ease;
  }
  
  .screenshot-image-wrapper:hover {
    transform: scale(1.02);
    box-shadow: 0 8px 25px rgba(212, 175, 55, 0.3);
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
    transition: all 0.3s ease;
  }
  
  .close-fullscreen:hover {
    background: var(--gold-primary);
    color: #000;
    transform: rotate(90deg);
  }
`;
document.head.appendChild(style);

// Init
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 DOMContentLoaded - Admin Fixed Version');
  init();
});

// Sahifa yopilganda
window.addEventListener('beforeunload', () => {
  stopPolling();
});
