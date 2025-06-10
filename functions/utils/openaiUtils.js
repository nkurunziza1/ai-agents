import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

export class OpenAIUtils {
  static async generateResponse(messages, systemPrompt, model = null) {
    try {
      const completion = await openai.chat.completions.create({
        model: model || process.env.OPENAI_MODEL,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.7,
        max_tokens: 500,
      });

      return completion.choices[0].message.content;
    } catch (error) {
      console.error("OpenAI API error:", error);
      throw error;
    }
  }

  static async analyzeIntent(message) {
    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content: `Analyze the user's message and classify the intent. 
            Return a JSON object with: {"intent": "greeting|question|objection|interested|not_interested|request_info", "confidence": 0.8, "sentiment": "positive|negative|neutral"}`,
          },
          { role: "user", content: message },
        ],
        temperature: 0.3,
        max_tokens: 100,
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      console.error("Intent analysis error:", error);
      return { intent: "unknown", confidence: 0.5, sentiment: "neutral" };
    }
  }

  static async shouldEscalate(conversationHistory, currentMessage) {
    try {
      const messages = conversationHistory
        .map((msg) => `${msg.from}: ${msg.text}`)
        .join("\n");

      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content: `Analyze if this conversation should be escalated to a human agent. 
            Consider: complex technical questions, pricing negotiations, complaints, or explicit requests for human agent.
            Return JSON: {"should_escalate": true/false, "reason": "explanation"}`,
          },
          {
            role: "user",
            content: `Conversation:\n${messages}\n\nLatest message: ${currentMessage}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 100,
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      console.error("Escalation analysis error:", error);
      return { should_escalate: false, reason: "Analysis failed" };
    }
  }
}

export { openai };
