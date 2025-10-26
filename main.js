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

// Función para abrir la base de datos
const openDb = (readOnly = false) => {
  const mode = readOnly ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE;
  return new sqlite3.Database(dbPath, mode, (err) => {
    if (err)
      console.error(`Error al abrir la base de datos en ${dbPath}:`, err.message);
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

// Generar PDF del ticket
ipcMain.handle("generate-ticket", async (event, orderData) => {
  const ticketWidth = 204; // Ancho típico para impresoras térmicas de 80mm
  const tempFilePath = path.join(os.tmpdir(), `ticket-${Date.now()}.pdf`);
  const doc = new PDFDocument({
    size: [ticketWidth, 842], // Ancho fijo, alto variable (estándar A4 como límite)
    margins: { top: 15, bottom: 10, left: 5, right: 5 },
  });
  const stream = fs.createWriteStream(tempFilePath);
  doc.pipe(stream);

  // Logo
  const logoPath = app.isPackaged
    ? path.join(process.resourcesPath, "assets/logo.jpg")
    : path.join(__dirname, "assets/logo.jpg");
  if (fs.existsSync(logoPath)) {
    const logoSize = 60;
    const xPosition = (ticketWidth - logoSize) / 2; // Centrar
    doc.image(logoPath, xPosition, doc.y, { width: logoSize, height: logoSize });
    doc.moveDown(4); // Ajustar espacio después del logo si es necesario
  }

  // Encabezado
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("Pizzería Piamonte", { align: "center" });
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
  const datePart = orderDate.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timePart = orderDate.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const formattedDateTime = `${datePart}, ${timePart}`;
  doc.text(formattedDateTime, { align: "center" });
  doc.moveDown(0.5);

  // Hora de entrega
  if (orderData.delivery.type === "demora" && orderData.delivery.time) {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`Hora estimada: ${orderData.delivery.time}`, { align: "center" });
  } else if (orderData.delivery.type === "agendado" && orderData.delivery.time) {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`Hora acordada: ${orderData.delivery.time}`, { align: "center" });
  }
  doc.moveDown(0.5);

  // Línea separadora
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .dash(2, { space: 3 })
    .stroke()
    .undash();
  doc.moveDown(0.5);

  // Items del pedido
  orderData.items.forEach((item) => {
    const yPosition = doc.y;
    const itemTextWidth = 140; // Ancho para el nombre del item
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(`${item.name}`, doc.page.margins.left, yPosition, {
        width: itemTextWidth,
        lineBreak: true, // Permitir saltos de línea si el nombre es largo
      });

    // Calcular la altura del texto del nombre para alinear el precio
    const nameHeight = doc.heightOfString(`${item.name}`, { width: itemTextWidth });

    // Dibujar el precio alineado a la derecha, en la misma línea inicial (yPosition)
    doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .text(`$${item.price.toLocaleString("es-CL")}`, doc.page.margins.left, yPosition, { // Usar yPosition original
            align: "right"
        });

    // Ajustar la posición Y *después* de dibujar nombre y precio
    // Asegurarse de que haya al menos un pequeño espacio, incluso si nameHeight es pequeño
    doc.y = yPosition + Math.max(nameHeight, 10); // Moverse debajo del texto del nombre, mínimo 10 puntos

    // Agregados y Notas (si existen)
    if (item.extras && item.extras.length > 0) {
      doc
        .font("Helvetica")
        .fontSize(10) // Un poco más pequeño para extras/notas
        .fillColor("black")
        .text(`  + ${item.extras.map((e) => e.nombre).join(", ")}`, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 10, // Un poco de margen
          indent: 10,
          lineGap: 2
        });
    }
    if (item.notes) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("black")
        .text(`  -> Nota: ${item.notes}`, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 10,
          indent: 10,
          lineGap: 2
        });
    }
    doc.moveDown(0.8); // Espacio entre items
  });


  // Línea separadora
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .dash(2, { space: 3 })
    .stroke()
    .undash();
  doc.moveDown(0.5);

  // Totales y Propina
  const totalProductos = orderData.total;
  const propina = Math.round(totalProductos * 0.1);
  const totalConPropina = totalProductos + propina;

  doc.font("Helvetica-Bold").fontSize(10);
  doc.text(`SUBTOTAL: $${totalProductos.toLocaleString("es-CL")}`, {
    align: "right", // Cambiado a right para consistencia
  });
  doc.moveDown(0.5);

  doc.font("Helvetica").fontSize(10);
  doc.text(`Propina Sugerida (10%): $${propina.toLocaleString("es-CL")}`, {
    align: "right",
  });
  doc.moveDown(0.5);

  doc.font("Helvetica-Bold").fontSize(10);
  doc.text(`TOTAL CON PROPINA: $${totalConPropina.toLocaleString("es-CL")}`, {
    align: "right",
  });

  // Finalizar el PDF
  doc.end();

  // Esperar a que el archivo se escriba completamente
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject); // Manejar errores de escritura
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
        else resolve(this); // 'this' contiene lastID para INSERT
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
      console.log(`Pedido #${orderData.id} actualizado en DB.`);
    } else {
      // Insertar nuevo pedido
      const sql = `INSERT INTO pedidos (cliente_nombre, cliente_telefono, total, items_json, fecha, tipo_entrega, hora_entrega, forma_pago, estado_pago) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const result = await runDb(sql, [
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
      console.log(`Nuevo pedido guardado en DB con ID: ${result.lastID}.`);
    }
  } catch (dbErr) {
    console.error("Error al guardar/actualizar el pedido:", dbErr);
  } finally {
    db.close((err) => {
      if (err)
        console.error("Error al cerrar DB en confirm-print:", err.message);
    });
  }

  // Intentar imprimir
  try {
    await print(filePath, { printer: "XP-80C", timeout: 5000 });
    console.log(`Ticket ${filePath} enviado a la impresora XP-80C.`);
    return { success: true };
  } catch (error) {
    console.error("Error de impresión:", error);
    return { success: false, error: error.message };
  } finally {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Archivo temporal ${filePath} eliminado.`);
        }
    } catch (unlinkErr) {
        console.error(`No se pudo borrar el archivo temporal ${filePath}:`, unlinkErr);
    }
  }
});

// Actualizar un pedido existente (sin imprimir)
ipcMain.handle("update-order", async (event, orderData) => {
  if (!orderData.id) {
      console.error("Error: Se intentó actualizar un pedido sin ID.");
      return false;
  }
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
    db.run(sql, params, function(err) { // Usar function para this.changes
      db.close((closeErr) => {
          if(closeErr) console.error("Error al cerrar DB en update-order:", closeErr.message);
      });
      if (err) {
        console.error("Error al actualizar pedido:", err.message);
        resolve(false);
      } else {
        if (this.changes > 0) {
            console.log(`Pedido #${orderData.id} actualizado correctamente.`);
            resolve(true);
        } else {
            console.warn(`No se encontró el Pedido #${orderData.id} para actualizar.`);
            resolve(false); // Indicar que no se encontró/actualizó
        }
      }
    });
  });
});

// --- INICIO CÓDIGO delete-order DE LA VERSIÓN ANTERIOR ---
ipcMain.handle('delete-order', async (event, orderId) => {
    const db = openDb();
    const today = getLocalDate(); // Obtiene la fecha actual YYYY-MM-DD
    return new Promise((resolve) => {
        db.serialize(async () => { // Asegura ejecución secuencial
            try {
                // Inicia transacción para asegurar atomicidad
                await new Promise((res, rej) => db.run('BEGIN TRANSACTION', err => err ? rej(err) : res()));
                console.log(`[Delete Tx] Iniciada para eliminar pedido ${orderId}`);

                // 1. Elimina el pedido específico
                const deleteResult = await new Promise((res, rej) => {
                    db.run('DELETE FROM pedidos WHERE id = ?', [orderId], function(err) {
                        if (err) {
                            console.error(`[Delete Tx] Error eliminando pedido ${orderId}: ${err.message}`);
                            return rej(err);
                        }
                        if (this.changes === 0) {
                            console.warn(`[Delete Tx] Pedido ${orderId} no encontrado para eliminar.`);
                            // Podríamos decidir si continuar o abortar aquí. Por ahora, continuamos.
                        } else {
                            console.log(`[Delete Tx] Pedido ${orderId} eliminado.`);
                        }
                        res(this.changes);
                    });
                });

                // 2. Obtiene todos los pedidos restantes DEL DÍA DE HOY (ordenados por ID original)
                const remainingOrders = await new Promise((res, rej) => {
                    // Selecciona solo los pedidos del día actual
                    const sql = `SELECT * FROM pedidos WHERE date(fecha, 'localtime') = ? ORDER BY id ASC`;
                    db.all(sql, [today], (err, rows) => {
                        if (err) {
                            console.error(`[Delete Tx] Error obteniendo pedidos restantes del día ${today}: ${err.message}`);
                            return rej(err);
                        }
                        console.log(`[Delete Tx] ${rows.length} pedidos restantes encontrados para hoy.`);
                        res(rows);
                    });
                });

                // 3. ¡Elimina TODOS los pedidos DEL DÍA DE HOY! (para luego reinsertarlos renumerados)
                await new Promise((res, rej) => {
                    db.run(`DELETE FROM pedidos WHERE date(fecha, 'localtime') = ?`, [today], function(err) {
                        if (err) {
                            console.error(`[Delete Tx] Error eliminando TODOS los pedidos del día ${today}: ${err.message}`);
                            return rej(err);
                        }
                        console.log(`[Delete Tx] ${this.changes} pedidos eliminados para hoy (preparando re-inserción).`);
                        res();
                    });
                });

                // 4. Resetea el contador de autoincremento para la tabla 'pedidos'.
                //    Esto hará que el próximo INSERT empiece desde 1 (o el siguiente ID disponible si hubiera pedidos de otros días).
                //    Si solo queremos renumerar los de hoy desde 1, esto podría no ser lo ideal si hay pedidos de otros días.
                //    NOTA: Si SQLite no encuentra la fila, no da error.
                await new Promise((res, rej) => {
                    db.run(`DELETE FROM sqlite_sequence WHERE name='pedidos'`, err => {
                        if (err) {
                           console.warn(`[Delete Tx] Advertencia: No se pudo eliminar la secuencia de 'pedidos'. Puede que no existiera aún: ${err.message}`);
                           // No rechazamos la promesa aquí, ya que puede ser normal si la tabla está vacía.
                        } else {
                           console.log(`[Delete Tx] Secuencia de autoincremento para 'pedidos' reseteada.`);
                        }
                        res();
                    });
                });

                // 5. Reinserta los pedidos restantes DEL DÍA DE HOY (esto los renumerará secuencialmente)
                console.log(`[Delete Tx] Reinsertando ${remainingOrders.length} pedidos para hoy...`);
                for (const order of remainingOrders) {
                    const sql = `INSERT INTO pedidos (cliente_nombre, cliente_telefono, total, items_json, fecha, estado, tipo_entrega, hora_entrega, forma_pago, estado_pago) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                    const params = [order.cliente_nombre, order.cliente_telefono, order.total, order.items_json, order.fecha, order.estado, order.tipo_entrega, order.hora_entrega, order.forma_pago, order.estado_pago];
                    // El ID será asignado automáticamente por SQLite, empezando desde 1 (o el siguiente disponible globalmente)
                    await new Promise((res, rej) => {
                        db.run(sql, params, function(err) { // Usar function para obtener lastID
                            if (err) {
                                console.error(`[Delete Tx] Error reinsertando pedido (ID original ${order.id}): ${err.message}`);
                                return rej(err);
                            }
                            console.log(`[Delete Tx] Pedido (ID original ${order.id}) reinsertado con nuevo ID ${this.lastID}.`);
                            res();
                        });
                    });
                }
                console.log(`[Delete Tx] Re-inserción completada.`);

                // 6. Confirma la transacción completa
                await new Promise((res, rej) => db.run('COMMIT', err => {
                    if (err) {
                        console.error(`[Delete Tx] Error al hacer COMMIT: ${err.message}`);
                        return rej(err);
                    }
                    console.log(`[Delete Tx] COMMIT exitoso.`);
                    res();
                }));

                resolve(true); // Indica que la operación fue exitosa

            } catch (error) {
                console.error("[Delete Tx] Error en la transacción, revirtiendo cambios:", error);
                // Intenta revertir la transacción en caso de cualquier error
                await new Promise((res) => db.run('ROLLBACK', err => {
                     if(err) console.error(`[Delete Tx] Error durante ROLLBACK: ${err.message}`);
                     res(); // Resuelve incluso si el rollback falla, para poder cerrar la DB.
                }));
                resolve(false); // Indica que la operación falló
            } finally {
                // Cierra la conexión a la base de datos en cualquier caso
                db.close((err) => {
                    if (err) console.error(`[Delete Tx] Error al cerrar la DB: ${err.message}`);
                });
            }
        });
    });
});
// --- FIN CÓDIGO delete-order DE LA VERSIÓN ANTERIOR ---


// Cancelar impresión (borrar archivo temporal)
ipcMain.handle("cancel-print", (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Archivo temporal ${filePath} cancelado y eliminado.`);
    }
  } catch (error) {
    console.error(`No se pudo borrar el archivo temporal ${filePath}:`, error);
  }
});

// Generar reporte diario en Excel
async function generateDailyReport(autoSavePath = null) {
  const db = openDb(true);
  const today = getLocalDate();
  const sql = `SELECT * FROM pedidos WHERE date(fecha, 'localtime') = ? ORDER BY id ASC`; // Ordenar por ID ascendente para el reporte

  let orders = [];
  try {
      orders = await new Promise((resolve, reject) => {
          db.all(sql, [today], (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
          });
      });
  } catch(error) {
      console.error("Error al obtener pedidos para reporte:", error);
      return { success: false, message: "Error al leer la base de datos para generar el reporte." };
  } finally {
      db.close((err) => {
        if (err) console.error("Error al cerrar DB en generateDailyReport (lectura):", err.message);
      });
  }


  if (orders.length === 0) {
    console.log("No hay pedidos para generar reporte hoy.");
    return { success: false, message: "No hay pedidos guardados para el día de hoy." };
  }

  let reportData = [];
  let totalVentas = 0;
  orders.forEach((order) => {
    try { // Añadir try-catch por si items_json está mal formado
      const items = JSON.parse(order.items_json);
      items.forEach((item) => {
        const agregadosStr = item.extras && item.extras.length > 0 ? item.extras.map((e) => e.nombre).join(", ") : "";
        reportData.push({
          "ID Pedido": order.id,
          Fecha: new Date(order.fecha).toLocaleTimeString("es-CL"), // Solo hora para simplificar
          Cliente: order.cliente_nombre,
          "Estado Pedido": order.estado,
          "Estado Pago": order.estado_pago,
          "Forma de Pago": order.forma_pago || "",
          Producto: item.name,
          Agregados: agregadosStr,
          Notas: item.notes || "",
          "Precio Item": item.price,
        });
      });
      totalVentas += order.total;
    } catch (parseError) {
      console.error(`Error al parsear items del pedido #${order.id}:`, parseError);
      // Opcional: añadir una fila de error al reporte
      reportData.push({ "ID Pedido": order.id, Cliente: order.cliente_nombre, Producto: "ERROR AL LEER ITEMS" });
    }
  });

  // Fila separadora y Total
  reportData.push({}); // Fila vacía como separador
  reportData.push({ Producto: "TOTAL VENTAS", "Precio Item": totalVentas });

  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(reportData);

  // Ajustar anchos de columna (aproximado)
  worksheet["!cols"] = [
    { wch: 8 },  // ID Pedido
    { wch: 10 }, // Fecha (Hora)
    { wch: 25 }, // Cliente
    { wch: 15 }, // Estado Pedido
    { wch: 15 }, // Estado Pago
    { wch: 15 }, // Forma de Pago
    { wch: 35 }, // Producto
    { wch: 30 }, // Agregados
    { wch: 30 }, // Notas
    { wch: 12 }, // Precio Item
  ];

  xlsx.utils.book_append_sheet(workbook, worksheet, "Ventas del Día");

  let finalPath = autoSavePath; // Usar la ruta automática si se proporcionó

  if (!finalPath) {
    // Si no hay ruta automática, preguntar al usuario dónde guardar
    const defaultPath = path.join(
      app.getPath("documents"),
      `Reporte-Piamonte-${today}.xlsx`
    );
    const result = await dialog.showSaveDialog(mainWindow, { // Pasar mainWindow para que el diálogo sea modal
      title: "Guardar Reporte de Ventas",
      defaultPath: defaultPath,
      filters: [{ name: "Excel Files", extensions: ["xlsx"] }],
    });
    if (result.canceled || !result.filePath) {
      console.log("Guardado de reporte cancelado por el usuario.");
      return { success: false, message: "Guardado cancelado por el usuario." };
    }
    finalPath = result.filePath;
  }

  // Guardar el archivo Excel
  try {
    xlsx.writeFile(workbook, finalPath);
    console.log(`Reporte guardado en: ${finalPath}`);
    return { success: true, message: `Reporte guardado en: ${finalPath}`, filePath: finalPath };
  } catch (writeError) {
    console.error(`Error al escribir el archivo Excel en ${finalPath}:`, writeError);
    return { success: false, message: `Error al guardar el archivo: ${writeError.message}` };
  }
}

ipcMain.handle("generate-report", () => generateDailyReport()); // Para el botón manual

// Guardar reporte localmente y enviarlo por correo (usado al cerrar)
async function saveAndSendReport() {
  const today = getLocalDate();
  const desktopPath = app.getPath("desktop"); // Guardar en Escritorio
  const reportsFolderPath = path.join(desktopPath, "reportes"); // Carpeta 'reportes' en Escritorio

  // Crear carpeta si no existe
  try {
    if (!fs.existsSync(reportsFolderPath)) {
      fs.mkdirSync(reportsFolderPath, { recursive: true });
    }
  } catch (mkdirError) {
      console.error("No se pudo crear la carpeta de reportes:", mkdirError);
      dialog.showErrorBox("Error Guardado Local", `No se pudo crear la carpeta 'reportes' en el Escritorio.`);
  }


  const localReportPath = path.join(
    reportsFolderPath,
    `Reporte-Piamonte-${today}.xlsx`
  );

  // Generar y guardar el reporte localmente
  const localReportResult = await generateDailyReport(localReportPath);

  if (!localReportResult.success && localReportResult.message === "No hay pedidos guardados para el día de hoy.") {
      if (mainWindow && !mainWindow.isDestroyed()) { // Solo mostrar si la ventana existe
        dialog.showMessageBoxSync(mainWindow, {
            type: "info",
            title: "Sin Reporte",
            message: "No se encontraron ventas el día de hoy. No se generó ningún reporte.",
        });
      }
      console.log("No hay reporte para guardar o enviar.");
      return; // Salir si no hay pedidos
  } else if (!localReportResult.success) {
      // Hubo otro error al generar/guardar localmente
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showErrorBox("Error Guardado Local", `No se pudo generar o guardar el reporte localmente:\n${localReportResult.message}`);
      }
      return;
  }

  // Si se guardó localmente, informar al usuario (solo si la ventana existe)
  if (mainWindow && !mainWindow.isDestroyed()) {
    dialog.showMessageBoxSync(mainWindow, {
        type: "info",
        title: "Respaldo Local Creado",
        message: `El reporte de ventas se ha guardado en:\n${localReportPath}`,
    });
  }


  // Intentar enviar por correo con Gmail
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.EMAIL_TO || !process.env.EMAIL_FROM) {
    console.log("Faltan credenciales de Gmail en .env. Omitiendo envío de correo.");
    if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBoxSync(mainWindow, {
            type: "warning",
            title: "Envío Omitido",
            message: "No se configuraron todas las credenciales de correo en .env para enviar el reporte automáticamente.",
        });
    }
    return; // Salir si falta configuración
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_TO,
      subject: `Reporte de Ventas Piamonte - ${today}`,
      text: "Adjunto se encuentra el reporte de ventas del día.",
      attachments: [
        {
          filename: `Reporte-Piamonte-${today}.xlsx`,
          path: localReportPath, // Usar la ruta del archivo local generado
        },
      ],
    });
    console.log("Correo de reporte enviado exitosamente.");
    if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBoxSync(mainWindow, {
            type: "info",
            title: "Reporte Enviado",
            message: "El reporte de ventas también fue enviado exitosamente al correo configurado.",
        });
    }
  } catch (error) {
    console.error("Error al enviar el correo:", error);
    if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showErrorBox(
            "Error al Enviar Reporte",
            `No se pudo enviar el reporte por correo:\n${error.message}`
        );
    }
  }
}

// Limpiar tabla de pedidos (¡Usar con precaución!)
// Esta función ahora solo limpia la tabla, la renumeración se hace en delete-order
async function clearOrdersTable() {
    console.log('Limpiando y reseteando la tabla de pedidos...');
    const db = openDb();
    const run = (sql) => new Promise((resolve, reject) => {
        db.run(sql, [], function(err) { if (err) return reject(err); resolve(this); });
    });
    try {
        await run(`DELETE FROM pedidos`);
        await run(`DELETE FROM sqlite_sequence WHERE name='pedidos'`); // Resetea el autoincremento
        console.log("Tabla de pedidos limpiada y contador reseteado.");
    } catch (err) {
        console.error('Error durante la limpieza de la tabla:', err.message);
    } finally {
        db.close((err) => {
            if (err) console.error('Error al cerrar la DB después de limpiar:', err.message);
        });
    }
}


// Obtener pedidos del día
ipcMain.handle("get-todays-orders", async () => {
  const db = openDb(true);
  const today = getLocalDate();
  // Ordenar por ID ASCENDENTE para mostrarlos en orden cronológico en la interfaz
  const sql = `SELECT * FROM pedidos WHERE date(fecha, 'localtime') = ? ORDER BY id DESC`;
  try {
    const orders = await new Promise((resolve, reject) => {
      db.all(sql, [today], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    return orders;
  } catch (error) {
    console.error("Error al obtener pedidos de hoy:", error);
    return [];
  } finally {
    db.close((err) => {
        if (err) console.error("Error al cerrar DB en get-todays-orders:", err.message);
    });
  }
});

// Actualizar estado de entrega
ipcMain.handle("update-order-status", async (event, { orderId, status }) => {
  const db = openDb();
  const sql = `UPDATE pedidos SET estado = ? WHERE id = ?`;
  return new Promise((resolve) => {
    db.run(sql, [status, orderId], function(err) {
      db.close((closeErr) => { if(closeErr) console.error("Error al cerrar DB en update-order-status:", closeErr.message); });
      if (err) {
        console.error("Error al actualizar estado de entrega:", err.message);
        resolve(false);
      } else {
        resolve(this.changes > 0);
      }
    });
  });
});

// Actualizar estado de pago
ipcMain.handle("update-payment-status", async (event, { orderId, status, paymentMethod }) => {
  const db = openDb();
  const sql = `UPDATE pedidos SET estado_pago = ?, forma_pago = ? WHERE id = ?`;
  return new Promise((resolve) => {
    db.run(sql, [status, paymentMethod, orderId], function(err) {
      db.close((closeErr) => { if(closeErr) console.error("Error al cerrar DB en update-payment-status:", closeErr.message); });
      if (err) {
        console.error("Error al actualizar estado de pago:", err.message);
        resolve(false);
      } else {
        resolve(this.changes > 0);
      }
    });
  });
});

// Actualizar precios de productos
ipcMain.handle("update-prices", async (event, updates) => {
  const db = openDb();
  return new Promise((resolve) => {
    db.serialize(async () => {
      try {
        await new Promise((res, rej) => db.run("BEGIN TRANSACTION", (err) => (err ? rej(err) : res())));

        for (const table in updates) {
          if (!updates[table] || updates[table].length === 0) continue;

          for (const item of updates[table]) {
            const fields = Object.keys(item).filter((k) => k !== "id");
            if (fields.length === 0) continue;

            const setClause = fields.map((f) => `${f} = ?`).join(", ");
            const params = fields.map((f) => item[f]);
            params.push(item.id);

            const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;

            await new Promise((res, rej) => db.run(sql, params, function(err) {
                if (err) { console.error(`Error actualizando ${table} ID ${item.id}:`, err); rej(err); }
                else { if (this.changes === 0) console.warn(`No se encontró ${table} con ID ${item.id} para actualizar.`); res(); }
            }));
          }
        }

        await new Promise((res, rej) => db.run("COMMIT", (err) => (err ? rej(err) : res())));
        console.log("Precios actualizados correctamente.");
        resolve({ success: true });
      } catch (error) {
        console.error("Error en la transacción de actualización de precios, revirtiendo:", error);
        await new Promise((res) => db.run("ROLLBACK", (err) => { if (err) console.error("Error durante ROLLBACK:", err); res(); }));
        resolve({ success: false, message: error.message });
      } finally {
        db.close((err) => { if (err) console.error("Error al cerrar DB en update-prices:", err.message); });
      }
    });
  });
});


// --- INVENTARIO ---

// Obtener inventario
ipcMain.handle("get-inventory", async () => {
  const db = openDb(true);
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM inventario ORDER BY categoria, nombre", [], (err, rows) => {
      db.close((closeErr) => { if(closeErr) console.error("Error al cerrar DB en get-inventory:", closeErr.message); });
      if (err) { console.error("Error al obtener inventario:", err); reject(err); }
      else resolve(rows);
    });
  });
});

// Actualizar inventario
ipcMain.handle("update-inventory", async (event, updates) => {
  const db = openDb();
  return new Promise((resolve) => {
    db.serialize(async () => {
      try {
        await new Promise((res, rej) => db.run("BEGIN TRANSACTION", (err) => (err ? rej(err) : res())));
        for (const item of updates) {
          const sql = `UPDATE inventario SET cantidad = ?, comprar = ? WHERE id = ?`;
          await new Promise((res, rej) =>
            db.run(sql, [item.cantidad, item.comprar, item.id], (err) => (err ? rej(err) : res())),
          );
        }
        await new Promise((res, rej) => db.run("COMMIT", (err) => (err ? rej(err) : res())));
        console.log("Inventario actualizado en DB.");
        resolve({ success: true });
      } catch (error) {
        console.error("Error en transacción de actualización de inventario:", error);
        await new Promise((res) => db.run("ROLLBACK", (err) => { if(err) console.error("Error durante ROLLBACK de inventario:", err); res(); }));
        resolve({ success: false, message: error.message });
      } finally {
        db.close((err) => { if (err) console.error("Error al cerrar DB en update-inventory:", err.message); });
      }
    });
  });
});

// Generar PDF de lista de compras
ipcMain.handle("generate-shopping-list-pdf", async () => {
  const db = openDb(true);
  let itemsToBuy = [];
  try {
      itemsToBuy = await new Promise((resolve, reject) => {
          const sql = `SELECT nombre, categoria FROM inventario WHERE comprar = 1 ORDER BY categoria, nombre`;
          db.all(sql, [], (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
          });
      });
  } catch (error) {
      console.error("Error al obtener lista de compras:", error);
      return { success: false, message: "Error al leer la base de datos." };
  } finally {
      db.close((err) => { if (err) console.error("Error al cerrar DB en generate-shopping-list-pdf (lectura):", err.message); });
  }

  if (itemsToBuy.length === 0) {
    return { success: false, message: "No hay productos marcados para comprar." };
  }

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
      console.log(`Lista de compras PDF generada en: ${tempFilePath}`);
      return { success: true, filePath: tempFilePath };
  } catch (writeError) {
      console.error("Error al escribir PDF de lista de compras:", writeError);
      return { success: false, message: `Error al generar el archivo: ${writeError.message}` };
  }
});

// Confirmar impresión de lista de compras
ipcMain.handle("confirm-print-shopping-list", async (event, filePath) => {
  try {
    await print(filePath, { printer: "XP-80C", timeout: 5000 });
    console.log(`Lista de compras ${filePath} enviada a la impresora XP-80C.`);
    return { success: true, message: "Lista de compras enviada a la impresora." };
  } catch (error) {
    console.error("Error al imprimir la lista de compras:", error);
    return { success: false, message: `Error de impresión: ${error.message}` };
  } finally {
     try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); }
     catch (unlinkErr) { console.error(`No se pudo borrar el archivo temporal ${filePath}:`, unlinkErr); }
  }
});

// --- API SERVER para Inventario Remoto ---
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
      if (err) { console.error("API Error en /api/ingredientes:", err.message); return res.status(500).json({ error: err.message }); }
      res.json(rows);
    });
  });

  api.post("/api/ingredientes/update", (req, res) => {
    const updates = Array.isArray(req.body) ? req.body : [req.body];
    if (updates.length === 0) return res.status(400).json({ success: false, message: "No hay datos para actualizar." });

    const db = openDb();
    db.serialize(async () => {
      try {
        await new Promise((res, rej) => db.run("BEGIN TRANSACTION", (err) => (err ? rej(err) : res())));
        for (const item of updates) {
          if (typeof item.id === 'undefined' || (typeof item.cantidad === 'undefined' && typeof item.comprar === 'undefined')) {
             console.warn("API /update: Item inválido recibido - ", item); continue;
          }
          const fieldsToUpdate = [], params = [];
          if (typeof item.cantidad !== 'undefined') { fieldsToUpdate.push("cantidad = ?"); params.push(item.cantidad); }
          if (typeof item.comprar !== 'undefined') { fieldsToUpdate.push("comprar = ?"); params.push(item.comprar ? 1 : 0); }
          if (fieldsToUpdate.length > 0) {
              params.push(item.id);
              const sql = `UPDATE inventario SET ${fieldsToUpdate.join(", ")} WHERE id = ?`;
              await new Promise((resolveUpdate, rejectUpdate) =>
                  db.run(sql, params, function(err) {
                      if (err) { console.error(`API Error actualizando ID ${item.id}:`, err); rejectUpdate(err); }
                      else { if (this.changes === 0) console.warn(`API /update: No se encontró ID ${item.id} para actualizar.`); resolveUpdate(); }
                  })
              );
          }
        }
        await new Promise((res, rej) => db.run("COMMIT", (err) => (err ? rej(err) : res())));
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("inventory-updated");
        res.json({ success: true, message: "Inventario actualizado." });
      } catch (error) {
        console.error("Error en API /api/ingredientes/update (Transacción):", error);
        await new Promise((res) => db.run("ROLLBACK", (err) => { if (err) console.error("Error durante ROLLBACK en API /update:", err); res(); }));
        res.status(500).json({ success: false, message: error.message || "Error interno del servidor" });
      } finally {
        db.close((err) => { if (err) console.error("Error al cerrar DB en API /update:", err.message); });
      }
    });
  });

  api.listen(port, () => {
    console.log(`API de inventario corriendo en http://localhost:${port}`);
    try {
      bonjour = new Bonjour();
      bonjour.publish({ name: "Piamonte API Server", type: "http", port: port });
      console.log("Servicio de inventario anunciado en la red local.");
    } catch (error) { console.error("Error al anunciar el servicio Bonjour:", error); bonjour = null; }
  });
}

// --- CREACIÓN DE LA VENTANA PRINCIPAL ---
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: false,
    autoHideMenuBar: true,
  });

  if (app.isPackaged) Menu.setApplicationMenu(null);

  mainWindow.webContents.session.clearCache().then(() => mainWindow.loadFile("index.html"));

  mainWindow.on('close', async (event) => {
    console.log("Ventana principal intentando cerrar...");
    event.preventDefault();
    try {
        console.log("Generando y enviando reporte final (si aplica)...");
        if (mainWindow && !mainWindow.isDestroyed()) {
             dialog.showMessageBox(mainWindow, { type: 'info', title: 'Cerrando', message: 'Generando reporte final...', buttons: [] });
        }
        await saveAndSendReport(); // Guarda local y envía email

        // --> Llamada a clearOrdersTable movida al evento 'will-quit'
        // await clearOrdersTable();

        console.log("Proceso de cierre (reporte/limpieza) finalizado.");
         if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    } catch (error) {
        console.error("Error durante el proceso de cierre:", error);
        if (mainWindow && !mainWindow.isDestroyed()) dialog.showErrorBox("Error al Cerrar", `Ocurrió un error:\n${error.message}`);
         if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy(); // Cierra igual
    } finally {
        mainWindow = null;
    }
  });

  mainWindow.on('closed', () => mainWindow = null );
};

// --- MANEJADORES DE BOTONES DE BARRA DE TÍTULO ---
ipcMain.on("minimize-window", () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.minimize(); });
ipcMain.on("maximize-window", () => { const w = BrowserWindow.getFocusedWindow(); if (w) { if (w.isMaximized()) w.unmaximize(); else w.maximize(); } });
ipcMain.on("close-window", () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.close(); }); // Esto disparará el evento 'close' de la ventana

// --- EVENTOS DEL CICLO DE VIDA DE LA APP ---
app.whenReady().then(() => {
  createWindow();
  startApiServer();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("will-quit", async (event) => {
    // Previene el cierre inmediato para asegurar que la limpieza se complete
    event.preventDefault();
    console.log("Evento 'will-quit' recibido. Limpiando...");

    // Detener Bonjour
    if (bonjour) {
        console.log("Deteniendo Bonjour...");
        await new Promise(resolve => {
            bonjour.unpublishAll(() => {
                bonjour.destroy();
                console.log("Bonjour detenido.");
                bonjour = null;
                resolve();
            });
        });
    } else {
        console.log("Bonjour ya estaba detenido.");
    }

    // Limpiar la tabla de pedidos AHORA, justo antes de salir
    console.log("Limpiando tabla de pedidos antes de salir...");
    await clearOrdersTable(); // Espera a que termine la limpieza
    console.log("Limpieza de tabla de pedidos completada.");

    // Ahora permite que la aplicación se cierre
    app.quit();
});


app.on("window-all-closed", () => {
  // En macOS es común que la aplicación permanezca activa sin ventanas.
  // En otros sistemas operativos, usualmente se cierra.
  // La lógica de saveAndSendReport y clearOrdersTable se movió al 'close' de la ventana principal
  // y 'will-quit' respectivamente, por lo que aquí solo cerramos si no es macOS.
  if (process.platform !== "darwin") {
    console.log("Todas las ventanas cerradas, la app se cerrará (manejado por 'will-quit').");
    // app.quit() se llamará después de 'will-quit'
  }
});

// --- Manejo de errores no capturados ---
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    if (mainWindow && !mainWindow.isDestroyed()) dialog.showErrorBox('Error Crítico', `Error: ${error.message}`);
    // Considera cerrar la app aquí si el error es grave
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
     if (mainWindow && !mainWindow.isDestroyed()) dialog.showErrorBox('Error Asíncrono', `Error: ${reason}`);
});