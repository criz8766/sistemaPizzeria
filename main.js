const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron")
const path = require("path")
const sqlite3 = require("sqlite3").verbose()
const PDFDocument = require("pdfkit")
const { print } = require("pdf-to-printer")
const fs = require("fs")
const os = require("os")
const xlsx = require("xlsx")
const nodemailer = require("nodemailer")
const express = require("express")
const cors = require("cors")
const { Bonjour } = require("bonjour-service")

let mainWindow
let bonjour

const userDataPath = app.getPath("userData")
const dbPath = path.join(userDataPath, "piamonte.db")
const sourceDbPath = app.isPackaged
  ? path.join(process.resourcesPath, "piamonte.db")
  : path.join(__dirname, "piamonte.db")

if (!fs.existsSync(dbPath)) {
  try {
    fs.copyFileSync(sourceDbPath, dbPath)
    console.log(`Base de datos copiada a: ${dbPath}`)
  } catch (error) {
    console.error("Error al copiar la base de datos:", error)
  }
}

const envPath = app.isPackaged ? path.join(process.resourcesPath, ".env") : path.join(__dirname, ".env")
require("dotenv").config({ path: envPath })

const openDb = (readOnly = false) => {
  const mode = readOnly ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE
  return new sqlite3.Database(dbPath, mode, (err) => {
    if (err) console.error(`Error al abrir la base de datos en ${dbPath}:`, err.message)
  })
}

const getLocalDate = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

ipcMain.handle("get-products", async () => {
  const db = openDb(true)
  const runQuery = (sql) =>
    new Promise((resolve, reject) => {
      db.all(sql, [], (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
  try {
    const products = await Promise.all([
      runQuery("SELECT * FROM pizzas ORDER BY nombre"),
      runQuery("SELECT * FROM churrascos ORDER BY nombre"),
      runQuery("SELECT * FROM agregados ORDER BY nombre"),
      runQuery("SELECT * FROM otros_productos ORDER BY categoria, nombre"),
    ])
    return { pizzas: products[0], churrascos: products[1], agregados: products[2], otros: products[3] }
  } catch (error) {
    console.error(error)
    return {}
  } finally {
    db.close()
  }
})

ipcMain.handle("generate-ticket", async (event, orderData) => {
  const ticketWidth = 204
  const tempFilePath = path.join(os.tmpdir(), `ticket-${Date.now()}.pdf`)
  const doc = new PDFDocument({ size: [ticketWidth, 842], margins: { top: 15, bottom: 10, left: 5, right: 5 } })
  const stream = fs.createWriteStream(tempFilePath)
  doc.pipe(stream)

  const logoPath = app.isPackaged
    ? path.join(process.resourcesPath, "assets/logo.jpg")
    : path.join(__dirname, "assets/logo.jpg")
  if (fs.existsSync(logoPath)) {
    const logoSize = 60 // Tamaño del logo en puntos
    const xPosition = (ticketWidth - logoSize) / 2 // Centrar horizontalmente
    doc.image(logoPath, xPosition, doc.y, { width: logoSize, height: logoSize })
    doc.moveDown(4) // Espacio después del logo
  }

  doc.font("Helvetica-Bold").fontSize(14).text("Pizzería Piamonte", { align: "center" })
  doc.moveDown(0.5)
  doc.font("Helvetica").fontSize(9)
  doc.text("Fono: 422228001", { align: "center" })
  doc.text("WhatsApp: +56946914655", { align: "center" })
  doc.text("Instagram: @pizzeria_piamonte_chillan", { align: "center" })
  doc.moveDown(1)
  doc.font("Helvetica").fontSize(10)
  doc.text(`Pedido para: ${orderData.customer.name}`, { align: "center" })
  const orderDate = new Date(orderData.timestamp)
  const datePart = orderDate.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" })
  const timePart = orderDate.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false })
  const formattedDateTime = `${datePart}, ${timePart}`
  doc.text(formattedDateTime, { align: "center" })
  doc.moveDown(0.5)
  if (orderData.delivery.type === "demora" && orderData.delivery.time) {
    doc.font("Helvetica-Bold").fontSize(10).text(`Hora estimada: ${orderData.delivery.time}`, { align: "center" })
  } else if (orderData.delivery.type === "agendado" && orderData.delivery.time) {
    doc.font("Helvetica-Bold").fontSize(10).text(`Hora acordada: ${orderData.delivery.time}`, { align: "center" })
  }
  doc.moveDown(0.5)
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .dash(2, { space: 3 })
    .stroke()
    .undash()
  doc.moveDown(0.5)
  orderData.items.forEach((item) => {
    const yPosition = doc.y
    const itemTextWidth = 140
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(`${item.name}`, doc.page.margins.left, yPosition, { width: itemTextWidth })
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(`$${item.price.toLocaleString("es-CL")}`, doc.page.margins.left, yPosition, { align: "right" })
    const nameHeight = doc.heightOfString(`${item.name}`, { width: itemTextWidth })
    doc.y = yPosition + nameHeight
    if (item.extras && item.extras.length > 0) {
      doc
        .font("Helvetica")
        .fontSize(12)
        .fillColor("black")
        .text(`  + ${item.extras.map((e) => e.nombre).join(", ")}`, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        })
    }
    if (item.notes) {
      doc
        .font("Helvetica")
        .fontSize(12)
        .fillColor("black")
        .text(`  -> Nota: ${item.notes}`, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right })
    }
    doc.moveDown(0.8)
  })
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .dash(2, { space: 3 })
    .stroke()
    .undash()
  doc.moveDown(0.5)
  const totalProductos = orderData.total
  const propina = Math.round(totalProductos * 0.1)
  const totalConPropina = totalProductos + propina
  doc.font("Helvetica-Bold").fontSize(10)
  doc.text(`SUBTOTAL: $${totalProductos.toLocaleString("es-CL")}`, { align: "center" })
  doc.moveDown(0.5)
  doc.font("Helvetica").fontSize(10)
  doc.text(`Propina Sugerida (10%): $${propina.toLocaleString("es-CL")}`, { align: "right" })
  doc.moveDown(0.5)
  doc.font("Helvetica-Bold").fontSize(10)
  doc.text(`TOTAL CON PROPINA: $${totalConPropina.toLocaleString("es-CL")}`, { align: "right" })
  doc.end()
  await new Promise((resolve) => stream.on("finish", resolve))
  return tempFilePath
})

ipcMain.handle("confirm-print", async (event, { filePath, orderData }) => {
  const db = openDb()
  const itemsJson = JSON.stringify(orderData.items)
  const runDb = (sql, params) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err)
        else resolve(this)
      })
    })
  try {
    if (orderData.id) {
      const sql = `UPDATE pedidos SET cliente_nombre = ?, cliente_telefono = ?, total = ?, items_json = ?, fecha = ?, tipo_entrega = ?, hora_entrega = ?, forma_pago = ?, estado_pago = ? WHERE id = ?`
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
      ])
    } else {
      const sql = `INSERT INTO pedidos (cliente_nombre, cliente_telefono, total, items_json, fecha, tipo_entrega, hora_entrega, forma_pago, estado_pago) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      ])
    }
  } catch (dbErr) {
    console.error("Error al guardar el pedido:", dbErr)
  } finally {
    db.close()
  }
  try {
    await print(filePath, { printer: "XP-80C", timeout: 5000 })
    return { success: true }
  } catch (error) {
    console.error("Error de impresión:", error)
    return { success: false, error: error.message }
  } finally {
    fs.unlinkSync(filePath)
  }
})

ipcMain.handle("update-order", async (event, orderData) => {
  const db = openDb()
  const itemsJson = JSON.stringify(orderData.items)
  const sql = `UPDATE pedidos SET cliente_nombre = ?, cliente_telefono = ?, total = ?, items_json = ?, fecha = ?, tipo_entrega = ?, hora_entrega = ?, forma_pago = ?, estado_pago = ? WHERE id = ?`
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
  ]
  return new Promise((resolve) => {
    db.run(sql, params, (err) => {
      db.close()
      if (err) {
        console.error("Error al actualizar pedido:", err.message)
        resolve(false)
      } else {
        console.log(`Pedido #${orderData.id} actualizado correctamente.`)
        resolve(true)
      }
    })
  })
})

ipcMain.handle("delete-order", async (event, orderId) => {
  const db = openDb()
  const today = getLocalDate()
  return new Promise((resolve) => {
    db.serialize(async () => {
      try {
        await new Promise((res, rej) => db.run("BEGIN TRANSACTION", (err) => (err ? rej(err) : res())))
        await new Promise((res, rej) =>
          db.run("DELETE FROM pedidos WHERE id = ?", [orderId], (err) => (err ? rej(err) : res())),
        )
        const remainingOrders = await new Promise((res, rej) => {
          const sql = `SELECT * FROM pedidos WHERE date(fecha, 'localtime') = ? ORDER BY id ASC`
          db.all(sql, [today], (err, rows) => (err ? rej(err) : res(rows)))
        })
        await new Promise((res, rej) =>
          db.run(`DELETE FROM pedidos WHERE date(fecha, 'localtime') = ?`, [today], (err) => (err ? rej(err) : res())),
        )
        await new Promise((res, rej) =>
          db.run(`DELETE FROM sqlite_sequence WHERE name='pedidos'`, (err) => (err ? rej(err) : res())),
        )
        for (const order of remainingOrders) {
          const sql = `INSERT INTO pedidos (cliente_nombre, cliente_telefono, total, items_json, fecha, estado, tipo_entrega, hora_entrega, forma_pago, estado_pago) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          const params = [
            order.cliente_nombre,
            order.cliente_telefono,
            order.total,
            order.items_json,
            order.fecha,
            order.estado,
            order.tipo_entrega,
            order.hora_entrega,
            order.forma_pago,
            order.estado_pago,
          ]
          await new Promise((res, rej) => db.run(sql, params, (err) => (err ? rej(err) : res())))
        }
        await new Promise((res, rej) => db.run("COMMIT", (err) => (err ? rej(err) : res())))
        resolve(true)
      } catch (error) {
        console.error("Error en la transacción de borrado, revirtiendo cambios:", error)
        await new Promise((res, rej) => db.run("ROLLBACK", (err) => (err ? rej(err) : res())))
        resolve(false)
      } finally {
        db.close()
      }
    })
  })
})

ipcMain.handle("cancel-print", (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch (error) {
    console.error("No se pudo borrar el archivo temporal:", error)
  }
})

async function generateDailyReport(autoSavePath = null) {
  const db = openDb(true)
  const today = getLocalDate()
  const sql = `SELECT * FROM pedidos WHERE date(fecha, 'localtime') = ?`
  const orders = await new Promise((resolve, reject) => {
    db.all(sql, [today], (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
  db.close()
  if (orders.length === 0) return { success: false, message: "No hay pedidos guardados para el día de hoy." }
  let reportData = [],
    totalVentas = 0
  orders.forEach((order) => {
    const items = JSON.parse(order.items_json)
    items.forEach((item) => {
      const agregadosStr = item.extras && item.extras.length > 0 ? item.extras.map((e) => e.nombre).join(", ") : ""
      reportData.push({
        "ID Pedido": order.id,
        Fecha: new Date(order.fecha).toLocaleTimeString("es-CL"),
        Cliente: order.cliente_nombre,
        "Estado Pedido": order.estado,
        "Estado Pago": order.estado_pago,
        "Forma de Pago": order.forma_pago || "",
        Producto: item.name,
        Agregados: agregadosStr,
        Notas: item.notes || "",
        "Precio Item": item.price,
      })
    })
    totalVentas += order.total
  })
  reportData.push({}, { Notas: "TOTAL VENTAS", "Precio Item": totalVentas })
  const workbook = xlsx.utils.book_new()
  const worksheet = xlsx.utils.json_to_sheet(reportData)
  worksheet["!cols"] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 25 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 30 },
    { wch: 25 },
    { wch: 25 },
    { wch: 12 },
  ]
  xlsx.utils.book_append_sheet(workbook, worksheet, "Ventas del Día")
  let finalPath = autoSavePath
  if (!finalPath) {
    const defaultPath = path.join(app.getPath("documents"), `Reporte-Piamonte-${today}.xlsx`)
    const { filePath } = await dialog.showSaveDialog({
      title: "Guardar Reporte de Ventas",
      defaultPath,
      filters: [{ name: "Excel Files", extensions: ["xlsx"] }],
    })
    finalPath = filePath
  }
  if (finalPath) {
    xlsx.writeFile(workbook, finalPath)
    return { success: true, message: `Reporte guardado en: ${finalPath}`, filePath: finalPath }
  }
  return { success: false, message: "Guardado cancelado por el usuario." }
}

ipcMain.handle("generate-report", () => generateDailyReport())

async function saveAndSendReport() {
  const today = getLocalDate()
  const desktopPath = app.getPath("desktop")
  const reportsFolderPath = path.join(desktopPath, "reportes")
  if (!fs.existsSync(reportsFolderPath)) {
    fs.mkdirSync(reportsFolderPath)
  }
  const localReportPath = path.join(reportsFolderPath, `Reporte-Piamonte-${today}.xlsx`)
  const localReportResult = await generateDailyReport(localReportPath)
  if (!localReportResult.success) {
    dialog.showMessageBoxSync({
      type: "info",
      title: "Sin Reporte",
      message: "No se encontraron ventas el día de hoy. No se generó ningún reporte.",
    })
    return
  }
  dialog.showMessageBoxSync({
    type: "info",
    title: "Respaldo Local Creado",
    message: `El reporte de ventas se ha guardado en la carpeta "reportes" de tu Escritorio.`,
  })
  if (!process.env.SENDGRID_API_KEY) {
    console.log("No se encontró API Key de SendGrid. Omitiendo envío de correo.")
    return
  }
  const transporter = nodemailer.createTransport({
    host: "smtp.sendgrid.net",
    port: 587,
    auth: { user: "apikey", pass: process.env.SENDGRID_API_KEY },
  })
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_TO,
      subject: `Reporte de Ventas Piamonte - ${today}`,
      text: "Adjunto se encuentra el reporte de ventas del día.",
      attachments: [{ filename: `Reporte-Piamonte-${today}.xlsx`, path: localReportPath }],
    })
    console.log("Correo de reporte enviado exitosamente.")
    dialog.showMessageBoxSync({
      type: "info",
      title: "Reporte Enviado por Correo",
      message: "El reporte de ventas también fue enviado exitosamente al correo configurado.",
    })
  } catch (error) {
    console.error("Error al enviar el correo:", error)
    dialog.showMessageBoxSync({
      type: "error",
      title: "Error al Enviar Reporte por Correo",
      message: "No se pudo enviar el reporte por correo.",
      detail: error.message,
    })
  }
}

async function clearOrdersTable() {
  console.log("Limpiando y reseteando la tabla de pedidos...")
  const db = openDb()
  const run = (sql) =>
    new Promise((resolve, reject) => {
      db.run(sql, [], function (err) {
        if (err) return reject(err)
        resolve(this)
      })
    })
  try {
    await run(`DELETE FROM pedidos`)
    await run(`DELETE FROM sqlite_sequence WHERE name='pedidos'`)
  } catch (err) {
    console.error("Error durante la limpieza de la tabla:", err.message)
  } finally {
    db.close((err) => {
      if (err) console.error("Error al cerrar la DB después de limpiar:", err.message)
    })
  }
}

ipcMain.handle("get-todays-orders", async () => {
  const db = openDb(true)
  const today = getLocalDate()
  const sql = `SELECT * FROM pedidos WHERE date(fecha, 'localtime') = ? ORDER BY id DESC`
  try {
    const orders = await new Promise((resolve, reject) => {
      db.all(sql, [today], (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
    return orders
  } catch (error) {
    console.error(error)
    return []
  } finally {
    db.close()
  }
})

ipcMain.handle("update-order-status", async (event, { orderId, status }) => {
  const db = openDb()
  const sql = `UPDATE pedidos SET estado = ? WHERE id = ?`
  return new Promise((resolve) => {
    db.run(sql, [status, orderId], (err) => {
      db.close()
      if (err) {
        console.error("Error al actualizar estado:", err.message)
        resolve(false)
      } else {
        resolve(true)
      }
    })
  })
})

ipcMain.handle("update-payment-status", async (event, { orderId, status, paymentMethod }) => {
  const db = openDb()
  const sql = `UPDATE pedidos SET estado_pago = ?, forma_pago = ? WHERE id = ?`
  return new Promise((resolve) => {
    db.run(sql, [status, paymentMethod, orderId], (err) => {
      db.close()
      if (err) {
        console.error("Error al actualizar pago:", err.message)
        resolve(false)
      } else {
        resolve(true)
      }
    })
  })
})

ipcMain.handle("update-prices", async (event, updates) => {
  const db = openDb()
  return new Promise((resolve) => {
    db.serialize(async () => {
      try {
        await new Promise((res, rej) => db.run("BEGIN TRANSACTION", (err) => (err ? rej(err) : res())))
        for (const table in updates) {
          for (const item of updates[table]) {
            const fields = Object.keys(item).filter((k) => k !== "id")
            const setClause = fields.map((f) => `${f} = ?`).join(", ")
            const params = fields.map((f) => item[f])
            params.push(item.id)
            const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`
            await new Promise((res, rej) => db.run(sql, params, (err) => (err ? rej(err) : res())))
          }
        }
        await new Promise((res, rej) => db.run("COMMIT", (err) => (err ? rej(err) : res())))
        resolve({ success: true })
      } catch (error) {
        console.error("Error en la transacción de actualización de precios:", error)
        await new Promise((res, rej) => db.run("ROLLBACK", (err) => (err ? rej(err) : res())))
        resolve({ success: false, message: error.message })
      } finally {
        db.close()
      }
    })
  })
})

ipcMain.handle("get-inventory", async () => {
  const db = openDb(true)
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM inventario ORDER BY categoria, nombre", [], (err, rows) => {
      db.close()
      if (err) reject(err)
      else resolve(rows)
    })
  })
})

ipcMain.handle("update-inventory", async (event, updates) => {
  const db = openDb()
  return new Promise((resolve) => {
    db.serialize(async () => {
      try {
        await new Promise((res, rej) => db.run("BEGIN TRANSACTION", (err) => (err ? rej(err) : res())))
        for (const item of updates) {
          const sql = `UPDATE inventario SET cantidad = ?, comprar = ? WHERE id = ?`
          await new Promise((res, rej) =>
            db.run(sql, [item.cantidad, item.comprar, item.id], (err) => (err ? rej(err) : res())),
          )
        }
        await new Promise((res, rej) => db.run("COMMIT", (err) => (err ? rej(err) : res())))
        resolve({ success: true })
      } catch (error) {
        console.error("Error en la transacción de actualización de inventario:", error)
        await new Promise((res, rej) => db.run("ROLLBACK", (err) => (err ? rej(err) : res())))
        resolve({ success: false, message: error.message })
      } finally {
        db.close()
      }
    })
  })
})

ipcMain.handle("generate-shopping-list-pdf", async () => {
  const db = openDb(true)
  const itemsToBuy = await new Promise((resolve, reject) => {
    const sql = `SELECT nombre, categoria FROM inventario WHERE comprar = 1 ORDER BY categoria, nombre`
    db.all(sql, [], (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
  db.close()

  if (itemsToBuy.length === 0) {
    return { success: false, message: "No hay productos marcados para comprar." }
  }

  const tempFilePath = path.join(os.tmpdir(), `lista-compras-${Date.now()}.pdf`)
  const doc = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 50, left: 72, right: 72 } })
  const stream = fs.createWriteStream(tempFilePath)
  doc.pipe(stream)

  doc.fontSize(20).text("Lista de Compras - Pizzería Piamonte", { align: "center" })
  doc.moveDown(2)

  let currentCategory = ""
  itemsToBuy.forEach((item) => {
    if (item.categoria !== currentCategory) {
      doc.moveDown(1)
      doc.fontSize(16).text(item.categoria, { underline: true })
      currentCategory = item.categoria
    }
    doc.fontSize(12).text(`- ${item.nombre}`)
  })

  doc.end()
  await new Promise((resolve) => stream.on("finish", resolve))

  return { success: true, filePath: tempFilePath }
})

ipcMain.handle("confirm-print-shopping-list", async (event, filePath) => {
  try {
    await print(filePath, { printer: "XP-80C" })
    return { success: true, message: "Lista de compras enviada a la impresora." }
  } catch (error) {
    console.error("Error al imprimir la lista de compras:", error)
    return { success: false, message: `Error de impresión: ${error.message}` }
  } finally {
    fs.unlinkSync(filePath)
  }
})

function startApiServer() {
  const api = express()
  api.use(cors())
  api.use(express.json())
  const port = 3000

  api.get("/ping", (req, res) => {
    res.status(200).send("pong")
  })

  api.get("/api/ingredientes", (req, res) => {
    const db = openDb(true)
    db.all("SELECT * FROM inventario ORDER BY categoria, nombre", [], (err, rows) => {
      db.close()
      if (err) return res.status(500).json({ error: err.message })
      res.json(rows)
    })
  })

  api.post("/api/ingredientes/update", (req, res) => {
    const updates = Array.isArray(req.body) ? req.body : [req.body]
    const db = openDb()
    db.serialize(async () => {
      try {
        await new Promise((res, rej) => db.run("BEGIN TRANSACTION", (err) => (err ? rej(err) : res())))
        for (const item of updates) {
          const { id, cantidad, comprar } = item
          const sql = `UPDATE inventario SET cantidad = ?, comprar = ? WHERE id = ?`
          await new Promise((res, rej) => db.run(sql, [cantidad, comprar, id], (err) => (err ? rej(err) : res())))
        }
        await new Promise((res, rej) => db.run("COMMIT", (err) => (err ? rej(err) : res())))
        if (mainWindow) {
          mainWindow.webContents.send("inventory-updated")
        }
        res.json({ success: true, message: "Inventario actualizado." })
      } catch (error) {
        console.error("Error en API /api/ingredientes/update:", error)
        await new Promise((res, rej) => db.run("ROLLBACK", (err) => (err ? rej(err) : res())))
        res.status(500).json({ success: false, message: error.message })
      } finally {
        db.close()
      }
    })
  })

  api.listen(port, () => {
    console.log(`API de inventario corriendo en http://localhost:${port}`)
    try {
      bonjour = new Bonjour()
      bonjour.publish({ name: "Piamonte API Server", type: "http", port: port })
      console.log("Servicio de inventario anunciado en la red local.")
    } catch (error) {
      console.error("Error al anunciar el servicio Bonjour:", error)
    }
  })
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: { preload: path.join(__dirname, "preload.js") },
    frame: false,
    autoHideMenuBar: true,
  })
  if (app.isPackaged) {
    Menu.setApplicationMenu(null)
  }
  mainWindow.webContents.session.clearCache().then(() => {
    mainWindow.loadFile("index.html")
  })
}

ipcMain.on("minimize-window", () => {
  const w = BrowserWindow.getFocusedWindow()
  if (w) w.minimize()
})
ipcMain.on("maximize-window", () => {
  const w = BrowserWindow.getFocusedWindow()
  if (w) {
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  }
})
ipcMain.on("close-window", () => {
  const w = BrowserWindow.getFocusedWindow()
  if (w) w.close()
})

app.whenReady().then(() => {
  createWindow()
  startApiServer()
})

app.on("will-quit", () => {
  if (bonjour) {
    console.log("Deteniendo el anuncio del servicio en la red.")
    bonjour.unpublishAll(() => {
      bonjour.destroy()
    })
  }
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
