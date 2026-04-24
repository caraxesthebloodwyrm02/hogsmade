import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ingestKnowledge, retrieveConcept, generateStudyPlan } from "./engine/learning";

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

// Register MCP Tools for the School Engine
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
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "ingest_knowledge": {
        const { topic, content, tags } = request.params.arguments as any;
        const block = ingestKnowledge(topic, content, tags || []);
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
        const { query } = request.params.arguments as any;
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
        const { subject } = request.params.arguments as any;
        const plan = generateStudyPlan(subject);
        return {
          content: [
            { type: "text", text: `Study Plan Generated:\n${JSON.stringify(plan, null, 2)}` },
          ],
        };
      }
      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// Run server and print the motto
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Core motto logged to stderr (since stdout is used by MCP stdio transport)
  console.error("🏫 School Server Initialized.");
  console.error("🎓 Core Motto: 'keep cool at school'");
  console.error("📚 Ready to facilitate 100x learning capabilities.");
}

main().catch((error) => {
  console.error("Failed to start School Server:", error);
  process.exit(1);
});
