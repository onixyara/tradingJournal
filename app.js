// public/app.js

// -------------------------------------------------------------------
// 🔑 ВАШ КОНФІГ FIREBASE (ЯКИЙ ВИ НАДАЛИ)
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
   const db = firebase.firestore(); // Наш доступ до бази даних
   const tradesCollection = db.collection('trades'); // Наша "таблиця"
   
   // --- Глобальний стан ---
   let allTrades = []; // Як і раніше, кеш усіх трейдів
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
       loadTrades(); // Завантажуємо дані з Firebase
   
       // 1. Обробник форми додавання
       form.addEventListener('submit', async (e) => {
           e.preventDefault();
           
           const newTrade = {
               // id: Date.now().toString(), // Firebase згенерує ID автоматично
               acronym: document.getElementById('acronym').value.toUpperCase(),
               type: document.getElementById('trade-type').value,
               time: document.getElementById('time').value,
               entry: parseFloat(document.getElementById('entry').value),
               stopLoss: parseFloat(document.getElementById('stopLoss').value),
               takeProfit: parseFloat(document.getElementById('takeProfit').value),
               reason: document.getElementById('reason').value,
               status: 'active',
               percent: null,
               closeReason: '',
               closeBetter: ''
           };
   
           try {
               // Зберігаємо в Firebase
               const docRef = await tradesCollection.add(newTrade);
               newTrade.id = docRef.id; // Додаємо ID, згенерований Firebase
               allTrades.push(newTrade); // Додаємо в локальний кеш
               render();
               form.reset();
           } catch (err) {
               console.error("Помилка додавання трейду: ", err);
           }
       });
   
       // 3. Обробники модального вікна
       document.getElementById('cancel-close').addEventListener('click', () => modal.style.display = 'none');
       
       document.getElementById('confirm-close').addEventListener('click', async () => {
           const trade = allTrades.find(t => t.id === tradeToCloseId);
           if (!trade) return;
   
           const closeTypeButton = document.querySelector('button.selected-close');
           if (!closeTypeButton) {
               alert('Будь ласка, оберіть тип закриття (TP або SL)');
               return;
           }
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
               // Оновлюємо запис в Firebase
               await tradesCollection.doc(trade.id).update({
                   status: trade.status,
                   percent: trade.percent,
                   closeReason: trade.closeReason,
                   closeBetter: trade.closeBetter
               });
               render();
               modal.style.display = 'none';
               tradeToCloseId = null;
           } catch (err) {
               console.error("Помилка оновлення трейду: ", err);
           }
       });
   
       document.getElementById('close-by-tp').addEventListener('click', (e) => {
           e.target.classList.add('selected-close');
           document.getElementById('close-by-sl').classList.remove('selected-close');
       });
       document.getElementById('close-by-sl').addEventListener('click', (e) => {
           e.target.classList.add('selected-close');
           document.getElementById('close-by-tp').classList.remove('selected-close');
       });
       filterContainer.addEventListener('click', (e) => {
           if (e.target.tagName === 'BUTTON') {
               currentFilter = e.target.dataset.filter;
               filterContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
               e.target.classList.add('active');
               render();
           }
       });
   });
   
   // --- Функції API (ПЕРЕПИСАНІ) ---
   
   async function loadTrades() {
       try {
           const snapshot = await tradesCollection.get();
           allTrades = []; // Очищуємо кеш
           snapshot.forEach(doc => {
               allTrades.push({ id: doc.id, ...doc.data() });
           });
           render();
       } catch (err) {
           console.error("Помилка завантаження трейдів:", err);
       }
   }
   
   async function deleteTrade(id) {
       if (!confirm('Ви впевнені, що хочете видалити цей запис?')) return;
       
       try {
           // Видаляємо з Firebase
           await tradesCollection.doc(id).delete();
           // Видаляємо з локального кешу
           allTrades = allTrades.filter(trade => trade.id !== id);
           render();
       } catch (err) {
           console.error("Помилка видалення трейду: ", err);
       }
   }
   
   // --- Функції Рендерингу (БЕЗ ЗМІН) ---
   
   function render() {
       const filteredTrades = getFilteredTrades();
       renderActiveTable(filteredTrades.filter(t => t.status === 'active'));
       renderPastTable(filteredTrades.filter(t => t.status !== 'active'));
       renderChart(filteredTrades);
   }
   
   function getFilteredTrades() {
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
       
       return allTrades; // 'all'
   }
   
   function renderActiveTable(trades) {
       activeTableBody.innerHTML = '';
       trades.sort((a, b) => new Date(b.time) - new Date(a.time));
       trades.forEach(trade => {
           const row = document.createElement('tr');
           row.innerHTML = `
               <td>${trade.acronym}</td>
               <td class="trade-${trade.type}">${trade.type.toUpperCase()}</td>
               <td>${new Date(trade.time).toLocaleString()}</td>
               <td>${trade.entry}</td>
               <td>${trade.stopLoss}</td>
               <td>${trade.takeProfit}</td>
               <td>${trade.reason}</td>
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
               <td>${trade.acronym}</td>
               <td class="trade-${trade.type}">${trade.type.toUpperCase()}</td>
               <td>${new Date(trade.time).toLocaleString()}</td>
               <td>${trade.entry}</td>
               <td>${trade.status}</td>
               <td class="${pnlClass}">${trade.percent ? trade.percent.toFixed(2) + '%' : 'N/A'}</td>
               <td>${trade.closeReason}</td>
               <td>${trade.closeBetter}</td>
               <td>
                   <button class="delete-btn" onclick="deleteTrade('${trade.id}')">Видалити</button>
               </td>
           `;
           pastTableBody.appendChild(row);
       });
   }
   
   function openCloseModal(id) {
       tradeToCloseId = id;
       document.getElementById('close-reason').value = '';
       document.getElementById('close-better').value = '';
       document.getElementById('close-by-sl').classList.remove('selected-close');
       document.getElementById('close-by-tp').classList.remove('selected-close'); 
       modal.style.display = 'flex';
   }
   
   function renderChart(filteredTrades) {
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
                   legend: {
                       position: 'bottom'
                   }
               }
           }
       });
   }