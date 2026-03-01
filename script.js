// ==========================================
// BODRUM - Web App
// ==========================================

import { getMenuFromLocal, categories } from './menu.js';

// ==========================================
// GLOBAL VARIABLES
// ==========================================

let tg = null;
if (window.Telegram && window.Telegram.WebApp) {
  tg = window.Telegram.WebApp;
  tg.expand();
  tg.ready();
}

const SERVER_URL = 'https://backend-production-1bf4.up.railway.app';

const menu = getMenuFromLocal();
let cart = [];
let currentLocation = null;
let activeCategory = 'all';
let searchQuery = '';
let currentFoodItem = null;
let currentOrderId = null;
let pendingPaymentData = null;
let selectedScreenshot = null;
let botConfirmationCheckInterval = null;
let userProfile = null;
let userOrders = [];

// PAYME CONFIG
const PAYME_MERCHANT_ID = '698d8268f7c89c2bb7cfc08e';
const PAYME_CHECKOUT_URL = 'https://checkout.payme.uz';

// DOM Elements
const menuContent = document.getElementById('menuContent');
const categoriesContainer = document.getElementById('categories');
const searchInput = document.getElementById('searchInput');
const foodModal = document.getElementById('foodDetailModal');
const paymeInstructionModal = document.getElementById('paymeInstructionModal');

// Profile elements
const profileAvatar = document.getElementById('profileAvatar');
const profileName = document.getElementById('profileName');
const profilePhone = document.getElementById('profilePhone');
const profileSource = document.getElementById('profileSource');
const displayName = document.getElementById('displayName');
const displayPhone = document.getElementById('displayPhone');

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function formatPhone(phone) {
  if (!phone || phone.length !== 9) return '+998 __ _______';
  return `+998 ${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 7)} ${phone.slice(7)}`;
}

function getInitials(name) {
  if (!name) return '👤';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function showNotification(message, type = 'info') {
  const div = document.createElement('div');
  const colors = {
    success: 'linear-gradient(135deg, #00D084 0%, #00b06b 100%)',
    error: 'linear-gradient(135deg, #FF4757 0%, #ff3344 100%)',
    info: 'linear-gradient(135deg, #FFD700 0%, #D4AF37 100%)',
    warning: 'linear-gradient(135deg, #FFA502 0%, #ff9500 100%)'
  };
  
  div.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${colors[type]};
    color: ${type === 'info' || type === 'warning' ? '#000' : '#fff'};
    padding: 16px 24px;
    border-radius: 12px;
    font-weight: 700;
    z-index: 9999;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    max-width: 90%;
    text-align: center;
    font-size: 14px;
    animation: slideDown 0.3s ease;
  `;
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

// ==========================================
// PROFILE FUNCTIONS
// ==========================================

function requestContact() {
  console.log('📱 Kontakt so\'ralmoqda...');
  
  if (!tg) {
    showNotification('Telegram WebApp topilmadi', 'error');
    return;
  }
  
  tg.requestContact((result) => {
    console.log('📱 Kontakt natija:', result);
    
    if (result) {
      const contact = tg.initDataUnsafe?.contact;
      
      if (contact) {
        console.log('✅ Kontakt olindi:', contact);
        handleContactReceived(contact);
      } else {
        showNotification('Kontakt olindi, ma\'lumotlar yuklanmoqda...', 'success');
        setTimeout(() => loadUserProfile(), 1000);
      }
    } else {
      console.log('❌ Kontakt rad etildi');
      showNotification('Kontakt raqami kerak. Iltimos, ruxsat bering.', 'warning');
    }
  });
}

async function handleContactReceived(contact) {
  console.log('📱 Kontakt qabul qilindi:', contact);
  
  try {
    let phone = contact.phone_number || '';
    
    if (phone.startsWith('+')) {
      phone = phone.substring(1);
    }
    
    if (phone.startsWith('998')) {
      phone = phone.substring(3);
    }
    
    phone = phone.slice(-9);
    
    const tgUser = tg?.initDataUnsafe?.user;
    const tgId = tgUser?.id;
    
    if (!tgId) {
      showNotification('Xatolik: Telegram ID topilmadi', 'error');
      return;
    }
    
    const response = await fetch(`${SERVER_URL}/api/user/save-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tgId: tgId.toString(),
        name: contact.first_name || contact.name || tgUser?.first_name || 'Foydalanuvchi',
        phone: phone,
        username: tgUser?.username || ''
      })
    });
    
    if (!response.ok) {
      throw new Error(`Server xatosi: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('✅ Profil saqlandi:', result);
    
    if (result.success) {
      showNotification('✅ Ma\'lumotlar saqlandi!', 'success');
      userProfile = result.profile;
      userOrders = result.orders || [];
      renderProfile();
      renderOrdersList(userOrders);
    } else {
      throw new Error(result.error || 'Saqlash xatosi');
    }
    
  } catch (error) {
    console.error('❌ Kontakt saqlash xatosi:', error);
    showNotification('Xatolik: ' + error.message, 'error');
  }
}

async function loadUserProfile() {
  try {
    const tgUser = tg?.initDataUnsafe?.user;
    const tgId = tgUser?.id;
    
    console.log('🔍 Profil yuklanmoqda, tgId:', tgId);
    
    if (!tgId) {
      console.log('⚠️ Telegram ID topilmadi');
      showProfileNotFound();
      return;
    }
    
    const response = await fetch(`${SERVER_URL}/api/user/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tgId: tgId.toString() })
    });
    
    console.log('📡 Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Server xatosi:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ Backend dan javob:', result);
    
    if (result.success && result.profile) {
      userProfile = result.profile;
      userOrders = result.orders || [];
      console.log('👤 Profil yuklandi:', userProfile.name);
      renderProfile();
      renderOrdersList(userOrders);
    } else {
      console.log('❌ Profil topilmadi, kontakt so\'rash kerak');
      showProfileNotFound();
      showContactRequestModal();
    }
    
  } catch (error) {
    console.error('❌ Profil yuklash xatosi:', error);
    showProfileNotFound();
    showContactRequestModal();
  }
}

function showContactRequestModal() {
  if (document.getElementById('contactRequestModal')?.classList.contains('show')) {
    return;
  }
  
  const modal = document.getElementById('contactRequestModal');
  if (modal) {
    modal.classList.add('show');
  }
}

window.closeContactRequestModal = function() {
  const modal = document.getElementById('contactRequestModal');
  if (modal) {
    modal.classList.remove('show');
  }
};

window.requestContactFromModal = function() {
  closeContactRequestModal();
  requestContact();
};

function renderProfile() {
  if (!userProfile) {
    console.log('❌ renderProfile: userProfile null');
    return;
  }
  
  const name = userProfile.name || userProfile.username || 'Foydalanuvchi';
  const phone = userProfile.phone || '';
  
  console.log('🎨 Profil renderlanmoqda:', { name, phone });
  
  if (profileAvatar) profileAvatar.textContent = getInitials(name);
  if (profileName) profileName.textContent = name;
  if (profilePhone) profilePhone.textContent = formatPhone(phone);
  if (profileSource) profileSource.textContent = '🤖 Telegram orqali';
  
  if (displayName) displayName.textContent = name;
  if (displayPhone) displayPhone.textContent = formatPhone(phone);
  
  updateProfileStats();
  
  if (phone && phone.length === 9) {
    closeContactRequestModal();
  }
}

function updateProfileStats() {
  if (!userOrders) {
    console.log('⚠️ updateProfileStats: userOrders null');
    return;
  }
  
  const totalOrders = userOrders.length;
  const totalSpent = userOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  
  const totalOrdersEl = document.getElementById('totalOrders');
  const totalSpentEl = document.getElementById('totalSpent');
  const ordersCountBadgeEl = document.getElementById('ordersCountBadge');
  const vipStatusEl = document.getElementById('vipStatus');
  
  if (totalOrdersEl) totalOrdersEl.textContent = totalOrders;
  if (totalSpentEl) totalSpentEl.textContent = (totalSpent / 1000).toFixed(0) + 'k';
  if (ordersCountBadgeEl) ordersCountBadgeEl.textContent = totalOrders;
  
  if (vipStatusEl) {
    if (totalOrders >= 20) vipStatusEl.textContent = '💎';
    else if (totalOrders >= 10) vipStatusEl.textContent = '🥇';
    else if (totalOrders >= 5) vipStatusEl.textContent = '🥈';
    else vipStatusEl.textContent = '🥉';
  }
}

function showProfileNotFound() {
  console.log('⚠️ Profil topilmadi, default ko\'rsatilmoqda');
  
  if (profileAvatar) profileAvatar.textContent = '❓';
  if (profileName) profileName.textContent = 'Profil topilmadi';
  if (profilePhone) profilePhone.textContent = 'Telefon raqam kerak';
  if (profileSource) profileSource.textContent = '⚠️ Ma\'lumot yo\'q';
  
  if (displayName) displayName.textContent = '---';
  if (displayPhone) displayPhone.textContent = '---';
  
  const infoNote = document.querySelector('.info-note');
  if (infoNote) {
    infoNote.innerHTML = '<span>⚠️</span><span>Profil topilmadi. Iltimos, telefon raqamingizni yuboring</span>';
    infoNote.style.background = 'rgba(255, 71, 87, 0.1)';
    infoNote.style.borderColor = 'rgba(255, 71, 87, 0.3)';
  }
  
  const totalOrdersEl = document.getElementById('totalOrders');
  const totalSpentEl = document.getElementById('totalSpent');
  const ordersCountBadgeEl = document.getElementById('ordersCountBadge');
  const vipStatusEl = document.getElementById('vipStatus');
  
  if (totalOrdersEl) totalOrdersEl.textContent = '0';
  if (totalSpentEl) totalSpentEl.textContent = '0';
  if (ordersCountBadgeEl) ordersCountBadgeEl.textContent = '0';
  if (vipStatusEl) vipStatusEl.textContent = '🥉';
}

function renderOrdersList(orders) {
  const container = document.getElementById('ordersList');
  if (!container) {
    console.log('❌ ordersList container topilmadi');
    return;
  }
  
  if (!orders || orders.length === 0) {
    container.innerHTML = `
      <div class="empty-orders">
        <div class="empty-orders-icon">📭</div>
        <div class="empty-orders-text">Hali buyurtmalar yo'q</div>
        <button class="browse-menu-btn" onclick="switchTab('menu')">Menyuni ko'rish</button>
      </div>
    `;
    return;
  }
  
  console.log('📋 Buyurtmalar renderlanmoqda:', orders.length);
  
  container.innerHTML = orders.slice(0, 10).map(order => {
    const date = new Date(order.created_at || order.createdAt);
    const items = order.items || [];
    let itemsText = '';
    
    if (typeof items === 'string') {
      try {
        const parsed = JSON.parse(items);
        itemsText = parsed.map(i => `${i.name} x${i.qty}`).join(', ');
      } catch (e) {
        itemsText = items;
      }
    } else if (Array.isArray(items)) {
      itemsText = items.map(i => `${i.name} x${i.qty}`).join(', ');
    }
    
    let statusClass = 'pending';
    let statusText = '⏳ Kutilmoqda';
    
    const status = order.status;
    const paymentStatus = order.payment_status || order.paymentStatus;
    
    if (status === 'accepted' || paymentStatus === 'paid') {
      statusClass = 'accepted';
      statusText = '✅ Qabul qilingan';
    } else if (status === 'rejected') {
      statusClass = 'rejected';
      statusText = '❌ Bekor qilingan';
    } else if (status === 'pending_verification') {
      statusClass = 'pending';
      statusText = '⏳ Tekshirilmoqda';
    }
    
    const hasScreenshot = order.screenshot || order.screenshot_name;
    const orderId = order.order_id || order.orderId || '-----';
    
    return `
      <div class="order-history-card">
        <div class="order-history-header">
          <span class="order-history-id">${hasScreenshot ? '📸 ' : ''}#${orderId.slice(-6)}</span>
          <span class="order-history-date">${date.toLocaleDateString('uz-UZ')}</span>
        </div>
        <div class="order-history-items">${itemsText}</div>
        <div class="order-history-footer">
          <span class="order-history-total">${(order.total || 0).toLocaleString()} so'm</span>
          <span class="order-history-status ${statusClass}">${statusText}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// MENU FUNCTIONS
// ==========================================

function renderCategories() {
  categoriesContainer.innerHTML = categories.map(cat => `
    <button class="category-btn ${cat.id === 'all' ? 'active' : ''}" data-cat="${cat.id}">
      <span class="category-icon">${cat.icon}</span>
      <span>${cat.name}</span>
    </button>
  `).join('');

  categoriesContainer.addEventListener('click', e => {
    const btn = e.target.closest('.category-btn');
    if (!btn) return;
    
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.cat;
    renderMenu();
  });
}

function renderMenu() {
  let filtered = menu.filter(item => item.available !== false);
  
  if (activeCategory !== 'all') {
    filtered = filtered.filter(item => item.category === activeCategory);
  }
  
  if (searchQuery) {
    filtered = filtered.filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  if (filtered.length === 0) {
    menuContent.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <p>Hech narsa topilmadi</p>
      </div>
    `;
    return;
  }

  if (activeCategory === 'all' && !searchQuery) {
    const grouped = {};
    categories.forEach(cat => {
      if (cat.id === 'all') return;
      const catItems = filtered.filter(item => item.category === cat.id);
      if (catItems.length > 0) {
        grouped[cat.id] = { ...cat, items: catItems };
      }
    });

    menuContent.innerHTML = Object.values(grouped).map(group => `
      <div class="category-section">
        <h2 class="category-title">${group.icon} ${group.name}</h2>
        <div class="menu-grid">
          ${group.items.map(item => createCard(item)).join('')}
        </div>
      </div>
    `).join('');
  } else {
    menuContent.innerHTML = `
      <div class="menu-grid" style="margin-top: 16px;">
        ${filtered.map(item => createCard(item)).join('')}
      </div>
    `;
  }
}

function createCard(item) {
  return `
    <div class="card" data-id="${item.id}" onclick="openFoodModal(${item.id})">
      <div class="card-image-container">
        <img src="${item.image}" alt="${item.name}" loading="lazy" onerror="this.style.display='none'">
      </div>
      <h3>${item.name}</h3>
      <div class="price">${item.price.toLocaleString()} so'm</div>
      <button class="add-btn-only" onclick="event.stopPropagation(); addToCart(${item.id})">Savatchaga</button>
    </div>
  `;
}

// ==========================================
// FOOD MODAL
// ==========================================

window.openFoodModal = function(id) {
  const item = menu.find(p => p.id === id);
  if (!item) return;
  
  currentFoodItem = item;
  
  const imgEl = document.getElementById('foodModalImage');
  imgEl.src = item.image || '';
  imgEl.alt = item.name;
  
  document.getElementById('foodModalName').textContent = item.name;
  document.getElementById('foodModalPrice').textContent = item.price.toLocaleString() + ' so\'m';
  document.getElementById('foodModalDescription').textContent = item.description || 'Tavsif mavjud emas';
  
  foodModal.classList.add('show');
  document.body.style.overflow = 'hidden';
};

window.closeFoodModal = function() {
  foodModal.classList.remove('show');
  document.body.style.overflow = '';
  currentFoodItem = null;
};

document.getElementById('foodModalAddBtn').addEventListener('click', () => {
  if (currentFoodItem) {
    addToCart(currentFoodItem.id);
    closeFoodModal();
  }
});

foodModal.addEventListener('click', (e) => {
  if (e.target === foodModal) closeFoodModal();
});

searchInput.addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  renderMenu();
});

// ==========================================
// CART FUNCTIONS
// ==========================================

const CART_KEY = 'bodrum_cart';

function saveCartLS() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function loadCartLS() {
  const raw = localStorage.getItem(CART_KEY);
  cart = raw ? JSON.parse(raw) : [];
}

window.addToCart = function(id) {
  const product = menu.find(p => p.id === id);
  const exist = cart.find(c => c.id === id);
  
  if (exist) exist.qty++;
  else cart.push({ ...product, qty: 1 });
  
  saveCartLS();
  renderCart();
  
  const badge = document.getElementById('cartBadge');
  badge.style.transform = 'scale(1.3)';
  setTimeout(() => badge.style.transform = 'scale(1)', 200);
};

function renderCart() {
  const cartList = document.getElementById('cartList');
  const cartBadge = document.getElementById('cartBadge');
  const cartTotal = document.getElementById('cartTotal');
  
  cartList.innerHTML = '';
  let total = 0;
  
  if (cart.length === 0) {
    cartList.innerHTML = '<div class="empty-cart">Savat bo\'sh</div>';
    cartBadge.textContent = '0';
    cartTotal.textContent = 'Umumiy: 0 so\'m';
    return;
  }
  
  cart.forEach((item, idx) => {
    total += item.price * item.qty;
    cartList.insertAdjacentHTML('beforeend', `
      <div class="cart-item">
        <div class="cart-item-image-container">
          <img src="${item.image}" alt="${item.name}" onerror="this.style.display='none'">
        </div>
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">${(item.price * item.qty).toLocaleString()} so'm</div>
        </div>
        <div class="cart-item-controls">
          <div class="cart-item-qty">
            <button onclick="updateQty(${idx}, -1)">−</button>
            <span>${item.qty}</span>
            <button onclick="updateQty(${idx}, 1)">+</button>
          </div>
          <button class="cart-item-delete" onclick="removeFromCart(${idx})">🗑</button>
        </div>
      </div>
    `);
  });
  
  cartBadge.textContent = cart.reduce((s, i) => s + i.qty, 0);
  cartTotal.textContent = `Umumiy: ${total.toLocaleString()} so'm`;
}

window.updateQty = function(idx, delta) {
  if (delta < 0 && cart[idx].qty > 1) cart[idx].qty--;
  else if (delta > 0) cart[idx].qty++;
  else cart.splice(idx, 1);
  saveCartLS();
  renderCart();
};

window.removeFromCart = function(idx) {
  cart.splice(idx, 1);
  saveCartLS();
  renderCart();
};

// ==========================================
// TAB NAVIGATION
// ==========================================

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab, .tab-content').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    
    if (btn.dataset.tab === 'profile') {
      loadUserProfile();
    }
  });
});

window.switchTab = function(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
  document.getElementById(tabName)?.classList.add('active');
  
  if (tabName === 'profile') {
    loadUserProfile();
  }
};

// ==========================================
// PAYME INSTRUCTION MODAL
// ==========================================

function openInstructionModal(total) {
  if (!userProfile || !userProfile.phone) {
    showNotification('Iltimos, avval telefon raqamingizni yuboring', 'error');
    showContactRequestModal();
    setTimeout(() => switchTab('profile'), 500);
    return;
  }
  
  pendingPaymentData = {
    total: total,
    phone: userProfile.phone,
    orderId: 'ORD_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  };
  
  paymeInstructionModal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

window.closeInstructionModal = function() {
  paymeInstructionModal.classList.remove('show');
  document.body.style.overflow = '';
};

document.getElementById('understandBtn').addEventListener('click', async () => {
  if (!pendingPaymentData) {
    console.error('pendingPaymentData is null');
    showNotification('Xatolik yuz berdi', 'error');
    return;
  }
  
  const orderId = pendingPaymentData.orderId;
  const dataToPass = { ...pendingPaymentData };
  
  try {
    const response = await fetch(`${SERVER_URL}/api/orders/initiated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: orderId,
        source: 'webapp'
      })
    });
    
    if (!response.ok) {
      console.warn('Server error:', response.status);
    }
  } catch (error) {
    console.error('Initiated mark error:', error);
  }
  
  closeInstructionModal();
  
  setTimeout(() => {
    openPaymePayment(dataToPass);
  }, 300);
});

// ==========================================
// PAYMENT FUNCTIONS
// ==========================================

function openPaymePayment(data) {
  if (!data) {
    console.error('openPaymePayment: data is null');
    showNotification('Xatolik yuz berdi', 'error');
    return;
  }
  
  const { total, orderId } = data;
  
  if (!total || !orderId) {
    console.error('openPaymePayment: missing total or orderId', data);
    showNotification('Xatolik: to\'lov ma\'lumotlari yetishmayapti', 'error');
    return;
  }
  
  currentOrderId = orderId;
  
  const amountTiyin = Math.round(total * 100);
  const params = `m=${PAYME_MERCHANT_ID};ac.order_id=${orderId};a=${amountTiyin};cu=860`;
  const paramsB64 = btoa(params);
  const paymeUrl = `${PAYME_CHECKOUT_URL}/${paramsB64}`;
  
  console.log('💰 Payme URL:', paymeUrl);
  
  if (tg?.openLink) {
    tg.openLink(paymeUrl, { try_instant_view: false });
  } else {
    window.open(paymeUrl, '_blank');
  }
  
  sendBotConfirmationRequest(orderId, total);
  
  setTimeout(() => {
    showPaymentConfirmationDialog(total);
  }, 3000);
}

async function sendBotConfirmationRequest(orderId, total) {
  const tgId = tg?.initDataUnsafe?.user?.id;
  
  if (!tgId) {
    console.log('⚠️ Telegram ID topilmadi, botga xabar yuborilmaydi');
    return;
  }
  
  try {
    const items = cart.map(item => ({
      name: item.name,
      qty: item.qty
    }));
    
    const response = await fetch(`${SERVER_URL}/api/send-bot-confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: orderId,
        tgId: tgId,
        total: total,
        items: items
      })
    });
    
    if (response.ok) {
      console.log('✅ Botga tasdiqlash so\'rovi yuborildi');
    } else {
      console.warn('⚠️ Botga xabar yuborilmadi:', response.status);
    }
  } catch (error) {
    console.error('❌ Botga xabar yuborish xatosi:', error);
  }
}

// ==========================================
// ORDER BUTTON
// ==========================================

document.getElementById('orderBtn').addEventListener('click', async () => {
  if (!cart.length) {
    showNotification('Savat bo\'sh!', 'error');
    return;
  }
  
  if (!userProfile || !userProfile.phone) {
    showNotification('Iltimos, avval telefon raqamingizni yuboring', 'error');
    showContactRequestModal();
    setTimeout(() => switchTab('profile'), 500);
    return;
  }
  
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  openInstructionModal(total);
});

// ==========================================
// PAYMENT CONFIRMATION DIALOG - TO'Liq TO'G'RILANGAN
// ==========================================

function showPaymentConfirmationDialog(total) {
  console.log('💬 showPaymentConfirmationDialog chaqirildi, total:', total, 'currentOrderId:', currentOrderId);
  
  const modal = document.getElementById('paymentConfirmDialog');
  const confirmAmount = document.getElementById('confirmAmount');
  
  if (!modal) {
    console.error('❌ paymentConfirmDialog topilmadi!');
    return;
  }
  
  if (confirmAmount) {
    confirmAmount.textContent = total.toLocaleString() + ' so\'m';
  }
  
  // ⭐ MUHIM: display ni to'g'ridan-to'g'ri o'rnatish
  modal.style.display = 'flex';
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
  
  console.log('✅ Payment dialog ko\'rsatildi');
  
  // Bot tasdiqlashini tekshirishni boshlash
  startBotConfirmationCheck();
}

// ⭐⭐⭐ ASOSIY TO'G'RILASH - Bu funksiya "Ha, to'lov qildim" tugmasi bosilganda chaqiriladi
window.confirmPaymentFromWebApp = async function() {
  console.log('✅ confirmPaymentFromWebApp chaqirildi, currentOrderId:', currentOrderId);
  
  const modal = document.getElementById('paymentConfirmDialog');
  
  // Modalni yopish
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('show');
  }
  
  // Bot tasdiqlash tekshiruvini to'xtatish
  stopBotConfirmationCheck();
  
  const tgId = tg?.initDataUnsafe?.user?.id;
  
  // Backend ga xabar yuborish (ixtiyoriy)
  if (tgId && currentOrderId) {
    try {
      console.log('📤 confirm-payment API ga so\'rov yuborilmoqda...');
      const response = await fetch(`${SERVER_URL}/api/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: currentOrderId,
          tgId: tgId
        })
      });
      
      if (response.ok) {
        console.log('✅ confirm-payment muvaffaqiyatli');
      } else {
        console.warn('⚠️ confirm-payment xato:', response.status);
      }
    } catch (e) {
      console.error('❌ Confirm payment error:', e);
    }
  }
  
  // ⭐⭐⭐ MUHIM: To'g'ridan-to'g'ri screenshot modalini ochish
  console.log('📸 Screenshot modaliga o\'tish...');
  openScreenshotModal();
};

window.cancelPayment = function() {
  console.log('❌ cancelPayment chaqirildi');
  
  const modal = document.getElementById('paymentConfirmDialog');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('show');
  }
  
  stopBotConfirmationCheck();
  
  currentOrderId = null;
  pendingPaymentData = null;
};

function startBotConfirmationCheck() {
  if (botConfirmationCheckInterval) {
    clearInterval(botConfirmationCheckInterval);
  }
  
  console.log('🔄 Bot tasdiqlash tekshiruvi boshlandi');
  
  botConfirmationCheckInterval = setInterval(async () => {
    if (!currentOrderId) {
      console.log('⚠️ currentOrderId yo\'q, tekshiruv to\'xtatildi');
      stopBotConfirmationCheck();
      return;
    }
    
    try {
      const response = await fetch(`${SERVER_URL}/api/check-bot-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: currentOrderId
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('🔍 Bot tasdiqlash natijasi:', result);
        
        if (result.bot_confirmed) {
          console.log('✅ Bot dan tasdiqlandi!');
          stopBotConfirmationCheck();
          
          const modal = document.getElementById('paymentConfirmDialog');
          if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('show');
          }
          
          showNotification('Bot dan tasdiqlandi! Skrinshot yuklang', 'success');
          openScreenshotModal();
        }
      }
    } catch (error) {
      console.error('❌ Bot confirmation check error:', error);
    }
  }, 2000);
  
  // 60 sekunddan keyin tekshiruvni to'xtatish
  setTimeout(() => {
    stopBotConfirmationCheck();
  }, 60000);
}

function stopBotConfirmationCheck() {
  if (botConfirmationCheckInterval) {
    clearInterval(botConfirmationCheckInterval);
    botConfirmationCheckInterval = null;
    console.log('🛑 Bot tasdiqlash tekshiruvi to\'xtatildi');
  }
}

// ==========================================
// SCREENSHOT UPLOAD - TO'LIQ TO'G'RILANGAN
// ==========================================

// ⭐⭐⭐ YANGI FUNKS: Screenshot modalini ochish
window.openScreenshotModal = function() {
  console.log('📸 openScreenshotModal chaqirildi, currentOrderId:', currentOrderId);
  
  const modal = document.getElementById('screenshotModal');
  const summaryOrderId = document.getElementById('summaryOrderId');
  
  if (!modal) {
    console.error('❌ screenshotModal topilmadi!');
    showNotification('Xatolik: Modal topilmadi', 'error');
    return;
  }
  
  // Order ID ni yangilash
  if (summaryOrderId) {
    summaryOrderId.textContent = '#' + (currentOrderId?.slice(-6) || '-----');
  }
  
  // Skrinshot inputni tozalash
  selectedScreenshot = null;
  const fileInput = document.getElementById('screenshotInput');
  if (fileInput) fileInput.value = '';
  
  // Preview ni yashirish, placeholder ni ko'rsatish
  const preview = document.getElementById('uploadPreview');
  const placeholder = document.querySelector('.upload-placeholder');
  if (preview) preview.style.display = 'none';
  if (placeholder) placeholder.style.display = 'flex';
  
  // Upload area klassini yangilash
  const uploadArea = document.getElementById('screenshotUploadArea');
  if (uploadArea) uploadArea.classList.remove('has-image');
  
  // Tugmani disable qilish
  const submitBtn = document.getElementById('submitOrderBtn');
  if (submitBtn) submitBtn.disabled = true;
  
  // ⭐ MUHIM: Modalni ko'rsatish
  modal.style.display = 'flex';
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
  
  console.log('✅ Screenshot modal ochildi');
};

// Eski funksiya - endi yangisini chaqiradi
window.proceedToScreenshot = function() {
  console.log('📸 proceedToScreenshot chaqirildi (deprecated, openScreenshotModal ga yo\'naltirildi)');
  openScreenshotModal();
};

function handleScreenshotSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    showNotification('Iltimos, rasm faylini tanlang', 'error');
    return;
  }
  
  if (file.size > 5 * 1024 * 1024) {
    showNotification('Rasm hajmi 5MB dan oshmasligi kerak', 'error');
    return;
  }
  
  selectedScreenshot = file;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('uploadPreview');
    const placeholder = document.querySelector('.upload-placeholder');
    const previewImg = document.getElementById('previewImage');
    const uploadArea = document.getElementById('screenshotUploadArea');
    const submitBtn = document.getElementById('submitOrderBtn');
    
    if (previewImg) previewImg.src = e.target.result;
    if (preview) preview.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
    if (uploadArea) uploadArea.classList.add('has-image');
    if (submitBtn) submitBtn.disabled = false;
    
    console.log('✅ Skrinshot tanlandi:', file.name);
  };
  reader.readAsDataURL(file);
}

window.cancelScreenshot = function() {
  console.log('❌ cancelScreenshot chaqirildi');
  
  const modal = document.getElementById('screenshotModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('show');
  }
  
  selectedScreenshot = null;
  currentOrderId = null;
  pendingPaymentData = null;
  document.body.style.overflow = '';
};

// ==========================================
// SUBMIT ORDER
// ==========================================

window.submitOrderWithScreenshot = async function() {
  console.log('📤 submitOrderWithScreenshot chaqirildi');
  
  if (!selectedScreenshot || !currentOrderId) {
    showNotification('Iltimos, skrinshot tanlang', 'error');
    return;
  }
  
  if (!userProfile || !userProfile.phone) {
    showNotification('Profil ma\'lumotlari topilmadi', 'error');
    return;
  }
  
  const btn = document.getElementById('submitOrderBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Yuborilmoqda...';
  }
  
  try {
    const base64Screenshot = await fileToBase64(selectedScreenshot);
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    
    const orderData = {
      orderId: currentOrderId,
      name: userProfile.name,
      phone: userProfile.phone,
      items: cart.map(item => ({
        name: item.name,
        price: item.price,
        qty: item.qty
      })),
      total: total,
      status: 'pending_verification',
      paymentStatus: 'pending_verification',
      paymentMethod: 'payme',
      location: null,
      tgId: tg?.initDataUnsafe?.user?.id || null,
      notified: false,
      screenshot: base64Screenshot,
      screenshotName: selectedScreenshot.name,
      initiated_from: 'webapp'
    };
    
    console.log('📤 Buyurtma yuborilmoqda:', orderData.orderId);
    
    const response = await fetch(`${SERVER_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
    
    if (!response.ok) throw new Error('Server error');
    
    const order = await response.json();
    console.log('✅ Buyurtma yuborildi:', order);
    
    if (order) {
      userOrders.unshift(order);
      updateProfileStats();
      renderOrdersList(userOrders);
    }
    
    const modal = document.getElementById('screenshotModal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('show');
    }
    
    cart = [];
    saveCartLS();
    renderCart();
    selectedScreenshot = null;
    pendingPaymentData = null;
    currentOrderId = null;
    
    showNotification('✅ Buyurtma yuborildi! Admin tekshiradi.', 'success');
    
    setTimeout(() => switchTab('profile'), 1500);
    
  } catch (error) {
    console.error('❌ Submit error:', error);
    showNotification('Xatolik: ' + error.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📤 Buyurtma yuborish';
    }
  }
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ==========================================
// INIT
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 DOMContentLoaded - BODRUM WebApp');
  
  try {
    loadCartLS();
    renderCategories();
    renderMenu();
    renderCart();
    loadUserProfile();
  } catch (error) {
    console.error('Init xato:', error);
  }
  
  // Screenshot input event
  setTimeout(() => {
    const fileInput = document.getElementById('screenshotInput');
    if (fileInput) {
      fileInput.addEventListener('change', handleScreenshotSelect);
      console.log('✅ Screenshot input event listener qo\'shildi');
    } else {
      console.error('❌ screenshotInput topilmadi');
    }
  }, 100);
});
