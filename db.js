// db.js - Har bir foydalanuvchi uchun alohida profil
const DB_NAME = 'bodrumDB';
const DB_VERSION = 4; // Versiya oshirildi - yangi database
const STORE_PROFILE = 'profile';
const STORE_ORDERS = 'orders';

function openDB() {
  return new Promise((resolve, reject) => {
    console.log('[DB] openDB boshlandi');
    
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    
    req.onerror = () => {
      console.error('[DB] openDB xato:', req.error);
      reject(req.error);
    };
    
    req.onsuccess = () => {
      console.log('[DB] openDB muvaffaqiyatli');
      resolve(req.result);
    };
    
    req.onupgradeneeded = (event) => {
      console.log('[DB] onupgradeneeded');
      const db = event.target.result;
      
      // Eski store larni o'chirish
      if (db.objectStoreNames.contains(STORE_PROFILE)) {
        db.deleteObjectStore(STORE_PROFILE);
        console.log('[DB] Eski profile store o\'chirildi');
      }
      if (db.objectStoreNames.contains(STORE_ORDERS)) {
        db.deleteObjectStore(STORE_ORDERS);
        console.log('[DB] Eski orders store o\'chirildi');
      }
      
      // Yangi profil store
      const profileStore = db.createObjectStore(STORE_PROFILE, { keyPath: 'user_id' });
      profileStore.createIndex('phone', 'phone', { unique: false });
      console.log('[DB] Yangi profile store yaratildi');
      
      // Yangi buyurtmalar store
      const ordersStore = db.createObjectStore(STORE_ORDERS, { keyPath: 'id', autoIncrement: true });
      ordersStore.createIndex('user_id', 'user_id', { unique: false });
      console.log('[DB] Yangi orders store yaratildi');
    };
  });
}

// Telegram ID olish yoki generate qilish
function getUserId() {
  // Telegram WebApp dan
  if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
    const id = 'tg_' + window.Telegram.WebApp.initDataUnsafe.user.id;
    console.log('[DB] Telegram ID:', id);
    return id;
  }
  
  // LocalStorage dan
  let userId = localStorage.getItem('bodrum_user_id');
  if (!userId) {
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('bodrum_user_id', userId);
    console.log('[DB] Yangi user ID yaratildi:', userId);
  } else {
    console.log('[DB] Mavjud user ID:', userId);
  }
  
  return userId;
}

// ✅ Profil saqlash
export async function saveProfileDB({ name, phone, avatar = null }) {
  console.log('[DB] saveProfileDB boshlandi:', { name, phone });
  
  try {
    const db = await openDB();
    const user_id = getUserId();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROFILE, 'readwrite');
      const store = tx.objectStore(STORE_PROFILE);
      
      const now = new Date().toISOString();
      
      const profile = {
        user_id,
        name,
        phone,
        avatar,
        updatedAt: now,
        createdAt: now
      };
      
      console.log('[DB] Saqlanayotgan profil:', profile);
      
      // Avvalgi profilni tekshirish
      const getReq = store.get(user_id);
      
      getReq.onsuccess = () => {
        if (getReq.result) {
          profile.createdAt = getReq.result.createdAt; // createdAt saqlansin
          console.log('[DB] Mavjud profil yangilanmoqda');
        } else {
          console.log('[DB] Yangi profil yaratilmoqda');
        }
        
        const putReq = store.put(profile);
        
        putReq.onsuccess = () => {
          console.log('[DB] Profile saqlandi:', profile);
          resolve(profile);
        };
        
        putReq.onerror = (e) => {
          console.error('[DB] Put xato:', putReq.error);
          reject(putReq.error);
        };
      };
      
      getReq.onerror = () => {
        console.error('[DB] Get xato:', getReq.error);
        // Get xato bersa ham yangi profil yaratish
        const putReq = store.put(profile);
        putReq.onsuccess = () => resolve(profile);
        putReq.onerror = () => reject(putReq.error);
      };
      
      tx.onerror = () => {
        console.error('[DB] Transaction xato:', tx.error);
        reject(tx.error);
      };
      
      tx.oncomplete = () => {
        console.log('[DB] Transaction tugadi');
      };
    });
  } catch (error) {
    console.error('[DB] saveProfileDB umumiy xato:', error);
    throw error;
  }
}

// ✅ Profil olish
export async function getProfileDB() {
  console.log('[DB] getProfileDB boshlandi');
  
  try {
    const db = await openDB();
    const user_id = getUserId();
    
    console.log('[DB] Qidirilayotgan user_id:', user_id);
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROFILE, 'readonly');
      const store = tx.objectStore(STORE_PROFILE);
      const request = store.get(user_id);
      
      request.onsuccess = () => {
        console.log('[DB] Profile topildi:', request.result);
        resolve(request.result || null);
      };
      
      request.onerror = () => {
        console.error('[DB] getProfileDB xato:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[DB] getProfileDB umumiy xato:', error);
    return null;
  }
}

// ✅ Buyurtma qo'shish
export async function addOrderDB({ text, date, total, items }) {
  console.log('[DB] addOrderDB boshlandi');
  
  try {
    const db = await openDB();
    const user_id = getUserId();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ORDERS, 'readwrite');
      const store = tx.objectStore(STORE_ORDERS);
      
      const order = {
        user_id,
        text,
        date,
        total,
        items,
        createdAt: new Date().toISOString()
      };
      
      const request = store.add(order);
      
      request.onsuccess = () => {
        console.log('[DB] Buyurtma saqlandi:', order);
        resolve();
      };
      
      request.onerror = () => {
        console.error('[DB] addOrderDB xato:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[DB] addOrderDB umumiy xato:', error);
    throw error;
  }
}

// ✅ Foydalanuvchi buyurtmalarini olish
export async function getOrdersDB() {
  console.log('[DB] getOrdersDB boshlandi');
  
  try {
    const db = await openDB();
    const user_id = getUserId();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ORDERS, 'readonly');
      const store = tx.objectStore(STORE_ORDERS);
      const index = store.index('user_id');
      const request = index.getAll(user_id);
      
      request.onsuccess = () => {
        console.log('[DB] Buyurtmalar soni:', request.result.length);
        resolve(request.result.reverse());
      };
      
      request.onerror = () => {
        console.error('[DB] getOrdersDB xato:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[DB] getOrdersDB umumiy xato:', error);
    return [];
  }
}

// ✅ Profil o'chirish (logout)
export async function deleteProfileDB() {
  console.log('[DB] deleteProfileDB boshlandi');
  
  try {
    const db = await openDB();
    const user_id = getUserId();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROFILE, 'readwrite');
      const store = tx.objectStore(STORE_PROFILE);
      const request = store.delete(user_id);
      
      request.onsuccess = () => {
        console.log('[DB] Profil o\'chirildi');
        localStorage.removeItem('bodrum_user_id');
        resolve();
      };
      
      request.onerror = () => {
        console.error('[DB] deleteProfileDB xato:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[DB] deleteProfileDB umumiy xato:', error);
    throw error;
  }
}