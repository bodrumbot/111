// ⭐ SODDA VERSION - Faqat basic xabar almashish

const STORAGE_KEY = 'bodrum_payment_events';

// Faqat localStorage orqali sodda xabar
window.notifyPaymentSuccess = function(orderId) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    orderId: orderId,
    timestamp: Date.now()
  }));
};

window.checkPaymentSuccess = function() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return null;
  
  try {
    const parsed = JSON.parse(data);
    // 5 daqiqadan eski bo'lsa o'chirish
    if (Date.now() - parsed.timestamp > 300000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
};