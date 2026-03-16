const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");

const router = express.Router();

router.post("/", (req, res) => {
  const { sender_wallet_id, receiver_wallet_id, amount, note } = req.body;

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

  const sender = db.prepare("SELECT * FROM wallets WHERE id = ?").get(sender_wallet_id);
  if (!sender) return res.status(404).json({ error: "Sender wallet not found." });

  const receiver = db.prepare("SELECT * FROM wallets WHERE id = ?").get(receiver_wallet_id);
  if (!receiver) return res.status(404).json({ error: "Receiver wallet not found." });

  if (sender.balance < parsed) {
    return res.status(422).json({
      error: "Insufficient balance.",
      available: sender.balance,
      requested: parsed,
    });
  }

  const txId = uuidv4();

  db.exec("BEGIN");
  try {
    db.prepare("UPDATE wallets SET balance = balance - ? WHERE id = ?").run(parsed, sender.id);
    db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ?").run(parsed, receiver.id);
    db.prepare(`
      INSERT INTO transactions (id, type, amount, sender_wallet_id, receiver_wallet_id, note)
      VALUES (?, 'transfer', ?, ?, ?, ?)
    `).run(txId, parsed, sender.id, receiver.id, note || null);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }

  const updatedSender = db.prepare("SELECT balance FROM wallets WHERE id = ?").get(sender.id);

  return res.status(201).json({
    message: "Transfer successful.",
    transaction_id: txId,
    sender_new_balance: updatedSender.balance,
  });
});

module.exports = router;