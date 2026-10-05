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
// A+ 訊號 API
let latestSignal = {
  time: null,
  numbers: [],
  level: "WAIT"
};

app.get("/api/signal", (req, res) => {
  res.json(latestSignal);
});

app.post("/api/signal", (req, res) => {
  const { time, numbers, level } = req.body;

  latestSignal = {
    time: time || new Date().toISOString(),
    numbers: Array.isArray(numbers) ? numbers : [],
    level: level || "A+"
  };

  res.json({
    ok: true,
    signal: latestSignal
  });
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
