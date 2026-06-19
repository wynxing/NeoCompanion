<script setup lang="ts">
import { ref } from "vue";
import type { SearchScope } from "../../../composables/useSettings";

defineProps<{
  chatAnswer: string;
  chatLoading: boolean;
}>();

const emit = defineEmits<{
  sendMessage: [text: string];
}>();

const inputText = ref("");
const scope = ref<SearchScope>("current");

const exampleMessages = [
  { who: "我", msg: "这段 panic 是 borrow checker？" },
  { who: "助手", msg: "是的，第 42 行同时持有可变与不可变借用…" },
];

// Static MVP — mock 召回来源；v2 接 sidecar 后由 ai:done 消息附带的 sources 字段填充
interface MockSource {
  id: string;
  type: "note" | "task";
  title: string;
  excerpt: string;
}

const mockSources: MockSource[] = [
  {
    id: "n-003",
    type: "note",
    title: "Rust borrow checker 速记",
    excerpt: "可变借用与不可变借用同时存在的 4 个常见场景…",
  },
  {
    id: "t-104",
    type: "task",
    title: "确认 sqlite-vec 在 Windows ARM 上的可行性",
    excerpt: "任务关联：跟踪 borrow 生命周期问题排查",
  },
];

// 当用户配置了 Embedding Provider 时为 false；mock 默认走有来源路径
const isDegraded = ref(false);

function handleSend() {
  if (!inputText.value.trim()) return;
  emit("sendMessage", inputText.value);
  inputText.value = "";
}

function selectScope(value: SearchScope) {
  scope.value = value;
}
</script>

<template>
  <div class="card card-solid">
    <div class="card-head">
      <div>
        <div class="card-title">AI 对话</div>
        <div class="card-sub">DeepSeek-V3 · 引用本地笔记与任务</div>
      </div>
      <div class="nc-chat-scope" role="tablist" aria-label="检索范围">
        <button
          type="button"
          role="tab"
          :class="{ active: scope === 'current' }"
          :aria-selected="scope === 'current'"
          @click="selectScope('current')"
        >
          当前项目
        </button>
        <button
          type="button"
          role="tab"
          :class="{ active: scope === 'all' }"
          :aria-selected="scope === 'all'"
          @click="selectScope('all')"
        >
          全部项目
        </button>
      </div>
    </div>

    <div class="nc-chat">
      <div class="nc-chat-scroll">
        <template v-if="chatAnswer || chatLoading">
          <div class="row">
            <span class="who">助手</span>
            <span :class="['msg', { streaming: chatLoading }]">{{ chatAnswer || "思考中…" }}</span>
          </div>
        </template>
        <div v-else class="nc-chat-empty">
          <div v-for="(msg, i) in exampleMessages" :key="i" class="row">
            <span class="who">{{ msg.who }}</span>
            <span class="msg">{{ msg.msg }}</span>
          </div>
          <small>示例对话 · 发送消息后会显示真实回复</small>
        </div>
      </div>

      <section v-if="chatAnswer && !chatLoading" class="nc-chat-sources" aria-label="召回来源">
        <div v-if="isDegraded" class="nc-chat-degraded">
          知识检索已降级（仅关键词），未召回笔记。
        </div>
        <template v-else>
          <div class="nc-chat-sources-head">
            来源 · {{ mockSources.length }} 项
            <span class="scope-tag">{{ scope === "current" ? "当前项目" : "全部项目" }}</span>
          </div>
          <ul>
            <li v-for="src in mockSources" :key="src.id">
              <span class="kind" :data-type="src.type">{{ src.type === "note" ? "笔记" : "任务" }}</span>
              <div class="body">
                <div class="title">{{ src.title }}</div>
                <div class="excerpt">{{ src.excerpt }}</div>
              </div>
              <button type="button" class="open-btn" disabled title="v2 阶段实现">打开</button>
            </li>
          </ul>
        </template>
      </section>

      <div class="input">
        <input
          v-model="inputText"
          type="text"
          placeholder="问点什么…"
          class="chat-input-native"
          @keydown.enter.prevent="handleSend"
        />
        <span class="send" @click="handleSend">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
            <path d="m5 12 14-7-5 14-3-7z" />
          </svg>
        </span>
      </div>
    </div>
  </div>
</template>
