import fs from "fs/promises";
import yaml from "js-yaml";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AgentLoader {
  static async loadAgentRegistry() {
    try {
      const registryPath = path.join(__dirname, "../../agent_registry.yaml");
      const fileContents = await fs.readFile(registryPath, "utf8");
      return yaml.load(fileContents);
    } catch (error) {
      console.error("Error loading agent registry:", error);
      return null;
    }
  }

  static async loadToolRegistry() {
    try {
      const registryPath = path.join(__dirname, "../../tool_registry.json");
      const fileContents = await fs.readFile(registryPath, "utf8");
      return JSON.parse(fileContents);
    } catch (error) {
      console.error("Error loading tool registry:", error);
      return {};
    }
  }

  static async loadPersona(agentId) {
    try {
      const personaPath = path.join(
        __dirname,
        `../../personas/${agentId}.yaml`
      );
      const fileContents = await fs.readFile(personaPath, "utf8");
      return yaml.load(fileContents);
    } catch (error) {
      console.error(`Error loading persona for ${agentId}:`, error);
      return null;
    }
  }

  static async loadPromptTemplates(agentId) {
    try {
      const templatePath = path.join(
        __dirname,
        `../../promptTemplates/${agentId}.yaml`
      );
      const fileContents = await fs.readFile(templatePath, "utf8");
      return yaml.load(fileContents);
    } catch (error) {
      console.error(`Error loading prompt templates for ${agentId}:`, error);
      return this.getDefaultTemplate(agentId);
    }
  }

  static getDefaultTemplate(agentId) {
    const defaultTemplates = {
      system_prompt: `You are a professional sales assistant for ICUPA. Be helpful, friendly, and professional in your communications.`,
      greeting: {
        new_contact:
          "Hello! I'm reaching out from ICUPA to help improve your business operations.",
        returning_contact:
          "Hello again! Hope you're doing well. Following up on our previous conversation about ICUPA.",
      },
      qualification_questions: [
        "What type of business do you operate?",
        "What are your main challenges with current ordering systems?",
        "How many customers do you typically serve daily?",
      ],
    };

    return defaultTemplates;
  }

  static async getAgentConfig(agentId) {
    try {
      const registryData = await this.loadAgentRegistry();

      if (!registryData) {
        throw new Error("Failed to load agent registry");
      }

      // FIX: Access the nested agent_registry structure
      const registry = registryData.agent_registry;

      if (!registry) {
        throw new Error("agent_registry key not found in registry file");
      }

      // Search through all agents in registry
      let agentConfig = null;

      for (const [key, config] of Object.entries(registry)) {
        if (config.agent_id === agentId) {
          agentConfig = config;

          break;
        }
      }

      if (!agentConfig) {
        // List available agents for debugging
        const availableAgents = Object.entries(registry)
          .map(([key, config]) => `${key} (agent_id: ${config.agent_id})`)
          .join(", ");

        throw new Error(
          `Agent ${agentId} not found in registry. Available agents: ${availableAgents}`
        );
      }

      // Load persona and templates
      const [persona, templates, tools] = await Promise.all([
        this.loadPersona(agentId),
        this.loadPromptTemplates(agentId),
        this.loadToolRegistry(),
      ]);

      return {
        agent: agentConfig,
        persona: persona || this.getDefaultPersona(agentId),
        templates: templates || this.getDefaultTemplate(agentId),
        tools: tools || {},
      };
    } catch (error) {
      console.error(`Error getting agent config for ${agentId}:`, error);
      throw error;
    }
  }

  static getDefaultPersona(agentId) {
    const defaultPersonas = {
      icupa_rwanda: {
        name: "ICUPA Sales Agent (Rwanda)",
        identity: {
          tone: "warm, local, respectful, community-first",
          personality:
            "patient, supportive, familiar with local business style",
          default_language: "kinyarwanda",
        },
        objectives: {
          primary:
            "Build trust and encourage ICUPA adoption among Rwandan venues",
        },
      },
      icupa_malta: {
        name: "ICUPA Sales Agent (Malta)",
        identity: {
          tone: "friendly, local-aware, helpful, non-robotic",
          personality:
            "energetic, conversational, insightful about hospitality",
          default_language: "english",
        },
        objectives: {
          primary: "Generate qualified leads and encourage ICUPA onboarding",
        },
      },
      lifuti_rwanda: {
        name: "Lifuti Sales Agent (Rwanda)",
        identity: {
          tone: "warm, local, respectful, community-first",
          personality:
            "patient, supportive, familiar with local business style",
          default_language: "kinyarwanda",
        },
        objectives: {
          primary:
            "Build trust and encourage Lifuti adoption among Rwandan venues",
        },
      },
    };

    return defaultPersonas[agentId] || defaultPersonas.icupa_rwanda;
  }

  static async findAgentByPhone(phoneNumber) {
    try {
      const registryData = await this.loadAgentRegistry();
      if (!registryData?.agent_registry) return null;

      const registry = registryData.agent_registry;

      // Extract country code from phone number
      let countryCode = null;
      if (phoneNumber.startsWith("250") || phoneNumber.startsWith("+250")) {
        countryCode = "RW"; // Rwanda
      } else if (
        phoneNumber.startsWith("356") ||
        phoneNumber.startsWith("+356")
      ) {
        countryCode = "MT"; // Malta
      }

      // Find matching agent based on country code
      for (const [key, config] of Object.entries(registry)) {
        if (config.contact_selector?.country_code === countryCode) {
          return config.agent_id;
        }
      }

      // Default fallback for Rwanda numbers

      return "icupa_rwanda";
    } catch (error) {
      return "icupa_rwanda";
    }
  }
}
