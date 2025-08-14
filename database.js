// database.js
const sqlite3 = require('sqlite3').verbose();

// Crea (o abre) el archivo de la base de datos.
// Este archivo es tu base de datos completa.
const db = new sqlite3.Database('./piamonte.db', (err) => {
  if (err) {
    return console.error(err.message);
  }
  console.log('Conectado a la base de datos SQLite "piamonte.db".');
});

// db.serialize asegura que los comandos se ejecuten uno tras otro en orden.
db.serialize(() => {
  // --- CREACIÓN DE TABLAS ---

  // Tabla para las pizzas
  db.run(`CREATE TABLE IF NOT EXISTS pizzas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    ingredientes TEXT,
    precio_xl INTEGER,
    precio_mediana INTEGER,
    precio_chica INTEGER
  )`, (err) => {
    if (err) return console.error("Error al crear tabla pizzas", err.message);
    console.log("Tabla 'pizzas' creada o ya existente.");
  });

  // Tabla para los agregados
  db.run(`CREATE TABLE IF NOT EXISTS agregados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    precio_xl INTEGER,
    precio_mediana INTEGER,
    precio_individual INTEGER
  )`, (err) => {
    if (err) return console.error("Error al crear tabla agregados", err.message);
    console.log("Tabla 'agregados' creada o ya existente.");
  });

  // Tabla para los otros productos
db.run(`CREATE TABLE IF NOT EXISTS otros_productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    categoria TEXT,
    precio INTEGER
  )`, (err) => {
    if (err) return console.error("Error al crear tabla otros_productos", err.message);
    console.log("Tabla 'otros_productos' creada o ya existente.");
  });

  // Tabla para los churrascos
db.run(`CREATE TABLE IF NOT EXISTS churrascos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  ingredientes TEXT,
  precio INTEGER
)`, (err) => {
  if (err) return console.error("Error al crear tabla churrascos", err.message);
  console.log("Tabla 'churrascos' creada o ya existente.");
});

db.run(`CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_nombre TEXT,
  cliente_telefono TEXT,
  total INTEGER NOT NULL,
  items_json TEXT,
  fecha TEXT NOT NULL,
  estado TEXT DEFAULT 'En Preparación',
  tipo_entrega TEXT,
  hora_entrega TEXT,
  forma_pago TEXT, 
  estado_pago TEXT DEFAULT 'Por Pagar'
)`, (err) => {
  if (err) return console.error("Error al crear tabla pedidos", err.message);
  console.log("Tabla 'pedidos' creada o ya existente.");
});

  // --- INSERCIÓN DE DATOS (SOLO SI ES NECESARIO) ---
  // Usamos INSERT OR IGNORE para no insertar duplicados si ejecutas el script de nuevo.

  const pizzas = [
    { nombre: 'Americana', ingredientes: 'S. de tomate, queso, orégano, carne molida, tomate y aceitunas.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Calzone', ingredientes: 'Rellena con queso, jamón, champiñones, bañada con s. de tomate y orégano.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Carnívora', ingredientes: 'S. de tomate, queso, orégano, peperoni, pollo, tocino, churrasco y tomate.', precio_xl: 14900, precio_mediana: 11900, precio_chica: 5500 },
    { nombre: 'Catalana', ingredientes: 'Orégano, queso, crema, pollo, palmito y piña.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Chillaneja', ingredientes: 'S. de tomate, queso, orégano, pollo, longaniza, morrón y tomate.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Española', ingredientes: 'S. de tomate, queso, orégano, jamón y choricillo.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Especial Piamonte', ingredientes: 'S. de tomate, queso, orégano, pollo, choclo, morrón, tocino y aceitunas.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Fontana', ingredientes: 'S. de tomate, queso, orégano, lomito, champiñones y morrón.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Francesa', ingredientes: 'Queso, orégano, crema, pollo y champiñones.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Fugasa', ingredientes: 'Aceite de oliva, queso, orégano, cebolla frita y aceitunas.', precio_xl: 13500, precio_mediana: 10500, precio_chica: 4800 },
    { nombre: 'Funghi', ingredientes: 'S. de tomate, queso, orégano, champiñones.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Funghi Extra', ingredientes: 'S. de tomate, queso, orégano, champiñones, tomate y choclo.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Hawaiana', ingredientes: 'S. de tomate, queso, orégano, jamón y piña.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Langostino', ingredientes: 'S. de tomate, queso, orégano y colitas de camarón.', precio_xl: 16500, precio_mediana: 12500, precio_chica: 5950 },
    { nombre: 'Lomito', ingredientes: 'S. de tomate, queso, orégano, lomito, cebolla frita y tomate.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Mexicana', ingredientes: 'S. de tomate, queso, orégano, carne molida, choclo, poroto verde, tomate, morrón y ají verde.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Milano', ingredientes: 'S. de tomate, queso, orégano, jamón, morrón, carne molida y choricillo.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Mixta', ingredientes: 'S. de tomate, queso, orégano, jamón y champiñones.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Nacional Extra', ingredientes: 'S. de tomate, queso, orégano, pollo, champiñones, morrón y aceitunas.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Nazionale', ingredientes: 'S. de tomate, queso, orégano, pollo, aceitunas y tomate.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Nápoles', ingredientes: 'S. de tomate, queso, orégano, salame, peperoni y tomate.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Napolitana', ingredientes: 'S. de tomate, queso, orégano, jamón y tomate.', precio_xl: 13500, precio_mediana: 10500, precio_chica: 4800 },
    { nombre: 'Nostra Marina', ingredientes: 'S. de tomate, queso, orégano, choritos, machas, camarones y ciboulette.', precio_xl: 16500, precio_mediana: 12500, precio_chica: 5950 },
    { nombre: 'Peperoni', ingredientes: 'S. de tomate, queso, orégano, peperoni.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Peperoni Extra', ingredientes: 'S. de tomate, queso, orégano, peperoni, tomate y aceituna.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Piamonte', ingredientes: 'S. de tomate, queso, orégano, salame, jamón, champiñones, morrón, espárragos y aceitunas.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Pollo Choclo', ingredientes: 'S. de tomate, queso, orégano, pollo, choclo.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Primavera', ingredientes: 'S. de tomate, queso, orégano, poroto verde, choclo y tomate.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Prosciutto', ingredientes: 'S. de tomate, queso, orégano, jamón.', precio_xl: 13500, precio_mediana: 10500, precio_chica: 4800 },
    { nombre: 'Romana', ingredientes: 'S. de tomate, queso, orégano, churrasco, champiñones, morrón y pimienta blanca.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Salame', ingredientes: 'S. de tomate, queso, orégano, salame.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Siciliana', ingredientes: 'S. de tomate, queso, orégano, carne molida, champiñones y tocino.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Speciale', ingredientes: 'S. de tomate, queso, orégano, tocino, tomate y ajo.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Torino', ingredientes: 'S. de tomate, queso, orégano, churrasco, cebolla frita y morrón.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Toscana', ingredientes: 'Queso, orégano, crema, nueces, pollo, tocino y tomate.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Trasnochada', ingredientes: 'S. de tomate, queso, orégano, carne molida, cebolla, morrón y tomate.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Tropicale', ingredientes: 'S. de tomate, queso, orégano, jamón, piña y palmitos.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Vegetariana', ingredientes: 'S. de tomate, queso, orégano, poroto verde, choclo y espárragos.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Vegetariana Extra', ingredientes: 'S. de tomate, queso, orégano, palmito, fondo de alcachofas, tomate y alcaparras.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Vegetariana suprema', ingredientes: 'S. de tomate, queso, orégano, champiñones, fondo de alcachofas y tomate.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Verdi', ingredientes: 'S. de tomate, queso, orégano, churrasco, poroto verde, tomate y ají.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Verona', ingredientes: 'S. de tomate, queso, orégano, carne molida, pollo, salame, morrón y cebolla frita.', precio_xl: 14500, precio_mediana: 11500, precio_chica: 4950 },
    { nombre: 'Vieneto', ingredientes: 'S. de tomate, queso, orégano, pollo, camarón y tomate.', precio_xl: 16500, precio_mediana: 12500, precio_chica: 5950 }
  ];
  
  const stmtPizzas = db.prepare("INSERT OR IGNORE INTO pizzas (nombre, ingredientes, precio_xl, precio_mediana, precio_chica) VALUES (?, ?, ?, ?, ?)");
  for (const pizza of pizzas) {
    stmtPizzas.run(pizza.nombre, pizza.ingredientes, pizza.precio_xl, pizza.precio_mediana, pizza.precio_chica);
  }
  stmtPizzas.finalize();
  
  const agregados = [
    { nombre: 'aceitunas', precio_xl: 1200, precio_mediana: 800, precio_individual: 500 },
    { nombre: 'camarones', precio_xl: 4500, precio_mediana: 3500, precio_individual: 2500 },
    { nombre: 'carne molida', precio_xl: 2800, precio_mediana: 1700, precio_individual: 800 },
    { nombre: 'cebolla', precio_xl: 1200, precio_mediana: 800, precio_individual: 500 },
    { nombre: 'champiñones', precio_xl: 2800, precio_mediana: 1700, precio_individual: 800 },
    { nombre: 'choclo', precio_xl: 2200, precio_mediana: 1500, precio_individual: 600 },
    { nombre: 'choricillo', precio_xl: 2200, precio_mediana: 1500, precio_individual: 600 },
    { nombre: 'choritos', precio_xl: 2200, precio_mediana: 1500, precio_individual: 600 },
    { nombre: 'churrasco', precio_xl: 2800, precio_mediana: 1700, precio_individual: 800 },
    { nombre: 'crema', precio_xl: 500, precio_mediana: 500, precio_individual: 200 },
    { nombre: 'doble queso', precio_xl: 4500, precio_mediana: 3500, precio_individual: 2500 },
    { nombre: 'espárragos', precio_xl: 2800, precio_mediana: 1700, precio_individual: 800 },
    { nombre: 'jamón', precio_xl: 2800, precio_mediana: 1700, precio_individual: 800 },
    { nombre: 'lomito', precio_xl: 2800, precio_mediana: 1700, precio_individual: 800 },
    { nombre: 'machas', precio_xl: 4500, precio_mediana: 3500, precio_individual: 2500 },
    { nombre: 'morrón', precio_xl: 1200, precio_mediana: 800, precio_individual: 500 },
    { nombre: 'palmitos', precio_xl: 2200, precio_mediana: 1500, precio_individual: 600 },
    { nombre: 'peperoni', precio_xl: 2800, precio_mediana: 1700, precio_individual: 800 },
    { nombre: 'piña', precio_xl: 2200, precio_mediana: 1500, precio_individual: 600 },
    { nombre: 'pollo', precio_xl: 2800, precio_mediana: 1700, precio_individual: 800 },
    { nombre: 'poroto verde', precio_xl: 2200, precio_mediana: 1500, precio_individual: 600 },
    { nombre: 'salame', precio_xl: 2800, precio_mediana: 1700, precio_individual: 800 },
    { nombre: 'tocino', precio_xl: 2800, precio_mediana: 1700, precio_individual: 800 },
    { nombre: 'tomate', precio_xl: 1200, precio_mediana: 800, precio_individual: 500 }
  ];

  const stmtAgregados = db.prepare("INSERT OR IGNORE INTO agregados (nombre, precio_xl, precio_mediana, precio_individual) VALUES (?, ?, ?, ?)");
  for (const agregado of agregados) {
    stmtAgregados.run(agregado.nombre, agregado.precio_xl, agregado.precio_mediana, agregado.precio_individual);
  }
  stmtAgregados.finalize();

  // Tabla para los otros productos
  const otros = [
    { nombre: 'Lasaña Boloñesa', categoria: 'Pastas', precio: 5800 },
    { nombre: 'Capelleti (Rellenos con carne)', categoria: 'Pastas', precio: 6800 },
    { nombre: 'Fetuccini', categoria: 'Pastas', precio: 5800 },
    { nombre: 'Ñoquis Boloñesa', categoria: 'Pastas', precio: 5800 },
    { nombre: 'Ñoquis Pesto', categoria: 'Pastas', precio: 5800 },
    { nombre: 'Ñoquis Funghi', categoria: 'Pastas', precio: 5800 },
    { nombre: 'Ñoquis Alfredo', categoria: 'Pastas', precio: 5800 },
    { nombre: '6 Empanaditas de queso coctel', categoria: 'Picar', precio: 2400 },
    { nombre: '6 Nuggets', categoria: 'Picar', precio: 2400 },
    { nombre: 'Bebida 1 ½ Its.', categoria: 'Bebestibles', precio: 2700 },
    { nombre: 'Nectar 1 ½ Its.', categoria: 'Bebestibles', precio: 2700 },
    { nombre: 'Nectar individual.', categoria: 'Bebestibles', precio: 1500 },
    { nombre: 'Bebida lata (350cc).', categoria: 'Bebestibles', precio: 1500 },
    { nombre: 'Agua mineral (350cc).', categoria: 'Bebestibles', precio: 1500 },
    { nombre: 'Café', categoria: 'Bebestibles', precio: 1500 },
    { nombre: 'Té', categoria: 'Bebestibles', precio: 1500 },
    { nombre: 'Cerveza Kunstmann', categoria: 'Cervezas', precio: 2200 },
    { nombre: 'Cerveza Royal', categoria: 'Cervezas', precio: 1700 },
    { nombre: 'Cerveza Heineken', categoria: 'Cervezas', precio: 1700 },
    { nombre: 'Cerveza austral', categoria: 'Cervezas', precio: 2200},
    { nombre: 'Vino Mision varietal', categoria: 'Vinos', precio: 8900 },
    { nombre: 'Vino Mision reserva', categoria: 'Vinos', precio: 11900 },
    { nombre: 'Vino Casillero reserva', categoria: 'Vinos', precio: 11900 },
    { nombre: 'Vino 120 de santa rita (700 ml)', categoria: 'Vinos', precio: 6900 },
    { nombre: 'Vino carmen (187.5 ml)', categoria: 'Vinos', precio: 3500 },
    { nombre: 'Tallarines boloñesa + ensalada + jugo sin azucar', categoria: 'Menu junaeb', precio: 4500 },
    { nombre: 'pizza mini personal americana + jugo sin azucar', categoria: 'Menu junaeb', precio: 2350 },
    { nombre: 'envase para llevar', categoria: "extra", precio: 500}
  ];
  
  const stmtOtros = db.prepare("INSERT OR IGNORE INTO otros_productos (nombre, categoria, precio) VALUES (?, ?, ?)");
  for (const item of otros) {
    stmtOtros.run(item.nombre, item.categoria, item.precio);
  }
  stmtOtros.finalize();

  // Tabla para los churrascos
  const churrascos = [
    { nombre: 'Barros luco', ingredientes: 'C. vacuno, queso.', precio: 5500 },
    { nombre: 'Italiano', ingredientes: 'C. vacuno, palta, tomate, mayo.', precio: 5500 },
    { nombre: 'Chacarero', ingredientes: 'C. vacuno, porotos verdes, tomate, ají, mayo.', precio: 5500 },
    { nombre: 'Piamontese', ingredientes: 'Pollo, c. vacuno, champiñones, mayo.', precio: 5800 },
    { nombre: 'Media noche', ingredientes: 'Pollo, peperoni, morrón, cebolla frita, mayo.', precio: 5800 },
  ];

  // Añade este bloque para insertar los datos
  const stmtChurrascos = db.prepare("INSERT OR IGNORE INTO churrascos (nombre, ingredientes, precio) VALUES (?, ?, ?)");
  for (const item of churrascos) {
    stmtChurrascos.run(item.nombre, item.ingredientes, item.precio);
  }
  stmtChurrascos.finalize();

  console.log("Datos insertados en las tablas.");

});

// Cierra la conexión a la base de datos
db.close((err) => {
  if (err) {
    return console.error(err.message);
  }
  console.log('Conexión a la base de datos cerrada.');
});