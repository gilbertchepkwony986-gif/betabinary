const express = require('express');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ===========================================================================
// PESIPAY GATEWAY PROXY — keeps API credentials off the client
// Set these as Environment Variables in Render dashboard:
//   PESIPAY_API_KEY     — Your Pesipay API Key / Bearer Token
//   PESIPAY_BASE_URL    — e.g. https://api.pesipay.com  (or sandbox URL)
//   PESIPAY_CALLBACK_URL — Your Render URL + /api/pesipay/callback
// ===========================================================================

const PESIPAY_API_KEY  = process.env.PESIPAY_API_KEY  || '';
const PESIPAY_BASE_URL = process.env.PESIPAY_BASE_URL || 'https://api.pesipay.com';
const CALLBACK_URL     = process.env.PESIPAY_CALLBACK_URL || '';
const USD_TO_KES       = 130; // approximate fallback rate

// Helper: forward requests to Pesipay
function pesipayRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(PESIPAY_BASE_URL + endpoint);
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${PESIPAY_API_KEY}`,
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
// POST /api/pesipay/deposit/mpesa
// Initiates an M-Pesa STK Push via Pesipay Collections API
// Body: { phone, amountUsd }
// ---------------------------------------------------------------------------
app.post('/api/pesipay/deposit/mpesa', async (req, res) => {
  try {
    const { phone, amountUsd } = req.body;

    if (!phone || !amountUsd || Number(amountUsd) < 5) {
      return res.status(400).json({ error: 'Invalid phone or amount (minimum $5).' });
    }

    const kesAmount = Math.round(Number(amountUsd) * USD_TO_KES);
    const reference = `BB-${Date.now()}`;

    // Pesipay STK Push / collection endpoint
    const result = await pesipayRequest('POST', '/v1/collections/mpesa/stk', {
      phone_number: phone.replace(/^0/, '254'),  // normalize to 254XXXXXXXXX
      amount: kesAmount,
      currency: 'KES',
      reference,
      description: `BetaBinary Deposit – ${reference}`,
      callback_url: CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/pesipay/callback`
    });

    if (result.status >= 200 && result.status < 300) {
      return res.json({
        success: true,
        reference,
        kesAmount,
        amountUsd: Number(amountUsd),
        gatewayRef: result.body.reference || result.body.checkout_request_id || reference,
        message: result.body.message || 'STK Push sent. Check your phone.'
      });
    } else {
      console.error('[Pesipay] STK error:', result);
      return res.status(result.status).json({ error: result.body?.message || 'Payment gateway error.' });
    }
  } catch (err) {
    console.error('[Pesipay] STK exception:', err.message);
    res.status(500).json({ error: 'Payment gateway unreachable. Please try again.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/pesipay/deposit/card
// Initiates a card payment session via Pesipay
// Body: { amountUsd, email, name }
// ---------------------------------------------------------------------------
app.post('/api/pesipay/deposit/card', async (req, res) => {
  try {
    const { amountUsd, email, name } = req.body;
    if (!amountUsd || Number(amountUsd) < 10) {
      return res.status(400).json({ error: 'Minimum card deposit is $10.' });
    }

    const reference = `BB-CD-${Date.now()}`;

    const result = await pesipayRequest('POST', '/v1/collections/card', {
      amount: Number(amountUsd),
      currency: 'USD',
      reference,
      customer: { email: email || 'customer@betabinary.com', name: name || 'BetaBinary User' },
      description: `BetaBinary Card Deposit – ${reference}`,
      callback_url: CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/pesipay/callback`,
      redirect_url: `${req.protocol}://${req.get('host')}/#/deposit/success`
    });

    if (result.status >= 200 && result.status < 300) {
      return res.json({
        success: true,
        reference,
        amountUsd: Number(amountUsd),
        checkoutUrl: result.body.checkout_url || result.body.redirect_url || null,
        gatewayRef: result.body.reference || reference
      });
    } else {
      return res.status(result.status).json({ error: result.body?.message || 'Card gateway error.' });
    }
  } catch (err) {
    console.error('[Pesipay] Card exception:', err.message);
    res.status(500).json({ error: 'Payment gateway unreachable. Please try again.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/pesipay/withdraw
// Initiates a disbursement (M-Pesa / Bank) via Pesipay
// Body: { method, destination, amountUsd }
// ---------------------------------------------------------------------------
app.post('/api/pesipay/withdraw', async (req, res) => {
  try {
    const { method, destination, amountUsd } = req.body;
    if (!amountUsd || Number(amountUsd) < 10) {
      return res.status(400).json({ error: 'Minimum withdrawal is $10.' });
    }

    const reference = `BB-WD-${Date.now()}`;
    const isMpesa = method === 'mpesa';
    const kesAmount = Math.round(Number(amountUsd) * USD_TO_KES);

    const result = await pesipayRequest('POST', '/v1/disbursements', {
      type: isMpesa ? 'mobile_money' : 'bank_transfer',
      phone_number: isMpesa ? destination.replace(/^0/, '254') : undefined,
      account_number: !isMpesa ? destination : undefined,
      amount: kesAmount,
      currency: 'KES',
      reference,
      narration: `BetaBinary Withdrawal – ${reference}`
    });

    if (result.status >= 200 && result.status < 300) {
      return res.json({
        success: true,
        reference,
        amountUsd: Number(amountUsd),
        kesAmount,
        gatewayRef: result.body.reference || reference,
        message: result.body.message || 'Withdrawal initiated successfully.'
      });
    } else {
      return res.status(result.status).json({ error: result.body?.message || 'Withdrawal gateway error.' });
    }
  } catch (err) {
    console.error('[Pesipay] Withdrawal exception:', err.message);
    res.status(500).json({ error: 'Payment gateway unreachable. Please try again.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/pesipay/callback
// Pesipay webhook — called by Pesipay when a payment is confirmed or failed
// ---------------------------------------------------------------------------
app.post('/api/pesipay/callback', (req, res) => {
  const payload = req.body;
  console.log('[Pesipay] Callback received:', JSON.stringify(payload, null, 2));

  // TODO: Verify callback signature if Pesipay provides HMAC
  // const signature = req.headers['x-pesipay-signature'];

  const { reference, status, amount, currency } = payload;

  if (status === 'SUCCESS' || status === 'COMPLETED' || status === 'success') {
    console.log(`[Pesipay] Payment confirmed: ${reference} — ${currency} ${amount}`);
    // In a real backend: update DB, credit user account, emit websocket event
  } else {
    console.log(`[Pesipay] Payment status: ${status} for ${reference}`);
  }

  // Always respond 200 to acknowledge receipt
  res.json({ received: true });
});

// ---------------------------------------------------------------------------
// GET /api/pesipay/status/:reference
// Poll payment status
// ---------------------------------------------------------------------------
app.get('/api/pesipay/status/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    const result = await pesipayRequest('GET', `/v1/transactions/${encodeURIComponent(reference)}`);
    return res.status(result.status).json(result.body);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch payment status.' });
  }
});

// ===========================================================================
// STATIC FILE SERVER — serves the SPA
// ===========================================================================
app.use(express.static(path.join(__dirname), { maxAge: '1h' }));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BetaBinary + Pesipay gateway running on port ${PORT}`);
  if (!PESIPAY_API_KEY) {
    console.warn('[WARNING] PESIPAY_API_KEY is not set — payment endpoints will fail. Add it in Render > Environment.');
  }
});
