/**
 * Foundational Learning Primitives
 *
 * Defines the core building blocks for knowledge ingestion, synthesis,
 * and academic structuring within the school-server engine.
 */

export interface KnowledgeBlock {
  id: string;
  topic: string;
  content: string;
  level: "foundational" | "intermediate" | "advanced";
  tags: string[];
}

export interface StudyPlan {
  title: string;
  blocks: KnowledgeBlock[];
  estimatedMinutes: number;
}

// In-memory store for the demonstration of foundational blocks
const knowledgeBase: Map<string, KnowledgeBlock> = new Map();

/**
 * Ingests a raw concept and breaks it down into a foundational building block.
 */
export function ingestKnowledge(
  topic: string,
  content: string,
  tags: string[] = [],
): KnowledgeBlock {
  const id = `kb_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const block: KnowledgeBlock = {
    id,
    topic,
    content,
    level: "foundational", // default to foundational
    tags,
  };

  knowledgeBase.set(id, block);
  return block;
}

/**
 * Retrieves knowledge blocks matching specific tags or topics.
 */
export function retrieveConcept(query: string): KnowledgeBlock[] {
  const results: KnowledgeBlock[] = [];
  const lowerQuery = query.toLowerCase();

  for (const block of knowledgeBase.values()) {
    if (
      block.topic.toLowerCase().includes(lowerQuery) ||
      block.content.toLowerCase().includes(lowerQuery) ||
      block.tags.some((tag) => tag.toLowerCase() === lowerQuery)
    ) {
      results.push(block);
    }
  }

  return results;
}

/**
 * Synthesizes a study plan from the available foundational blocks.
 */
export function generateStudyPlan(subject: string): StudyPlan {
  const relevantBlocks = retrieveConcept(subject);

  if (relevantBlocks.length === 0) {
    return {
      title: `Introduction to ${subject}`,
      blocks: [],
      estimatedMinutes: 0,
    };
  }

  return {
    title: `Comprehensive Study Plan: ${subject}`,
    blocks: relevantBlocks,
    estimatedMinutes: relevantBlocks.length * 15, // Assume 15 mins per block
  };
}
