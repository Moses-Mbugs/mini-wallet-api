const express = require("express");
const app = express();

app.use(express.json());

app.use("/wallets", require("./routes/wallets"));
app.use("/transfers", require("./routes/transfers"));

app.get("/health", (_req, res) => res.json({ status: "ok" }));


app.use((_req, res) => res.status(404).json({ error: "Route not found." }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Mini Wallet API running on port ${PORT}`));

module.exports = app;