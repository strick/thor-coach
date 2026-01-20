/**
 * Daily Summary Prompt Builder
 * Constructs system and user messages for LLM
 */

import type { DailySummaryInput, DailySummaryUserProfile } from "@thor/shared";
import { estimateProteinTarget } from "./normalize.js";

/**
 * Build system and user prompts for daily summary generation
 */
export function buildDailySummaryPrompt(input: DailySummaryInput): {
  system: string;
  user: string;
} {
  const system = buildSystemPrompt();
  const user = buildUserPrompt(input);

  return { system, user };
}

/**
 * Build system message (instructions for the LLM)
 */
function buildSystemPrompt(): string {
  return `You are a fitness + nutrition coach specializing in DASH diet adherence, heart-healthy eating, and fat loss with muscle retention. You are not a doctor. Do not provide medical advice, diagnosis, or medication changes. Be direct and motivating (David Goggins / James Cameron vibe), but respectful and constructive.`;
}

/**
 * Build user message with profile and daily data
 */
function buildUserPrompt(input: DailySummaryInput): string {
  // Use actual protein target from user profile if available, otherwise estimate
  const proteinTarget = (input.userProfile as any).proteinTarget || 
                        estimateProteinTarget(input.userProfile.weight_lbs);

  const userProfileSection = formatUserProfile(input.userProfile, proteinTarget);
  const todayDataSection = formatTodayData(input);

  return `User profile:
${userProfileSection}

Today's data (${input.date}):
${todayDataSection}

Tasks:
1) Produce a Daily Summary in MARKDOWN with these sections and exact headings:
## Your Day (Goggins Mode)
[2-3 sentences with a direct David Goggins / James Cameron vibe. Tell him how he did, what he crushed, what he left on the table. Be honest but motivating. Examples: "You put in solid work today with the strength session and the run—that's what consistency looks like. Protein was light, but the effort was there. Tomorrow's your chance to tighten up and dominate." Or "You showed up, but you know you can do better. The training was solid, but the nutrition discipline fell short. That's not who you are."]

## Highlights
## DASH & Heart-Healthy Check
## Protein & Recovery
## Training Review
## Red Flags
## Tomorrow's Priorities

2) Keep it concise and actionable. Use numbers when possible (protein, sodium, fiber).
3) If data is missing, say what's missing and what to track tomorrow—don't invent numbers.
4) Suggestions must be practical and not require long-distance running.
5) End with a brief disclaimer line about not being medical advice.`;
}

/**
 * Format user profile for the prompt
 */
function formatUserProfile(profile: DailySummaryUserProfile, proteinTarget: number): string {
  let profileText = `- Age: ${profile.age}, ${profile.sex}, ~${profile.weight_lbs} lbs, abdominal fat ("dad bod")
- Diet: ${profile.diet}
- Protein target: ~${proteinTarget}g/day
- Goals: ${profile.goals.join(", ")}`;

  if (profile.cholesterolNotes) {
    profileText += `\n- Cholesterol notes: ${profile.cholesterolNotes}`;
  }

  return profileText;
}

/**
 * Format today's data as JSON for the prompt
 */
function formatTodayData(input: DailySummaryInput): string {
  const data = {
    date: input.date,
    nutrition: input.nutrition,
    training: input.training || null,
    activity: input.activity || null,
    sleep: input.sleep || null,
    notes: input.notes || ""
  };

  return JSON.stringify(data, null, 2);
}
