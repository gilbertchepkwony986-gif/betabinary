/* ==========================================================================
   BetaBinary - Master Application Controller & Router (app.js)
   ========================================================================== */

import { stateManager } from './state.js';
import { priceEngine } from './engine.js';
import { paymentsManager } from './payments.js';
import { liveChat } from './chat.js';

// Page Views
import { renderLandingView } from './pages/landing.js';
import { renderTradeView } from './pages/tradeView.js';
import { renderSettingsView } from './pages/settingsView.js';
import { renderAuthView } from './pages/authView.js';
import { renderLeaderboardView } from './pages/leaderboard.js';
import { renderAffiliateView } from './pages/affiliate.js';

class BetaBinaryApp {
  constructor() {
    this.appRoot = document.getElementById('app');
    this.initRouter();
    this.initGlobalListeners();
    this.initModals();
    this.initLiveChat();
    priceEngine.start();
  }

  initRouter() {
    window.addEventListener('hashchange', () => this.handleRoute());
    // Initial route
    this.handleRoute();
  }

  handleRoute() {
    const hash = window.location.hash || '#/';
    this.appRoot.innerHTML = '';

    if (hash === '#/' || hash === '#' || hash === '') {
      this.appRoot.appendChild(renderLandingView());
    } else if (hash.startsWith('#/trade')) {
      this.appRoot.appendChild(renderTradeView());
    } else if (hash.startsWith('#/settings')) {
      const sub = hash.replace('#/settings/', '').replace('#/settings', '') || 'profile';
      this.appRoot.appendChild(renderSettingsView(sub));
    } else if (hash.startsWith('#/login')) {
      this.appRoot.appendChild(renderAuthView('login'));
    } else if (hash.startsWith('#/register')) {
      this.appRoot.appendChild(renderAuthView('register'));
    } else if (hash.startsWith('#/leaderboard')) {
      this.appRoot.appendChild(renderLeaderboardView());
    } else if (hash === '#/affiliate') {
      this.appRoot.appendChild(renderAffiliateView());
    } else {
      this.appRoot.appendChild(renderTradeView());
    }

    window.scrollTo(0, 0);
  }

  initGlobalListeners() {
    // Toast Notification Listener
    window.addEventListener('betabinary_toast', (e) => {
      const { type, message } = e.detail;
      this.showToast(message, type);
    });

    // Open Modal Event Listener
    window.addEventListener('betabinary_open_modal', (e) => {
      const { modal } = e.detail;
      this.openModal(modal);
    });
  }

  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'danger') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `
      <span>${icon}</span>
      <div style="flex:1; font-size:0.88rem; font-weight:500;">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      setTimeout(() => toast.remove(), 300);
    }, 3800);
  }

  openModal(name) {
    const modalEl = document.getElementById(`${name}-modal`);
    if (modalEl) {
      modalEl.classList.remove('hidden');
    }
  }

  closeModal(name) {
    const modalEl = document.getElementById(`${name}-modal`);
    if (modalEl) {
      modalEl.classList.add('hidden');
    }
  }

  initModals() {
    // Deposit Modal Setup
    const depositModal = document.getElementById('deposit-modal');
    if (depositModal) {
      let selectedMethod = 'mpesa';
      let selectedDepositAmount = 25;

      const methodCards = depositModal.querySelectorAll('.payment-method-card');
      const forms = {
        mpesa: depositModal.querySelector('#deposit-mpesa-form'),
        card: depositModal.querySelector('#deposit-card-form'),
        trc20: depositModal.querySelector('#deposit-trc20-form')
      };

      methodCards.forEach(card => {
        card.addEventListener('click', () => {
          methodCards.forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          selectedMethod = card.getAttribute('data-method');

          // Toggle sub-forms
          Object.keys(forms).forEach(k => {
            if (forms[k]) {
              if (k === selectedMethod) forms[k].classList.remove('hidden');
              else forms[k].classList.add('hidden');
            }
          });
        });
      });

      // Amount preset chips
      const amountChips = depositModal.querySelectorAll('.amount-chip');
      const depositInput = depositModal.querySelector('#deposit-amount-input');
      const kesDisplay = depositModal.querySelector('#deposit-kes-display');
      const user = stateManager.getState().user;

      function updateKesDisplay() {
        const amt = Number(depositInput.value) || 0;
        const kes = Math.round(amt * user.exchangeRate);
        if (kesDisplay) {
          kesDisplay.textContent = `≈ KES ${kes.toLocaleString()} (Rate: 1 USD = ${user.exchangeRate} KES)`;
        }
      }

      amountChips.forEach(chip => {
        chip.addEventListener('click', () => {
          amountChips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          const val = Number(chip.getAttribute('data-val'));
          selectedDepositAmount = val;
          if (depositInput) {
            depositInput.value = val;
            updateKesDisplay();
          }
        });
      });

      if (depositInput) {
        depositInput.addEventListener('input', updateKesDisplay);
        updateKesDisplay();
      }

      // Close button
      depositModal.querySelectorAll('.modal-close-btn, .btn-cancel-modal').forEach(btn => {
        btn.addEventListener('click', () => this.closeModal('deposit'));
      });

      // Submit M-Pesa STK Push
      const mpesaSubmitBtn = depositModal.querySelector('#btn-submit-mpesa-deposit');
      const mpesaProgressArea = depositModal.querySelector('#mpesa-progress-container');
      const mpesaPhoneInput = depositModal.querySelector('#deposit-phone-input');

      if (mpesaSubmitBtn) {
        mpesaSubmitBtn.addEventListener('click', () => {
          const phone = mpesaPhoneInput.value;
          const amt = Number(depositInput.value);

          mpesaSubmitBtn.disabled = true;
          mpesaProgressArea.classList.remove('hidden');

          paymentsManager.processMpesaDeposit(
            phone,
            amt,
            (progress) => {
              if (progress.step === 1) {
                mpesaProgressArea.innerHTML = `
                  <div class="stk-push-prompt">
                    <div class="animate-spin" style="width:28px; height:28px; border:3px solid #10b981; border-top-color:transparent; border-radius:50%;"></div>
                    <div class="font-bold text-sm text-success">${progress.text}</div>
                  </div>
                `;
              } else if (progress.step === 2) {
                mpesaProgressArea.innerHTML = `
                  <div class="stk-push-prompt">
                    <div class="stk-phone-mock">
                      <div style="font-size:0.75rem; color:#10b981; font-weight:bold;">M-PESA EXPRESS</div>
                      <div style="font-size:0.72rem; color:#fff;">Pay BetaBinary USD $${amt} (KES ${progress.kes.toLocaleString()})</div>
                      <div style="font-size:0.7rem; color:#94a3b8;">Enter M-Pesa PIN:</div>
                      <div class="stk-pin-dots">● ● ● ●</div>
                    </div>
                    <div class="text-xs text-secondary font-medium">Please enter your 4-digit PIN on phone to complete.</div>
                  </div>
                `;
              } else if (progress.step === 3) {
                mpesaProgressArea.innerHTML = `
                  <div class="stk-push-prompt" style="background:#064e3b;">
                    <div style="font-size:2rem;">✅</div>
                    <div class="font-bold text-success">${progress.text}</div>
                  </div>
                `;
              }
            },
            () => {
              setTimeout(() => {
                mpesaProgressArea.classList.add('hidden');
                mpesaSubmitBtn.disabled = false;
                this.closeModal('deposit');
              }, 1200);
            },
            (err) => {
              alert(err);
              mpesaProgressArea.classList.add('hidden');
              mpesaSubmitBtn.disabled = false;
            }
          );
        });
      }

      // Submit Card Deposit
      const cardSubmitBtn = depositModal.querySelector('#btn-submit-card-deposit');
      if (cardSubmitBtn) {
        cardSubmitBtn.addEventListener('click', () => {
          const amt = Number(depositInput.value);
          cardSubmitBtn.disabled = true;
          paymentsManager.processCardDeposit({}, amt, () => {
            cardSubmitBtn.disabled = false;
            this.closeModal('deposit');
          }, (err) => {
            alert(err);
            cardSubmitBtn.disabled = false;
          });
        });
      }

      // Submit USDT Crypto
      const usdtSubmitBtn = depositModal.querySelector('#btn-submit-usdt-deposit');
      if (usdtSubmitBtn) {
        usdtSubmitBtn.addEventListener('click', () => {
          const amt = Number(depositInput.value);
          usdtSubmitBtn.disabled = true;
          paymentsManager.processCryptoDeposit('txid_simulated', amt, () => {
            usdtSubmitBtn.disabled = false;
            this.closeModal('deposit');
          });
        });
      }
    }

    // Withdraw Modal Setup
    const withdrawModal = document.getElementById('withdraw-modal');
    if (withdrawModal) {
      withdrawModal.querySelectorAll('.modal-close-btn, .btn-cancel-modal').forEach(btn => {
        btn.addEventListener('click', () => this.closeModal('withdraw'));
      });

      const submitWithdrawBtn = withdrawModal.querySelector('#btn-submit-withdraw');
      if (submitWithdrawBtn) {
        submitWithdrawBtn.addEventListener('click', () => {
          const method = withdrawModal.querySelector('#withdraw-method-select').value;
          const dest = withdrawModal.querySelector('#withdraw-dest-input').value;
          const amt = withdrawModal.querySelector('#withdraw-amount-input').value;

          paymentsManager.processWithdrawal(method, dest, amt, () => {
            this.closeModal('withdraw');
          }, (err) => {
            alert(err);
          });
        });
      }
    }
  }

  initLiveChat() {
    const toggleBtn = document.getElementById('live-chat-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => liveChat.toggle());
    }

    const closeBtn = document.getElementById('close-chat-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => liveChat.toggle());
    }

    const sendBtn = document.getElementById('chat-send-btn');
    const inputField = document.getElementById('chat-text-input');

    if (sendBtn && inputField) {
      sendBtn.addEventListener('click', () => {
        liveChat.sendMessage(inputField.value);
        inputField.value = '';
      });

      inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          liveChat.sendMessage(inputField.value);
          inputField.value = '';
        }
      });
    }

    // Quick question chips in chat
    document.querySelectorAll('.chat-quick-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const txt = chip.textContent;
        liveChat.sendMessage(txt);
      });
    });
  }
}

// Bootstrap when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new BetaBinaryApp();
});
