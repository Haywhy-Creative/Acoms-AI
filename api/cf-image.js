export default async function handler(req, res) {
if (req.method !== "POST") {
return res.status(405).json({ error: "Method not allowed" });
}

try {
const accountId = process.env.CF_ACCOUNT_ID || process.env.VITE_CF_ACCOUNT_ID;
const apiToken = process.env.CF_AI_TOKEN;

if (!accountId || !apiToken) {
  return res.status(500).json({ error: "Missing Cloudflare credentials" });
}

const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

if (!prompt) {
  return res.status(400).json({ error: "Prompt is required" });
}

const model =
  typeof body.model === "string" && body.model.trim()
    ? body.model.trim()
    : "@cf/black-forest-labs/flux-1-schnell";

const cfResponse = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
  {
    method: "POST",
    headers: {
 

     Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  }
);







if (!cfResponse.ok) {
  const errText = await cfResponse.text();
  return res.status(cfResponse.status).json({
    error: "Cloudflare AI request failed",
   




 details: errText,
  });
}

c



onst contentType = cfResponse.headers.get("content-type") || "";
if (contentType.includes("application/json")) {
  const jsonData = await cfResponse.json();
 


 const base64Image = jsonData?.result?.image;
  if (base64Image) {
    const buffer = Buffer.from(base64Image, "base64");
 


   res.setHeader("Content-Type", "image/png");
    return res.status(200).send(buffer);
  }
 


 return res.status(200).json(jsonData);
}

c


onst arrayBuffer = await cfResponse.arrayBuffer();
res.setHeader("Content-Type", contentType || "image/png");
r

eturn res.status(200).send(Buffer.from(arrayBuffer));
} catch (error) {
re

turn res.status(500).json({
  error: "Failed to generate image",
 

 message: error instanceof Error ? error.message : "Unknown error",
});
}
}


