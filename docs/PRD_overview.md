# NeoCompanion 总景产品需求文档

## Document Header

- **Title**: NeoCompanion Product Requirements Document (Overview)
- **Owner**: Product
- **Status**: Draft
- **Version**: 1.0
- **Last Updated**: 2026-05-17
- **Audience**: Product, Design, Engineering
- **Related Docs**:
  - [`README.md`](D:\character_design\character_with_you\README.md)
  - [`docs/PRD_v1.md`](D:\character_design\character_with_you\docs\PRD_v1.md)
  - `ARCHITECTURE.md` (TBD)

---

## 1. Document Purpose

本文档定义 NeoCompanion 的长期产品方向、核心产品判断、能力边界和阶段路线。

本文档是 NeoCompanion 的产品主文档，用于为后续版本规划、设计决策、技术讨论和架构设计提供统一依据。

本文档不覆盖以下内容：

- 页面级需求
- 交互细节
- 技术实现方案
- 系统架构细节
- 详细商业模型
- 详细竞品分析

### 1.1 Document Relationship

- `README.md`
  - 用于项目介绍、愿景摘要和外层阅读入口

- `docs/PRD_overview.md`
  - 用于定义长期产品方向，是产品主文档

- `docs/PRD_v1.md`
  - 用于定义第一阶段版本需求

- `ARCHITECTURE.md`
  - 用于在产品边界明确后定义系统架构与技术方案

---

## 2. Problem Statement

### 2.1 Market Gap

当前 AI 产品主要集中在三类能力：

1. 问答与生成
2. 效率与任务处理
3. 陪伴与角色互动

这三类产品各自解决部分问题，但都存在明显边界：

- 纯问答产品擅长单次响应，不擅长长期参与
- 纯效率工具擅长任务处理，不擅长情绪支持与连续关系
- 纯陪伴产品擅长互动体验，不擅长推动真实行为结果

### 2.2 User Problem

目标用户在学习、工作、创作等高频脑力活动中，常见问题不是“无法获得答案”，而是：

- 难以开始
- 难以持续
- 难以跨阶段积累
- 难以让工具理解自己的长期目标和状态变化

### 2.3 Why This Matters

如果产品只能处理单次任务，就难以形成长期使用关系。

如果产品只能提供情绪陪伴，就难以支撑真实成长过程。

NeoCompanion 需要解决的问题是：

> 如何构建一个既能提供低打扰持续支持，又能参与长期目标推进的个人 AI 系统。

---

## 3. Product Definition

### 3.1 Positioning

NeoCompanion 是一个以陪伴驱动的个人 AI 系统。

产品通过长期关系、状态判断能力和持续记忆能力，支持用户在长期目标推进中的高频行为。

### 3.2 Core Product Decisions

本文档锁定以下产品判断：

1. 产品主轴是陪伴驱动，不是通用效率工具驱动
2. 产品价值建立在长期使用关系上，不以单次问答质量作为唯一标准
3. 差异化主要来自长期关系、状态判断能力和持续记忆能力
4. 第一阶段应从单一高频场景切入，而不是从平台能力切入
5. 工具能力必须服务长期目标推进，不能演变为无边界功能集合
6. 主动执行能力属于中后期能力，不作为第一阶段产品中心

### 3.3 Differentiation

NeoCompanion 与常见产品类型的区别如下：

- 相比问答型 AI，重点不在单次响应，而在持续参与
- 相比效率工具，重点不在任务处理本身，而在长期行为支持
- 相比陪伴产品，重点不在互动频次，而在真实目标推进

### 3.4 Non-Goals

以下内容不属于总景 PRD 当前定义范围：

- 作为泛用聊天产品参与所有开放话题
- 作为全能办公工具覆盖所有效率需求
- 作为纯角色养成产品强调剧情或强关系沉浸
- 作为第一阶段即完成的跨平台超级入口

---

## 4. Target Users

### 4.1 Initial Core User

第一核心用户为学生。

选择该人群的原因：

- 高脑力活动频率
- 长期目标明确
- 启动阻力明显
- 对持续反馈和进展记录敏感

### 4.2 Expansion Users

在学生场景验证后，逐步扩展到年轻高频脑力用户，优先包括：

- 开发者
- 创作者
- 高强度知识工作者

### 4.3 Shared User Conditions

长期目标用户需同时满足以下共性条件：

- 存在高频脑力活动
- 存在长期目标和阶段任务
- 在开始、持续或状态管理上存在显著摩擦
- 愿意接受长期使用型 AI 产品参与日常流程

---

## 5. Capability Model

NeoCompanion 的长期能力分为四层。每层都应有清晰边界。

### 5.1 Companion Layer

**定义**

用于提供持续支持体验和长期使用关系的能力层。

**价值**

- 提高产品被持续打开和保留的概率
- 为长期交互提供稳定的人格与反馈框架

**包含内容**

- 角色表达
- 状态反馈
- 低打扰支持
- 关系连续性

**边界**

- 不以高频闲聊为主要目标
- 不以强剧情或恋爱式互动为设计中心

### 5.2 Growth Layer

**定义**

用于承接长期目标推进和阶段进展管理的能力层。

**价值**

- 将短期行为转化为长期积累
- 将用户的阶段任务与长期目标连接起来

**包含内容**

- 目标
- 计划
- 进度
- 复盘
- 累计记录

**边界**

- 不扩展为完整项目管理系统
- 不承担专业教育或专业咨询系统角色

### 5.3 Tool Layer

**定义**

用于在具体学习、工作、创作任务中提供直接辅助的能力层。

**价值**

- 提高具体任务完成效率
- 增强产品在真实场景中的可用性

**包含内容**

- 学习辅助
- 工作辅助
- 创作辅助
- 轻量总结整理

**边界**

- 工具能力必须服务成长层或陪伴层主线
- 不以“功能越多越好”为目标

### 5.4 System Layer

**定义**

用于支撑产品从单场景能力演进为长期个人 AI 系统的基础层。

**价值**

- 统一跨端体验
- 统一用户状态和长期记忆
- 为后续连接和执行能力提供基础

**包含内容**

- 多端同步
- 记忆体系
- 状态统一
- 连接能力
- 主动执行能力

**边界**

- 该层主要属于中后期建设
- 不要求在早期阶段全部落地

---

## 6. Roadmap Framework

### 6.1 v1: Study Companion

**Stage Goal**

验证产品是否能在单一高频场景中建立持续使用关系。

**Primary User**

学生

**Main Capability Focus**

- Companion Layer
- Growth Layer 的基础能力

**Validation Goal**

- 用户是否愿意高频启动使用
- 用户是否形成连续使用

详细范围见 [`docs/PRD_v1.md`](D:\character_design\character_with_you\docs\PRD_v1.md)。

### 6.2 v2: Multi-Scenario Growth

**Stage Goal**

将产品从单一学习场景扩展到更广泛的长期成长协作场景。

**Primary User**

学生 + 年轻高频脑力用户

**Main Capability Focus**

- 更完整的 Growth Layer
- 更明确的 Tool Layer
- 跨场景进度与目标承接

**Validation Goal**

- 用户是否在多个阶段任务中持续使用
- 产品是否从单点场景工具演进为长期成长入口

### 6.3 v3: Companion OS

**Stage Goal**

形成更完整的个人 AI 系统。

**Primary User**

长期稳定使用产品的多类高频脑力用户

**Main Capability Focus**

- 完整的 System Layer
- 更强的连接能力
- 中后期主动执行能力

**Validation Goal**

- 产品是否成为用户长期使用的统一数字支持系统之一
- 多场景协同是否建立稳定价值

---

## 7. Success Metrics

### 7.1 Long-Term Core Metrics

- Retention
- Daily/weekly engagement
- Multi-scenario adoption
- Long-term relationship continuity

### 7.2 Metric Interpretation

- **Retention**: 用户是否持续返回使用
- **Daily/weekly engagement**: 产品是否形成高频、持续的使用习惯
- **Multi-scenario adoption**: 产品是否从单场景走向多场景使用
- **Long-term relationship continuity**: 用户是否把产品视为长期使用对象而非短期工具

### 7.3 Stage-Level Validation Metrics

- `v1`: 高频使用、连续使用、完成率
- `v2`: 多场景使用占比、目标推进连续性
- `v3`: 跨端活跃、多模块联动使用、长期留存

---

## 8. Key Assumptions and Risks

### 8.1 Key Assumptions

1. 用户愿意接受长期陪伴式 AI，而不只接受一次性工具
2. 低打扰持续支持体验能够转化为更稳定的留存
3. 从学生切入后，产品主线可以迁移到其他高频脑力用户
4. 长期记忆与状态判断能力会显著提高产品黏性

### 8.2 Primary Risks

1. 陪伴体验无法转化为可持续的使用频率
2. 工具能力扩张过快，导致主线被泛效率工具逻辑稀释
3. 目标用户扩展时，学生场景中成立的判断不能迁移
4. 中后期连接与执行能力引入过早，导致系统复杂度失控
5. 陪伴表达过重，影响真实任务场景下的使用效率

### 8.3 Product Meaning of Risk Materialization

如果上述风险发生，产品会出现以下问题：

- 无法形成高频使用习惯
- 无法建立长期差异化
- 产品边界持续膨胀
- 后续技术和系统设计成本显著上升

---

## 9. Related Documents

- [`README.md`](D:\character_design\character_with_you\README.md)
- [`docs/PRD_v1.md`](D:\character_design\character_with_you\docs\PRD_v1.md)
- `ARCHITECTURE.md` (TBD)

---

## 10. Review Checklist

本文档完成后，应满足以下检查条件：

1. 读者能区分 `README`、总景 PRD、`PRD_v1`、架构文档的职责
2. 读者能用一句话概括产品长期定义
3. 读者能说清初始用户、扩展用户和用户共性条件
4. 读者能理解四层能力模型及其边界
5. 读者能区分 `v1 / v2 / v3` 的目标与验证重点
6. 读者能识别主要前提和风险
