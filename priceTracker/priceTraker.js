const cheerio = require("cheerio");
const axios = require("axios");
const TrackingProducts = require("../database/TrackingProducts");
const sendEmail = require("./sendEmail");

const getPrice = async (url) => {

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

  const randomDelay = () => new Promise((res) => setTimeout(res, Math.floor(Math.random() * 1000) + 500));

  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": userAgents[Math.floor(Math.random() * userAgents.length)] }
    });

    console.log("data" , data);
    const $ = cheerio.load(data);
    await randomDelay()
    const price = $('#corePrice_feature_div span.a-offscreen').first().text().trim();
    return price || "Price Not Found";
  } catch (error) {
    console.error("Error fetching price:", error.message)
    return "Error";
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