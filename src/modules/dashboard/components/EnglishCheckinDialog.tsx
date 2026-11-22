import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Plus, ArrowRight, Loader2, Check, BookOpen, Languages,
  RotateCcw, PartyPopper, Volume2
} from 'lucide-react';
import type { Plan, EnglishPlanConfig, VocabWord } from '@shared/contracts';
import { todayKey } from '@shared/utils/date';
import './EnglishCheckinDialog.less';

/** 解析计划里的英语配置 */
function parseConfig(plan: Plan): EnglishPlanConfig {
  try {
    const cfg = JSON.parse(plan.config ?? '{}');
    return {
      dailyNewWords: Math.max(1, Number(cfg.dailyNewWords) || 5),
      dailyReviewWords: Math.max(0, Number(cfg.dailyReviewWords) || 0)
    };
  } catch {
    return { dailyNewWords: 5, dailyReviewWords: 10 };
  }
}

/** 一个待录入的词:输入中 → 查释义中 → 有释义(抓取/手填) */
interface NewWordDraft {
  word: string;
  meaning: string;
  phonetic: string | null;
  status: 'typing' | 'loading' | 'ok' | 'manual';
  lookupKey: string; // 最近一次已查过释义的单词(避免重复查询导致闪烁)
}

/** 复习题 */
interface ReviewQuestion {
  word: string;
  meaning: string;
  answer: string;
  result: null | 'correct' | 'wrong';
}

interface Props {
  plan: Plan;
  onDone: () => void; // 打卡完成(已入库)
  onClose: () => void; // 取消关闭(未入库)
}

/** 单例 audio 引用,避免重复播放与被 GC 中断 */
let currentAudio: HTMLAudioElement | null = null;

/**
 * 英语学习分步打卡弹窗(头部/内容/底部三段式,仅内容区滚动):
 * ① 录入今日新词(失焦联网查释义,失败可手填)
 * ② 复习:看义拼词(历史词库加权抽题;首日用今日新词即时巩固)
 * ③ 完成后单事务统一入库
 */
export default function EnglishCheckinDialog({ plan, onDone, onClose }: Props) {
  const cfg = useMemo(() => parseConfig(plan), [plan]);
  const [step, setStep] = useState<'input' | 'review' | 'done'>('input');
  const [playingWord, setPlayingWord] = useState<string | null>(null);

  /** 播放单词发音(有道语音接口,美音),带播放中状态反馈 */
  const playWord = (word: string) => {
    try {
      currentAudio?.pause();
      const audio = new Audio(
        `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word.trim().toLowerCase())}&type=2`
      );
      currentAudio = audio;
      setPlayingWord(word);
      audio.onended = () => setPlayingWord(null);
      audio.onerror = () => setPlayingWord(null);
      audio.play().catch((err) => {
        console.warn('[vocab] 发音播放失败', err);
        setPlayingWord(null);
      });
    } catch (err) {
      console.warn('[vocab] 发音播放异常', err);
      setPlayingWord(null);
    }
  };

  /** 发音按钮:mousedown 阻止默认,避免抢走输入框焦点触发失焦查询(闪烁根源) */
  const speakBtnProps = (word: string) => ({
    className: `speak-btn ${playingWord === word.trim().toLowerCase() ? 'playing' : ''}`,
    title: '播放发音',
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => playWord(word)
  });

  // —— 第一步:录词 ——
  const [drafts, setDrafts] = useState<NewWordDraft[]>(
    Array.from({ length: cfg.dailyNewWords }, () => ({
      word: '', meaning: '', phonetic: null, status: 'typing' as const, lookupKey: ''
    }))
  );

  const handleWordInput = (idx: number, word: string) => {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, word, status: 'typing' } : d)));
  };

  const handleWordBlur = async (idx: number) => {
    const w = drafts[idx].word.trim().toLowerCase();
    if (!w || !/^[a-z][a-z\s'-]*$/.test(w)) return;
    // 已查过同一单词且拿到释义 → 不重复查询(避免按钮闪烁/多余请求)
    if (drafts[idx].lookupKey === w && (drafts[idx].status === 'ok' || drafts[idx].status === 'manual')) {
      return;
    }
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, status: 'loading' } : d)));
    const res = await window.api.vocab.lookup(w);
    setDrafts((prev) =>
      prev.map((d, i) =>
        i === idx
          ? res.ok && res.meaning
            ? { ...d, word: w, meaning: res.meaning, phonetic: res.phonetic, status: 'ok', lookupKey: w }
            : { ...d, word: w, meaning: '', phonetic: null, status: 'manual', lookupKey: w }
          : d
      )
    );
  };

  const handleManualMeaning = (idx: number, meaning: string) => {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, meaning, status: 'manual' } : d)));
  };

  const readyCount = drafts.filter(
    (d) => d.status === 'ok' || (d.status === 'manual' && d.meaning.trim())
  ).length;
  const allWordsReady = readyCount === cfg.dailyNewWords;

  // —— 第二步:复习 ——
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [loadingPool, setLoadingPool] = useState(false);

  const startReview = async () => {
    setLoadingPool(true);
    const day = todayKey();
    let pool: VocabWord[] = [];
    if (cfg.dailyReviewWords > 0) {
      pool = await window.api.vocab.reviewPool(plan.id, cfg.dailyReviewWords, day);
    }
    // 首日(词库为空):用今日新词即时巩固
    if (pool.length === 0) {
      pool = drafts.map((d) => ({
        id: '', plan_id: plan.id, word: d.word, meaning: d.meaning, learned_at: day,
        wrong_count: 0, last_wrong_at: null,
        created_at: '', updated_at: '', deleted_at: null
      }));
    }
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setQuestions(
      shuffled.map((w) => ({ word: w.word, meaning: w.meaning, answer: '', result: null }))
    );
    setQIdx(0);
    setLoadingPool(false);
    setStep('review');
  };

  const submitAnswer = () => {
    const q = questions[qIdx];
    if (!q || !q.answer.trim()) return;
    const correct = q.answer.trim().toLowerCase() === q.word.toLowerCase();
    setQuestions((prev) =>
      prev.map((item, i) => (i === qIdx ? { ...item, result: correct ? 'correct' : 'wrong' } : item))
    );
  };

  const nextQuestion = () => {
    if (qIdx < questions.length - 1) {
      setQIdx(qIdx + 1);
    } else {
      setStep('done');
    }
  };

  const correctCount = questions.filter((q) => q.result === 'correct').length;

  // —— 第三步:单事务入库 ——
  const [submitting, setSubmitting] = useState(false);

  const finishCheckin = async () => {
    setSubmitting(true);
    try {
      await window.api.vocab.submit({
        planId: plan.id,
        dayKey: todayKey(),
        words: drafts.map((d) => ({ word: d.word.trim().toLowerCase(), meaning: d.meaning })),
        reviews: questions.map((q) => ({ word: q.word, isCorrect: q.result === 'correct' }))
      });
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  const stepIdx = step === 'input' ? 0 : step === 'review' ? 1 : 2;
  const currentQ = questions[qIdx];

  // Portal 到 body:卡片上的 backdrop-filter 会让 fixed 定位相对卡片,导致弹窗层级/居中错乱
  return createPortal(
    <div className="eng-overlay" onClick={step === 'done' ? undefined : onClose}>
      <div className="eng-dialog" onClick={(e) => e.stopPropagation()}>
        {/* —— 头部(固定) —— */}
        <div className="eng-header">
          <Languages size={17} />
          <h3>{plan.name} · 背单词打卡</h3>
          <button className="close-btn" onClick={onClose} disabled={submitting}>
            <X size={16} />
          </button>
        </div>

        {/* 步骤指示(固定) */}
        <div className="eng-steps">
          {['录入新词', '复习拼词', '完成'].map((label, i) => (
            <div key={label} className={`step ${i === stepIdx ? 'current' : ''} ${i < stepIdx ? 'past' : ''}`}>
              <span className="step-dot">{i + 1}</span>
              <span className="step-label">{label}</span>
            </div>
          ))}
        </div>

        {/* —— 中间内容(唯一可滚动区域) —— */}
        <div className="eng-scroll">
          {/* ① 录词 */}
          {step === 'input' && (
            <div className="eng-body">
              <p className="eng-tip muted">
                录入今天学过的 {cfg.dailyNewWords} 个单词,输入后按回车或点击其他位置自动获取释义
              </p>
              <div className="word-rows">
                {drafts.map((d, i) => (
                  <div key={i} className={`word-row ${d.status}`}>
                    <span className="row-num">{i + 1}</span>
                    <input
                      className="word-input"
                      type="text"
                      value={d.word}
                      placeholder="输入单词"
                      maxLength={40}
                      disabled={submitting}
                      autoFocus={i === 0}
                      onChange={(e) => handleWordInput(i, e.target.value)}
                      onBlur={() => handleWordBlur(i)}
                      onKeyDown={(e) => e.key === 'Enter' && handleWordBlur(i)}
                    />
                    {d.status === 'loading' ? (
                      <Loader2 size={15} className="row-loading" />
                    ) : d.status === 'ok' ? (
                      <div className="row-meaning">
                        {d.phonetic && <span className="phonetic">/{d.phonetic}/</span>}
                        <span className="meaning">{d.meaning}</span>
                      </div>
                    ) : d.status === 'manual' ? (
                      <input
                        className="meaning-input"
                        type="text"
                        placeholder="未查到释义,手动输入中文意思"
                        maxLength={100}
                        value={d.meaning}
                        onChange={(e) => handleManualMeaning(i, e.target.value)}
                      />
                    ) : (
                      <span className="row-meaning muted">待输入…</span>
                    )}

                    {/* 发音按钮:已录入单词即可播放 */}
                    {d.word.trim() && d.status !== 'loading' && (
                      <button {...speakBtnProps(d.word)}>
                        <Volume2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ② 复习 */}
          {step === 'review' && currentQ && (
            <div className="eng-body">
              <p className="eng-tip muted">根据释义拼写出单词(忽略大小写);拼错的词明天会优先出现</p>
              <div className="review-card">
                <div className="review-progress">
                  {qIdx + 1} / {questions.length}
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${((qIdx + 1) / questions.length) * 100}%` }} />
                  </div>
                </div>
                <BookOpen size={22} className="review-icon" />
                <p className="review-meaning">{currentQ.meaning}</p>
                <input
                  className="review-input"
                  type="text"
                  placeholder="拼写出对应的英文单词…"
                  value={currentQ.answer}
                  autoFocus
                  disabled={currentQ.result !== null}
                  onChange={(e) =>
                    setQuestions((prev) =>
                      prev.map((q, i) => (i === qIdx ? { ...q, answer: e.target.value } : q))
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && currentQ.result === null) submitAnswer();
                  }}
                />
                {currentQ.result !== null && (
                  <div className={`review-result ${currentQ.result}`}>
                    {currentQ.result === 'correct' ? (
                      <>
                        <Check size={14} /> 正确! {currentQ.word}
                      </>
                    ) : (
                      <>正确拼写:{currentQ.word}</>
                    )}
                    <button {...speakBtnProps(currentQ.word)}>
                      <Volume2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ③ 完成预览(未入库,点底部按钮才入库) */}
          {step === 'done' && (
            <div className="eng-body done-body">
              <PartyPopper size={40} className="done-icon" />
              <h4>今日学习完成!</h4>
              <div className="done-stats">
                <div className="done-stat">
                  <span className="num">{drafts.filter((d) => d.word.trim()).length}</span>
                  <span className="label">新词</span>
                </div>
                <div className="done-stat">
                  <span className="num">{correctCount}</span>
                  <span className="label">复习答对</span>
                </div>
                <div className="done-stat">
                  <span className="num">{questions.length - correctCount}</span>
                  <span className="label">待巩固</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* —— 底部操作(固定) —— */}
        {step === 'input' && (
          <div className="eng-footer">
            <span className="muted progress-text">{readyCount}/{cfg.dailyNewWords} 已就绪</span>
            <button
              className="primary-btn"
              disabled={!allWordsReady || loadingPool}
              onClick={startReview}
            >
              {loadingPool ? <Loader2 size={15} className="spinning" /> : <ArrowRight size={15} />}
              进入复习
            </button>
          </div>
        )}

        {step === 'review' && currentQ && (
          <div className="eng-footer">
            <span className="muted progress-text">已答对 {correctCount}/{questions.length}</span>
            {currentQ.result === null ? (
              <button className="primary-btn" onClick={submitAnswer} disabled={!currentQ.answer.trim()}>
                提交答案
              </button>
            ) : (
              <button className="primary-btn" onClick={nextQuestion}>
                {qIdx < questions.length - 1 ? (
                  <>下一题 <ArrowRight size={15} /></>
                ) : (
                  <>完成打卡 <Check size={15} /></>
                )}
              </button>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="eng-footer center">
            <button
              className="ghost-btn"
              disabled={submitting}
              onClick={() => {
                // 重置答题状态再复习一轮
                setQuestions((prev) => prev.map((q) => ({ ...q, answer: '', result: null })));
                setQIdx(0);
                setStep('review');
              }}
            >
              <RotateCcw size={14} /> 再复习一轮
            </button>
            <button className="primary-btn" onClick={finishCheckin} disabled={submitting}>
              {submitting ? <Loader2 size={15} className="spinning" /> : <Check size={15} />}
              确认打卡
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
