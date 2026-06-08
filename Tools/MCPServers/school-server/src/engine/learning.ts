/**
 * Foundational Learning Primitives
 *
 * Core building blocks for knowledge ingestion, synthesis, and academic
 * structuring within the school-server engine. Progress is expressed as
 * learning milestones (mastery checkpoints) rather than game scores.
 */

import { randomUUID } from "node:crypto";

export type KnowledgeLevel = "foundational" | "intermediate" | "advanced";

export interface KnowledgeBlock {
  id: string;
  topic: string;
  content: string;
  level: KnowledgeLevel;
  tags: string[];
}

export interface StudyPlan {
  title: string;
  blocks: KnowledgeBlock[];
  estimatedMinutes: number;
}

/**
 * A learning milestone re-frames progress as a mastery checkpoint instead of a
 * competitive score: it marks meaningful advancement through a subject.
 */
export interface LearningMilestone {
  subject: string;
  blocksMastered: number;
  totalBlocks: number;
  completionRatio: number;
  label: string;
}

const MINUTES_PER_BLOCK = 15;

// In-memory store for foundational knowledge blocks.
const knowledgeBase: Map<string, KnowledgeBlock> = new Map();

/**
 * Ingests a raw concept and stores it as a foundational building block.
 */
export function ingestKnowledge(
  topic: string,
  content: string,
  tags: string[] = [],
  level: KnowledgeLevel = "foundational",
): KnowledgeBlock {
  const block: KnowledgeBlock = {
    id: `kb_${randomUUID()}`,
    topic,
    content,
    level,
    tags,
  };

  knowledgeBase.set(block.id, block);
  return block;
}

/**
 * Retrieves knowledge blocks whose topic, content, or tags match the query.
 */
export function retrieveConcept(query: string): KnowledgeBlock[] {
  const lowerQuery = query.toLowerCase();

  return [...knowledgeBase.values()].filter(
    (block) =>
      block.topic.toLowerCase().includes(lowerQuery) ||
      block.content.toLowerCase().includes(lowerQuery) ||
      block.tags.some((tag) => tag.toLowerCase() === lowerQuery),
  );
}

/**
 * Synthesizes a study plan from the stored blocks relevant to a subject.
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
    estimatedMinutes: relevantBlocks.length * MINUTES_PER_BLOCK,
  };
}

/**
 * Assesses progress through a subject as a learning milestone. Replaces
 * score/XP framing with mastery checkpoints tied to how much of the available
 * material a learner has worked through.
 */
export function assessMilestone(subject: string, blocksMastered: number): LearningMilestone {
  const totalBlocks = retrieveConcept(subject).length;
  const safeMastered = Math.max(0, Math.min(blocksMastered, totalBlocks));
  const completionRatio = totalBlocks === 0 ? 0 : safeMastered / totalBlocks;

  return {
    subject,
    blocksMastered: safeMastered,
    totalBlocks,
    completionRatio,
    label: milestoneLabel(completionRatio),
  };
}

function milestoneLabel(completionRatio: number): string {
  if (completionRatio >= 1) return "Mastery";
  if (completionRatio >= 0.66) return "Building fluency";
  if (completionRatio > 0) return "Getting started";
  return "Not started";
}

/** Clears the in-memory knowledge base. Primarily for tests and fresh sessions. */
export function resetKnowledgeBase(): void {
  knowledgeBase.clear();
}
