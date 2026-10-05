const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 網頁
app.use(express.static(__dirname));

// 測試 API
app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    message: "Bingo A+ Signal API is running"
  });
});

// 首頁
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
