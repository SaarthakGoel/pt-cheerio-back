const cheerio = require("cheerio");
const axios = require("axios");
const TrackingProducts = require("../database/TrackingProducts");
const sendEmail = require("./sendEmail");

const userAgents = [
    // Expanded list for better rotation
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
];

// Increased delay range to mimic human interaction better (1.0s to 2.5s)
const randomDelay = () => new Promise((res) => setTimeout(res, Math.floor(Math.random() * 1500) + 1000));

const getPrice = async (url) => {
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

    try {
        // Delay BEFORE fetching to mimic human navigation time
        await randomDelay();

        // 1. ROBUST HEADERS: Essential for bypassing anti-bot measures
        const headers = {
            "User-Agent": userAgent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1"
        };

        const { data } = await axios.get(url, { headers });
        const $ = cheerio.load(data);
        
        // 2. CRUCIAL BLOCK CHECK: Detect if Amazon returned a Captcha/Block Page (HTML)
        if ($('title').text().includes('Captcha') || $('title').text().includes('Sorry')) {
            const errorMsg = "Scraping Blocked by Amazon. Received Captcha/Block Page.";
            console.error("Error fetching price:", errorMsg);
            // Throw a specific error for the caller to handle
            throw new Error(errorMsg); 
        }

        // 3. UPDATED SELECTORS: Targeting current, reliable Amazon price elements

        // Selector 1: Most common current price block for new items
        let price = $('#corePrice_feature_div .a-price-whole').first().text().trim();
        
        // Selector 2: Targets the 'offscreen' span which often holds the clean price value
        if (!price) {
            price = $('.a-price .a-offscreen').first().text().trim();
        }
        
        // Selector 3: Fallback for price inside the buy box (used, etc.)
        if (!price) {
            price = $('#price_inside_buybox').text().trim();
        }
        
        // Selector 4: Older selector (kept as a final attempt)
        if (!price) {
            price = $("#priceblock_ourprice").text().trim(); 
        }

        return price || "Price Not Found";

    } catch (error) {
        // Return a descriptive string or re-throw the error
        console.error("Error fetching price:", error.message);
        // Distinguish between a block and a generic network error
        return error.message.includes('Blocked') ? "Blocked" : "Error";
    }
};

const trackProduct = async (name, price, link, email) => {

  const match = link.match(/\/dp\/(B[A-Z0-9]+)/);
  if (!match) return "Invalid Amazon URL";

  const id = process.env.AMAZONTRACKINGID;

  const productId = match[1];
  const affiliateLink = `https://www.amazon.in/dp/${productId}?tag=${id}`;


  const Product = {
    name: name,
    price: price,
    link: link,
    affiliateLink: affiliateLink,
    email: email
  }

  const doc = await TrackingProducts.create(Product);

  if (doc) {
    console.log(`Tracking product ${doc}`);
  } else {
    console.log("Error in creating document");
  }
  //test();
}

async function test() {

  try {
    console.log("Checking price updates...")
    const productsDB = await TrackingProducts.find();
    console.log(productsDB);

    productsDB.map(async (product) => {

      const { name, price, link, affiliateLink, email } = product;
      const currentPrice = 1;

      console.log(`Checking ${email}'s product: ${currentPrice}`);

      if (0 < Number(price.replace(",", ""))) {
        console.log(`Price dropped for ${email}`);

        await sendEmail(email, name, affiliateLink, currentPrice);
      };
    });
  } catch (err) {
    console.log("error", err);
  }

}


module.exports = { trackProduct, getPrice };