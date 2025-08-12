// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getProducts: () => ipcRenderer.invoke('get-products'),
  generateTicket: (orderData) => ipcRenderer.invoke('generate-ticket', orderData),
  confirmPrint: (payload) => ipcRenderer.invoke('confirm-print', payload),
  cancelPrint: (filePath) => ipcRenderer.invoke('cancel-print', filePath),
  generateReport: () => ipcRenderer.invoke('generate-report'),
  getTodaysOrders: () => ipcRenderer.invoke('get-todays-orders'),
  updateOrderStatus: (payload) => ipcRenderer.invoke('update-order-status', payload),
  updatePaymentStatus: (payload) => ipcRenderer.invoke('update-payment-status', payload), // NUEVO
  // --> NUEVAS FUNCIONES PARA LOS BOTONES DE LA VENTANA <--
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window')
});