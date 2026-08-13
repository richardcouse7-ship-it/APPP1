import fetch from "node-fetch";

async function run() {
  const res = await fetch("http://localhost:3000/api/enrich-single", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "123",
      companyName: "Deacy Gilligan Ltd",
      county: "Galway",
      modelName: "gemini-3.5-flash",
      forceRefresh: true
    })
  });
  console.log(res.status);
  console.log(await res.text());
}
run();
