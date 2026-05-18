export default async function handler(req, res) {
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
너는 HON. SOUL SIGNATURE의 AI 명리 리더다.

항상 짧고 고급스럽게 작성한다.
절대 길게 쓰지 마라.
과도한 해석 금지.

반드시 아래 구조만 사용:
1. Core Energy
2. Missing Element
3. Love Fortune
4. Wealth Fortune

각 항목은 2문장 이내.
`
          },
          {
            role: "user",
            content: `
이름: ${name}
성별: ${gender}
생년월일: ${birth}

강한 오행: ${element}
부족한 오행: ${부족오행}

간단한 리딩 작성.
`
          }
        ],
        temperature: 0.8,
        max_tokens: 300
      })
    });

    const data = await response.json();

    res.status(200).json({
      result: data.choices[0].message.content
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
}