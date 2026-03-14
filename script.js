// ==========================================
// BODRUM - Web App (Avtomatik to'lov tizimi - SKRINSHOTSIZ)
// Mijoz Payme ga yo'naltiriladi va WebApp yopiladi
// To'lov callback orqali avtomatik qabul qilinadi
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
// JOYLASHUV FUNKSİYALARI
// ==========================================

function showLocationRequestModal() {
  if (document.getElementById('locationRequestModal')?.classList.contains('show')) {
    return;
  }

  const modal = document.getElementById('locationRequestModal');
  if (modal) {
    modal.classList.add('show');
  }
}

window.closeLocationRequestModal = function() {
  const modal = document.getElementById('locationRequestModal');
  if (modal) {
    modal.classList.remove('show');
  }
};

window.requestLocation = function() {
  console.log('📍 Joylashuv so\'ralmoqda...');

  if (!tg) {
    showNotification('Telegram WebApp topilmadi', 'error');
    getGeolocation();
    return;
  }

  if (tg.requestLocation) {
    tg.requestLocation((result) => {
      console.log('📍 Telegram location natija:', result);

      if (result) {
        const location = tg.initDataUnsafe?.location;

        if (location && location.latitude && location.longitude) {
          console.log('✅ Telegram joylashuv olindi:', location);
          handleLocationReceived({
            latitude: location.latitude,
            longitude: location.longitude
          });
        } else {
          showNotification('Joylashuv olindi, ma\'lumotlar yuklanmoqda...', 'success');
          getGeolocation();
        }
      } else {
        console.log('❌ Joylashuv rad etildi');
        showNotification('Joylashuv kerak. Iltimos, ruxsat bering.', 'warning');
        getGeolocation();
      }
    });
  } else {
    getGeolocation();
  }
};

function getGeolocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        console.log('✅ Browser geolocation:', location);
        handleLocationReceived(location);
      },
      (error) => {
        console.error('Geolocation error:', error);
        showNotification('Joylashuvni qo\'lda kiriting', 'warning');
        showManualLocationInput();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  } else {
    showNotification('Brauzer geolokatsiyasini qo\'llab-quvvatlamaydi', 'error');
    showManualLocationInput();
  }
}

function handleLocationReceived(location) {
  console.log('✅ Joylashuv qabul qilindi:', location);

  currentLocation = {
    lat: location.latitude || location.lat,
    lng: location.longitude || location.lng || location.long
  };

  closeLocationRequestModal();
  showNotification('📍 Joylashuv saqlandi!', 'success');

  // Agar buyurtma jarayonida bo'lsa, davom etish
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  if (total > 0) {
    proceedToPayment(total);
  }
}

function showManualLocationInput() {
  const address = prompt('Manzilingizni kiriting (masalan: "Toshkent, Chilonzor 5-kvartal, 12-uy"):');
  if (address && address.trim()) {
    currentLocation = { address: address.trim(), manual: true };
    closeLocationRequestModal();
    showNotification('Manzil saqlandi!', 'success');

    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    if (total > 0) {
      proceedToPayment(total);
    }
  }
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
    }

  } catch (error) {
    console.error('❌ Profil yuklash xatosi:', error);
    showProfileNotFound();
  }
}

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
        <div class="empty-orders-text">Hali buyurtmalar yo\'q</div>
        <button class="browse-menu-btn" onclick="switchTab('menu')">Menyuni ko\'rish</button>
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
    const autoAccepted = order.auto_accepted || order.autoAccepted;

    if (status === 'accepted' || paymentStatus === 'paid') {
      statusClass = 'accepted';
      statusText = autoAccepted ? '⚡ Auto Qabul' : '✅ Qabul qilingan';
    } else if (status === 'rejected') {
      statusClass = 'rejected';
      statusText = '❌ Bekor qilingan';
    } else if (status === 'pending_payment') {
      statusClass = 'pending';
      statusText = '💳 To\'lov kutilmoqda';
    }

    const hasLocation = order.location;
    const orderId = order.order_id || order.orderId || '-----';

    return `
      <div class="order-history-card">
        <div class="order-history-header">
          <span class="order-history-id">${hasLocation ? '📍 ' : ''}#${orderId.slice(-6)}</span>
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
  cartTotal.textContent = `Umumiy: ${total.toLocaleString()} so\'m`;
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
// PAYMENT & ORDER - AVTOMATIK TIZIM (SKRINSHOTSIZ)
// ==========================================

// ⭐ BUYURTMA TUGMASI - Joylashuv so'rash va to'lovga o'tish
document.getElementById('orderBtn').addEventListener('click', async () => {
  if (!cart.length) {
    showNotification('Savat bo\'sh!', 'error');
    return;
  }

  if (!userProfile || !userProfile.phone) {
    showNotification('Iltimos, avval telefon raqamingizni yuboring', 'error');
    // Profil tabiga o'tish
    switchTab('profile');
    return;
  }

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  // ⭐ JOYLASHUV TEKSHIRUVI - Agar yo'q bo'lsa so'rash
  if (!currentLocation) {
    showLocationRequestModal();
    return;
  }

  // Joylashuv bor - to'lovga o'tish
  proceedToPayment(total);
});

// ⭐ TO'LOVGA O'TISH - Payme ga yo'naltirish va WebApp ni YOPISH
async function proceedToPayment(total) {
  if (!userProfile || !userProfile.phone) {
    showNotification('Profil ma\'lumotlari topilmadi', 'error');
    return;
  }

  const orderId = 'ORD_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

  try {
    // 1. Buyurtmani serverga yuborish (pending_payment status bilan)
    const orderData = {
      orderId: orderId,
      name: userProfile.name,
      phone: userProfile.phone,
      items: cart.map(item => ({
        name: item.name,
        price: item.price,
        qty: item.qty
      })),
      total: total,
      status: 'pending_payment',
      paymentStatus: 'pending',
      paymentMethod: 'payme',
      location: currentLocation ? 
        (currentLocation.lat ? `${currentLocation.lat},${currentLocation.lng}` : currentLocation.address) 
        : null,
      tgId: tg?.initDataUnsafe?.user?.id || null,
      initiated_from: 'webapp'
    };

    const response = await fetch(`${SERVER_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) {
      throw new Error('Buyurtma yaratish xatosi');
    }

    const order = await response.json();
    console.log('✅ Buyurtma yaratildi:', order);

    // 2. ⭐ TO'G'RIDAN-TO'G'RI PAYME GA YO'NLATISH va WEBAPP NI YOPISH
    const amountTiyin = Math.round(total * 100);
    const params = `m=${PAYME_MERCHANT_ID};ac.order_id=${orderId};a=${amountTiyin};cu=860`;
    const paramsB64 = btoa(params);
    const paymeUrl = `${PAYME_CHECKOUT_URL}/${paramsB64}`;

    console.log('💰 Payme URL:', paymeUrl);
    console.log('🔒 WebApp yopilmoqda...');

    // Savatni tozalash
    cart = [];
    saveCartLS();
    currentLocation = null;

    // ⭐ MUHIM: WebApp ni yopish - mijoz Payme da qoladi
    // To'lov callback orqali qabul qilinadi va bot xabar yuboradi
    if (tg?.close) {
      // Payme linkini ochish va darhol WebApp ni yopish
      tg.openLink(paymeUrl, { try_instant_view: false });

      // 500ms kutib WebApp ni yopish (link ochilishi uchun vaqt)
      setTimeout(() => {
        tg.close();
      }, 500);
    } else {
      // Agar Telegram WebApp bo'lmasa, oddiy ochish
      window.open(paymeUrl, '_blank');
    }

  } catch (error) {
    console.error('❌ Payment error:', error);
    showNotification('Xatolik: ' + error.message, 'error');
  }
}

// ==========================================
// INIT
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 DOMContentLoaded - BODRUM WebApp (Avtomatik to\'lov - SKRINSHOTSIZ)');

  try {
    loadCartLS();
    renderCategories();
    renderMenu();
    renderCart();
    loadUserProfile();
  } catch (error) {
    console.error('Init xato:', error);
  }
});