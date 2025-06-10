import { AgentLoader } from "./agentLoader.js";

export class PromptResolver {
  static async buildSystemPrompt(agentId, context = {}) {
    try {
      const config = await AgentLoader.getAgentConfig(agentId);

      // Build comprehensive system prompt
      let systemPrompt = this.buildBaseSystemPrompt(config, context);

      // Add persona-specific instructions
      if (config.persona) {
        systemPrompt += this.buildPersonaInstructions(config.persona);
      }

      // Add context-specific information
      if (context.contact_name) {
        systemPrompt += `\n\nCurrent contact: ${context.contact_name}`;
      }

      if (context.venue_name) {
        systemPrompt += `\nVenue: ${context.venue_name}`;
      }

      if (context.conversation_history) {
        systemPrompt += `\nPrevious conversation context: ${context.conversation_history}`;
      }

      return systemPrompt;
    } catch (error) {
      console.error("Error building system prompt:", error);
      return this.getDefaultSystemPrompt(agentId);
    }
  }

  static buildBaseSystemPrompt(config, context) {
    const agent = config.agent;
    const persona = config.persona;

    let prompt = `You are ${
      persona?.name || "a professional sales agent"
    }.\n\n`;

    // Add role description
    if (persona?.description) {
      prompt += `ROLE: ${persona.description}\n\n`;
    }

    // Add identity guidelines
    if (persona?.identity) {
      prompt += `PERSONALITY GUIDELINES:\n`;
      prompt += `- Tone: ${persona.identity.tone}\n`;
      prompt += `- Personality: ${persona.identity.personality}\n`;
      prompt += `- Default Language: ${persona.identity.default_language}\n`;
      if (persona.identity.emoji_usage) {
        prompt += `- Emoji Usage: ${persona.identity.emoji_usage}\n`;
      }
      prompt += `\n`;
    }

    // Add objectives
    if (persona?.objectives) {
      prompt += `OBJECTIVES:\n`;
      prompt += `- Primary: ${persona.objectives.primary}\n`;
      if (persona.objectives.secondary) {
        persona.objectives.secondary.forEach((obj) => {
          prompt += `- ${obj}\n`;
        });
      }
      prompt += `\n`;
    }

    // Add response guidelines
    if (persona?.response_guidelines) {
      prompt += `RESPONSE GUIDELINES:\n`;
      const guidelines = persona.response_guidelines;

      if (guidelines.first_contact) {
        prompt += `First Contact:\n`;
        guidelines.first_contact.forEach((rule) => {
          prompt += `- ${rule}\n`;
        });
      }

      if (guidelines.follow_up) {
        prompt += `Follow-up:\n`;
        guidelines.follow_up.forEach((rule) => {
          prompt += `- ${rule}\n`;
        });
      }

      if (guidelines.escalation) {
        prompt += `Escalation:\n`;
        guidelines.escalation.forEach((rule) => {
          prompt += `- ${rule}\n`;
        });
      }
      prompt += `\n`;
    }

    // Add conversation patterns
    if (persona?.conversation_patterns) {
      prompt += `CONVERSATION PATTERNS:\n`;
      const patterns = persona.conversation_patterns;
      if (patterns.greeting_style)
        prompt += `- Greeting: ${patterns.greeting_style}\n`;
      if (patterns.value_proposition)
        prompt += `- Value Prop: ${patterns.value_proposition}\n`;
      if (patterns.local_references)
        prompt += `- Local References: ${patterns.local_references}\n`;
      if (patterns.closing_style)
        prompt += `- Closing: ${patterns.closing_style}\n`;
      prompt += `\n`;
    }

    return prompt;
  }

  static buildPersonaInstructions(persona) {
    let instructions = `IMPORTANT INSTRUCTIONS:\n`;

    // Add escalation triggers
    if (persona.escalation_triggers) {
      instructions += `ESCALATE TO HUMAN WHEN:\n`;
      persona.escalation_triggers.forEach((trigger) => {
        instructions += `- ${trigger}\n`;
      });
      instructions += `\n`;
    }

    // Add cultural considerations
    if (persona.cultural_considerations) {
      instructions += `CULTURAL CONSIDERATIONS:\n`;
      persona.cultural_considerations.forEach((consideration) => {
        instructions += `- ${consideration}\n`;
      });
      instructions += `\n`;
    }

    // Add language-specific benefits
    if (persona.key_benefits_kinyarwanda) {
      instructions += `KEY BENEFITS (in Kinyarwanda):\n`;
      persona.key_benefits_kinyarwanda.forEach((benefit) => {
        instructions += `- ${benefit}\n`;
      });
      instructions += `\n`;
    }

    return instructions;
  }

  static getDefaultSystemPrompt(agentId) {
    const prompts = {
      icupa_rwanda: `You are a warm and respectful sales assistant for ICUPA in Rwanda. 
Speak primarily in Kinyarwanda and focus on helping local bars and restaurants digitize their ordering systems.
Be patient, supportive, and familiar with local business customs.`,

      icupa_malta: `You are a friendly and knowledgeable sales assistant for ICUPA in Malta.
Help bars, restaurants, and hotels understand how our mobile ordering platform can improve their operations.
Be energetic, conversational, and aware of local hospitality challenges.`,

      lifuti_rwanda: `You are a warm sales assistant for Lifuti in Rwanda.
Speak primarily in Kinyarwanda and help local businesses understand our services.
Be respectful and community-focused in your approach.`,
    };

    return prompts[agentId] || prompts.icupa_rwanda;
  }

  static async getTemplate(agentId, templateType, context = {}) {
    try {
      const config = await AgentLoader.getAgentConfig(agentId);
      const template = config.templates?.[templateType];

      if (!template) {
        return this.getDefaultTemplate(agentId, templateType, context);
      }

      // Handle different template structures
      if (typeof template === "string") {
        return this.replaceContextVariables(template, context);
      } else if (typeof template === "object") {
        const result = {};
        for (const [key, value] of Object.entries(template)) {
          if (typeof value === "string") {
            result[key] = this.replaceContextVariables(value, context);
          } else {
            result[key] = value;
          }
        }
        return result;
      }

      return template;
    } catch (error) {
      console.error(`Error getting template ${templateType}:`, error);
      return this.getDefaultTemplate(agentId, templateType, context);
    }
  }

  static getDefaultTemplate(agentId, templateType, context = {}) {
    const templates = {
      icupa_rwanda: {
        greeting: {
          new_contact:
            "Muraho neza! Neza ko ubucuruzi bwawe bugenda neza. Ndavuga kuva kuri ICUPA...",
          returning_contact:
            "Muraho neza! Nizeye ko ubucuruzi bugenda neza. Ndagaruka kuganira nawe kuri ICUPA...",
        },
        qualification_questions: [
          "Ubucuruzi bwawe ni ubwite (bar, restaurant, hotel)?",
          "Hari ibibazo ukura kuri menu yawe cyangwa serivisi?",
          "Ugomba kugira uburyo bworoshye bwo gutegeka?",
        ],
      },
      icupa_malta: {
        greeting: {
          new_contact:
            "Hi! Hope business is going well. I'm reaching out from ICUPA to help improve your venue's operations...",
          returning_contact:
            "Hi again! Following up on our conversation about ICUPA's mobile ordering platform...",
        },
        qualification_questions: [
          "What type of venue do you operate?",
          "What are your main challenges with current ordering processes?",
          "How busy do you get during peak times?",
        ],
      },
    };

    const agentTemplates = templates[agentId] || templates.icupa_rwanda;
    return agentTemplates[templateType] || agentTemplates.greeting;
  }

  static replaceContextVariables(template, context) {
    let result = template;

    // Replace common variables
    const replacements = {
      CONTACT_NAME: context.contact_name || "there",
      VENUE_NAME: context.venue_name || "your venue",
      PHONE_NUMBER: context.phone_number || "",
      LOCATION: context.location || "",
      BUSINESS_TYPE: context.business_type || "business",
    };

    for (const [key, value] of Object.entries(replacements)) {
      const placeholder = new RegExp(`\\[${key}\\]`, "g");
      result = result.replace(placeholder, value);
    }

    return result;
  }

  static async shouldUseTemplate(agentId, conversationState, messageCount) {
    try {
      if (messageCount === 0) {
        return conversationState?.returning_contact
          ? "returning_contact"
          : "new_contact";
      }

      if (messageCount < 3 && conversationState?.needs_qualification) {
        return "qualification_questions";
      }

      return null;
    } catch (error) {
      console.error("Error determining template usage:", error);
      return null;
    }
  }

  static async generateContextualResponse(
    agentId,
    message,
    conversationHistory,
    context = {}
  ) {
    try {
      const config = await AgentLoader.getAgentConfig(agentId);
      const systemPrompt = await this.buildSystemPrompt(agentId, context);

      const messageContext = {
        current_message: message,
        conversation_length: conversationHistory.length,
        last_messages: conversationHistory.slice(-3),
        agent_language: config.agent?.language || "english",
        contact_info: {
          name: context.contact_name,
          phone: context.phone_number,
          venue: context.venue_name,
        },
      };

      return {
        systemPrompt,
        messageContext,
      };
    } catch (error) {
      return {
        systemPrompt: this.getDefaultSystemPrompt(agentId),
        messageContext: { current_message: message },
        shouldEscalate: false,
      };
    }
  }
}
