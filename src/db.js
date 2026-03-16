const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "wallet.db");

const db = new DatabaseSync(DB_PATH);

db.exec(`PRAGMA journal_mode = WAL`);
db.exec(`PRAGMA foreign_keys = ON`);


db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    balance     REAL NOT NULL DEFAULT 0.00,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id                  TEXT PRIMARY KEY,
    type                TEXT NOT NULL CHECK(type IN ('deposit', 'transfer')),
    amount              REAL NOT NULL,
    sender_wallet_id    TEXT REFERENCES wallets(id),
    receiver_wallet_id  TEXT NOT NULL REFERENCES wallets(id),
    note                TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tx_sender   ON transactions(sender_wallet_id);
  CREATE INDEX IF NOT EXISTS idx_tx_receiver ON transactions(receiver_wallet_id);
`);

module.exports = db;
