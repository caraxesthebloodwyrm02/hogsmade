import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { evaluateArchitecture } from "./engine/core.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "nexus-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Register Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "evaluate_architecture",
        description:
          "Evaluates a provided code block or text for architectural resilience and structural integrity.",
        inputSchema: {
          type: "object",
          properties: {
            codeSnippet: {
              type: "string",
              description: "The code block to evaluate",
            },
          },
          required: ["codeSnippet"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "evaluate_architecture") {
    const codeSnippet = request.params.arguments?.codeSnippet;

    if (typeof codeSnippet !== "string") {
      throw new Error("Invalid arguments: codeSnippet must be a string");
    }

    // Call the cognitive engine logic
    const analysis = evaluateArchitecture(codeSnippet);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(analysis, null, 2),
        },
      ],
    };
  }

  throw new Error(`Tool not found: ${request.params.name}`);
});

// Run server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Nexus Cognitive Server running on stdio");
}

main().catch((error) => {
  console.error("Failed to start Nexus Cognitive Server:", error);
  process.exit(1);
});
