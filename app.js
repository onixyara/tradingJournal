// public/app.js

// -------------------------------------------------------------------
// 🔑 ВАШ КОНФІГ FIREBASE
// -------------------------------------------------------------------
const firebaseConfig = {
      apiKey: "AIzaSyDYJ59iWzzL5lzu9rNHiwF_ZnJBcftDOXA",
      authDomain: "tradingjournal-39e46.firebaseapp.com",
      projectId: "tradingjournal-39e46",
      storageBucket: "tradingjournal-39e46.firebasestorage.app",
      messagingSenderId: "940662527001",
      appId: "1:940662527001:web:ea163caeffed50c156c688",
      measurementId: "G-FZM2NE6N28"
   };
   // -------------------------------------------------------------------
   
   // Ініціалізація Firebase
   firebase.initializeApp(firebaseConfig);
   const db = firebase.firestore();
   const tradesCollection = db.collection('trades');
   
   // --- Глобальний стан ---
   let allTrades = [];
   let chartInstance = null;
   let tradeToCloseId = null;
   let currentFilter = 'all';
   
   // --- DOM Елементи ---
   const form = document.getElementById('add-trade-form');
   const modal = document.getElementById('close-modal');
   const activeTableBody = document.querySelector('#active-trades-table tbody');
   const pastTableBody = document.querySelector('#past-trades-table tbody');
   const filterContainer = document.getElementById('global-filter');
   
   // --- Ініціалізація ---
   document.addEventListener('DOMContentLoaded', () => {
       loadTrades();
   
       form.addEventListener('submit', handleFormSubmit);
       modal.addEventListener('click', handleModalClick);
       filterContainer.addEventListener('click', handleFilterClick);
   
       // НОВЕ: Слухач кліків для редагування таблиць
       document.addEventListener('click', handleTableClick);
   });
   
   // --- Нові функції редагування ---
   
   function handleTableClick(e) {
       // Перевіряємо, чи клікнули ми на комірку з класом 'editable'
       if (e.target && e.target.classList.contains('editable')) {
           makeCellEditable(e.target);
       }
   }
   
   function makeCellEditable(cell) {
       // Запобігаємо подвійному кліку, якщо вже в режимі редагування
       if (cell.querySelector('input')) {
           return;
       }
   
       const currentValue = cell.innerText;
       const id = cell.dataset.id;
       const field = cell.dataset.field; // Поле, яке редагуємо (напр. 'acronym')
       
       // Зберігаємо оригінальний текст про всяк випадок (для 'Escape')
       cell.dataset.originalValue = currentValue;
   
       // Створюємо input
       const input = document.createElement('input');
       input.type = (field === 'entry' || field === 'stopLoss' || field === 'takeProfit') ? 'number' : 'text';
       input.className = 'editable-input';
       input.value = currentValue;
   
       // Обробник 'Enter' або 'Escape'
       input.onkeydown = (e) => {
           if (e.key === 'Enter') {
               saveCellEdit(id, field, input.value, cell);
               e.target.blur(); // Прибираємо фокус
           } else if (e.key === 'Escape') {
               cell.innerHTML = cell.dataset.originalValue; // Повертаємо старе значення
           }
       };
   
       // Обробник 'Blur' (клік вбік)
       input.onblur = () => {
           saveCellEdit(id, field, input.value, cell);
       };
   
       // Замінюємо текст на input
       cell.innerHTML = '';
       cell.appendChild(input);
       input.focus();
   }
   
   async function saveCellEdit(id, field, newValue, cell) {
       // Перевіряємо, чи значення взагалі змінилося
       if (newValue === cell.dataset.originalValue) {
           cell.innerHTML = newValue; // Просто повертаємо текст
           return;
       }
   
       // Готуємо дані для оновлення
       let parsedValue = newValue;
       if (field === 'entry' || field === 'stopLoss' || field === 'takeProfit') {
           parsedValue = parseFloat(newValue);
       }
   
       const updateData = {};
       updateData[field] = parsedValue;
   
       try {
           // 1. Оновлюємо Firebase
           await tradesCollection.doc(id).update(updateData);
   
           // 2. Оновлюємо локальний кеш (allTrades)
           const tradeIndex = allTrades.findIndex(t => t.id === id);
           if (tradeIndex > -1) {
               allTrades[tradeIndex][field] = parsedValue;
           }
   
           // 3. Оновлюємо комірку в таблиці
           cell.innerHTML = parsedValue;
   
           // 4. Оновлюємо P/L, якщо це вплинуло на нього (в майбутньому)
           // ... (зараз не потрібно, але можна додати)
   
           console.log(`Трейд ${id} оновлено, поле ${field} = ${parsedValue}`);
       } catch (err) {
           console.error("Помилка оновлення: ", err);
           cell.innerHTML = cell.dataset.originalValue; // Повертаємо старе у разі помилки
       }
   }
   
   
   // --- Основні обробники ---
   
   async function handleFormSubmit(e) {
       e.preventDefault();
       const newTrade = {
           acronym: document.getElementById('acronym').value.toUpperCase(),
           type: document.getElementById('trade-type').value,
           time: document.getElementById('time').value,
           entry: parseFloat(document.getElementById('entry').value),
           stopLoss: parseFloat(document.getElementById('stopLoss').value),
           takeProfit: parseFloat(document.getElementById('takeProfit').value),
           reason: document.getElementById('reason').value,
           status: 'active',
           percent: null, closeReason: '', closeBetter: ''
       };
       try {
           const docRef = await tradesCollection.add(newTrade);
           newTrade.id = docRef.id;
           allTrades.push(newTrade);
           render();
           form.reset();
       } catch (err) { console.error("Помилка додавання: ", err); }
   }
   
   function handleModalClick(e) {
       const targetId = e.target.id;
       if (targetId === 'cancel-close') {
           modal.style.display = 'none';
       } else if (targetId === 'confirm-close') {
           confirmCloseTrade();
       } else if (targetId === 'close-by-tp') {
           e.target.classList.add('selected-close');
           document.getElementById('close-by-sl').classList.remove('selected-close');
       } else if (targetId === 'close-by-sl') {
           e.target.classList.add('selected-close');
           document.getElementById('close-by-tp').classList.remove('selected-close');
       }
   }
   
   async function confirmCloseTrade() {
       const trade = allTrades.find(t => t.id === tradeToCloseId);
       if (!trade) return;
   
       const closeTypeButton = document.querySelector('button.selected-close');
       if (!closeTypeButton) {
           alert('Будь ласка, оберіть тип закриття (TP або SL)');
           return;
       }
       
       // ... (логіка P/L, така сама як раніше) ...
       const closeType = closeTypeButton.id;
       let percent = 0;
       const entry = trade.entry;
       const isLong = trade.type === 'long';
       
       if (closeType === 'close-by-tp') {
           trade.status = 'closed-tp';
           const tp = trade.takeProfit;
           percent = isLong ? ((tp - entry) / entry) * 100 : ((entry - tp) / entry) * 100;
       } else {
           trade.status = 'closed-sl';
           const sl = trade.stopLoss;
           percent = isLong ? ((sl - entry) / entry) * 100 : ((entry - sl) / entry) * 100;
       }
   
       trade.percent = percent;
       trade.closeReason = document.getElementById('close-reason').value;
       trade.closeBetter = document.getElementById('close-better').value;
   
       try {
           await tradesCollection.doc(trade.id).update({
               status: trade.status,
               percent: trade.percent,
               closeReason: trade.closeReason,
               closeBetter: trade.closeBetter
           });
           render();
           modal.style.display = 'none';
           tradeToCloseId = null;
       } catch (err) { console.error("Помилка оновлення: ", err); }
   }
   
   function handleFilterClick(e) {
       if (e.target.tagName === 'BUTTON') {
           currentFilter = e.target.dataset.filter;
           filterContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
           e.target.classList.add('active');
           render();
       }
   }
   
   // --- Функції API ---
   
   async function loadTrades() {
       try {
           const snapshot = await tradesCollection.get();
           allTrades = [];
           snapshot.forEach(doc => {
               allTrades.push({ id: doc.id, ...doc.data() });
           });
           render();
       } catch (err) { console.error("Помилка завантаження: ", err); }
   }
   
   async function deleteTrade(id) {
       if (!confirm('Ви впевнені?')) return;
       try {
           await tradesCollection.doc(id).delete();
           allTrades = allTrades.filter(trade => trade.id !== id);
           render();
       } catch (err) { console.error("Помилка видалення: ", err); }
   }
   
   // --- Функції Рендерингу (ОНОВЛЕНО) ---
   
   function render() {
       const filteredTrades = getFilteredTrades();
       renderActiveTable(filteredTrades.filter(t => t.status === 'active'));
       renderPastTable(filteredTrades.filter(t => t.status !== 'active'));
       renderChart(filteredTrades);
   }
   
   function getFilteredTrades() {
       // ... (без змін) ...
       const now = new Date();
       const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
       if (currentFilter === 'week') {
           const dayOfWeek = now.getDay();
           const offset = (dayOfWeek === 0) ? 6 : (dayOfWeek - 1);
           const startOfWeek = new Date(today.getTime() - offset * 24 * 60 * 60 * 1000);
           return allTrades.filter(t => new Date(t.time) >= startOfWeek);
       }
       if (currentFilter === 'month') {
           const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
           return allTrades.filter(t => new Date(t.time) >= startOfMonth);
       }
       return allTrades;
   }
   
   function renderActiveTable(trades) {
       activeTableBody.innerHTML = '';
       trades.sort((a, b) => new Date(b.time) - new Date(a.time));
       trades.forEach(trade => {
           const row = document.createElement('tr');
           // ДОДАЄМО 'editable', data-id та data-field до комірок
           row.innerHTML = `
               <td class="editable" data-id="${trade.id}" data-field="acronym">${trade.acronym}</td>
               <td class="trade-${trade.type}">${trade.type.toUpperCase()}</td>
               <td>${new Date(trade.time).toLocaleString()}</td>
               <td class="editable" data-id="${trade.id}" data-field="entry">${trade.entry}</td>
               <td class="editable" data-id="${trade.id}" data-field="stopLoss">${trade.stopLoss}</td>
               <td class="editable" data-id="${trade.id}" data-field="takeProfit">${trade.takeProfit}</td>
               <td class="editable" data-id="${trade.id}" data-field="reason">${trade.reason}</td>
               <td>
                   <button onclick="openCloseModal('${trade.id}')">Закрити</button>
               </td>
           `;
           activeTableBody.appendChild(row);
       });
   }
   
   function renderPastTable(trades) {
       pastTableBody.innerHTML = '';
       trades.sort((a, b) => new Date(b.time) - new Date(a.time));
       trades.forEach(trade => {
           const row = document.createElement('tr');
           const pnlClass = trade.percent > 0 ? 'trade-long' : (trade.percent < 0 ? 'trade-short' : '');
           
           row.innerHTML = `
               <td class="editable" data-id="${trade.id}" data-field="acronym">${trade.acronym}</td>
               <td class="trade-${trade.type}">${trade.type.toUpperCase()}</td>
               <td>${new Date(trade.time).toLocaleString()}</td>
               <td class="editable" data-id="${trade.id}" data-field="entry">${trade.entry}</td>
               <td>${trade.status}</td>
               <td class="${pnlClass}">${trade.percent ? trade.percent.toFixed(2) + '%' : 'N/A'}</td>
               <td class="editable" data-id="${trade.id}" data-field="closeReason">${trade.closeReason}</td>
               <td class="editable" data-id="${trade.id}" data-field="closeBetter">${trade.closeBetter}</td>
               <td>
                   <button class="delete-btn" onclick="deleteTrade('${trade.id}')">Видалити</button>
               </td>
           `;
           pastTableBody.appendChild(row);
       });
   }
   
   function openCloseModal(id) {
       tradeToCloseId = id;
       const trade = allTrades.find(t => t.id === id);
       if (!trade) return;
   
       // Заповнюємо модалку існуючими даними
       document.getElementById('close-reason').value = trade.closeReason || '';
       document.getElementById('close-better').value = trade.closeBetter || '';
       document.getElementById('close-by-sl').classList.remove('selected-close');
       document.getElementById('close-by-tp').classList.remove('selected-close'); 
       modal.style.display = 'flex';
   }
   
   function renderChart(filteredTrades) {
       // ... (без змін) ...
       const closedTrades = filteredTrades.filter(t => t.status !== 'active');
       const successfulTrades = closedTrades.filter(t => t.percent > 0).length;
       const failedTrades = closedTrades.filter(t => t.percent < 0).length;
       const totalProfit = closedTrades.filter(t => t.percent > 0).reduce((sum, t) => sum + t.percent, 0);
       const totalLoss = closedTrades.filter(t => t.percent < 0).reduce((sum, t) => sum + t.percent, 0);
       const ctx = document.getElementById('statsChart').getContext('2d');
       
       if (chartInstance) chartInstance.destroy();
       
       chartInstance = new Chart(ctx, {
           type: 'pie',
           data: {
               labels: ['Прибуткові', 'Збиткові'],
               datasets: [{
                   data: [successfulTrades, failedTrades],
                   backgroundColor: ['rgba(40, 167, 69, 0.7)', 'rgba(220, 53, 69, 0.7)'],
                   borderColor: ['#fff'],
                   borderWidth: 2
               }]
           },
           options: {
               responsive: true,
               plugins: {
                   title: {
                       display: true,
                       text: `Статистика (${currentFilter}) | Всього: ${closedTrades.length} | P/L: ${(totalProfit + totalLoss).toFixed(2)}%`,
                       font: { size: 16 }
                   },
                   legend: { position: 'bottom' }
               }
           }
       });
   }