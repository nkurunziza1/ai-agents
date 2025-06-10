import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { handleWhatsAppInbound } from "./functions/handleWhatsAppInbound.js";
import { handleVoiceWebhook } from "./functions/handleVoiceWebhook.js";
import { initiateVoiceCall } from "./functions/initiateVoiceCall.js";
import { dispatchMessage } from "./functions/dispatchMessage.js";
import { testMessageDelivery } from "./functions/dispatchMessage.js";
import { validateWhatsAppSetup } from "./functions/dispatchMessage.js";
// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan("combined"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.ENVIRONMENT,
  });
});

// WhatsApp webhook endpoints
app.get("/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  ) {
    console.log("WhatsApp webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});
// Add this to test your configuration
app.get('/test-whatsapp-setup', async (req, res) => {
  const result = await validateWhatsAppSetup();
  res.json(result);
});
app.post("/webhook/whatsapp", handleWhatsAppInbound);

// Twilio voice webhook endpoints
app.post("/webhook/voice", handleVoiceWebhook);

// API endpoints
app.post("/api/send-message", dispatchMessage);
app.post("/api/initiate-call", initiateVoiceCall);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    error: "Internal server error",
    message:
      process.env.ENVIRONMENT === "development"
        ? err.message
        : "Something went wrong",
  });
});

// Add this endpoint for testing
app.post('/test-message', async (req, res) => {
  const result = await testMessageDelivery('250783186898', 'Hello, this is a test!');
  res.json(result);
});

app.use(/.*/, (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Sales AI Agent Platform running on port ${PORT}`);
  console.log(`📱 WhatsApp webhook: ${process.env.BASE_URL}/webhook/whatsapp`);
  console.log(`📞 Voice webhook: ${process.env.BASE_URL}/webhook/voice`);
  console.log(`🌍 Environment: ${process.env.ENVIRONMENT}`);
});

export default app;
