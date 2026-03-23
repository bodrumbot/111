
// ==========================================
// BODRUM - SAYT VA TELEGRAM WEBAPP UCHUN UMUMIY
// ==========================================

import { getMenuFromLocal, categories } from './menu.js';
import { getProfileDB, saveProfileDB, addOrderDB, getOrdersDB } from './db.js';

// ==========================================
// GLOBAL VARIABLES
// ==========================================

let tg = null;
let isTelegramWebApp = false;

// Telegram WebApp tekshirish (agar mavjud bo'lsa)
if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
  tg = window.Telegram.WebApp;
  isTelegramWebApp = true;
  tg.expand();
  tg.ready();
  tg.enableClosingConfirmation();
  console.log('✅ Telegram WebApp detected');
} else {
  console.log('ℹ️ Oddiy sayt rejimi (Telegram WebApp yo\'q)');
}

const SERVER_URL = 'https://backend-production-1bf4.up.railway.app';
const PAYME_MERCHANT_ID = '698d8268f7c89c2bb7cfc08e';
const PAYME_CHECKOUT_URL = 'https://checkout.payme.uz';

const menu = getMenuFromLocal();
let cart = [];
let currentLocation = null;
let activeCategory = 'all';
let searchQuery = '';
let currentFoodItem = null;
let userProfile = null;
let userOrders = [];

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
// PAYME URL GENERATOR
// ==========================================

function generatePaymeUrl(orderId, amount) {
  const amountInTiyin = Math.round(amount * 100);
  const params = `m=${PAYME_MERCHANT_ID};ac.order_id=${orderId};a=${amountInTiyin}`;
  const base64Params = btoa(params);
  const paymeUrl = `${PAYME_CHECKOUT_URL}/${base64Params}`;

  console.log('🔗 Payme URL yaratildi:', paymeUrl);
  return paymeUrl;
}

// ==========================================
// MIJOZ MA'LUMOTLARI - SAYT VA TELEGRAM UCHUN
// ==========================================

function getCustomerInfo() {
  let name = localStorage.getItem('bodrum_user_name');
  let phone = localStorage.getItem('bodrum_user_phone');

  // Telegram dan olish (agar mavjud bo'lsa)
  if (!name && isTelegramWebApp && tg.initDataUnsafe?.user?.first_name) {
    name = tg.initDataUnsafe.user.first_name;
    if (tg.initDataUnsafe.user.last_name) {
      name += ' ' + tg.initDataUnsafe.user.last_name;
    }
  }

  if (!name) name = null;
  if (!phone || phone.length !== 9) phone = null;

  return { name, phone };
}

function saveUserProfile(name, phone) {
  localStorage.setItem('bodrum_user_name', name);
  localStorage.setItem('bodrum_user_phone', phone);

  userProfile = {
    name: name,
    phone: phone,
    user_id: getUserId()
  };

  renderProfile();
}

function getUserId() {
  if (isTelegramWebApp && tg.initDataUnsafe?.user?.id) {
    return 'tg_' + tg.initDataUnsafe.user.id;
  }

  let userId = localStorage.getItem('bodrum_user_id');
  if (!userId) {
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('bodrum_user_id', userId);
  }
  return userId;
}

function getUserName() {
  if (isTelegramWebApp && tg.initDataUnsafe?.user?.first_name) {
    return tg.initDataUnsafe.user.first_name;
  }
  return localStorage.getItem('bodrum_user_name') || null;
}

function getUserPhone() {
  return localStorage.getItem('bodrum_user_phone') || null;
}

// ==========================================
// TO'LOV JARAYONI
// ==========================================

async function startPaymentProcess() {
  if (cart.length === 0) {
    showNotification('Savat bo\'sh!', 'error');
    return;
  }

  const customerInfo = getCustomerInfo();
  if (!customerInfo.name || !customerInfo.phone) {
    showContactRequestModal();
    return;
  }

  if (!currentLocation) {
    showLocationRequestModal();
    return;
  }

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const orderId = 'ORD_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

  const orderData = {
    orderId: orderId,
    name: customerInfo.name,
    phone: customerInfo.phone,
    items: cart.map(item => ({
      name: item.name,
      price: item.price,
      qty: item.qty
    })),
    total: total,
    location: currentLocation.lat ? `${currentLocation.lat},${currentLocation.lng}` : currentLocation.address,
    tgId: getUserId(),
    source: isTelegramWebApp ? 'telegram' : 'website',
    status: 'pending',
    paymentStatus: 'pending',
    paymentMethod: 'payme'
  };

  try {
    showNotification('⏳ Buyurtma yuborilmoqda...', 'info');

    const response = await fetch(`${SERVER_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) {
      throw new Error('Buyurtma yaratish xatosi');
    }

    const result = await response.json();
    console.log('✅ Buyurtma yaratildi:', result);

    const paymeUrl = generatePaymeUrl(orderId, total);

    // To'lovga yo'naltirish
    openPaymeLink(paymeUrl);

    showNotification('✅ Buyurtma yuborildi! To\'lov sahifasiga o\'tildi.', 'success');

    cart = [];
    saveCartLS();
    renderCart();

    setTimeout(() => switchTab('profile'), 3000);

  } catch (error) {
    console.error('❌ Xato:', error);
    showNotification('Xatolik yuz berdi: ' + error.message, 'error');
  }
}

function openPaymeLink(paymeUrl) {
  console.log('🚀 Payme ochilmoqda:', paymeUrl);

  // Telegram WebApp da
  if (isTelegramWebApp) {
    if (tg.openLink) {
      try {
        tg.openLink(paymeUrl, { try_instant_view: false });
        return;
      } catch (e) {
        console.warn('tg.openLink xato:', e);
      }
    }
    if (tg.openTelegramLink) {
      try {
        tg.openTelegramLink(paymeUrl);
        return;
      } catch (e) {
        console.warn('tg.openTelegramLink xato:', e);
      }
    }
  }

  // Oddiy saytda
  if (window.open) {
    const newWindow = window.open(paymeUrl, '_blank');
    if (newWindow) return;
  }

  window.location.href = paymeUrl;
}

// ==========================================
// JOYLASHUV SO'RASH
// ==========================================

function showLocationRequestModal() {
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
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        handleLocationReceived({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      (error) => {
        console.warn('Geolocation xatosi:', error);
        showManualLocationInput();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  } else {
    showManualLocationInput();
  }
};

function handleLocationReceived(location) {
  currentLocation = {
    lat: location.latitude || location.lat,
    lng: location.longitude || location.lng || location.long
  };

  closeLocationRequestModal();
  showNotification('📍 Joylashuv saqlandi!', 'success');

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  if (total > 0) {
    startPaymentProcess();
  }
}

function showManualLocationInput() {
  const address = prompt('Manzilingizni kiriting:');
  if (address && address.trim()) {
    currentLocation = { address: address.trim(), manual: true };
    closeLocationRequestModal();
    showNotification('Manzil saqlandi!', 'success');

    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    if (total > 0) {
      startPaymentProcess();
    }
  }
}

// ==========================================
// KONTAKT SO'RASH (SAYT UCHUN INPUT MODAL)
// ==========================================

window.showContactRequestModal = function() {
  // Agar Telegram bo'lsa, Telegram contact so'rasin
  if (isTelegramWebApp && tg.requestContact) {
    tg.requestContact((result) => {
      if (result) {
        const contact = tg.initDataUnsafe?.contact;
        if (contact) {
          let phone = contact.phone_number || '';
          phone = phone.replace(/\\D/g, '');
          if (phone.startsWith('998')) phone = phone.substring(3);
          phone = phone.slice(-9);

          const name = contact.first_name || contact.name || 'Foydalanuvchi';
          saveUserProfile(name, phone);
          showNotification('✅ Ma\'lumotlar saqlandi!', 'success');
          setTimeout(() => loadUserOrdersFromServer(), 500);
        }
      } else {
        showProfileInputModal();
      }
    });
  } else {
    // Oddiy saytda input modal ko'rsatish
    showProfileInputModal();
  }
};

window.closeContactRequestModal = function() {
  const modal = document.getElementById('contactRequestModal');
  if (modal) {
    modal.classList.remove('show');
  }
};

window.requestContactFromModal = function() {
  showContactRequestModal();
};

window.showProfileInputModal = function() {
  const existing = document.getElementById('profileInputModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'profileInputModal';
  modal.className = 'modal-overlay show';
  modal.style.zIndex = '3000';
  modal.innerHTML = `
    <div class="modal-box" style="max-width: 400px; text-align: center;">
      <div style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #FFD700, #D4AF37); display: flex; align-items: center; justify-content: center; font-size: 40px; margin: 0 auto 20px;">👤</div>
      <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 12px; color: #fff;">Ma\\'lumotlaringiz</h2>
      <p style="color: #888; margin-bottom: 24px; font-size: 14px;">Buyurtma berish uchun ismingiz va telefon raqamingiz kerak</p>

      <div style="margin-bottom: 16px;">
        <input type="text" id="inputName" placeholder="Ismingiz" style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(212,175,55,0.3); border-radius: 12px; padding: 16px; color: white; font-size: 15px; margin-bottom: 12px;">
        <input type="tel" id="inputPhone" placeholder="Telefon (901234567)" style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(212,175,55,0.3); border-radius: 12px; padding: 16px; color: white; font-size: 15px;">
      </div>

      <button onclick="saveProfileAndContinue()" style="width: 100%; background: linear-gradient(135deg, #FFD700, #D4AF37); color: #000; border: none; padding: 16px; border-radius: 12px; font-size: 16px; font-weight: 800; cursor: pointer; margin-bottom: 12px;">Davom ettirish</button>
      <button onclick="closeProfileInputModal()" style="width: 100%; background: transparent; color: #888; border: 2px solid rgba(255,255,255,0.1); padding: 14px; border-radius: 12px; font-size: 14px; cursor: pointer;">Bekor qilish</button>
    </div>
  `;

  document.body.appendChild(modal);
};

window.saveProfileAndContinue = function() {
  const nameInput = document.getElementById('inputName');
  const phoneInput = document.getElementById('inputPhone');

  const name = nameInput?.value?.trim();
  let phone = phoneInput?.value?.trim();

  if (!name || !phone) {
    showNotification('Iltimos, ism va telefon raqam kiriting', 'error');
    return;
  }

  phone = phone.replace(/\\D/g, '');
  if (phone.startsWith('998')) phone = phone.substring(3);
  if (phone.startsWith('+998')) phone = phone.substring(4);
  phone = phone.slice(-9);

  if (phone.length !== 9) {
    showNotification('Noto\'g\'ri telefon raqam', 'error');
    return;
  }

  saveUserProfile(name, phone);
  closeProfileInputModal();
  closeContactRequestModal();
  showNotification('✅ Ma\'lumotlar saqlandi!', 'success');

  setTimeout(() => loadUserOrdersFromServer(), 500);
};

window.closeProfileInputModal = function() {
  const modal = document.getElementById('profileInputModal');
  if (modal) modal.remove();
};

window.requestContact = function() {
  showContactRequestModal();
};

// ==========================================
// PROFILE FUNCTIONS
// ==========================================

async function loadUserProfile() {
  console.log('🔍 Profil yuklanmoqda...');

  const savedName = getUserName();
  const savedPhone = getUserPhone();

  if (savedName && savedPhone) {
    userProfile = {
      name: savedName,
      phone: savedPhone,
      user_id: getUserId()
    };

    renderProfile();
    await loadUserOrdersFromServer();
    return;
  }

  // Telegram dan olish
  if (isTelegramWebApp) {
    try {
      const tgUser = tg.initDataUnsafe?.user;
      const tgId = tgUser?.id;

      if (!tgId) {
        showProfileNotFound();
        return;
      }

      const response = await fetch(`${SERVER_URL}/api/user/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tgId: tgId.toString() })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const result = await response.json();

      if (result.success && result.profile) {
        userProfile = result.profile;
        userOrders = result.orders || [];

        localStorage.setItem('bodrum_user_name', userProfile.name);
        localStorage.setItem('bodrum_user_phone', userProfile.phone);

        renderProfile();
        updateProfileStats();
        renderOrdersList(userOrders);
      } else {
        showProfileNotFound();
      }
    } catch (error) {
      console.error('❌ Profil yuklash xatosi:', error);
      showProfileNotFound();
    }
  } else {
    showProfileNotFound();
  }
}

async function loadUserOrdersFromServer() {
  try {
    const userId = getUserId();
    let tgId = userId;
    if (tgId.startsWith('tg_')) {
      tgId = tgId.replace('tg_', '');
    }

    console.log('🔍 Buyurtmalarni yuklash: tgId =', tgId);

    const response = await fetch(`${SERVER_URL}/api/user/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tgId: tgId })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.orders) {
        userOrders = result.orders;
        console.log('✅ Buyurtmalar yuklandi:', userOrders.length);
        updateProfileStats();
        renderOrdersList(userOrders);
      } else {
        userOrders = [];
        updateProfileStats();
      }
    } else {
      userOrders = [];
      updateProfileStats();
    }
  } catch (error) {
    console.error('Buyurtmalarni yuklash xatosi:', error);
    userOrders = [];
    updateProfileStats();
  }
}

function renderProfile() {
  if (!userProfile) return;

  const name = userProfile.name || 'Foydalanuvchi';
  const phone = userProfile.phone || '';

  if (profileAvatar) profileAvatar.textContent = getInitials(name);
  if (profileName) profileName.textContent = name;
  if (profilePhone) profilePhone.textContent = formatPhone(phone);
  if (profileSource) profileSource.textContent = isTelegramWebApp ? '🤖 Telegram' : '🌐 Sayt';
  if (displayName) displayName.textContent = name;
  if (displayPhone) displayPhone.textContent = formatPhone(phone);

  updateProfileStats();

  const updateBtn = document.getElementById('updatePhoneBtn');
  if (updateBtn) {
    updateBtn.style.display = 'block';
    updateBtn.textContent = '📱 Ma\'lumotlarni yangilash';
  }
}

function updateProfileStats() {
  console.log('📊 Statistika yangilanmoqda...', userOrders);

  const totalOrders = userOrders && Array.isArray(userOrders) ? userOrders.length : 0;
  const totalSpent = userOrders && Array.isArray(userOrders)
    ? userOrders.reduce((sum, o) => sum + (o.total || 0), 0)
    : 0;

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
  if (profileAvatar) profileAvatar.textContent = '👤';
  if (profileName) profileName.textContent = 'Mehmon';
  if (profilePhone) profilePhone.textContent = '+998 __ _______';
  if (profileSource) profileSource.textContent = isTelegramWebApp ? '🤖 Telegram' : '🌐 Sayt';
  if (displayName) displayName.textContent = '---';
  if (displayPhone) displayPhone.textContent = '---';

  userOrders = [];
  updateProfileStats();

  const updateBtn = document.getElementById('updatePhoneBtn');
  if (updateBtn) {
    updateBtn.style.display = 'block';
    updateBtn.textContent = '📱 Profil yaratish';
  }
}

function renderOrdersList(orders) {
  const container = document.getElementById('ordersList');
  if (!container) return;

  if (!orders || !Array.isArray(orders) || orders.length === 0) {
    container.innerHTML = `
      <div class="empty-orders">
        <div class="empty-orders-icon">📭</div>
        <div class="empty-orders-text">Hali buyurtmalar yo\\'q</div>
        <button class="browse-menu-btn" onclick="switchTab('menu')">Menyuni ko\\'rish</button>
      </div>
    `;
    return;
  }

  container.innerHTML = orders.slice(0, 10).map(order => {
    const date = new Date(order.created_at || order.createdAt || Date.now());
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
      statusText = order.auto_accepted ? '⚡ Auto' : '✅ Qabul';
    } else if (status === 'rejected') {
      statusClass = 'rejected';
      statusText = '❌ Bekor';
    } else if (status === 'pending_payment') {
      statusClass = 'pending';
      statusText = '💳 To\'lov';
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
          <span class="order-history-total">${(order.total || 0).toLocaleString()} so\\'m</span>
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
      <div class="price">${item.price.toLocaleString()} so\\'m</div>
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
          <div class="cart-item-price">${(item.price * item.qty).toLocaleString()} so\\'m</div>
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
  cartTotal.textContent = `Umumiy: ${total.toLocaleString()} so\\'m`;
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

document.getElementById('orderBtn').addEventListener('click', () => {
  startPaymentProcess();
});

// ==========================================
// INIT
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 DOMContentLoaded - BODRUM');
  console.log('📱 Mode:', isTelegramWebApp ? 'Telegram WebApp' : 'Oddiy sayt');

  try {
    loadCartLS();
    renderCategories();
    renderMenu();
    renderCart();
    loadUserProfile();

    // Telegram MainButton (agar mavjud bo'lsa)
    if (isTelegramWebApp && tg.MainButton) {
      tg.MainButton.setText('🛒 Buyurtma berish');
      tg.MainButton.onClick(() => {
        startPaymentProcess();
      });
    }

  } catch (error) {
    console.error('Init xato:', error);
  }
});
