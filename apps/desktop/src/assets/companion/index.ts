import type { CompanionState } from "@neo-companion/shared";
import focus from "./companion-focus.png";
import happy from "./companion-happy.png";
import idle from "./companion-idle.png";
import sleepy from "./companion-sleepy.png";
import thinking from "./companion-thinking.png";
import warn from "./companion-warn.png";

export const companionStateImages: Record<CompanionState, string> = {
  idle,
  focus,
  happy,
  thinking,
  warn,
  sleepy,
};
