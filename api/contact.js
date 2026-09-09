const ALLOWED_ORIGINS = new Set([
  "https://meat-dough.com",
  "https://www.meat-dough.com",
]);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default async function handler(request, response) {
  const origin = request.headers.origin || "";
  const originAllowed = ALLOWED_ORIGINS.has(origin) || origin.endsWith(".vercel.app");

  if (originAllowed) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed." });
  if (!originAllowed) return response.status(403).json({ error: "Origin not allowed." });

  const { name, company, email, phone = "", inquiry, message, website = "" } = request.body || {};

  // Hidden field catches simple form-filling bots without affecting real visitors.
  if (website) return response.status(200).json({ ok: true });

  if (![name, company, email, inquiry, message].every((value) => typeof value === "string" && value.trim())) {
    return response.status(400).json({ error: "Please complete all required fields." });
  }
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return response.status(400).json({ error: "Please enter a valid email address." });
  }
  if (name.length > 120 || company.length > 160 || phone.length > 60 || inquiry.length > 120 || message.length > 5000) {
    return response.status(400).json({ error: "One or more fields are too long." });
  }
  if (!process.env.RESEND_API_KEY) {
    return response.status(500).json({ error: "Email service is not configured." });
  }

  const html = `
    <h2>New website inquiry</h2>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Company:</strong> ${escapeHtml(company)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(phone || "Not provided")}</p>
    <p><strong>Inquiry:</strong> ${escapeHtml(inquiry)}</p>
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(message).replaceAll("\n", "<br>")}</p>
  `;

  try {
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Meat & Dough Website <website@meat-dough.com>",
        to: ["info@meat-dough.com"],
        reply_to: email,
        subject: `Website inquiry — ${inquiry}`,
        html,
      }),
    });

    if (!resendResponse.ok) {
      const details = await resendResponse.text();
      console.error("Resend rejected the message:", details);
      return response.status(502).json({ error: "The message could not be sent. Please try again." });
    }

    return response.status(200).json({ ok: true });
  } catch (error) {
    console.error("Contact form error:", error);
    return response.status(500).json({ error: "The message could not be sent. Please try again." });
  }
}
