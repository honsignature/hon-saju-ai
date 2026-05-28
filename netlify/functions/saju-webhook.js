/**
 * HON. Soul Signature — 사주 자동화 Webhook
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
    customerName: order.billing_address?.first_name || order.customer?.first_name || "고객",
    email:        order.email || order.customer?.email,
    birthDate:    get("Your_Date_of_Birth"),
    birthTime:    get("Your_Birth_Hour"),
    gender:       get("Your_Gender"),
    orderNumber:  order.order_number || order.name,
    orderId:      order.id,
  };
}

async function generateSaju(info) {
  const prompt = `당신은 전통 한국 사주명리학 전문가입니다. 아래 정보를 바탕으로 깊이 있고 따뜻한 사주 분석 리포트를 작성해 주세요.

고객 정보:
- 이름: ${info.customerName}
- 생년월일: ${info.birthDate}
- 태어난 시간: ${info.birthTime || "미제공"}
- 성별: ${info.gender || "미제공"}

다음 항목을 포함해 한국어로 작성해 주세요 (총 800~1200자):
1. 사주의 기본 구조 (연주·월주·일주·시주)
2. 타고난 기질과 성격
3. 올해(2026년) 운세 흐름
4. 커리어·재물운
5. 인간관계·연애운
6. 건강 주의사항
7. 행운의 방향과 조언

따뜻하고 긍정적인 어조로, 구체적이고 실용적인 조언을 담아주세요.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages:   [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API 오류: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

async function sendEmailViaResend(info, sajuText) {
  const htmlBody = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:sans-serif;">
<table width="100%" style="background:#faf9f7;padding:40px 0;">
<tr><td align="center">
<table width="600" style="background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#1a1a2e,#2d1b4e);padding:40px;text-align:center;">
  <p style="margin:0;color:#c9a96e;font-size:13px;letter-spacing:3px;">HON. SOUL SIGNATURE</p>
  <h1 style="margin:12px 0 0;color:#fff;font-size:24px;font-weight:300;">✦ 사주 리포트 ✦</h1>
</td></tr>
<tr><td style="padding:36px 40px;">
  <p style="color:#555;font-size:15px;line-height:1.8;">안녕하세요, <strong>${info.customerName}</strong>님 ✦<br>정성껏 준비한 사주 리포트를 전달드립니다.</p>
  <hr style="border:none;border-top:1px solid #e8e2d9;margin:24px 0;">
  <div style="background:#faf8f5;border-left:3px solid #c9a96e;padding:24px;border-radius:0 8px 8px 0;">
    ${sajuText.split("\n").map(line => line.trim() ? `<p style="margin:0 0 12px;color:#333;font-size:14px;line-height:1.9;">${line}</p>` : "<br>").join("")}
  </div>
</td></tr>
<tr><td style="background:#1a1a2e;padding:24px 40px;text-align:center;">
  <p style="margin:0;color:#c9a96e;font-size:12px;">HON. SOUL SIGNATURE | 주문번호 ${info.orderNumber}</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:    `HON. Soul Signature <${FROM_EMAIL}>`,
      to:      [info.email],
      subject: `✦ ${info.customerName}님의 사주 리포트 — HON. Soul Signature`,
      html:    htmlBody,
    }),
  });

  const result = await res.json();
  if (!res.ok) {
    console.error("Resend 이메일 오류:", JSON.stringify(result));
    throw new Error(`이메일 발송 실패: ${JSON.stringify(result)}`);
  }
  console.log("이메일 발송 완료:", info.email, result.id);
  return result;
}

exports.handler = async (event) => {
  console.log("웹훅 신호 수신! Method:", event.httpMethod);

  if (event.httpMethod === "GET") {
    return { statusCode: 200, body: JSON.stringify({ status: "ok", message: "HON. Saju Webhook 작동 중 ✦" }) };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const hmac = event.headers["x-shopify-hmac-sha256"];
    verifyWebhook(event.body, hmac);

    const order = JSON.parse(event.body);
    console.log("주문 수신:", order.order_number);

    const info = extractSajuInfo(order);
    console.log("사주 정보:", JSON.stringify(info));

    if (!info.email || !info.birthDate) {
      console.log("필수 정보 없음 — 스킵");
      return { statusCode: 200, body: "스킵" };
    }

    console.log("사주 생성 중...");
    const sajuText = await generateSaju(info);
    console.log("사주 생성 완료, 길이:", sajuText.length);

    await sendEmailViaResend(info, sajuText);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, order: info.orderNumber }),
    };

  } catch (err) {
    console.error("오류:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
