# BetaBinary — High-Frequency Binary Options & Digital Contracts Platform

A complete, feature-packed, pixel-perfect binary options and synthetic indices trading web application inspired by `https://betabinary.ke/trade` and `betabinary.ke`.

---

## Key Features & Capabilities

### 1. High-Performance Trading Terminal (`#/trade`)
- **Continuous 24/7 Synthetic Indices**: Volatility 10, Volatility 25, Volatility 50, Volatility 75, Volatility 100, Boom 500, Crash 500, Step Index.
- **Forex & Crypto Markets**: EUR/USD, GBP/USD, USD/JPY, AUD/USD, BTC/USD, ETH/USD, SOL/USD, Gold (XAU/USD), US Oil, NASDAQ.
- **Multiple Binary Contract Types**:
  - **Rise / Fall (Higher / Lower)**: Up to 95% payout.
  - **Even / Odd**: Predict whether the exit tick digit is even or odd (95% return).
  - **Over / Under**: Predict whether the exit tick digit is strictly above or below target digit (0–9) with dynamic risk-weighted returns.
  - **Matches / Differs**: Predict exact digit match (massive **950% payout**) or digit mismatch (10% profit).
- **Interactive HTML5 Canvas Chart**:
  - Live Area Tick Chart with gradient glow & smooth Bézier curve interpolation.
  - Real-time Candlestick Chart (1s, 5s, 15s, 1m, 5m).
  - Technical Overlays: SMA (20), Bollinger Bands (20, 2), RSI (14).
  - Active contract entry price markers, countdown tags, and live price crosshairs.
- **Last Digit Frequency Analyzer**:
  - Real-time bar percentage breakdown for digits `0` through `9` over the last 100 ticks with dynamic **Hot** (green) and **Cold** (red) highlights.
- **Real-Time Sound Synthesis (Web Audio API)**:
  - Zero external sound file dependency: synthesized trade placement chime, winning fanfare, and loss tones.

### 2. Automated Trading Bots
- **Strategies**:
  - **Martingale**: 2x multiplier on loss, resets to base stake on win.
  - **D'Alembert**: Increments/decrements stake by base unit on loss/win.
  - **AI Momentum Scalper**: High-frequency algorithmic execution.
- **Risk Safeguards**: Configurable Target Profit auto-stop and Stop Loss limits with real-time Win Rate %, Run counts, and Net P/L tracker.

### 3. Banking & Payment Systems
- **M-Pesa STK Push Express**:
  - Instant mobile money deposit simulation with USD $\leftrightarrow$ KES conversion (~1 USD = 130 KES).
  - Interactive PIN prompt modal and instant balance crediting.
- **Credit / Debit Cards**: Visa & Mastercard processing simulation.
- **USDT (TRC-20)**: Crypto deposit address with QR code.
- **Withdrawals**: Fast cashing out to M-Pesa phone numbers, USDT wallets, or Bank wire.

### 4. Account & Settings Hub (`#/settings/*`)
- **Dual Account System**: Instant switching between **Demo Account** ($10,000 reloadable virtual funds) and **Real Account**.
- **Settings Pages**:
  - `#/settings/profile`: Display name, phone number, preferred currency.
  - `#/settings/password`: Password change with strength validation.
  - `#/settings/2fa`: Two-Factor Authenticator (TOTP QR code & secret key).
  - `#/settings/verify`: KYC identity verification with document upload simulation.

### 5. Landing, Leaderboard & Affiliate Programs
- `#/`: Full modern landing page with hero banner, live market ticker, feature cards, 3-step onboarding guide, customer testimonials, and risk disclosures.
- `#/leaderboard`: Weekly ranking of top traders, win rates, and weekly prize pool.
- `#/affiliate`: Tiered referral system with unique referral links and up to 40% revenue share.
- **Live Support Chat Widget**: Floating bottom-right 24/7 automated support assistant.

---

## How to Run Locally

### Option 1: Using the PowerShell Server (Recommended)
Run the following in PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1
```
Then open: **[http://localhost:3000](http://localhost:3000)**

### Option 2: Direct Static File Opening
Open `index.html` directly in modern Chrome, Edge, Safari, or Firefox.
