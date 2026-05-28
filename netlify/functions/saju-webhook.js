/**
 * HON. Soul Signature — 사주 자동화 Webhook
 * Shopify 주문 완료 → Claude API 사주 생성 → Shopify Email 발송
 */

const crypto = require("crypto");

// ── 환경변수 ──────────────────────────────────────────────────
const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY;
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
const SHOPIFY_ADMIN_TOKEN  = process.env.SHOPIFY_ADMIN_TOKEN;
const SHOPIFY_SHOP_DOMAIN  = process.env.SHOPIFY_SHOP_DOMAIN;
const FROM_EMAIL           = process.env.SHOPIFY_FROM_EMAIL;
const ADMIN_EMAIL          = process.env.ADMIN_EMAIL || "";

// ── Shopify Webhook 서명 검증 ──────────────────────────────────
function verifyWebhook(body, hmacHeader) {
  if (!SHOPIFY_WEBHOOK_SECRET) return true;
  try {
    const digest = crypto
      .createHmac("sha256", SHOPIFY_WEBHOOK_SECRET)
      .update(body, "utf8")
      .digest("base64");
    const match = digest === hmacHeader;
    if (!match) {
      console.error("서명 불일치! digest:", digest, "header:", hmacHeader);
    }
    return match;
  } catch (e) {
    console.error("서명 검증 오류:", e.message);
    return false;
  }
}

// ── 주문에서 사주 정보 추출 ────────────────────────────────────
function extractSajuInfo(order) {
  const noteAttrs = order.note_attributes || [];
  const get = (key) => {
    const attr = noteAttrs.find(
      (a) => a.name === key || a.name.toLowerCase().includes(key.toLowerCase())
    );
    return attr ? attr.value : null;
  };

  return {
    customerName: order.billing_address?.first_name || order.customer?.first_name || "고객",
    email:        order.email || order.customer?.email,
    birthDate:    get("Your_Date_of_Birth"),
    birthTime:    get("Your_Birth_Hour"),
    gender:       get("Your_Gender"),
    orderNumber:  order.order_number || order.name,
    orderTotal:   order.total_price,
    currency:     order.currency,
  };
}

// ── Claude API로 사주 생성 ─────────────────────────────────────
async function generateSaju(info) {
  const prompt = `당신은 전통 한국 사주명리학 전문가입니다. 아래 정보를 바탕으로 깊이 있고 따뜻한 사주 분석 리포트를 작성해 주세요.

고객 정보:
- 이름: ${info.customerName}
- 생년월일: ${info.birthDate}
- 태어난 시간: ${info.birthTime || "미제공"}
- 성별: ${info.gender || "미제공"}

다음 항목을 포함해 한국어로 작성해 주세요 (총 800~1200자):

1. **사주의 기본 구조** (연주·월주·일주·시주)
2. **타고난 기질과 성격**
3. **올해(2025년) 운세 흐름**
4. **커리어·재물운**
5. **인간관계·연애운**
6. **건강 주의사항**
7. **2025년 행운의 방향과 조언**

따뜻하고 긍정적인 어조로, 구체적이고 실용적인 조언을 담아주세요.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":         "application/json",
      "x-api-key":            ANTHROPIC_API_KEY,
      "anthropic-version":    "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-20250514",
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

// ── Shopify Admin API로 이메일 발송 ───────────────────────────
async function sendEmail(info, sajuText) {
  const htmlBody = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:'Apple SD Gothic Neo',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f7;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#2d1b4e 100%);padding:40px 40px 30px;text-align:center;">
          <p style="margin:0;color:#c9a96e;font-size:13px;letter-spacing:3px;text-transform:uppercase;">HON. Soul Signature</p>
          <h1 style="margin:12px 0 0;color:#fff;font-size:26px;font-weight:300;letter-spacing:1px;">✦ 사주 리포트 ✦</h1>
        </td></tr>
        <tr><td style="padding:36px 40px 0;">
          <p style="margin:0;color:#555;font-size:15px;line-height:1.8;">
            안녕하세요, <strong style="color:#1a1a2e;">${info.customerName}</strong>님 ✦<br>
            HON. Soul Signature와 함께해 주셔서 감사합니다.<br>
            아래에 정성껏 준비한 사주 리포트를 전달드립니다.
          </p>
        </td></tr>
        <tr><td style="padding:24px 40px;">
          <div style="border-top:1px solid #e8e2d9;"></div>
        </td></tr>
        <tr><td style="padding:0 40px 36px;">
          <div style="background:#faf8f5;border-left:3px solid #c9a96e;border-radius:0 8px 8px 0;padding:24px;">
            ${sajuText
              .split("\n")
              .map((line) =>
                line.trim()
                  ? `<p style="margin:0 0 12px;color:#333;font-size:14px;line-height:1.9;">${line}</p>`
                  : "<br>"
              )
              .join("")}
          </div>
        </td></tr>
        <tr><td style="background:#1a1a2e;padding:28px 40px;text-align:center;">
          <p style="margin:0;color:#c9a96e;font-size:12px;letter-spacing:2px;">HON. SOUL SIGNATURE</p>
          <p style="margin:8px 0 0;color:#888;font-size:11px;">주문번호 ${info.orderNumber} | 문의: ${FROM_EMAIL}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const shop  = SHOPIFY_SHOP_DOMAIN;
  const token = SHOPIFY_ADMIN_TOKEN;

  // 이메일 발송
  const res = await fetch(
    `https://${shop}/admin/api/2024-01/orders/${info.orderId}/send_email.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: {
          to:      info.email,
          subject: `✦ ${info.customerName}님의 사주 리포트 — HON. Soul Signature`,
          body:    htmlBody,
          from:    FROM_EMAIL,
          bcc:     ADMIN_EMAIL,
        }
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error("이메일 발송 오류:", errText);
  } else {
    console.log("이메일 발송 완료:", info.email);
  }

  // 주문 노트 업데이트
  await fetch(`https://${shop}/admin/api/2024-01/orders/${info.orderId}.json`, {
    method: "PUT",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      order: {
        id:   info.orderId,
        note: `[사주 완료] ${new Date().toLocaleString("ko-KR")}`,
        tags: "사주발송완료",
      },
    }),
  }).catch(e => console.error("주문 노트 오류:", e.message));
}

// ── 메인 핸들러 ───────────────────────────────────────────────
exports.handler = async (event) => {

  // ✅ 디버깅: 최상단 로그 — 요청 수신 즉시
  console.log("웹훅 신호 수신 성공! Method:", event.httpMethod);
  console.log("Headers:", JSON.stringify(event.headers));

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, body: "" };
  }

  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      body: JSON.stringify({ status: "ok", message: "HON. Saju Webhook 작동 중 ✦" }),
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    // ✅ 서명 검증 — try-catch로 감싸서 에러 로그 강제 출력
    const hmac = event.headers["x-shopify-hmac-sha256"];
    console.log("HMAC 헤더:", hmac);

    let signatureValid = false;
    try {
      signatureValid = verifyWebhook(event.body, hmac);
    } catch (sigErr) {
      console.error("서명 검증 예외:", sigErr.message);
      signatureValid = false;
    }

    // ✅ 임시 서명 우회 — 디버깅용 (나중에 다시 활성화)
    if (!signatureValid) {
      console.warn("⚠️ 서명 검증 실패 — 디버깅 모드로 계속 진행");
      // return { statusCode: 401, body: "Unauthorized" }; // 임시 비활성화
    }

    const order = JSON.parse(event.body);
    console.log("주문 수신:", order.order_number || order.name);

    const info = extractSajuInfo(order);
    info.orderId = order.id;
    console.log("사주 정보:", JSON.stringify(info));

    if (!info.email) {
      console.error("이메일 없음:", order.id);
      return { statusCode: 200, body: "이메일 없음 — 스킵" };
    }

    if (!info.birthDate) {
      console.error("생년월일 없음:", order.id);
      return { statusCode: 200, body: "생년월일 없음 — 스킵" };
    }

    console.log("사주 생성 중...");
    const sajuText = await generateSaju(info);
    console.log("사주 생성 완료, 길이:", sajuText.length);

    await sendEmail(info, sajuText);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, order: info.orderNumber }),
    };

  } catch (err) {
    console.error("오류:", err.message, err.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
