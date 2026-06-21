import { createApp } from "vue";
import App from "./App.vue";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/animations.css";
import "./styles/pet.css";
import "./styles/panel.css";
import "./styles/permission-bubble.css";
import "./styles/wallpaper.css";
import "./styles/settings.css";
import "./styles/knowledge.css";
import "./styles/markdown.css";
import { bootstrapEmbeddingSecret } from "./api";

createApp(App).mount("#app");
void bootstrapEmbeddingSecret().catch(() => {
  // The settings view retries and surfaces credential/bootstrap errors.
});
