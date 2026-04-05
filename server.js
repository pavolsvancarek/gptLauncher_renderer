const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const cache = new Map();

let browser = null;
let launching = null;
let activePages = 0;
const MAX_PAGES = 3;

// timeout
app.use((req, res, next) => {
  res.setTimeout(120000);
  next();
});

app.get("/", (req, res) => {
  res.send("OK");
});


// 🔥 Chrome path (Render fix)
function getChromePath() {
  const base = "/opt/render/project/src/.puppeteer/chrome";

  const versions = fs.readdirSync(base);
  const latest = versions[0];

  const fullPath = `${base}/${latest}/chrome-linux64/chrome`;

  console.log("✅ Chrome path:", fullPath);

  return fullPath;
}


// 🔥 Browser init
async function getBrowser() {
  if (browser) return browser;

  if (!launching) {
    console.log("🚀 Spúšťam Puppeteer...");

    launching = puppeteer.launch({
      headless: "new",
      executablePath: getChromePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
  }

  browser = await launching;

  browser.on("disconnected", () => {
    console.log("💥 Browser spadol, resetujem...");
    browser = null;
    launching = null;
  });

  console.log("✅ Puppeteer pripravený");

  return browser;
}


// 🔥 Scraper
async function getFollowers(username) {
  if (activePages >= MAX_PAGES) {
    throw new Error("Server busy");
  }

  activePages++;

  const browserInstance = await getBrowser();
  const page = await browserInstance.newPage();

  try {
    await page.setCacheEnabled(false);

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    );

    await page.setViewport({ width: 1280, height: 800 });

    await page.setExtraHTTPHeaders({
      "accept-language": "en-US,en;q=0.9"
    });

    for (let i = 0; i < 3; i++) {
      try {
        console.log(`🌐 Pokus ${i + 1}`);

        await page.goto(`https://www.instagram.com/${username}/`, {
          waitUntil: "networkidle2",
          timeout: 30000
        });
        const html = await page.content();
        
        if (html.includes("login")) {
          console.log("🔒 IG chce login");
        }
        
        if (html.includes("Please wait")) {
          console.log("⏳ IG rate limit / block");
        }
        
        if (html.includes("challenge")) {
          console.log("⚠️ IG challenge page");
        }
        
        console.log("📄 HTML length:", html.length);
        
        // uloz si to
        fs.writeFileSync(`debug-${username}.html`, html);
        await page.waitForSelector("span[title]", { timeout: 8000 });
        
        const title = await page.title();
        console.log("📌 PAGE TITLE:", title);
        
        const followers = await page.evaluate(() => {
          const el = document.querySelector("header span[title]");
          if (el) return el.getAttribute("title");
        
          const spans = Array.from(document.querySelectorAll("span"));
          for (const s of spans) {
            if (s.innerText && /\d/.test(s.innerText)) {
              return s.innerText;
            }
          }
        
          return null;
        });

        const debug = await page.evaluate(() => {
          const titles = Array.from(document.querySelectorAll("span[title]"))
            .map(el => el.getAttribute("title"));
        
          return {
            titleSpans: titles.slice(0, 5),
            bodyText: document.body.innerText.slice(0, 500)
          };
        });
        
        console.log("🔍 DEBUG:", debug);

        if (followers) return followers;

      } catch (e) {
        console.log("⚠️ retry...");
      }
    }

    return null;

  } finally {
    activePages--;
    await page.close();
  }
}


// 🔥 API route
app.get("/ig/:username", async (req, res) => {
  const start = Date.now();
  const username = req.params.username;

  console.log(`\n📥 Request: ${username}`);

  const cached = cache.get(username);
  if (cached && Date.now() - cached.time < 60000) {
    console.log("⚡ CACHE HIT");
    return res.json(cached.data);
  }

  console.log("🐢 CACHE MISS");

  try {
    const followersRaw = await getFollowers(username);

    if (!followersRaw) {
      return res.status(500).json({ error: "Followers not found" });
    }

    const clean = followersRaw.replace(/\D/g, "");

    const result = {
      username,
      followers: parseInt(clean)
    };

    cache.set(username, {
      data: result,
      time: Date.now()
    });

    console.log(`✅ SUCCESS: ${clean}`);
    console.log(`⏱️ Time: ${Date.now() - start} ms`);

    res.json(result);

  } catch (e) {
    console.log("💥 ERROR:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🔥 Server beží na http://localhost:${PORT}`);
});
