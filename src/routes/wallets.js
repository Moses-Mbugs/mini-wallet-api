const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── POST /wallets ─────────────────────────────────────────────────────────────
router.post("/", (req, res) => {
  const { name, email } = req.body;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ error: "name is required." });
  }
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "A valid email is required." });
  }

  const existing = db.prepare("SELECT id FROM wallets WHERE email = ?").get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: "A wallet with that email already exists." });
  }

  const wallet = {
    id: uuidv4(),
    name: name.trim(),
    email: email.toLowerCase(),
    balance: 0.0,
  };

  db.prepare("INSERT INTO wallets (id, name, email, balance) VALUES (@id, @name, @email, @balance)").run(wallet);

  return res.status(201).json({ message: "Wallet created.", wallet });
});

// ── GET /wallets/:id ──────────────────────────────────────────────────────────
router.get("/:id", (req, res) => {
  const wallet = db.prepare("SELECT * FROM wallets WHERE id = ?").get(req.params.id);
  if (!wallet) return res.status(404).json({ error: "Wallet not found." });
  return res.json({ wallet });
});

// ── POST /wallets/:id/deposit ─────────────────────────────────────────────────
router.post("/:id/deposit", (req, res) => {
  const { amount, note } = req.body;

  if (amount === undefined || amount === null) {
    return res.status(400).json({ error: "amount is required." });
  }

  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return res.status(400).json({ error: "amount must be a positive number." });
  }

  const wallet = db.prepare("SELECT * FROM wallets WHERE id = ?").get(req.params.id);
  if (!wallet) return res.status(404).json({ error: "Wallet not found." });

  // Atomic: update balance + record transaction
  const deposit = db.transaction(() => {
    db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ?").run(parsed, wallet.id);
    const tx = {
      id: uuidv4(),
      type: "deposit",
      amount: parsed,
      sender_wallet_id: null,
      receiver_wallet_id: wallet.id,
      note: note || null,
    };
    db.prepare(`
      INSERT INTO transactions (id, type, amount, sender_wallet_id, receiver_wallet_id, note)
      VALUES (@id, @type, @amount, @sender_wallet_id, @receiver_wallet_id, @note)
    `).run(tx);
    return tx;
  });

  const tx = deposit();
  const updated = db.prepare("SELECT balance FROM wallets WHERE id = ?").get(wallet.id);

  return res.status(201).json({
    message: "Deposit successful.",
    transaction_id: tx.id,
    new_balance: updated.balance,
  });
});

// ── GET /wallets/:id/transactions ─────────────────────────────────────────────
router.get("/:id/transactions", (req, res) => {
  const wallet = db.prepare("SELECT id FROM wallets WHERE id = ?").get(req.params.id);
  if (!wallet) return res.status(404).json({ error: "Wallet not found." });

  const transactions = db.prepare(`
    SELECT * FROM transactions
    WHERE sender_wallet_id = ? OR receiver_wallet_id = ?
    ORDER BY created_at DESC
  `).all(req.params.id, req.params.id);

  return res.json({ transactions });
});

module.exports = router;