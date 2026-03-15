// ==========================================
// BODRUM - Payme API polling bilan
// ==========================================

import { getMenuFromLocal, categories } from './menu.js';

let tg = null;
let isTelegramWebApp = false;

if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
  tg = window.Telegram.WebApp;
  isTelegramWebApp = true;
  tg.expand();
  tg.ready();
  console.log('✅ Telegram WebApp detected');
}

const SERVER_URL = 'https://backend-production-1bf4.up.railway.app';
const PAYME_MERCHANT_ID = '698d8268f7c89c2bb7cfc08e';
const PAYME_API_URL = 'https://checkout.payme.uz/api/checkTransaction';

const menu = getMenuFromLocal();
let cart = [];
let currentLocation = null;
let activeCategory = 'all';
let searchQuery = '';
let currentFoodItem = null;
let userProfile = null;
let userOrders = [];
let pollingIntervals = {}; // Polling intervallarni saqlash

// DOM Elements
const menuContent = document.getElementById('menuContent');
const categoriesContainer = document.getElementById('categories');
const searchInput = document.getElementById('searchInput');
const foodModal = document.getElementById('foodDetailModal');

// ==========================================
// PAYME POLLING FUNKSIYASI (ENG MUHIM QISM)
// ==========================================

/**
 * Payme tranzaksiyasini API orqali tekshirish
 * @param {string} orderId - Buyurtma ID si
 * @param {number} timeout - Maksimal tekshirish vaqti (ms)
 * @returns {Promise<boolean>}
 */
async function pollPaymeTransaction(orderId, timeout = 120000) {
  const startTime = Date.now();
  const checkInterval = 3000; // 3 soniyada bir tekshirish
  
  console.log(`🔄 Payme polling boshlandi: ${orderId}`);
  
  // Avvalgi polling ni to'xtatish
  if (pollingIntervals[orderId]) {
    clearInterval(pollingIntervals[orderId]);
    delete pollingIntervals[orderId];
  }
  
  return new Promise((resolve) => {
    const intervalId = setInterval(async () => {
      try {
        // Payme API ga so'rov yuborish
        const response = await fetch(PAYME_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'check_transaction',
            params: {
              id: orderId
            }
          })
        });
        
        if (!response.ok) {
          console.warn(`Payme API javob bermadi: ${response.status}`);
          return;
        }
        
        const result = await response.json();
        console.log('Payme API javobi:', result);
        
        // 2 = completed (to'lov muvaffaqiyatli)
        if (result.result && result.result.state === 2) {
          console.log(`✅ To'lov topildi: ${orderId}`);
          clearInterval(intervalId);
          delete pollingIntervals[orderId];
          
          try {
            // Serverga xabar yuborish
            const callbackResponse = await fetch(`${SERVER_URL}/api/payme/callback`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                order_id: orderId,
                status: 'success',
                transaction_id: result.result.transaction_id || orderId
              })
            });
            
            if (callbackResponse.ok) {
              showNotification('✅ To\'lov qabul qilindi! Buyurtma avtomatik qabul qilindi.', 'success');
              
              // Profilni yangilash
              if (isTelegramWebApp) {
                loadUserProfile();
              }
            }
          } catch (error) {
            console.error('Server callback xatosi:', error);
            showNotification('⚠️ To\'lov qabul qilindi, ma\'lumotlar sinxronlashmoqda...', 'info');
          }
          
          resolve(true);
          return;
        }
        
        // 1 = pending (kutilmoqda)
        if (result.result && result.result.state === 1) {
          console.log('⏳ To\'lov kutilmoqda...');
        }
        
        // -1 = cancelled (bekor qilingan)
        if (result.result && result.result.state === -1) {
          console.log(`❌ To'lov bekor qilingan: ${orderId}`);
          clearInterval(intervalId);
          delete pollingIntervals[orderId];
          showNotification('❌ To\'lov bekor qilindi', 'error');
          resolve(false);
          return;
        }
        
        // -2 = error (xato)
        if (result.result && result.result.state === -2) {
          console.log(`❌ To'lov xatosi: ${orderId}`);
          clearInterval(intervalId);
          delete pollingIntervals[orderId];
          showNotification('❌ To\'lovda xatolik yuz berdi', 'error');
          resolve(false);
          return;
        }
        
        // Timeout tekshirish
        if (Date.now() - startTime > timeout) {
          console.log(`⏰ Timeout - tekshirish to'xtatildi: ${orderId}`);
          clearInterval(intervalId);
          delete pollingIntervals[orderId];
          showNotification('⏰ To\'lov vaqti tugadi. Admin tekshirgandan so\'ng qabul qilinadi.', 'warning');
          resolve(false);
        }
        
      } catch (error) {
        console.error('Payme polling xatosi:', error);
      }
    }, checkInterval);
    
    pollingIntervals[orderId] = intervalId;
  });
}

/**
 * Barcha polling larni to'xtatish
 */
function stopAllPolling() {
  Object.keys(pollingIntervals).forEach(orderId => {
    clearInterval(pollingIntervals[orderId]);
    delete pollingIntervals[orderId];
  });
  console.log('🛑 Barcha polling lar to\'xtatildi');
}

// ==========================================
// BUYURTMA BERISH (YANGILANGAN)
// ==========================================

document.getElementById('orderBtn').addEventListener('click', async () => {
  if (!cart.length) {
    showNotification('Savat bo\'sh!', 'error');
    return;
  }

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  // Joylashuv tekshiruvi
  if (!currentLocation) {
    showLocationRequestModal();
    return;
  }

  // Buyurtma ID yaratish
  const orderId = 'ORD_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6).toUpperCase();
  
  try {
    // 1. Buyurtmani serverda yaratish
    const orderData = {
      orderId: orderId,
      name: userProfile?.name || 'Mijoz',
      phone: userProfile?.phone || '000000000',
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
      tgId: isTelegramWebApp ? getUserId() : null,
      source: isTelegramWebApp ? 'webapp' : 'website',
      initiated_from: isTelegramWebApp ? 'webapp' : 'website'
    };

    console.log('📤 Buyurtma yuborilmoqda:', orderData);

    const response = await fetch(`${SERVER_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) {
      throw new Error('Buyurtma yaratish xatosi: ' + response.status);
    }

    const order = await response.json();
    console.log('✅ Buyurtma yaratildi:', order);

    // 2. Payme URL yaratish
    const amountTiyin = Math.round(total * 100);
    const params = `m=${PAYME_MERCHANT_ID};ac.order_id=${orderId};a=${amountTiyin}`;
    const paramsB64 = btoa(params);
    const paymeUrl = `https://checkout.payme.uz/${paramsB64}`;

    // 3. Savatni tozalash
    cart = [];
    saveCartLS();
    renderCart();
    
    // 4. Joylashuvni tozalash
    currentLocation = null;

    // 5. Payme sahifasiga yo'naltirish va polling boshlash
    if (isTelegramWebApp && tg?.openLink) {
      tg.openLink(paymeUrl);
      
      showNotification('💳 To\'lov sahifasiga o\'tdingiz. To\'lovni amalga oshiring.', 'info');
      
      // 6. POLLING BOSHLASH - 2 daqiqa davomida tekshiradi
      pollPaymeTransaction(orderId, 120000);
      
    } else {
      // Oddiy sayt uchun
      window.open(paymeUrl, '_blank');
      showNotification('💳 To\'lov sahifasiga yo\'naltirildik!', 'success');
      
      // 5 soniyadan keyin polling boshlash
      setTimeout(() => {
        pollPaymeTransaction(orderId, 60000);
      }, 5000);
    }

  } catch (error) {
    console.error('❌ Buyurtma xatosi:', error);
    showNotification('Xatolik: ' + error.message, 'error');
  }
});

// ==========================================
// PROFIL FUNKSIYALARI
// ==========================================

function getUserId() {
  if (isTelegramWebApp && tg.initDataUnsafe?.user?.id) {
    return tg.initDataUnsafe.user.id;
  }
  let userId = localStorage.getItem('bodrum_user_id');
  if (!userId) {
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('bodrum_user_id', userId);
  }
  return userId;
}

async function loadUserProfile() {
  if (!isTelegramWebApp) return;
  
  try {
    const tgId = tg.initDataUnsafe?.user?.id;
    if (!tgId) return;

    const response = await fetch(`${SERVER_URL}/api/user/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tgId: tgId.toString() })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.profile) {
        userProfile = result.profile;
        userOrders = result.orders || [];
        renderProfile();
        renderOrdersList(userOrders);
      }
    }
  } catch (error) {
    console.error('Profil yuklash xatosi:', error);
  }
}

function renderProfile() {
  if (!userProfile) return;
  
  const name = userProfile.name || 'Foydalanuvchi';
  
  document.getElementById('profileName').textContent = name;
  document.getElementById('displayName').textContent = name;
  
  if (userProfile.phone) {
    const phone = userProfile.phone;
    const formattedPhone = `+998 ${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 7)} ${phone.slice(7)}`;
    document.getElementById('profilePhone').textContent = formattedPhone;
    document.getElementById('displayPhone').textContent = formattedPhone;
  }
}

// ==========================================
// CART FUNKSIYALARI
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
// JOYLASHUV FUNKSIYALARI
// ==========================================

window.requestLocation = function() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        currentLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        closeLocationRequestModal();
        showNotification('📍 Joylashuv saqlandi!', 'success');
      },
      (error) => {
        console.error('Geolocation error:', error);
        showManualLocationInput();
      }
    );
  } else {
    showManualLocationInput();
  }
};

function showManualLocationInput() {
  const address = prompt('Manzilingizni kiriting:');
  if (address && address.trim()) {
    currentLocation = { address: address.trim(), manual: true };
    closeLocationRequestModal();
    showNotification('Manzil saqlandi!', 'success');
  }
}

function showLocationRequestModal() {
  const modal = document.getElementById('locationRequestModal');
  if (modal) modal.classList.add('show');
}

window.closeLocationRequestModal = function() {
  const modal = document.getElementById('locationRequestModal');
  if (modal) modal.classList.remove('show');
};

// ==========================================
// MENYU FUNKSIYALARI
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
    menuContent.innerHTML = '<div class="no-results">🔍 Hech narsa topilmadi</div>';
    return;
  }

  menuContent.innerHTML = `
    <div class="menu-grid">
      ${filtered.map(item => createCard(item)).join('')}
    </div>
  `;
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

  document.getElementById('foodModalImage').src = item.image || '';
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
// UTILS
// ==========================================

function showNotification(message, type = 'info') {
  const colors = {
    success: 'linear-gradient(135deg, #00D084, #00b06b)',
    error: 'linear-gradient(135deg, #FF4757, #ff3344)',
    info: 'linear-gradient(135deg, #FFD700, #D4AF37)',
    warning: 'linear-gradient(135deg, #FFA502, #ff9500)'
  };

  const div = document.createElement('div');
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

function renderOrdersList(orders) {
  const container = document.getElementById('ordersList');
  if (!container) return;

  if (!orders || orders.length === 0) {
    container.innerHTML = `
      <div class="empty-orders">
        <div class="empty-orders-icon">📭</div>
        <div class="empty-orders-text">Hali buyurtmalar yo'q</div>
      </div>
    `;
    return;
  }

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

    return `
      <div class="order-history-card">
        <div class="order-history-header">
          <span class="order-history-id">#${(order.order_id || order.orderId || '').slice(-6)}</span>
          <span class="order-history-date">${date.toLocaleDateString('uz-UZ')}</span>
        </div>
        <div class="order-history-items">${itemsText}</div>
        <div class="order-history-footer">
          <span class="order-history-total">${(order.total || 0).toLocaleString()} so'm</span>
          <span class="order-history-status ${order.status === 'accepted' ? 'accepted' : 'pending'}">
            ${order.status === 'accepted' ? '✅ Qabul qilingan' : '⏳ Kutilmoqda'}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// INIT
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 BODRUM ishga tushdi');
  console.log('📱 Mode:', isTelegramWebApp ? 'Telegram WebApp' : 'Regular Website');
  console.log('💰 Payme polling enabled');

  loadCartLS();
  renderCategories();
  renderMenu();
  renderCart();
  
  if (isTelegramWebApp) {
    loadUserProfile();
  }
});

// Sahifa yopilganda polling larni to'xtatish
window.addEventListener('beforeunload', stopAllPolling);
