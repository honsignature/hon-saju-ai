export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, gender, birthDate, birthTime, birthPlace } = req.body;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a precise Korean Saju (Four Pillars of Destiny) master with deep knowledge of 명리학 (Myeongrihak).

Your task is to analyze the user's Saju and return a structured reading in English.

Follow these exact steps:
1. Convert the birth date to the Korean lunar calendar and calculate the Four Pillars (년주/월주/일주/시주) with their Heavenly Stems (천간) and Earthly Branches (지지).
2. Calculate the five elements (오행) distribution as percentages: Wood(木), Fire(火), Earth(土), Metal(金), Water(水). Total must equal 100%.
3. Identify the dominant element and the deficient element.
4. Recommend colors associated with the deficient element.
5. Write a concise overall fortune reading (총운).
6. Write brief love fortune and wealth fortune.

Output format (strictly follow this):
---
FOUR PILLARS: [년주] [월주] [일주] [시주]

ELEMENT DISTRIBUTION:
Wood (木): X%
Fire (火): X%
Earth (土): X%
Metal (金): X%
Water (水): X%

MY ELEMENT: [dominant element in English and Korean, e.g. Fire 火]

ELEMENT TO SUPPLEMENT: [deficient element in English and Korean]

COLORS TO CARRY: [2-3 specific colors with hex codes]

OVERALL FORTUNE:
[2-3 sentences]

LOVE FORTUNE:
[1-2 sentences]

WEALTH FORTUNE:
[1-2 sentences]
---

Be precise and consistent. Same birth data must always produce the same result. Do not be poetic or vague.`
          },
          {
            role: "user",
            content: `Name: ${name}
Gender: ${gender}
Birth Date: ${birthDate}
Birth Time: ${birthTime || "Unknown"}
Birth Place: ${birthPlace || "Korea"}

Please provide a precise Saju analysis.`
          }
        ],
        temperature: 0.1,
        max_tokens: 600
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || "OpenAI request failed" });

    return res.status(200).json({ result: data.choices[0].message.content });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
