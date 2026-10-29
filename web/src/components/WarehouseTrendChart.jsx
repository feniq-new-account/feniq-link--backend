import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSyp } from '../utils/currency';

export function WarehouseTrendChart({ daily }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(null);
  const [width, setWidth] = useState(720);
  const frame = useRef(null);
  useEffect(() => {
    if (!frame.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(180, entry.contentRect.width)));
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  if (!daily.length) return null;
  const index = Math.min(selected ?? daily.length - 1, daily.length - 1);
  const values = daily.flatMap((row) => [row.netSalesSyp, row.collectionsSyp]);
  const low = Math.min(0, ...values), high = Math.max(1, ...values);
  const x = (i) => daily.length === 1 ? 90 + (width - 110) / 2 : 90 + i / (daily.length - 1) * (width - 110);
  const y = (value) => 205 - (value - low) / (high - low) * 180;
  const points = (key) => daily.map((row, i) => `${x(i)},${y(row[key])}`).join(' ');
  const current = daily[index];
  return <section className="wh-detail-card insights-trend">
    <h2>{t('insights.trend')}</h2>
    <div className="insights-legend"><span className="sales-dot" />{t('insights.netSales')}<span className="collections-dot" />{t('insights.collections')}</div>
    <div ref={frame}><svg height="245" width="100%" viewBox={`0 0 ${width} 245`} role="img" aria-label={t('insights.trend')}>
      {[low, (low + high) / 2, high].map((value, i) => <g key={i}>
        <line x1="90" x2={width - 20} y1={y(value)} y2={y(value)} stroke="#dce4ee" strokeDasharray="4 5" />
        <text x="80" y={y(value) + 4} textAnchor="end" fontSize="11" fill="#52657a" direction="ltr">{Math.round(value).toLocaleString('en-US')}</text>
      </g>)}
      <polyline points={points('netSalesSyp')} fill="none" stroke="#126b68" strokeWidth="3" />
      <polyline points={points('collectionsSyp')} fill="none" stroke="#ed7a23" strokeWidth="3" />
      {daily.map((row, i) => <g key={row.date} onMouseEnter={() => setSelected(i)} onClick={() => setSelected(i)}>
        <circle cx={x(i)} cy={y(row.netSalesSyp)} r={i === index ? 5 : 2} fill="#126b68" />
        <circle cx={x(i)} cy={y(row.collectionsSyp)} r={i === index ? 5 : 2} fill="#ed7a23" />
      </g>)}
      <text x="90" y="232" fontSize="12" fill="#52657a" textAnchor="start" direction="ltr">{daily[0].date}</text>
      {daily.length > 1 && <text x={width - 20} y="232" fontSize="12" fill="#52657a" textAnchor="end" direction="ltr">{daily.at(-1).date}</text>}
    </svg></div>
    <label className="insights-chart-picker">{t('insights.inspectDay')}
      <input type="range" min="0" max={Math.max(0, daily.length - 1)} value={index} disabled={daily.length === 1}
        onChange={(event) => setSelected(Number(event.target.value))} aria-valuetext={`${current.date}: ${formatSyp(current.netSalesSyp)}, ${formatSyp(current.collectionsSyp)}`} />
    </label>
    <output className="insights-chart-detail"><span dir="ltr">{current.date}</span> · {t('insights.netSales')}: <b>{formatSyp(current.netSalesSyp)}</b> · {t('insights.collections')}: <b>{formatSyp(current.collectionsSyp)}</b></output>
  </section>;
}
