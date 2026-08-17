const express = require('express');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ===========================================================================
// PAYNECTA PAYMENT GATEWAY PROXY
// Paynecta (https://paynecta.co.ke) — M-Pesa STK Push & Checkout Sessions
//
// Set these Environment Variables in Render Dashboard → Environment:
//   PAYNECTA_API_KEY    — Your API key from paynecta.co.ke dashboard
//   PAYNECTA_USER_EMAIL — Your registered Paynecta email
//   PAYNECTA_LINK_SLUG  — Your payment link slug (e.g. "betabinary")
//   PAYNECTA_BASE_URL   — https://paynecta.co.ke (default)
// ===========================================================================

const PAYNECTA_API_KEY    = process.env.PAYNECTA_API_KEY    || '';
const PAYNECTA_USER_EMAIL = process.env.PAYNECTA_USER_EMAIL || '';
const PAYNECTA_LINK_SLUG  = process.env.PAYNECTA_LINK_SLUG  || '';
const PAYNECTA_BASE_URL   = process.env.PAYNECTA_BASE_URL   || 'https://paynecta.co.ke';
const USD_TO_KES          = 130; // fallback rate; use live rate in production

// ---------------------------------------------------------------------------
// Helper: Make authenticated HTTPS request to Paynecta
// ---------------------------------------------------------------------------
function paynectaRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const url = new URL(PAYNECTA_BASE_URL);

    const options = {
      hostname: url.hostname,
      port: 443,
      path,
      method,
      headers: {
        'X-API-Key': PAYNECTA_API_KEY,
        'X-User-Email': PAYNECTA_USER_EMAIL,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// POST /api/paynecta/deposit/mpesa
// Creates a Paynecta Checkout Session then initiates STK Push to phone
// Body: { phone, amountUsd }
// ---------------------------------------------------------------------------
app.post('/api/paynecta/deposit/mpesa', async (req, res) => {
  try {
    const { phone, amountUsd } = req.body;

    if (!phone || phone.replace(/\D/g, '').length < 9) {
      return res.status(400).json({ error: 'Enter a valid Kenyan phone number (e.g. 0712345678).' });
    }
    if (!amountUsd || Number(amountUsd) < 5) {
      return res.status(400).json({ error: 'Minimum deposit is $5.' });
    }

    const kesAmount = Math.round(Number(amountUsd) * USD_TO_KES);
    const reference = `BB-${Date.now()}`;

    // Step 1: Create a Checkout Session
    const sessionRes = await paynectaRequest('POST', '/api/v1/checkout/sessions', {
      amount: kesAmount,
      currency: 'KES',
      description: `BetaBinary Deposit — ${reference}`,
      reference,
      redirect_url: `${req.protocol}://${req.get('host')}/#/deposit/success`,
      cancel_url: `${req.protocol}://${req.get('host')}/#/deposit/cancel`,
      metadata: { source: 'betabinary', usd_amount: Number(amountUsd) }
    });

    if (sessionRes.status < 200 || sessionRes.status >= 300) {
      console.error('[Paynecta] Session create error:', sessionRes);
      return res.status(sessionRes.status).json({ error: sessionRes.body?.message || 'Could not create checkout session.' });
    }

    const sessionId  = sessionRes.body?.data?.id  || sessionRes.body?.id;
    const sessionUrl = sessionRes.body?.data?.url || sessionRes.body?.checkout_url;

    // Step 2: Initiate STK Push via payment link route
    const normalizedPhone = phone.replace(/^0/, '254').replace(/\D/g, '');
    const stkRes = await paynectaRequest('POST', `/api/v1/checkout/sessions/${sessionId}/pay`, {
      phone_number: normalizedPhone,
      payment_method: 'mpesa_stk'
    });

    if (stkRes.status >= 200 && stkRes.status < 300) {
      return res.json({
        success: true,
        reference,
        sessionId,
        sessionUrl,
        kesAmount,
        amountUsd: Number(amountUsd),
        phone: normalizedPhone,
        message: stkRes.body?.message || 'STK Push sent. Check your phone for the M-Pesa prompt.'
      });
    } else {
      // Fall back: return session URL for manual checkout
      console.warn('[Paynecta] STK push failed, returning checkout URL:', stkRes.body);
      return res.json({
        success: true,
        reference,
        sessionId,
        sessionUrl,
        kesAmount,
        amountUsd: Number(amountUsd),
        fallback: true,
        message: 'STK Push unavailable. Use the checkout link to complete payment.'
      });
    }

  } catch (err) {
    console.error('[Paynecta] M-Pesa error:', err.message);
    res.status(500).json({ error: 'Payment gateway unreachable. Please try again.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/paynecta/deposit/card
// Creates a Paynecta checkout session for card / any other payment method
// Body: { amountUsd, email, name }
// ---------------------------------------------------------------------------
app.post('/api/paynecta/deposit/card', async (req, res) => {
  try {
    const { amountUsd, email, name } = req.body;
    if (!amountUsd || Number(amountUsd) < 10) {
      return res.status(400).json({ error: 'Minimum card deposit is $10.' });
    }

    const kesAmount = Math.round(Number(amountUsd) * USD_TO_KES);
    const reference = `BB-CD-${Date.now()}`;

    const sessionRes = await paynectaRequest('POST', '/api/v1/checkout/sessions', {
      amount: kesAmount,
      currency: 'KES',
      description: `BetaBinary Card Deposit — ${reference}`,
      reference,
      customer: { email: email || '', name: name || 'BetaBinary User' },
      redirect_url: `${req.protocol}://${req.get('host')}/#/deposit/success`,
      cancel_url: `${req.protocol}://${req.get('host')}/#/deposit/cancel`,
      metadata: { source: 'betabinary', usd_amount: Number(amountUsd) }
    });

    if (sessionRes.status >= 200 && sessionRes.status < 300) {
      const sessionId  = sessionRes.body?.data?.id  || sessionRes.body?.id;
      const sessionUrl = sessionRes.body?.data?.url || sessionRes.body?.checkout_url
                      || `https://paynecta.co.ke/c/${sessionId}`;

      return res.json({
        success: true,
        reference,
        sessionId,
        checkoutUrl: sessionUrl,
        amountUsd: Number(amountUsd),
        kesAmount
      });
    } else {
      return res.status(sessionRes.status).json({ error: sessionRes.body?.message || 'Card session error.' });
    }

  } catch (err) {
    console.error('[Paynecta] Card error:', err.message);
    res.status(500).json({ error: 'Payment gateway unreachable. Please try again.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/paynecta/status/:reference
// Poll payment status using Paynecta's status endpoint
// ---------------------------------------------------------------------------
app.get('/api/paynecta/status/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    // Paynecta status: GET /api/v1/payment/status?transaction_reference=...
    const result = await paynectaRequest(
      'GET',
      `/api/v1/payment/status?transaction_reference=${encodeURIComponent(reference)}`
    );
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[Paynecta] Status error:', err.message);
    res.status(500).json({ error: 'Could not fetch payment status.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/paynecta/withdraw
// B2C / M-Pesa disbursement (requires B2C credentials from Paynecta)
// Body: { method, destination, amountUsd }
// ---------------------------------------------------------------------------
app.post('/api/paynecta/withdraw', async (req, res) => {
  try {
    const { method, destination, amountUsd } = req.body;
    if (!amountUsd || Number(amountUsd) < 10) {
      return res.status(400).json({ error: 'Minimum withdrawal is $10.' });
    }

    const kesAmount = Math.round(Number(amountUsd) * USD_TO_KES);
    const reference = `BB-WD-${Date.now()}`;
    const normalizedPhone = destination.replace(/^0/, '254').replace(/\D/g, '');

    // Paynecta B2C disbursement via mobile payment link initiation
    const result = await paynectaRequest('POST', `/api/payment/${PAYNECTA_LINK_SLUG}/initiate`, {
      amount: kesAmount,
      currency: 'KES',
      phone_number: normalizedPhone,
      reference,
      description: `BetaBinary Withdrawal — ${reference}`,
      type: 'b2c'
    });

    if (result.status >= 200 && result.status < 300) {
      return res.json({
        success: true,
        reference,
        amountUsd: Number(amountUsd),
        kesAmount,
        message: result.body?.message || 'Withdrawal initiated. Funds will be sent to your M-Pesa.'
      });
    } else {
      return res.status(result.status).json({ error: result.body?.message || 'Withdrawal failed.' });
    }

  } catch (err) {
    console.error('[Paynecta] Withdrawal error:', err.message);
    res.status(500).json({ error: 'Withdrawal gateway unreachable. Please try again.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/paynecta/webhook
// Paynecta sends payment status updates here
// ---------------------------------------------------------------------------
app.post('/api/paynecta/webhook', (req, res) => {
  const payload = req.body;
  console.log('[Paynecta] Webhook received:', JSON.stringify(payload, null, 2));

  const { transaction_reference, status, amount, currency } = payload;
  const s = (status || '').toUpperCase();

  if (s === 'SUCCESS' || s === 'COMPLETED') {
    console.log(`[Paynecta] Payment CONFIRMED: ${transaction_reference} — ${currency} ${amount}`);
    // In production: look up user by reference, credit their account, emit real-time event
  } else {
    console.log(`[Paynecta] Payment status "${status}" for ref: ${transaction_reference}`);
  }

  res.json({ received: true });
});

// ===========================================================================
// STATIC ASSETS — serves the SPA
// ===========================================================================
app.use(express.static(path.join(__dirname), { maxAge: '1h' }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BetaBinary + Paynecta gateway running on port ${PORT}`);

  const missing = [];
  if (!PAYNECTA_API_KEY)    missing.push('PAYNECTA_API_KEY');
  if (!PAYNECTA_USER_EMAIL) missing.push('PAYNECTA_USER_EMAIL');
  if (!PAYNECTA_LINK_SLUG)  missing.push('PAYNECTA_LINK_SLUG');
  if (missing.length) {
    console.warn(`[WARNING] Missing env vars: ${missing.join(', ')} — Add them in Render → Environment.`);
  }
});
