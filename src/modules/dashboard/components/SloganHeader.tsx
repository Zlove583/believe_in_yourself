import { useEffect, useMemo, useState } from 'react';
import { DAILY_SLOGANS, GENTLE_WORDS } from '@shared/constants';
import { beijingDateKey, formatBeijingPrettyChinese } from '@shared/utils/date';
import './SloganHeader.less';

/** 首屏 Slogan + 日期 + 温柔文案 */
export default function SloganHeader() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const today = useMemo(() => formatBeijingPrettyChinese(now), [now]);
  const dailyIndex = useMemo(() => {
    const dateKey = beijingDateKey(now);
    const dayNumber = Number(dateKey.replaceAll('-', ''));
    return dayNumber;
  }, [now]);
  const slogan = DAILY_SLOGANS[dailyIndex % DAILY_SLOGANS.length];
  const word = GENTLE_WORDS[dailyIndex % GENTLE_WORDS.length];

  return (
    <section className="slogan-header card">
      <div className="date-row">
        <span className="date-text">{today}</span>
      </div>
      <h1 className="slogan-text">{slogan}</h1>
      <p className="gentle-word">{word}</p>
    </section>
  );
}
