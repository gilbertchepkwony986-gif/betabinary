/* ==========================================================================
   BetaBinary - Payments Engine (payments.js)
   Integrated with Pesipay via backend proxy routes in server.js
   ========================================================================== */

import { stateManager } from './state.js';

// Base API path — in production this hits the same Render origin
const API = '/api/pesipay';

// ---------------------------------------------------------------------------
// Helper: make a JSON POST to a backend route
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
// Helper: poll payment status from backend
// ---------------------------------------------------------------------------
async function pollStatus(reference, maxAttempts = 12, intervalMs = 5000) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    try {
      const res = await fetch(`${API}/status/${encodeURIComponent(reference)}`);
      const data = await res.json();
      const s = (data.status || '').toUpperCase();
      if (s === 'SUCCESS' || s === 'COMPLETED') return { confirmed: true, data };
      if (s === 'FAILED' || s === 'CANCELLED' || s === 'EXPIRED') return { confirmed: false, data };
    } catch { /* keep polling */ }
  }
  return { confirmed: false, data: null }; // timed out
}

export class PaymentsManager {
  constructor() {}

  // -------------------------------------------------------------------------
  // M-Pesa STK Push Deposit via Pesipay
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
      onProgress?.({ step: 1, text: `Sending STK Push to ${phoneNumber}…` });

      const result = await apiPost(`${API}/deposit/mpesa`, { phone: phoneNumber, amountUsd: amount });

      onProgress?.({
        step: 2,
        text: `STK Push sent! KES ${result.kesAmount?.toLocaleString()} — Enter your M-Pesa PIN on your phone.`,
        phone: phoneNumber,
        kes: result.kesAmount
      });

      // Poll until Pesipay confirms or times out
      onProgress?.({ step: 3, text: 'Waiting for M-Pesa confirmation…' });
      const poll = await pollStatus(result.gatewayRef || result.reference);

      if (poll.confirmed) {
        this._creditDeposit(amount, `M-Pesa (${phoneNumber})`, result.gatewayRef);
        onComplete?.({ txnId: result.gatewayRef, amount, kesAmount: result.kesAmount });
        this._toast('success', `Deposit Confirmed! +$${amount.toFixed(2)} credited via M-Pesa.`);
      } else {
        // Pesipay did not confirm within 60s — possible user cancelled
        onError?.('M-Pesa payment was not confirmed. Please try again or contact support.');
      }

    } catch (err) {
      console.error('[Payments] M-Pesa error:', err);
      onError?.(err.message || 'Payment failed. Please try again.');
    }
  }

  // -------------------------------------------------------------------------
  // Card Deposit via Pesipay (redirects to hosted checkout)
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
        email: state.user.email || 'user@betabinary.com',
        name: state.user.name || 'BetaBinary User'
      });

      if (result.checkoutUrl) {
        // Open Pesipay hosted card checkout in a new tab
        window.open(result.checkoutUrl, '_blank');
        this._toast('info', 'Card checkout opened — complete payment in the new tab.');
        onComplete?.({ txnId: result.gatewayRef, amount, redirect: true });
      } else {
        // No redirect URL — treat as immediately confirmed (sandbox mode)
        this._creditDeposit(amount, 'Visa / Mastercard', result.gatewayRef);
        onComplete?.({ txnId: result.gatewayRef, amount });
        this._toast('success', `Card Deposit Successful: +$${amount.toFixed(2)}`);
      }

    } catch (err) {
      console.error('[Payments] Card error:', err);
      onError?.(err.message || 'Card payment failed. Please try again.');
    }
  }

  // -------------------------------------------------------------------------
  // USDT TRC-20 Crypto Deposit (on-chain verification — manual / webhook)
  // -------------------------------------------------------------------------
  processCryptoDeposit(txid, amountUsd, onComplete) {
    const amount = Number(amountUsd) || 50;
    // USDT is verified on-chain via webhook in production.
    // For now, record as pending — backend will confirm via Pesipay webhook.
    const txnId = `TX-${txid?.substring(0, 8).toUpperCase() || Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    stateManager.update(s => {
      s.transactions.unshift({
        id: txnId,
        type: 'deposit',
        method: 'USDT (TRC-20)',
        amount,
        currency: 'USD',
        date: Date.now(),
        status: 'pending'  // confirmed via webhook
      });
    });
    onComplete?.({ txnId, amount });
    this._toast('info', `USDT deposit submitted. Your account will be credited after blockchain confirmation.`);
  }

  // -------------------------------------------------------------------------
  // Withdrawal via Pesipay Disbursements
  // -------------------------------------------------------------------------
  async processWithdrawal(method, destination, amountUsd, onComplete, onError) {
    const amount = Number(amountUsd);
    const state = stateManager.getState();

    if (!amount || amount < 10) {
      onError?.('Minimum withdrawal amount is $10.');
      return;
    }
    if (amount > state.user.realBalance) {
      onError?.(`Insufficient balance. Available: $${state.user.realBalance.toFixed(2)}`);
      return;
    }

    // Deduct immediately (optimistic) — reversed by backend if Pesipay rejects
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

      // Update transaction status to submitted
      stateManager.update(s => {
        const txn = s.transactions.find(t => t.id === withdrawalId);
        if (txn) { txn.status = 'submitted'; txn.gatewayRef = result.gatewayRef; }
      });

      onComplete?.({ amount, method, destination, gatewayRef: result.gatewayRef });
      this._toast('info', `Withdrawal of $${amount.toFixed(2)} submitted. ${result.message || 'Processing…'}`);

    } catch (err) {
      console.error('[Payments] Withdrawal error:', err);
      // Reverse optimistic deduction
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
  _creditDeposit(amount, method, gatewayRef) {
    stateManager.update(s => {
      s.user.realBalance += amount;
      s.transactions.unshift({
        id: gatewayRef || `DEP-${Date.now()}`,
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
