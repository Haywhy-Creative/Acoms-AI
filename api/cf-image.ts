export async function POST(request: Request): Promise<Response> {
try {
const accountId = process.env.CF_ACCOUNT_ID;
const apiToken = process.env.CF_AI_TOKEN;

if (!accountId || !apiToken) {
  return new Response(
    JSON.stringify({ error: "Missing Cloudflare credentials" }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}

const body = await request.json();
const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

if (!prompt) {
  return new Response(
    JSON.stringify({ error: "Prompt is required" }),
    { status: 400, headers: { "Content-Type": "application/json" } }
  );
}

const model =
  typeof body?.model === "string" && body.model.trim()
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

i







f (!cfResponse.ok) {
  const errText = await cfResponse.text();
  return new Response(
    JSON.stringify({ error: "Cloudflare AI request failed", details: errText }),
    { status: cfResponse.status, headers: { "Content-Type": "application/json" } }
 




 );
}

const contentType = cfResponse.headers.get("content-type") || "";
if (contentType.includes("application/json")) {
 




 const jsonData = await cfResponse.json();
  const base64Image = jsonData?.result?.image;
  if (base64Image) {
    const bi


nary = Uint8Array.from(atob(base64Image), (c) => c.charCodeAt(0));
    return new Response(binary, {
      status: 200,
 


     headers: { "Content-Type": "image/png" },
    });
  }
 


 return new Response(JSON.stringify(jsonData), {
    status: 200,
    headers: { "Content-Type": "application/json" },
 


 });
}

c


onst imageBuffer = await cfResponse.arrayBuffer();
return new Response(imageBuffer, {
  status: 200,
 


 headers: { "Content-Type": contentType || "image/png" },
});
} catch (error) {
r


eturn new Response(
  JSON.stringify({
    error: "Failed to generate image",
 


   message: error instanceof Error ? error.message : "Unknown error",
  }),
 

 { status: 500, headers: { "Content-Type": "application/json" } }
);
}


}