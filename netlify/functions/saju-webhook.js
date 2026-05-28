/**
 * HON. Soul Signature — Webhook v7
 * Netlify 역할: Shopify 수신 → 즉시 200 → Railway로 전달
 * Railway 역할: Claude 호출 + Resend 이메일 발송 (시간제한 없음)
 */

const crypto = require("crypto");

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
const SHOPIFY_ADMIN_TOKEN    = process.env.SHOPIFY_ADMIN_TOKEN;
const SHOPIFY_SHOP_DOMAIN    = process.env.SHOPIFY_SHOP_DOMAIN;
const RAILWAY_URL            = process.env.RAILWAY_URL; // https://web-production-67fdc.up.railway.app

function verifyWebhook(body, hmacHeader) {
  if (!SHOPIFY_WEBHOOK_SECRET || !hmacHeader) return true;
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
    const attr = noteAttrs.find((a) =>
      a.name === key || a.name.toLowerCase().includes(key.toLowerCase())
    );
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
  };
}

async function isAlreadyProcessed(orderId) {
  try {
    const res = await fetch(
      `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/orders/${orderId}.json?fields=tags`,
      { headers: { "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN } }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return (data.order?.tags || "").includes("saju-sent");
  } catch (e) {
    return false;
  }
}

async function markAsProcessed(orderId) {
  try {
    const res = await fetch(
      `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/orders/${orderId}.json?fields=tags`,
      { headers: { "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN } }
    );
    const data = await res.json();
    const currentTags = data.order?.tags || "";
    const newTags = currentTags ? `${currentTags}, saju-sent` : "saju-sent";
    await fetch(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/orders/${orderId}.json`, {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order: { id: orderId, tags: newTags } }),
    });
  } catch (e) {
    console.error("Tag update error:", e.message);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "GET") {
    return { statusCode: 200, body: JSON.stringify({ status: "ok" }) };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    verifyWebhook(event.body, event.headers["x-shopify-hmac-sha256"]);

    const order = JSON.parse(event.body);
    console.log("Order received:", order.order_number);

    const info = extractSajuInfo(order);

    if (!info.email || !info.birthDate) {
      console.log("Missing info — skipping");
      return { statusCode: 200, body: "Skipped - missing info" };
    }

    // 중복 방지 체크
    const done = await isAlreadyProcessed(info.orderId);
    if (done) {
      console.log("Already processed:", info.orderNumber);
      return { statusCode: 200, body: "Already processed" };
    }

    // 즉시 태그 달기 (중복 방지)
    await markAsProcessed(info.orderId);

    // Railway로 비동기 전달 (응답 기다리지 않음)
    const railwayUrl = RAILWAY_URL || "https://web-production-67fdc.up.railway.app";
    fetch(`${railwayUrl}/process-saju`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(info),
    }).catch((e) => console.error("Railway call error:", e.message));

    // Shopify에 즉시 200 응답
    return { statusCode: 200, body: JSON.stringify({ success: true, queued: true }) };

  } catch (err) {
    console.error("Error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
