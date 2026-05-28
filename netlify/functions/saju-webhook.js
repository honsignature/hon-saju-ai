/**
 * HON. Soul Signature — 사주 자동화 Webhook v5
 * 핵심 수정: 즉시 200 응답 + 중복 방지 + Sonnet 모델 + 음력변환
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
    calendar:     get("Your_Calendar") || "solar",
    orderNumber:  order.order_number || order.name,
    orderId:      order.id,
    tags:         order.tags || "",
  };
}

// 중복 방지: 주문 태그 확인
async function isAlreadyProcessed(orderId) {
  const shop  = SHOPIFY_SHOP_DOMAIN;
  const token = SHOPIFY_ADMIN_TOKEN;
  
  const res = await fetch(`https://${shop}/admin/api/2024-01/orders/${orderId}.json?fields=tags`, {
    headers: { "X-Shopify-Access-Token": token },
  });
  
  if (!res.ok) return false;
  const data = await res.json();
  return (data.order?.tags || "").includes("saju-sent");
}

// 처리 완료 태그 추가
async function markAsProcessed(orderId) {
  const shop  = SHOPIFY_SHOP_DOMAIN;
  const token = SHOPIFY_ADMIN_TOKEN;
  
  // 현재 태그 가져오기
  const res = await fetch(`https://${shop}/admin/api/2024-01/orders/${orderId}.json?fields=tags`, {
    headers: { "X-Shopify-Access-Token": token },
  });
  const data = await res.json();
  const currentTags = data.order?.tags || "";
  const newTags = currentTags ? `${currentTags}, saju-sent` : "saju-sent";

  await fetch(`https://${shop}/admin/api/2024-01/orders/${orderId}.json`, {
    method: "PUT",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ order: { id: orderId, tags: newTags } }),
  });
}

async function generateSaju(info) {
  const calendarNote = info.calendar && info.calendar.toLowerCase().includes("lunar") 
    ? "Note: The birth date provided is in the LUNAR calendar. Please account for this in your Four Pillars calculation."
    : "The birth date provided is in the SOLAR (Gregorian) calendar.";

  const prompt = `You are a grandmaster of Korean Saju (Four Pillars of Destiny), trained in the ancient lineage of Korean cosmic astrology. You create premium, deeply personal Soul Reading Reports for a luxury brand called HON. Soul Signature.

Client Information:
- Name: ${info.customerName}
- Date of Birth: ${info.birthDate} 
- Calendar System: ${info.calendar || "solar"} (${calendarNote})
- Hour of Birth: ${info.birthTime || "Not provided"}
- Gender: ${info.gender || "Not provided"}

Create a premium Soul Signature Report in English. Write with poetic authority, spiritual depth, and genuine insight. Be highly specific — mention the exact elemental forces, specific years, specific qualities. Make this feel like a bespoke luxury reading worth every penny.

Do NOT use any markdown formatting symbols (no **, no ##, no *, no #). Use SECTION TITLES IN ALL CAPS followed by a colon and line break.

Write the following sections, each with substantial depth (minimum 4-5 sentences per section):

SOUL ESSENCE:
Open with a poetic, powerful statement about who this person is at a cosmic level. Reference their specific birth year animal and element.

THE FOUR PILLARS:
Analyze each pillar specifically — Year Pillar (animal sign and element), Month Pillar (season and elemental influence), Day Pillar (core self), Hour Pillar (${info.birthTime || "unknown"} — inner world and hidden gifts). Be specific about elemental interactions.

INNATE CHARACTER AND GIFTS:
Their core nature, natural talents, psychological gifts. Be specific and affirming.

LIFE PATH AND DESTINY:
Their greater purpose, karmic themes, the arc of their life journey.

WEALTH AND CAREER:
Specific insights about money, ideal careers, professional strengths. Name specific fields.

LOVE AND RELATIONSHIPS:
Their approach to love, ideal partner qualities, relationship patterns to transform.

HEALTH AND VITALITY:
Elemental health insights, organs to nurture, lifestyle recommendations specific to their chart.

2026 COSMIC FORECAST:
Specific guidance for 2026 — key months, opportunities, energetic themes, warnings.

SOUL GUIDANCE:
A closing blessing and message of wisdom. Make it feel sacred and personal.

Write approximately 1500-2000 words total. This is a premium luxury product — every word should feel intentional and valuable.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-5",
      max_tokens: 4000,
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
  const lines = text.split('\n');
  let html = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // 섹션 제목 감지 (ALL CAPS + 콜론)
    const titleMatch = line.match(/^([A-Z][A-Z\s&]+):(.*)$/);
    if (titleMatch && titleMatch[1].length > 3) {
      const title = titleMatch[1].trim();
      const rest = titleMatch[2].trim();
      html += `<div style="margin:32px 0 12px;">
        <p style="margin:0 0 2px;color:#c9a96e;font-size:10px;letter-spacing:3px;font-family:Arial,sans-serif;text-transform:uppercase;">${title}</p>
        <div style="width:24px;height:1px;background:#c9a96e;margin:6px 0 12px;"></div>
        ${rest ? `<p style="margin:0;color:#2c2c2c;font-size:15px;line-height:1.9;font-family:Georgia,serif;">${rest}</p>` : ''}
      </div>`;
    } else {
      html += `<p style="margin:0 0 14px;color:#2c2c2c;font-size:15px;line-height:1.9;font-family:Georgia,serif;">${line}</p>`;
    }
  }
  return html;
}

async function sendEmailViaResend(info, sajuText) {
  const formattedContent = formatSajuText(sajuText);
  const calendarLabel = info.calendar && info.calendar.toLowerCase().includes("lunar") ? "Lunar Calendar" : "Solar Calendar";

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8;padding:48px 20px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;overflow:hidden;box-shadow:0 8px 60px rgba(0,0,0,0.15);">

  <tr><td style="background:#0a0a0a;padding:56px 60px 48px;text-align:center;">
    <p style="margin:0 0 4px;color:#c9a96e;font-size:9px;letter-spacing:6px;font-family:Arial,sans-serif;">H · O · N</p>
    <p style="margin:0 0 20px;color:#c9a96e;font-size:8px;letter-spacing:4px;font-family:Arial,sans-serif;">SOUL SIGNATURE</p>
    <div style="width:1px;height:40px;background:linear-gradient(to bottom,transparent,#c9a96e,transparent);margin:0 auto 20px;"></div>
    <h1 style="margin:0 0 8px;color:#f5f0e8;font-size:30px;font-weight:400;letter-spacing:3px;font-family:Georgia,serif;">Your Soul Reading</h1>
    <p style="margin:0;color:#666;font-size:11px;letter-spacing:3px;font-family:Arial,sans-serif;text-transform:uppercase;">A Personal Cosmic Report</p>
  </td></tr>

  <tr><td style="padding:48px 60px 32px;">
    <p style="margin:0 0 4px;color:#c9a96e;font-size:9px;letter-spacing:3px;font-family:Arial,sans-serif;text-transform:uppercase;">Prepared exclusively for</p>
    <h2 style="margin:0 0 20px;color:#0a0a0a;font-size:26px;font-weight:400;font-family:Georgia,serif;letter-spacing:1px;">${info.customerName}</h2>
    <table cellpadding="0" cellspacing="0">
      <tr><td style="padding:4px 16px 4px 0;color:#999;font-size:11px;font-family:Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;">Date of Birth</td><td style="color:#333;font-size:13px;font-family:Georgia,serif;">${info.birthDate} <span style="color:#c9a96e;font-size:11px;">(${calendarLabel})</span></td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#999;font-size:11px;font-family:Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;">Hour of Birth</td><td style="color:#333;font-size:13px;font-family:Georgia,serif;">${info.birthTime || "Not provided"}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#999;font-size:11px;font-family:Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;">Order</td><td style="color:#333;font-size:13px;font-family:Georgia,serif;">#${info.orderNumber}</td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 60px 32px;">
    <div style="border-top:1px solid #e8e4dc;"></div>
  </td></tr>

  <tr><td style="padding:0 60px 32px;">
    <p style="margin:0;color:#666;font-size:14px;line-height:1.9;font-family:Georgia,serif;font-style:italic;border-left:2px solid #c9a96e;padding-left:20px;">
      The ancient Korean art of Saju — the Four Pillars of Destiny — holds within it the cosmic blueprint of your soul. What follows is a deeply personal reading, drawn from the exact moment of your birth and the elemental forces that shaped your arrival into this world.
    </p>
  </td></tr>

  <tr><td style="padding:0 60px 32px;">
    <div style="border-top:1px solid #e8e4dc;"></div>
  </td></tr>

  <tr><td style="padding:0 60px 48px;">
    ${formattedContent}
  </td></tr>

  <tr><td style="background:#0a0a0a;padding:44px 60px;text-align:center;">
    <div style="width:30px;height:1px;background:#c9a96e;margin:0 auto 20px;"></div>
    <p style="margin:0 0 6px;color:#c9a96e;font-size:9px;letter-spacing:5px;font-family:Arial,sans-serif;">H · O · N · S O U L · S I G N A T U R E</p>
    <p style="margin:0 0 16px;color:#444;font-size:11px;font-family:Arial,sans-serif;letter-spacing:1px;">K-Heritage of Soul · Crafted by Time · Sealed in Korea</p>
    <div style="width:30px;height:1px;background:#333;margin:0 auto 16px;"></div>
    <p style="margin:0 0 4px;color:#444;font-size:11px;font-family:Arial,sans-serif;">Questions? <a href="mailto:${FROM_EMAIL}" style="color:#c9a96e;text-decoration:none;">${FROM_EMAIL}</a></p>
    <p style="margin:0;color:#333;font-size:10px;font-family:Arial,sans-serif;">This report is for personal use only. Unauthorized reproduction is prohibited.</p>
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

async function processOrder(info) {
  try {
    // 중복 방지 체크
    const alreadyDone = await isAlreadyProcessed(info.orderId);
    if (alreadyDone) {
      console.log("Already processed, skipping:", info.orderNumber);
      return;
    }

    // 즉시 처리 중 표시 (중복 방지)
    await markAsProcessed(info.orderId);

    console.log("Generating saju report...");
    const sajuText = await generateSaju(info);
    console.log("Report generated, length:", sajuText.length);

    await sendEmailViaResend(info, sajuText);
    console.log("Done:", info.orderNumber);

  } catch (err) {
    console.error("Process error:", err.message);
  }
}

exports.handler = async (event) => {
  console.log("Webhook received! Method:", event.httpMethod);

  if (event.httpMethod === "GET") {
    return { statusCode: 200, body: JSON.stringify({ status: "ok", message: "HON. Saju Webhook active ✦" }) };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // 서명 검증
  const hmac = event.headers["x-shopify-hmac-sha256"];
  verifyWebhook(event.body, hmac);

  let order;
  try {
    order = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  console.log("Order received:", order.order_number);
  const info = extractSajuInfo(order);

  if (!info.email || !info.birthDate) {
    console.log("Missing info — skipping");
    return { statusCode: 200, body: "Skipped" };
  }

  // ✅ 즉시 200 응답 (Shopify 재시도 방지)
  // 백그라운드에서 처리 (waitUntil 없이 비동기 실행)
  processOrder(info).catch(err => console.error("Background error:", err.message));

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true, order: info.orderNumber }),
  };
};
