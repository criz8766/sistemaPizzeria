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
require('dotenv').config();

// --- MANEJADORES DE IPC (Lógica de la aplicación) ---

ipcMain.handle('get-products', async () => {
  const db = new sqlite3.Database('./piamonte.db', sqlite3.OPEN_READONLY, (err) => { if (err) console.error(err.message); });
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

  const tipoPedido = orderData.orderType.charAt(0).toUpperCase() + orderData.orderType.slice(1);
  doc.text(`¿servir o llevar?: ${tipoPedido}`, { align: 'center' });

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

    doc.font('Helvetica-Bold').fontSize(12)
       .text(`${item.name}`, doc.page.margins.left, yPosition, { width: itemTextWidth });

    doc.font('Helvetica-Bold').fontSize(12)
       .text(`$${item.price.toLocaleString('es-CL')}`, doc.page.margins.left, yPosition, { align: 'right' });

    const nameHeight = doc.heightOfString(`${item.name}`, { width: itemTextWidth });
    doc.y = yPosition + nameHeight;

    if (item.extras && item.extras.length > 0) {
      doc.font('Helvetica').fontSize(12).fillColor('black')
         .text(`  + ${item.extras.map(e => e.nombre).join(', ')}`, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
    }
    if(item.notes) {
      doc.font('Helvetica').fontSize(12).fillColor('black')
         .text(`  -> Nota: ${item.notes}`, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
    }

    doc.moveDown(0.8);
  });

  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).dash(2, { space: 3 }).stroke().undash();
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(14).text(`TOTAL: $${orderData.total.toLocaleString('es-CL')}`, { align: 'right' });
  doc.end();

  await new Promise(resolve => stream.on('finish', resolve));
  return tempFilePath;
});

ipcMain.handle('confirm-print', async (event, {filePath, orderData}) => {
  const db = new sqlite3.Database('./piamonte.db', (err) => { if (err) console.error(err.message); });
  const itemsJson = JSON.stringify(orderData.items);

  if (orderData.id) {
    const sql = `UPDATE pedidos SET cliente_nombre = ?, cliente_telefono = ?, tipo_pedido = ?, total = ?, items_json = ?, fecha = ?, tipo_entrega = ?, hora_entrega = ?, forma_pago = ?, estado_pago = ? WHERE id = ?`;
    db.run(sql, [orderData.customer.name, orderData.customer.phone, orderData.orderType, orderData.total, itemsJson, orderData.timestamp, orderData.delivery.type, orderData.delivery.time, orderData.payment.method, orderData.payment.status, orderData.id]);
  } else {
    const sql = `INSERT INTO pedidos (cliente_nombre, cliente_telefono, tipo_pedido, total, items_json, fecha, tipo_entrega, hora_entrega, forma_pago, estado_pago) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [orderData.customer.name, orderData.customer.phone, orderData.orderType, orderData.total, itemsJson, orderData.timestamp, orderData.delivery.type, orderData.delivery.time, orderData.payment.method, orderData.payment.status]);
  }
  db.close();

  try {
    await print(filePath, { printer: 'XP-80C', timeout: 5000 });
    return { success: true };
  } catch (error) { console.error("Error de impresión:", error); return { success: false, error: error.message }; }
  finally { fs.unlinkSync(filePath); }
});

ipcMain.handle('cancel-print', (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("No se pudo borrar el archivo temporal:", error);
  }
});

async function generateDailyReport(autoSavePath = null) {
  const db = new sqlite3.Database('./piamonte.db', sqlite3.OPEN_READONLY, (err) => { if (err) console.error(err.message); });
  const today = new Date().toISOString().slice(0, 10);
  const sql = `SELECT * FROM pedidos WHERE date(fecha) = ?`;

  const orders = await new Promise((resolve, reject) => {
    db.all(sql, [today], (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
  db.close();

  if (orders.length === 0) {
    return { success: false, message: 'No hay pedidos guardados para el día de hoy.' };
  }

  let reportData = [];
  let totalVentas = 0;
  orders.forEach(order => {
    const items = JSON.parse(order.items_json);
    items.forEach(item => {
      const agregadosStr = item.extras && item.extras.length > 0 ? item.extras.map(e => e.nombre).join(', ') : '';
      reportData.push({
        'ID Pedido': order.id, 'Hora': new Date(order.fecha).toLocaleTimeString('es-CL'), 'Cliente': order.cliente_nombre,
        'Tipo Pedido': order.tipo_pedido, 'Estado Pedido': order.estado, 'Estado Pago': order.estado_pago,
        'Forma de Pago': order.forma_pago || '', 'Producto': item.name, 'Agregados': agregadosStr, 'Notas': item.notes || '', 'Precio Item': item.price
      });
    });
    totalVentas += order.total;
  });

  reportData.push({});
  reportData.push({ 'Notas': 'TOTAL VENTAS', 'Precio Item': totalVentas });

  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(reportData);
  worksheet['!cols'] = [ { wch: 10 }, { wch: 12 }, { wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 25 }, { wch: 25 }, { wch: 12 } ];
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
  } else {
    return { success: false, message: 'Guardado cancelado por el usuario.' };
  }
}

ipcMain.handle('generate-report', async () => {
  return await generateDailyReport();
});

async function sendReportByEmail() {
    console.log('Iniciando proceso de envío de reporte por correo con SendGrid...');
    const today = new Date().toISOString().slice(0, 10);
    const reportFileName = `Reporte-Piamonte-${today}.xlsx`;
    const reportPath = path.join(os.tmpdir(), reportFileName);

    const reportResult = await generateDailyReport(reportPath);
    if (!reportResult.success) {
        console.log(`No se generó reporte para enviar: ${reportResult.message}`);
        return;
    }

    console.log(`Reporte generado en: ${reportResult.filePath}`);

    const transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
            user: 'apikey',
            pass: process.env.SENDGRID_API_KEY
        }
    });

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: process.env.EMAIL_TO,
            subject: `Reporte de Ventas Piamonte - ${today}`,
            text: 'Adjunto se encuentra el reporte de ventas del día.',
            attachments: [{
                filename: reportFileName,
                path: reportResult.filePath,
            }]
        });
        console.log('Correo de reporte enviado exitosamente a través de SendGrid.');
        if (fs.existsSync(reportResult.filePath)) {
            fs.unlinkSync(reportResult.filePath);
        }
    } catch (error) {
        console.error('Error al enviar el correo con SendGrid:', error);
    }
}

ipcMain.handle('get-todays-orders', async () => {
  const db = new sqlite3.Database('./piamonte.db', sqlite3.OPEN_READONLY, (err) => { if (err) console.error(err.message); });
  const today = new Date().toISOString().slice(0, 10);
  const sql = `SELECT * FROM pedidos WHERE date(fecha) = ? ORDER BY id DESC`;
  try {
    const orders = await new Promise((resolve, reject) => {
      db.all(sql, [today], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });
    return orders;
  } catch (error) {
    console.error(error);
    return [];
  } finally {
    db.close();
  }
});

ipcMain.handle('update-order-status', async (event, { orderId, status }) => {
  const db = new sqlite3.Database('./piamonte.db', (err) => { if (err) console.error(err.message); });
  const sql = `UPDATE pedidos SET estado = ? WHERE id = ?`;
  return new Promise((resolve, reject) => {
    db.run(sql, [status, orderId], function(err) {
      db.close();
      if (err) { console.error("Error al actualizar estado:", err.message); reject(false); } 
      else { resolve(true); }
    });
  });
});

ipcMain.handle('update-payment-status', async (event, { orderId, status, paymentMethod }) => {
  const db = new sqlite3.Database('./piamonte.db', (err) => { if (err) console.error(err.message); });
  const sql = `UPDATE pedidos SET estado_pago = ?, forma_pago = ? WHERE id = ?`;
  return new Promise((resolve, reject) => {
    db.run(sql, [status, paymentMethod, orderId], function(err) {
      db.close();
      if (err) { console.error("Error al actualizar estado de pago:", err.message); reject(false); } 
      else { resolve(true); }
    });
  });
});

// --- LÓGICA DE LA VENTANA Y CICLO DE VIDA DE LA APP ---

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280, 
    height: 800,
    webPreferences: { 
        preload: path.join(__dirname, 'preload.js') 
    },
    frame: false, 
    autoHideMenuBar: true
  });

  mainWindow.webContents.session.clearCache().then(() => {
      mainWindow.loadFile('index.html');
  });
};

ipcMain.on('minimize-window', () => { const window = BrowserWindow.getFocusedWindow(); if (window) window.minimize(); });
ipcMain.on('maximize-window', () => { const window = BrowserWindow.getFocusedWindow(); if (window) { if (window.isMaximized()) window.unmaximize(); else window.maximize(); } });
ipcMain.on('close-window', () => { const window = BrowserWindow.getFocusedWindow(); if (window) window.close(); });

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await sendReportByEmail();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});