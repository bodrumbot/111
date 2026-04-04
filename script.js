// ==========================================
// BODRUM - SAYT VA TELEGRAM WEBAPP UCHUN UMUMIY
// ==========================================

import { 
  getMenuFromLocal, 
  categories, 
  setupCategorySync,
  setupMenuSync,
  fetchCategoriesFromServer,
  fetchMenuFromServer,
  startCategoryPolling 
} from './menu.js';
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

const SERVER_URL = 'https://backend1-production-75d1.up.railway.app';
const PAYME_MERCHANT_ID = '698d8268f7c89c2bb7cfc08e';
const PAYME_CHECKOUT_URL = 'https://checkout.payme.uz';

let menu = getMenuFromLocal();
let cart = [];
let currentLocation = null;
let activeCategory = 'all';
let searchQuery = '';
let currentFoodItem = null;
let userProfile = null;
let userOrders = [];
let menuSyncInterval = null;

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

const WORK_HOURS = {
  start: 11,      // 11:00
  end: 22,        // 22:00
  endMinutes: 30  // 22:30
};

/**
 * Hozirgi vaqt ish vaqtida ekanligini tekshiradi
 * @returns {boolean} - true = ish vaqtida, false = yopiq
 */
function isWorkingHours() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentTime = hours * 60 + minutes; // Minutlarga aylantirish
  
  const startTime = WORK_HOURS.start * 60;        // 11:00 = 660 minut
  const endTime = WORK_HOURS.end * 60 + WORK_HOURS.endMinutes; // 22:30 = 1350 minut
  
  return currentTime >= startTime && currentTime <= endTime;
}

/**
 * Ish vaqti xabarini formatlash
 * @returns {string} - Foydalanuvchi uchun xabar
 */
function getWorkingHoursMessage() {
  return `🕐 Restoran ish vaqti:\n\n⏰ 11:00 - 22:30\n\nHozir buyurtma berish mumkin emas. Iltimos, ish vaqtida qayta urinib ko'ring.`;
}

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
// TO'LOV JARAYONI - TO'G'RILANGAN
// ==========================================

async function startPaymentProcess() {
  try {
    // 1. AVVAL JOYLASHUVNI TEKSHIRISH
    if (!currentLocation) {
      showLocationRequestModal();
      return;
    }

    // 2. MIJOZ MA'LUMOTLARINI TEKSHIRISH
    const customerInfo = getCustomerInfo();
    if (!customerInfo.name || !customerInfo.phone) {
      showContactRequestModal();
      return;
    }

    // 3. SAVATNI TEKSHIRISH
    if (cart.length === 0) {
      showNotification('Savat bo\'sh', 'error');
      return;
    }

    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    
    // 4. ORDER ID YARATISH
    const orderId = 'ORD_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    
    // 5. TELEGRAM ID NI OLISH
    let tgId = localStorage.getItem('bodrum_tg_id');
    if (!tgId) {
      const uid = localStorage.getItem('bodrum_user_id');
      if (uid?.startsWith('tg_')) tgId = uid.replace('tg_', '');
    }

    // 6. QAYTISH URL YARATISH (payment-success.html)
    const returnUrl = window.location.origin + '/payment-success.html?order_id=' + orderId;

    // 7. BUYURTMANI SERVERGA YUBORISH
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
      location: currentLocation ? `${currentLocation.lat},${currentLocation.lng}` : null,
      tgId: tgId ? parseInt(tgId) : null,
      tg_id: tgId ? parseInt(tgId) : null,
      user_id: tgId ? parseInt(tgId) : null,
      source: isTelegramWebApp ? 'webapp' : 'website',
      status: 'pending_payment',
      paymentStatus: 'pending',
      paymentMethod: 'payme',
      returnUrl: returnUrl
    };

    console.log('📦 Buyurtma yaratilmoqda:', orderData);

    const response = await fetch(`${SERVER_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error('Server xatosi: ' + errorText);
    }

    const result = await response.json();
    console.log('✅ Buyurtma yaratildi:', result);

    // 8. PAYME TO'LOV URL YARATISH (qaytish URL bilan)
    const paymeUrl = generatePaymeUrl(orderId, total, 'uz', returnUrl);
    
    // 9. SAVATNI TOZALASH (oldindan)
    cart = [];
    saveCartLS();
    renderCart();
    
    // 10. ⭐⭐⭐ HECH QANDAY MODAL OCHILMAYDI - TO'G'RIDAN-TO'G'RI PAYME GA O'TISH
    openPaymeLink(paymeUrl);
    
    // 11. Xabar ko'rsatish (faqat bir marta)
    showNotification('💳 To\'lov sahifasiga o\'tilmoqda...', 'info');

  } catch (error) {
    console.error('❌ Xato:', error);
    showNotification('Xatolik: ' + error.message, 'error');
  }
}

function generatePaymeUrl(orderId, amount, lang = 'uz', returnUrl = null) {
  const amountInTiyin = Math.round(amount * 100);
  
  // Asosiy parametrlar (nuqtali vergul bilan ajratilgan)
  let params = `m=${PAYME_MERCHANT_ID};ac.order_id=${orderId};a=${amountInTiyin};l=${lang}`;
  
  // Qaytarish URL (agar berilgan bo'lsa) - MUHIM!
  if (returnUrl) {
    params += `;c=${encodeURIComponent(returnUrl)}`;
  }
  
  // Base64 ga kodlash
  const base64Params = btoa(params);
  const paymeUrl = `${PAYME_CHECKOUT_URL}/${base64Params}`;
  
  console.log('🔗 Payme URL:', paymeUrl);
  console.log('📦 Params:', params);
  
  return paymeUrl;
}

function openPaymeLink(paymeUrl) {
  console.log('🚀 Payme ochilmoqda:', paymeUrl);

  if (isTelegramWebApp) {
    // Telegram WebApp da
    if (tg.openLink) {
      try {
        tg.openLink(paymeUrl, { try_instant_view: false });
        return;
      } catch (e) {
        console.warn('tg.openLink xato:', e);
      }
    }
  }

  // Oddiy saytda - o'z oynada ochish
  window.location.href = paymeUrl;
}

// ==========================================
// PAYME INSTRUKSIYA MODALI
// ==========================================

function showPaymentInstruction(orderId, amount) {
  const modal = document.getElementById('paymeInstructionModal');
  if (!modal) {
    // Modal yo'q bo'lsa, oddiy confirm
    if (confirm(`To'lov uchun Payme ga o'tishni xohlaysizmi?\nSumma: ${amount.toLocaleString()} so'm`)) {
      // Payme allaqachon ochilgan
    }
    return;
  }

  // Modal ni ko'rsatish
  modal.classList.add('show');
  
  // Tushundim tugmasi
  const understandBtn = document.getElementById('understandBtn');
  if (understandBtn) {
    understandBtn.onclick = function() {
      closeInstructionModal();
      // Savatni tozalash va buyurtma tugaganini ko'rsatish
      cart = [];
      saveCartLS();
      renderCart();
      showNotification('💳 To\'lov sahifasiga o\'tildi. To\'lovdan so\'ng skrinshot yuklang!', 'info');
    };
  }
}

window.closeInstructionModal = function() {
  const modal = document.getElementById('paymeInstructionModal');
  if (modal) {
    modal.classList.remove('show');
  }
};

// ==========================================
// JOYLASHUV SO'RASH - TO'G'RILANGAN
// ==========================================

function showLocationRequestModal() {
  const modal = document.getElementById('locationRequestModal');
  if (modal) {
    modal.classList.add('show');
  } else {
    // Modal yo'q bo'lsa, avtomatik so'rash
    requestLocation();
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

  // ⭐⭐⭐ MUHIM: Joylashuv olgandan keyin, to'lov jarayonini davom ettirish
  setTimeout(() => {
    startPaymentProcess();
  }, 500);
}

function showManualLocationInput() {
  const address = prompt('Manzilingizni kiriting:');
  if (address && address.trim()) {
    currentLocation = { address: address.trim(), manual: true };
    closeLocationRequestModal();
    showNotification('Manzil saqlandi!', 'success');
    
    // ⭐⭐⭐ MUHIM: Manzil kiritilgandan keyin to'lovni davom ettirish
    setTimeout(() => {
      startPaymentProcess();
    }, 500);
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
          phone = phone.replace(/\D/g, '');
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
      <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 12px; color: #fff;">Ma\'lumotlaringiz</h2>
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

  phone = phone.replace(/\D/g, '');
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

  // ⭐⭐⭐ MUHIM: Profil saqlangandan keyin to'lovni davom ettirish
  setTimeout(() => {
    startPaymentProcess();
  }, 500);
};

window.closeProfileInputModal = function() {
  const modal = document.getElementById('profileInputModal');
  if (modal) modal.remove();
};

window.requestContact = function() {
  showContactRequestModal();
};

// ==========================================
// PROFILE FUNCTIONS - TO'G'RILANGAN
// ==========================================

async function loadUserProfile() {
  console.log('🔍 Profil yuklanmoqda...');

  const savedName = getUserName();
  const savedPhone = getUserPhone();

  // Agar localStorage da ma'lumot bo'lsa
  if (savedName && savedPhone) {
    userProfile = {
      name: savedName,
      phone: savedPhone,
      user_id: getUserId()
    };

    renderProfile();

    // Serverdan buyurtmalarni yuklash (faqat phone bo'lsa)
    if (savedPhone && savedPhone.length === 9) {
      await loadUserOrdersFromServer();
    }
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
    const phone = getUserPhone();
    
    console.log('🔍 Buyurtmalarni yuklash:', { userId, phone });

    if (!userId && (!phone || phone.length !== 9)) {
      console.log('⚠️ User ID yoki telefon yo\'q');
      userOrders = [];
      updateProfileStats();
      return;
    }

    const response = await fetch(`${SERVER_URL}/api/orders?userId=${encodeURIComponent(userId)}&phone=${encodeURIComponent(phone || '')}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.ok) {
      const result = await response.json();
      if (result && Array.isArray(result)) {
        userOrders = result.filter(order => {
          const orderUserId = order.tg_id || order.user_id || order.tgId;
          const orderPhone = order.phone;
          
          if (userId && orderUserId && orderUserId.toString() === userId.toString()) {
            return true;
          }
          if (phone && orderPhone && orderPhone.toString() === phone.toString()) {
            return true;
          }
          return false;
        });
        
        console.log('✅ Mijoz buyurtmalari yuklandi:', userOrders.length);
        updateProfileStats();
        renderOrdersList(userOrders);
      }
    } else {
      console.error('❌ API xatosi:', response.status);
      userOrders = [];
      updateProfileStats();
    }
  } catch (error) {
    console.error('Buyurtmalarni yuklash xatosi:', error);
    userOrders = [];
    updateProfileStats();
  }
}

// script.js da initMenuSync() funksiyasini almashtiring:

function initMenuSync() {
  // ⭐ 1. Dastlabki yuklash (bir marta)
  fetchMenuFromServer().then(serverMenu => {
    if (serverMenu && serverMenu.length > 0) {
      menu = serverMenu;
      renderMenu();
      renderCategories();
    }
  });
  
  // ⭐ 2. ESKI: Har 5 sekundda polling - O'CHIRILDI
  // menuSyncInterval = setInterval(async () => {
  //   await loadMenuFromServer();
  // }, 5000);
  
  // ⭐ 3. YANGI: Faqat localStorage o'zgarishlarini kuzatish
  const storageHandler = (e) => {
    if (e.key === 'bodrum_menu_update') {
      try {
        const data = JSON.parse(e.newValue);
        if (data?.menu && JSON.stringify(data.menu) !== JSON.stringify(menu)) {
          console.log('🔄 Menu yangilandi (boshqa tabdan)');
          menu = data.menu;
          renderMenu();
          renderCategories();
          showNotification('📋 Menu yangilandi!', 'info');
        }
      } catch (err) {}
    }
  };
  window.addEventListener('storage', storageHandler);
  
  // ⭐ 4. BroadcastChannel orqali real-time yangilanish
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel('bodrum_menu');
      channel.onmessage = (event) => {
        if (event.data?.type === 'MENU_UPDATED' && event.data.menu) {
          if (JSON.stringify(event.data.menu) !== JSON.stringify(menu)) {
            console.log('🔄 Menu yangilandi (BroadcastChannel)');
            menu = event.data.menu;
            renderMenu();
            renderCategories();
            showNotification('📋 Menu yangilandi!', 'info');
          }
        }
      };
    } catch (e) {}
  }
  
  // ⭐ 5. Sahifa ko'rinib qolganda tekshirish (faqat bir marta)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Faqat localStorage dan so'nggi yangilanishni tekshirish
      const lastUpdate = localStorage.getItem('bodrum_menu_update');
      if (lastUpdate) {
        try {
          const data = JSON.parse(lastUpdate);
          if (data?.menu && JSON.stringify(data.menu) !== JSON.stringify(menu)) {
            menu = data.menu;
            renderMenu();
            renderCategories();
          }
        } catch (e) {}
      }
    }
  });
}

async function loadMenuFromServer() {
  try {
    // ⭐ KESHNI O'CHIRISH - har safar yangi so'rov
    const response = await fetch(`${SERVER_URL}/api/menu?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    if (!response.ok) return;
    
    const data = await response.json();
    if (data.success && data.menu) {
      // ⭐ Har safar localStorage ga saqlash (keyingi safar uchun)
      saveMenuToLocal(data.menu);
      
      // Faqat o'zgarish bo'lsa yangilash
      if (JSON.stringify(data.menu) !== JSON.stringify(menu)) {
        console.log('🔄 Menu yangilandi (serverdan)');
        menu = data.menu;
        renderMenu();
        renderCategories();
        
        if (document.visibilityState === 'visible') {
          showNotification('📋 Menu yangilandi!', 'info');
        }
      }
    }
  } catch (error) {
    console.error('Server xatosi:', error);
    // Server ishlamasa localStorage dan olish
    menu = getMenuFromLocal();
    renderMenu();
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

  const profileSubtitle = document.getElementById('profileSubtitle');
  if (profileSubtitle) {
    profileSubtitle.textContent = isTelegramWebApp ? 'Telegram orqali avtomatik olingan' : 'Sayt orqali kiritilgan';
  }

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

  const profileSubtitle = document.getElementById('profileSubtitle');
  if (profileSubtitle) {
    profileSubtitle.textContent = 'Ma\'lumot kiritilmagan';
  }

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
        <div class="empty-orders-text">Hali buyurtmalar yo\'q</div>
        <button class="browse-menu-btn" onclick="switchTab('menu')">Menyuni ko\'rish</button>
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
          <span class="order-history-total">${(order.total || 0).toLocaleString()} so\'m</span>
          <span class="order-history-status ${statusClass}">${statusText}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// TAB NAVIGATION - FULL SCREEN VERSION
// ==========================================

function initTabs() {
  const tabButtons = document.querySelectorAll('.bottom-bar .tab');
  
  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabName = btn.getAttribute('data-tab');
      if (tabName) {
        switchTab(tabName);
      }
    });
  });

  // Dastlabki tekshiruv
  updateOrderButtonState();
  
  // Menu tab uchun sozlamalar
  const menuSection = document.getElementById('menu');
  if (menuSection) {
    menuSection.style.height = '100vh';
    menuSection.style.overflow = 'hidden';
    menuSection.style.display = 'flex';
    menuSection.style.flexDirection = 'column';
    
    const mainContent = menuSection.querySelector('main');
    if (mainContent) {
      mainContent.style.flex = '1';
      mainContent.style.overflowY = 'auto';
      mainContent.style.webkitOverflowScrolling = 'touch';
    }
  }
}

window.switchTab = function(tabName) {
  console.log('🔄 Tab o\'zgarishi:', tabName);
  
  // Barcha tablarni yashirish
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
    content.style.display = 'none';
    content.style.height = '';
    content.style.overflow = '';
  });
  
  // Barcha tugmalarni deaktiv qilish
  document.querySelectorAll('.bottom-bar .tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Tanlangan tabni faollashtirish
  const selectedTab = document.querySelector(`.bottom-bar .tab[data-tab="${tabName}"]`);
  const selectedContent = document.getElementById(tabName);
  
  if (selectedTab) {
    selectedTab.classList.add('active');
  }
  
  if (selectedContent) {
    selectedContent.style.display = 'block';
    selectedContent.classList.add('active');
    
    // Menu uchun maxsus sozlamalar
    if (tabName === 'menu') {
      selectedContent.style.display = 'flex';
      selectedContent.style.flexDirection = 'column';
      selectedContent.style.height = '100vh';
      selectedContent.style.overflow = 'hidden';
      
      const mainContent = selectedContent.querySelector('main');
      if (mainContent) {
        mainContent.style.flex = '1';
        mainContent.style.overflowY = 'auto';
      }
      
      // ⭐ Menu ga o'tganda ma'lumotlarni yangilash
      menu = getMenuFromLocal();
      renderCategories();
      renderMenu();
    } else {
      // Boshqa tablar uchun
      selectedContent.style.height = 'auto';
      selectedContent.style.overflow = 'visible';
      selectedContent.style.display = 'block';
      window.scrollTo(0, 0);
    }
  }
  
  // Savat uchun tugma holatini yangilash
  if (tabName === 'cart') {
    updateOrderButtonState();
  }
};

// Har bir bo'lim uchun maxsus sozlamalar
function setupTabContent(tabName) {
  switch(tabName) {
    case 'menu':
      // Menu uchun hech narsa kerak emas
      break;
      
    case 'cart':
      // Savatni yangilash
      renderCart();
      if (cart.length === 0) {
        showEmptyCartMessage();
      }
      break;
      
    case 'profile':
      // Profilni yuklash
      loadUserProfile();
      break;
  }
}

function showEmptyCartMessage() {
  const cartList = document.getElementById('cartList');
  if (cartList && cart.length === 0) {
    cartList.innerHTML = `
      <div class="empty-cart-fullscreen">
        <div class="empty-cart-icon">🛒</div>
        <h3>Savatingiz bo'sh</h3>
        <p>Mahsulot qo'shish uchun menyuga o'ting</p>
        <button class="go-to-menu-btn" onclick="switchTab('menu')">
          Menyuga o'tish
        </button>
      </div>
    `;
  }
}

function updateOrderButtonState() {
  const orderBtn = document.getElementById('orderBtn');
  if (!orderBtn) return;
  
  const working = isWorkingHours();
  const hasItems = cart.length > 0;
  
  if (!hasItems) {
    // Savat bo'sh
    orderBtn.disabled = true;
    orderBtn.textContent = 'Savat bo\'sh';
    orderBtn.style.background = 'linear-gradient(135deg, #666 0%, #444 100%)';
    orderBtn.style.color = '#888';
    orderBtn.style.opacity = '0.6';
    orderBtn.style.cursor = 'not-allowed';
    orderBtn.style.border = 'none';
    orderBtn.onclick = null;
    return;
  }
  
  // Savatda mahsulot bor
  if (working) {
    orderBtn.disabled = false;
    orderBtn.textContent = 'Buyurtma berish';
    orderBtn.style.background = 'linear-gradient(135deg, var(--success) 0%, var(--success-dark) 100%)';
    orderBtn.style.opacity = '1';
    orderBtn.style.cursor = 'pointer';
    orderBtn.onclick = startPaymentProcess;
  } else {
    orderBtn.disabled = true;
    orderBtn.textContent = '⏰ Restoran yopiq (11:00 - 22:30)';
    orderBtn.style.background = 'linear-gradient(135deg, #666 0%, #444 100%)';
    orderBtn.style.opacity = '0.7';
    orderBtn.style.cursor = 'not-allowed';
    orderBtn.onclick = null;
  }
}

// ==========================================
// MENU FUNCTIONS
// ==========================================

function renderCategories() {
  // "Barchasi" har doim birinchi bo'lishi kerak
  let html = `
    <button class="category-btn ${activeCategory === 'all' ? 'active' : ''}" data-cat="all">
      <span class="category-icon">🍽️</span>
      <span>Все</span>
    </button>
  `;
  
  // Qolgan kategoriyalarni qo'shish (all dan tashqari)
  html += categories
    .filter(cat => cat.id !== 'all')
    .map(cat => `
      <button class="category-btn ${cat.id === activeCategory ? 'active' : ''}" data-cat="${cat.id}">
        <span class="category-icon">${cat.icon || '🍽️'}</span>
        <span>${cat.name}</span>
      </button>
    `).join('');

  categoriesContainer.innerHTML = html;

  // Event listenerlarni o'rnatish
  categoriesContainer.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;
      renderMenu();
    });
  });
}

function loadCategories() {
  const saved = localStorage.getItem('bodrum_categories');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        categories.length = 0;
        categories.push(...parsed);
        console.log('✅ Kategoriyalar yuklandi:', parsed.length);
      }
    } catch (e) {
      console.error('Kategoriya yuklash xatosi:', e);
    }
  }
}

// Har 10 sekundda kategoriyalarni tekshirish (fallback)
setInterval(() => {
  const saved = localStorage.getItem('bodrum_categories');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (JSON.stringify(parsed) !== JSON.stringify(categories)) {
        console.log('🔄 Kategoriyalar yangilandi (interval):', parsed.length);
        categories.length = 0;
        categories.push(...parsed);
        renderCategories();
        renderMenu();
      }
    } catch (e) {
      // ignore
    }
  }
}, 10000);

function renderMenu() {
   
  let filtered = menu.filter(item => item.available !== false && item.available !== 'false');

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
      <div class="price">${item.price.toLocaleString()} so\'m</div>
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

// storage event ni tekshirish
window.addEventListener('storage', (e) => {
  console.log('📦 Storage event:', e.key, e.newValue ? 'Yangi data' : 'O\'chirildi');
  if (e.key === 'bodrum_menu_update') {
    console.log('✅ Menu update event qabul qilindi!');
  }
});

// Event listener for food modal add button
document.addEventListener('DOMContentLoaded', () => {
  const addBtn = document.getElementById('foodModalAddBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (currentFoodItem) {
        addToCart(currentFoodItem.id);
        closeFoodModal();
      }
    });
  }

  // Close modal on outside click
  if (foodModal) {
    foodModal.addEventListener('click', (e) => {
      if (e.target === foodModal) closeFoodModal();
    });
  }

  // Search input listener
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      searchQuery = e.target.value.trim();
      renderMenu();
    });
  }
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
  if (badge) {
    badge.style.transform = 'scale(1.3)';
    setTimeout(() => badge.style.transform = 'scale(1)', 200);
  }
};

// ==========================================
// SAVAT RENDER - TO'G'RILANGAN
// ==========================================

function renderCart() {
  const cartList = document.getElementById('cartList');
  const cartBadge = document.getElementById('cartBadge');
  const cartTotal = document.getElementById('cartTotal');
  const orderBtn = document.getElementById('orderBtn');

  if (!cartList) return;

  cartList.innerHTML = '';
  let total = 0;

  const working = isWorkingHours();

  if (cart.length === 0) {
    cartList.innerHTML = `
      <div class="empty-cart-fullscreen">
        <div class="empty-cart-icon">🛒</div>
        <h3>Savatingiz bo'sh</h3>
        <p>Mahsulot qo'shish uchun menyuga o'ting</p>
        <button class="go-to-menu-btn" onclick="switchTab('menu')">
          Menyuga o'tish
        </button>
      </div>
    `;
    if (cartBadge) cartBadge.textContent = '0';
    if (cartTotal) cartTotal.textContent = 'Umumiy: 0 so\'m';
    
    if (orderBtn) {
      orderBtn.disabled = true;
      orderBtn.textContent = 'Savat bo\'sh';
      orderBtn.style.background = 'linear-gradient(135deg, #666 0%, #444 100%)';
      orderBtn.style.color = '#888';
      orderBtn.style.opacity = '0.6';
      orderBtn.style.cursor = 'not-allowed';
      orderBtn.style.border = 'none';
      orderBtn.onclick = null;
    }
    return;
  }

  // Savatda mahsulotlar bor
  cart.forEach((item, idx) => {
    total += item.price * item.qty;
    
    cartList.insertAdjacentHTML('beforeend', `
      <div class="cart-item" style="animation: slideInRight 0.4s ease ${idx * 0.05}s backwards;">
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

  if (cartBadge) cartBadge.textContent = cart.reduce((s, i) => s + i.qty, 0);
  if (cartTotal) cartTotal.textContent = `Umumiy: ${total.toLocaleString()} so\'m`;

  if (orderBtn) {
    if (!working) {
      // ❌ Ish vaqti tashqarida - "Restoran yopiq"
      orderBtn.disabled = true;
      orderBtn.textContent = '⏰ Restoran yopiq (11:00 - 22:30)';
      orderBtn.style.background = 'linear-gradient(135deg, #444 0%, #333 100%)';
      orderBtn.style.color = '#888';
      orderBtn.style.opacity = '0.7';
      orderBtn.style.cursor = 'not-allowed';
      orderBtn.style.border = '1px solid #555';
      orderBtn.onclick = null;
    } else {
      // ✅ Ish vaqtida - "Buyurtma berish" (yashil)
      orderBtn.disabled = false;
      orderBtn.textContent = 'Buyurtma berish';
      orderBtn.style.background = 'linear-gradient(135deg, #00D084 0%, #00b06b 100%)';
      orderBtn.style.color = '#000';
      orderBtn.style.opacity = '1';
      orderBtn.style.cursor = 'pointer';
      orderBtn.style.border = 'none';
      orderBtn.onclick = startPaymentProcess;
    }
  }
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
// TAB NAVIGATION (eski usul - zaxira)
// ==========================================

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab, .tab-content').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    const tabContent = document.getElementById(btn.dataset.tab);
    if (tabContent) {
      tabContent.classList.add('active');
    }

    if (btn.dataset.tab === 'profile') {
      loadUserProfile();
    }
  });
});


document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    console.log('👁️ Sahifa ko\'rinib turibdi - yangilanmoqda...');
    
    // ⭐⭐⭐ YANGI: Menu ni ham yangilash
    menu = getMenuFromLocal();
    
    // Kategoriyalarni qayta yuklash
    fetchCategoriesFromServer().then(cats => {
      if (cats) {
        categories.length = 0;
        categories.push(...cats);
        renderCategories();
        renderMenu();
      }
    });
  }
});

// ==========================================
// INIT
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 DOMContentLoaded - BODRUM');
  
  try {
    // User ID sozlamalari...
    if (isTelegramWebApp && tg.initDataUnsafe?.user?.id) {
      const tgUser = tg.initDataUnsafe.user;
      const tgId = tgUser.id.toString();
      localStorage.setItem('bodrum_user_id', 'tg_' + tgId);
      localStorage.setItem('bodrum_tg_id', tgId);
      
      if (!localStorage.getItem('bodrum_user_name') && tgUser.first_name) {
        const fullName = tgUser.first_name + (tgUser.last_name ? ' ' + tgUser.last_name : '');
        localStorage.setItem('bodrum_user_name', fullName);
      }
    } else {
      let userId = localStorage.getItem('bodrum_user_id');
      if (!userId) {
        userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('bodrum_user_id', userId);
      }
    }

    // ⭐ Menu va kategoriyalarni yuklash
    loadCartLS();
    
    // Avval serverdan urinib ko'rish, bo'lmasa localdan
    const serverCategories = await fetchCategoriesFromServer();
    if (serverCategories) {
      categories.length = 0;
      categories.push(...serverCategories);
    }
    
    menu = getMenuFromLocal();
    
    renderCategories();
    renderMenu();
    renderCart();
    loadUserProfile();
    initTabs();
    
    // Kategoriya sync
    setupCategorySync((newCategories) => {
      if (!newCategories || !Array.isArray(newCategories)) {
        console.log('⚠️ Mijoz: Noto\'g\'ri kategoriya data');
        return;
      }
      console.log('📢 Mijoz: Kategoriyalar yangilandi:', newCategories.length);
      categories.length = 0;
      categories.push(...newCategories);
      renderCategories();
      renderMenu();
    });

    // Polling (har 10 sekundda)
    if (typeof startCategoryPolling === 'function') {
      const stopPolling = startCategoryPolling((newCategories) => {
        console.log('📢 Serverdan kategoriyalar:', newCategories.length);
        categories.length = 0;
        categories.push(...newCategories);
        renderCategories();
        renderMenu();
      });
      
      window.addEventListener('beforeunload', () => {
        stopPolling();
      });
    }

    // Telegram MainButton
    if (isTelegramWebApp && tg.MainButton) {
      tg.MainButton.setText('🛒 Buyurtma berish');
      tg.MainButton.onClick(() => {
        startPaymentProcess();
      });
      
      setInterval(() => {
        if (isWorkingHours()) {
          tg.MainButton.show();
        } else {
          tg.MainButton.hide();
        }
      }, 60000);
    }

  } catch (error) {
    console.error('❌ Init xato:', error);
  }

  initMenuSync();

});