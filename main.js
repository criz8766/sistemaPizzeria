// main.js
const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const PDFDocument = require("pdfkit");
const { print } = require("pdf-to-printer");
const fs = require("fs");
const os = require("os");
const xlsx = require("xlsx");
const nodemailer = require("nodemailer");
const express = require("express");
const cors = require("cors");
const { Bonjour } = require("bonjour-service");

let mainWindow;
let bonjour;

// Rutas de la base de datos
const userDataPath = app.getPath("userData");
const dbPath = path.join(userDataPath, "piamonte.db");
const sourceDbPath = app.isPackaged
  ? path.join(process.resourcesPath, "piamonte.db")
  : path.join(__dirname, "piamonte.db");

// Copia la base de datos inicial si no existe en userData
if (!fs.existsSync(dbPath)) {
  try {
    // Asegura que el directorio exista
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.copyFileSync(sourceDbPath, dbPath);
    console.log(`Base de datos copiada a: ${dbPath}`);
  } catch (error) {
    console.error("Error al copiar la base de datos:", error);
  }
}

// Carga las variables de entorno desde .env
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, ".env")
  : path.join(__dirname, ".env");
require("dotenv").config({ path: envPath });

// --- CORRECCIÓN: Migración de Base de Datos con Async/Await ---
// Esto soluciona el error "Database handle is closed" asegurando que se espere a terminar antes de cerrar.
async function ensureDatabaseSchema() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error("Error abriendo BD para migración:", err.message);
        return resolve(); // Resolvemos para intentar seguir aunque falle la conexión
      }
    });

    // Helper para hacer consultas con promesas
    const all = (sql) => new Promise((res, rej) => db.all(sql, (e, r) => e ? rej(e) : res(r)));
    const run = (sql) => new Promise((res, rej) => db.run(sql, (e) => e ? rej(e) : res()));

    (async () => {
      try {
        // 1. Tabla PEDIDOS: Columnas de anulación
        const pedidosCols = await all(`PRAGMA table_info(pedidos)`);
        
        if (!pedidosCols.some(c => c.name === 'anulado')) {
          await run(`ALTER TABLE pedidos ADD COLUMN anulado INTEGER DEFAULT 0`);
          console.log("[Migración] Columna 'anulado' creada exitosamente.");
        }
        
        if (!pedidosCols.some(c => c.name === 'motivo_anulacion')) {
          await run(`ALTER TABLE pedidos ADD COLUMN motivo_anulacion TEXT`);
          console.log("[Migración] Columna 'motivo_anulacion' creada exitosamente.");
        }

        // 2. Tabla INVENTARIO: Columna comprar
        const invCols = await all(`PRAGMA table_info(inventario)`);
        if (!invCols.some(c => c.name === 'comprar')) {
          await run(`ALTER TABLE inventario ADD COLUMN comprar INTEGER NOT NULL DEFAULT 0`);
          console.log("[Migración] Columna 'comprar' creada exitosamente.");
        }

      } catch (error) {
        console.error("Error durante la migración de esquema:", error.message);
      } finally {
        db.close((err) => {
          if (err) console.error("Error cerrando BD migración:", err.message);
          resolve(); // Terminamos la promesa principal
        });
      }
    })();
  });
}

// Función para abrir la base de datos (usada por los handlers normales)
const openDb = (readOnly = false) => {
  const mode = readOnly ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE;
  return new sqlite3.Database(dbPath, mode, (err) => {
    if (err) console.error(`Error al abrir la base de datos en ${dbPath}:`, err.message);
  });
};

// Obtiene la fecha local en formato YYYY-MM-DD
const getLocalDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// --- MANEJADORES IPC ---

// Obtener todos los productos
ipcMain.handle("get-products", async () => {
  const db = openDb(true);
  const runQuery = (sql) =>
    new Promise((resolve, reject) => {
      db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  try {
    const products = await Promise.all([
      runQuery("SELECT * FROM pizzas ORDER BY nombre"),
      runQuery("SELECT * FROM churrascos ORDER BY nombre"),
      runQuery("SELECT * FROM agregados ORDER BY nombre"),
      runQuery("SELECT * FROM otros_productos ORDER BY categoria, nombre"),
    ]);
    return {
      pizzas: products[0],
      churrascos: products[1],
      agregados: products[2],
      otros: products[3],
    };
  } catch (error) {
    console.error("Error al obtener productos:", error);
    return {};
  } finally {
    db.close((err) => {
      if (err) console.error("Error al cerrar DB en get-products:", err.message);
    });
  }
});

// CRUD: Añadir un nuevo producto
ipcMain.handle("add-product", async (event, { type, productData }) => {
  const db = openDb();
  let sql = "";
  let params = [];
  const tableName = type; 

  // Validar nombre de tabla
  const validTables = ['pizzas', 'churrascos', 'agregados', 'otros_productos'];
  if (!validTables.includes(tableName)) {
    return { success: false, message: "Tipo de producto inválido." };
  }

  const fields = Object.keys(productData).filter(key => key !== 'id'); 
  const placeholders = fields.map(() => '?').join(', ');
  sql = `INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
  params = fields.map(field => productData[field]);

  return new Promise((resolve) => {
    db.run(sql, params, function (err) {
      db.close();
      if (err) {
        resolve({ success: false, message: err.message });
      } else {
        resolve({ success: true, id: this.lastID });
      }
    });
  });
});

// CRUD: Actualizar un producto existente
ipcMain.handle("update-product", async (event, { type, productData }) => {
  const db = openDb();
  let sql = "";
  let params = [];
  const tableName = type;

  const validTables = ['pizzas', 'churrascos', 'agregados', 'otros_productos'];
  if (!validTables.includes(tableName) || !productData.id) {
    return { success: false, message: "Tipo de producto o ID inválido." };
  }

  const fields = Object.keys(productData).filter(key => key !== 'id');
  const setClause = fields.map(field => `${field} = ?`).join(', ');
  sql = `UPDATE ${tableName} SET ${setClause} WHERE id = ?`;
  params = fields.map(field => productData[field]);
  params.push(productData.id);

  return new Promise((resolve) => {
    db.run(sql, params, function (err) {
      db.close();
      if (err) {
        resolve({ success: false, message: err.message });
      } else {
        resolve({ success: true });
      }
    });
  });
});

// CRUD: Eliminar un producto
ipcMain.handle("delete-product", async (event, { type, productId }) => {
  const db = openDb();
  const tableName = type;

  const validTables = ['pizzas', 'churrascos', 'agregados', 'otros_productos'];
  if (!validTables.includes(tableName) || !productId) {
    return { success: false, message: "Tipo de producto o ID inválido." };
  }

  const sql = `DELETE FROM ${tableName} WHERE id = ?`;

  return new Promise((resolve) => {
    db.run(sql, [productId], function (err) {
      db.close();
      if (err) {
        resolve({ success: false, message: err.message });
      } else {
        resolve({ success: true });
      }
    });
  });
});

// Generar PDF del ticket
ipcMain.handle("generate-ticket", async (event, orderData) => {
  const ticketWidth = 204; 
  const tempFilePath = path.join(os.tmpdir(), `ticket-${Date.now()}.pdf`);
  const doc = new PDFDocument({
    size: [ticketWidth, 842], 
    margins: { top: 15, bottom: 10, left: 5, right: 5 },
  });
  const stream = fs.createWriteStream(tempFilePath);
  doc.pipe(stream);

  const logoPath = app.isPackaged
    ? path.join(process.resourcesPath, "assets/logo.jpg")
    : path.join(__dirname, "assets/logo.jpg");
  if (fs.existsSync(logoPath)) {
    const logoSize = 60;
    const xPosition = (ticketWidth - logoSize) / 2; 
    doc.image(logoPath, xPosition, doc.y, { width: logoSize, height: logoSize });
    doc.moveDown(4); 
  }

  // Encabezado
  doc.font("Helvetica-Bold").fontSize(14).text("Pizzería Piamonte", { align: "center" });
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(9);
  doc.text("Fono: 422228001", { align: "center" });
  doc.text("WhatsApp: +56946914655", { align: "center" });
  doc.text("Instagram: @pizzeria_piamonte_chillan", { align: "center" });
  doc.moveDown(1);

  // Info del pedido
  doc.font("Helvetica").fontSize(10);
  doc.text(`Pedido para: ${orderData.customer.name}`, { align: "center" });
  const orderDate = new Date(orderData.timestamp);
  const datePart = orderDate.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timePart = orderDate.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });
  doc.text(`${datePart}, ${timePart}`, { align: "center" });
  doc.moveDown(0.5);

  if (orderData.delivery.type === "demora" && orderData.delivery.time) {
    doc.font("Helvetica-Bold").fontSize(10).text(`Hora estimada: ${orderData.delivery.time}`, { align: "center" });
  } else if (orderData.delivery.type === "agendado" && orderData.delivery.time) {
    doc.font("Helvetica-Bold").fontSize(10).text(`Hora acordada: ${orderData.delivery.time}`, { align: "center" });
  }
  doc.moveDown(0.5);

  // Línea separadora
  doc.moveTo(5, doc.y).lineTo(199, doc.y).dash(2, { space: 3 }).stroke().undash();
  doc.moveDown(0.5);

  // Items del pedido
  orderData.items.forEach((item) => {
    const yPosition = doc.y;
    const itemTextWidth = 140; 
    doc.font("Helvetica-Bold").fontSize(12).text(`${item.name}`, 5, yPosition, { width: itemTextWidth, lineBreak: true });

    const nameHeight = doc.heightOfString(`${item.name}`, { width: itemTextWidth });

    doc.font("Helvetica-Bold").fontSize(12).text(`$${item.price.toLocaleString("es-CL")}`, 5, yPosition, { align: "right" });

    doc.y = yPosition + Math.max(nameHeight, 10); 

    if (item.extras && item.extras.length > 0) {
      doc.font("Helvetica").fontSize(10).fillColor("black").text(`  + ${item.extras.map((e) => e.nombre).join(", ")}`, { width: 190, indent: 10 });
    }
    if (item.notes) {
      doc.font("Helvetica").fontSize(10).fillColor("black").text(`  -> Nota: ${item.notes}`, { width: 190, indent: 10 });
    }
    doc.moveDown(0.8); 
  });

  doc.moveTo(5, doc.y).lineTo(199, doc.y).dash(2, { space: 3 }).stroke().undash();
  doc.moveDown(0.5);

  // Totales y Propina
  const totalProductos = orderData.total;
  const propina = Math.round(totalProductos * 0.1);
  const totalConPropina = totalProductos + propina;

  doc.font("Helvetica-Bold").fontSize(10);
  doc.text(`SUBTOTAL: $${totalProductos.toLocaleString("es-CL")}`, { align: "right" });
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(10);
  doc.text(`Propina Sugerida (10%): $${propina.toLocaleString("es-CL")}`, { align: "right" });
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(10);
  doc.text(`TOTAL CON PROPINA: $${totalConPropina.toLocaleString("es-CL")}`, { align: "right" });

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject); 
  });

  return tempFilePath;
});

// Confirmar impresión y guardar/actualizar pedido en DB
ipcMain.handle("confirm-print", async (event, { filePath, orderData }) => {
  const db = openDb();
  const itemsJson = JSON.stringify(orderData.items);
  const runDb = (sql, params) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this); 
      });
    });

  try {
    if (orderData.id) {
      // Actualizar pedido existente
      const sql = `UPDATE pedidos SET cliente_nombre = ?, cliente_telefono = ?, total = ?, items_json = ?, fecha = ?, tipo_entrega = ?, hora_entrega = ?, forma_pago = ?, estado_pago = ? WHERE id = ?`;
      await runDb(sql, [
        orderData.customer.name,
        orderData.customer.phone,
        orderData.total,
        itemsJson,
        orderData.timestamp,
        orderData.delivery.type,
        orderData.delivery.time,
        orderData.payment.method,
        orderData.payment.status,
        orderData.id,
      ]);
    } else {
      // Insertar nuevo pedido
      const sql = `INSERT INTO pedidos (cliente_nombre, cliente_telefono, total, items_json, fecha, tipo_entrega, hora_entrega, forma_pago, estado_pago) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      await runDb(sql, [
        orderData.customer.name,
        orderData.customer.phone,
        orderData.total,
        itemsJson,
        orderData.timestamp,
        orderData.delivery.type,
        orderData.delivery.time,
        orderData.payment.method,
        orderData.payment.status,
      ]);
    }
  } catch (dbErr) {
    console.error("Error al guardar/actualizar el pedido:", dbErr);
  } finally {
    db.close();
  }

  try {
    await print(filePath, { printer: "XP-80C", timeout: 5000 });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
  }
});

// Actualizar un pedido existente
ipcMain.handle("update-order", async (event, orderData) => {
  if (!orderData.id) return false;
  const db = openDb();
  const itemsJson = JSON.stringify(orderData.items);
  const sql = `UPDATE pedidos SET cliente_nombre = ?, cliente_telefono = ?, total = ?, items_json = ?, fecha = ?, tipo_entrega = ?, hora_entrega = ?, forma_pago = ?, estado_pago = ? WHERE id = ?`;
  const params = [
    orderData.customer.name,
    orderData.customer.phone,
    orderData.total,
    itemsJson,
    orderData.timestamp,
    orderData.delivery.type,
    orderData.delivery.time,
    orderData.payment.method,
    orderData.payment.status,
    orderData.id,
  ];

  return new Promise((resolve) => {
    db.run(sql, params, function(err) { 
      db.close();
      if (err) resolve(false);
      else resolve(this.changes > 0);
    });
  });
});

// --- MANEJADOR DE ELIMINACIÓN (ANULACIÓN LÓGICA) ---
ipcMain.handle('delete-order', async (event, { orderId, motivo }) => {
    const db = openDb();
    const sql = `UPDATE pedidos SET anulado = 1, motivo_anulacion = ?, estado = 'Anulado' WHERE id = ?`;

    return new Promise((resolve) => {
        db.run(sql, [motivo, orderId], function(err) {
            db.close();
            if (err) {
                console.error(`Error al anular pedido #${orderId}:`, err.message);
                resolve({ success: false, message: err.message });
            } else {
                resolve({ success: true });
            }
        });
    });
});

// Cancelar impresión
ipcMain.handle("cancel-print", (event, filePath) => {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (error) {}
});

// Generar reporte diario
async function generateDailyReport(autoSavePath = null) {
  const db = openDb(true);
  const today = getLocalDate();
  const sql = `SELECT * FROM pedidos WHERE date(fecha, 'localtime') = ? ORDER BY id ASC`;

  let orders = [];
  try {
      orders = await new Promise((resolve, reject) => {
          db.all(sql, [today], (err, rows) => { if (err) reject(err); else resolve(rows); });
      });
  } catch(error) { return { success: false, message: error.message }; } 
  finally { db.close(); }

  if (orders.length === 0) return { success: false, message: "No hay pedidos guardados para el día de hoy." };

  let reportData = [];
  let totalVentas = 0;
  orders.forEach((order) => {
    try {
      const items = JSON.parse(order.items_json);
      items.forEach((item) => {
        const agregadosStr = item.extras && item.extras.length > 0 ? item.extras.map((e) => e.nombre).join(", ") : "";
        reportData.push({
          "ID Pedido": order.id,
          Fecha: new Date(order.fecha).toLocaleTimeString("es-CL"),
          Cliente: order.cliente_nombre,
          "Estado Pedido": order.estado, 
          "Estado Pago": order.estado_pago,
          "Forma de Pago": order.forma_pago || "",
          "Anulado": order.anulado ? "SÍ" : "NO", // Columna extra para reporte
          "Motivo Anulación": order.motivo_anulacion || "",
          Producto: item.name,
          Agregados: agregadosStr,
          Notas: item.notes || "",
          "Precio Item": item.price,
        });
      });
      if (order.anulado !== 1) totalVentas += order.total;
    } catch (parseError) {}
  });

  reportData.push({});
  reportData.push({ Producto: "TOTAL VENTAS (Sin Anulados)", "Precio Item": totalVentas });

  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(reportData);
  xlsx.utils.book_append_sheet(workbook, worksheet, "Ventas del Día");

  let finalPath = autoSavePath;
  if (!finalPath) {
    const defaultPath = path.join(app.getPath("documents"), `Reporte-Piamonte-${today}.xlsx`);
    const result = await dialog.showSaveDialog(mainWindow, { title: "Guardar Reporte de Ventas", defaultPath: defaultPath, filters: [{ name: "Excel Files", extensions: ["xlsx"] }] });
    if (result.canceled || !result.filePath) return { success: false, message: "Cancelado" };
    finalPath = result.filePath;
  }

  try {
    xlsx.writeFile(workbook, finalPath);
    return { success: true, message: `Reporte guardado en: ${finalPath}`, filePath: finalPath };
  } catch (writeError) {
    return { success: false, message: writeError.message };
  }
}

ipcMain.handle("generate-report", () => generateDailyReport());

// Guardar y enviar reporte al cerrar
async function saveAndSendReport() {
  const today = getLocalDate();
  const desktopPath = app.getPath("desktop"); 
  const reportsFolderPath = path.join(desktopPath, "reportes"); 

  try { if (!fs.existsSync(reportsFolderPath)) fs.mkdirSync(reportsFolderPath, { recursive: true }); } catch (e) {}

  const localReportPath = path.join(reportsFolderPath, `Reporte-Piamonte-${today}.xlsx`);
  await generateDailyReport(localReportPath);

  if (!process.env.EMAIL_USER) return; // Si no hay correo, no enviamos nada

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM, to: process.env.EMAIL_TO,
      subject: `Reporte de Ventas Piamonte - ${today}`,
      text: "Adjunto se encuentra el reporte de ventas del día.",
      attachments: [{ filename: `Reporte-Piamonte-${today}.xlsx`, path: localReportPath }],
    });
  } catch (error) { console.error("Error al enviar correo:", error); }
}

// Función para limpiar pedidos al cerrar 
async function clearOrdersTable() {
    const db = openDb();
    const run = (sql) => new Promise((resolve, reject) => {
        db.run(sql, [], function(err) { if (err) return reject(err); resolve(this); });
    });
    try {
        await run(`DELETE FROM pedidos`);
        await run(`DELETE FROM sqlite_sequence WHERE name='pedidos'`);
    } catch (err) { console.error('Error limpieza:', err.message); } 
    finally { db.close(); }
}

// Obtener pedidos de hoy (incluyendo columnas nuevas)
ipcMain.handle("get-todays-orders", async () => {
  const db = openDb(true);
  const today = getLocalDate();
  // Se seleccionan todas las columnas, incluyendo 'anulado' y 'motivo_anulacion'
  const sql = `SELECT * FROM pedidos WHERE date(fecha, 'localtime') = ? ORDER BY id DESC`;
  try {
    const orders = await new Promise((resolve, reject) => {
      db.all(sql, [today], (err, rows) => { if (err) reject(err); else resolve(rows); });
    });
    return orders;
  } catch (error) { return []; } 
  finally { db.close(); }
});

// Actualizar estado de entrega
ipcMain.handle("update-order-status", async (event, { orderId, status }) => {
  const db = openDb();
  return new Promise((resolve) => {
    db.run(`UPDATE pedidos SET estado = ? WHERE id = ?`, [status, orderId], function(err) {
      db.close();
      resolve(!err && this.changes > 0);
    });
  });
});

// Actualizar estado de pago
ipcMain.handle("update-payment-status", async (event, { orderId, status, paymentMethod }) => {
  const db = openDb();
  return new Promise((resolve) => {
    db.run(`UPDATE pedidos SET estado_pago = ?, forma_pago = ? WHERE id = ?`, [status, paymentMethod, orderId], function(err) {
      db.close();
      resolve(!err && this.changes > 0);
    });
  });
});

// Actualizar precios
ipcMain.handle("update-prices", async (event, updates) => {
  const db = openDb();
  return new Promise((resolve) => {
    db.serialize(async () => {
      try {
        await new Promise((res, rej) => db.run("BEGIN TRANSACTION", (err) => (err ? rej(err) : res())));
        for (const table in updates) {
          if (!updates[table]) continue;
          for (const item of updates[table]) {
            const fields = Object.keys(item).filter((k) => k !== "id");
            const setClause = fields.map((f) => `${f} = ?`).join(", ");
            const params = [...fields.map((f) => item[f]), item.id];
            await new Promise((res, rej) => db.run(`UPDATE ${table} SET ${setClause} WHERE id = ?`, params, (err) => err ? rej(err) : res()));
          }
        }
        await new Promise((res, rej) => db.run("COMMIT", (err) => (err ? rej(err) : res())));
        resolve({ success: true });
      } catch (error) {
        await new Promise((res) => db.run("ROLLBACK", () => res()));
        resolve({ success: false, message: error.message });
      } finally { db.close(); }
    });
  });
});

// --- INVENTARIO ---
ipcMain.handle("get-inventory", async () => {
  const db = openDb(true);
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM inventario ORDER BY categoria, nombre", [], (err, rows) => {
      db.close();
      if (err) reject(err); else resolve(rows);
    });
  });
});

ipcMain.handle("update-inventory", async (event, updates) => {
  const db = openDb();
  return new Promise((resolve) => {
    db.serialize(async () => {
      try {
        await new Promise((res, rej) => db.run("BEGIN TRANSACTION", (err) => (err ? rej(err) : res())));
        for (const item of updates) {
          await new Promise((res, rej) =>
            db.run(`UPDATE inventario SET cantidad = ?, comprar = ? WHERE id = ?`, [item.cantidad, item.comprar, item.id], (err) => (err ? rej(err) : res())),
          );
        }
        await new Promise((res, rej) => db.run("COMMIT", (err) => (err ? rej(err) : res())));
        resolve({ success: true });
      } catch (error) {
        await new Promise((res) => db.run("ROLLBACK", () => res()));
        resolve({ success: false, message: error.message });
      } finally { db.close(); }
    });
  });
});

ipcMain.handle("generate-shopping-list-pdf", async () => {
  const db = openDb(true);
  let itemsToBuy = [];
  try {
      itemsToBuy = await new Promise((resolve, reject) => {
          db.all(`SELECT nombre, categoria FROM inventario WHERE comprar = 1 ORDER BY categoria, nombre`, [], (err, rows) => { if (err) reject(err); else resolve(rows); });
      });
  } catch (error) { db.close(); return { success: false, message: "Error BD" }; }
  db.close();

  if (itemsToBuy.length === 0) return { success: false, message: "No hay productos marcados." };

  const tempFilePath = path.join(os.tmpdir(), `lista-compras-${Date.now()}.pdf`);
  const doc = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 50, left: 72, right: 72 } });
  const stream = fs.createWriteStream(tempFilePath);
  doc.pipe(stream);

  doc.fontSize(20).text("Lista de Compras - Pizzería Piamonte", { align: "center" });
  doc.moveDown(2);

  let currentCategory = "";
  itemsToBuy.forEach((item) => {
    if (item.categoria !== currentCategory) {
      doc.moveDown(1);
      doc.fontSize(16).text(item.categoria, { underline: true });
      doc.moveDown(0.5);
      currentCategory = item.categoria;
    }
    doc.fontSize(12).text(`- ${item.nombre}`);
  });
  doc.end();

  try {
      await new Promise((resolve, reject) => { stream.on("finish", resolve); stream.on("error", reject); });
      return { success: true, filePath: tempFilePath };
  } catch (writeError) { return { success: false, message: writeError.message }; }
});

ipcMain.handle("confirm-print-shopping-list", async (event, filePath) => {
  try {
    await print(filePath, { printer: "XP-80C", timeout: 5000 });
    return { success: true };
  } catch (error) { return { success: false, message: error.message }; } 
  finally { try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {} }
});

// --- API SERVER ---
function startApiServer() {
  const api = express();
  api.use(cors());
  api.use(express.json());
  const port = 3000;

  api.get("/ping", (req, res) => res.status(200).send("pong"));
  api.get("/api/ingredientes", (req, res) => {
    const db = openDb(true);
    db.all("SELECT * FROM inventario ORDER BY categoria, nombre", [], (err, rows) => {
      db.close();
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  api.post("/api/ingredientes/update", (req, res) => {
    const updates = Array.isArray(req.body) ? req.body : [req.body];
    const db = openDb();
    db.serialize(async () => {
      try {
        await new Promise((res, rej) => db.run("BEGIN TRANSACTION", (err) => (err ? rej(err) : res())));
        for (const item of updates) {
          if (typeof item.id === 'undefined') continue;
          const fields = [], params = [];
          if (typeof item.cantidad !== 'undefined') { fields.push("cantidad = ?"); params.push(item.cantidad); }
          if (typeof item.comprar !== 'undefined') { fields.push("comprar = ?"); params.push(item.comprar ? 1 : 0); }
          if (fields.length > 0) {
              params.push(item.id);
              await new Promise((res, rej) => db.run(`UPDATE inventario SET ${fields.join(", ")} WHERE id = ?`, params, (err) => err ? rej(err) : res()));
          }
        }
        await new Promise((res, rej) => db.run("COMMIT", (err) => (err ? rej(err) : res())));
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("inventory-updated");
        res.json({ success: true });
      } catch (error) {
        await new Promise((res) => db.run("ROLLBACK", () => res()));
        res.status(500).json({ success: false, message: error.message });
      } finally { db.close(); }
    });
  });

  api.listen(port, () => {
    console.log(`API corriendo en puerto ${port}`);
    try {
      bonjour = new Bonjour();
      bonjour.publish({ name: "Piamonte API Server", type: "http", port: port });
    } catch (error) { bonjour = null; }
  });
}

// --- VENTANA ---
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
    frame: false, autoHideMenuBar: true,
  });
  if (app.isPackaged) Menu.setApplicationMenu(null);
  mainWindow.webContents.session.clearCache().then(() => mainWindow.loadFile("index.html"));

  mainWindow.on('close', async (event) => {
    event.preventDefault();
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
             dialog.showMessageBox(mainWindow, { type: 'info', title: 'Cerrando', message: 'Generando reporte y limpiando...', buttons: [] });
        }
        await saveAndSendReport();
        await clearOrdersTable();
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    } catch (error) {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    } finally { mainWindow = null; }
  });
};

ipcMain.on("minimize-window", () => BrowserWindow.getFocusedWindow()?.minimize());
ipcMain.on("maximize-window", () => { const w = BrowserWindow.getFocusedWindow(); w?.isMaximized() ? w.unmaximize() : w?.maximize(); });
ipcMain.on("close-window", () => BrowserWindow.getFocusedWindow()?.close());

// --- START ---
app.whenReady().then(async () => {
  await ensureDatabaseSchema(); // Esperar a que termine la migración
  createWindow();
  startApiServer();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on("will-quit", async () => { if (bonjour) bonjour.unpublishAll(() => bonjour.destroy()); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });