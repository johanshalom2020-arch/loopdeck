import type { LocalMediaType } from "@/lib/types";

export const ACCEPTED_EXTENSIONS = ["mp4", "webm", "mov", "mp3", "m4a", "ogg"] as const;

export const FILE_INPUT_ACCEPT =
  ".mp4,.webm,.mov,.mp3,.m4a,.ogg,audio/*,video/*";

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

export function isSupportedMediaFile(file: Pick<File, "name" | "type">): boolean {
  const ext = extensionOf(file.name);
  if ((ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) return true;
  return file.type.startsWith("video/") || file.type.startsWith("audio/");
}

export function mediaTypeForFile(file: Pick<File, "name" | "type">): LocalMediaType {
  if (file.type.startsWith("audio/")) return "audio";
  if (["mp3", "m4a", "ogg"].includes(extensionOf(file.name))) return "audio";
  return "video";
}
