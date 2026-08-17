/* ==========================================================================
   BetaBinary - Payments & Banking Engine (payments.js)
   ========================================================================== */

import { stateManager } from './state.js';

export class PaymentsManager {
  constructor() {}

  // Process M-Pesa STK Push Deposit
  processMpesaDeposit(phoneNumber, amountUsd, onProgress, onComplete, onError) {
    if (!phoneNumber || phoneNumber.length < 9) {
      if (onError) onError('Please enter a valid Kenyan phone number (e.g., 0712345678).');
      return;
    }

    const amount = Number(amountUsd);
    if (!amount || amount < 5) {
      if (onError) onError('Minimum deposit amount is $5 (KES 650).');
      return;
    }

    const state = stateManager.getState();
    const kesAmount = Math.round(amount * state.user.exchangeRate);

    // Step 1: STK Push sent
    if (onProgress) onProgress({ step: 1, text: `STK Push sent to ${phoneNumber} for KES ${kesAmount.toLocaleString()}...` });

    // Step 2: Waiting for M-Pesa PIN
    setTimeout(() => {
      if (onProgress) onProgress({ step: 2, text: 'Waiting for M-Pesa PIN prompt on your phone...', phone: phoneNumber, kes: kesAmount });

      // Step 3: PIN Confirmed
      setTimeout(() => {
        if (onProgress) onProgress({ step: 3, text: 'M-Pesa payment confirmed! Crediting account...' });

        setTimeout(() => {
          const txnId = `MP-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

          // Credit Real Balance
          stateManager.update(s => {
            s.user.realBalance += amount;
            s.transactions.unshift({
              id: txnId,
              type: 'deposit',
              method: `M-Pesa (${phoneNumber})`,
              amount: amount,
              currency: 'USD',
              date: Date.now(),
              status: 'completed'
            });
          });

          if (onComplete) onComplete({ txnId, amount, kesAmount });

          window.dispatchEvent(new CustomEvent('betabinary_toast', {
            detail: { type: 'success', message: `Deposit Successful! +$${amount.toFixed(2)} credited via M-Pesa.` }
          }));
        }, 1200);

      }, 2500);

    }, 1500);
  }

  // Process Card Deposit
  processCardDeposit(cardDetails, amountUsd, onComplete, onError) {
    const amount = Number(amountUsd);
    if (!amount || amount < 10) {
      if (onError) onError('Minimum card deposit is $10.');
      return;
    }

    setTimeout(() => {
      const txnId = `CD-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      stateManager.update(s => {
        s.user.realBalance += amount;
        s.transactions.unshift({
          id: txnId,
          type: 'deposit',
          method: 'Visa / Mastercard',
          amount: amount,
          currency: 'USD',
          date: Date.now(),
          status: 'completed'
        });
      });

      if (onComplete) onComplete({ txnId, amount });

      window.dispatchEvent(new CustomEvent('betabinary_toast', {
        detail: { type: 'success', message: `Card Deposit Successful: +$${amount.toFixed(2)}` }
      }));
    }, 1800);
  }

  // Process USDT TRC20 Deposit
  processCryptoDeposit(txid, amountUsd, onComplete) {
    const amount = Number(amountUsd) || 50;
    setTimeout(() => {
      const txnId = `TX-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      stateManager.update(s => {
        s.user.realBalance += amount;
        s.transactions.unshift({
          id: txnId,
          type: 'deposit',
          method: 'USDT (TRC-20)',
          amount: amount,
          currency: 'USD',
          date: Date.now(),
          status: 'completed'
        });
      });

      if (onComplete) onComplete({ txnId, amount });

      window.dispatchEvent(new CustomEvent('betabinary_toast', {
        detail: { type: 'success', message: `USDT Deposit Verified: +$${amount.toFixed(2)}` }
      }));
    }, 2000);
  }

  // Process Withdrawal
  processWithdrawal(method, destination, amountUsd, onComplete, onError) {
    const amount = Number(amountUsd);
    const state = stateManager.getState();
    const realBalance = state.user.realBalance;

    if (!amount || amount < 10) {
      if (onError) onError('Minimum withdrawal amount is $10.');
      return;
    }

    if (amount > realBalance) {
      if (onError) onError(`Insufficient Real balance. Available: $${realBalance.toFixed(2)}`);
      return;
    }

    // Deduct immediately
    stateManager.update(s => {
      s.user.realBalance -= amount;
      s.transactions.unshift({
        id: `WD-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        type: 'withdrawal',
        method: `${method} (${destination})`,
        amount: amount,
        currency: 'USD',
        date: Date.now(),
        status: 'processing'
      });
    });

    if (onComplete) onComplete({ amount, method, destination });

    window.dispatchEvent(new CustomEvent('betabinary_toast', {
      detail: { type: 'info', message: `Withdrawal request for $${amount.toFixed(2)} submitted. Processing to ${method}...` }
    }));
  }
}

export const paymentsManager = new PaymentsManager();
