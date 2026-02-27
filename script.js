// ==========================================

import { getMenuFromLocal, categories } from './menu.js';
import { saveProfileDB, getProfileDB, getOrdersDB, deleteProfileDB, addOrderDB } from './db.js';

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
let currentProfile = null;
let currentFoodItem = null;
let currentOrderId = null;
let pendingPaymentData = null;
let selectedScreenshot = null;
let botConfirmationCheckInterval = null;

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
const editName = document.getElementById('editName');
const editPhone = document.getElementById('editPhone');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const firstTimeModal = document.getElementById('firstTimeModal');
const modalName = document.getElementById('modalName');
const modalPhone = document.getElementById('modalPhone');
const modalSaveBtn = document.getElementById('modalSaveBtn');
const logoutBtn = document.getElementById('logoutBtn');

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
    if (btn.dataset.tab === 'profile') renderProfile();
  });
});

window.switchTab = function(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
  document.getElementById(tabName)?.classList.add('active');
  if (tabName === 'profile') renderProfile();
};

// ==========================================
// PAYME INSTRUCTION MODAL
// ==========================================

function openInstructionModal(total, phone) {
  pendingPaymentData = {
    total: total,
    phone: phone,
    orderId: 'ORD_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  };
  
  paymeInstructionModal.classList.add('show');
  document.body.style.overflow = 'hidden';
  
  loadExampleScreenshot();
}

window.closeInstructionModal = function() {
  paymeInstructionModal.classList.remove('show');
  document.body.style.overflow = '';
};

function loadExampleScreenshot() {
  const img = document.getElementById('exampleScreenshot');
  img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjgwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjgwMCIgZmlsbD0iIzFhMWEyMiIvPgogIDx0ZXh0IHg9IjUwJSIgeT0iMzAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiNGRkQ3MDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiPgogICAg8J+TjCBQYXltZSBza3JpbnNob3QKICA8L3RleHQ+CiAgPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzAwRDA4NCIgdGV4dC1hbmNob3I9Im1pZGRsZSI+CiAgICA8L3RleHQ+CiAgPHRleHQgeD0iNTAlIiB5PSI2MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iI2FhYSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+CiAgICBUb2xvdCBtdXZhZmZhcWl5YXRsaSBib2xnYW4geGFib24KICA8L3RleHQ+CiAgPGNpcmNsZSBjeD0iNTAlIiBjeT0iNzAlIiByPSI0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDBEMDg0IiBzdHJva2Utd2lkdGg9IjMiLz4KICA8cGF0aCBkPSJNMTgwIDM1MCBsMjAgMjAgbDQwIC00MCIgc3Ryb2tlPSIjMDBEMDg0IiBzdHJva2Utd2lkdGg9IjMiIGZpbGw9Im5vbmUiLz4KPC9zdmc+';
}

// "Tushundim" tugmasi
document.getElementById('understandBtn').addEventListener('click', async () => {
  if (!pendingPaymentData) {
    console.error('pendingPaymentData is null');
    showNotification('Xatolik yuz berdi', 'error');
    return;
  }
  
  const orderId = pendingPaymentData.orderId;
  const dataToPass = { ...pendingPaymentData };
  
  // Serverga yuborish - xato bo'lsa ham davom etamiz
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
    } else {
      const result = await response.json();
      
      if (!result.success && result.initiated_from) {
        showNotification(`Bu buyurtma allaqachon ${result.initiated_from} dan boshlangan!`, 'error');
        closeInstructionModal();
        pendingPaymentData = null;
        return;
      }
    }
  } catch (error) {
    console.error('Initiated mark error:', error);
  }
  
  // Muvaffaqiyatli - Payme ga o'tish
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
  
  // ⭐ BOT GA TASDIQLASH SO'ROVI YUBORISH
  sendBotConfirmationRequest(orderId, total);
  
  // 3 soniyadan keyin tasdiqlash oynasini ko'rsatish
  setTimeout(() => {
    showPaymentConfirmationDialog(total);
  }, 3000);
}

// ⭐ BOT GA TASDIQLASH SO'ROVI YUBORISH
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
  
  const profile = await getProfileDB();
  if (!profile?.name || !profile?.phone) {
    showNotification('Iltimos avval profilni to\'ldiring!', 'error');
    switchTab('profile');
    return;
  }
  
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  openInstructionModal(total, profile.phone);
});

// ==========================================
// PAYMENT CONFIRMATION DIALOG
// ==========================================

function showPaymentConfirmationDialog(total) {
  // Agar allaqachon ochiq bo'lsa, yana ochmaymiz
  if (document.getElementById('paymentConfirmDialog')) {
    return;
  }
  
  const modal = document.createElement('div');
  modal.id = 'paymentConfirmDialog';
  modal.className = 'modal-overlay show';
  modal.innerHTML = `
    <div class="modal-box confirm-dialog">
      <div class="confirm-icon">💳</div>
      <div class="confirm-title">To'lovni amalga oshirdingizmi?</div>
      <div class="confirm-amount">${total.toLocaleString()} so'm</div>
      <div class="confirm-text">
        Agar to'lov muvaffaqiyatli bo'lgan bo'lsa, skrinshot yuklang
      </div>
      
      <div class="confirm-buttons">
        <button class="btn-yes" id="btnYesConfirm">
          ✅ Ha, to'lov qildim
        </button>
        <button class="btn-no" onclick="cancelPayment()">
          ❌ Yo'q, bekor qilish
        </button>
      </div>
      
      <div class="confirm-help">
        💡 To'lovda muammo bo'lsa, qayta urinib ko'ring
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Ha tugmasi event listener
  document.getElementById('btnYesConfirm').addEventListener('click', () => {
    confirmPaymentFromWebApp();
  });
  
  // Bot dan tasdiqlashni tekshirish
  startBotConfirmationCheck();
}

// ⭐ WEB APP DAN TASDIQLASH
window.confirmPaymentFromWebApp = async function() {
  const modal = document.getElementById('paymentConfirmDialog');
  if (modal) modal.remove();
  
  // Bot ga xabar yuborish (agar hali yuborilmagan bo'lsa)
  const tgId = tg?.initDataUnsafe?.user?.id;
  if (tgId && currentOrderId) {
    try {
      await fetch(`${SERVER_URL}/api/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: currentOrderId,
          tgId: tgId
        })
      });
    } catch (e) {
      console.error('Confirm payment error:', e);
    }
  }
  
  // To'g'ridan-to'g'ri screenshot yuklash oynasini ochish
  proceedToScreenshot();
};

window.cancelPayment = function() {
  const modal = document.getElementById('paymentConfirmDialog');
  if (modal) modal.remove();
  
  // Tekshirish intervalini to'xtatish
  stopBotConfirmationCheck();
  
  currentOrderId = null;
  pendingPaymentData = null;
};

// ⭐ BOT DAN TASDIQLASHNI TEKSHIRISH
function startBotConfirmationCheck() {
  if (botConfirmationCheckInterval) {
    clearInterval(botConfirmationCheckInterval);
  }
  
  // Har 2 soniyada tekshirish
  botConfirmationCheckInterval = setInterval(async () => {
    if (!currentOrderId) {
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
        
        if (result.bot_confirmed) {
          console.log('✅ Bot dan tasdiqlandi!');
          stopBotConfirmationCheck();
          
          // Web App da tasdiqlash oynasini yopib, screenshot yuklash oynasini ochish
          const modal = document.getElementById('paymentConfirmDialog');
          if (modal) modal.remove();
          
          showNotification('Bot dan tasdiqlandi! Skrinshot yuklang', 'success');
          proceedToScreenshot();
        }
      }
    } catch (error) {
      console.error('Bot confirmation check error:', error);
    }
  }, 2000);
  
  // 60 soniyadan keyin to'xtatish
  setTimeout(() => {
    stopBotConfirmationCheck();
  }, 60000);
}

function stopBotConfirmationCheck() {
  if (botConfirmationCheckInterval) {
    clearInterval(botConfirmationCheckInterval);
    botConfirmationCheckInterval = null;
  }
}

// ==========================================
// SCREENSHOT UPLOAD
// ==========================================

window.proceedToScreenshot = function() {
  const modal = document.getElementById('paymentConfirmDialog');
  if (modal) modal.remove();
  
  // Agar allaqachon ochiq bo'lsa
  if (document.getElementById('screenshotModal')) {
    return;
  }
  
  const screenshotModal = document.createElement('div');
  screenshotModal.id = 'screenshotModal';
  screenshotModal.className = 'modal-overlay show';
  screenshotModal.innerHTML = `
    <div class="modal-box screenshot-modal">
      <div class="modal-title">📸 To'lov skrinshotini yuklang</div>
      
      <div class="screenshot-icon">📱</div>
      
      <div class="screenshot-instructions">
        <p>1. Payme dan to'lov skrinshotini oling</p>
        <p>2. Pastdagi tugmani bosib yuklang</p>
        <p>3. Admin tekshirgach buyurtma qabul qilinadi</p>
      </div>
      
      <div class="screenshot-upload-area" id="screenshotUploadArea">
        <input type="file" id="screenshotInput" accept="image/*" style="display:none;">
        <div class="upload-placeholder" onclick="document.getElementById('screenshotInput').click()">
          <div class="upload-icon">📷</div>
          <div class="upload-text">Skrinshot tanlash</div>
          <div class="upload-hint">yoki bu yerga tashlang</div>
        </div>
        <div class="upload-preview" id="uploadPreview" style="display:none;">
          <img id="previewImage" src="" alt="Preview">
          <button class="change-image" onclick="document.getElementById('screenshotInput').click()">🔄 O'zgartirish</button>
        </div>
      </div>
      
      <div class="order-summary">
        <div class="summary-row">
          <span>Buyurtma:</span>
          <span>#${currentOrderId?.slice(-6)}</span>
        </div>
      </div>
      
      <button class="btn-submit-order" id="submitOrderBtn" onclick="submitOrderWithScreenshot()" disabled>
        📤 Buyurtma yuborish
      </button>
      
      <button class="btn-cancel-order" onclick="cancelScreenshot()">Bekor qilish</button>
    </div>
  `;
  
  document.body.appendChild(screenshotModal);
  
  setTimeout(() => {
    const fileInput = document.getElementById('screenshotInput');
    fileInput.addEventListener('change', handleScreenshotSelect);
  }, 100);
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
    
    previewImg.src = e.target.result;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    
    document.querySelector('.screenshot-upload-area').classList.add('has-image');
    document.getElementById('submitOrderBtn').disabled = false;
  };
  reader.readAsDataURL(file);
}

window.cancelScreenshot = function() {
  const modal = document.getElementById('screenshotModal');
  if (modal) modal.remove();
  selectedScreenshot = null;
  currentOrderId = null;
  pendingPaymentData = null;
};

// ==========================================
// SUBMIT ORDER
// ==========================================

window.submitOrderWithScreenshot = async function() {
  if (!selectedScreenshot || !currentOrderId) {
    showNotification('Iltimos, skrinshot tanlang', 'error');
    return;
  }
  
  const btn = document.getElementById('submitOrderBtn');
  btn.disabled = true;
  btn.textContent = 'Yuborilmoqda...';
  
  try {
    const base64Screenshot = await fileToBase64(selectedScreenshot);
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const profile = await getProfileDB();
    
    const orderData = {
      orderId: currentOrderId,
      name: profile.name,
      phone: profile.phone,
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
    
    const response = await fetch(`${SERVER_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
    
    if (!response.ok) throw new Error('Server error');
    
    const order = await response.json();
    
    await addOrderDB({
      text: cart.map(i => `${i.name} x${i.qty}`).join(', '),
      date: new Date().toISOString(),
      total: total,
      items: cart.map(item => ({ name: item.name, qty: item.qty })),
      status: 'pending_verification',
      orderId: currentOrderId,
      screenshot: base64Screenshot
    });
    
    const modal = document.getElementById('screenshotModal');
    if (modal) modal.remove();
    
    cart = [];
    saveCartLS();
    renderCart();
    selectedScreenshot = null;
    pendingPaymentData = null;
    
    showNotification('✅ Buyurtma yuborildi! Admin tekshiradi.', 'success');
    
    setTimeout(() => switchTab('profile'), 1500);
    
  } catch (error) {
    console.error('❌ Submit error:', error);
    showNotification('Xatolik: ' + error.message, 'error');
    btn.disabled = false;
    btn.textContent = '📤 Buyurtma yuborish';
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
// PROFILE FUNCTIONS
// ==========================================

async function renderProfile() {
  try {
    currentProfile = await getProfileDB();
    
    if (currentProfile) {
      profileAvatar.textContent = getInitials(currentProfile.name);
      profileName.textContent = currentProfile.name;
      profilePhone.textContent = formatPhone(currentProfile.phone);
      
      editName.value = currentProfile.name;
      editPhone.value = currentProfile.phone;
      
      firstTimeModal.classList.remove('show');
      
      await loadProfileStats();
    } else {
      profileAvatar.textContent = '👤';
      profileName.textContent = 'Mehmon';
      profilePhone.textContent = '+998 __ _______';
      
      editName.value = '';
      editPhone.value = '';
      
      firstTimeModal.classList.add('show');
    }
  } catch (error) {
    showNotification('Profil yuklashda xatolik', 'error');
  }
}

async function loadProfileStats() {
  try {
    const orders = await getOrdersDB();
    
    const totalOrders = orders.length;
    const totalSpent = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    
    document.getElementById('totalOrders').textContent = totalOrders;
    document.getElementById('totalSpent').textContent = (totalSpent / 1000).toFixed(0) + 'k';
    document.getElementById('ordersCountBadge').textContent = totalOrders;
    
    const vipStatus = document.getElementById('vipStatus');
    if (totalOrders >= 20) vipStatus.textContent = '💎';
    else if (totalOrders >= 10) vipStatus.textContent = '🥇';
    else if (totalOrders >= 5) vipStatus.textContent = '🥈';
    else vipStatus.textContent = '🥉';
    
    renderOrdersList(orders);
  } catch (error) {
    console.error('loadProfileStats xato:', error);
  }
}

function renderOrdersList(orders) {
  const container = document.getElementById('ordersList');
  
  if (orders.length === 0) {
    container.innerHTML = `
      <div class="empty-orders">
        <div class="empty-orders-icon">📭</div>
        <div class="empty-orders-text">Hali buyurtmalar yo'q</div>
        <button class="browse-menu-btn" onclick="switchTab('menu')">Menyuni ko'rish</button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = orders.slice(0, 10).map(order => {
    const date = new Date(order.createdAt || order.date);
    const itemsText = order.items ? order.items.map(i => `${i.name} x${i.qty}`).join(', ') : order.text;
    
    let statusClass = 'pending';
    let statusText = '⏳ Kutilmoqda';
    
    const status = order.status || order.paymentStatus;
    
    if (status === 'pending_verification') {
      statusClass = 'pending';
      statusText = '⏳ Tekshirilmoqda';
    } else if (status === 'accepted' || status === 'paid') {
      statusClass = 'accepted';
      statusText = '✅ Qabul qilingan';
    } else if (status === 'rejected') {
      statusClass = 'rejected';
      statusText = '❌ Bekor qilingan';
    }
    
    const hasScreenshot = order.screenshot ? '📸 ' : '';
    
    return `
      <div class="order-history-card">
        <div class="order-history-header">
          <span class="order-history-id">${hasScreenshot}#${order.orderId?.slice(-6) || '-----'}</span>
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

async function saveProfile(name, phone, address = '') {
  if (!name || name.length < 2) {
    showNotification('Ismni to\'g\'ri kiriting', 'error');
    return false;
  }
  
  const cleanPhone = phone.replace(/\\D/g, '');
  if (!cleanPhone || cleanPhone.length !== 9) {
    showNotification('Telefon raqamni to\'g\'ri kiriting', 'error');
    return false;
  }
  
  try {
    await saveProfileDB({ 
      name: name.trim(), 
      phone: cleanPhone, 
      address: address || '' 
    });
    
    showNotification('✅ Profil saqlandi!', 'success');
    await renderProfile();
    return true;
  } catch (e) {
    showNotification('❌ Saqlashda xatolik', 'error');
    return false;
  }
}

saveProfileBtn.addEventListener('click', async () => {
  const name = editName.value.trim();
  const phone = editPhone.value.trim();
  
  const saved = await saveProfile(name, phone, '');
  
  if (saved) {
    saveProfileBtn.classList.add('saved');
    saveProfileBtn.innerHTML = '<span>✅</span><span>Saqlandi!</span>';
    setTimeout(() => {
      saveProfileBtn.classList.remove('saved');
      saveProfileBtn.innerHTML = '<span>💾</span><span>Saqlash</span>';
    }, 2000);
  }
});

modalSaveBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  
  const name = modalName.value.trim();
  const phone = modalPhone.value.trim();
  
  if (!name) {
    showNotification('Iltimos, ismingizni kiriting', 'error');
    modalName.focus();
    return;
  }
  
  if (!phone) {
    showNotification('Iltimos, telefon raqamni kiriting', 'error');
    modalPhone.focus();
    return;
  }
  
  const cleanPhone = phone.replace(/\\D/g, '');
  if (cleanPhone.length !== 9) {
    showNotification('Telefon raqam 9 ta raqamdan iborat bo\'lishi kerak', 'error');
    modalPhone.focus();
    return;
  }
  
  modalSaveBtn.disabled = true;
  const originalText = modalSaveBtn.textContent;
  modalSaveBtn.textContent = 'Saqlanmoqda...';
  
  try {
    const success = await saveProfile(name, cleanPhone);
    
    if (success) {
      firstTimeModal.classList.remove('show');
      showNotification('Xush kelibsiz, ' + name + '!', 'success');
    }
  } catch (error) {
    showNotification('Xatolik yuz berdi', 'error');
  } finally {
    modalSaveBtn.disabled = false;
    modalSaveBtn.textContent = originalText;
  }
});

logoutBtn.addEventListener('click', async () => {
  if (confirm('Haqiqatan ham akkauntdan chiqmoqchimisiz?')) {
    try {
      await deleteProfileDB();
      cart = [];
      saveCartLS();
      renderCart();
      renderProfile();
      
      showNotification('Akkauntdan chiqildi', 'success');
    } catch (error) {
      showNotification('Chiqishda xatolik', 'error');
    }
  }
});

[editPhone, modalPhone].forEach(input => {
  if (!input) return;
  input.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\\D/g, '');
    if (value.length > 9) value = value.slice(0, 9);
    e.target.value = value;
  });
});

// ==========================================
// URL PARAMS CHECK (BOT DAN TASDIQLANGANDA)
// ==========================================

function checkUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('order_id');
  const action = urlParams.get('action');
  
  if (orderId && action === 'upload_screenshot') {
    // Bot dan tasdiqlandi, screenshot yuklash oynasini ochish
    currentOrderId = orderId;
    
    // Modalni tozalash
    const existingModal = document.getElementById('paymentConfirmDialog');
    if (existingModal) existingModal.remove();
    
    showNotification('Bot dan tasdiqlandi! Skrinshot yuklang', 'success');
    
    setTimeout(() => {
      proceedToScreenshot();
    }, 500);
    
    // URL dan parametrlarni olib tashlash
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// ==========================================
// INIT
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 DOMContentLoaded - Synchronized Bot & WebApp Version');
  
  try {
    loadCartLS();
    renderCategories();
    renderMenu();
    renderCart();
    renderProfile();
    
    // URL parametrlarini tekshirish
    checkUrlParams();
  } catch (error) {
    console.error('Init xato:', error);
  }
});