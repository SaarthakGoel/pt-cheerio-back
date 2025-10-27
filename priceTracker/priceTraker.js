const cheerio = require("cheerio");
const axios = require("axios");
const TrackingProducts = require("../database/TrackingProducts");
const sendEmail = require("./sendEmail");

const getPrice = async (url) => {

  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/115.0",
  ]

  const randomDelay = () => new Promise((res) => setTimeout(res, Math.floor(Math.random() * 1000) + 500));

  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": userAgents[Math.floor(Math.random() * userAgents.length)] }
    });
    const $ = cheerio.load(data);
    await randomDelay()
    const price = $("#priceblock_ourprice").text().trim() || $(".a-price-whole").first().text().trim();
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