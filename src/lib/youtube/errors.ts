/**
 * Human-readable mapping for the YouTube IFrame API error codes, plus the
 * classification helpers used for auto-skip behaviour in playlists.
 * See https://developers.google.com/youtube/iframe_api_reference#onError
 */

export const YT_ERROR_MESSAGES: Record<number, string> = {
  2: "YouTube rejected the request (invalid parameter). Try removing and re-adding this item.",
  5: "The YouTube player reported an internal HTML5 playback error. Try again in a moment.",
  100: "This video is unavailable — it was removed, or it is private.",
  101: "The owner of this video does not allow it to be played in embedded players.",
  150: "The owner of this video does not allow it to be played in embedded players.",
};

/** Error codes that mean "this entry is unplayable, move along" inside playlists. */
export function isAutoSkippableError(code: number): boolean {
  return code === 100 || code === 101 || code === 150;
}

/** Codes 101 and 150 indicate the uploader disabled embedding. */
export function isEmbedRestriction(code: number): boolean {
  return code === 101 || code === 150;
}

export function describeYouTubeError(code: number): string {
  return YT_ERROR_MESSAGES[code] ?? `The YouTube player reported an unknown error (code ${code}).`;
}
