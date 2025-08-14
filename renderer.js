// renderer.js
let allProducts = {};
let currentOrder = [];
let fullOrder = {};
let tempPdfPath = '';
let currentPizzaConfig = {};
let currentNoteItem = {};
let editingOrderId = null;
let payingOrderId = null;

// --- ELEMENTOS DEL DOM ---
const pizzaModal = document.getElementById('pizza-modal');
const previewModal = document.getElementById('preview-modal');
const notesModal = document.getElementById('notes-modal');
const confirmPaymentModal = document.getElementById('confirm-payment-modal');
const orderSummaryEl = document.getElementById('order-summary');
const totalPriceEl = document.getElementById('total-price');
const pizzasContainer = document.getElementById('pizzas-tab');
const churrascosContainer = document.getElementById('churrascos-tab');
const otrosContainer = document.getElementById('otros-tab');
const addToOrderBtn = document.getElementById('add-to-order-button');
const hnhCheckbox = document.getElementById('half-and-half-checkbox');
const hnhOptions = document.getElementById('half-options');
const hnhSelect1 = document.getElementById('half-1');
const hnhSelect2 = document.getElementById('half-2');
const finalizeOrderBtn = document.getElementById('finalize-order-btn');
const reportBtn = document.getElementById('report-btn');
const historyListEl = document.getElementById('history-list');
const historyTabBtn = document.querySelector('.tab-button[data-target="history-tab-content"]');
const paymentMethodWrapper = document.getElementById('payment-method-wrapper');
const paymentMethodSelect = document.getElementById('payment-method');
const otherPaymentWrapper = document.getElementById('other-payment-wrapper');
const searchInput = document.getElementById('search-products');
const searchExtrasInput = document.getElementById('search-extras');
const alertModal = document.getElementById('alert-modal');
const alertModalMessage = document.getElementById('alert-modal-message');
const alertModalCloseBtn = document.getElementById('alert-modal-close-btn');

// --> NUEVO: Elementos del DOM para pizza personalizada
const customPizzaModal = document.getElementById('custom-pizza-modal');
const customSizeOptions = document.getElementById('custom-size-options');
const customPizzaIngredients = document.getElementById('custom-pizza-ingredients');
const customPizzaPriceInput = document.getElementById('custom-pizza-price-input');
const customCancelButton = document.getElementById('custom-cancel-button');
const customAddToOrderButton = document.getElementById('custom-add-to-order-button');
let customPizzaSize = 'mediana'; // Variable para guardar el tamaño seleccionado


// --- LÓGICA DE ALERTAS ---
function showAlert(message) {
    alertModalMessage.textContent = message;
    alertModal.classList.remove('hidden');
    alertModalCloseBtn.focus();
}

// --- LÓGICA DE VISTA PREVIA ---
function showPrintPreview(filePath) {
  tempPdfPath = filePath;
  const pdfPreview = document.getElementById('pdf-preview');
  pdfPreview.src = `${filePath}?t=${new Date().getTime()}`;
  previewModal.classList.remove('hidden');
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
            const items = JSON.parse(order.items_json);
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
                    <button class="bg-gray-500 text-white text-xs px-3 py-1 rounded hover:bg-gray-600" data-reprint-id="${order.id}">Reimprimir</button>
                    <button class="bg-yellow-500 text-white text-xs px-3 py-1 rounded hover:bg-yellow-600 ${isDelivered ? 'hidden' : ''}" data-edit-id="${order.id}">Editar</button>
                    <button class="bg-green-500 text-white text-xs px-3 py-1 rounded hover:bg-green-600 disabled:bg-gray-400" data-pay-id="${order.id}" ${isPaid ? 'disabled' : ''}>Marcar Pagado</button>
                    <button class="bg-blue-500 text-white text-xs px-3 py-1 rounded hover:bg-blue-600 disabled:bg-gray-400" data-deliver-id="${order.id}" ${isDelivered ? 'disabled' : ''}>Marcar Entregado</button>
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
    orderSummaryEl.innerHTML = '<p class="text-center text-gray-500 py-8">El pedido está vacío</p>';
    editingOrderId = null;
    historyTabBtn.disabled = false;
    historyTabBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  } else {
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
          ${item.notes ? `Nota: ${item.notes}` : ''}
        </div>
        <button class="text-red-500 text-xs hover:underline remove-item-btn" data-id="${item.orderId}">Quitar</button>
      `;
      orderSummaryEl.appendChild(itemEl);
    });
  }
  const total = currentOrder.reduce((sum, item) => sum + item.price, 0);
  totalPriceEl.textContent = `$${total.toLocaleString('es-CL')}`;
}

// --- LÓGICA DE MODALES ---
function openPizzaModal(pizza) {
    currentPizzaConfig = { basePizza: pizza, size: 'mediana', price: pizza.precio_mediana, extras: [] };
    document.getElementById('modal-pizza-name').textContent = pizza.nombre;
    const extrasContainer = document.getElementById('extras-container');
    extrasContainer.innerHTML = '';
    allProducts.agregados.forEach(extra => {
        const label = document.createElement('label');
        label.className = 'flex items-center gap-2 p-1 rounded hover:bg-gray-100 cursor-pointer';
        label.innerHTML = `<input type="checkbox" class="extra-checkbox" data-id="${extra.id}"><span>${extra.nombre}</span>`;
        extrasContainer.appendChild(label);
    });
    hnhSelect1.innerHTML = '';
    hnhSelect2.innerHTML = '';
    const availablePizzasForHalves = allProducts.pizzas.filter(p => p.nombre.toLowerCase() !== 'calzone');
    availablePizzasForHalves.forEach(p => { 
        hnhSelect1.innerHTML += `<option value="${p.id}">${p.nombre}</option>`; 
        hnhSelect2.innerHTML += `<option value="${p.id}">${p.nombre}</option>`; 
    });
    hnhSelect1.value = pizza.id;
    hnhSelect2.value = pizza.id;
    document.getElementById('pizza-notes').value = '';
    hnhCheckbox.checked = false;
    hnhOptions.classList.add('hidden');
    searchExtrasInput.value = '';
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
        const pizza1 = allProducts.pizzas.find(p => p.id === pizza1Id);
        const pizza2 = allProducts.pizzas.find(p => p.id === pizza2Id);
        if(pizza1 && pizza2) {
            const price1 = pizza1[`precio_${size}`] || 0;
            const price2 = pizza2[`precio_${size}`] || 0;
            basePrice = Math.round((price1 + price2) / 2);
        }
    } else {
        basePrice = currentPizzaConfig.basePizza[`precio_${size}`] || 0;
    }
    let extrasPrice = 0;
    currentPizzaConfig.extras = [];
    document.querySelectorAll('.extra-checkbox:checked').forEach(checkbox => {
        const extraId = parseInt(checkbox.dataset.id);
        const extra = allProducts.agregados.find(e => e.id === extraId);
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
    document.getElementById('product-notes').value = '';
    notesModal.classList.remove('hidden');
}

// --> NUEVO: Función para abrir y resetear el modal de pizza personalizada
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

// --- EVENT LISTENERS ---
alertModalCloseBtn.addEventListener('click', () => {
    alertModal.classList.add('hidden');
});

finalizeOrderBtn.addEventListener('click', async () => {
  const customerName = document.getElementById('customer-name').value.trim();
  if (currentOrder.length === 0) { showAlert('No se puede finalizar un pedido vacío.'); return; }
  if (!customerName) { showAlert('Por favor, ingrese el nombre del cliente.'); return; }
  const deliveryType = document.querySelector('input[name="delivery-type"]:checked').value;
  let deliveryTime;
  if (deliveryType === 'demora') { const minutes = parseInt(document.getElementById('delay-minutes').value) || 0; const deliveryDate = new Date(Date.now() + minutes * 60000); deliveryTime = deliveryDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }); } else { deliveryTime = document.getElementById('scheduled-time').value; if(!deliveryTime) { showAlert('Por favor, especifique una hora de entrega.'); return; } }
  const paymentStatus = document.querySelector('input[name="payment-status"]:checked').value;
  let paymentMethod = null;
  if (paymentStatus === 'Pagado') {
      paymentMethod = paymentMethodSelect.value;
      if (paymentMethod === 'otra') {
          const otherPayment = document.getElementById('other-payment-method').value.trim();
          if (!otherPayment) { showAlert('Por favor, especifique la otra forma de pago.'); return; }
          paymentMethod = otherPayment;
      }
  }
  fullOrder = { id: editingOrderId, customer: { name: customerName, phone: document.getElementById('customer-phone').value.trim() }, orderType: document.querySelector('input[name="order-type"]:checked').value, total: currentOrder.reduce((sum, item) => sum + item.price, 0), items: currentOrder, timestamp: new Date().toISOString(), delivery: { type: deliveryType, time: deliveryTime }, payment: { status: paymentStatus, method: paymentMethod } };
  try {
    const filePath = await window.api.generateTicket(fullOrder);
    if (filePath) { showPrintPreview(filePath); }
    else { showAlert("Hubo un error al generar el ticket."); }
  } catch (error) {
    console.error("Error generando ticket:", error);
    showAlert("Error crítico al generar el ticket. Revise la consola.");
  }
});

document.getElementById('preview-cancel-btn').addEventListener('click', () => { window.api.cancelPrint(tempPdfPath); previewModal.classList.add('hidden'); });
document.getElementById('preview-confirm-btn').addEventListener('click', async () => {
  const printResult = await window.api.confirmPrint({ filePath: tempPdfPath, orderData: fullOrder });
  previewModal.classList.add('hidden');
  if (printResult.success) {
    currentOrder = [];
    editingOrderId = null;
    document.getElementById('customer-name').value = '';
    document.getElementById('customer-phone').value = '';
    updateOrderSummary();
    document.querySelector('.tab-button[data-target="catalog-tab-content"]').click();
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
  } else {
    showAlert(`Error al imprimir: ${printResult.error}\nRevise la consola para más detalles.`);
  }
});

reportBtn.addEventListener('click', async () => { const result = await window.api.generateReport(); showAlert(result.message); });

historyListEl.addEventListener('click', async (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.dataset.deliverId) { const orderId = button.dataset.deliverId; const success = await window.api.updateOrderStatus({ orderId: orderId, status: 'Entregado' }); if (success) { loadOrderHistory(); } else { showAlert('Hubo un error al actualizar el pedido.'); } }
    if (button.dataset.editId) { const orderId = parseInt(button.dataset.editId); const orders = await window.api.getTodaysOrders(); const orderToEdit = orders.find(o => o.id === orderId); if (orderToEdit) { editingOrderId = orderToEdit.id; document.getElementById('customer-name').value = orderToEdit.cliente_nombre; document.getElementById('customer-phone').value = orderToEdit.cliente_telefono; currentOrder = JSON.parse(orderToEdit.items_json).map(item => ({...item, orderId: Date.now() + Math.random()})); updateOrderSummary(); historyTabBtn.disabled = true; historyTabBtn.classList.add('opacity-50', 'cursor-not-allowed'); document.querySelector('.tab-button[data-target="catalog-tab-content"]').click(); } }
    if (button.dataset.payId) { payingOrderId = button.dataset.payId; confirmPaymentModal.classList.remove('hidden'); }
    if (button.dataset.reprintId) {
        const orderId = parseInt(button.dataset.reprintId);
        const orders = await window.api.getTodaysOrders();
        const orderToReprint = orders.find(o => o.id === orderId);
        if (orderToReprint) {
            fullOrder = { id: orderToReprint.id, customer: { name: orderToReprint.cliente_nombre, phone: orderToReprint.cliente_telefono }, orderType: orderToReprint.tipo_pedido, total: orderToReprint.total, items: JSON.parse(orderToReprint.items_json), timestamp: orderToReprint.fecha, delivery: { type: orderToReprint.tipo_entrega, time: orderToReprint.hora_entrega }, payment: { status: orderToReprint.estado_pago, method: orderToReprint.forma_pago } };
            const filePath = await window.api.generateTicket(fullOrder);
            if (filePath) { showPrintPreview(filePath); }
            else { showAlert("Hubo un error al generar el ticket de reimpresión."); }
        }
    }
});

orderSummaryEl.addEventListener('click', (e) => { if (e.target.matches('.remove-item-btn')) { const itemId = parseFloat(e.target.dataset.id); removeFromOrder(itemId); } });
document.querySelectorAll('input[name="delivery-type"]').forEach(radio => { radio.addEventListener('change', (e) => { if(e.target.value === 'demora') { document.getElementById('delivery-delay-input').classList.remove('hidden'); document.getElementById('delivery-scheduled-input').classList.add('hidden'); } else { document.getElementById('delivery-delay-input').classList.add('hidden'); document.getElementById('delivery-scheduled-input').classList.remove('hidden'); } }); });
paymentMethodSelect.addEventListener('change', () => { otherPaymentWrapper.classList.toggle('hidden', paymentMethodSelect.value !== 'otra'); });
document.querySelectorAll('input[name="payment-status"]').forEach(radio => { radio.addEventListener('change', (e) => { paymentMethodWrapper.classList.toggle('hidden', e.target.value !== 'Pagado'); }); });
document.querySelectorAll('.tab-button').forEach(tab => { tab.addEventListener('click', () => { if (tab.disabled) return; document.querySelectorAll('.tab-button').forEach(item => { item.classList.remove('active', 'border-blue-600', 'text-blue-600', 'bg-gray-50'); item.classList.add('border-transparent', 'text-gray-500'); }); tab.classList.add('active', 'border-blue-600', 'text-blue-600'); tab.classList.remove('border-transparent', 'text-gray-500'); document.querySelectorAll('.tab-content').forEach(content => { if (content.id === tab.dataset.target) { content.classList.remove('hidden'); } else { content.classList.add('hidden'); } }); if(tab.dataset.target === 'history-tab-content') { loadOrderHistory(); } }); });
document.querySelectorAll('.sub-tab-button').forEach(tab => { tab.addEventListener('click', () => { document.querySelectorAll('.sub-tab-button').forEach(item => item.classList.remove('active', 'bg-white', 'shadow-sm')); tab.classList.add('active', 'bg-white', 'shadow-sm'); document.querySelectorAll('.sub-tab-content').forEach(content => content.classList.add('hidden')); document.getElementById(tab.dataset.target).classList.remove('hidden'); }); });
addToOrderBtn.addEventListener('click', () => { let itemName; if (hnhCheckbox.checked && ['mediana', 'xl'].includes(currentPizzaConfig.size)) { const pizza1Name = hnhSelect1.options[hnhSelect1.selectedIndex].text.toLowerCase(); const pizza2Name = hnhSelect2.options[hnhSelect2.selectedIndex].text.toLowerCase(); baseName = `mitad ${pizza1Name}/mitad ${pizza2Name}`; } else { baseName = currentPizzaConfig.basePizza.nombre; } const sizePrefix = {xl: 'XL - ',mediana: 'M - ',chica: 'CH - '}[currentPizzaConfig.size] || ''; itemName = sizePrefix + baseName; const finalItem = { orderId: Date.now(), name: itemName, size: currentPizzaConfig.size, extras: currentPizzaConfig.extras, price: currentPizzaConfig.price, notes: document.getElementById('pizza-notes').value.trim() }; addToOrder(finalItem); pizzaModal.classList.add('hidden'); });
document.getElementById('size-options').addEventListener('click', (e) => { if (e.target.matches('.size-button')) { currentPizzaConfig.size = e.target.dataset.size; updateModalUI(); } });
document.getElementById('extras-container').addEventListener('input', (e) => { if(e.target.matches('.extra-checkbox')) { updateModalPrice(); } });
document.getElementById('cancel-button').addEventListener('click', () => { pizzaModal.classList.add('hidden'); });
hnhCheckbox.addEventListener('change', () => { hnhOptions.classList.toggle('hidden', !hnhCheckbox.checked); updateModalPrice(); });
hnhSelect1.addEventListener('change', updateModalPrice);
hnhSelect2.addEventListener('change', updateModalPrice);
document.getElementById('notes-cancel-btn').addEventListener('click', () => { notesModal.classList.add('hidden'); });
document.getElementById('notes-confirm-btn').addEventListener('click', () => { const notes = document.getElementById('product-notes').value.trim(); const itemData = { orderId: Date.now(), name: currentNoteItem.nombre, price: currentNoteItem.precio, size: null, extras: [], notes: notes }; addToOrder(itemData); notesModal.classList.add('hidden'); });
document.getElementById('history-payment-method').addEventListener('change', (e) => { document.getElementById('history-other-payment-wrapper').classList.toggle('hidden', e.target.value !== 'otra'); });
document.getElementById('payment-cancel-btn').addEventListener('click', () => { confirmPaymentModal.classList.add('hidden'); payingOrderId = null; });
document.getElementById('payment-confirm-btn').addEventListener('click', async () => { let paymentMethod = document.getElementById('history-payment-method').value; if (paymentMethod === 'otra') { const otherPayment = document.getElementById('history-other-payment-method').value.trim(); if (!otherPayment) { showAlert('Por favor, especifique la otra forma de pago.'); return; } paymentMethod = otherPayment; } const success = await window.api.updatePaymentStatus({ orderId: payingOrderId, status: 'Pagado', paymentMethod: paymentMethod }); if (success) { loadOrderHistory(); } else { showAlert('Hubo un error al actualizar el estado de pago.'); } confirmPaymentModal.classList.add('hidden'); payingOrderId = null; });

// --> NUEVO: Event listeners para el modal de pizza personalizada
customSizeOptions.addEventListener('click', (e) => {
    if (e.target.matches('.size-button')) {
        customPizzaSize = e.target.dataset.size;
        customSizeOptions.querySelectorAll('.size-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.size === customPizzaSize);
        });
    }
});
customCancelButton.addEventListener('click', () => {
    customPizzaModal.classList.add('hidden');
});
customAddToOrderButton.addEventListener('click', () => {
    const ingredients = customPizzaIngredients.value.trim();
    const price = parseInt(customPizzaPriceInput.value);
    if (!ingredients) { showAlert('Por favor, ingrese los ingredientes de la pizza.'); return; }
    if (isNaN(price) || price <= 0) { showAlert('Por favor, ingrese un precio válido.'); return; }
    const sizePrefix = {xl: 'XL - ',mediana: 'M - ',chica: 'CH - '}[customPizzaSize] || '';
    const itemName = `${sizePrefix}Pizza Personalizada`;
    const finalItem = { orderId: Date.now(), name: itemName, size: customPizzaSize, extras: [], price: price, notes: ingredients };
    addToOrder(finalItem);
    customPizzaModal.classList.add('hidden');
});

// --- FUNCIONES DE RENDERIZADO Y BÚSQUEDA ---
function displayProducts(products) {
  pizzasContainer.innerHTML = '';
  products.pizzas.forEach(pizza => { pizzasContainer.appendChild(createProductCard(pizza, 'pizza')); });
  
  // --> NUEVO: Crear y añadir la tarjeta especial de pizza personalizada
  const customPizzaCard = document.createElement('div');
  customPizzaCard.className = 'bg-white p-3 rounded-lg shadow cursor-pointer hover:shadow-xl transition-shadow text-center border-2 border-dashed border-blue-400 flex items-center justify-center';
  customPizzaCard.innerHTML = `<h3 class="font-bold text-md text-blue-600">+ Pizza Personalizada</h3>`;
  customPizzaCard.addEventListener('click', openCustomPizzaModal);
  pizzasContainer.appendChild(customPizzaCard);

  churrascosContainer.innerHTML = '';
  products.churrascos.forEach(churrasco => { churrascosContainer.appendChild(createProductCard(churrasco, 'churrasco')); });
  otrosContainer.innerHTML = '';
  const otrosAgrupados = groupByCategory(products.otros);
  for (const categoria in otrosAgrupados) {
    const categoriaWrapper = document.createElement('div');
    categoriaWrapper.innerHTML = `<h2 class="text-xl font-bold mt-4 mb-2 text-gray-700">${categoria}</h2>`;
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
    otrosAgrupados[categoria].forEach(item => { grid.appendChild(createProductCard(item, 'otro')); });
    categoriaWrapper.appendChild(grid);
    otrosContainer.appendChild(categoriaWrapper);
  }
}

function createProductCard(item, type) {
  const card = document.createElement('div');
  card.className = 'product-card bg-white p-3 rounded-lg shadow cursor-pointer hover:shadow-xl transition-shadow text-center';
  card.dataset.name = item.nombre.toLowerCase();
  card.innerHTML = `<h3 class="font-bold text-md">${item.nombre}</h3>`;
  if (type === 'pizza') { card.addEventListener('click', () => openPizzaModal(item)); }
  else if (type === 'churrasco') { card.addEventListener('click', () => openNotesModal(item)); }
  else { card.addEventListener('click', () => { const itemData = { orderId: Date.now(), name: item.nombre, price: item.precio, size: null, extras: [], notes: '' }; addToOrder(itemData); }); }
  return card;
}

function groupByCategory(items) { return items.reduce((acc, item) => { const key = item.categoria || 'General'; if (!acc[key]) { acc[key] = []; } acc[key].push(item); return acc; }, {}); }

searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    document.querySelectorAll('.product-card').forEach(card => {
        card.classList.toggle('hidden', !card.dataset.name.includes(searchTerm));
    });
});
searchExtrasInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    document.querySelectorAll('#extras-container label').forEach(label => {
        const extraName = label.textContent.trim().toLowerCase();
        label.classList.toggle('hidden', !extraName.includes(searchTerm));
    });
});

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  window.api.getProducts().then((products) => {
    if (products && Object.keys(products).length > 0) {
      allProducts = products;
      displayProducts(products);
    } else {
      console.error("No se recibieron productos o están vacíos.");
      showAlert("Error: No se pudieron cargar los productos desde la base de datos.");
    }
  }).catch(error => {
    console.error("Error al llamar a getProducts:", error);
    showAlert("Error crítico al cargar productos. Revise la consola.");
  });

  document.getElementById('minimize-btn').addEventListener('click', () => { window.api.minimizeWindow(); });
  document.getElementById('maximize-btn').addEventListener('click', () => { window.api.maximizeWindow(); });
  document.getElementById('close-btn').addEventListener('click', () => { window.api.closeWindow(); });
});