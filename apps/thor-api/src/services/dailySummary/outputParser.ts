/**
 * Daily Summary Output Parser
 * Parses LLM markdown response into structured sections
 */

import type { DailySummarySections } from "@thor/shared";

/**
 * Parse markdown response from LLM into structured sections
 */
export function parseDailySummaryOutput(markdown: string): DailySummarySections {
  const yourDay = extractSection(markdown, "## Your Day (Goggins Mode)");
  const highlights = extractSection(markdown, "## Highlights");
  const dashHeartHealthy = extractSection(markdown, "## DASH & Heart-Healthy Check");
  const proteinRecovery = extractSection(markdown, "## Protein & Recovery");
  const training = extractSection(markdown, "## Training Review");
  const redFlags = extractSection(markdown, "## Red Flags");
  const tomorrowPriorities = extractSection(markdown, "## Tomorrow's Priorities");

  return {
    yourDay: yourDay.trim(),
    highlights: parseHighlights(highlights),
    dashHeartHealthy: dashHeartHealthy.trim(),
    proteinRecovery: proteinRecovery.trim(),
    training: training.trim(),
    redFlags: redFlags.trim(),
    tomorrowPriorities: tomorrowPriorities.trim()
  };
}

/**
 * Extract section content between headers
 */
function extractSection(markdown: string, header: string): string {
  const startIdx = markdown.indexOf(header);
  if (startIdx === -1) return "";

  // Find the content after the header
  const contentStart = startIdx + header.length;

  // Find the next header or end of string
  const nextHeaderIdx = markdown.indexOf("\n##", contentStart);
  const endIdx = nextHeaderIdx === -1 ? markdown.length : nextHeaderIdx;

  return markdown.substring(contentStart, endIdx).trim();
}

/**
 * Parse highlights section into bullet points
 */
function parseHighlights(content: string): string[] {
  if (!content) return [];

  // Split by newlines and filter for bullet points
  const lines = content.split("\n");
  const highlights: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      // Remove bullet point and add
      highlights.push(trimmed.substring(2).trim());
    }
  }

  return highlights;
}

/**
 * Validate that all required sections are present
 */
export function validateSummaryOutput(sections: DailySummarySections): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!sections.yourDay || sections.yourDay.length === 0) {
    errors.push("Missing or empty Your Day section");
  }
  if (!sections.highlights || sections.highlights.length === 0) {
    errors.push("Missing or empty highlights section");
  }
  if (!sections.dashHeartHealthy || sections.dashHeartHealthy.length === 0) {
    errors.push("Missing or empty DASH & Heart-Healthy Check section");
  }
  if (!sections.proteinRecovery || sections.proteinRecovery.length === 0) {
    errors.push("Missing or empty Protein & Recovery section");
  }
  if (!sections.training || sections.training.length === 0) {
    errors.push("Missing or empty Training Review section");
  }
  if (!sections.tomorrowPriorities || sections.tomorrowPriorities.length === 0) {
    errors.push("Missing or empty Tomorrow's Priorities section");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Reconstruct markdown from parsed sections
 */
export function reconstructMarkdown(sections: DailySummarySections): string {
  const parts: string[] = [];

  parts.push("## Your Day (Goggins Mode)");
  parts.push(sections.yourDay);

  parts.push("\n## Highlights");
  if (sections.highlights && sections.highlights.length > 0) {
    for (const highlight of sections.highlights) {
      parts.push(`- ${highlight}`);
    }
  }

  parts.push("\n## DASH & Heart-Healthy Check");
  parts.push(sections.dashHeartHealthy);

  parts.push("\n## Protein & Recovery");
  parts.push(sections.proteinRecovery);

  parts.push("\n## Training Review");
  parts.push(sections.training);

  if (sections.redFlags && sections.redFlags.trim().length > 0) {
    parts.push("\n## Red Flags");
    parts.push(sections.redFlags);
  }

  parts.push("\n## Tomorrow's Priorities");
  parts.push(sections.tomorrowPriorities);

  parts.push(
    "\n---\n*Disclaimer: This summary is for informational & coaching purposes only. Not medical advice. Always consult your physician before major diet or training changes.*"
  );

  return parts.join("\n");
}
