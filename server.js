const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

function getChromePath() {
  const base = ".puppeteer/chrome";

  if (!fs.existsSync(base)) {
    throw new Error("❌ Chrome folder neexistuje v projekte");
  }

  const versions = fs.readdirSync(base);
  const latest = versions[0];

  const fullPath = `${base}/${latest}/chrome-linux64/chrome`;

  console.log("✅ Chrome path:", fullPath);

  
  return fullPath;
}

app.get("/", async (req, res) => {
  try {
    const browser = await puppeteer.launch({
      headless: "new",
      executablePath: getChromePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.goto("https://example.com", {
      waitUntil: "domcontentloaded"
    });

    const title = await page.title();

    await browser.close();

    res.json({ success: true, title });

  } catch (e) {
    console.log("💥 ERROR:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🔥 Server beží na http://localhost:${PORT}`);
});
