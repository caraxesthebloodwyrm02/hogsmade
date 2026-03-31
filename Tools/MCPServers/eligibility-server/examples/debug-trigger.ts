import { openEvolutionCaseHandler } from "../src/server.js";

async function run() {
  console.log("Triggering openEvolutionCaseHandler to hit breakpoints...");
  
  // A mock payload to trigger the handler logic
  try {
    const result = await openEvolutionCaseHandler({
      caseId: "debug-automation-test",
      label: "Automated Debug Trigger",
      fixtureId: "balanced-bridge"
    });
    
    console.log("Handler executed successfully. Result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Handler threw an error:", error);
  }
}

// Call the function
void run();
