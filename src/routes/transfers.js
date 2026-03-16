const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");

const router = express.Router();

// ── POST /transfers ───────────────────────────────────────────────────────────
router.post("/", (req, res) => {
  const { sender_wallet_id, receiver_wallet_id, amount, note } = req.body;

  // ── Input validation ──
  if (!sender_wallet_id) return res.status(400).json({ error: "sender_wallet_id is required." });
  if (!receiver_wallet_id) return res.status(400).json({ error: "receiver_wallet_id is required." });
  if (amount === undefined || amount === null) return res.status(400).json({ error: "amount is required." });

  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return res.status(400).json({ error: "amount must be a positive number." });
  }

  if (sender_wallet_id === receiver_wallet_id) {
    return res.status(400).json({ error: "Sender and receiver must be different wallets." });
  }

  // ── Wallet existence ──
  const sender = db.prepare("SELECT * FROM wallets WHERE id = ?").get(sender_wallet_id);
  if (!sender) return res.status(404).json({ error: "Sender wallet not found." });

  const receiver = db.prepare("SELECT * FROM wallets WHERE id = ?").get(receiver_wallet_id);
  if (!receiver) return res.status(404).json({ error: "Receiver wallet not found." });

  // ── Sufficient balance ──
  if (sender.balance < parsed) {
    return res.status(422).json({
      error: "Insufficient balance.",
      available: sender.balance,
      requested: parsed,
    });
  }

  // ── Atomic transfer ──
  const transfer = db.transaction(() => {
    db.prepare("UPDATE wallets SET balance = balance - ? WHERE id = ?").run(parsed, sender.id);
    db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ?").run(parsed, receiver.id);

    const tx = {
      id: uuidv4(),
      type: "transfer",
      amount: parsed,
      sender_wallet_id: sender.id,
      receiver_wallet_id: receiver.id,
      note: note || null,
    };

    db.prepare(`
      INSERT INTO transactions (id, type, amount, sender_wallet_id, receiver_wallet_id, note)
      VALUES (@id, @type, @amount, @sender_wallet_id, @receiver_wallet_id, @note)
    `).run(tx);

    return tx;
  });

  const tx = transfer();

  const updatedSender = db.prepare("SELECT balance FROM wallets WHERE id = ?").get(sender.id);

  return res.status(201).json({
    message: "Transfer successful.",
    transaction_id: tx.id,
    sender_new_balance: updatedSender.balance,
  });
});

module.exports = router;