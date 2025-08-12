// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const PDFDocument = require('pdfkit');
const { print } = require('pdf-to-printer');
const fs = require('fs');
const os = require('os');
const xlsx = require('xlsx');

// Manejador para obtener todos los productos de la base de datos
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

// Manejador para generar el archivo PDF de un ticket
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

  // NUEVO: Añadimos el tipo de pedido (Servir o Llevar)
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

// Manejador para confirmar la impresión y guardar/actualizar el pedido
ipcMain.handle('confirm-print', async (event, {filePath, orderData}) => {
  const db = new sqlite3.Database('./piamonte.db', (err) => { if (err) console.error(err.message); });
  const itemsJson = JSON.stringify(orderData.items);

  if (orderData.id) {
    const sql = `UPDATE pedidos SET cliente_nombre = ?, cliente_telefono = ?, tipo_pedido = ?, total = ?, items_json = ?, fecha = ?, tipo_entrega = ?, hora_entrega = ?, forma_pago = ?, estado_pago = ? WHERE id = ?`;
    db.run(sql, [orderData.customer.name, orderData.customer.phone, orderData.orderType, orderData.total, itemsJson, orderData.timestamp, orderData.delivery.type, orderData.delivery.time, orderData.payment.method, orderData.payment.status, orderData.id], function(err) { /* ... */ });
  } else {
    const sql = `INSERT INTO pedidos (cliente_nombre, cliente_telefono, tipo_pedido, total, items_json, fecha, tipo_entrega, hora_entrega, forma_pago, estado_pago) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [orderData.customer.name, orderData.customer.phone, orderData.orderType, orderData.total, itemsJson, orderData.timestamp, orderData.delivery.type, orderData.delivery.time, orderData.payment.method, orderData.payment.status], function(err) { /* ... */ });
  }

  try {
    await print(filePath, { printer: 'XP-80C', timeout: 5000 });
    return { success: true };
  } catch (error) { console.error("Error de impresión:", error); return { success: false, error: error.message }; }
  finally { fs.unlinkSync(filePath); }
});

// Manejador para cancelar la impresión y borrar el PDF temporal
ipcMain.handle('cancel-print', (event, filePath) => {
  try {
    fs.unlinkSync(filePath);
    console.log(`Previa cancelada. Archivo temporal borrado: ${filePath}`);
  } catch (error) {
    console.error("No se pudo borrar el archivo temporal:", error);
  }
});

// Manejador para generar el reporte de ventas en Excel
ipcMain.handle('generate-report', async () => {
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
      const agregadosStr = item.extras && item.extras.length > 0
        ? item.extras.map(e => e.nombre).join(', ')
        : '';

      reportData.push({
        'ID Pedido': order.id,
        'Fecha': new Date(order.fecha).toLocaleTimeString('es-CL'),
        'Cliente': order.cliente_nombre,
        'Tipo Pedido': order.tipo_pedido,
        'Estado Pedido': order.estado,
        'Estado Pago': order.estado_pago,
        'Forma de Pago': order.forma_pago || '',
        'Producto': item.name,
        'Agregados': agregadosStr,
        'Notas': item.notes || '',
        'Precio Item': item.price
      });
    });
    totalVentas += order.total;
  });

  reportData.push({});
  const totalRow = { 'Notas': 'TOTAL VENTAS', 'Precio Item': totalVentas };
  reportData.push(totalRow);

  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(reportData);

  worksheet['!cols'] = [
    { wch: 10 }, // ID Pedido
    { wch: 12 }, // Fecha
    { wch: 25 }, // Cliente
    { wch: 12 }, // Tipo Pedido
    { wch: 15 }, // Estado Pedido
    { wch: 15 }, // Estado Pago
    { wch: 15 }, // Forma de Pago
    { wch: 30 }, // Producto
    { wch: 25 }, // Agregados
    { wch: 25 }, // Notas
    { wch: 12 }  // Precio Item
  ];

  xlsx.utils.book_append_sheet(workbook, worksheet, 'Ventas del Día');

  const defaultPath = path.join(app.getPath('documents'), `Reporte-Piamonte-${today}.xlsx`);
  const { filePath } = await dialog.showSaveDialog({
    title: 'Guardar Reporte de Ventas',
    defaultPath: defaultPath,
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
  });

  if (filePath) {
    xlsx.writeFile(workbook, filePath);
    return { success: true, message: `Reporte guardado en: ${filePath}` };
  } else {
    return { success: false, message: 'Guardado cancelado por el usuario.' };
  }
});

// Manejador para obtener los pedidos del día para el historial
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

// Manejador para actualizar el estado de un pedido
ipcMain.handle('update-order-status', async (event, { orderId, status }) => {
  const db = new sqlite3.Database('./piamonte.db', (err) => { if (err) console.error(err.message); });
  const sql = `UPDATE pedidos SET estado = ? WHERE id = ?`;
  return new Promise((resolve, reject) => {
    db.run(sql, [status, orderId], function(err) {
      if (err) {
        console.error("Error al actualizar estado:", err.message);
        reject(false);
      } else {
        console.log(`Estado del pedido #${orderId} actualizado a "${status}".`);
        resolve(true);
      }
    });
    db.close();
  });
});

ipcMain.handle('update-payment-status', async (event, { orderId, status, paymentMethod }) => {
  const db = new sqlite3.Database('./piamonte.db', (err) => { if (err) console.error(err.message); });
  const sql = `UPDATE pedidos SET estado_pago = ?, forma_pago = ? WHERE id = ?`;
  return new Promise((resolve, reject) => {
    db.run(sql, [status, paymentMethod, orderId], function(err) {
      if (err) {
        console.error("Error al actualizar estado de pago:", err.message);
        reject(false);
      } else {
        console.log(`Pago del pedido #${orderId} actualizado a "${status}" con método "${paymentMethod}".`);
        resolve(true);
      }
    });
    db.close();
  });
});

// Creación de la ventana principal de la aplicación
const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    frame: false, // <-- IMPORTANTE: Ventana sin marco
    autoHideMenuBar: true // <-- IMPORTANTE: Oculta la barra de menú
  });

  // AÑADIMOS ESTO PARA FORZAR LA LIMPIEZA DE CACHÉ AL INICIAR
  mainWindow.webContents.session.clearCache().then(() => {
      console.log("Caché de la aplicación limpiada exitosamente.");
      // Movemos la carga del archivo aquí, para que ocurra después de limpiar la caché
      mainWindow.loadFile('index.html');
  });
};

// Lógica de los botones de la ventana
ipcMain.on('minimize-window', () => {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
        window.minimize();
    }
});

ipcMain.on('maximize-window', () => {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
        if (window.isMaximized()) {
            window.unmaximize();
        } else {
            window.maximize();
        }
    }
});

ipcMain.on('close-window', () => {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
        window.close();
    }
});


// Lógica del ciclo de vida de la aplicación
app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});