const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const cache = new Map();

let lastGlobalFetch = 0;
const THIRTY_MIN = 30 * 60 * 1000;

let browser = null;
let launching = null;
let activePages = 0;
const MAX_PAGES = 3;

// 🔥 cookies
const cookies = [
  {
    name: "datr",
    value: "IzEfaen3NHcErrXiGQbEP_Ya",
    domain: ".instagram.com",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "None"
  },
  {
    name: "ig_did",
    value: "B9A79067-2CDD-4446-AE1E-116F82D3DAE0",
    domain: ".instagram.com",
    path: "/",
    httpOnly: true,
    secure: true
  },
  {
    name: "mid",
    value: "aR8xIwALAAH8OL0kWU6uuNdEtCNc",
    domain: ".instagram.com",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "None"
  },
  {
    name: "ds_user_id",
    value: "76395667568",
    domain: ".instagram.com",
    path: "/",
    secure: true
  },
  {
    name: "csrftoken",
    value: "Qu6a3bAdJ2tIjfjWzfLTXMwe6wRclfcU",
    domain: ".instagram.com",
    path: "/",
    secure: true
  },
  {
    name: "sessionid",
    value: "76395667568%3Armknwqb6mgX7Hw%3A23%3AAYh2_Ivk_1DSrtugAGr9TtnV52sMHgF_GmfKDGXj-2Mf",
    domain: ".instagram.com",
    path: "/",
    httpOnly: true,
    secure: true
  }
];

app.use((req, res, next) => {
  res.setTimeout(120000);
  next();
});

app.get("/", (req, res) => {
  res.send("OK");
});

function getChromePath() {
  const base = "/opt/render/project/src/.puppeteer/chrome";
  const versions = fs.readdirSync(base);
  const latest = versions[0];
  return `${base}/${latest}/chrome-linux64/chrome`;
}

async function getBrowser() {
  if (browser) return browser;

  if (!launching) {
    launching = puppeteer.launch({
      headless: "new",
      executablePath: getChromePath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled"
      ]
    });
  }

  browser = await launching;

  browser.on("disconnected", () => {
    browser = null;
    launching = null;
  });

  return browser;
}

// 🔥 SCRAPER
async function getFollowers(username) {
  activePages++;

  const browserInstance = await getBrowser();
  const page = await browserInstance.newPage();

  try {
    await page.setCacheEnabled(false);

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => false
      });
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    );

    await page.setViewport({ width: 1280, height: 800 });

    await page.setExtraHTTPHeaders({
      "accept-language": "en-US,en;q=0.9"
    });

    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));

    await page.goto("https://www.instagram.com/", {
      waitUntil: "domcontentloaded"
    });

    await page.setCookie(
      ...cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite:
          c.sameSite === "no_restriction"
            ? "None"
            : c.sameSite === "lax"
            ? "Lax"
            : "Strict"
      }))
    );

    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    const title = await page.title();
    console.log("📌 PAGE TITLE:", title);

    if (title.includes("Login")) {
      throw new Error("BLOCKED BY INSTAGRAM");
    }

    await page.waitForFunction(() => {
      const el = document.querySelector("header span[title]");
      return el && el.getAttribute("title");
    }, { timeout: 10000 });

    const followers = await page.evaluate(() => {
      const el = document.querySelector("header span[title]");
      return el ? el.getAttribute("title") : null;
    });

    return followers;

  } finally {
    activePages--;
    await page.close();
  }
}

// 🔥 API
app.get("/ig/:username", async (req, res) => {
  const username = req.params.username;

  console.log(`\n📥 Request: ${username}`);

  // 🔴 GLOBAL LIMIT
  if (Date.now() - lastGlobalFetch < THIRTY_MIN) {
    console.log("⛔ GLOBAL RATE LIMIT");

    const cached = cache.get(username);
    if (cached) {
      return res.json(cached.data);
    }

    return res.status(429).json({
      error: "Global rate limit (30min)"
    });
  }

  try {
    lastGlobalFetch = Date.now();

    const followersRaw = await getFollowers(username);

    if (!followersRaw) {
      cache.set(username, {
        data: { error: "not_found" },
        time: Date.now()
      });

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

    res.json(result);

  } catch (e) {
    console.log("💥 ERROR:", e.message);

    cache.set(username, {
      data: { error: e.message },
      time: Date.now()
    });

    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🔥 Server beží na http://localhost:${PORT}`);
});
