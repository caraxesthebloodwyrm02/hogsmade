import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  ingestKnowledge,
  retrieveConcept,
  generateStudyPlan,
  assessMilestone,
} from "./engine/learning.js";

const server = new Server(
  {
    name: "school-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const ingestKnowledgeInput = z.object({
  topic: z.string().min(1, "topic is required"),
  content: z.string().min(1, "content is required"),
  tags: z.array(z.string()).default([]),
  level: z.enum(["foundational", "intermediate", "advanced"]).default("foundational"),
});

const retrieveConceptInput = z.object({
  query: z.string().min(1, "query is required"),
});

const generateStudyPlanInput = z.object({
  subject: z.string().min(1, "subject is required"),
});

const assessMilestoneInput = z.object({
  subject: z.string().min(1, "subject is required"),
  blocksMastered: z.number().int().min(0).default(0),
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "ingest_knowledge",
        description: "Store a new foundational knowledge block for future study and research.",
        inputSchema: {
          type: "object",
          properties: {
            topic: { type: "string", description: "The core topic or subject name" },
            content: { type: "string", description: "The detailed explanation or scientific fact" },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Related conceptual tags",
            },
            level: {
              type: "string",
              enum: ["foundational", "intermediate", "advanced"],
              description: "Difficulty level of the block (defaults to foundational)",
            },
          },
          required: ["topic", "content"],
        },
      },
      {
        name: "retrieve_concept",
        description: "Search the knowledge base for foundational blocks matching a query.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The topic or tag to search for" },
          },
          required: ["query"],
        },
      },
      {
        name: "generate_study_plan",
        description:
          "Create a structured study plan based on stored knowledge blocks for a given subject.",
        inputSchema: {
          type: "object",
          properties: {
            subject: { type: "string", description: "The subject to generate a plan for" },
          },
          required: ["subject"],
        },
      },
      {
        name: "assess_milestone",
        description:
          "Report progress through a subject as a learning milestone (mastery checkpoint), not a competitive score.",
        inputSchema: {
          type: "object",
          properties: {
            subject: { type: "string", description: "The subject being studied" },
            blocksMastered: {
              type: "number",
              description: "How many knowledge blocks the learner has mastered",
            },
          },
          required: ["subject"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "ingest_knowledge": {
        const { topic, content, tags, level } = ingestKnowledgeInput.parse(
          request.params.arguments,
        );
        const block = ingestKnowledge(topic, content, tags, level);
        return {
          content: [
            {
              type: "text",
              text: `Successfully ingested foundational block:\n${JSON.stringify(block, null, 2)}`,
            },
          ],
        };
      }
      case "retrieve_concept": {
        const { query } = retrieveConceptInput.parse(request.params.arguments);
        const concepts = retrieveConcept(query);
        return {
          content: [
            {
              type: "text",
              text: `Found ${concepts.length} concepts:\n${JSON.stringify(concepts, null, 2)}`,
            },
          ],
        };
      }
      case "generate_study_plan": {
        const { subject } = generateStudyPlanInput.parse(request.params.arguments);
        const plan = generateStudyPlan(subject);
        return {
          content: [
            { type: "text", text: `Study Plan Generated:\n${JSON.stringify(plan, null, 2)}` },
          ],
        };
      }
      case "assess_milestone": {
        const { subject, blocksMastered } = assessMilestoneInput.parse(request.params.arguments);
        const milestone = assessMilestone(subject, blocksMastered);
        return {
          content: [
            { type: "text", text: `Learning Milestone:\n${JSON.stringify(milestone, null, 2)}` },
          ],
        };
      }
      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Core motto logged to stderr (stdout is reserved for the MCP stdio transport).
  console.error("🏫 School Server Initialized.");
  console.error("🎓 Core Motto: 'keep cool at school'");
  console.error("📚 Ready to facilitate learning, study plans, and milestones.");
}

main().catch((error) => {
  console.error("Failed to start School Server:", error);
  process.exit(1);
});
