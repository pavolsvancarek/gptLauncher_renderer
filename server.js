const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 3000;

const CHROME_PATH = "/opt/render/.cache/puppeteer/chrome/linux-124.0.6367.78/chrome-linux64/chrome";

app.get("/", async (req, res) => {
  try {
    console.log("🚀 Spúšťam Puppeteer...");
    console.log("Používam Chrome:", CHROME_PATH);

    const browser = await puppeteer.launch({
      headless: "new",
      executablePath: CHROME_PATH,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.goto("https://example.com", {
      waitUntil: "domcontentloaded"
    });

    const title = await page.title();

    await browser.close();

    res.json({
      success: true,
      title
    });

  } catch (e) {
    console.log("💥 ERROR:", e.message);
    res.status(500).json({
      error: e.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🔥 Server beží na http://localhost:${PORT}`);
});
