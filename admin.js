import { 
  getMenuFromLocal, 
  saveMenuToLocal, 
  getCategoriesFromLocal, 
  saveCategoriesToLocal,
  categories as defaultCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  setupCategorySync,
  setupMenuSync,
  fetchMenuFromServer,
  fetchCategoriesFromServer,
  notifyCategoryUpdate,
  notifyMenuUpdate,
  saveCategoriesToServer, 
} from './menu.js';

const SERVER_URL = 'https://backend1-production-75d1.up.railway.app';

// ==========================================
// GLOBAL VARIABLES
// ==========================================

let currentOrderKey = null;
let orders = [];
let customers = [];
let chartInstance = null;
let lastCheckTime = null;
let pollingInterval = null;
let isPolling = false;

let menuItems = [];
let categories = [];
let currentEditingFoodId = null;
let currentImageBase64 = null;
let editingCategoryId = null;
let lastSyncTime = 0;
let currentPeriod = 'day';
let statsChart = null;

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function getUserId() {
  if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
    return 'tg_' + window.Telegram.WebApp.initDataUnsafe.user.id;
  }
  
  let userId = localStorage.getItem('bodrum_user_id');
  if (!userId) {
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('bodrum_user_id', userId);
  }
  return userId;
}

function showBackButton() {
  if (window.Telegram?.WebApp?.BackButton && 
      window.Telegram.WebApp.isVersionAtLeast('6.1')) {
    window.Telegram.WebApp.BackButton.show();
  }
}

function hideBackButton() {
  if (window.Telegram?.WebApp?.BackButton && 
      window.Telegram.WebApp.isVersionAtLeast('6.1')) {
    window.Telegram.WebApp.BackButton.hide();
  }
}

async function syncMenuToServer(menuData) {
  try {
    saveMenuToLocal(menuData);
    
    const response = await fetch(`${SERVER_URL}/api/menu`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menu: menuData, timestamp: Date.now() })
    });
    
    if (!response.ok) {
      console.warn('⚠️ Server xatosi, faqat localStorage ishlatiladi');
      notifyMenuUpdate(menuData);
      return false;
    }
    
    const data = await response.json();
    
    if (data.success) {
      notifyMenuUpdate(menuData);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Serverga menu yuborish xatosi:', error);
    notifyMenuUpdate(menuData);
    return false;
  }
}

// ==========================================
// INIT
// ==========================================

function init() {
  console.log('🚀 Admin panel init');
  
  loadMenuData();
  
  setupMenuSync((newMenu) => {
    if (newMenu && Array.isArray(newMenu)) {
      console.log('📢 Admin: Menu yangilandi:', newMenu.length);
      menuItems = newMenu;
      renderMenuGrid();
    }
  });
  
  setupCategorySync((newCategories) => {
    if (newCategories && Array.isArray(newCategories)) {
      console.log('📢 Admin: Kategoriyalar yangilandi:', newCategories.length);
      categories = newCategories;
      renderMenuCategories();
      renderMenuGrid();
    }
  });
  
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.expand();
    tg.ready();
  }
  
  startPolling();
  loadCustomers();
}

function loadMenuData() {
  menuItems = getMenuFromLocal();
  categories = getCategoriesFromLocal();
  
  if (!categories || categories.length === 0) {
    categories = defaultCategories;
    saveCategoriesToLocal(categories);
  }
  
  console.log('📋 Menu loaded (local):', menuItems.length, 'items');
  console.log('📁 Categories (local):', categories.length);
  
  renderMenuCategories();
  renderMenuGrid();
}

// ==========================================
// IMAGE HANDLING - URL & FILE
// ==========================================


// Faqat URL preview funksiyasi qoldiriladi:
window.previewImageUrl = function(url) {
  const previewContainer = document.getElementById('imagePreviewContainer');
  const previewImg = document.getElementById('imagePreview');
  
  if (url && url.trim()) {
    previewImg.src = url;
    previewImg.onerror = function() {
      this.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%231f1f1f" width="100" height="100"/><text fill="%23555" x="50%" y="50%" text-anchor="middle">Xato URL</text></svg>';
    };
    previewContainer.style.display = 'block';
  } else {
    previewContainer.style.display = 'none';
  }
};

// openAddFoodModal - soddalashtirish:
window.openAddFoodModal = function() {
  currentEditingFoodId = null;
  
  document.getElementById('foodModalTitle').textContent = '➕ Yangi taom qo\'shish';
  document.getElementById('foodForm').reset();
  document.getElementById('foodImageUrl').value = '';
  document.getElementById('imagePreviewContainer').style.display = 'none';
  
  populateCategorySelect();
  
  const modal = document.getElementById('foodModal');
  modal.classList.add('show');
  
  showBackButton();
};



// ==========================================
// EMOJI PICKER
// ==========================================

window.toggleEmojiPicker = function() {
  const grid = document.getElementById('quickEmojiGrid');
  if (grid) {
    grid.classList.toggle('show');
  }
};

window.selectEmoji = function(emoji) {
  document.getElementById('selectedEmoji').textContent = emoji;
  document.getElementById('categoryIconInput').value = emoji;
  document.getElementById('emojiInput').value = emoji;
  
  const grid = document.getElementById('quickEmojiGrid');
  if (grid) {
    grid.classList.remove('show');
  }
};

window.updateEmojiFromInput = function(value) {
  const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{200D}]|[\u{20E3}]|[\u{FE0F}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2300}-\u{23FF}]/gu;
  
  const emojis = value.match(emojiRegex);
  if (emojis && emojis.length > 0) {
    const firstEmoji = emojis[0];
    document.getElementById('selectedEmoji').textContent = firstEmoji;
    document.getElementById('categoryIconInput').value = firstEmoji;
  }
};

// ==========================================
// CATEGORY MANAGEMENT
// ==========================================

window.openAddCategoryModal = function() {
  editingCategoryId = null;
  document.getElementById('categoryModalTitle').textContent = '📁 Yangi kategoriya';
  document.getElementById('categoryForm').reset();
  document.getElementById('selectedEmoji').textContent = '🍽️';
  document.getElementById('categoryIconInput').value = '🍽️';
  document.getElementById('emojiInput').value = '';
  
  const grid = document.getElementById('quickEmojiGrid');
  if (grid) {
    grid.classList.remove('show');
  }
  
  const modal = document.getElementById('categoryModal');
  modal.classList.add('show');
  
  showBackButton();
};

window.openEditCategoryModal = function(id) {
  const cat = categories.find(c => c.id === id);
  if (!cat) return;
  
  editingCategoryId = id;
  document.getElementById('categoryModalTitle').textContent = '✏️ Kategoriyani tahrirlash';
  document.getElementById('categoryName').value = cat.name;
  
  const emoji = cat.icon || '🍽️';
  document.getElementById('selectedEmoji').textContent = emoji;
  document.getElementById('categoryIconInput').value = emoji;
  document.getElementById('emojiInput').value = emoji;
  
  const modal = document.getElementById('categoryModal');
  modal.classList.add('show');
  
  showBackButton();
};

window.saveCategory = async function() {
  try {
    const name = document.getElementById('categoryName').value.trim();
    const icon = document.getElementById('categoryIconInput').value.trim() || '🍽️';
    
    if (!name) {
      showToast('❌ Kategoriya nomi kiritilmagan!', 'error');
      return;
    }
    
    const newId = editingCategoryId || name.toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    
    const newCategory = {
      id: newId,
      name,
      icon,
      sortOrder: editingCategoryId ? undefined : categories.length,
      updatedAt: new Date().toISOString()
    };
    
    if (editingCategoryId) {
      const index = categories.findIndex(c => c.id === editingCategoryId);
      if (index !== -1) {
        categories[index] = { ...categories[index], ...newCategory };
      }
    } else {
      categories.push(newCategory);
    }
    
    await saveCategoriesToServer(categories);
    
    showToast('✅ Kategoriya saqlandi!', 'success');
    closeCategoryModal();
    
    renderMenuCategories();
    renderMenuGrid();
    
  } catch (error) {
    console.error('Xato:', error);
    showToast('❌ ' + error.message, 'error');
  }
};

window.deleteCategoryConfirm = async function(id) {
  const cat = categories.find(c => c.id === id);
  if (!cat) return;
  
  if (confirm(`⚠️ "${cat.name}" kategoriyasini o'chirishni xohlaysizmi?\n\nDiqqat: Bu kategoriyada mahsulotlar bo'lsa, o'chirish mumkin emas!`)) {
    try {
      const newCategories = deleteCategory(id);
      
      categories = newCategories;
      renderMenuCategories();
      renderMenuGrid();
      
      showToast('🗑️ Kategoriya o\'chirildi', 'success');
      
      try {
        await saveCategoriesToServer(newCategories);
      } catch (serverError) {
        console.warn('⚠️ Serverga yuborishda xato:', serverError);
      }
      
    } catch (error) {
      showToast('❌ ' + error.message, 'error');
    }
  }
};

window.closeCategoryModal = function() {
  const modal = document.getElementById('categoryModal');
  const content = modal.querySelector('.modal-content');
  
  hideBackButton();
  
  content.style.animation = 'slideDown 0.3s ease forwards';
  
  setTimeout(() => {
    modal.classList.remove('show');
    content.style.animation = '';
    editingCategoryId = null;
  }, 300);
};

// ==========================================
// MENU RENDER
// ==========================================

let currentMenuFilter = 'all';
let currentMenuSearch = '';

function renderMenuCategories() {
  const container = document.getElementById('menuCategoryPills');
  if (!container) return;
  
  const sortedCats = [...categories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  
  let html = `
    <button class="pill ${currentMenuFilter === 'all' ? 'active' : ''}" 
            data-cat="all" 
            onclick="filterMenuCategory('all')">
      🍽 Все
    </button>
  `;
  
  sortedCats.forEach((cat) => {
    if (cat.id === 'all') return;
    
    const isActive = currentMenuFilter === cat.id;
    
    html += `
      <button class="pill ${isActive ? 'active' : ''}" 
              data-cat="${cat.id}" 
              onclick="filterMenuCategory('${cat.id}')">
        ${cat.icon || '🍽️'} ${cat.name}
        <span class="cat-actions" onclick="event.stopPropagation()">
          <button class="cat-edit" onclick="openEditCategoryModal('${cat.id}')" title="Tahrirlash">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="cat-delete" onclick="deleteCategoryConfirm('${cat.id}')" title="O'chirish">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </span>
      </button>
    `;
  });
  
  html += `
    <button class="pill add-category" onclick="openAddCategoryModal()">
      ➕ Yangi kategoriya
    </button>
  `;
  
  container.innerHTML = html;
}

window.filterMenuCategory = function(catId) {
  currentMenuFilter = catId;
  renderMenuCategories();
  renderMenuGrid();
};

window.searchMenu = function() {
  const input = document.getElementById('menuSearchInput');
  currentMenuSearch = input ? input.value.toLowerCase() : '';
  renderMenuGrid();
};

function renderMenuGrid() {
  const grid = document.getElementById('menuGrid');
  if (!grid) return;
  
  let filtered = menuItems.filter(item => {
    if (currentMenuFilter !== 'all' && item.category !== currentMenuFilter) {
      return false;
    }
    
    if (currentMenuSearch) {
      const searchLower = currentMenuSearch;
      if (!item.name.toLowerCase().includes(searchLower) && 
          !item.description.toLowerCase().includes(searchLower)) {
        return false;
      }
    }
    
    return true;
  });
  
  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <p>Mahsulotlar topilmadi</p>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = filtered.map((item, index) => createFoodCard(item, index)).join('');
}

function createFoodCard(item, index) {
  const isAvailable = item.available !== false;
  
  return `
    <div class="food-card ${!isAvailable ? 'stopped' : ''}" 
         data-id="${item.id}" 
         style="animation: slideIn 0.4s ease ${index * 0.05}s backwards;">
      
      <div class="food-image-wrapper" style="position: relative;">
        <img src="${item.image}" 
             alt="${item.name}" 
             loading="lazy"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect width=%22100%22 height=%22100%22 fill=%22%231f1f1f%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 fill=%22%23555%22>Rasm yo\'q</text></svg>'">
        
        <div class="food-actions" style="position: absolute; top: 8px; left: 8px; display: flex; gap: 6px; z-index: 20;">
          <button class="action-btn edit" onclick="openEditFoodModal(${item.id})" title="Tahrirlash">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="action-btn ${isAvailable ? 'stop' : 'resume'}" onclick="toggleFoodAvailability(${item.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${isAvailable 
                ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
                : '<polygon points="5 3 19 12 5 21 5 3"/>'
              }
            </svg>
          </button>
          <button class="action-btn delete" onclick="deleteFoodItem(${item.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="food-info" style="padding: 12px;">
        <div class="food-name" style="font-size: 14px; font-weight: 600; margin-bottom: 4px; color: var(--text);">${item.name}</div>
        <div class="food-price" style="font-size: 15px; font-weight: 800; background: linear-gradient(135deg, #FFD700 0%, #FFE55C 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${item.price.toLocaleString()} so'm</div>
        <div class="food-category" style="font-size: 11px; color: #888; margin-top: 2px;">${getCategoryName(item.category)}</div>
      </div>
      
    </div>
  `;
}

function getCategoryName(catId) {
  const cat = categories.find(c => c.id === catId);
  return cat ? cat.name : catId;
}

// ==========================================
// FOOD CRUD
// ==========================================



window.openEditFoodModal = function(id) {
  const item = menuItems.find(m => m.id === id);
  if (!item) return;
  
  currentEditingFoodId = id;
  
  document.getElementById('foodModalTitle').textContent = '✏️ Mahsulotni tahrirlash';
  document.getElementById('foodName').value = item.name;
  document.getElementById('foodPrice').value = item.price;
  document.getElementById('foodDescription').value = item.description || '';
  document.getElementById('foodAvailable').checked = item.available !== false;
  
  populateCategorySelect(item.category);
  
  // Faqat URL ko'rsatish
  document.getElementById('foodImageUrl').value = item.image || '';
  previewImageUrl(item.image);
  
  const modal = document.getElementById('foodModal');
  modal.classList.add('show');
  
  showBackButton();
};

function populateCategorySelect(selectedCat = '') {
  const select = document.getElementById('foodCategory');
  select.innerHTML = '<option value="">Kategoriya tanlang</option>';
  
  const sortedCats = [...categories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  
  sortedCats.forEach(cat => {
    if (cat.id === 'all') return;
    const selected = cat.id === selectedCat ? 'selected' : '';
    select.innerHTML += `<option value="${cat.id}" ${selected}>${cat.icon || '🍽️'} ${cat.name}</option>`;
  });
}

window.saveFood = async function() {
  const name = document.getElementById('foodName').value.trim();
  const price = parseInt(document.getElementById('foodPrice').value);
  const category = document.getElementById('foodCategory').value;
  const description = document.getElementById('foodDescription').value.trim();
  const available = document.getElementById('foodAvailable').checked;
  const imageUrl = document.getElementById('foodImageUrl').value.trim();
  
  if (!name || !price || !category) {
    showToast('❌ Iltimos, barcha maydonlarni to\'ldiring');
    return;
  }
  
  if (!imageUrl) {
    showToast('❌ Rasm URL kiriting');
    return;
  }

  if (currentEditingFoodId) {
    const index = menuItems.findIndex(m => m.id === currentEditingFoodId);
    if (index !== -1) {
      menuItems[index] = {
        ...menuItems[index],
        name,
        price,
        category,
        description,
        available,
        image: imageUrl,
        updatedAt: new Date().toISOString(),
        updatedBy: getUserId()
      };
    }
  } else {
    const newId = Math.max(...menuItems.map(m => m.id), 0) + 1;
    const newItem = {
      id: newId,
      name,
      price,
      category,
      description,
      available,
      image: imageUrl,
      createdAt: new Date().toISOString(),
      createdBy: getUserId()
    };
    menuItems.push(newItem);
  }
  
  const saved = await syncMenuToServer(menuItems);
  
  if (saved) {
    showToast('✅ Saqlandi!', 'success');
  } else {
    showToast('✅ Mahalliy saqlandi', 'warning');
  }
  
  renderMenuGrid();
  closeFoodModal();
};

window.toggleFoodAvailability = async function(id) {
  const index = menuItems.findIndex(m => m.id === id);
  if (index === -1) return;
  
  const currentStatus = menuItems[index].available !== false;
  menuItems[index].available = !currentStatus;
  menuItems[index].updatedAt = new Date().toISOString();
  
  await syncMenuToServer(menuItems);
  
  renderMenuGrid();
  
  const action = !currentStatus ? 'ishga tushdi' : 'to\'xtadi';
  showToast(`${menuItems[index].name} ${action}`);
};

window.deleteFoodItem = async function(id) {
  const item = menuItems.find(m => m.id === id);
  if (!item) return;
  
  if (confirm(`⚠️ "${item.name}" ni o'chirishni xohlaysizmi?`)) {
    menuItems = menuItems.filter(m => m.id !== id);
    
    await syncMenuToServer(menuItems);
    
    renderMenuGrid();
    showToast('🗑️ O\'chirildi', 'success');
  }
};

window.closeFoodModal = function() {
  const modal = document.getElementById('foodModal');
  const content = modal.querySelector('.modal-content');
  
  hideBackButton();
  
  content.style.animation = 'slideDown 0.3s ease forwards';
  
  setTimeout(() => {
    modal.classList.remove('show');
    content.style.animation = '';
    currentEditingFoodId = null;
    currentImageBase64 = null;
  }, 300);
};

// ==========================================
// ORDERS MANAGEMENT
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
    
    newOrders.forEach(order => {
      const exists = orders.find(o => o.orderId === order.orderId || o.order_id === order.order_id);
      if (!exists) {
        playNotificationSound();
        showToast(`🛎️ Yangi buyurtma!\n${order.name} - ${order.total?.toLocaleString()} so'm`);
      }
    });
    
  } catch (error) {
    console.error('❌ Polling xatosi:', error);
  }
}

async function loadOrders() {
  try {
    const response = await fetch(`${SERVER_URL}/api/orders`);
    const data = await response.json();
    
    orders = data.map(order => ({
      firebaseKey: order.orderId || order.order_id,
      ...order
    })).sort((a, b) => {
      const dateA = new Date(a.createdAt || a.created_at || 0);
      const dateB = new Date(b.createdAt || b.created_at || 0);
      return dateB - dateA;
    });
    
    renderOrders();
    loadCustomers();
    
  } catch (error) {
    console.error('❌ Buyurtmalarni yuklash xatosi:', error);
  }
}

function createOrderCard(order, index) {
  const date = new Date(order.createdAt || order.created_at || Date.now());
  const time = date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' });
  
  const realStatus = order.status || order.payment_status || 'unknown';
  
  let itemsText = '';
  if (order.items && Array.isArray(order.items)) {
    itemsText = order.items.map(i => `${i.name} x${i.qty}`).join(', ');
  } else if (typeof order.items === 'string') {
    try {
      const parsed = JSON.parse(order.items);
      itemsText = parsed.map(i => `${i.name} x${i.qty}`).join(', ');
    } catch (e) {
      itemsText = order.items;
    }
  }
  
  let statusColor, statusBadge, cardClass;
  switch(realStatus) {
    case 'pending':
    case 'pending_payment':
      statusColor = '#FFA502';
      statusBadge = '⏳ Kutilmoqda';
      cardClass = 'pending';
      break;
    case 'accepted':
    case 'confirmed':
    case 'paid':
      statusColor = '#00D084';
      statusBadge = '✅ Qabul qilingan';
      cardClass = 'accepted';
      break;
    case 'rejected':
      statusColor = '#FF4757';
      statusBadge = '❌ Bekor qilingan';
      cardClass = 'rejected';
      break;
    default:
      statusColor = '#888';
      statusBadge = '❓ Noma`lum';
      cardClass = '';
  }
  
  return `
    <div class="order-card ${cardClass}" data-id="${order.firebaseKey}" data-status="${realStatus}" 
         style="animation: slideIn 0.4s ease ${index * 0.05}s backwards; border-left: 4px solid ${statusColor};">
      <div class="order-header">
        <span class="order-id">#${(order.order_id || order.orderId || 'N/A').slice(-6)}</span>
        <span class="order-time">${dateStr} ${time}</span>
      </div>
      <div class="order-customer">${order.name || "Noma\\'lum"}</div>
      <div class="order-phone">+998 ${order.phone || '---'}</div>
      <div class="order-items-preview">${itemsText}</div>
      <div class="order-footer">
        <span class="order-total">${(order.total || 0).toLocaleString()} so'm</span>
        <span class="order-status" style="background: ${statusColor}20; color: ${statusColor}; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 700;">
          ${statusBadge}
        </span>
      </div>
    </div>
  `;
}

window.openOrderModal = async function(orderId) {
  const order = orders.find(o => o.firebaseKey === orderId);
  if (!order) return;
  
  currentOrderKey = orderId;
  const realStatus = order.status || order.payment_status || 'unknown';
  
  document.getElementById('modalOrderId').textContent = (order.order_id || order.orderId || 'N/A').slice(-6);
  document.getElementById('modalCustomer').textContent = order.name || "Noma\\'lum";
  document.getElementById('modalPhone').textContent = '+998 ' + (order.phone || '---');
  document.getElementById('modalTotal').textContent = (order.total || 0).toLocaleString() + ' so\'m';
  
  const paymentMethod = order.paymentMethod || 'payme';
  document.getElementById('modalPayment').textContent = paymentMethod.toUpperCase();
  
  let items = order.items || [];
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch (e) {
      items = [];
    }
  }
  
  document.getElementById('modalItems').innerHTML = items.map(i => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-name">${i.name}</div>
        <div class="item-qty">${i.qty} x ${(i.price || 0).toLocaleString()} so'm</div>
      </div>
      <div class="item-price">${(i.qty * (i.price || 0)).toLocaleString()} so'm</div>
    </div>
  `).join('');
  
  const actionsDiv = document.getElementById('modalActions');
  if (actionsDiv) {
    let buttonsHtml = '';
    
    if (realStatus === 'pending' || realStatus === 'pending_payment') {
      buttonsHtml = `
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <button onclick="updateOrderStatus('${orderId}', 'accept')" style="flex: 1; background: linear-gradient(135deg, #00D084, #00b06b); color: #000; border: none; padding: 16px; border-radius: 12px; font-weight: 800; cursor: pointer;">
            ✅ QABUL QILISH
          </button>
          <button onclick="updateOrderStatus('${orderId}', 'reject')" style="flex: 1; background: transparent; color: #FF4757; border: 2px solid #FF4757; padding: 16px; border-radius: 12px; font-weight: 800; cursor: pointer;">
            ❌ BEKOR QILISH
          </button>
        </div>
      `;
    } else {
      buttonsHtml = `
        <button onclick="closeModal()" style="width: 100%; background: rgba(255,255,255,0.1); color: #fff; border: none; padding: 16px; border-radius: 12px; font-weight: 700; cursor: pointer;">
          🔙 YOPISH
        </button>
      `;
    }
    
    actionsDiv.innerHTML = buttonsHtml;
    actionsDiv.style.display = 'block';
  }
  
  const modal = document.getElementById('orderModal');
  modal.classList.add('show');
  
  showBackButton();
};

window.updateOrderStatus = async function(orderId, action) {
  try {
    const response = await fetch(`${SERVER_URL}/api/orders/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: action === 'accept' ? 'accepted' : 'rejected' })
    });
    
    if (response.ok) {
      showToast(`✅ Buyurtma ${action === 'accept' ? 'qabul qilindi' : 'bekor qilindi'}!`);
      closeModal();
      await loadOrders();
    } else {
      showToast('❌ Xatolik yuz berdi');
    }
  } catch (error) {
    console.error('Status yangilash xatosi:', error);
    showToast('❌ Xatolik yuz berdi');
  }
};

window.closeModal = function() {
  const modal = document.getElementById('orderModal');
  const content = modal.querySelector('.modal-content');
  
  hideBackButton();
  
  content.style.animation = 'slideDown 0.3s ease forwards';
  
  setTimeout(() => {
    modal.classList.remove('show');
    currentOrderKey = null;
    content.style.animation = '';
  }, 300);
};

function renderOrders() {
  const container = document.getElementById('ordersListContainer');
  if (!container) return;
  
  const acceptedOrders = orders.filter(o => {
    const status = o.status || o.payment_status;
    return status === 'accepted' || status === 'confirmed' || status === 'paid';
  });
  
  let html = '';
  
  if (acceptedOrders.length > 0) {
    html = acceptedOrders.map((order, index) => createOrderCard(order, index)).join('');
  } else {
    html = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <p>Qabul qilingan buyurtmalar yo\\'q</p>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  const cards = container.querySelectorAll('.order-card');
  cards.forEach((card) => {
    card.addEventListener('click', () => openOrderModal(card.dataset.id));
  });
}

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
    section.style.animation = 'fadeInUp 0.4s ease';
  }
  
  if(tabName === 'stats') updateStats();
  if(tabName === 'menu') loadMenuData();
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
    });
    
    customers = Array.from(customerMap.values()).sort((a, b) => b.totalSpent - a.totalSpent);
    renderCustomers();
  } catch (error) {
    console.error('❌ Mijozlar xato:', error);
  }
}

function renderCustomers() {
  const container = document.getElementById('customersList');
  if (!container) return;
  
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
  
  container.innerHTML = filtered.map((c, i) => `
    <div class="customer-item" style="animation: slideInLeft 0.4s ease ${i * 0.05}s backwards;">
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

window.closeCustomerModal = function() {
  const modal = document.getElementById('customerModal');
  modal.classList.remove('show');
};

// ==========================================
// STATISTICS
// ==========================================

window.setPeriod = function(period) {
  currentPeriod = period;
  
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.classList.remove('active');
    const btnText = btn.textContent.toLowerCase();
    if ((period === 'day' && btnText.includes('kun')) ||
        (period === 'week' && btnText.includes('hafta')) ||
        (period === 'month' && btnText.includes('oy'))) {
      btn.classList.add('active');
    }
  });
  
  updateStats(period);
};

async function updateStats(period = 'day') {
  try {
    console.log('📊 Statistika yangilanmoqda:', period);
    
    const response = await fetch(`${SERVER_URL}/api/orders`);
    const orders = await response.json();
    
    if (!orders || !Array.isArray(orders)) {
      console.error('❌ Buyurtmalar topilmadi');
      return;
    }
    
    const now = new Date();
    let startDate = new Date();
    
    if (period === 'day') {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      startDate.setDate(now.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(now.getMonth() - 1);
    }
    
    const filteredOrders = orders.filter(order => {
      const orderDate = new Date(order.createdAt || order.created_at);
      const isInPeriod = orderDate >= startDate && orderDate <= now;
      const isCompleted = order.status === 'accepted' || order.status === 'confirmed' || order.payment_status === 'paid';
      return isInPeriod && isCompleted;
    });
    
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalOrders = filteredOrders.length;
    
    document.getElementById('statRevenue').textContent = totalRevenue.toLocaleString();
    document.getElementById('statOrders').textContent = totalOrders.toLocaleString();
    
    const productMap = new Map();
    
    filteredOrders.forEach(order => {
      let items = order.items || [];
      if (typeof items === 'string') {
        try {
          items = JSON.parse(items);
        } catch (e) {
          items = [];
        }
      }
      
      items.forEach(item => {
        const name = item.name;
        const qty = item.qty || 1;
        const price = item.price || 0;
        
        if (productMap.has(name)) {
          const existing = productMap.get(name);
          existing.count += qty;
          existing.revenue += (qty * price);
        } else {
          productMap.set(name, {
            name: name,
            count: qty,
            revenue: qty * price
          });
        }
      });
    });
    
    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    const topList = document.getElementById('topProductsList');
    if (topList) {
      if (topProducts.length === 0) {
        topList.innerHTML = `
          <div class="empty-state" style="padding: 40px 20px;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.3; margin-bottom: 12px;">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            <p style="font-size: 14px; color: var(--text-muted);">Bu davrda ma'lumot yo'q</p>
          </div>
        `;
      } else {
        topList.innerHTML = topProducts.map((product, index) => `
          <div class="top-item" style="animation: fadeInUp 0.4s ease ${index * 0.1}s both;">
            <div class="top-rank ${index < 3 ? ['gold', 'silver', 'bronze'][index] : ''}">${index + 1}</div>
            <div class="top-info">
              <div class="top-name">${product.name}</div>
              <div class="top-count">${product.count} ta sotildi • ${product.revenue.toLocaleString()} so'm</div>
            </div>
          </div>
        `).join('');
      }
    }
    
    updateChart(filteredOrders, period);
    
  } catch (error) {
    console.error('❌ Statistika xatosi:', error);
    showToast('Statistikani yuklashda xatolik', 'error');
  }
}

function updateChart(orders, period) {
  const ctx = document.getElementById('mainChart');
  if (!ctx) return;
  
  if (statsChart) {
    statsChart.destroy();
  }
  
  const dateMap = new Map();
  
  orders.forEach(order => {
    const date = new Date(order.createdAt || order.created_at);
    let key;
    
    if (period === 'day') {
      key = date.getHours().toString().padStart(2, '0') + ':00';
    } else if (period === 'week') {
      const days = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];
      key = days[date.getDay()];
    } else {
      key = date.getDate().toString().padStart(2, '0');
    }
    
    if (dateMap.has(key)) {
      dateMap.set(key, dateMap.get(key) + (order.total || 0));
    } else {
      dateMap.set(key, order.total || 0);
    }
  });
  
  const labels = Array.from(dateMap.keys());
  const data = Array.from(dateMap.values());
  
  statsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Daromad (so\'m)',
        data: data,
        borderColor: '#FFD700',
        backgroundColor: 'rgba(255, 215, 0, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#FFD700',
        pointBorderColor: '#000',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(212, 175, 55, 0.1)'
          },
          ticks: {
            color: '#888',
            callback: function(value) {
              return value / 1000 + 'k';
            }
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#888'
          }
        }
      }
    }
  });
}

// ==========================================
// UTILITIES
// ==========================================

function playNotificationSound() {
  const audio = document.getElementById('notifySound');
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(e => console.log('🔇 Audio xato:', e));
  }
}

function showToast(msg, type = 'info') {
  const colors = {
    success: 'linear-gradient(135deg, #00D084 0%, #00b06b 100%)',
    error: 'linear-gradient(135deg, #FF4757 0%, #ff3344 100%)',
    info: 'linear-gradient(135deg, #FFD700 0%, #D4AF37 100%)',
    warning: 'linear-gradient(135deg, #FFA502 0%, #ff9500 100%)'
  };
  
  const existing = document.querySelector('.admin-toast');
  if (existing) existing.remove();
  
  const div = document.createElement('div');
  div.className = 'admin-toast';
  div.style.cssText = `
    position: fixed; 
    top: 50%; 
    left: 50%; 
    transform: translate(-50%, -50%) scale(0.9);
    background: ${colors[type] || colors.info}; 
    color: ${type === 'success' ? '#000' : '#fff'}; 
    padding: 20px 28px;
    border-radius: 16px; 
    z-index: 9999; 
    font-weight: 600;
    font-size: 16px;
    border: 2px solid rgba(255,255,255,0.2); 
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

// ==========================================
// INIT
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 DOMContentLoaded - Admin (Full CRUD + URL Images)');
  init();
});



const adminStyles = document.createElement('style');
adminStyles.textContent = `
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
  
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes slideDown {
    from { transform: translateY(0); opacity: 1; }
    to { transform: translateY(100%); opacity: 0; }
  }

  /* Tab Switcher - Rasm uchun */
  .tab-switcher {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    background: rgba(0,0,0,0.2);
    padding: 4px;
    border-radius: 12px;
  }
  
  .tab-btn {
    flex: 1;
    padding: 12px;
    border: none;
    background: transparent;
    color: #888;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.3s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  
  .tab-btn.active {
    background: linear-gradient(135deg, #FFD700 0%, #D4AF37 100%);
    color: #000;
    box-shadow: 0 4px 15px rgba(212, 175, 55, 0.3);
  }

  /* URL Input */
  #foodImageUrl {
    width: 100%;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(212, 175, 55, 0.2);
    border-radius: 12px;
    padding: 14px 16px;
    color: white;
    font-size: 15px;
    outline: none;
    transition: all 0.3s;
  }
  
  #foodImageUrl:focus {
    border-color: #FFD700;
    box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.1);
  }

  /* Image Preview */
  #imagePreviewContainer {
    margin-top: 16px;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(212, 175, 55, 0.2);
    background: rgba(0,0,0,0.3);
  }
  
  #imagePreview {
    width: 100%;
    max-height: 200px;
    object-fit: contain;
    display: block;
  }

  /* Food Card */
  .food-card {
    position: relative;
    transition: transform 0.2s, box-shadow 0.2s;
    background: linear-gradient(145deg, #1a1a1a 0%, #2a2a2a 100%);
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid rgba(212, 175, 55, 0.1);
  }
  
  .food-card.stopped {
    opacity: 0.6;
    filter: grayscale(0.5);
  }
  
  .food-card:active {
    transform: scale(0.98);
  }
  
  .food-image-wrapper {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    background: linear-gradient(135deg, #1a1500 0%, #0a0a0a 100%);
    border-radius: 12px 12px 0 0;
  }
  
  .food-image-wrapper img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
    padding: 8px;
    transition: transform 0.3s ease;
  }
  
  .food-card:hover .food-image-wrapper img {
    transform: scale(1.05);
  }

  /* Action Buttons - Food Card */
  .food-actions {
    position: absolute;
    top: 8px;
    left: 8px;
    display: flex;
    gap: 6px;
    z-index: 20;
  }
  
  .action-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(0,0,0,0.8);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(212, 175, 55, 0.3);
    color: #FFD700;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .action-btn:hover {
    transform: scale(1.1);
    background: #FFD700;
    color: #000;
  }
  
  .action-btn.edit:hover {
    background: #3498db;
    border-color: #3498db;
    color: #fff;
  }
  
  .action-btn.delete:hover {
    background: #FF4757;
    border-color: #FF4757;
    color: #fff;
  }

  /* Category Pills */
  .pill {
    padding: 10px 16px;
    border-radius: 25px;
    border: 1px solid rgba(212, 175, 55, 0.2);
    background: #1a1a1a;
    color: #888;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.3s;
    display: flex;
    align-items: center;
    gap: 6px;
    position: relative;
    flex-shrink: 0;
  }
  
  .pill.active {
    background: linear-gradient(135deg, #FFD700 0%, #D4AF37 100%);
    color: #000;
    border-color: #FFD700;
    box-shadow: 0 4px 15px rgba(212, 175, 55, 0.3);
    font-weight: 700;
  }
  
  .pill.add-category {
    background: rgba(0, 208, 132, 0.1);
    border-color: rgba(0, 208, 132, 0.3);
    color: #00D084;
  }
  
  .pill.add-category:hover {
    background: #00D084;
    color: #000;
  }

  /* ⭐⭐⭐ MUHIM: Kategoriya Edit/Delete Tugmalari ⭐⭐⭐ */
  .cat-actions {
    display: flex;
    gap: 6px;
    margin-left: 8px;
    opacity: 0;
    transition: all 0.3s ease;
  }
  
  .pill:hover .cat-actions {
    opacity: 1;
  }
  
  .cat-edit, .cat-delete {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    background: rgba(0,0,0,0.7);
    backdrop-filter: blur(10px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  
  .cat-edit {
    color: #4dabf7;
    border: 1px solid rgba(77, 171, 247, 0.4);
  }
  
  .cat-edit:hover {
    background: #4dabf7;
    color: #000;
    transform: scale(1.15);
    box-shadow: 0 0 12px rgba(77, 171, 247, 0.5);
  }
  
  .cat-edit svg {
    width: 16px;
    height: 16px;
    stroke-width: 2.5;
  }
  
  .cat-delete {
    color: #ff6b6b;
    border: 1px solid rgba(255, 107, 107, 0.4);
  }
  
  .cat-delete:hover {
    background: #ff6b6b;
    color: #000;
    transform: scale(1.15);
    box-shadow: 0 0 12px rgba(255, 107, 107, 0.5);
  }
  
  .cat-delete svg {
    width: 16px;
    height: 16px;
    stroke-width: 2.5;
  }

  /* Mobilda har doim ko'rsatish */
  @media (hover: none) and (pointer: coarse) {
    .cat-actions {
      opacity: 1;
      margin-left: auto;
      padding-left: 8px;
    }
    
    .cat-edit, .cat-delete {
      width: 36px;
      height: 36px;
    }
  }

  /* Emoji Picker */
  .emoji-picker-wrapper {
    background: rgba(212, 175, 55, 0.05);
    border-radius: 16px;
    padding: 16px;
    border: 1px solid rgba(212, 175, 55, 0.1);
  }

  .emoji-display {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: rgba(0,0,0,0.3);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.3s;
    margin-bottom: 12px;
    border: 1px solid rgba(212, 175, 55, 0.2);
  }

  .emoji-display:hover {
    border-color: #FFD700;
    background: rgba(212, 175, 55, 0.1);
  }

  .selected-emoji {
    font-size: 32px;
    line-height: 1;
  }

  .emoji-hint {
    color: #888;
    font-size: 14px;
  }

  .emoji-native-input {
    width: 100%;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(212, 175, 55, 0.2);
    border-radius: 10px;
    padding: 12px 16px;
    color: white;
    font-size: 20px;
    margin-bottom: 12px;
    outline: none;
    transition: all 0.3s;
  }

  .emoji-native-input:focus {
    border-color: #FFD700;
    box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.1);
  }

  .quick-emoji-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
    max-height: 0;
    overflow: hidden;
    transition: all 0.3s ease;
  }

  .quick-emoji-grid.show {
    max-height: 300px;
    padding-top: 12px;
    margin-top: 12px;
    border-top: 1px solid rgba(212, 175, 55, 0.1);
  }

  .quick-emoji-grid button {
    aspect-ratio: 1;
    border: none;
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    font-size: 24px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
  }

  .quick-emoji-grid button:hover {
    background: #FFD700;
    transform: scale(1.1);
  }

  /* Admin Toast */
  .admin-toast {
    position: fixed; 
    top: 50%; 
    left: 50%; 
    transform: translate(-50%, -50%) scale(0.9);
    padding: 20px 28px;
    border-radius: 16px; 
    z-index: 9999; 
    font-weight: 600;
    font-size: 16px;
    border: 2px solid rgba(255,255,255,0.2); 
    max-width: 80%; 
    text-align: center;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    animation: toastIn 0.3s ease forwards;
    white-space: pre-line;
  }
`;

document.head.appendChild(adminStyles);