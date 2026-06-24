import { httpsCallable } from "firebase/functions";
import { functionsInstance } from "../firebase/config";

type ModerateContentResponse = {
  flagged?: boolean;
  reason?: string;
  skipped?: boolean;
};

/**
 * Moderation service that delegates to a Firebase Cloud Function to avoid CORS
 * and keep the Hugging Face API key on the server side.
 */
export async function moderateWithOpenAI(text: string): Promise<{ flagged: boolean; reason?: string }> {
  const sanitizedText = typeof text === "string" ? text.trim() : "";
  if (!sanitizedText) {
    return { flagged: false };
  }

  try {
    const moderateContentCallable = httpsCallable<{ text: string }, ModerateContentResponse>(
      functionsInstance,
      "moderateContent",
    );

    const result = await moderateContentCallable({ text: sanitizedText });
    const data = (result.data as ModerateContentResponse) || {};

    return {
      flagged: Boolean(data.flagged),
      reason: data.reason,
    };
  } catch (error) {
    console.error('Cloud moderation error:', error);
    return { flagged: false, reason: 'AI moderation skipped (error occurred)' };
  }
}