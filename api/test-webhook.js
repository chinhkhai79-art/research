export default async function handler(req, res) {
  try {
    const orderCode = String(req.query.orderCode || "RESEARCH" + Date.now()).toUpperCase();
    const amount = Number(req.query.amount || 300000);

    const host = req.headers["x-forwarded-host"] || req.headers.host || "research.vanthemmo.com";
    const protocol = String(host).includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    const response = await fetch(`${baseUrl}/api/sepay-webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Apikey ${process.env.SEPAY_API_KEY || "mysecret123"}`
      },
      body: JSON.stringify({
        gateway: "ACB",
        transactionDate: new Date().toISOString(),
        accountNumber: "13131447",
        content: orderCode,
        transferType: "in",
        transferAmount: amount,
        id: Math.floor(Math.random() * 1000000000)
      })
    });

    const data = await response.json();

    return res.status(200).json({
      success: response.ok,
      sent: { orderCode, amount },
      webhookStatus: response.status,
      webhookResponse: data,
      checkStatusUrl: `/api/payment-status?orderCode=${encodeURIComponent(orderCode)}`
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Test webhook error"
    });
  }
}
