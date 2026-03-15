// ==========================================
// BODRUM - Universal Web App (WebApp + Sayt)
// FAQAT POLLING TIZIMI - Payme callback O'CHIRILDI
// ==========================================

import { getMenuFromLocal, categories } from './menu.js';

// ==========================================
// GLOBAL VARIABLES
// ==========================================

let tg = null;
let isTelegramWebApp = false;

// Telegram WebApp tekshirish
if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
  tg = window.Telegram.WebApp;
  isTelegramWebApp = true;
  tg.expand();
  tg.ready();
  console.log('✅ Telegram WebApp detected');
} else {
  console.log('ℹ️ Regular browser mode (Sayt)');
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

// ⭐ POLLING VARIABLES - FAQAT POLLING!
let pollingInterval = null;
let currentOrderId = null;
let isPolling = false;
let pollingAttempts = 0;
const MAX_POLLING_ATTEMPTS = 180; // 15 daqiqa = 180 ta 5-soniyalik tekshiruv

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
// ⭐ FAQAT POLLING - Payme callback yo'q!
// ==========================================

function startPaymentPolling(orderId) {
  console.log('🔄 Polling boshlandi:', orderId);
  currentOrderId = orderId;
  isPolling = true;
  pollingAttempts = 0;
  
  // To'lov modalini ko'rsatish
  showPaymentPendingModal(orderId);
  
  // Har 5 soniyada tekshirish
  pollingInterval = setInterval(async () => {
    pollingAttempts++;
    console.log(`🔄 Polling tekshiruvi #${pollingAttempts}: ${orderId}`);
    
    if (pollingAttempts >= MAX_POLLING_ATTEMPTS) {
      stopPaymentPolling();
      showPaymentExpiredModal(orderId);
      return;
    }
    
    await checkPaymentStatus(orderId);
  }, 5000);
}

// ⭐ YANGI: To'lovni backend ga xabar qilish
async function notifyPaymentSuccess(orderId, transactionId) {
  try {
    console.log('📤 To\'lov muvaffaqiyatli - backend ga xabar yuborilmoqda:', { orderId, transactionId });
    
    const response = await fetch(`${SERVER_URL}/api/orders/${orderId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'paid',
        transactionId: transactionId || 'manual_' + Date.now()
      })
    });
    
    if (!response.ok) {
      throw new Error('Backend xatosi: ' + response.status);
    }
    
    const result = await response.json();
    console.log('✅ Backend javob:', result);
    return result;
    
  } catch (error) {
    console.error('❌ To\'lov xabarini yuborishda xato:', error);
    // Xatolik bo'lsa ham polling davom etadi
    return null;
  }
}

// ❌❌❌ OLIB TASHLANDI: Manual payment confirmation dialog
// Faqat avtomatik polling ishlatiladi

function stopPaymentPolling() {
  console.log('🛑 Polling to\'xtatildi');
  isPolling = false;
  
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  
  closePaymentPendingModal();
}

async function checkPaymentStatus(orderId) {
  try {
    // ⭐ FAQAT POLLING - Payme callback yo'q!
    // Backend dan to'lov statusini so'rash
    const response = await fetch(`${SERVER_URL}/api/orders/${orderId}/payment-status`);
    const result = await response.json();
    
    console.log('📊 To\'lov statusi:', result);
    
    if (result.paid) {
      // ✅ TO'LOV MUVAFFAQIYATLI
      stopPaymentPolling();
      
      // Muvaffaqiyat modalini ko'rsatish
      showPaymentSuccessModal(result);
      
      // Savatni tozalash
      cart = [];
      saveCartLS();
      renderCart();
      
      // Profilni yangilash
      if (isTelegramWebApp) {
        loadUserProfile();
      }
      
      return;
    }
    
    if (result.expired || result.cancelled) {
      // ❌ TO'LOV BEKOR QILINGAN YOKI MUDDATI TUGADI
      stopPaymentPolling();
      showPaymentExpiredModal(orderId);
      return;
    }
    
    // ⏳ Hali to'lanmagan - davom etish
    updatePaymentPendingStatus(pollingAttempts);
    
  } catch (error) {
    console.error('❌ Polling xatosi:', error);
  }
}

// ==========================================
// ⭐ TO'LOV MODALLARI
// ==========================================

function showPaymentPendingModal(orderId) {
  const existing = document.getElementById('paymentPendingModal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.id = 'paymentPendingModal';
  modal.className = 'modal-overlay show';
  modal.style.zIndex = '5000';
  modal.innerHTML = `
    <div class="modal-box payment-pending-modal" style="text-align: center; max-width: 400px;">
      <div class="payment-spinner" style="
        width: 80px;
        height: 80px;
        border: 4px solid rgba(255,215,0,0.2);
        border-top-color: #FFD700;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 24px;
      "></div>
      
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 12px; color: #fff;">
        ⏳ To'lov kutilmoqda
      </h2>
      
      <p style="color: #888; margin-bottom: 20px; font-size: 15px;">
        Buyurtma: <b style="color: #FFD700;">#${orderId.slice(-6)}</b>
      </p>
      
      <div class="payment-progress" style="
        background: rgba(255,255,255,0.1);
        height: 8px;
        border-radius: 4px;
        margin-bottom: 16px;
        overflow: hidden;
      ">
        <div id="paymentProgressBar" style="
          background: linear-gradient(90deg, #FFD700, #D4AF37);
          height: 100%;
          width: 0%;
          transition: width 0.3s ease;
          border-radius: 4px;
        "></div>
      </div>
      
      <p id="paymentStatusText" style="color: #888; font-size: 13px; margin-bottom: 20px;">
        Payme da to'lovni amalga oshiring...
      </p>
      
      <div class="payment-timer" style="
        background: rgba(255,215,0,0.1);
        padding: 12px 20px;
        border-radius: 12px;
        margin-bottom: 20px;
        border: 1px solid rgba(255,215,0,0.2);
      ">
        <span style="color: #FFD700; font-size: 14px; font-weight: 600;">
          ⏱️ Qolgan vaqt: <span id="paymentTimer">15:00</span>
        </span>
      </div>
      
      <button onclick="stopPaymentPolling()" style="
        background: transparent;
        color: #FF4757;
        border: 2px solid rgba(255,71,87,0.3);
        padding: 14px 24px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
      " onmouseover="this.style.background='rgba(255,71,87,0.1)'" 
      onmouseout="this.style.background='transparent'">
        ❌ Bekor qilish
      </button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  startPaymentTimer();
}

function startPaymentTimer() {
  let minutes = 15;
  let seconds = 0;
  
  const timerInterval = setInterval(() => {
    if (!isPolling) {
      clearInterval(timerInterval);
      return;
    }
    
    if (seconds === 0) {
      minutes--;
      seconds = 59;
    } else {
      seconds--;
    }
    
    const timerEl = document.getElementById('paymentTimer');
    if (timerEl) {
      timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    if (minutes === 0 && seconds === 0) {
      clearInterval(timerInterval);
    }
  }, 1000);
}

function updatePaymentPendingStatus(attempt) {
  const progress = Math.min((attempt / MAX_POLLING_ATTEMPTS) * 100, 100);
  const progressBar = document.getElementById('paymentProgressBar');
  const statusText = document.getElementById('paymentStatusText');
  
  if (progressBar) {
    progressBar.style.width = `${progress}%`;
  }
  
  if (statusText) {
    const dots = '.'.repeat((attempt % 3) + 1);
    statusText.textContent = `To'lov tekshirilmoqda${dots}`;
  }
}

function closePaymentPendingModal() {
  const modal = document.getElementById('paymentPendingModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 300);
  }
}

function showPaymentSuccessModal(result) {
  const order = result.order || {};
  
  const modal = document.createElement('div');
  modal.id = 'paymentSuccessModal';
  modal.className = 'modal-overlay show';
  modal.style.zIndex = '6000';
  modal.innerHTML = `
    <div class="modal-box payment-success-modal" style="text-align: center; max-width: 400px;">
      <div style="
        width: 100px;
        height: 100px;
        background: linear-gradient(135deg, #00D084, #00b06b);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 50px;
        margin: 0 auto 24px;
        animation: scaleIn 0.5s ease;
        box-shadow: 0 8px 32px rgba(0,208,132,0.3);
      ">
        ✅
      </div>
      
      <h2 style="font-size: 26px; font-weight: 700; margin-bottom: 12px; color: #00D084;">
        To'lov muvaffaqiyatli!
      </h2>
      
      <p style="color: #888; margin-bottom: 20px; font-size: 15px;">
        Buyurtmangiz avtomatik qabul qilindi
      </p>
      
      <div style="
        background: rgba(0,208,132,0.1);
        border: 1px solid rgba(0,208,132,0.2);
        border-radius: 16px;
        padding: 20px;
        margin-bottom: 24px;
      ">
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
          <span style="color: #888; font-size: 14px;">Buyurtma:</span>
          <span style="color: #FFD700; font-weight: 700; font-family: monospace;">
            #${order.order_id?.slice(-6) || '-----'}
          </span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
          <span style="color: #888; font-size: 14px;">Summa:</span>
          <span style="color: #FFD700; font-weight: 700;">
            ${parseInt(order.total || 0).toLocaleString()} so'm
          </span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #888; font-size: 14px;">Status:</span>
          <span style="color: #00D084; font-weight: 700;">
            ✅ Qabul qilindi
          </span>
        </div>
      </div>
      
      <button onclick="closePaymentSuccessModal(); switchTab('profile');" style="
        background: linear-gradient(135deg, #FFD700, #D4AF37);
        color: #000;
        border: none;
        padding: 18px 32px;
        border-radius: 14px;
        font-size: 16px;
        font-weight: 800;
        cursor: pointer;
        width: 100%;
        transition: all 0.3s ease;
        box-shadow: 0 6px 20px rgba(212,175,55,0.3);
      " onmouseover="this.style.transform='translateY(-2px)'" 
      onmouseout="this.style.transform='translateY(0)'">
        Buyurtmalarimni ko'rish →
      </button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  createConfetti();
}

window.closePaymentSuccessModal = function() {
  const modal = document.getElementById('paymentSuccessModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 300);
  }
};

function showPaymentExpiredModal(orderId) {
  const modal = document.createElement('div');
  modal.id = 'paymentExpiredModal';
  modal.className = 'modal-overlay show';
  modal.style.zIndex = '6000';
  modal.innerHTML = `
    <div class="modal-box payment-expired-modal" style="text-align: center; max-width: 400px;">
      <div style="
        width: 100px;
        height: 100px;
        background: rgba(255,71,87,0.2);
        border: 2px solid #FF4757;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 50px;
        margin: 0 auto 24px;
        animation: shake 0.5s ease;
      ">
        ⏰
      </div>
      
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 12px; color: #FF4757;">
        To'lov muddati tugadi
      </h2>
      
      <p style="color: #888; margin-bottom: 24px; font-size: 15px; line-height: 1.6;">
        15 daqiqa ichida to'lov amalga oshirilmadi.<br>
        Buyurtma bekor qilindi.
      </p>
      
      <button onclick="closePaymentExpiredModal(); switchTab('menu');" style="
        background: linear-gradient(135deg, #FFD700, #D4AF37);
        color: #000;
        border: none;
        padding: 18px 32px;
        border-radius: 14px;
        font-size: 16px;
        font-weight: 800;
        cursor: pointer;
        width: 100%;
        transition: all 0.3s ease;
        box-shadow: 0 6px 20px rgba(212,175,55,0.3);
      ">
        Qayta buyurtma berish
      </button>
    </div>
  `;
  
  document.body.appendChild(modal);
}

window.closePaymentExpiredModal = function() {
  const modal = document.getElementById('paymentExpiredModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 300);
  }
};

function createConfetti() {
  const colors = ['#FFD700', '#00D084', '#FF4757', '#FFA502', '#3498db'];
  
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.style.cssText = `
      position: fixed;
      width: 10px;
      height: 10px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      left: ${Math.random() * 100}vw;
      top: -10px;
      border-radius: 50%;
      z-index: 9999;
      animation: confetti-fall ${2 + Math.random() * 2}s linear forwards;
    `;
    document.body.appendChild(confetti);
    
    setTimeout(() => confetti.remove(), 4000);
  }
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

  if (isTelegramWebApp && tg.requestLocation) {
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

function generateUserId() {
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

function getUserId() {
  return generateUserId();
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

async function loadUserProfile() {
  console.log('🔍 Profil yuklanmoqda...');
  
  const savedName = getUserName();
  const savedPhone = getUserPhone();
  
  if (savedName && savedPhone) {
    console.log('✅ LocalStorage dan profil yuklandi');
    userProfile = {
      name: savedName,
      phone: savedPhone,
      user_id: getUserId()
    };
    renderProfile();
    loadUserOrders();
    return;
  }
  
  if (isTelegramWebApp) {
    try {
      const tgUser = tg.initDataUnsafe?.user;
      const tgId = tgUser?.id;

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

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Backend dan javob:', result);

      if (result.success && result.profile) {
        userProfile = result.profile;
        userOrders = result.orders || [];
        
        saveUserProfile(userProfile.name, userProfile.phone);
        renderProfile();
        renderOrdersList(userOrders);
      } else {
        showProfileNotFound();
      }
    } catch (error) {
      console.error('❌ Profil yuklash xatosi:', error);
      showProfileNotFound();
    }
  } else {
    console.log('ℹ️ Sayt rejimi - profil ixtiyoriy');
    showProfileNotFound();
  }
}

async function loadUserOrders() {
  try {
    const userId = getUserId();
    const response = await fetch(`${SERVER_URL}/api/user/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tgId: userId })
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.orders) {
        userOrders = result.orders;
        renderOrdersList(userOrders);
      }
    }
  } catch (error) {
    console.error('Buyurtmalarni yuklash xatosi:', error);
  }
}

function renderProfile() {
  if (!userProfile) {
    console.log('❌ renderProfile: userProfile null');
    return;
  }

  const name = userProfile.name || 'Foydalanuvchi';
  const phone = userProfile.phone || '';

  console.log('🎨 Profil renderlanmoqda:', { name, phone });

  if (profileAvatar) profileAvatar.textContent = getInitials(name);
  if (profileName) profileName.textContent = name;
  if (profilePhone) profilePhone.textContent = formatPhone(phone);
  if (profileSource) profileSource.textContent = isTelegramWebApp ? '🤖 Telegram orqali' : '🌐 Sayt orqali';

  if (displayName) displayName.textContent = name;
  if (displayPhone) displayPhone.textContent = formatPhone(phone);

  updateProfileStats();
  
  const updateBtn = document.getElementById('updatePhoneBtn');
  if (updateBtn) {
    updateBtn.style.display = 'block';
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
  console.log('⚠️ Profil topilmadi, ixtiyoriy input');

  if (profileAvatar) profileAvatar.textContent = '👤';
  if (profileName) profileName.textContent = 'Mehmon';
  if (profilePhone) profilePhone.textContent = '+998 __ _______';
  if (profileSource) profileSource.textContent = isTelegramWebApp ? '🤖 Telegram' : '🌐 Sayt';

  if (displayName) displayName.textContent = '---';
  if (displayPhone) displayPhone.textContent = '---';

  const updateBtn = document.getElementById('updatePhoneBtn');
  if (updateBtn) {
    updateBtn.style.display = 'block';
    updateBtn.textContent = '📱 Profil yaratish (ixtiyoriy)';
  }
}

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
      <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 12px; color: #fff;">Profil ma'lumotlari</h2>
      <p style="color: #888; margin-bottom: 24px; font-size: 14px;">Ixtiyoriy - buyurtma berish uchun majburiy emas</p>
      
      <div style="margin-bottom: 16px;">
        <input type="text" id="inputName" placeholder="Ismingiz" style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(212,175,55,0.3); border-radius: 12px; padding: 16px; color: white; font-size: 15px; margin-bottom: 12px;">
        <input type="tel" id="inputPhone" placeholder="Telefon (901234567)" style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(212,175,55,0.3); border-radius: 12px; padding: 16px; color: white; font-size: 15px;">
      </div>
      
      <button onclick="saveProfileFromInput()" style="width: 100%; background: linear-gradient(135deg, #FFD700, #D4AF37); color: #000; border: none; padding: 16px; border-radius: 12px; font-size: 16px; font-weight: 800; cursor: pointer; margin-bottom: 12px;">Saqlash</button>
      <button onclick="closeProfileInputModal()" style="width: 100%; background: transparent; color: #888; border: 2px solid rgba(255,255,255,0.1); padding: 14px; border-radius: 12px; font-size: 14px; cursor: pointer;">O'tkazib yuborish</button>
    </div>
  `;
  
  document.body.appendChild(modal);
};

window.saveProfileFromInput = function() {
  const nameInput = document.getElementById('inputName');
  const phoneInput = document.getElementById('inputPhone');
  
  const name = nameInput?.value?.trim();
  let phone = phoneInput?.value?.trim();
  
  if (!name && !phone) {
    closeProfileInputModal();
    return;
  }
  
  if (phone) {
    phone = phone.replace(/\D/g, '');
    if (phone.startsWith('998')) phone = phone.substring(3);
    if (phone.startsWith('+998')) phone = phone.substring(4);
    phone = phone.slice(-9);
  }
  
  const finalName = name || 'Mijoz';
  const finalPhone = phone || '000000000';
  
  saveUserProfile(finalName, finalPhone);
  closeProfileInputModal();
  showNotification('✅ Profil saqlandi!', 'success');
};

window.closeProfileInputModal = function() {
  const modal = document.getElementById('profileInputModal');
  if (modal) modal.remove();
};

window.requestContact = function() {
  if (isTelegramWebApp && tg.requestContact) {
    tg.requestContact((result) => {
      if (result) {
        const contact = tg.initDataUnsafe?.contact;
        if (contact) {
          let phone = contact.phone_number || '';
          phone = phone.replace(/\D/g, '');
          if (phone.startsWith('998')) phone = phone.substring(3);
          phone = phone.slice(-9);
          
          const name = contact.first_name || contact.name || 'Foydalanuvchi';
          saveUserProfile(name, phone);
          showNotification('✅ Telefon raqam yangilandi!', 'success');
        }
      } else {
        showProfileInputModal();
      }
    });
  } else {
    showProfileInputModal();
  }
};

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
// ⭐ FAQAT POLLING - Payme callback O'CHIRILDI
// ==========================================

document.getElementById('orderBtn').addEventListener('click', async () => {
  if (!cart.length) {
    showNotification('Savat bo\'sh!', 'error');
    return;
  }

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  if (!currentLocation) {
    showLocationRequestModal();
    return;
  }

  proceedToPayment(total);
});

async function proceedToPayment(total) {
  const orderId = 'ORD_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  const customerName = userProfile?.name || 'Mijoz';
  const customerPhone = userProfile?.phone || '000000000';
  const userId = getUserId();

  try {
    // 1. Buyurtmani serverga yuborish
    const orderData = {
      orderId: orderId,
      name: customerName,
      phone: customerPhone,
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
      tgId: isTelegramWebApp ? userId : null,
      initiated_from: isTelegramWebApp ? 'webapp' : 'website',
      source: isTelegramWebApp ? 'webapp' : 'website'
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

    // 2. Polling boshlash
    startPaymentPolling(orderId);

    // 3. Payme ni yangi oynada ochish
    const amountTiyin = Math.round(total * 100);
    const params = `m=${PAYME_MERCHANT_ID};ac.order_id=${orderId};a=${amountTiyin};cu=860`;
    const paramsB64 = btoa(params);
    const paymeUrl = `${PAYME_CHECKOUT_URL}/${paramsB64}`;

    console.log('💰 Payme URL:', paymeUrl);

    // ❌❌❌ OLIB TASHLANDI: Manual confirmation dialog
    // ⭐ FAQAT: Yangi oynada Payme ni ochish va polling bilan kuzatish
    if (isTelegramWebApp && tg?.openLink) {
      tg.openLink(paymeUrl, { try_instant_view: false });
    } else {
      window.open(paymeUrl, '_blank');
    }

    // 4. Polling davom etadi avtomatik ravishda
    // Foydalanuvchidan hech qanday qo'shimcha tasdiqlash so'ralmaydi

  } catch (error) {
    console.error('❌ Payment error:', error);
    stopPaymentPolling();
    showNotification('Xatolik: ' + error.message, 'error');
  }
}

// ==========================================
// INIT
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 DOMContentLoaded - BODRUM Universal WebApp');
  console.log('📱 Mode:', isTelegramWebApp ? 'Telegram WebApp' : 'Regular Website');
  console.log('⏰ FAQAT POLLING tizimi faollashdi - Payme callback yo\'q!');
  console.log('❌ Manual confirmation dialog O\'CHIRILDI');

  try {
    loadCartLS();
    renderCategories();
    renderMenu();
    renderCart();
    
    addStyles();
  } catch (error) {
    console.error('Init xato:', error);
  }
});

function addStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translate(-50%, -100%); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.8); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-10px); }
      75% { transform: translateX(10px); }
    }
    @keyframes confetti-fall {
      0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
      100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

window.addEventListener('beforeunload', () => {
  stopPaymentPolling();
});
