import type { VocabWord, Checkin } from '@shared/types';
import { uuid, db } from './base';
import { checkinRepository } from './checkins';

/**
 * 词汇仓储（英语学习计划）：
 * - reviewPool: 全库随机 + 错词/新词加权抽题
 * - submitCheckin: 打卡全流程完成后单事务入库（checkin + words + reviews）
 */

export interface VocabSubmitInput {
  planId: string;
  dayKey: string;
  words: Array<{ word: string; meaning: string }>;
  reviews: Array<{ word: string; isCorrect: boolean }>;
}

/** 加权抽词:错词(wrong_count)与近 3 天新词优先 */
export function pickReviewPool(planId: string, count: number, todayKey: string): VocabWord[] {
  const rows = db()
    .prepare(
      `SELECT * FROM vocab_words
       WHERE plan_id = ? AND deleted_at IS NULL AND learned_at < ?
       ORDER BY learned_at DESC LIMIT 500`
    )
    .all(planId, todayKey) as VocabWord[];

  if (rows.length === 0) return [];

  // 权重:1 基础 + 错词*4 + 近3天学的*3(记忆未巩固)
  const today = new Date(todayKey);
  const weights = rows.map((w) => {
    let weight = 1 + w.wrong_count * 4;
    const learned = new Date(w.learned_at);
    const days = Math.floor((today.getTime() - learned.getTime()) / 86400000);
    if (days <= 3) weight += 3;
    return weight;
  });

  // 加权无放回抽样
  const pool = [...rows];
  const poolWeights = [...weights];
  const picked: VocabWord[] = [];
  for (let i = 0; i < Math.min(count, rows.length); i++) {
    const total = poolWeights.reduce((s, x) => s + x, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= poolWeights[idx];
      if (r <= 0) break;
    }
    if (idx >= pool.length) idx = pool.length - 1;
    picked.push(pool[idx]);
    pool.splice(idx, 1);
    poolWeights.splice(idx, 1);
  }
  return picked;
}

/** 英语打卡提交:单事务写入打卡记录 + 新词 + 复习明细 */
export function submitVocabCheckin(input: VocabSubmitInput): Checkin {
  const d = db();
  const run = d.transaction(() => {
    // 1. 新词 upsert(重复学习同一词则更新学习日期与释义;软删除的词重新学习则复活)
    const upsertWord = d.prepare(`
      INSERT INTO vocab_words (id, plan_id, word, meaning, learned_at)
      VALUES (@id, @planId, @word, @meaning, @learnedAt)
      ON CONFLICT(plan_id, word) DO UPDATE SET
        meaning = excluded.meaning,
        learned_at = excluded.learned_at,
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    `);
    for (const w of input.words) {
      upsertWord.run({
        id: uuid(),
        planId: input.planId,
        word: w.word.trim().toLowerCase(),
        meaning: w.meaning,
        learnedAt: input.dayKey
      });
    }

    // 2. 复习明细 + 错词计数
    const findWord = d.prepare(
      `SELECT id FROM vocab_words WHERE plan_id = ? AND word = ? AND deleted_at IS NULL`
    );
    const insertReview = d.prepare(`
      INSERT INTO vocab_reviews (id, plan_id, day_key, word_id, word, is_correct)
      VALUES (@id, @planId, @dayKey, @wordId, @word, @isCorrect)
    `);
    const markWrong = d.prepare(
      `UPDATE vocab_words SET wrong_count = wrong_count + 1, last_wrong_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    );
    for (const r of input.reviews) {
      const word = r.word.trim().toLowerCase();
      const row = findWord.get(input.planId, word) as { id: string } | undefined;
      if (!row) continue; // 词库中不存在(理论上不会发生)
      insertReview.run({
        id: uuid(),
        planId: input.planId,
        dayKey: input.dayKey,
        wordId: row.id,
        word,
        isCorrect: r.isCorrect ? 1 : 0
      });
      if (!r.isCorrect) markWrong.run(input.dayKey, row.id);
    }

    // 3. 打卡记录(value = 今日新词数)
    return checkinRepository.check({
      planId: input.planId,
      dayKey: input.dayKey,
      done: 1,
      value: input.words.length,
      note: `新词 ${input.words.length} 个，复习 ${input.reviews.length} 题`
    });
  });
  return run();
}

/** 历史词数统计(用于首日判断与展示) */
export function getVocabStats(planId: string): { total: number; wrong: number } {
  const total = (
    db()
      .prepare(`SELECT COUNT(*) AS c FROM vocab_words WHERE plan_id = ? AND deleted_at IS NULL`)
      .get(planId) as { c: number }
  ).c;
  const wrong = (
    db()
      .prepare(
        `SELECT COUNT(*) AS c FROM vocab_words WHERE plan_id = ? AND deleted_at IS NULL AND wrong_count > 0`
      )
      .get(planId) as { c: number }
  ).c;
  return { total, wrong };
}
