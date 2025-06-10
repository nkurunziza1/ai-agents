import { FirestoreUtils } from "./utils/firestoreUtils.js";
import { OpenAIUtils } from "./utils/openaiUtils.js";
import { PromptResolver } from "./utils/promptResolver.js";
import { dispatchMessage } from "./dispatchMessage.js";

export async function handleWhatsAppInbound(req, res) {
  try {

    // Parse WhatsApp webhook payload
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      return res
        .status(200)
        .json({ success: true, message: "No messages to process" });
    }

    // Process each message
    for (const message of messages) {
      await processInboundMessage(message, value);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
}

async function processInboundMessage(message, metadata) {
  try {
    const phoneNumber = message.from;
    const messageText = message.text?.body || "";
    const messageId = message.id;

    // Log the event
    await FirestoreUtils.logEvent({
      type: "whatsapp_message",
      status: "received",
      contact_id: phoneNumber,
      metadata: {
        message_id: messageId,
        message_type: message.type,
      },
    });

    // Get or create contact
    let contact = await FirestoreUtils.getContact(phoneNumber);
    if (!contact) {
      contact = await FirestoreUtils.createContact(phoneNumber, {
        phone_number: phoneNumber,
        platform: "whatsapp",
      });
    }

    // Add message to conversation history
    await FirestoreUtils.addMessage(phoneNumber, {
      from: "user",
      text: messageText,
      id: messageId,
    });

    // Update contact status if new
    if (contact.status === "new") {
      await FirestoreUtils.updateContact(phoneNumber, { status: "contacted" });
    }

    // Analyze message intent
    const intent = await OpenAIUtils.analyzeIntent(messageText);

    // Generate and send response
    await generateAndSendResponse(phoneNumber, contact, messageText, intent);
  } catch (error) {
    console.error("Error processing inbound message:", error);
  }
}

async function generateAndSendResponse(
  phoneNumber,
  contact,
  messageText,
  intent
) {
  try {
    const agentId = contact.agent_id;

    // Build conversation history for context
    const conversationHistory = (contact.messages || []).map((msg) => ({
      role: msg.from === "user" ? "user" : "assistant",
      content: msg.text,
    }));

    // Get system prompt
    const systemPrompt = await PromptResolver.buildSystemPrompt(agentId, {
      contact_name: contact.name || "there",
      phone_number: phoneNumber,
    });

    // Generate response
    const response = await OpenAIUtils.generateResponse(
      [...conversationHistory, { role: "user", content: messageText }],
      systemPrompt
    );

    // Send response via WhatsApp
    await dispatchMessage(
      {
        body: {
          to: phoneNumber,
          message: response,
          platform: "whatsapp",
        },
      },
      {
        status: (code) => ({
          json: (data) => console.log(`Response sent: ${code}`, data),
        }),
      }
    );

    // Update contact status
    await FirestoreUtils.updateContact(phoneNumber, {
      status: "replied",
      last_response: response,
    });
  } catch (error) {
    console.error("Error generating response:", error);
  }
}


// Webhook handler for incoming WhatsApp messages
export async function handleWhatsAppWebhook(req, res) {
  try {

    // Verify webhook (for initial setup)
    if (req.query.hub && req.query.hub.verify_token === process.env.WHATSAPP_VERIFY_TOKEN) {
     
      return res.status(200).send(req.query.hub.challenge);
    }

    // Process incoming messages
    const { object, entry } = req.body;

    if (object === "whatsapp_business_account" && entry?.length > 0) {
      for (const entryItem of entry) {
        for (const change of entryItem.changes) {
          if (change.field === "messages" && change.value?.messages) {
            await processIncomingMessages(change.value);
          }
        }
      }
    }

    res.status(200).json({ status: "received" });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
}

async function processIncomingMessages(messageData) {
  const { messages, contacts, metadata } = messageData;

  for (const message of messages) {
    try {
      const contact = contacts?.find(c => c.wa_id === message.from);
      
      
      // Save incoming message to Firestore
      await FirestoreUtils.addMessage(message.from, {
        from: "user",
        text: message.text?.body || "[Non-text message]",
        id: message.id,
        timestamp: message.timestamp,
        type: message.type,
        contact_name: contact?.profile?.name
      });

      // Log the event
      await FirestoreUtils.logEvent({
        type: "whatsapp_message_received",
        status: "processed",
        contact_id: message.from,
        metadata: {
          message_id: message.id,
          message_type: message.type,
          phone_number_id: metadata?.phone_number_id
        }
      });

      // Here you can add your AI agent logic
      // For example, if the message contains certain keywords, trigger a response
      if (message.text?.body) {
        await handleUserMessage(message.from, message.text.body, contact?.profile?.name);
      }

    } catch (error) {
      console.error("Error processing individual message:", error);
    }
  }
}

async function handleUserMessage(phoneNumber, messageText, contactName) {
  try {
    // Example: Simple keyword-based responses
    let responseMessage = null;

    const text = messageText.toLowerCase();
    
    if (text.includes("water") || text.includes("icupa")) {
      responseMessage = "Our water bottles are available for $2 each. Would you like to place an order?";
    } else if (text.includes("price") || text.includes("cost")) {
      responseMessage = "Here are our current prices:\n- Water bottle: $2\n- Large bottle: $3\nWhat would you like to order?";
    } else if (text.includes("hello") || text.includes("hi")) {
      responseMessage = `Hello ${contactName || "there"}! How can I help you today?`;
    } else {
      responseMessage = "Thank you for your message! How can I assist you today?";
    }

    if (responseMessage) {
      // Send automated response
      const { dispatchMessage } = await import("./messageDispatch.js");
      
      // Simulate the request object for dispatchMessage
      const mockReq = {
        body: {
          to: phoneNumber,
          message: responseMessage,
          platform: "whatsapp"
        }
      };

      const mockRes = {
        status: (code) => ({
          json: (data) => {
            console.log(`Auto-response sent (${code}):`, data);
            return data;
          }
        })
      };

      await dispatchMessage(mockReq, mockRes);
    }

  } catch (error) {
    console.error("Error handling user message:", error);
  }
}

// Alternative: Simple verification endpoint
export function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("Webhook verified successfully!");
    res.status(200).send(challenge);
  } else {
    res.status(403).send("Verification failed");
  }
}



