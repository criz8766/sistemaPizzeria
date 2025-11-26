// renderer.js
let allProducts = {};
let currentOrder = [];
let fullOrder = {};
let tempPdfPath = '';
let currentPizzaConfig = {};
let currentNoteItem = {};
let editingOrderId = null;
let payingOrderId = null;
let orderToDeleteId = null;
let shoppingListPdfPath = ''; // Para guardar la ruta del PDF de la lista de compras

// CRUD: Nuevas variables globales para el manejo de productos
let editingProductId = null;
let productToDelete = null; // Guardará { type, id }
const productModal = document.getElementById('product-modal');
const productForm = document.getElementById('product-form');
const productModalTitle = document.getElementById('product-modal-title');
const productIdInput = document.getElementById('product-id');
const productTypeInput = document.getElementById('product-type');
const productNameInput = document.getElementById('product-name');
const confirmDeleteProductModal = document.getElementById('confirm-delete-product-modal');
const productManagementContainer = document.getElementById('product-management-container');

// --- ELEMENTOS DEL DOM ---
const pizzaModal = document.getElementById('pizza-modal');
const previewModal = document.getElementById('preview-modal');
const notesModal = document.getElementById('notes-modal');
const confirmPaymentModal = document.getElementById('confirm-payment-modal');
const confirmDeleteModal = document.getElementById('confirm-delete-modal'); // Para pedidos
const orderSummaryEl = document.getElementById('order-summary');
const totalPriceEl = document.getElementById('total-price');
const pizzasContainer = document.getElementById('pizzas-tab'); // Del catálogo
const churrascosContainer = document.getElementById('churrascos-tab'); // Del catálogo
const otrosContainer = document.getElementById('otros-tab'); // Del catálogo
const addToOrderBtn = document.getElementById('add-to-order-button');
const hnhCheckbox = document.getElementById('half-and-half-checkbox');
const hnhOptions = document.getElementById('half-options');
const hnhSelect1 = document.getElementById('half-1');
const hnhSelect2 = document.getElementById('half-2');
const finalizeOrderBtn = document.getElementById('finalize-order-btn');
const updateOrderBtn = document.getElementById('update-order-btn');
const reportBtn = document.getElementById('report-btn');
const historyListEl = document.getElementById('history-list');
const historyTabBtn = document.querySelector('.tab-button[data-target="history-tab-content"]');
// Eliminado: Referencia a settingsTabBtn
// const priceSettingsContainer = document.getElementById('price-settings-container'); // Eliminado
// const savePricesBtn = document.getElementById('save-prices-btn'); // Eliminado
const paymentMethodWrapper = document.getElementById('payment-method-wrapper');
const paymentMethodSelect = document.getElementById('payment-method');
const otherPaymentWrapper = document.getElementById('other-payment-wrapper');
const searchInput = document.getElementById('search-products');
const searchExtrasInput = document.getElementById('search-extras');
const alertModal = document.getElementById('alert-modal');
const alertModalMessage = document.getElementById('alert-modal-message');
const alertModalCloseBtn = document.getElementById('alert-modal-close-btn');
const customPizzaModal = document.getElementById('custom-pizza-modal');
const customSizeOptions = document.getElementById('custom-size-options');
const customPizzaIngredients = document.getElementById('custom-pizza-ingredients');
const customPizzaPriceInput = document.getElementById('custom-pizza-price-input');
const customCancelButton = document.getElementById('custom-cancel-button');
const customAddToOrderButton = document.getElementById('custom-add-to-order-button');
let customPizzaSize = 'mediana';
const inventoryContainer = document.getElementById('inventory-container');
const inventoryTabContent = document.getElementById('inventory-tab-content');
const saveInventoryBtn = document.getElementById('save-inventory-btn');
const printShoppingListBtn = document.getElementById('print-shopping-list-btn');


// --- LÓGICA DE ALERTAS ---
function showAlert(message) {
    alertModalMessage.textContent = message;
    alertModal.classList.remove('hidden');
    alertModalCloseBtn.focus();
}

// --- LÓGICA DE VISTA PREVIA ---
function showPrintPreview(filePath, isShoppingList = false) {
    if (isShoppingList) {
        shoppingListPdfPath = filePath;
        document.getElementById('preview-confirm-btn').dataset.type = 'shoppingList';
        document.getElementById('preview-cancel-btn').dataset.type = 'shoppingList';
    } else {
        tempPdfPath = filePath;
        document.getElementById('preview-confirm-btn').dataset.type = 'ticket';
        document.getElementById('preview-cancel-btn').dataset.type = 'ticket';
    }
    const pdfPreview = document.getElementById('pdf-preview');
    pdfPreview.src = `${filePath}?t=${new Date().getTime()}`; // Añade timestamp para evitar caché
    previewModal.classList.remove('hidden');
}

function resetOrderState() {
    currentOrder = [];
    editingOrderId = null;
    document.getElementById('customer-name').value = '';
    document.getElementById('customer-phone').value = '';
    document.getElementById('delivery-delay').checked = true; // Volver a demora por defecto
    document.getElementById('delay-minutes').value = '25'; // Resetear minutos demora
    document.getElementById('scheduled-time').value = ''; // Limpiar hora agendada
    document.getElementById('delivery-delay-input').classList.remove('hidden'); // Mostrar input demora
    document.getElementById('delivery-scheduled-input').classList.add('hidden'); // Ocultar input agendado
    document.getElementById('status-unpaid').checked = true; // Volver a por pagar
    paymentMethodWrapper.classList.add('hidden'); // Ocultar opciones de pago
    paymentMethodSelect.value = 'Efectivo'; // Resetear select
    otherPaymentWrapper.classList.add('hidden'); // Ocultar input 'otra'
    document.getElementById('other-payment-method').value = ''; // Limpiar input 'otra'
    updateOrderBtn.classList.add('hidden');
    finalizeOrderBtn.classList.remove('hidden');
    updateOrderSummary();
     // CRUD: Habilitar pestañas al resetear pedido
    enableTabs();
}


// CRUD: Función para habilitar todas las pestañas principales
function enableTabs() {
    document.querySelectorAll('.tab-button').forEach(tab => {
        tab.disabled = false;
        tab.classList.remove('opacity-50', 'cursor-not-allowed');
    });
}

// CRUD: Función para deshabilitar todas las pestañas EXCEPTO la activa
function disableOtherTabs(activeTabTarget) {
     document.querySelectorAll('.tab-button').forEach(tab => {
        if (tab.dataset.target !== activeTabTarget) {
            tab.disabled = true;
            tab.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            tab.disabled = false;
            tab.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });
}


// --- LÓGICA DE HISTORIAL ---
async function loadOrderHistory() {
    try {
        const orders = await window.api.getTodaysOrders();
        historyListEl.innerHTML = '';
        if (orders.length === 0) {
            historyListEl.innerHTML = '<p class="text-gray-500 text-center mt-8">No hay pedidos registrados hoy.</p>';
            return;
        }
        orders.forEach(order => {
            let items = [];
            try {
                 items = JSON.parse(order.items_json);
            } catch (e) {
                console.error(`Error parseando items del pedido ${order.id}:`, e);
                items = [{ name: 'Error al leer items', notes: '' }];
            }
            const isDelivered = order.estado === 'Entregado';
            const isPaid = order.estado_pago === 'Pagado';
            const orderCard = document.createElement('div');
            orderCard.className = `border rounded-lg shadow-sm p-4 ${isDelivered ? 'bg-green-50' : 'bg-white'}`;
            orderCard.innerHTML = `
                <div class="flex justify-between items-start border-b pb-2 mb-2">
                    <div>
                        <p class="font-bold text-lg">Pedido #${order.id} - ${order.cliente_nombre}</p>
                        <p class="text-sm text-gray-500">${new Date(order.fecha).toLocaleTimeString('es-CL')}</p>
                    </div>
                    <div class="text-right flex-shrink-0">
                        <p class="font-bold text-lg">$${order.total.toLocaleString('es-CL')}</p>
                        <p class="text-xs text-gray-500">${order.forma_pago || ''}</p>
                        <p class="text-xs font-semibold ${isPaid ? 'text-green-600' : 'text-red-600'}">${order.estado_pago}</p>
                        <p class="text-xs font-semibold ${isDelivered ? 'text-green-600' : 'text-blue-600'}">${order.estado}</p>
                    </div>
                </div>
                <div class="text-sm space-y-1 my-2">
                    ${items.map(item => `<div>- ${item.name} ${item.notes ? `<span class="text-gray-500">(${item.notes})</span>` : ''}</div>`).join('')}
                </div>
                <div class="text-right mt-3 space-x-2">
                    <button class="bg-red-600 text-white text-xs px-3 py-1 rounded hover:bg-red-700 table-action-btn" data-delete-id="${order.id}">Eliminar</button>
                    <button class="bg-gray-500 text-white text-xs px-3 py-1 rounded hover:bg-gray-600 table-action-btn" data-reprint-id="${order.id}">Reimprimir</button>
                    <button class="bg-yellow-500 text-white text-xs px-3 py-1 rounded hover:bg-yellow-600 table-action-btn ${isDelivered ? 'hidden' : ''}" data-edit-id="${order.id}">Editar</button>
                    <button class="bg-green-500 text-white text-xs px-3 py-1 rounded hover:bg-green-600 table-action-btn disabled:bg-gray-400" data-pay-id="${order.id}" ${isPaid ? 'disabled' : ''}>Marcar Pagado</button>
                    <button class="bg-blue-500 text-white text-xs px-3 py-1 rounded hover:bg-blue-600 table-action-btn disabled:bg-gray-400" data-deliver-id="${order.id}" ${isDelivered ? 'disabled' : ''}>Marcar Entregado</button>
                </div>
            `;
            historyListEl.appendChild(orderCard);
        });
    } catch (error) {
        console.error("Error al cargar el historial de pedidos:", error);
        historyListEl.innerHTML = '<p class="text-red-500 text-center mt-8">No se pudo cargar el historial.</p>';
    }
}

// --- LÓGICA DEL PEDIDO ---
function addToOrder(item) { currentOrder.push(item); updateOrderSummary(); }
function removeFromOrder(itemId) { currentOrder = currentOrder.filter(item => item.orderId !== itemId); updateOrderSummary(); }
function updateOrderSummary() {
  orderSummaryEl.innerHTML = '';
  if (currentOrder.length === 0) {
    orderSummaryEl.innerHTML = '<p class="text-center text-gray-400 py-8 italic">El pedido está vacío</p>';
    // Si estábamos editando un pedido y se vació, reseteamos el estado
    if (editingOrderId) {
        resetOrderState(); // resetOrderState ya habilita las pestañas
    } else {
        enableTabs(); // Si no estábamos editando, solo aseguramos habilitar
    }
  } else {
    // Si hay items en el pedido (o se añade el primero), deshabilitamos otras pestañas
    const currentActiveTab = document.querySelector('.tab-button.active')?.dataset.target || 'catalog-tab-content';
    disableOtherTabs(currentActiveTab); // Deshabilitar otras pestañas MANTENIENDO la actual activa

    currentOrder.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'p-2 rounded-lg hover:bg-gray-50';
      itemEl.innerHTML = `
        <div class="flex justify-between items-center">
          <span class="font-semibold text-sm">${item.name}</span>
          <span class="font-semibold text-sm">$${item.price.toLocaleString('es-CL')}</span>
        </div>
        <div class="text-xs text-gray-500">
          ${item.extras && item.extras.length > 0 ? `+ ${item.extras.map(e => e.nombre).join(', ')}` : ''}
          ${item.notes ? `<br>Nota: ${item.notes}` : ''}
        </div>
        <button class="text-red-500 text-xs hover:underline remove-item-btn" data-id="${item.orderId}">Quitar</button>
      `;
      orderSummaryEl.appendChild(itemEl);
    });
  }
  const total = currentOrder.reduce((sum, item) => sum + item.price, 0);
  totalPriceEl.textContent = `$${total.toLocaleString('es-CL')}`;
}


// --- LÓGICA DE MODALES (PEDIDOS) ---
function openPizzaModal(pizza) {
    currentPizzaConfig = { basePizza: pizza, size: 'mediana', price: pizza.precio_mediana, extras: [] };
    document.getElementById('modal-pizza-name').textContent = pizza.nombre;
    const extrasContainer = document.getElementById('extras-container');
    extrasContainer.innerHTML = '';
    // Filtrar para que solo muestre agregados disponibles
    const availableExtras = allProducts.agregados || [];
    availableExtras.forEach(extra => {
        const label = document.createElement('label');
        label.className = 'flex items-center gap-2 p-1 rounded hover:bg-gray-100 cursor-pointer';
        label.innerHTML = `<input type="checkbox" class="extra-checkbox focus:ring-orange-500" data-id="${extra.id}"><span>${extra.nombre}</span>`;
        extrasContainer.appendChild(label);
    });
    hnhSelect1.innerHTML = '';
    hnhSelect2.innerHTML = '';
    const availablePizzasForHalves = (allProducts.pizzas || []).filter(p => p.nombre.toLowerCase() !== 'calzone');
    availablePizzasForHalves.forEach(p => {
        hnhSelect1.innerHTML += `<option value="${p.id}">${p.nombre}</option>`;
        hnhSelect2.innerHTML += `<option value="${p.id}">${p.nombre}</option>`;
    });
    // Intentar seleccionar la pizza actual, si no existe, dejar el primero
    const pizzaExistsInList = availablePizzasForHalves.some(p => p.id === pizza.id);
    hnhSelect1.value = pizzaExistsInList ? pizza.id : (availablePizzasForHalves[0]?.id || '');
    hnhSelect2.value = pizzaExistsInList ? pizza.id : (availablePizzasForHalves[0]?.id || '');

    document.getElementById('pizza-notes').value = '';
    hnhCheckbox.checked = false;
    hnhOptions.classList.add('hidden');
    searchExtrasInput.value = '';
    filterExtrasList(); // Filtrar extras al abrir
    updateModalUI();
    pizzaModal.classList.remove('hidden');
}


function updateModalUI() {
    const size = currentPizzaConfig.size;
    document.querySelectorAll('#size-options .size-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.size === size);
    });
    const hnhSection = document.getElementById('half-and-half-section');
    const isCalzone = currentPizzaConfig.basePizza.nombre.toLowerCase() === 'calzone';
    hnhSection.classList.toggle('hidden', isCalzone || !['mediana', 'xl'].includes(size));
    if (isCalzone || !['mediana', 'xl'].includes(size)) {
      hnhCheckbox.checked = false;
      hnhOptions.classList.add('hidden');
    }
    updateModalPrice();
}

function updateModalPrice() {
    const size = currentPizzaConfig.size;
    let basePrice = 0;
    if (hnhCheckbox.checked && ['mediana', 'xl'].includes(size)) {
        const pizza1Id = parseInt(hnhSelect1.value);
        const pizza2Id = parseInt(hnhSelect2.value);
        const pizza1 = (allProducts.pizzas || []).find(p => p.id === pizza1Id);
        const pizza2 = (allProducts.pizzas || []).find(p => p.id === pizza2Id);
        if(pizza1 && pizza2) {
            const price1 = pizza1[`precio_${size}`] || 0;
            const price2 = pizza2[`precio_${size}`] || 0;
            basePrice = Math.round((price1 + price2) / 2); // Precio promedio
        } else {
            console.warn("Una de las pizzas para mitad/mitad no se encontró:", pizza1Id, pizza2Id);
             basePrice = currentPizzaConfig.basePizza[`precio_${size}`] || 0; // Fallback al precio base original
        }
    } else {
        basePrice = currentPizzaConfig.basePizza[`precio_${size}`] || 0;
    }
    let extrasPrice = 0;
    currentPizzaConfig.extras = [];
    document.querySelectorAll('.extra-checkbox:checked').forEach(checkbox => {
        const extraId = parseInt(checkbox.dataset.id);
        const extra = (allProducts.agregados || []).find(e => e.id === extraId);
        if (extra) {
            currentPizzaConfig.extras.push(extra);
            const priceKey = size === 'chica' ? 'precio_individual' : `precio_${size}`;
            extrasPrice += extra[priceKey] || 0;
        }
    });
    currentPizzaConfig.price = basePrice + extrasPrice;
    document.getElementById('modal-pizza-price').textContent = `$${currentPizzaConfig.price.toLocaleString('es-CL')}`;
}

function openNotesModal(item) {
    currentNoteItem = item;
    document.getElementById('notes-modal-product-name').textContent = item.nombre;
    document.getElementById('product-notes').value = ''; // Limpiar notas anteriores
    notesModal.classList.remove('hidden');
    document.getElementById('product-notes').focus(); // Foco en el textarea
}

function openCustomPizzaModal() {
    customPizzaIngredients.value = '';
    customPizzaPriceInput.value = '';
    customPizzaSize = 'mediana';
    customSizeOptions.querySelectorAll('.size-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.size === 'mediana');
    });
    customPizzaModal.classList.remove('hidden');
    customPizzaIngredients.focus();
}

function collectOrderData() {
    const customerName = document.getElementById('customer-name').value.trim();
    if (currentOrder.length === 0) { showAlert('No se puede procesar un pedido vacío.'); return null; }
    if (!customerName) { showAlert('Por favor, ingrese el nombre del cliente.'); return null; }
    const deliveryType = document.querySelector('input[name="delivery-type"]:checked').value;
    let deliveryTime;
    if (deliveryType === 'demora') {
        const minutes = parseInt(document.getElementById('delay-minutes').value) || 0;
        const deliveryDate = new Date(Date.now() + minutes * 60000);
        deliveryTime = deliveryDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
    } else {
        deliveryTime = document.getElementById('scheduled-time').value;
        if(!deliveryTime) { showAlert('Por favor, especifique una hora de entrega.'); return null; }
    }
    const paymentStatus = document.querySelector('input[name="payment-status"]:checked').value;
    let paymentMethod = null;
    if (paymentStatus === 'Pagado') {
        paymentMethod = paymentMethodSelect.value;
        if (paymentMethod === 'otra') {
            const otherPayment = document.getElementById('other-payment-method').value.trim();
            if (!otherPayment) { showAlert('Por favor, especifique la otra forma de pago.'); return null; }
            paymentMethod = otherPayment;
        }
    }
    // Asegurarse de que los extras estén bien formateados (solo nombre y id si es necesario)
    const itemsForDB = currentOrder.map(item => ({
        ...item,
        extras: item.extras ? item.extras.map(e => ({ id: e.id, nombre: e.nombre })) : [] // Guardar solo id y nombre del extra
    }));

    return {
        id: editingOrderId,
        customer: { name: customerName, phone: document.getElementById('customer-phone').value.trim() },
        total: currentOrder.reduce((sum, item) => sum + item.price, 0),
        items: itemsForDB, // Usar los items formateados
        timestamp: new Date().toISOString(),
        delivery: { type: deliveryType, time: deliveryTime },
        payment: { status: paymentStatus, method: paymentMethod }
     };
}


// --- Eliminado: LÓGICA DE CONFIGURACIÓN DE PRECIOS ---


// --- LÓGICA DE INVENTARIO ---
function groupInventoryByCategory(items) {
    return items.reduce((acc, item) => {
        const key = item.categoria || 'General';
        if (!acc[key]) { acc[key] = []; }
        acc[key].push(item);
        return acc;
    }, {});
}

async function populateInventory() {
    inventoryContainer.innerHTML = '';
    try {
        const inventory = await window.api.getInventory();
        const grouped = groupInventoryByCategory(inventory);
        for (const categoria in grouped) {
            const section = document.createElement('div');
            section.innerHTML = `<h3 class="text-xl font-bold text-gray-800 mb-3">${categoria}</h3>`;
            const tableWrapper = document.createElement('div');
            tableWrapper.className = 'overflow-x-auto bg-white rounded-lg shadow border border-gray-200 mb-6';
            tableWrapper.innerHTML = `
                <table class="min-w-full">
                    <thead>
                        <tr class="bg-gray-50">
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Cantidad restante</th>
                            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Comprar</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${grouped[categoria].map(item => `
                            <tr class="hover:bg-gray-50">
                                <td class="px-4 py-2 text-sm text-gray-900 font-medium">${item.nombre}</td>
                                <td class="px-4 py-2">
                                    <input type="text" class="inventory-input w-24 p-1 border rounded text-right mx-auto block" data-id="${item.id}" value="${item.cantidad}">
                                </td>
                                <td class="px-4 py-2">
                                    <label class="flex items-center justify-center gap-1 cursor-pointer">
                                        <input type="checkbox" class="buy-checkbox h-5 w-5 focus:ring-blue-500" data-id="${item.id}" ${item.comprar === 1 ? 'checked' : ''}>
                                        <span class="text-sm text-gray-600">Comprar</span>
                                    </label>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            section.appendChild(tableWrapper);
            inventoryContainer.appendChild(section);
        }
    } catch (error) {
        console.error("Error al poblar inventario:", error);
        inventoryContainer.innerHTML = '<p class="text-red-500">No se pudo cargar el inventario.</p>';
    }
}

// --- CRUD: LÓGICA DE GESTIÓN DE PRODUCTOS ---

// Función para poblar la pestaña de gestión de productos
async function populateProductManagement() {
    productManagementContainer.innerHTML = ''; // Limpiar contenedor
    try {
        // Reutilizamos getProducts para obtener los datos actualizados
        allProducts = await window.api.getProducts();

        // Mapeo de tipos a títulos y campos relevantes (incluyendo todos los precios)
        const productTypes = {
            pizzas: { title: 'Pizzas', fields: ['nombre', 'ingredientes', 'precio_chica', 'precio_mediana', 'precio_xl'] },
            churrascos: { title: 'Churrascos', fields: ['nombre', 'ingredientes', 'precio'] },
            agregados: { title: 'Agregados', fields: ['nombre', 'precio_individual', 'precio_mediana', 'precio_xl'] },
            otros_productos: { title: 'Otros Productos', fields: ['nombre', 'categoria', 'precio'] }
        };

        // Crear sección para cada tipo de producto
        for (const typeKey in productTypes) { // Usar typeKey para el objeto productTypes
            const config = productTypes[typeKey];
            // *** CORRECCIÓN AQUÍ: Usar 'otros' si typeKey es 'otros_productos' ***
            const dataKey = typeKey === 'otros_productos' ? 'otros' : typeKey;
            const items = allProducts[dataKey] || []; // Usar array vacío si no hay items de ese tipo

            const section = document.createElement('div');
            section.innerHTML = `
                <div class="flex justify-between items-center mb-3">
                    <h3 class="text-xl font-bold text-gray-800">${config.title}</h3>
                    <button class="add-product-btn bg-green-500 text-white text-xs px-4 py-2 rounded-lg hover:bg-green-600 transition-all shadow-md table-action-btn" data-type="${typeKey}"> + Añadir ${config.title === 'Otros Productos' ? 'Otro Producto' : config.title.slice(0, -1)}
                    </button>
                </div>
                <div class="overflow-x-auto bg-white rounded-lg shadow border border-gray-200">
                    <table class="min-w-full product-table">
                        <thead>
                            <tr>
                                ${config.fields.map(field => `<th>${field.replace(/_/g, ' ')}</th>`).join('')}
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="table-body-${typeKey}"> ${items.length === 0 ? `<tr><td colspan="${config.fields.length + 1}" class="text-center text-gray-500 py-4">No hay ${config.title.toLowerCase()} registrados.</td></tr>` :
                             items.map(item => `
                                <tr data-id="${item.id}">
                                    ${config.fields.map(field => `<td class="${typeof item[field] === 'number' ? 'text-right' : ''}">${item[field] || (typeof item[field] === 'number' ? 0 : '-')}</td>`).join('')}
                                    <td class="space-x-2">
                                        <button class="edit-product-btn text-yellow-600 hover:text-yellow-800 font-medium table-action-btn" data-type="${typeKey}" data-id="${item.id}">Editar</button> <button class="delete-product-btn text-red-600 hover:text-red-800 font-medium table-action-btn" data-type="${typeKey}" data-id="${item.id}">Eliminar</button> </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            productManagementContainer.appendChild(section);
        }
    } catch (error) {
        console.error("Error al poblar gestión de productos:", error);
        productManagementContainer.innerHTML = '<p class="text-red-500">No se pudo cargar la lista de productos.</p>';
    }
}


// Función para abrir el modal de producto (añadir o editar)
function openProductModal(type, product = null) {
    productForm.reset(); // Limpiar formulario
    editingProductId = product ? product.id : null;

    // Ocultar todos los bloques de campos específicos
    document.getElementById('pizza-fields').classList.add('hidden');
    document.getElementById('churrasco-fields').classList.add('hidden');
    document.getElementById('agregado-fields').classList.add('hidden');
    document.getElementById('otro-fields').classList.add('hidden');

    // Mostrar el bloque correspondiente al tipo
    let fieldsContainerId;
    let typeNameSingular = "Producto"; // Default
    switch(type) {
        case 'pizzas': fieldsContainerId = 'pizza-fields'; typeNameSingular = 'Pizza'; break;
        case 'churrascos': fieldsContainerId = 'churrasco-fields'; typeNameSingular = 'Churrasco'; break;
        case 'agregados': fieldsContainerId = 'agregado-fields'; typeNameSingular = 'Agregado'; break;
        case 'otros_productos': fieldsContainerId = 'otro-fields'; typeNameSingular = 'Otro Producto'; break;
        default:
             console.error(`Tipo de producto desconocido en openProductModal: ${type}`);
             showAlert("Error: Tipo de producto no reconocido.");
             return;
    }

    const fieldsContainer = document.getElementById(fieldsContainerId);
    if (fieldsContainer) {
        fieldsContainer.classList.remove('hidden');
    } else {
        console.error(`Contenedor de campos no encontrado para tipo: ${type} (ID: ${fieldsContainerId})`);
        showAlert(`Error: No se encontró la configuración para ${typeNameSingular}.`);
        return;
    }

    productModalTitle.textContent = product ? `Editar ${typeNameSingular}` : `Añadir ${typeNameSingular}`;
    productIdInput.value = product ? product.id : '';
    productTypeInput.value = type; // Usar el tipo de la tabla (ej: otros_productos)
    productNameInput.value = product ? product.nombre : '';

    // Rellenar campos específicos si es edición
    if (product) {
        switch (type) {
            case 'pizzas':
                document.getElementById('product-ingredients-pizza').value = product.ingredientes || '';
                document.getElementById('product-price-chica').value = product.precio_chica || 0;
                document.getElementById('product-price-mediana').value = product.precio_mediana || 0;
                document.getElementById('product-price-xl').value = product.precio_xl || 0;
                break;
            case 'churrascos':
                 document.getElementById('product-ingredients-churrasco').value = product.ingredientes || '';
                document.getElementById('product-price-churrasco').value = product.precio || 0;
                break;
            case 'agregados':
                document.getElementById('product-price-individual').value = product.precio_individual || 0;
                document.getElementById('product-price-mediana-agregado').value = product.precio_mediana || 0;
                document.getElementById('product-price-xl-agregado').value = product.precio_xl || 0;
                break;
            case 'otros_productos':
                document.getElementById('product-category').value = product.categoria || '';
                document.getElementById('product-price-otro').value = product.precio || 0;
                break;
        }
    } else {
         // Limpiar campos específicos si es añadir (ya que reset no afecta type=number bien a veces)
         switch (type) {
            case 'pizzas':
                document.getElementById('product-ingredients-pizza').value = '';
                document.getElementById('product-price-chica').value = '';
                document.getElementById('product-price-mediana').value = '';
                document.getElementById('product-price-xl').value = '';
                break;
            case 'churrascos':
                 document.getElementById('product-ingredients-churrasco').value = '';
                document.getElementById('product-price-churrasco').value = '';
                break;
            case 'agregados':
                document.getElementById('product-price-individual').value = '';
                document.getElementById('product-price-mediana-agregado').value = '';
                document.getElementById('product-price-xl-agregado').value = '';
                break;
            case 'otros_productos':
                document.getElementById('product-category').value = '';
                document.getElementById('product-price-otro').value = '';
                break;
        }
    }


    productModal.classList.remove('hidden');
    productNameInput.focus();
}

// Función para cerrar el modal de producto
function closeProductModal() {
    productModal.classList.add('hidden');
}

// Función para guardar (añadir o editar) producto
async function saveProduct(event) {
    event.preventDefault(); // Evitar recarga de página por submit
    const id = productIdInput.value ? parseInt(productIdInput.value) : null;
    const type = productTypeInput.value; // Este es el nombre de la tabla (ej: 'otros_productos')
    const name = productNameInput.value.trim();

    if (!name) {
        showAlert("El nombre del producto es obligatorio.");
        return;
    }

    let productData = { id: id, nombre: name };

    // Recoger datos específicos del tipo
     try {
        switch (type) {
            case 'pizzas':
                productData.ingredientes = document.getElementById('product-ingredients-pizza').value.trim();
                productData.precio_chica = parseInt(document.getElementById('product-price-chica').value) || 0;
                productData.precio_mediana = parseInt(document.getElementById('product-price-mediana').value) || 0;
                productData.precio_xl = parseInt(document.getElementById('product-price-xl').value) || 0;
                break;
            case 'churrascos':
                 productData.ingredientes = document.getElementById('product-ingredients-churrasco').value.trim();
                productData.precio = parseInt(document.getElementById('product-price-churrasco').value) || 0;
                break;
            case 'agregados':
                productData.precio_individual = parseInt(document.getElementById('product-price-individual').value) || 0;
                productData.precio_mediana = parseInt(document.getElementById('product-price-mediana-agregado').value) || 0;
                productData.precio_xl = parseInt(document.getElementById('product-price-xl-agregado').value) || 0;
                break;
            case 'otros_productos':
                productData.categoria = document.getElementById('product-category').value.trim();
                productData.precio = parseInt(document.getElementById('product-price-otro').value) || 0;
                 if (!productData.categoria) { // Validar categoría para 'otros'
                    showAlert("La categoría es obligatoria para 'Otros Productos'.");
                    return;
                }
                break;
            default:
                 throw new Error(`Tipo de producto desconocido: ${type}`);
        }
    } catch (error) {
        console.error("Error recogiendo datos del formulario:", error);
        showAlert(`Error en los datos del formulario: ${error.message}`);
        return;
    }


    try {
        let result;
        if (id) { // Editar
            result = await window.api.updateProduct({ type, productData });
        } else { // Añadir
            // No enviar 'id' si es null o undefined al añadir
            const { id: _, ...newData } = productData;
            result = await window.api.addProduct({ type, productData: newData });
        }

        if (result.success) {
            showAlert(`Producto ${id ? 'actualizado' : 'añadido'} correctamente.`);
            closeProductModal();
            // Recargar la lista de productos en la pestaña de gestión Y el catálogo
            await refreshProducts();
        } else {
            // Mostrar error específico de UNIQUE constraint si ocurre
            if (result.message && result.message.includes('UNIQUE constraint failed')) {
                 showAlert(`Error: Ya existe un producto con el nombre "${name}".`);
            } else {
                 showAlert(`Error al ${id ? 'actualizar' : 'añadir'} producto: ${result.message || 'Error desconocido.'}`);
            }
        }
    } catch (error) {
        console.error('Error al guardar producto:', error);
        showAlert(`Error crítico al guardar producto: ${error.message}`);
    }
}

// Función para abrir el modal de confirmación de eliminación de producto
function openDeleteProductConfirmation(type, id) {
     // *** CORRECCIÓN AQUÍ: Usar 'otros' si type es 'otros_productos' ***
    const dataKey = type === 'otros_productos' ? 'otros' : type;
    const product = findProduct(dataKey, id); // Buscar usando la clave correcta
    if (!product) {
        showAlert("No se encontró el producto a eliminar.");
        return;
    }
    productToDelete = { type, id }; // Guardar el tipo de tabla original ('otros_productos')
    document.getElementById('confirm-delete-product-message').textContent = `¿Estás seguro de que deseas eliminar "${product.nombre}" (${type === 'otros_productos' ? 'Otro Producto' : type.slice(0,-1)})?`;
    confirmDeleteProductModal.classList.remove('hidden');
}


// Función para confirmar la eliminación de producto
async function confirmDeleteProduct() {
    if (!productToDelete) return;
    const { type, id } = productToDelete; // type aquí es el nombre de la tabla
    try {
        const result = await window.api.deleteProduct({ type, productId: id });
        if (result.success) {
            showAlert("Producto eliminado correctamente.");
            await refreshProducts(); // Recargar listas
        } else {
            showAlert(`Error al eliminar producto: ${result.message}`);
        }
    } catch (error) {
        console.error("Error al eliminar producto:", error);
        showAlert(`Error crítico al eliminar producto: ${error.message}`);
    } finally {
        closeDeleteProductConfirmation();
    }
}

// Función para cerrar el modal de confirmación de eliminación
function closeDeleteProductConfirmation() {
    confirmDeleteProductModal.classList.add('hidden');
    productToDelete = null;
}

// Función auxiliar para encontrar un producto por tipo e ID
function findProduct(dataKey, id) { // Recibe la dataKey ('pizzas', 'otros', etc.)
    if (!allProducts[dataKey]) {
         console.warn(`No se encontró la clave de datos '${dataKey}' en allProducts`);
         return null;
     }
    return allProducts[dataKey].find(p => p.id === id);
}


// Función para recargar los productos y actualizar las vistas
async function refreshProducts() {
    try {
        allProducts = await window.api.getProducts();
        if (allProducts && Object.keys(allProducts).length > 0) {
            displayProducts(allProducts); // Actualiza el catálogo
            // Actualizar la pestaña de gestión SOLO si está visible
            if (!document.getElementById('products-tab-content').classList.contains('hidden')) {
                populateProductManagement();
            }
            // Eliminado: Llamada a populatePriceSettings()
        } else {
             console.error("No se recibieron productos o están vacíos después de refrescar.");
             showAlert("Error: No se pudieron recargar los productos.");
        }
    } catch (error) {
         console.error("Error al refrescar productos:", error);
         showAlert("Error crítico al recargar productos.");
    }
}


// --- EVENT LISTENERS --- (La mayoría sin cambios)
alertModalCloseBtn.addEventListener('click', () => { alertModal.classList.add('hidden'); });

finalizeOrderBtn.addEventListener('click', async () => {
    fullOrder = collectOrderData();
    if (!fullOrder) return;
    try {
        const filePath = await window.api.generateTicket(fullOrder);
        if (filePath) showPrintPreview(filePath, false); // Es un ticket
        else showAlert("Hubo un error al generar el ticket.");
    } catch (error) { console.error("Error generando ticket:", error); showAlert("Error crítico al generar el ticket. Revise la consola."); }
});

updateOrderBtn.addEventListener('click', async () => {
    const updatedOrderData = collectOrderData();
    if (!updatedOrderData) return;
    try {
        const success = await window.api.updateOrder(updatedOrderData);
        if (success) {
            showAlert('Pedido actualizado correctamente.');
            resetOrderState(); // resetOrderState ya habilita las pestañas
            document.querySelector('.tab-button[data-target="history-tab-content"]').click();
        } else {
            showAlert('Hubo un error al actualizar el pedido.');
        }
    } catch (error) { console.error("Error al actualizar pedido:", error); showAlert("Error crítico al actualizar el pedido. Revise la consola."); }
});


document.getElementById('preview-cancel-btn').addEventListener('click', (e) => {
    const type = e.target.dataset.type;
    const path = type === 'shoppingList' ? shoppingListPdfPath : tempPdfPath;
    if (path) { // Asegurarse de que hay una ruta antes de intentar cancelar
        window.api.cancelPrint(path);
         // Limpiar la ruta correspondiente
        if (type === 'shoppingList') shoppingListPdfPath = '';
        else tempPdfPath = '';
    } else {
        console.warn("Se intentó cancelar impresión sin una ruta de archivo válida.");
    }
    previewModal.classList.add('hidden');
});


document.getElementById('preview-confirm-btn').addEventListener('click', async (e) => {
    const type = e.target.dataset.type;
    const path = type === 'shoppingList' ? shoppingListPdfPath : tempPdfPath;
    previewModal.classList.add('hidden'); // Ocultar modal inmediatamente

    if (!path) {
        showAlert("Error: No se encontró la ruta del archivo a imprimir.");
        return;
    }

    if (type === 'shoppingList') {
        const result = await window.api.confirmPrintShoppingList(path);
        showAlert(result.message);
        shoppingListPdfPath = ''; // Limpiar ruta después de intentar imprimir
    } else { // Es un ticket
        // Usar los datos guardados en fullOrder para confirmar el pedido en la DB
        const printResult = await window.api.confirmPrint({ filePath: path, orderData: fullOrder });
        if (printResult.success) {
            resetOrderState(); // resetOrderState habilita tabs
            document.querySelector('.tab-button[data-target="catalog-tab-content"]').click();
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input'));
        } else {
            showAlert(`Error al imprimir: ${printResult.error}\nRevise la consola para más detalles.`);
        }
        tempPdfPath = ''; // Limpiar ruta después de intentar imprimir
        fullOrder = {}; // Limpiar datos del pedido impreso/confirmado
    }
});


reportBtn.addEventListener('click', async () => { const result = await window.api.generateReport(); showAlert(result.message); });

historyListEl.addEventListener('click', async (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.dataset.deliverId) { const orderId = button.dataset.deliverId; const success = await window.api.updateOrderStatus({ orderId: orderId, status: 'Entregado' }); if (success) { loadOrderHistory(); } else { showAlert('Hubo un error al actualizar el pedido.'); } }
    if (button.dataset.editId) {
        const orderId = parseInt(button.dataset.editId);
        // Primero, asegurarse de que no haya un pedido actual en curso
        if (currentOrder.length > 0) {
            showAlert("Termine o cancele el pedido actual antes de editar uno del historial.");
            return;
        }
        const orders = await window.api.getTodaysOrders();
        const orderToEdit = orders.find(o => o.id === orderId);
        if (orderToEdit) {
            editingOrderId = orderToEdit.id;
            document.getElementById('customer-name').value = orderToEdit.cliente_nombre;
            document.getElementById('customer-phone').value = orderToEdit.cliente_telefono;
            // Asegurarse de parsear correctamente y manejar errores
             try {
                // Rehidratar items con orderId temporal para la UI
                currentOrder = JSON.parse(orderToEdit.items_json).map(item => ({...item, orderId: Date.now() + Math.random()}));
                 // Restaurar estado de pago y entrega/hora
                document.querySelector(`input[name="payment-status"][value="${orderToEdit.estado_pago || 'Por Pagar'}"]`).checked = true;
                const paymentWrapperVisible = (orderToEdit.estado_pago === 'Pagado');
                paymentMethodWrapper.classList.toggle('hidden', !paymentWrapperVisible);
                if(paymentWrapperVisible && orderToEdit.forma_pago) {
                    const isStandardMethod = [...paymentMethodSelect.options].some(opt => opt.value === orderToEdit.forma_pago);
                    if(isStandardMethod) {
                        paymentMethodSelect.value = orderToEdit.forma_pago;
                        otherPaymentWrapper.classList.add('hidden');
                        document.getElementById('other-payment-method').value = '';
                    } else {
                        paymentMethodSelect.value = 'otra';
                        otherPaymentWrapper.classList.remove('hidden');
                        document.getElementById('other-payment-method').value = orderToEdit.forma_pago;
                    }
                } else {
                     paymentMethodSelect.value = 'Efectivo'; // Default
                     otherPaymentWrapper.classList.add('hidden');
                     document.getElementById('other-payment-method').value = '';
                }

                document.querySelector(`input[name="delivery-type"][value="${orderToEdit.tipo_entrega || 'demora'}"]`).checked = true;
                const isScheduled = (orderToEdit.tipo_entrega === 'agendado');
                document.getElementById('delivery-delay-input').classList.toggle('hidden', isScheduled);
                document.getElementById('delivery-scheduled-input').classList.toggle('hidden', !isScheduled);
                if(isScheduled) {
                    document.getElementById('scheduled-time').value = orderToEdit.hora_entrega || '';
                } else {
                    // No podemos recalcular la demora exacta, dejamos el default o vacío
                    document.getElementById('delay-minutes').value = '25'; // O dejar vacío: ''
                }


            } catch (error) {
                console.error(`Error parseando items o restaurando estado del pedido a editar #${orderId}:`, error);
                showAlert("Error al cargar los datos del pedido para editar.");
                editingOrderId = null; // Resetear si hay error
                resetOrderState(); // Limpiar sidebar
                return;
            }
            updateOrderSummary(); // updateOrderSummary deshabilita otras tabs si hay items
            finalizeOrderBtn.classList.add('hidden');
            updateOrderBtn.classList.remove('hidden');
            document.querySelector('.tab-button[data-target="catalog-tab-content"]').click(); // Cambiar a catálogo
             // Asegurar que solo la pestaña de catálogo esté activa
            disableOtherTabs('catalog-tab-content');
        }
    }
    if (button.dataset.payId) { payingOrderId = button.dataset.payId; confirmPaymentModal.classList.remove('hidden'); }
    if (button.dataset.reprintId) {
        const orderId = parseInt(button.dataset.reprintId);
        const orders = await window.api.getTodaysOrders();
        const orderToReprint = orders.find(o => o.id === orderId);
        if (orderToReprint) {
             try {
                 // Reconstruir fullOrder solo para la reimpresión
                 const orderDataForReprint = {
                     id: orderToReprint.id,
                     customer: { name: orderToReprint.cliente_nombre, phone: orderToReprint.cliente_telefono },
                     total: orderToReprint.total,
                     items: JSON.parse(orderToReprint.items_json), // Parsear aquí
                     timestamp: orderToReprint.fecha,
                     delivery: { type: orderToReprint.tipo_entrega, time: orderToReprint.hora_entrega },
                     payment: { status: orderToReprint.estado_pago, method: orderToReprint.forma_pago }
                 };
                const filePath = await window.api.generateTicket(orderDataForReprint);
                if (filePath) {
                    // Guardamos temporalmente los datos para la confirmación
                    tempPdfPath = filePath;
                    fullOrder = orderDataForReprint; // Guardamos para confirmPrint
                    showPrintPreview(filePath, false); // Es un ticket
                } else {
                     showAlert("Hubo un error al generar el ticket de reimpresión.");
                 }
            } catch (error) {
                 console.error(`Error al preparar reimpresión del pedido #${orderId}:`, error);
                 showAlert("Error al procesar los datos para la reimpresión.");
             }
        }
    }
    if (button.dataset.deleteId) {
        orderToDeleteId = parseInt(button.dataset.deleteId);
        document.getElementById('confirm-delete-message').textContent = `¿Estás seguro de que deseas eliminar el Pedido #${orderToDeleteId}? Esta acción NO se puede deshacer y renumerará los pedidos del día.`;
        confirmDeleteModal.classList.remove('hidden');
    }
});


document.getElementById('delete-cancel-btn').addEventListener('click', () => { confirmDeleteModal.classList.add('hidden'); orderToDeleteId = null; });

document.getElementById('delete-confirm-btn').addEventListener('click', async () => {
    if (orderToDeleteId) {
        const success = await window.api.deleteOrder(orderToDeleteId);
        if (success) {
            showAlert(`Pedido #${orderToDeleteId} eliminado y pedidos renumerados.`);
            loadOrderHistory(); // Recargar historial para ver cambios
        } else {
            showAlert('Error al eliminar el pedido.');
        }
        confirmDeleteModal.classList.add('hidden');
        orderToDeleteId = null;
    }
});

// Eliminado: Listener para savePricesBtn

saveInventoryBtn.addEventListener('click', async () => {
    const updates = [];
    document.querySelectorAll('.inventory-input').forEach(input => {
        const id = parseInt(input.dataset.id);
        const cantidad = input.value; // Guardar como texto
        const comprarCheckbox = document.querySelector(`.buy-checkbox[data-id="${id}"]`);
        const comprar = comprarCheckbox.checked ? 1 : 0;
        updates.push({ id, cantidad, comprar });
    });
    const result = await window.api.updateInventory(updates);
    if (result.success) {
        showAlert('Inventario actualizado correctamente.');
    } else {
        showAlert(`Error al actualizar el inventario: ${result.message}`);
    }
});

printShoppingListBtn.addEventListener('click', async () => {
    const result = await window.api.generateShoppingListPdf();
    if (result.success) {
        showPrintPreview(result.filePath, true); // Es una lista de compras
    } else {
        showAlert(result.message);
    }
});

orderSummaryEl.addEventListener('click', (e) => { if (e.target.matches('.remove-item-btn')) { const itemId = parseFloat(e.target.dataset.id); removeFromOrder(itemId); } });
document.querySelectorAll('input[name="delivery-type"]').forEach(radio => { radio.addEventListener('change', (e) => { if (e.target.value === 'demora') { document.getElementById('delivery-delay-input').classList.remove('hidden'); document.getElementById('delivery-scheduled-input').classList.add('hidden'); } else { document.getElementById('delivery-delay-input').classList.add('hidden'); document.getElementById('delivery-scheduled-input').classList.remove('hidden'); } }); });
paymentMethodSelect.addEventListener('change', () => { otherPaymentWrapper.classList.toggle('hidden', paymentMethodSelect.value !== 'otra'); });
document.querySelectorAll('input[name="payment-status"]').forEach(radio => { radio.addEventListener('change', (e) => { paymentMethodWrapper.classList.toggle('hidden', e.target.value !== 'Pagado'); }); });

document.querySelectorAll('.tab-button').forEach(tab => {
  tab.addEventListener('click', () => {
    // Permitir cambio de pestaña solo si no se está editando un pedido O si el pedido está vacío
    if (editingOrderId && currentOrder.length > 0 && tab.dataset.target !== 'catalog-tab-content') {
         showAlert("Debe finalizar o cancelar la edición del pedido actual antes de cambiar de pestaña.");
         return; // Evitar cambio de pestaña
    }

    // Quitar 'active' de todas las pestañas y contenidos
    document.querySelectorAll('.tab-button').forEach(item => { item.classList.remove('active'); item.classList.add('border-transparent', 'text-gray-500'); item.classList.remove('border-orange-500','text-orange-600', 'bg-orange-50');}); // Usar naranja como color activo
    document.querySelectorAll('.tab-content').forEach(content => { content.classList.add('hidden'); });

    // Activar la pestaña clickeada y su contenido
    tab.classList.add('active'); // Estilo activo (definido en CSS)
    tab.classList.remove('border-transparent', 'text-gray-500'); // Quitar estilo inactivo

    const targetContent = document.getElementById(tab.dataset.target);
    if (targetContent) { targetContent.classList.remove('hidden'); }

    // Cargar datos específicos si es necesario
    if (tab.dataset.target === 'history-tab-content') { loadOrderHistory(); }
    // Eliminado: Llamada a populatePriceSettings
    if (tab.dataset.target === 'inventory-tab-content') { populateInventory(); }
    // CRUD: Cargar datos de la pestaña de productos
    if (tab.dataset.target === 'products-tab-content') { populateProductManagement(); }
  });
});

// Listener para sub-pestañas del catálogo
document.querySelectorAll('#catalog-tab-content .sub-tab-button').forEach(tab => {
    tab.addEventListener('click', () => {
        // Remover clase activa de otras sub-pestañas DENTRO DEL CATÁLOGO
        document.querySelectorAll('#catalog-tab-content .sub-tab-button').forEach(item => item.classList.remove('active'));
        // Añadir clase activa a la clickeada
        tab.classList.add('active');
        // Ocultar todos los contenidos de sub-pestañas DENTRO DEL CATÁLOGO
        document.querySelectorAll('#catalog-content .sub-tab-content').forEach(content => content.classList.add('hidden'));
        // Mostrar el contenido correspondiente
        const targetContent = document.getElementById(tab.dataset.target);
        if (targetContent) {
            targetContent.classList.remove('hidden');
        }
         // Limpiar búsqueda al cambiar de sub-pestaña
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input')); // Disparar evento input para aplicar filtro vacío
    });
});


addToOrderBtn.addEventListener('click', () => { let itemName; let baseName; if (hnhCheckbox.checked && ['mediana', 'xl'].includes(currentPizzaConfig.size)) { const pizza1Name = hnhSelect1.options[hnhSelect1.selectedIndex].text.toLowerCase(); const pizza2Name = hnhSelect2.options[hnhSelect2.selectedIndex].text.toLowerCase(); baseName = `Mitad ${pizza1Name}/Mitad ${pizza2Name}`; } else { baseName = currentPizzaConfig.basePizza.nombre; } const sizePrefix = {xl: 'XL - ',mediana: 'M - ',chica: 'CH - '}[currentPizzaConfig.size] || ''; itemName = sizePrefix + baseName; const finalItem = { orderId: Date.now() + Math.random(), name: itemName, size: currentPizzaConfig.size, extras: currentPizzaConfig.extras.map(e => ({ id: e.id, nombre: e.nombre })), price: currentPizzaConfig.price, notes: document.getElementById('pizza-notes').value.trim() }; addToOrder(finalItem); pizzaModal.classList.add('hidden'); });
document.getElementById('size-options').addEventListener('click', (e) => { if (e.target.matches('.size-button')) { currentPizzaConfig.size = e.target.dataset.size; updateModalUI(); } });
document.getElementById('extras-container').addEventListener('input', (e) => { if(e.target.matches('.extra-checkbox')) { updateModalPrice(); } });
document.getElementById('cancel-button').addEventListener('click', () => { pizzaModal.classList.add('hidden'); });
hnhCheckbox.addEventListener('change', () => { hnhOptions.classList.toggle('hidden', !hnhCheckbox.checked); updateModalPrice(); });
hnhSelect1.addEventListener('change', updateModalPrice);
hnhSelect2.addEventListener('change', updateModalPrice);
document.getElementById('notes-cancel-btn').addEventListener('click', () => { notesModal.classList.add('hidden'); });
document.getElementById('notes-confirm-btn').addEventListener('click', () => { const notes = document.getElementById('product-notes').value.trim(); const itemData = { orderId: Date.now() + Math.random(), name: currentNoteItem.nombre, price: currentNoteItem.precio, size: null, extras: [], notes: notes }; addToOrder(itemData); notesModal.classList.add('hidden'); });
document.getElementById('history-payment-method').addEventListener('change', (e) => { document.getElementById('history-other-payment-wrapper').classList.toggle('hidden', e.target.value !== 'otra'); });
document.getElementById('payment-cancel-btn').addEventListener('click', () => { confirmPaymentModal.classList.add('hidden'); payingOrderId = null; });
document.getElementById('payment-confirm-btn').addEventListener('click', async () => { let paymentMethod = document.getElementById('history-payment-method').value; if (paymentMethod === 'otra') { const otherPayment = document.getElementById('history-other-payment-method').value.trim(); if (!otherPayment) { showAlert('Por favor, especifique la otra forma de pago.'); return; } paymentMethod = otherPayment; } const success = await window.api.updatePaymentStatus({ orderId: payingOrderId, status: 'Pagado', paymentMethod: paymentMethod }); if (success) { loadOrderHistory(); } else { showAlert('Hubo un error al actualizar el estado de pago.'); } confirmPaymentModal.classList.add('hidden'); payingOrderId = null; });
customSizeOptions.addEventListener('click', (e) => { if (e.target.matches('.size-button')) { customPizzaSize = e.target.dataset.size; customSizeOptions.querySelectorAll('.size-button').forEach(btn => { btn.classList.toggle('active', btn.dataset.size === customPizzaSize); }); } });
customCancelButton.addEventListener('click', () => { customPizzaModal.classList.add('hidden'); });
customAddToOrderButton.addEventListener('click', () => { const ingredients = customPizzaIngredients.value.trim(); const price = parseInt(customPizzaPriceInput.value); if (!ingredients) { showAlert('Por favor, ingrese los ingredientes de la pizza.'); return; } if (isNaN(price) || price <= 0) { showAlert('Por favor, ingrese un precio válido.'); return; } const sizePrefix = {xl: 'XL - ',mediana: 'M - ',chica: 'CH - '}[customPizzaSize] || ''; const itemName = `${sizePrefix}Pizza Personalizada`; const finalItem = { orderId: Date.now() + Math.random(), name: itemName, size: customPizzaSize, extras: [], price: price, notes: ingredients }; addToOrder(finalItem); customPizzaModal.classList.add('hidden'); });

// --- CRUD: EVENT LISTENERS PRODUCTOS ---
productManagementContainer.addEventListener('click', (e) => {
    // Botón Añadir Producto
    if (e.target.matches('.add-product-btn')) {
        const type = e.target.dataset.type;
        openProductModal(type);
    }
    // Botón Editar Producto
    if (e.target.matches('.edit-product-btn')) {
        const type = e.target.dataset.type;
        const id = parseInt(e.target.dataset.id);
         // *** CORRECCIÓN AQUÍ: Usar 'otros' si type es 'otros_productos' para buscar ***
         const dataKey = type === 'otros_productos' ? 'otros' : type;
        const product = findProduct(dataKey, id); // Buscar usando la clave correcta
        if (product) {
            openProductModal(type, product); // Pasar el tipo de tabla original ('otros_productos')
        } else {
            showAlert("No se encontró el producto para editar.");
        }
    }
    // Botón Eliminar Producto
    if (e.target.matches('.delete-product-btn')) {
        const type = e.target.dataset.type;
        const id = parseInt(e.target.dataset.id);
        openDeleteProductConfirmation(type, id);
    }
});


// Listener para el formulario de producto (submit)
productForm.addEventListener('submit', saveProduct);
// Listener para el botón cancelar del modal de producto
document.getElementById('product-cancel-button').addEventListener('click', closeProductModal);
// Listeners para los botones del modal de confirmación de eliminación de producto
document.getElementById('delete-product-cancel-btn').addEventListener('click', closeDeleteProductConfirmation);
document.getElementById('delete-product-confirm-btn').addEventListener('click', confirmDeleteProduct);


// --- FUNCIONES DE RENDERIZADO Y BÚSQUEDA ---
function displayProducts(products) {
  // Limpiar contenedores existentes
  pizzasContainer.innerHTML = '';
  churrascosContainer.innerHTML = '';
  otrosContainer.innerHTML = '';

  // Renderizar Pizzas
  (products.pizzas || []).forEach(pizza => { pizzasContainer.appendChild(createProductCard(pizza, 'pizzas')); }); // Usar plural para tipo
  const customPizzaCard = document.createElement('div');
  customPizzaCard.className = 'bg-white p-3 rounded-lg shadow cursor-pointer hover:shadow-xl transition-shadow text-center border-2 border-dashed border-blue-400 flex items-center justify-center product-card h-24'; // Añadido product-card y h-24
  customPizzaCard.dataset.name = "pizza personalizada"; // Para búsqueda
  customPizzaCard.innerHTML = `<h3 class="font-bold text-sm leading-tight text-blue-600">+ Pizza Personalizada</h3>`; // Tamaño fuente ajustado
  customPizzaCard.addEventListener('click', openCustomPizzaModal);
  pizzasContainer.appendChild(customPizzaCard);

  // Renderizar Churrascos
  (products.churrascos || []).forEach(churrasco => { churrascosContainer.appendChild(createProductCard(churrasco, 'churrascos')); }); // Usar plural para tipo

  // Renderizar Otros Productos (usando la clave 'otros')
  const otrosAgrupados = groupByCategory(products.otros || []); // << CORRECCIÓN AQUÍ
  for (const categoria in otrosAgrupados) {
    const categoriaWrapper = document.createElement('div');
    categoriaWrapper.innerHTML = `<h2 class="text-xl font-bold mt-4 mb-2 text-gray-700">${categoria}</h2>`;
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
    // Pasar 'otros_productos' como tipo para la lógica de createProductCard
    otrosAgrupados[categoria].forEach(item => { grid.appendChild(createProductCard(item, 'otros_productos')); });
    categoriaWrapper.appendChild(grid);
    otrosContainer.appendChild(categoriaWrapper);
  }
}

function createProductCard(item, type) {
  const card = document.createElement('div');
  card.className = 'product-card bg-white p-3 rounded-lg shadow cursor-pointer hover:shadow-xl transition-shadow text-center flex flex-col justify-center items-center h-24'; // Estilo base para tarjeta
  card.dataset.name = item.nombre.toLowerCase();
  card.innerHTML = `<h3 class="font-bold text-sm leading-tight">${item.nombre}</h3>`; // Tamaño fuente ajustado

  // Diferenciar acción basada en el tipo (nombre de tabla o 'pizzas')
  if (type === 'pizzas') {
      card.addEventListener('click', () => openPizzaModal(item));
  } else if (type === 'churrascos') {
      // Para churrascos, ahora también abrimos el modal de notas
      card.addEventListener('click', () => openNotesModal(item));
  } else if (type === 'otros_productos' || type === 'agregados') { // Agregados también se añaden directo
      card.addEventListener('click', () => {
          const itemData = {
              orderId: Date.now() + Math.random(), // ID único para el item en el pedido actual
              name: item.nombre,
              // Determinar precio correcto (agregados pueden tener varios, otros_productos solo uno)
              price: item.precio ?? item.precio_individual ?? 0, // Usar ?? para tomar el primer valor no nulo/undefined, o 0
              size: null, // No aplica tamaño
              extras: [], // No aplica extras directamente aquí
              notes: ''   // Sin notas por defecto
          };
          addToOrder(itemData);
      });
  } else {
        console.warn(`Tipo de producto desconocido en createProductCard: ${type}`);
  }
  return card;
}


function groupByCategory(items) { return items.reduce((acc, item) => { const key = item.categoria || 'General'; if (!acc[key]) { acc[key] = []; } acc[key].push(item); return acc; }, {}); }

searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    // Afectar solo a las tarjetas de producto en la pestaña de catálogo activa
    const activeCatalogTab = document.querySelector('#catalog-content .sub-tab-content:not(.hidden)');
    if (activeCatalogTab) {
        activeCatalogTab.querySelectorAll('.product-card').forEach(card => {
            // Asegurarse que la tarjeta tenga dataset.name antes de filtrar
            if (card.dataset.name) {
                 card.classList.toggle('hidden', !card.dataset.name.includes(searchTerm));
            }
        });
    }
});


// Función para filtrar lista de extras en el modal
function filterExtrasList() {
    const searchTerm = searchExtrasInput.value.toLowerCase();
    document.querySelectorAll('#extras-container label').forEach(label => {
        const extraName = label.textContent.trim().toLowerCase();
        label.classList.toggle('hidden', !extraName.includes(searchTerm));
    });
}
// Listener para input de búsqueda de extras
searchExtrasInput.addEventListener('input', filterExtrasList);


// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  // Cargar productos iniciales
  refreshProducts(); // Usar refreshProducts para cargar todo inicialmente

  // Listener para actualizaciones de inventario remotas
  window.api.onInventoryUpdate(() => {
      console.log('Señal de actualización de inventario recibida.');
      const inventoryTab = document.getElementById('inventory-tab-content');
      // Verificar si inventoryTab existe y no está oculta
      if (inventoryTab && !inventoryTab.classList.contains('hidden')) {
          console.log('Actualizando la vista del inventario...');
          populateInventory();
      }
  });


  // Listeners para botones de la barra de título
  document.getElementById('minimize-btn').addEventListener('click', () => { window.api.minimizeWindow(); });
  document.getElementById('maximize-btn').addEventListener('click', () => { window.api.maximizeWindow(); });
  document.getElementById('close-btn').addEventListener('click', () => { window.api.closeWindow(); });

  // Activar la primera pestaña (Catálogo) por defecto visualmente
   const firstTab = document.querySelector('.tab-button');
   if(firstTab) firstTab.click();
   const firstSubTab = document.querySelector('.sub-tab-button[data-target="pizzas-tab"]'); // Ser más específico
   if(firstSubTab) firstSubTab.click();
});