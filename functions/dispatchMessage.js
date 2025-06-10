import { FirestoreUtils } from "./utils/firestoreUtils.js";
import fetch from "node-fetch";

export async function dispatchMessage(req, res) {
  try {
    const { to, message, platform = "whatsapp" } = req.body;

    console.log("🚀 DISPATCH MESSAGE START:", {
      to,
      message: message.substring(0, 100) + "...", // truncate long messages
      platform,
      timestamp: new Date().toISOString(),
    });

    if (!to || !message) {
      return res
        .status(400)
        .json({ error: "Missing required fields: to, message" });
    }

    let result;

    if (platform === "whatsapp") {
      result = await sendWhatsAppMessage(to, message);
    } else if (platform === "sms") {
      result = await sendSMSMessage(to, message);
    } else {
      return res.status(400).json({ error: "Unsupported platform" });
    }

    console.log("✅ WhatsApp API SUCCESS:", {
      messageId: result.messages[0].id,
      contacts: result.contacts,
      timestamp: new Date().toISOString(),
    });

    // Store message in database
    await FirestoreUtils.addMessage(to, {
      from: "agent",
      text: message,
      id: result.messages[0].id,
      timestamp: new Date().toISOString(),
      status: "sent_to_api", // Track initial status
    });

    // Log the event
    await FirestoreUtils.logEvent({
      type: `${platform}_message`,
      status: "sent",
      contact_id: to,
      metadata: {
        message_id: result.messages[0].id,
        platform,
        api_response: result,
      },
    });

    console.log("💾 DATABASE SAVED - Message ID:", result.messages[0].id);

    res.status(200).json({
      success: true,
      message_id: result.messages[0].id,
      platform,
    });
  } catch (error) {
    console.error("❌ DISPATCH ERROR:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    await FirestoreUtils.logEvent({
      type: `${req.body.platform || "whatsapp"}_message`,
      status: "failed",
      contact_id: req.body.to,
      metadata: { error: error.message },
    });
    return res.status(500).json({ error: "Failed to send message" });
  }
}

// Enhanced WhatsApp message sending with detailed logging
export async function sendWhatsAppMessage(phoneNumber, messageText) {
  try {
    const url = process.env.WHATSAPP_API_URL;
    const token = process.env.WHATSAPP_API_TOKEN;

    console.log("📤 SENDING WHATSAPP MESSAGE:", {
      to: phoneNumber,
      messageLength: messageText.length,
      apiUrl: url,
      tokenPrefix: token ? token.substring(0, 20) + "..." : "MISSING",
      timestamp: new Date().toISOString(),
    });

    if (!url) {
      throw new Error("WHATSAPP_API_URL environment variable is not set");
    }
    if (!token) {
      throw new Error("WHATSAPP_API_TOKEN environment variable is not set");
    }

    const payload = {
      messaging_product: "whatsapp",
      to: phoneNumber,
      type: "text",
      text: {
        body: messageText,
      },
    };

    console.log("📋 REQUEST PAYLOAD:", JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json();

    console.log("📥 WHATSAPP API RESPONSE:", {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "content-type": response.headers.get("content-type"),
        "x-fb-trace-id": response.headers.get("x-fb-trace-id"),
        "x-fb-req-id": response.headers.get("x-fb-req-id"),
      },
      data: responseData,
      timestamp: new Date().toISOString(),
    });

    if (!response.ok) {
      console.error("❌ WhatsApp API Error Details:", {
        status: response.status,
        statusText: response.statusText,
        data: responseData,
        url: url,
        phoneNumber: phoneNumber,
      });
      throw new Error(
        `WhatsApp API Error (${response.status}): ${JSON.stringify(
          responseData
        )}`
      );
    }

    // Check if response has expected structure
    if (
      !responseData.messages ||
      !responseData.messages[0] ||
      !responseData.messages[0].id
    ) {
      console.error("❌ UNEXPECTED RESPONSE STRUCTURE:", responseData);
      throw new Error("Unexpected WhatsApp API response structure");
    }

    return responseData;
  } catch (error) {
    console.error("❌ WhatsApp send error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}

// Add webhook status checker
export async function checkWebhookDelivery(messageId) {
  try {
    console.log("🔍 CHECKING MESSAGE STATUS:", messageId);

    // Check if we received delivery status via webhook
    const deliveryStatus = await FirestoreUtils.getMessageDeliveryStatus(
      messageId
    );

    if (deliveryStatus) {
      console.log("📊 DELIVERY STATUS FOUND:", deliveryStatus);
      return deliveryStatus;
    } else {
      console.log("⏳ NO DELIVERY STATUS YET for message:", messageId);
      return null;
    }
  } catch (error) {
    console.error("❌ Error checking webhook delivery:", error);
    return null;
  }
}

// Webhook handler for delivery status updates
export async function handleWebhookDeliveryStatus(req, res) {
  try {
    const body = req.body;
    console.log("📨 WEBHOOK DELIVERY STATUS:", JSON.stringify(body, null, 2));

    // Parse WhatsApp webhook for delivery status
    if (body.entry && body.entry[0] && body.entry[0].changes) {
      for (const change of body.entry[0].changes) {
        if (change.value && change.value.statuses) {
          for (const status of change.value.statuses) {
            console.log("📋 MESSAGE STATUS UPDATE:", {
              messageId: status.id,
              status: status.status,
              timestamp: status.timestamp,
              recipientId: status.recipient_id,
            });

            // Update message status in database
            await FirestoreUtils.updateMessageStatus(status.id, {
              status: status.status,
              timestamp: status.timestamp,
              webhook_received: new Date().toISOString(),
            });
          }
        }
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Webhook delivery status error:", error);
    res.status(500).send("Error");
  }
}

// Test function to verify message was actually sent
export async function testMessageDelivery(
  phoneNumber,
  testMessage = "Test message"
) {
  try {
    console.log("🧪 TESTING MESSAGE DELIVERY TO:", phoneNumber);

    // Send test message
    const result = await sendWhatsAppMessage(phoneNumber, testMessage);
    const messageId = result.messages[0].id;

    console.log("✅ Test message sent, ID:", messageId);

    // Wait a bit and check status
    setTimeout(async () => {
      const status = await checkWebhookDelivery(messageId);
      console.log("📊 DELIVERY CHECK RESULT:", status);
    }, 5000);

    return {
      success: true,
      messageId: messageId,
      message: "Test message sent, check logs for delivery status",
    };
  } catch (error) {
    console.error("❌ Test delivery failed:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Utility to check your WhatsApp Business API setup
export async function validateWhatsAppSetup() {
  try {
    const url = process.env.WHATSAPP_API_URL;
    const token = process.env.WHATSAPP_API_TOKEN;

    console.log("🔍 VALIDATING WHATSAPP SETUP:");
    console.log("API URL:", url);
    console.log("Token present:", !!token);
    console.log(
      "Token prefix:",
      token ? token.substring(0, 20) + "..." : "MISSING"
    );

    // Extract phone number ID from URL
    const phoneNumberIdMatch = url.match(/\/(\d+)\/messages$/);
    const phoneNumberId = phoneNumberIdMatch
      ? phoneNumberIdMatch[1]
      : "NOT_FOUND";

    console.log("Phone Number ID:", phoneNumberId);

    // Test API connection
    const testUrl = url.replace("/messages", "");
    const response = await fetch(testUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();
    console.log("📋 PHONE NUMBER INFO:", data);

    return {
      url,
      phoneNumberId,
      tokenValid: response.ok,
      phoneNumberInfo: data,
    };
  } catch (error) {
    console.error("❌ Setup validation failed:", error);
    return {
      error: error.message,
    };
  }
}

async function sendSMSMessage(to, message) {
  try {
    const { TwilioUtils } = await import("./utils/twilioUtils.js");
    const result = await TwilioUtils.sendSMS(to, message);

    return {
      message_id: result.sid,
      status: "sent",
    };
  } catch (error) {
    console.error("SMS send error:", error);
    throw error;
  }
}
