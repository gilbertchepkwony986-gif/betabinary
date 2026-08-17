/* ==========================================================================
   BetaBinary - Payments Engine (payments.js)
   Gateway: Paynecta (https://paynecta.co.ke)
   Routes proxied through server.js to keep API credentials server-side.
   ========================================================================== */

import { stateManager } from './state.js';

const API = '/api/paynecta';

// ---------------------------------------------------------------------------
// Helper: JSON POST to backend
// ---------------------------------------------------------------------------
async function apiPost(endpoint, data) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// ---------------------------------------------------------------------------
// Helper: Poll Paynecta payment status by reference
// Paynecta confirmed statuses: SUCCESS, COMPLETED
// ---------------------------------------------------------------------------
async function pollPaynectaStatus(reference, maxAttempts = 12, intervalMs = 5000) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    try {
      const res = await fetch(`${API}/status/${encodeURIComponent(reference)}`);
      const data = await res.json();
      const status = (data?.data?.status || data?.status || '').toUpperCase();
      if (status === 'SUCCESS' || status === 'COMPLETED') return { confirmed: true, data };
      if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED') return { confirmed: false, data };
    } catch { /* keep polling */ }
  }
  return { confirmed: false, data: null }; // timed out after ~60s
}

export class PaymentsManager {
  constructor() {}

  // -------------------------------------------------------------------------
  // M-Pesa STK Push Deposit via Paynecta
  // -------------------------------------------------------------------------
  async processMpesaDeposit(phoneNumber, amountUsd, onProgress, onComplete, onError) {
    if (!phoneNumber || phoneNumber.replace(/\D/g, '').length < 9) {
      onError?.('Please enter a valid Kenyan phone number (e.g., 0712345678).');
      return;
    }
    const amount = Number(amountUsd);
    if (!amount || amount < 5) {
      onError?.('Minimum deposit amount is $5.');
      return;
    }

    try {
      onProgress?.({ step: 1, text: `Connecting to Paynecta…` });

      const result = await apiPost(`${API}/deposit/mpesa`, {
        phone: phoneNumber,
        amountUsd: amount
      });

      if (result.fallback && result.sessionUrl) {
        // STK Push not available — open Paynecta hosted checkout
        onProgress?.({
          step: 2,
          text: 'Opening Paynecta secure checkout…',
          checkoutUrl: result.sessionUrl
        });
        window.open(result.sessionUrl, '_blank');
        this._toast('info', 'Complete your M-Pesa payment in the Paynecta checkout tab.');
        onComplete?.({ txnId: result.reference, amount, kesAmount: result.kesAmount, redirect: true });
        return;
      }

      onProgress?.({
        step: 2,
        text: `STK Push sent! KES ${result.kesAmount?.toLocaleString()} — Enter your M-Pesa PIN on your phone.`,
        phone: phoneNumber,
        kes: result.kesAmount
      });

      onProgress?.({ step: 3, text: 'Waiting for Paynecta confirmation…' });

      const poll = await pollPaynectaStatus(result.reference);

      if (poll.confirmed) {
        this._creditDeposit(amount, `M-Pesa (${phoneNumber})`, result.reference);
        onComplete?.({ txnId: result.reference, amount, kesAmount: result.kesAmount });
        this._toast('success', `Deposit Confirmed! +$${amount.toFixed(2)} credited via M-Pesa.`);
      } else {
        onError?.('M-Pesa payment was not confirmed within 60 seconds. If you entered your PIN, funds will arrive shortly.');
      }

    } catch (err) {
      console.error('[Payments] M-Pesa error:', err);
      onError?.(err.message || 'Payment failed. Please try again.');
    }
  }

  // -------------------------------------------------------------------------
  // Card / Any method Deposit via Paynecta Checkout Session
  // -------------------------------------------------------------------------
  async processCardDeposit(cardDetails, amountUsd, onComplete, onError) {
    const amount = Number(amountUsd);
    if (!amount || amount < 10) {
      onError?.('Minimum card deposit is $10.');
      return;
    }

    try {
      const state = stateManager.getState();
      const result = await apiPost(`${API}/deposit/card`, {
        amountUsd: amount,
        email: state.user?.email || '',
        name: state.user?.name || 'BetaBinary User'
      });

      if (result.checkoutUrl) {
        window.open(result.checkoutUrl, '_blank');
        this._toast('info', 'Paynecta checkout opened — complete payment in the new tab.');
        onComplete?.({ txnId: result.reference, amount, redirect: true });
      } else {
        this._creditDeposit(amount, 'Card via Paynecta', result.reference);
        onComplete?.({ txnId: result.reference, amount });
        this._toast('success', `Card Deposit Successful: +$${amount.toFixed(2)}`);
      }

    } catch (err) {
      console.error('[Payments] Card error:', err);
      onError?.(err.message || 'Card payment failed. Please try again.');
    }
  }

  // -------------------------------------------------------------------------
  // USDT TRC-20 Crypto Deposit (recorded as pending — confirmed via webhook)
  // -------------------------------------------------------------------------
  processCryptoDeposit(txid, amountUsd, onComplete) {
    const amount = Number(amountUsd) || 50;
    const txnId = `TX-${(txid || '').substring(0, 8).toUpperCase() || Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    stateManager.update(s => {
      s.transactions.unshift({
        id: txnId,
        type: 'deposit',
        method: 'USDT (TRC-20)',
        amount,
        currency: 'USD',
        date: Date.now(),
        status: 'pending'
      });
    });
    onComplete?.({ txnId, amount });
    this._toast('info', 'USDT deposit submitted. Account will be credited after blockchain confirmation.');
  }

  // -------------------------------------------------------------------------
  // Withdrawal via Paynecta B2C disbursement
  // -------------------------------------------------------------------------
  async processWithdrawal(method, destination, amountUsd, onComplete, onError) {
    const amount = Number(amountUsd);
    const state  = stateManager.getState();

    if (!amount || amount < 10) {
      onError?.('Minimum withdrawal amount is $10.');
      return;
    }
    if (amount > state.user.realBalance) {
      onError?.(`Insufficient balance. Available: $${state.user.realBalance.toFixed(2)}`);
      return;
    }

    // Optimistic deduction
    const withdrawalId = `WD-${Date.now()}`;
    stateManager.update(s => {
      s.user.realBalance -= amount;
      s.transactions.unshift({
        id: withdrawalId,
        type: 'withdrawal',
        method: `${method === 'mpesa' ? 'M-Pesa' : 'Bank'} (${destination})`,
        amount,
        currency: 'USD',
        date: Date.now(),
        status: 'processing'
      });
    });

    try {
      const result = await apiPost(`${API}/withdraw`, { method, destination, amountUsd: amount });

      stateManager.update(s => {
        const txn = s.transactions.find(t => t.id === withdrawalId);
        if (txn) { txn.status = 'submitted'; txn.gatewayRef = result.reference; }
      });

      onComplete?.({ amount, method, destination, reference: result.reference });
      this._toast('info', `Withdrawal of $${amount.toFixed(2)} submitted via Paynecta. ${result.message || ''}`);

    } catch (err) {
      console.error('[Payments] Withdrawal error:', err);
      // Reverse the optimistic deduction
      stateManager.update(s => {
        s.user.realBalance += amount;
        const txn = s.transactions.find(t => t.id === withdrawalId);
        if (txn) txn.status = 'failed';
      });
      onError?.(err.message || 'Withdrawal failed. Your balance has been restored.');
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------
  _creditDeposit(amount, method, reference) {
    stateManager.update(s => {
      s.user.realBalance += amount;
      s.transactions.unshift({
        id: reference || `DEP-${Date.now()}`,
        type: 'deposit',
        method,
        amount,
        currency: 'USD',
        date: Date.now(),
        status: 'completed'
      });
    });
  }

  _toast(type, message) {
    window.dispatchEvent(new CustomEvent('betabinary_toast', { detail: { type, message } }));
  }
}

export const paymentsManager = new PaymentsManager();
