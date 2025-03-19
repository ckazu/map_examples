const functions = require("firebase-functions");

const TARGET_URL = functions.config().circle_proxy.target_url;
const BEARER_TOKEN = functions.config().circle_proxy.bearer_token;

exports.circle_proxy = functions.https.onRequest(async (req, res) => {
  // CORS ヘッダーの付与
  res.set("Access-Control-Allow-Origin", "*");

  // プリフライト (OPTIONS) リクエストへの対応
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Headers",
        "Content-Type, Accept, Authorization, X-Requested-With");
    return res.status(200).send("");
  }

  // POST メソッド以外は 405 (Method Not Allowed) を返す
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  // リクエストボディの取得（Firebase Functions では自動的に JSON パースされる場合が多い）
  // 必要に応じて JSON.stringify(req.body) で文字列に変換します
  const requestBody = JSON.stringify(req.body);
  console.log("受信した JSON ボディ:", requestBody);

  try {
    // ターゲット API へ POST リクエストを転送
    const targetResponse = await fetch(TARGET_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${BEARER_TOKEN}`,
      },
      body: requestBody,
    });

    // ターゲットからのレスポンスを受け取る
    const responseBody = await targetResponse.text();

    // ターゲット API のステータスや Content-Type をそのまま返す
    res.status(targetResponse.status);
    if (targetResponse.headers.get("Content-Type")) {
      res.set("Content-Type", targetResponse.headers.get("Content-Type"));
    }
    return res.send(responseBody);
  } catch (error) {
    console.error("Proxy Error:", error);
    return res.status(500).send("Internal Server Error");
  }
});
