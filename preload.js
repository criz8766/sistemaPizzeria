// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Funciones de productos y pedidos
  getProducts: () => ipcRenderer.invoke('get-products'),
  generateTicket: (orderData) => ipcRenderer.invoke('generate-ticket', orderData),
  confirmPrint: (payload) => ipcRenderer.invoke('confirm-print', payload),
  cancelPrint: (filePath) => ipcRenderer.invoke('cancel-print', filePath),
  generateReport: () => ipcRenderer.invoke('generate-report'),
  getTodaysOrders: () => ipcRenderer.invoke('get-todays-orders'),
  updateOrderStatus: (payload) => ipcRenderer.invoke('update-order-status', payload),
  updatePaymentStatus: (payload) => ipcRenderer.invoke('update-payment-status', payload),
  updateOrder: (orderData) => ipcRenderer.invoke('update-order', orderData),
  deleteOrder: (orderId) => ipcRenderer.invoke('delete-order', orderId),
  
  // Funciones de configuración
  updatePrices: (updates) => ipcRenderer.invoke('update-prices', updates),

  // Funciones de inventario
  getInventory: () => ipcRenderer.invoke('get-inventory'),
  updateInventory: (updates) => ipcRenderer.invoke('update-inventory', updates),
  onInventoryUpdate: (callback) => ipcRenderer.on('inventory-updated', callback),
  printShoppingList: () => ipcRenderer.invoke('print-shopping-list'),

  // Funciones de la ventana
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window')
});