// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const PDFDocument = require('pdfkit');
const { print } = require('pdf-to-printer');
const fs = require('fs');
const os = require('os');
const xlsx = require('xlsx');
const nodemailer = require('nodemailer');

// --- CONFIGURACIÓN DE RUTAS ---
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'piamonte.db');
const sourceDbPath = app.isPackaged ? path.join(process.resourcesPath, 'piamonte.db') : path.join(__dirname, 'piamonte.db');

if (!fs.existsSync(dbPath)) {
  try {
    fs.copyFileSync(sourceDbPath, dbPath);
    console.log(`Base de datos copiada a: ${dbPath}`);
  } catch (error) {
    console.error('Error al copiar la base de datos:', error);
  }
}

const envPath = app.isPackaged ? path.join(process.resourcesPath, '.env') : path.join(__dirname, '.env');
require('dotenv').config({ path: envPath });

const openDb = (readOnly = false) => {
    const mode = readOnly ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE;
    return new sqlite3.Database(dbPath, mode, (err) => {
        if (err) console.error(`Error al abrir la base de datos en ${dbPath}:`, err.message);
    });
};

const getLocalDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// --- MANEJADORES DE IPC ---
ipcMain.handle('get-products', async () => {
  const db = openDb(true);
  const runQuery = (sql) => new Promise((resolve, reject) => { db.all(sql, [], (err, rows) => { if (err) reject(err); else resolve(rows); }); });
  try {
    const products = await Promise.all([
      runQuery('SELECT * FROM pizzas ORDER BY nombre'),
      runQuery('SELECT * FROM churrascos ORDER BY nombre'),
      runQuery('SELECT * FROM agregados ORDER BY nombre'),
      runQuery('SELECT * FROM otros_productos ORDER BY categoria, nombre')
    ]);
    return { pizzas: products[0], churrascos: products[1], agregados: products[2], otros: products[3] };
  } catch (error) { console.error(error); return {}; }
  finally { db.close(); }
});

ipcMain.handle('generate-ticket', async (event, orderData) => {
  const ticketWidth = 204;
  const tempFilePath = path.join(os.tmpdir(), `ticket-${Date.now()}.pdf`);
  const doc = new PDFDocument({ size: [ticketWidth, 842], margins: { top: 15, bottom: 10, left: 5, right: 5 } });
  const stream = fs.createWriteStream(tempFilePath);
  doc.pipe(stream);
  doc.font('Helvetica-Bold').fontSize(14).text('Pizzería Piamonte', { align: 'center' });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(10);
  doc.text(`Pedido para: ${orderData.customer.name}`, { align: 'center' });
  const orderDate = new Date(orderData.timestamp);
  const datePart = orderDate.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timePart = orderDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  const formattedDateTime = `${datePart}, ${timePart}`;
  doc.text(formattedDateTime, { align: 'center' });
  
  // --> LÍNEA ELIMINADA: Ya no se muestra el tipo de pedido
  
  doc.moveDown(0.5);
  if (orderData.delivery.type === 'demora' && orderData.delivery.time) {
    doc.font('Helvetica-Bold').fontSize(10).text(`Hora estimada: ${orderData.delivery.time}`, { align: 'center' });
  } else if (orderData.delivery.type === 'agendado' && orderData.delivery.time) {
    doc.font('Helvetica-Bold').fontSize(10).text(`Hora acordada: ${orderData.delivery.time}`, { align: 'center' });
  }
  doc.moveDown(0.5);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).dash(2, { space: 3 }).stroke().undash();
  doc.moveDown(0.5);
  orderData.items.forEach(item => {
    const yPosition = doc.y;
    const itemTextWidth = 140;
    doc.font('Helvetica-Bold').fontSize(12).text(`${item.name}`, doc.page.margins.left, yPosition, { width: itemTextWidth });
    doc.font('Helvetica-Bold').fontSize(12).text(`$${item.price.toLocaleString('es-CL')}`, doc.page.margins.left, yPosition, { align: 'right' });
    const nameHeight = doc.heightOfString(`${item.name}`, { width: itemTextWidth });
    doc.y = yPosition + nameHeight;
    if (item.extras && item.extras.length > 0) {
      doc.font('Helvetica').fontSize(12).fillColor('black').text(`  + ${item.extras.map(e => e.nombre).join(', ')}`, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
    }
    if(item.notes) {
      doc.font('Helvetica').fontSize(12).fillColor('black').text(`  -> Nota: ${item.notes}`, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
    }
    doc.moveDown(0.8);
  });
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).dash(2, { space: 3 }).stroke().undash();
  doc.moveDown(0.5);
  const totalProductos = orderData.total;
  const propina = Math.round(totalProductos * 0.1);
  const totalConPropina = totalProductos + propina;
  doc.font('Helvetica-Bold').fontSize(12);
  doc.text(`TOTAL PRODUCTOS: $${totalProductos.toLocaleString('es-CL')}`, { align: 'right' });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(10);
  doc.text(`Propina Sugerida (10%): $${propina.toLocaleString('es-CL')}`, { align: 'right' });
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(14);
  doc.text(`TOTAL CON PROPINA: $${totalConPropina.toLocaleString('es-CL')}`, { align: 'right' });
  doc.end();
  await new Promise(resolve => stream.on('finish', resolve));
  return tempFilePath;
});

ipcMain.handle('confirm-print', async (event, {filePath, orderData}) => {
  const db = openDb();
  const itemsJson = JSON.stringify(orderData.items);
  const runDb = (sql, params) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) { if (err) reject(err); else resolve(this); });
  });
  try {
    // --> CORREGIDO: Se elimina `tipo_pedido` de las consultas
    if (orderData.id) {
      const sql = `UPDATE pedidos SET cliente_nombre = ?, cliente_telefono = ?, total = ?, items_json = ?, fecha = ?, tipo_entrega = ?, hora_entrega = ?, forma_pago = ?, estado_pago = ? WHERE id = ?`;
      await runDb(sql, [orderData.customer.name, orderData.customer.phone, orderData.total, itemsJson, orderData.timestamp, orderData.delivery.type, orderData.delivery.time, orderData.payment.method, orderData.payment.status, orderData.id]);
    } else {
      const sql = `INSERT INTO pedidos (cliente_nombre, cliente_telefono, total, items_json, fecha, tipo_entrega, hora_entrega, forma_pago, estado_pago) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      await runDb(sql, [orderData.customer.name, orderData.customer.phone, orderData.total, itemsJson, orderData.timestamp, orderData.delivery.type, orderData.delivery.time, orderData.payment.method, orderData.payment.status]);
    }
  } catch (dbErr) { console.error('Error al guardar el pedido:', dbErr); }
  finally { db.close(); }
  try {
    await print(filePath, { printer: 'XP-80C', timeout: 5000 });
    return { success: true };
  } catch (error) { console.error("Error de impresión:", error); return { success: false, error: error.message }; }
  finally { fs.unlinkSync(filePath); }
});

ipcMain.handle('cancel-print', (event, filePath) => {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (error) { console.error("No se pudo borrar el archivo temporal:", error); }
});

async function generateDailyReport(autoSavePath = null) {
  const db = openDb(true);
  const today = getLocalDate();
  // --> CORREGIDO: Se elimina `tipo_pedido` del reporte
  const sql = `SELECT * FROM pedidos WHERE date(fecha, 'localtime') = ?`;
  const orders = await new Promise((resolve, reject) => { db.all(sql, [today], (err, rows) => { if (err) reject(err); else resolve(rows); }); });
  db.close();
  if (orders.length === 0) return { success: false, message: 'No hay pedidos guardados para el día de hoy.' };
  let reportData = [], totalVentas = 0;
  orders.forEach(order => {
    const items = JSON.parse(order.items_json);
    items.forEach(item => {
      const agregadosStr = item.extras && item.extras.length > 0 ? item.extras.map(e => e.nombre).join(', ') : '';
      reportData.push({ 'ID Pedido': order.id, 'Fecha': new Date(order.fecha).toLocaleTimeString('es-CL'), 'Cliente': order.cliente_nombre, 'Estado Pedido': order.estado, 'Estado Pago': order.estado_pago, 'Forma de Pago': order.forma_pago || '', 'Producto': item.name, 'Agregados': agregadosStr, 'Notas': item.notes || '', 'Precio Item': item.price });
    });
    totalVentas += order.total;
  });
  reportData.push({}, { 'Notas': 'TOTAL VENTAS', 'Precio Item': totalVentas });
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(reportData);
  worksheet['!cols'] = [ { wch: 10 }, { wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 25 }, { wch: 25 }, { wch: 12 } ];
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Ventas del Día');
  let finalPath = autoSavePath;
  if (!finalPath) {
    const defaultPath = path.join(app.getPath('documents'), `Reporte-Piamonte-${today}.xlsx`);
    const { filePath } = await dialog.showSaveDialog({ title: 'Guardar Reporte de Ventas', defaultPath, filters: [{ name: 'Excel Files', extensions: ['xlsx'] }] });
    finalPath = filePath;
  }
  if (finalPath) {
    xlsx.writeFile(workbook, finalPath);
    return { success: true, message: `Reporte guardado en: ${finalPath}`, filePath: finalPath };
  }
  return { success: false, message: 'Guardado cancelado por el usuario.' };
}

ipcMain.handle('generate-report', () => generateDailyReport());

async function sendReportByEmail() {
    console.log('Iniciando proceso de envío de reporte por correo...');
    const today = getLocalDate();
    const reportFileName = `Reporte-Piamonte-${today}.xlsx`;
    const reportPath = path.join(os.tmpdir(), reportFileName);
    const reportResult = await generateDailyReport(reportPath);
    if (!reportResult.success) { console.log(`No se generó reporte para enviar: ${reportResult.message}`); return; }
    console.log(`Reporte generado en: ${reportResult.filePath}`);
    const transporter = nodemailer.createTransport({ host: 'smtp.sendgrid.net', port: 587, auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY } });
    try {
        await transporter.sendMail({ from: process.env.EMAIL_FROM, to: process.env.EMAIL_TO, subject: `Reporte de Ventas Piamonte - ${today}`, text: 'Adjunto se encuentra el reporte de ventas del día.', attachments: [{ filename: reportFileName, path: reportResult.filePath }] });
        console.log('Correo de reporte enviado exitosamente.');
        if (fs.existsSync(reportResult.filePath)) fs.unlinkSync(reportResult.filePath);
    } catch (error) { console.error('Error al enviar el correo:', error); }
}

async function clearOrdersTable() {
    console.log('Limpiando y reseteando la tabla de pedidos...');
    const db = openDb();
    const run = (sql) => new Promise((resolve, reject) => {
        db.run(sql, [], function(err) { if (err) return reject(err); resolve(this); });
    });
    try {
        const deleteInfo = await run(`DELETE FROM pedidos`);
        console.log(`Tabla 'pedidos' limpiada. Filas eliminadas: ${deleteInfo.changes}`);
        const resetInfo = await run(`DELETE FROM sqlite_sequence WHERE name='pedidos'`);
        console.log(`Contador de autoincremento para 'pedidos' reseteado.`);
    } catch (err) {
        console.error('Error durante la limpieza de la tabla:', err.message);
    } finally {
        db.close((err) => {
            if (err) console.error('Error al cerrar la DB después de limpiar:', err.message);
            else console.log('Conexión de la base de datos (limpieza) cerrada correctamente.');
        });
    }
}

ipcMain.handle('get-todays-orders', async () => {
  const db = openDb(true);
  const today = getLocalDate();
  const sql = `SELECT * FROM pedidos WHERE date(fecha, 'localtime') = ? ORDER BY id DESC`;
  try {
    const orders = await new Promise((resolve, reject) => { db.all(sql, [today], (err, rows) => { if (err) reject(err); else resolve(rows); }); });
    return orders;
  } catch (error) { console.error(error); return []; }
  finally { db.close(); }
});

ipcMain.handle('update-order-status', async (event, { orderId, status }) => {
  const db = openDb();
  const sql = `UPDATE pedidos SET estado = ? WHERE id = ?`;
  return new Promise((resolve, reject) => {
    db.run(sql, [status, orderId], function(err) {
      if (err) { console.error("Error al actualizar estado:", err.message); db.close(); return reject(false); }
      db.close((closeErr) => { if (closeErr) { console.error("Error al cerrar DB:", closeErr.message); return reject(false); } resolve(true); });
    });
  });
});

ipcMain.handle('update-payment-status', async (event, { orderId, status, paymentMethod }) => {
  const db = openDb();
  const sql = `UPDATE pedidos SET estado_pago = ?, forma_pago = ? WHERE id = ?`;
  return new Promise((resolve, reject) => {
    db.run(sql, [status, paymentMethod, orderId], function(err) {
      if (err) { console.error("Error al actualizar pago:", err.message); db.close(); return reject(false); }
      db.close((closeErr) => { if (closeErr) { console.error("Error al cerrar DB:", closeErr.message); return reject(false); } resolve(true); });
    });
  });
});

// --- LÓGICA DE LA VENTANA Y CICLO DE VIDA ---
const createWindow = () => {
  const mainWindow = new BrowserWindow({ width: 1280, height: 800, webPreferences: { preload: path.join(__dirname, 'preload.js') }, frame: false, autoHideMenuBar: true });
  mainWindow.webContents.session.clearCache().then(() => { mainWindow.loadFile('index.html'); });
};

ipcMain.on('minimize-window', () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.minimize(); });
ipcMain.on('maximize-window', () => { const w = BrowserWindow.getFocusedWindow(); if (w) { if (w.isMaximized()) w.unmaximize(); else w.maximize(); } });
ipcMain.on('close-window', () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.close(); });

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await sendReportByEmail();
    await clearOrdersTable();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});