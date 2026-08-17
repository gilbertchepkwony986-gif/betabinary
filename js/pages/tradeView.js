/* ==========================================================================
   BetaBinary - Trading Terminal View (tradeView.js)
   ========================================================================== */

import { stateManager, MARKETS_DATA } from '../state.js';
import { priceEngine } from '../engine.js';
import { ChartRenderer } from '../chart.js';
import { tradeEngine, calculatePayout } from '../trade.js';
import { autoTradingBot } from '../bot.js';

export function renderTradeView() {
  const container = document.createElement('div');
  container.className = 'trade-container';

  const state = stateManager.getState();
  const currentMarket = MARKETS_DATA.find(m => m.id === state.trading.selectedAssetId) || MARKETS_DATA[0];
  const user = state.user;

  container.innerHTML = `
    <!-- Top Header Bar -->
    <header class="trade-top-header">
      <div class="flex items-center gap-4">
        <a href="#/" class="trade-logo">
          <div class="trade-logo-icon">β</div>
          Beta<span>Binary</span>
        </a>

        <!-- Current Asset Selector Pill -->
        <div class="asset-selector-wrapper">
          <button class="asset-current-btn" id="asset-picker-btn">
            <div class="asset-icon-pill">⚡</div>
            <div class="asset-info-text">
              <span class="asset-info-name" id="hdr-asset-name">${currentMarket.name}</span>
              <span class="asset-info-payout" id="hdr-asset-payout">Payout: up to ${currentMarket.payout}%</span>
            </div>
            <span class="text-xs text-muted" style="margin-left:0.25rem;">▼</span>
          </button>

          <!-- Asset Dropdown Menu (Hidden by default) -->
          <div class="asset-dropdown-menu hidden" id="asset-dropdown-menu">
            <div class="asset-search-box">
              <input type="text" class="input-field text-xs" id="asset-search-input" placeholder="Search markets (e.g. Volatility, EUR, BTC)..." />
            </div>
            <div class="asset-categories-tabs" id="asset-cat-tabs">
              <button class="asset-cat-btn active" data-cat="all">All Markets</button>
              <button class="asset-cat-btn" data-cat="synthetics">Synthetics</button>
              <button class="asset-cat-btn" data-cat="forex">Forex</button>
              <button class="asset-cat-btn" data-cat="crypto">Crypto</button>
              <button class="asset-cat-btn" data-cat="commodities">Commodities</button>
            </div>
            <div class="asset-list-scroll" id="asset-list-container">
              <!-- Populated by JS -->
            </div>
          </div>
        </div>

        <!-- Live Price Indicator in Header -->
        <div class="asset-current-price-badge">
          <span class="text-xs text-muted" id="hdr-asset-symbol">${currentMarket.symbol}</span>
          <span class="text-brand font-bold" id="hdr-live-price">---</span>
        </div>
      </div>

      <!-- Right Header Controls -->
      <div class="trade-user-controls">
        <!-- Account Switcher (Demo / Real) -->
        <div class="relative">
          <div class="account-selector-pill" id="account-switcher-btn">
            <span class="account-type-tag ${user.accountType === 'demo' ? 'account-type-demo' : 'account-type-real'}" id="hdr-account-tag">
              ${user.accountType.toUpperCase()}
            </span>
            <span class="account-balance-val" id="hdr-account-balance">
              $${(user.accountType === 'demo' ? user.demoBalance : user.realBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span class="text-xs text-muted">▼</span>
          </div>

          <!-- Account Dropdown Menu -->
          <div class="account-dropdown-menu hidden" id="account-dropdown-menu">
            <div class="text-xs font-bold text-muted" style="text-transform:uppercase; letter-spacing:0.05em; padding:0.25rem 0.5rem;">Select Account</div>
            
            <div class="account-card-opt ${user.accountType === 'demo' ? 'selected' : ''}" data-acctype="demo">
              <div>
                <div class="font-bold text-sm text-warning">Demo Account</div>
                <div class="text-xs text-muted">Practice trading balance</div>
              </div>
              <div class="text-right">
                <div class="font-mono font-bold text-sm" id="menu-demo-balance">$${user.demoBalance.toFixed(2)}</div>
                <button class="btn btn-ghost btn-sm text-xs text-brand" id="btn-reset-demo" style="padding:0; margin-top:2px;">Reset ($10k)</button>
              </div>
            </div>

            <div class="account-card-opt ${user.accountType === 'real' ? 'selected' : ''}" data-acctype="real">
              <div>
                <div class="font-bold text-sm text-success">Real Account</div>
                <div class="text-xs text-muted">KES ${(user.realBalance * user.exchangeRate).toLocaleString()}</div>
              </div>
              <div class="text-right">
                <div class="font-mono font-bold text-sm text-success" id="menu-real-balance">$${user.realBalance.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Deposit Button -->
        <button class="btn btn-success btn-sm" id="btn-open-deposit">
          <span>+</span> Deposit
        </button>

        <!-- Withdraw Button -->
        <button class="btn btn-secondary btn-sm" id="btn-open-withdraw">
          Withdraw
        </button>

        <!-- Settings Link -->
        <a href="#/settings/profile" class="btn btn-ghost btn-sm" title="Account Settings">
          ⚙️
        </a>

        <!-- Profile Avatar -->
        <div class="user-avatar-circle" style="width:34px; height:34px; font-size:0.8rem; cursor:pointer;" onclick="location.hash='#/settings/profile'">
          KP
        </div>
      </div>
    </header>

    <!-- Main Workspace (Chart on Left, Order Pad on Right) -->
    <div class="trade-main-workspace">
      <!-- Chart Area -->
      <div class="trade-chart-area">
        <!-- Chart Toolbar -->
        <div class="chart-toolbar">
          <div class="chart-tool-group">
            <button class="chart-btn active" data-charttype="area">Area</button>
            <button class="chart-btn" data-charttype="candles">Candles</button>
          </div>

          <div class="chart-tool-group">
            <button class="chart-btn active" data-tf="1">1s</button>
            <button class="chart-btn" data-tf="5">5s</button>
            <button class="chart-btn" data-tf="15">15s</button>
            <button class="chart-btn" data-tf="60">1m</button>
            <button class="chart-btn" data-tf="300">5m</button>
          </div>

          <div class="chart-tool-group">
            <button class="chart-btn active" data-ind="sma">SMA (20)</button>
            <button class="chart-btn" data-ind="bollinger">Bollinger</button>
            <button class="chart-btn" data-ind="rsi">RSI</button>
          </div>
        </div>

        <!-- Canvas Container -->
        <div class="chart-canvas-wrapper">
          <canvas id="trading-canvas"></canvas>

          <!-- Floating Price Overlay -->
          <div class="chart-price-overlay">
            <div class="chart-price-val">
              <span id="overlay-price-main">0.00</span>
              <span class="chart-price-last-digit" id="overlay-last-digit">0</span>
            </div>
            <div class="chart-price-change" id="overlay-price-change">
              <span class="text-success" id="overlay-delta">▲ +0.00%</span>
            </div>
          </div>
        </div>

        <!-- Last Digit Frequency Analyzer Bar -->
        <div class="digit-analyzer-bar">
          <div class="digit-analyzer-title">Last Digit Stats (100 Ticks)</div>
          <div class="digit-bars-grid" id="digit-analyzer-grid">
            <!-- 0 through 9 bars rendered dynamically -->
          </div>
        </div>
      </div>

      <!-- Right Trading Sidebar / Order Pad -->
      <aside class="trade-order-pad">
        <!-- Contract Type Selector -->
        <div class="contract-type-nav">
          <button class="contract-tab-btn ${state.trading.contractType === 'rise_fall' ? 'active' : ''}" data-type="rise_fall">Rise / Fall</button>
          <button class="contract-tab-btn ${state.trading.contractType === 'even_odd' ? 'active' : ''}" data-type="even_odd">Even / Odd</button>
          <button class="contract-tab-btn ${state.trading.contractType === 'over_under' ? 'active' : ''}" data-type="over_under">Over / Under</button>
          <button class="contract-tab-btn ${state.trading.contractType === 'matches_differs' ? 'active' : ''}" data-type="matches_differs">Matches / Differs</button>
        </div>

        <!-- Prediction Digit Selector (For Over/Under and Matches/Differs) -->
        <div class="digit-selector-group ${state.trading.contractType === 'rise_fall' || state.trading.contractType === 'even_odd' ? 'hidden' : ''}" id="digit-pick-container">
          <label class="form-label">
            <span>Prediction Target Digit</span>
            <span class="text-brand mono" id="selected-target-digit-lbl">${state.trading.selectedDigit}</span>
          </label>
          <div class="digit-buttons-row">
            ${[0,1,2,3,4,5,6,7,8,9].map(d => `
              <button class="digit-pick-btn ${state.trading.selectedDigit === d ? 'active' : ''}" data-digit="${d}">${d}</button>
            `).join('')}
          </div>
        </div>

        <!-- Duration Picker -->
        <div>
          <label class="form-label">
            <span>Duration</span>
            <span class="text-secondary mono" id="duration-display-lbl">${state.trading.durationValue} Ticks</span>
          </label>
          <div class="duration-tabs">
            <button class="duration-tab ${state.trading.durationType === 'ticks' ? 'active' : ''}" data-durtype="ticks">Ticks</button>
            <button class="duration-tab ${state.trading.durationType === 'seconds' ? 'active' : ''}" data-durtype="seconds">Seconds</button>
          </div>
          <div class="duration-presets" id="duration-presets-container">
            ${state.trading.durationType === 'ticks' 
              ? [1, 2, 3, 5, 10].map(t => `<button class="duration-preset-btn ${state.trading.durationValue === t ? 'active' : ''}" data-val="${t}">${t} T</button>`).join('')
              : [15, 30, 60, 120, 300].map(s => `<button class="duration-preset-btn ${state.trading.durationValue === s ? 'active' : ''}" data-val="${s}">${s}s</button>`).join('')
            }
          </div>
        </div>

        <!-- Stake Amount Input -->
        <div class="form-group" style="margin-bottom:0.25rem;">
          <label class="form-label">
            <span>Stake Amount (USD)</span>
            <span class="text-xs text-muted">Min $1</span>
          </label>
          <div class="input-wrapper">
            <span class="input-icon-left text-brand font-bold">$</span>
            <input type="number" class="input-field input-with-left-icon mono font-bold" id="stake-input" value="${state.trading.stake}" min="1" step="1" />
          </div>
          <div class="stake-quick-chips">
            <button class="stake-chip" data-add="5">+$5</button>
            <button class="stake-chip" data-add="10">+$10</button>
            <button class="stake-chip" data-add="25">+$25</button>
            <button class="stake-chip" data-add="50">+$50</button>
            <button class="stake-chip" data-add="100">+$100</button>
          </div>
        </div>

        <!-- Payout Calculation Box -->
        <div class="payout-calculation-box">
          <div class="payout-row">
            <span class="text-muted">Return Rate</span>
            <span class="payout-val text-brand" id="calc-return-rate">+95%</span>
          </div>
          <div class="payout-row">
            <span class="text-muted">Net Profit</span>
            <span class="payout-val text-success" id="calc-net-profit">+$9.50</span>
          </div>
          <div class="payout-row" style="border-top:1px solid rgba(255,255,255,0.05); padding-top:0.35rem; margin-top:0.2rem;">
            <span class="font-bold text-sm">Total Potential Payout</span>
            <span class="payout-val payout-total mono" id="calc-total-payout">$19.50</span>
          </div>
        </div>

        <!-- Big Execution Buttons -->
        <div class="trade-action-buttons" id="action-buttons-container">
          <button class="btn-call-action" id="btn-trade-call">
            <div class="action-btn-title">
              <span>▲</span> <span id="call-btn-text">HIGHER</span>
            </div>
            <div class="action-btn-payout" id="call-btn-payout">Payout: $19.50 (+95%)</div>
          </button>

          <button class="btn-put-action" id="btn-trade-put">
            <div class="action-btn-title">
              <span>▼</span> <span id="put-btn-text">LOWER</span>
            </div>
            <div class="action-btn-payout" id="put-btn-payout">Payout: $19.50 (+95%)</div>
          </button>
        </div>
      </aside>
    </div>

    <!-- Bottom Activity / History / Bot Panel -->
    <div class="trade-bottom-activity">
      <div class="activity-tabs-header">
        <button class="activity-tab-btn active" data-acttab="positions">
          Open Positions <span class="activity-count-badge" id="open-positions-count">${state.openPositions.length}</span>
        </button>
        <button class="activity-tab-btn" data-acttab="history">
          Trade History
        </button>
        <button class="activity-tab-btn" data-acttab="bot">
          🤖 Auto-Trading Bot
        </button>
        <button class="activity-tab-btn" data-acttab="transactions">
          Transactions
        </button>
      </div>

      <div class="activity-content-scroll" id="activity-content-container">
        <!-- Populated dynamically based on active tab -->
      </div>
    </div>
  `;

  // Attach interactive controllers after DOM insertion
  setTimeout(() => {
    initTradeViewControllers(container);
  }, 0);

  return container;
}

function initTradeViewControllers(container) {
  const canvas = container.querySelector('#trading-canvas');
  if (!canvas) return;

  const chartRenderer = new ChartRenderer(canvas);
  let activeActivityTab = 'positions';

  // Populate Asset Dropdown List
  const assetListEl = container.querySelector('#asset-list-container');
  function populateAssetList(filterCat = 'all', searchQuery = '') {
    if (!assetListEl) return;
    const currentAssetId = stateManager.getState().trading.selectedAssetId;
    let list = MARKETS_DATA;

    if (filterCat !== 'all') {
      list = list.filter(m => m.category === filterCat);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q) || m.symbol.toLowerCase().includes(q));
    }

    assetListEl.innerHTML = list.map(m => `
      <div class="asset-item-row ${m.id === currentAssetId ? 'active' : ''}" data-assetid="${m.id}">
        <div class="flex items-center gap-2">
          <div class="asset-icon-pill" style="width:24px; height:24px; font-size:0.7rem;">⚡</div>
          <div>
            <div class="font-bold text-xs">${m.name}</div>
            <div class="text-xs text-muted">${m.symbol}</div>
          </div>
        </div>
        <div class="text-right">
          <div class="font-mono text-xs font-bold text-brand" id="asset-item-price-${m.id}">$${m.basePrice.toFixed(m.precision)}</div>
          <span class="badge badge-success">+${m.payout}%</span>
        </div>
      </div>
    `).join('');

    // Bind item click
    assetListEl.querySelectorAll('.asset-item-row').forEach(row => {
      row.addEventListener('click', () => {
        const assetId = row.getAttribute('data-assetid');
        stateManager.setSelectedAsset(assetId);
        container.querySelector('#asset-dropdown-menu').classList.add('hidden');
        updateHeaderAssetDisplay();
      });
    });
  }

  populateAssetList();

  // Search input
  const searchInput = container.querySelector('#asset-search-input');
  searchInput.addEventListener('input', (e) => {
    const activeCat = container.querySelector('.asset-cat-btn.active').getAttribute('data-cat');
    populateAssetList(activeCat, e.target.value);
  });

  // Category buttons
  container.querySelectorAll('.asset-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.asset-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      populateAssetList(btn.getAttribute('data-cat'), searchInput.value);
    });
  });

  // Toggle Asset Dropdown
  const assetPickerBtn = container.querySelector('#asset-picker-btn');
  const assetDropdown = container.querySelector('#asset-dropdown-menu');
  assetPickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    assetDropdown.classList.toggle('hidden');
  });

  // Account Switcher Dropdown
  const acctSwitcherBtn = container.querySelector('#account-switcher-btn');
  const acctDropdown = container.querySelector('#account-dropdown-menu');
  acctSwitcherBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    acctDropdown.classList.toggle('hidden');
  });

  acctDropdown.querySelectorAll('.account-card-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      const type = opt.getAttribute('data-acctype');
      stateManager.switchAccount(type);
      acctDropdown.classList.add('hidden');
    });
  });

  // Reset Demo Balance button
  const resetDemoBtn = container.querySelector('#btn-reset-demo');
  if (resetDemoBtn) {
    resetDemoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      stateManager.resetDemoBalance();
      window.dispatchEvent(new CustomEvent('betabinary_toast', {
        detail: { type: 'success', message: 'Demo Account Balance reset to $10,000.00' }
      }));
    });
  }

  // Close dropdowns on outside click
  document.addEventListener('click', () => {
    assetDropdown.classList.add('hidden');
    acctDropdown.classList.add('hidden');
  });

  // Open Deposit & Withdraw Modals
  container.querySelector('#btn-open-deposit').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('betabinary_open_modal', { detail: { modal: 'deposit' } }));
  });
  container.querySelector('#btn-open-withdraw').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('betabinary_open_modal', { detail: { modal: 'withdraw' } }));
  });

  // Chart Toolbars
  container.querySelectorAll('.chart-btn[data-charttype]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.chart-btn[data-charttype]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chartRenderer.setChartType(btn.getAttribute('data-charttype'));
    });
  });

  container.querySelectorAll('.chart-btn[data-tf]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.chart-btn[data-tf]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chartRenderer.setTimeframe(Number(btn.getAttribute('data-tf')));
    });
  });

  container.querySelectorAll('.chart-btn[data-ind]').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      chartRenderer.toggleIndicator(btn.getAttribute('data-ind'));
    });
  });

  // Contract Type Switching
  container.querySelectorAll('.contract-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.contract-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.getAttribute('data-type');
      stateManager.setContractType(type);
      updateContractUI(type);
      updatePayoutCalculations();
    });
  });

  // Digit selection for Over/Under and Matches/Differs
  container.querySelectorAll('.digit-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.digit-pick-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const d = Number(btn.getAttribute('data-digit'));
      stateManager.update(s => { s.trading.selectedDigit = d; });
      container.querySelector('#selected-target-digit-lbl').textContent = d;
      updatePayoutCalculations();
    });
  });

  // Duration Type (Ticks vs Seconds)
  container.querySelectorAll('.duration-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.duration-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const durType = tab.getAttribute('data-durtype');
      const defaultVal = durType === 'ticks' ? 5 : 30;
      stateManager.setDuration(durType, defaultVal);
      renderDurationPresets(durType);
    });
  });

  function renderDurationPresets(durType) {
    const presetsEl = container.querySelector('#duration-presets-container');
    const values = durType === 'ticks' ? [1, 2, 3, 5, 10] : [15, 30, 60, 120, 300];
    const unit = durType === 'ticks' ? 'T' : 's';
    const state = stateManager.getState();

    presetsEl.innerHTML = values.map(v => `
      <button class="duration-preset-btn ${state.trading.durationValue === v ? 'active' : ''}" data-val="${v}">
        ${v}${unit}
      </button>
    `).join('');

    presetsEl.querySelectorAll('.duration-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        presetsEl.querySelectorAll('.duration-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const val = Number(btn.getAttribute('data-val'));
        stateManager.setDuration(durType, val);
        container.querySelector('#duration-display-lbl').textContent = `${val} ${durType === 'ticks' ? 'Ticks' : 'Seconds'}`;
      });
    });
  }

  // Stake Input & Quick Chips
  const stakeInput = container.querySelector('#stake-input');
  stakeInput.addEventListener('input', (e) => {
    stateManager.setStake(e.target.value);
    updatePayoutCalculations();
  });

  container.querySelectorAll('.stake-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const add = Number(chip.getAttribute('data-add'));
      const cur = Number(stakeInput.value) || 0;
      stakeInput.value = cur + add;
      stateManager.setStake(stakeInput.value);
      updatePayoutCalculations();
    });
  });

  // Action Buttons Trade Placement
  const btnCall = container.querySelector('#btn-trade-call');
  const btnPut = container.querySelector('#btn-trade-put');

  btnCall.addEventListener('click', () => {
    const type = stateManager.getState().trading.contractType;
    let pred = 'higher';
    if (type === 'even_odd') pred = 'even';
    else if (type === 'over_under') pred = 'over';
    else if (type === 'matches_differs') pred = 'matches';
    tradeEngine.placeTrade(pred);
  });

  btnPut.addEventListener('click', () => {
    const type = stateManager.getState().trading.contractType;
    let pred = 'lower';
    if (type === 'even_odd') pred = 'odd';
    else if (type === 'over_under') pred = 'under';
    else if (type === 'matches_differs') pred = 'differs';
    tradeEngine.placeTrade(pred);
  });

  // Activity Tabs Switching
  container.querySelectorAll('.activity-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.activity-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeActivityTab = btn.getAttribute('data-acttab');
      renderActivityContent();
    });
  });

  function updateContractUI(type) {
    const digitPickContainer = container.querySelector('#digit-pick-container');
    const callBtnText = container.querySelector('#call-btn-text');
    const putBtnText = container.querySelector('#put-btn-text');

    if (type === 'rise_fall') {
      digitPickContainer.classList.add('hidden');
      callBtnText.textContent = 'HIGHER';
      putBtnText.textContent = 'LOWER';
    } else if (type === 'even_odd') {
      digitPickContainer.classList.add('hidden');
      callBtnText.textContent = 'EVEN';
      putBtnText.textContent = 'ODD';
    } else if (type === 'over_under') {
      digitPickContainer.classList.remove('hidden');
      callBtnText.textContent = 'OVER';
      putBtnText.textContent = 'UNDER';
    } else if (type === 'matches_differs') {
      digitPickContainer.classList.remove('hidden');
      callBtnText.textContent = 'MATCHES';
      putBtnText.textContent = 'DIFFERS';
    }
  }

  function updatePayoutCalculations() {
    const state = stateManager.getState();
    const market = MARKETS_DATA.find(m => m.id === state.trading.selectedAssetId) || MARKETS_DATA[0];
    const calcCall = calculatePayout(state.trading.contractType, 'higher', state.trading.selectedDigit, state.trading.stake, market.payout);

    container.querySelector('#calc-return-rate').textContent = `+${calcCall.returnPct}%`;
    container.querySelector('#calc-net-profit').textContent = `+$${calcCall.profit.toFixed(2)}`;
    container.querySelector('#calc-total-payout').textContent = `$${calcCall.payout.toFixed(2)}`;

    container.querySelector('#call-btn-payout').textContent = `Payout: $${calcCall.payout.toFixed(2)} (+${calcCall.returnPct}%)`;
    
    const calcPut = calculatePayout(state.trading.contractType, 'lower', state.trading.selectedDigit, state.trading.stake, market.payout);
    container.querySelector('#put-btn-payout').textContent = `Payout: $${calcPut.payout.toFixed(2)} (+${calcPut.returnPct}%)`;
  }

  function updateHeaderAssetDisplay() {
    const state = stateManager.getState();
    const market = MARKETS_DATA.find(m => m.id === state.trading.selectedAssetId) || MARKETS_DATA[0];
    container.querySelector('#hdr-asset-name').textContent = market.name;
    container.querySelector('#hdr-asset-symbol').textContent = market.symbol;
    container.querySelector('#hdr-asset-payout').textContent = `Payout: up to ${market.payout}%`;
    updatePayoutCalculations();
  }

  function renderDigitAnalyzer(assetId) {
    const grid = container.querySelector('#digit-analyzer-grid');
    if (!grid) return;
    const stats = priceEngine.getDigitStats(assetId, 100);

    grid.innerHTML = stats.map(s => `
      <div class="digit-bar-item">
        <div class="digit-bar-fill-track">
          <div class="digit-bar-fill ${s.isHot ? 'hot' : (s.isCold ? 'cold' : '')}" style="height: ${Math.max(10, s.percentage * 2)}%;"></div>
        </div>
        <span class="digit-bar-num">${s.digit}</span>
        <span class="digit-bar-pct">${s.percentage}%</span>
      </div>
    `).join('');
  }

  function renderActivityContent() {
    const target = container.querySelector('#activity-content-container');
    if (!target) return;
    const state = stateManager.getState();

    if (activeActivityTab === 'positions') {
      const positions = state.openPositions;
      if (positions.length === 0) {
        target.innerHTML = `<div class="text-center text-muted" style="padding:2rem 0;">No active open contracts. Select parameters and execute a trade above.</div>`;
        return;
      }

      target.innerHTML = `
        <div class="positions-grid">
          ${positions.map(p => {
            const isWinning = p.prediction === 'higher' ? (p.currentPrice > p.entryPrice) : (p.currentPrice < p.entryPrice);
            return `
              <div class="position-card ${isWinning ? 'winning' : 'losing'}">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-bold text-primary">${p.assetName}</span>
                  <span class="badge ${isWinning ? 'badge-success' : 'badge-danger'}">${p.prediction.toUpperCase()}</span>
                </div>
                <div class="flex items-center justify-between font-mono text-xs">
                  <span class="text-muted">Entry: ${p.entryPrice.toFixed(2)}</span>
                  <span class="font-bold ${isWinning ? 'text-success' : 'text-danger'}">Current: ${p.currentPrice.toFixed(2)}</span>
                </div>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-muted">Stake: $${p.stake}</span>
                  <span class="font-bold font-mono text-success">Payout: $${p.potentialPayout.toFixed(2)}</span>
                </div>
                <div class="position-progress-bar" style="width: ${p.durationType === 'ticks' ? ((p.durationValue - p.ticksRemaining) / p.durationValue) * 100 : 50}%;"></div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else if (activeActivityTab === 'history') {
      const history = state.tradeHistory;
      if (history.length === 0) {
        target.innerHTML = `<div class="text-center text-muted" style="padding:2rem 0;">No settled trades recorded yet.</div>`;
        return;
      }

      target.innerHTML = `
        <table class="trade-history-table">
          <thead>
            <tr>
              <th>Contract ID</th>
              <th>Asset</th>
              <th>Type</th>
              <th>Entry Price</th>
              <th>Exit Price</th>
              <th>Stake</th>
              <th>Profit / Loss</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${history.map(h => `
              <tr>
                <td class="text-muted">${h.id}</td>
                <td class="font-semibold text-primary">${h.assetName}</td>
                <td>${h.prediction.toUpperCase()}</td>
                <td>${h.entryPrice.toFixed(2)}</td>
                <td>${h.exitPrice.toFixed(2)}</td>
                <td>$${h.stake.toFixed(2)}</td>
                <td class="font-bold ${h.profit >= 0 ? 'text-success' : 'text-danger'}">${h.profit >= 0 ? '+' : ''}$${h.profit.toFixed(2)}</td>
                <td>
                  <span class="badge ${h.status === 'won' ? 'badge-success' : 'badge-danger'}">${h.status.toUpperCase()}</span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (activeActivityTab === 'bot') {
      const bot = state.bot;
      target.innerHTML = `
        <div class="bot-panel-wrapper">
          <div class="bot-stat-card">
            <div class="bot-stat-label">Bot Strategy</div>
            <div class="flex gap-2" style="margin-top:0.25rem;">
              <select class="input-field text-xs" id="bot-strategy-select" ${bot.isRunning ? 'disabled' : ''}>
                <option value="martingale" ${bot.strategy === 'martingale' ? 'selected' : ''}>Martingale (2x on loss)</option>
                <option value="dalembert" ${bot.strategy === 'dalembert' ? 'selected' : ''}>D'Alembert (+Step on loss)</option>
                <option value="scalper" ${bot.strategy === 'scalper' ? 'selected' : ''}>AI Momentum Scalper</option>
              </select>
            </div>
            <div class="flex gap-2" style="margin-top:0.5rem;">
              <button class="btn ${bot.isRunning ? 'btn-danger' : 'btn-success'} btn-sm w-full" id="btn-toggle-bot">
                ${bot.isRunning ? '⏹ Stop Bot' : '▶ Launch Auto Bot'}
              </button>
            </div>
          </div>

          <div class="bot-stat-card">
            <div class="bot-stat-label">Session Target & Guard</div>
            <div class="grid" style="grid-template-columns:1fr 1fr; gap:0.5rem; margin-top:0.25rem;">
              <div>
                <span class="text-xs text-muted">Target Profit</span>
                <input type="number" class="input-field text-xs mono" id="bot-target-profit" value="${bot.targetProfit}" ${bot.isRunning ? 'disabled' : ''} />
              </div>
              <div>
                <span class="text-xs text-muted">Stop Loss</span>
                <input type="number" class="input-field text-xs mono" id="bot-stop-loss" value="${bot.stopLoss}" ${bot.isRunning ? 'disabled' : ''} />
              </div>
            </div>
          </div>

          <div class="grid" style="grid-template-columns:repeat(4, 1fr); gap:0.5rem;">
            <div class="bot-stat-card text-center">
              <div class="bot-stat-label">Runs</div>
              <div class="bot-stat-value text-primary">${bot.totalRuns}</div>
            </div>
            <div class="bot-stat-card text-center">
              <div class="bot-stat-label">Wins / Loss</div>
              <div class="bot-stat-value text-brand">${bot.wins} / ${bot.losses}</div>
            </div>
            <div class="bot-stat-card text-center">
              <div class="bot-stat-label">Win Rate</div>
              <div class="bot-stat-value text-warning">${bot.totalRuns > 0 ? Math.round((bot.wins / bot.totalRuns) * 100) : 0}%</div>
            </div>
            <div class="bot-stat-card text-center">
              <div class="bot-stat-label">Net Profit</div>
              <div class="bot-stat-value ${bot.netProfit >= 0 ? 'text-success' : 'text-danger'}">${bot.netProfit >= 0 ? '+' : ''}$${bot.netProfit.toFixed(2)}</div>
            </div>
          </div>
        </div>
      `;

      const toggleBotBtn = target.querySelector('#btn-toggle-bot');
      if (toggleBotBtn) {
        toggleBotBtn.addEventListener('click', () => {
          if (bot.isRunning) {
            autoTradingBot.stopBot();
          } else {
            const strat = target.querySelector('#bot-strategy-select').value;
            const targetProfit = Number(target.querySelector('#bot-target-profit').value) || 50;
            const stopLoss = Number(target.querySelector('#bot-stop-loss').value) || 100;
            stateManager.update(s => {
              s.bot.strategy = strat;
              s.bot.targetProfit = targetProfit;
              s.bot.stopLoss = stopLoss;
            });
            autoTradingBot.startBot();
          }
          renderActivityContent();
        });
      }
    } else if (activeActivityTab === 'transactions') {
      const txns = state.transactions;
      target.innerHTML = `
        <table class="trade-history-table">
          <thead>
            <tr>
              <th>TXID</th>
              <th>Type</th>
              <th>Method</th>
              <th>Amount</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${txns.map(t => `
              <tr>
                <td class="text-muted">${t.id}</td>
                <td class="font-bold uppercase ${t.type === 'deposit' ? 'text-success' : 'text-warning'}">${t.type}</td>
                <td>${t.method}</td>
                <td class="font-mono font-bold">$${t.amount.toFixed(2)}</td>
                <td class="text-muted">${new Date(t.date).toLocaleDateString()} ${new Date(t.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td><span class="badge ${t.status === 'completed' ? 'badge-success' : 'badge-warning'}">${t.status.toUpperCase()}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  }

  // Reactive updates on State changes
  stateManager.subscribe((st) => {
    const openCountBadge = container.querySelector('#open-positions-count');
    if (openCountBadge) openCountBadge.textContent = st.openPositions.length;

    const hdrTag = container.querySelector('#hdr-account-tag');
    if (hdrTag) {
      hdrTag.className = `account-type-tag ${st.user.accountType === 'demo' ? 'account-type-demo' : 'account-type-real'}`;
      hdrTag.textContent = st.user.accountType.toUpperCase();
    }

    const hdrBal = container.querySelector('#hdr-account-balance');
    if (hdrBal) {
      hdrBal.textContent = `$${(st.user.accountType === 'demo' ? st.user.demoBalance : st.user.realBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    const menuDemoBal = container.querySelector('#menu-demo-balance');
    if (menuDemoBal) menuDemoBal.textContent = `$${st.user.demoBalance.toFixed(2)}`;

    const menuRealBal = container.querySelector('#menu-real-balance');
    if (menuRealBal) menuRealBal.textContent = `$${st.user.realBalance.toFixed(2)}`;

    renderActivityContent();
  });

  // Render on price ticks
  priceEngine.subscribe((updates) => {
    const currentAssetId = stateManager.getState().trading.selectedAssetId;
    const latest = priceEngine.getLatestPrice(currentAssetId);

    // Update overlay prices
    const overlayMain = container.querySelector('#overlay-price-main');
    const overlayLast = container.querySelector('#overlay-last-digit');
    const hdrLive = container.querySelector('#hdr-live-price');

    if (overlayMain && latest) {
      const precision = (MARKETS_DATA.find(m => m.id === currentAssetId) || {}).precision || 2;
      const str = latest.price.toFixed(precision);
      overlayMain.textContent = str.slice(0, -1);
      overlayLast.textContent = str.slice(-1);
      hdrLive.textContent = `$${str}`;
    }

    // Update individual asset item prices in dropdown
    for (const u of updates) {
      const itemEl = container.querySelector(`#asset-item-price-${u.assetId}`);
      if (itemEl) {
        itemEl.textContent = `$${u.price.toFixed(2)}`;
      }
    }

    // Re-render chart and digit bars
    chartRenderer.render(currentAssetId, stateManager.getState().openPositions);
    renderDigitAnalyzer(currentAssetId);
  });

  // Initial draw
  updatePayoutCalculations();
  renderActivityContent();
  renderDigitAnalyzer(state.trading.selectedAssetId);
}
