import fetch from "node-fetch";

async function run() {
  const websiteUrl = "https://www.hammybros.ie/";
  console.log("Scraping URL:", websiteUrl);
  try {
      const response = await fetch(websiteUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      });
      console.log("Response status:", response.status, response.statusText);
      const text = await response.text();
      console.log("Length:", text.length);
  } catch(e) {
      console.log("Error:", e.message);
  }
}
run();
