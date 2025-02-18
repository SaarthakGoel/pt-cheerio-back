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
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/115.0",
]

const randomDelay = () => new Promise((res) => setTimeout(res, Math.floor(Math.random() * 1000) + 500));

app.get("/search", async (req, res) => {
  const query = req.query.query;
  if (!query) return res.status(400).json({ error: "Query is required" });

  console.log("Query:", query);

  try {
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

    const url = `https://www.amazon.in/s?k=${encodeURIComponent(query)}`;

    console.log(`Fetching data with User-Agent : ${userAgent}`);

    await randomDelay();

    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": userAgent,
      }
    });

    const $ = cheerio.load(data);

    const products = [];

    $(".s-card-container").each((index, el) => {
      const name = $(el).find("h2 span").text().trim() || "No Name";
      const priceElement = $(el).find(".a-price-whole").first();
      const price = priceElement.length ? priceElement.text().trim() : "No Price";
      const image = $(el).find(".s-image").attr("src") || "";
      let link = $(el).find(".s-link-style").attr("href") || "#";

      if (link.startsWith("/")) {
        link = `https://www.amazon.in${link}`;
      }

      products.push({ name, price, image, link });
    })

    await randomDelay();

    res.json({ products });
  } catch (error) {
    console.error("Error scraping Amazon:", error.message);
    res.status(500).json({ error: "Failed to fetch products" });
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