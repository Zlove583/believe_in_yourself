/**
 * 统一业务实体基类字段约定：
 * 所有业务表均含 id(UUID)/created_at/updated_at/deleted_at(软删除)。
 */

/** 数据库行公共字段 */
export interface BaseEntity {
  id: string;
  created_at: string; // ISO 时间字符串
  updated_at: string;
  deleted_at: string | null;
}

/** 打卡类型 */
export type CheckinType = 'boolean' | 'numeric' | 'english';

/** 英语学习计划专用配置（存 plans.config JSON 字段） */
export interface EnglishPlanConfig {
  dailyNewWords: number; // 每日新词数
  dailyReviewWords: number; // 每日复习词数
}

/** 计划 */
export interface Plan extends BaseEntity {
  name: string;
  icon: string; // lucide 图标名
  goal: string; // 目标描述
  min_action: string; // 最小行动
  checkin_type: CheckinType;
  metric_label: string | null; // 数值类指标名，如 "WPM" / "分钟"
  config: string | null; // 专用配置 JSON（英语计划存 EnglishPlanConfig）
  sort_order: number;
  require_evidence: 0 | 1; // 是否需要学习证据（截图/视频）
}

/** 打卡记录（一个 day_key + plan_id 唯一） */
export interface Checkin extends BaseEntity {
  plan_id: string;
  day_key: string; // 凌晨4点重置后的日期键 YYYY-MM-DD
  done: 0 | 1; // 布尔打卡是否完成
  value: number | null; // 数值打卡值（WPM / 时长等）
  duration_minutes: number; // 当日该计划累计时长（番茄钟计入）
  note: string | null;
  attachment_path: string | null; // 附件相对路径（att:// 协议）
  attachment_type: 'screenshot' | 'video' | null;
  attachment_name: string | null; // 原始文件名
}

/** 今日要事（每日待办） */
export interface Frog extends BaseEntity {
  day_key: string;
  title: string;
  plan_id: string | null;
  done: 0 | 1;
  sort_order: number;
}

/** 番茄钟会话 */
export interface PomodoroSession extends BaseEntity {
  plan_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  mode: 'focus' | 'break';
}

/** 复盘日记 */
export interface JournalEntry extends BaseEntity {
  day_key: string;
  sentence1: string | null;
  sentence2: string | null;
  sentence3: string | null;
  mood: number | null; // 1-5
}

/** 每周汇总 */
export interface WeeklySummary extends BaseEntity {
  week_start: string; // 周一 day_key
  content: string;
}

/** 技能树节点 */
export interface SkillNode extends BaseEntity {
  level: number; // 1-8
  code: string; // 形如 L5-FC
  name: string;
  description: string | null;
  parent_code: string | null;
  status: 'locked' | 'available' | 'doing' | 'done';
  note: string | null;
  resource_url: string | null;
  est_hours: number | null; // 预计耗时
  actual_hours: number | null; // 实际耗时
  sort_order: number;
}

/** 成就勋章 */
export interface Achievement extends BaseEntity {
  code: string;
  title: string;
  description: string;
  unlocked_at: string | null;
}

/** 设置项（键值存储） */
export interface Setting {
  key: string;
  value: string;
}

/** 词汇（英语学习计划） */
export interface VocabWord extends BaseEntity {
  plan_id: string;
  word: string;
  meaning: string; // 释义（抓取或手填）
  learned_at: string; // 学习日期 day_key
  wrong_count: number; // 复习拼错次数
  last_wrong_at: string | null; // 最近拼错日期
}

/** 复习明细（英语学习计划） */
export interface VocabReview extends BaseEntity {
  plan_id: string;
  day_key: string;
  word_id: string;
  word: string; // 冗余存储,便于查询
  is_correct: 0 | 1;
}

/** AI 资讯条目（RSS 聚合抓取） */
export interface NewsItem extends BaseEntity {
  title: string;
  link: string; // 原文链接（唯一去重键）
  source: string; // 来源名，如 "机器之心"
  summary: string | null;
  published_at: string; // ISO 时间
  fetched_at: string; // ISO 时间
}

/* ---------------- 统计聚合类型 ---------------- */

/** 某计划连续打卡信息 */
export interface StreakInfo {
  plan_id: string;
  current_streak: number;
  longest_streak: number;
}

/** 年度热力图单日格 */
export interface HeatmapCell {
  day_key: string;
  done_count: number;
  total_count: number;
}

/** 完成率 */
export interface CompletionRate {
  plan_id: string;
  range: '7d' | '30d';
  done: number;
  total: number;
  rate: number;
}

/** WPM 折线图数据点 */
export interface WpmPoint {
  day_key: string;
  wpm: number;
  best: boolean;
}
