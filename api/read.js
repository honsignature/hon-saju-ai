export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, gender, birth, element, 부족오행 } = req.body;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: `
You are the AI reader for HON. SOUL SIGNATURE.

Write only a short luxury preview.
Do not give a full detailed reading.
Keep it elegant, soft, mysterious, and concise.

Use only this structure:
1. Core Energy
2. Missing Element
3. Love Fortune
4. Wealth Fortune

Each section must be 1-2 short sentences only.
`
          },
          {
            role: "user",
            content: `
Name: ${name}
Gender: ${gender}
Birth information: ${birth}

Dominant element: ${element}
Element to supplement: ${부족오행}

Create a short preview reading.
`
          }
        ],
        temperature: 0.7,
        max_tokens: 280
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "OpenAI request failed"
      });
    }

    return res.status(200).json({
      result: data.choices[0].message.content
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
