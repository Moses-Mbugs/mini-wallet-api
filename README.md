# Mini Wallet Transaction API

A simple REST API for managing wallet transactions — built with Node.js, Express, and SQLite.

---

## Setup

**Requirements:** Node.js v18+

```bash
git clone <your-repo-url>
cd mini-wallet-api
npm install
npm start
```

The server starts on **http://localhost:3000** by default.

Set a custom port via environment variable:
```bash
PORT=4000 npm start
```

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
  "name": "Alice Kariuki",
  "email": "alice@example.com"
}
```
**Response `201`:**
```json
{
  "message": "Wallet created.",
  "wallet": {
    "id": "uuid",
    "name": "Alice Kariuki",
    "email": "alice@example.com",
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
  -d '{"name":"Alice","email":"alice@example.com"}'

curl -s -X POST http://localhost:3000/wallets \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob","email":"bob@example.com"}'

# 2. Deposit into Alice's wallet (replace ALICE_ID)
curl -s -X POST http://localhost:3000/wallets/ALICE_ID/deposit \
  -H "Content-Type: application/json" \
  -d '{"amount":1000,"note":"Salary"}'

# 3. Transfer from Alice to Bob
curl -s -X POST http://localhost:3000/transfers \
  -H "Content-Type: application/json" \
  -d '{"sender_wallet_id":"ALICE_ID","receiver_wallet_id":"BOB_ID","amount":250}'

# 4. Check Alice's transaction history
curl -s http://localhost:3000/wallets/ALICE_ID/transactions
```

---

## Project Structure

```
mini-wallet-api/
├── src/
│   ├── app.js              # Express app + server entry
│   ├── db.js               # SQLite connection + schema migrations
│   └── routes/
│       ├── wallets.js      # Wallet CRUD + deposit
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