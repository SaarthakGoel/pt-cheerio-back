require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { trackProduct, getPrice } = require("./priceTracker/priceTraker");
const { default: mongoose } = require("mongoose");
const TrackingProducts = require("./database/TrackingProducts");
const sendEmail = require("./priceTracker/sendEmail");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3500;

app.use(cors());
app.use(express.json());

const userAgents = [
    // Chrome on Windows 10/11 (High-traffic, recommended)
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',

    // Firefox on Windows 10/11
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
    'Mozilla/5.0 (Windows NT 11.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',

    // Chrome on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',

    // Safari on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',

    // Edge on Windows 10/11 (Chromium-based)
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.2458.0',

    // Mobile Chrome on Android (High-traffic mobile agent)
    'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
    
    // Mobile Safari on iPhone (iOS)
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
];


const randomDelay = () => new Promise(res => setTimeout(res, Math.floor(Math.random() * 4000) + 2000));

function cleanProductLink(relativeLink, $, el) {
    let link = relativeLink;

    if (link.startsWith('/')) {
        link = `https://amazon.in${link}`;
    }

    // 1. Check and process SPONSORED/tracking links
    if (link.includes('/sspa/click')) {
        try {
            // URLSearchParams is now robustly available in modern Node versions
            // We split the link to get only the query part for URLSearchParams
            const queryString = link.split('?')[1];
            const urlParams = new URLSearchParams(queryString);
            const encodedUrl = urlParams.get('url');

            if (encodedUrl) {
                // Decode the URL (replaces %2F with / etc.)
                link = decodeURIComponent(encodedUrl);
            }
        } catch (e) {
            console.error("Error processing sponsored link:", e.message);
            // Link falls back to original tracking link if decoding fails
        }
    }

    // 2. Clean the link to only keep the base product page (up to the ASIN)
    // The structure is typically: /PRODUCT_NAME/dp/ASIN/ref=...
    const asinMatch = link.match(/\/dp\/([A-Z0-9]{10})/);

    if (asinMatch && asinMatch[1]) {
        const asin = asinMatch[1];
        // Reconstruct the clean, absolute link using the ASIN
        link = `https://amazon.in/dp/${asin}`;
    }

    // 3. Fallback to the image link if the title link was useless (e.g., just "#")
    if (link === '#' || !asinMatch) {
        let imageLink = $(el).find('.s-product-image-container a.a-link-normal').attr('href');
        if (imageLink) {
            const fallbackAsinMatch = imageLink.match(/\/dp\/([A-Z0-9]{10})/);
            if (fallbackAsinMatch && fallbackAsinMatch[1]) {
                link = `https://amazon.in/dp/${fallbackAsinMatch[1]}`;
            }
        }
    }
    
    return link;
}


app.get("/search", async (req, res) => {
    const query = req.query.query;
    if (!query) return res.status(400).json({ error: "Query is required" });

    console.log("Query:", query);

    try {
        const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        const url = `https://www.amazon.in/s?k=${encodeURIComponent(query)}`;

        console.log(`Fetching data from ${url} with User-Agent: ${userAgent}`);

        await randomDelay(); // Delay before the actual fetch

        // 1. ROBUST HEADERS: Added necessary headers to avoid immediate blocking
        const headers = {
            "User-Agent": userAgent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1"
        };
        
        // 2. FETCH DATA
        const { data } = await axios.get(url, { headers });

        const $ = cheerio.load(data);
        const products = [];

        // 3. CRUCIAL BLOCK CHECK: Prevents the client from crashing on HTML response
        if ($('title').text().includes('Captcha') || $('title').text().includes('Sorry')) {
            console.warn("!! BLOCKED BY AMAZON !! - HTML block page returned.");
            // Return a JSON error to the client with a 403 status
            return res.status(403).json({ error: "Scraping Blocked by Amazon. Try again later or change IP." });
        }


        $(".s-card-container").each((index, el) => {
            const name = $(el).find("h2 span").text().trim() || "No Name";
            const priceElement = $(el).find(".a-price-whole").first();
            const price = priceElement.length ? priceElement.text().trim() : "No Price";
            const image = $(el).find(".s-image").attr("src") || "";

            // Use the new cleaning function
            const rawLink = $(el).find('h2').parent('a').attr('href') || '#';
            const link = cleanProductLink(rawLink, $, el);

            products.push({ name, price, image, link });
        });
        
        // Removed the unnecessary second await randomDelay() here

        res.json({ products });
    } catch (error) {
        // This catch block handles network/server errors (e.g., connection timed out)
        console.error("Error scraping Amazon:", error.message);
        res.status(500).json({ error: "Failed to fetch products due to a server or network issue." });
    }
});

app.post("/track", (req, res) => {
  const { name, price, link, email } = req.body;
  if (!price || !link || !email) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  trackProduct(name, price, link, email);
  res.json({ message: "Tracking started!", name });
})

app.get("/check-prices", async (req, res) => {
  console.log("Checking price updates...")
  const productsDB = await TrackingProducts.find();

  if (!productsDB.length) {
    return res.json({ success: true, message: "No products to check." });
  }

  try {
    await Promise.all(
      productsDB?.length > 0 && productsDB.map(async (product) => {
        const { name, price, link, affiliateLink, email } = product;
        const currentPrice = await getPrice(link);

        console.log(`Checking ${email}'s product: ${currentPrice}`);

        if (Number(currentPrice.replace(",", "")) < Number(price.replace(",", ""))) {
          console.log(`Price dropped for ${email}`);

          await sendEmail(email, name, affiliateLink, currentPrice);
        };
      })
    )
    res.json({ success: true, message: "Price check completed" });
  } catch (err) {
    console.error("Error checking prices:", err.message);
    res.status(500).json({ success: false, message: "Error checking prices" });
  }
});

app.get("/revive", (req, res) => {
  console.log("I am Alive");
  res.sendStatus(200);
})

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

mongoose.connect(process.env.MONGO_URI).then(() => console.log("Connected to database")).catch((err) => console.log(err));