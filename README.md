# Mini Wallet Transaction API

A simple REST API for managing wallet transactions — built with Node.js, Express, and SQLite (via Node.js built-in `node:sqlite`).

---

## Setup

**Requirements:** Node.js v22.5.0+

```bash
git clone https://github.com/Moses-Mbugs/mini-wallet-api
cd mini-wallet-api
npm install
node src/app.js
```

The server starts on **http://localhost:3000** by default.

Set a custom port via environment variable:
```bash
PORT=4000 node src/app.js
```

> **Note:** Node's built-in SQLite is experimental. If you see a warning on startup, run with `node --no-warnings src/app.js` to suppress it.

---

## API Reference

### Health Check
```
GET /health
```

---

### Wallets

#### Create a wallet
```
POST /wallets
Content-Type: application/json

{
  "name": "Johnny Bravo",
  "email": "johnny.bravo@example.com"
}
```
**Response `201`:**
```json
{
  "message": "Wallet created.",
  "wallet": {
    "id": "uuid",
    "name": "Johnny Bravo",
    "email": "johnny.bravo@example.com",
    "balance": 0,
    "created_at": "2024-01-01T10:00:00"
  }
}
```

---

#### Get a wallet
```
GET /wallets/:id
```

---

#### Deposit funds
```
POST /wallets/:id/deposit
Content-Type: application/json

{
  "amount": 500,
  "note": "Initial top-up"
}
```
**Response `201`:**
```json
{
  "message": "Deposit successful.",
  "transaction_id": "uuid",
  "new_balance": 500
}
```

---

#### Get transaction history
```
GET /wallets/:id/transactions
```

---

#### Get wallet statement
Returns all transactions with a running balance. Supports optional date filtering.

```
GET /wallets/:id/statement?from=2024-01-01&to=2024-12-31
```

**Query params (optional):**
| Param | Format | Description |
|---|---|---|
| `from` | `YYYY-MM-DD` | Start date (inclusive) |
| `to` | `YYYY-MM-DD` | End date (inclusive) |

**Response `200`:**
```json
{
  "wallet": { "id": "uuid", "name": "Johnny Bravo", "email": "johnny.bravo@example.com" },
  "period": { "from": "2024-01-01", "to": "2024-12-31" },
  "summary": {
    "total_credits": 1000,
    "total_debits": 250,
    "net": 750,
    "current_balance": 750
  },
  "transactions": [
    {
      "id": "uuid",
      "type": "deposit",
      "amount": 1000,
      "sender_wallet_id": null,
      "receiver_wallet_id": "uuid",
      "note": "Salary",
      "created_at": "2024-01-01T10:00:00",
      "running_balance": 1000
    }
  ]
}
```

---

#### Reconcile wallet
Verifies that the wallet's stored balance matches what can be computed from its transaction history. Useful for detecting data integrity issues.

```
GET /wallets/:id/reconcile
```

**Response `200`:**
```json
{
  "wallet_id": "uuid",
  "name": "Johnny Bravo",
  "status": "OK",
  "actual_balance": 750,
  "expected_balance": 750,
  "total_credits": 1000,
  "total_debits": 250,
  "discrepancy": 0
}
```

`status` is either `"OK"` or `"MISMATCH"`. A mismatch means the stored balance has drifted from the transaction log — which should never happen under normal operation as all balance updates are wrapped in transactions.

---

### Transfers

#### Transfer between wallets
```
POST /transfers
Content-Type: application/json

{
  "sender_wallet_id": "uuid-of-sender",
  "receiver_wallet_id": "uuid-of-receiver",
  "amount": 200,
  "note": "Rent contribution"
}
```
**Response `201`:**
```json
{
  "message": "Transfer successful.",
  "transaction_id": "uuid",
  "sender_new_balance": 300
}
```

---

## Edge Cases Handled

| Scenario | HTTP Status |
|---|---|
| Missing / invalid fields | `400` |
| Wallet not found | `404` |
| Duplicate email | `409` |
| Insufficient balance | `422` |
| Negative or zero amount | `400` |
| Transfer to self | `400` |

---

## Example cURL Walkthrough

```bash
# 1. Create two wallets
curl -s -X POST http://localhost:3000/wallets \
  -H "Content-Type: application/json" \
  -d '{"name":"Johnny Bravo","email":"johnny.bravo@example.com"}'

curl -s -X POST http://localhost:3000/wallets \
  -H "Content-Type: application/json" \
  -d '{"name":"Donkey Kong","email":"donkey.kong@example.com"}'

# 2. Deposit into Johnny's wallet (replace JOHNNY_ID)
curl -s -X POST http://localhost:3000/wallets/JOHNNY_ID/deposit \
  -H "Content-Type: application/json" \
  -d '{"amount":1000,"note":"Salary"}'

# 3. Transfer from Johnny to Donkey Kong
curl -s -X POST http://localhost:3000/transfers \
  -H "Content-Type: application/json" \
  -d '{"sender_wallet_id":"JOHNNY_ID","receiver_wallet_id":"DONKEY_KONG_ID","amount":250}'

# 4. Get Johnny's statement
curl -s "http://localhost:3000/wallets/JOHNNY_ID/statement"

# 5. Reconcile Johnny's wallet
curl -s "http://localhost:3000/wallets/JOHNNY_ID/reconcile"

# 6. Check Johnny's full transaction history
curl -s http://localhost:3000/wallets/JOHNNY_ID/transactions
```

---

## Project Structure

```
mini-wallet-api/
├── src/
│   ├── app.js              # Express app + server entry
│   ├── db.js               # SQLite connection + schema
│   └── routes/
│       ├── wallets.js      # Wallet CRUD, deposit, statement, reconcile
│       └── transfers.js    # Transfer endpoint
├── wallet.db               # Auto-created on first run (gitignored)
├── package.json
└── README.md
```

---

## Database Schema

**wallets**
| Column | Type | Notes |
|---|---|---|
| id | TEXT | UUID primary key |
| name | TEXT | Owner name |
| email | TEXT | Unique |
| balance | REAL | Default 0 |
| created_at | TEXT | ISO datetime |

**transactions**
| Column | Type | Notes |
|---|---|---|
| id | TEXT | UUID primary key |
| type | TEXT | `deposit` or `transfer` |
| amount | REAL | Always positive |
| sender_wallet_id | TEXT | NULL for deposits |
| receiver_wallet_id | TEXT | Always set |
| note | TEXT | Optional |
| created_at | TEXT | ISO datetime |