const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");

const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Create wallet
router.post("/", (req, res) => {
  const { name, email } = req.body;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ error: "name is required." });
  }
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "A valid email is required." });
  }

  const existing = db
    .prepare("SELECT id FROM wallets WHERE email = ?")
    .get(email.toLowerCase());
  if (existing) {
    return res
      .status(409)
      .json({ error: "A wallet with that email already exists." });
  }

  const wallet = {
    id: uuidv4(),
    name: name.trim(),
    email: email.toLowerCase(),
    balance: 0.0,
  };

  db.prepare(
    "INSERT INTO wallets (id, name, email, balance) VALUES (@id, @name, @email, @balance)",
  ).run(wallet);

  return res.status(201).json({ message: "Wallet created.", wallet });
});

// Get wallet by ID
router.get("/:id", (req, res) => {
  const wallet = db
    .prepare("SELECT * FROM wallets WHERE id = ?")
    .get(req.params.id);
  if (!wallet) return res.status(404).json({ error: "Wallet not found." });
  return res.json({ wallet });
});

// Deposit
router.post("/:id/deposit", (req, res) => {
  const { amount, note } = req.body;

  if (amount === undefined || amount === null) {
    return res.status(400).json({ error: "amount is required." });
  }

  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return res.status(400).json({ error: "amount must be a positive number." });
  }

  const wallet = db
    .prepare("SELECT * FROM wallets WHERE id = ?")
    .get(req.params.id);
  if (!wallet) return res.status(404).json({ error: "Wallet not found." });

  const txId = uuidv4();

  db.exec("BEGIN");
  try {
    db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ?").run(
      parsed,
      wallet.id,
    );
    db.prepare(
      `
      INSERT INTO transactions (id, type, amount, sender_wallet_id, receiver_wallet_id, note)
      VALUES (?, 'deposit', ?, NULL, ?, ?)
    `,
    ).run(txId, parsed, wallet.id, note || null);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }

  const updated = db
    .prepare("SELECT balance FROM wallets WHERE id = ?")
    .get(wallet.id);

  return res.status(201).json({
    message: "Deposit successful.",
    transaction_id: txId,
    new_balance: updated.balance,
  });
});

// Get transaction history
router.get("/:id/transactions", (req, res) => {
  const wallet = db
    .prepare("SELECT id FROM wallets WHERE id = ?")
    .get(req.params.id);
  if (!wallet) return res.status(404).json({ error: "Wallet not found." });

  const transactions = db
    .prepare(
      `
    SELECT * FROM transactions
    WHERE sender_wallet_id = ? OR receiver_wallet_id = ?
    ORDER BY created_at DESC
  `,
    )
    .all(req.params.id, req.params.id);

  return res.json({ transactions });
});

// Statement — filtered by date range with running balance
// GET /wallets/:id/statement?from=2024-01-01&to=2024-12-31
router.get("/:id/statement", (req, res) => {
  const wallet = db
    .prepare("SELECT * FROM wallets WHERE id = ?")
    .get(req.params.id);
  if (!wallet) return res.status(404).json({ error: "Wallet not found." });

  const { from, to } = req.query;

  let query = `
    SELECT * FROM transactions
    WHERE (sender_wallet_id = ? OR receiver_wallet_id = ?)
  `;
  const params = [req.params.id, req.params.id];

  if (from) {
    query += ` AND created_at >= ?`;
    params.push(from);
  }
  if (to) {
    query += ` AND created_at <= ?`;
    params.push(to + " 23:59:59");
  }

  query += ` ORDER BY created_at ASC`;

  const transactions = db.prepare(query).all(...params);

  // Build running balance per entry
  let running = 0;
  const entries = transactions.map((tx) => {
    if (tx.type === "deposit") {
      running += tx.amount;
    } else if (tx.type === "transfer") {
      if (tx.sender_wallet_id === req.params.id) running -= tx.amount;
      else running += tx.amount;
    }
    return { ...tx, running_balance: parseFloat(running.toFixed(2)) };
  });

  const total_credits = transactions
    .filter((tx) => tx.receiver_wallet_id === req.params.id)
    .reduce((sum, tx) => sum + tx.amount, 0);

  const total_debits = transactions
    .filter((tx) => tx.sender_wallet_id === req.params.id)
    .reduce((sum, tx) => sum + tx.amount, 0);

  return res.json({
    wallet: { id: wallet.id, name: wallet.name, email: wallet.email },
    period: { from: from || "all time", to: to || "now" },
    summary: {
      total_credits: parseFloat(total_credits.toFixed(2)),
      total_debits: parseFloat(total_debits.toFixed(2)),
      net: parseFloat((total_credits - total_debits).toFixed(2)),
      current_balance: wallet.balance,
    },
    transactions: entries,
  });
});

// Reconciliation — checks if wallet balance matches transaction history
// GET /wallets/:id/reconcile
router.get("/:id/reconcile", (req, res) => {
  const wallet = db
    .prepare("SELECT * FROM wallets WHERE id = ?")
    .get(req.params.id);
  if (!wallet) return res.status(404).json({ error: "Wallet not found." });

  const credits = db
    .prepare(
      `
    SELECT COALESCE(SUM(amount), 0) as total
    FROM transactions WHERE receiver_wallet_id = ?
  `,
    )
    .get(req.params.id).total;

  const debits = db
    .prepare(
      `
    SELECT COALESCE(SUM(amount), 0) as total
    FROM transactions WHERE sender_wallet_id = ?
  `,
    )
    .get(req.params.id).total;

  const expected = parseFloat((credits - debits).toFixed(2));
  const actual = parseFloat(wallet.balance.toFixed(2));
  const balanced = expected === actual;

  return res.json({
    wallet_id: wallet.id,
    name: wallet.name,
    status: balanced ? "OK" : "MISMATCH",
    actual_balance: actual,
    expected_balance: expected,
    total_credits: parseFloat(credits.toFixed(2)),
    total_debits: parseFloat(debits.toFixed(2)),
    discrepancy: parseFloat((actual - expected).toFixed(2)),
  });
});

module.exports = router;
