/**
 * HON. Soul Signature — 사주 자동화 Webhook v4
 * Shopify 주문 완료 → Claude API 사주 생성 → Resend 이메일 발송
 */

const crypto = require("crypto");

const ANTHROPIC_API_KEY      = process.env.ANTHROPIC_API_KEY;
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
const SHOPIFY_ADMIN_TOKEN    = process.env.SHOPIFY_ADMIN_TOKEN;
const SHOPIFY_SHOP_DOMAIN    = process.env.SHOPIFY_SHOP_DOMAIN;
const FROM_EMAIL             = process.env.SHOPIFY_FROM_EMAIL;
const RESEND_API_KEY         = process.env.RESEND_API_KEY;

function verifyWebhook(body, hmacHeader) {
  if (!SHOPIFY_WEBHOOK_SECRET) return true;
  try {
    const digest = crypto.createHmac("sha256", SHOPIFY_WEBHOOK_SECRET).update(body, "utf8").digest("base64");
    return digest === hmacHeader;
  } catch (e) {
    return true;
  }
}

function extractSajuInfo(order) {
  const noteAttrs = order.note_attributes || [];
  const get = (key) => {
    const attr = noteAttrs.find((a) => a.name === key || a.name.toLowerCase().includes(key.toLowerCase()));
    return attr ? attr.value : null;
  };
  return {
    customerName: order.billing_address?.first_name || order.customer?.first_name || "Guest",
    email:        order.email || order.customer?.email,
    birthDate:    get("Your_Date_of_Birth"),
    birthTime:    get("Your_Birth_Hour"),
    gender:       get("Your_Gender"),
    orderNumber:  order.order_number || order.name,
    orderId:      order.id,
  };
}

async function generateSaju(info) {
  const prompt = `You are a master of Korean Saju (Four Pillars of Destiny), a profound ancient system of astrology refined over thousands of years. Your task is to create a premium, deeply insightful Soul Reading Report for a client.

Client Information:
- Name: ${info.customerName}
- Date of Birth: ${info.birthDate}
- Hour of Birth: ${info.birthTime || "Not provided"}
- Gender: ${info.gender || "Not provided"}

Write a premium Soul Signature Report in English with the following sections. Be specific, poetic, deeply insightful, and use elegant language befitting a luxury brand. Each section should be at least 3-4 sentences. Do NOT use markdown symbols like **, ##, or *. Use plain text with section titles in ALL CAPS followed by a colon.

SOUL ESSENCE:
A poetic, powerful opening that captures the essence of this person's cosmic energy and soul signature. Make it feel personal and profound.

THE FOUR PILLARS:
Describe the Year, Month, Day, and Hour pillars based on the birth information. Explain the elemental forces at play (Wood, Fire, Earth, Metal, Water) and their interactions. Be specific and detailed.

INNATE CHARACTER AND GIFTS:
Describe their core personality, natural talents, and innate gifts revealed by their chart. Be specific and affirming.

LIFE PATH AND DESTINY:
Their greater purpose, karmic lessons, and the arc of their life journey as revealed in the Four Pillars.

WEALTH AND CAREER:
Specific insights into their relationship with wealth, ideal career paths, and how to maximize their professional potential.

LOVE AND RELATIONSHIPS:
Their approach to love, ideal partnerships, relationship patterns, and advice for deeper connection.

HEALTH AND VITALITY:
Areas to nurture for optimal health based on their elemental balance, with practical wisdom.

2026 COSMIC FORECAST:
Specific insights and guidance for the year 2026 — opportunities, challenges, and auspicious timing.

SOUL GUIDANCE:
A closing message of wisdom, affirmation, and guidance for their journey ahead. Make it feel like a blessing.

Write with the authority of a master, the warmth of a mentor, and the poetry of an artist. This is a premium luxury experience.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      messages:   [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

function formatSajuText(text) {
  // 섹션 제목 감지해서 HTML로 변환
  const sections = text.split(/\n(?=[A-Z\s]+:)/);
  return sections.map(section => {
    const colonIndex = section.indexOf(':');
    if (colonIndex > 0 && colonIndex < 60) {
      const title = section.substring(0, colonIndex).trim();
      const content = section.substring(colonIndex + 1).trim();
      if (title === title.toUpperCase() && title.length > 3) {
        return `<div style="margin-bottom:28px;">
          <h3 style="margin:0 0 10px;color:#c9a96e;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:Georgia,serif;">${title}</h3>
          <p style="margin:0;color:#2c2c2c;font-size:15px;line-height:1.9;font-family:Georgia,serif;">${content.replace(/\n/g, '<br>')}</p>
        </div>`;
      }
    }
    return `<p style="margin:0 0 16px;color:#2c2c2c;font-size:15px;line-height:1.9;font-family:Georgia,serif;">${section.replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

async function sendEmailViaResend(info, sajuText) {
  const formattedContent = formatSajuText(sajuText);
  
  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Soul Signature Report — HON.</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:Georgia,serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;padding:48px 0;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:2px;overflow:hidden;box-shadow:0 4px 40px rgba(0,0,0,0.12);">

  <!-- Header -->
  <tr><td style="background:#0e0e0e;padding:52px 60px 44px;text-align:center;">
    <p style="margin:0 0 8px;color:#c9a96e;font-size:10px;letter-spacing:5px;font-family:Arial,sans-serif;text-transform:uppercase;">H O N .</p>
    <p style="margin:0 0 24px;color:#c9a96e;font-size:9px;letter-spacing:3px;font-family:Arial,sans-serif;text-transform:uppercase;">Soul Signature</p>
    <div style="width:40px;height:1px;background:#c9a96e;margin:0 auto 24px;"></div>
    <h1 style="margin:0;color:#f5f3ef;font-size:28px;font-weight:400;letter-spacing:2px;font-family:Georgia,serif;line-height:1.4;">Your Soul Reading</h1>
    <p style="margin:12px 0 0;color:#888;font-size:12px;letter-spacing:2px;font-family:Arial,sans-serif;">A Personal Cosmic Report</p>
  </td></tr>

  <!-- Greeting -->
  <tr><td style="padding:48px 60px 0;">
    <p style="margin:0 0 8px;color:#c9a96e;font-size:10px;letter-spacing:3px;font-family:Arial,sans-serif;text-transform:uppercase;">Prepared for</p>
    <h2 style="margin:0 0 24px;color:#0e0e0e;font-size:24px;font-weight:400;font-family:Georgia,serif;">${info.customerName}</h2>
    <p style="margin:0 0 8px;color:#666;font-size:13px;line-height:1.8;font-family:Arial,sans-serif;">Date of Birth: ${info.birthDate}</p>
    <p style="margin:0 0 8px;color:#666;font-size:13px;line-height:1.8;font-family:Arial,sans-serif;">Hour of Birth: ${info.birthTime || "Not provided"}</p>
    <p style="margin:0;color:#666;font-size:13px;line-height:1.8;font-family:Arial,sans-serif;">Order: #${info.orderNumber}</p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:36px 60px;">
    <div style="border-top:1px solid #e8e4dc;"></div>
  </td></tr>

  <!-- Intro -->
  <tr><td style="padding:0 60px 36px;">
    <p style="margin:0;color:#555;font-size:14px;line-height:1.9;font-family:Georgia,serif;font-style:italic;">
      The ancient Korean art of Saju — the Four Pillars of Destiny — holds within it the cosmic blueprint of your soul. What follows is a deeply personal reading, drawn from the exact moment of your birth and the elemental forces that shaped your arrival into this world.
    </p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:0 60px 36px;">
    <div style="border-top:1px solid #e8e4dc;"></div>
  </td></tr>

  <!-- Report Content -->
  <tr><td style="padding:0 60px 48px;">
    ${formattedContent}
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:0 60px 0;">
    <div style="border-top:1px solid #e8e4dc;"></div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#0e0e0e;padding:40px 60px;text-align:center;">
    <p style="margin:0 0 8px;color:#c9a96e;font-size:10px;letter-spacing:4px;font-family:Arial,sans-serif;text-transform:uppercase;">H O N .  S O U L  S I G N A T U R E</p>
    <p style="margin:8px 0;color:#555;font-size:11px;font-family:Arial,sans-serif;letter-spacing:1px;">K-Heritage of Soul · Crafted by Time · Sealed in Korea</p>
    <div style="width:30px;height:1px;background:#c9a96e;margin:16px auto;"></div>
    <p style="margin:0;color:#444;font-size:11px;font-family:Arial,sans-serif;">If you have any questions, contact us at <a href="mailto:${FROM_EMAIL}" style="color:#c9a96e;text-decoration:none;">${FROM_EMAIL}</a></p>
    <p style="margin:8px 0 0;color:#333;font-size:10px;font-family:Arial,sans-serif;">This report is for personal use only. Unauthorized reproduction is strictly prohibited.</p>
  </td></tr>

</table>
</td></tr>
</table>

</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:    `HON. Soul Signature <${FROM_EMAIL}>`,
      to:      [info.email],
      subject: `✦ ${info.customerName}, Your Soul Signature Report is Ready — HON.`,
      html:    htmlBody,
    }),
  });

  const result = await res.json();
  if (!res.ok) {
    console.error("Resend error:", JSON.stringify(result));
    throw new Error(`Email failed: ${JSON.stringify(result)}`);
  }
  console.log("Email sent:", info.email, result.id);
  return result;
}

exports.handler = async (event) => {
  console.log("Webhook received! Method:", event.httpMethod);

  if (event.httpMethod === "GET") {
    return { statusCode: 200, body: JSON.stringify({ status: "ok", message: "HON. Saju Webhook active ✦" }) };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const hmac = event.headers["x-shopify-hmac-sha256"];
    verifyWebhook(event.body, hmac);

    const order = JSON.parse(event.body);
    console.log("Order received:", order.order_number);

    const info = extractSajuInfo(order);
    console.log("Saju info:", JSON.stringify(info));

    if (!info.email || !info.birthDate) {
      console.log("Missing info — skipping");
      return { statusCode: 200, body: "Skipped" };
    }

    console.log("Generating saju report...");
    const sajuText = await generateSaju(info);
    console.log("Report generated, length:", sajuText.length);

    await sendEmailViaResend(info, sajuText);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, order: info.orderNumber }),
    };

  } catch (err) {
    console.error("Error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
