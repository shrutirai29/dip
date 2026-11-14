import React from 'react';
import { 
  AlertTriangle, 
  Info, 
  Loader2, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  CheckCircle2,
  X,
  ShieldAlert,
  Cpu,
  Layers,
  Radio,
  Activity,
  ArrowRight
} from 'lucide-react';

/* =========================================================================
   1. CONSOLE METRIC STRIP & ITEM COMPONENTS
   ========================================================================= */
export interface MetricItemProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  tone?: 'slate' | 'teal' | 'rose' | 'burgundy' | 'deepteal' | 'amber' | 'emerald' | 'cyan' | 'neutral';
  icon?: React.ComponentType<{ className?: string }>;
}

export const MetricItem: React.FC<MetricItemProps> = ({
  label,
  value,
  unit,
  subtext,
  tone = 'neutral',
  icon: Icon,
}) => {
  const toneAccent: Record<string, string> = {
    slate: 'text-ink-2',
    teal: 'text-cool',
    cyan: 'text-cool',
    rose: 'text-bad',
    burgundy: 'text-burgundy',
    deepteal: 'text-ink',
    emerald: 'text-ok',
    amber: 'text-warn',
    neutral: 'text-ink',
  };

  const isPendingText =
    typeof value === 'string' &&
    (value.includes('...') ||
      /^(measuring|computing|calculating|pending|loading|initializing|standby|calibrating|connecting)/i.test(value.trim()));

  const isBlank =
    value === undefined ||
    value === null ||
    value === '—' ||
    value === '-' ||
    value === 'N/A' ||
    value === '';

  return (
    <div className="flex-1 min-w-[130px] px-3.5 py-3 overflow-hidden bg-paper-2 border-r border-rule last:border-r-0 flex flex-col justify-between">
      <div className="flex items-center space-x-1.5 text-xs text-muted mb-1 truncate">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline space-x-1.5 min-w-0 overflow-hidden whitespace-nowrap h-7">
        {isPendingText ? (
          <span className="text-xs font-mono font-medium text-muted motion-safe:animate-pulse truncate inline-flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-burgundy/70 motion-safe:animate-ping shrink-0" />
            <span className="truncate">{value}</span>
          </span>
        ) : isBlank ? (
          <span className="text-base font-mono text-muted/60">—</span>
        ) : (
          <>
            <span className={`text-lg sm:text-xl font-semibold tracking-tight font-mono tabular-nums truncate ${toneAccent[tone] || toneAccent.neutral}`}>
              {value}
            </span>
            {unit && (
              <span className="text-xs font-mono text-muted shrink-0 whitespace-nowrap">
                {unit}
              </span>
            )}
          </>
        )}
      </div>
      {subtext && (
        <p className="text-[11px] text-muted truncate mt-1">
          {subtext}
        </p>
      )}
    </div>
  );
};

export const MetricStrip: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div className={`w-full flex flex-wrap lg:flex-nowrap divide-y sm:divide-y-0 divide-rule bg-paper-2 border border-rule rounded-lg overflow-hidden select-none shadow-2xs ${className}`}>
    {children}
  </div>
);

/* =========================================================================
   2. KPI CARD (Editorial Command Center)
   ========================================================================= */
interface KPICardProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'slate' | 'teal' | 'rose' | 'burgundy' | 'deepteal' | 'amber' | 'emerald' | 'cyan' | 'neutral';
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  isRiskCard?: boolean;
}

export const KPICard: React.FC<KPICardProps> = ({
  label,
  value,
  unit,
  subtext,
  icon: Icon,
  tone = 'neutral',
  trend,
  trendValue,
  isRiskCard = false,
}) => {
  const iconTones: Record<string, string> = {
    slate: 'text-muted bg-paper-3 border-rule',
    teal: 'text-cool bg-cool-soft border-rule',
    cyan: 'text-cool bg-cool-soft border-rule',
    rose: 'text-bad bg-bad-soft border-rule',
    burgundy: 'text-burgundy bg-burgundy-soft border-rule',
    deepteal: 'text-ink bg-paper-3 border-rule',
    emerald: 'text-ok bg-ok-soft border-rule',
    amber: 'text-warn bg-warn-soft border-rule',
    neutral: 'text-muted bg-paper-3 border-rule',
  };

  return (
    <div className={`rounded-lg border p-3.5 transition-colors duration-150 flex flex-col justify-between shadow-2xs ${
      isRiskCard ? 'bg-burgundy-soft/40 border-burgundy/20' : 'bg-paper-2 border-rule'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-muted tracking-tight">
          {label}
        </span>
        <div className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${iconTones[tone] || iconTones.neutral}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline space-x-1.5">
          <span className={`text-xl sm:text-2xl font-semibold tracking-tight font-mono tabular-nums ${
            isRiskCard ? 'text-burgundy' : 'text-ink'
          }`}>
            {value}
          </span>
          {unit && (
            <span className="text-xs text-muted font-mono">
              {unit}
            </span>
          )}
        </div>

        {(subtext || trend) && (
          <div className="flex items-center space-x-2 text-[11px] text-muted pt-0.5 truncate">
            {trend && (
              <span className={`inline-flex items-center space-x-0.5 font-medium shrink-0 ${
                trend === 'up' ? 'text-warn' : trend === 'down' ? 'text-ok' : 'text-muted'
              }`}>
                {trend === 'up' && <TrendingUp className="w-3 h-3" />}
                {trend === 'down' && <TrendingDown className="w-3 h-3" />}
                {trend === 'stable' && <Minus className="w-3 h-3" />}
                {trendValue && <span>{trendValue}</span>}
              </span>
            )}
            {subtext && <span className="truncate">{subtext}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

/* =========================================================================
   3. RISK BADGE (Small Severity Pills)
   ========================================================================= */
interface RiskBadgeProps {
  score?: number;
  band?: 'Low' | 'Moderate' | 'High' | 'Critical' | string;
  size?: 'sm' | 'md';
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ score, band, size = 'sm' }) => {
  let effectiveBand = band;
  if (!effectiveBand && typeof score === 'number') {
    if (score >= 70) effectiveBand = 'High';
    else if (score >= 40) effectiveBand = 'Moderate';
    else effectiveBand = 'Low';
  }

  const bandStyles: Record<string, string> = {
    Low: 'bg-ok-soft text-ok border-ok/20',
    Moderate: 'bg-warn-soft text-warn border-warn/25',
    High: 'bg-burgundy-soft text-burgundy border-burgundy/25 font-semibold',
    Critical: 'bg-bad-soft text-bad border-bad/30 font-semibold',
  };

  const currentStyle = bandStyles[effectiveBand || 'Low'] || bandStyles.Low;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center space-x-1.5 rounded-full border font-mono ${currentStyle} ${padding}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      <span>{effectiveBand}</span>
      {typeof score === 'number' && (
        <span className="opacity-90 font-mono">({score.toFixed(0)}%)</span>
      )}
    </span>
  );
};

/* =========================================================================
   4. STATUS PILL
   ========================================================================= */
export const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const normalized = status.toLowerCase();
  const styles: Record<string, { bg: string; dot: string; label: string }> = {
    completed: { bg: 'bg-ok-soft text-ok border-ok/20', dot: 'bg-ok', label: 'Completed' },
    processing: { bg: 'bg-warn-soft text-warn border-warn/25', dot: 'bg-warn animate-pulse', label: 'Processing' },
    pending: { bg: 'bg-paper-3 text-muted border-rule', dot: 'bg-muted', label: 'Pending' },
    paused: { bg: 'bg-warn-soft text-warn border-warn/20', dot: 'bg-warn', label: 'Paused' },
    failed: { bg: 'bg-bad-soft text-bad border-bad/20', dot: 'bg-bad', label: 'Failed' },
    cancelled: { bg: 'bg-paper-3 text-muted border-rule', dot: 'bg-muted', label: 'Cancelled' },
  };

  const item = styles[normalized] || styles.pending;

  return (
    <span className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full border text-[11px] font-mono ${item.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${item.dot}`} />
      <span>{item.label}</span>
    </span>
  );
};

/* =========================================================================
   5. RESTICKED RESTRAINED RISK GAUGE
   ========================================================================= */
interface RiskGaugeProps {
  score?: number | null;
  band?: string | null;
  density?: number | null;
  flowSpeed?: number | null;
  entropy?: number | null;
  surge?: string | number | null;
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({
  score = null,
  band = null,
  density = null,
  flowSpeed = null,
  entropy = null,
  surge = null,
}) => {
  const hasValue = typeof score === 'number';
  const clampedScore = hasValue ? Math.max(0, Math.min(100, score)) : 0;
  const radius = 70;
  const strokeWidth = 10;
  const circumference = Math.PI * radius;
  const strokeDashoffset = hasValue ? circumference - (clampedScore / 100) * circumference : circumference;

  const getToneColor = (val: number) => {
    if (val >= 70) return '#7F1D2D'; // Burgundy
    if (val >= 40) return '#B45309'; // Amber
    return '#15803D'; // Green
  };

  const activeColor = hasValue ? getToneColor(clampedScore) : '#E7E1DC';

  return (
    <div className="bg-paper-2 border border-rule rounded-xl p-5 shadow-2xs flex flex-col justify-between">
      <div className="flex items-center justify-between pb-3 border-b border-rule">
        <div>
          <h3 className="text-sm font-semibold text-ink font-display">Risk Analysis</h3>
          <p className="text-[11px] text-muted">Composite multi-factor crowd assessment</p>
        </div>
        {hasValue ? (
          <RiskBadge score={clampedScore} band={band || (clampedScore >= 70 ? 'High' : clampedScore >= 40 ? 'Moderate' : 'Low')} />
        ) : (
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-paper-3 text-muted border border-rule">
            Idle / Standby
          </span>
        )}
      </div>

      {/* Semi-circular gauge */}
      <div className="flex flex-col items-center justify-center my-3">
        <div className="relative w-44 h-24 flex items-end justify-center overflow-hidden">
          <svg className="w-44 h-44 absolute -top-0" viewBox="0 0 160 160">
            {/* Background Track */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="#E7E1DC"
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={0}
              transform="rotate(180 80 80)"
              strokeLinecap="round"
            />
            {/* Value Arc */}
            {hasValue && (
              <circle
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={activeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(180 80 80)"
                strokeLinecap="round"
                className="transition-[stroke-dashoffset] duration-700 ease-out"
              />
            )}
          </svg>

          {/* Centered score text */}
          <div className="text-center pb-1">
            <span className="text-3xl font-bold font-mono tracking-tight text-ink tabular-nums">
              {hasValue ? `${clampedScore.toFixed(0)}%` : '—'}
            </span>
            <div className="text-xs font-semibold text-muted tracking-wide uppercase font-mono">
              {hasValue ? (band || (clampedScore >= 70 ? 'High Risk' : clampedScore >= 40 ? 'Moderate' : 'Low Risk')) : 'No Active Feed'}
            </div>
          </div>
        </div>
      </div>

      {/* 4 Factor Telemetry Sub-ribbon */}
      <div className="grid grid-cols-4 gap-2 pt-3 border-t border-rule font-mono text-center">
        <div className="p-1.5 bg-paper-3/60 rounded border border-rule/60">
          <div className="text-[10px] text-muted font-sans">Density</div>
          <div className="text-xs font-semibold text-ink mt-0.5">{typeof density === 'number' ? density.toFixed(2) : '—'}</div>
        </div>
        <div className="p-1.5 bg-paper-3/60 rounded border border-rule/60">
          <div className="text-[10px] text-muted font-sans">Avg. Flow</div>
          <div className="text-xs font-semibold text-ink mt-0.5">{typeof flowSpeed === 'number' ? `${flowSpeed.toFixed(2)} m/s` : '—'}</div>
        </div>
        <div className="p-1.5 bg-paper-3/60 rounded border border-rule/60">
          <div className="text-[10px] text-muted font-sans">Entropy</div>
          <div className="text-xs font-semibold text-ink mt-0.5">{typeof entropy === 'number' ? entropy.toFixed(2) : '—'}</div>
        </div>
        <div className="p-1.5 bg-paper-3/60 rounded border border-rule/60">
          <div className="text-[10px] text-muted font-sans">Surge</div>
          <div className="text-xs font-semibold text-burgundy mt-0.5">{surge ? (typeof surge === 'number' ? `+${surge}%` : surge) : '—'}</div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   6. 10-SECOND PREDICTIVE FORECAST CHART
   ========================================================================= */
interface ForecastChartProps {
  currentRisk?: number | null;
  projectedRisk?: number | null;
}

export const ForecastChart: React.FC<ForecastChartProps> = ({
  currentRisk = null,
  projectedRisk = null,
}) => {
  const hasData = typeof currentRisk === 'number' && typeof projectedRisk === 'number';

  const points = hasData
    ? [
        { label: 'Now', risk: currentRisk },
        { label: '+2s', risk: currentRisk + (projectedRisk - currentRisk) * 0.2 },
        { label: '+4s', risk: currentRisk + (projectedRisk - currentRisk) * 0.4 },
        { label: '+6s', risk: currentRisk + (projectedRisk - currentRisk) * 0.6 },
        { label: '+8s', risk: currentRisk + (projectedRisk - currentRisk) * 0.8 },
        { label: '+10s', risk: projectedRisk },
      ]
    : [];

  return (
    <div className="bg-paper-2 border border-rule rounded-xl p-5 shadow-2xs flex flex-col justify-between">
      <div className="flex items-center justify-between pb-3 border-b border-rule">
        <div>
          <h3 className="text-sm font-semibold text-ink font-display">10-Second Forecast</h3>
          <p className="text-[11px] text-muted">Linear trend projection (+10s predictive risk horizon)</p>
        </div>
        <div className="text-right">
          <span className="text-[11px] text-muted font-sans">At +10s: </span>
          <span className="text-xs font-bold font-mono text-burgundy tabular-nums">
            {typeof projectedRisk === 'number' ? `${projectedRisk.toFixed(0)}%` : '—'}
          </span>
        </div>
      </div>

      <div className="pt-4 pb-2">
        {hasData ? (
          <>
            <div className="relative h-24 w-full flex items-end">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-40">
                <div className="border-b border-dashed border-rule w-full" />
                <div className="border-b border-dashed border-rule w-full" />
                <div className="border-b border-dashed border-rule w-full" />
              </div>

              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 50">
                <polyline
                  fill="none"
                  stroke="#7F1D2D"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={points.map((p, idx) => `${idx * 20},${Math.max(4, Math.min(46, 50 - (p.risk / 100) * 45))}`).join(' ')}
                />
                {points.map((p, idx) => (
                  <circle
                    key={p.label}
                    cx={idx * 20}
                    cy={Math.max(4, Math.min(46, 50 - (p.risk / 100) * 45))}
                    r={idx === points.length - 1 ? 3.5 : 2}
                    fill="#7F1D2D"
                  />
                ))}
              </svg>
            </div>

            <div className="flex justify-between text-[11px] font-mono text-muted pt-2 border-t border-rule mt-1">
              {points.map((p) => (
                <div key={p.label} className="text-center">
                  <span className={p.label === '+10s' ? 'text-burgundy font-semibold' : ''}>{p.label}</span>
                  <div className="text-[10px] text-ink-2 font-medium">{p.risk.toFixed(0)}%</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="h-28 flex flex-col items-center justify-center text-center p-4 text-muted">
            <span className="text-xs font-mono">No active forecast trajectory</span>
            <span className="text-[11px] mt-1 text-muted/70">Connect a camera or analyze footage to compute real-time risk predictions</span>
          </div>
        )}
      </div>
    </div>
  );
};

/* =========================================================================
   7. SYSTEM ARCHITECTURE PIPELINE (Connected Horizontal Modules)
   ========================================================================= */
export const ArchitecturePipeline: React.FC = () => {
  const steps = [
    {
      num: '1',
      title: 'Inference Engine',
      desc: 'YOLOv8 + Centroid Tracking',
      status: 'Active',
      metric: '25.0 FPS',
      icon: Cpu,
    },
    {
      num: '2',
      title: 'DIP Motion Analysis',
      desc: 'Optical Flow + Directional Entropy',
      status: 'Active',
      metric: '14.2 ms',
      icon: Activity,
    },
    {
      num: '3',
      title: '4-Factor Risk Engine',
      desc: 'Density + Flow + Entropy + Surge',
      status: 'Evaluating',
      metric: '0-100 Score',
      icon: ShieldAlert,
    },
    {
      num: '4',
      title: 'Multi-Camera Ingestion',
      desc: 'NVR Sync + 3×3 Spatial Matrix',
      status: 'Ready',
      metric: '9 Quadrants',
      icon: Radio,
    },
  ];

  return (
    <div className="bg-paper-2 border border-rule rounded-xl p-5 shadow-2xs">
      <div className="flex items-center justify-between pb-3 border-b border-rule mb-4">
        <div>
          <h3 className="text-sm font-semibold text-ink font-display">System Architecture</h3>
          <p className="text-[11px] text-muted">Real-time DIP computer vision and predictive intelligence pipeline</p>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-ok-soft text-ok border border-ok/20 font-medium">
          Pipeline Synchronized
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <div key={step.num} className="relative flex-1 p-3.5 bg-paper rounded-lg border border-rule flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-7 h-7 rounded-md bg-paper-3 border border-rule flex items-center justify-center text-burgundy">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] font-mono text-muted">Step 0{step.num}</span>
                </div>
                <h4 className="text-xs font-semibold text-ink">{step.title}</h4>
                <p className="text-[11px] text-muted mt-0.5 leading-snug">{step.desc}</p>
              </div>

              <div className="flex items-center justify-between pt-3 mt-3 border-t border-rule/60 text-[11px] font-mono">
                <span className="text-muted">{step.status}</span>
                <span className="font-medium text-ink-2">{step.metric}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* =========================================================================
   8. EMPTY, LOADING, AND ERROR STATES
   ========================================================================= */
export const EmptyState: React.FC<{
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  icon?: React.ComponentType<{ className?: string }>;
}> = ({ title, description, actionText, onAction, icon: Icon = Info }) => (
  <div className="rounded-xl border border-dashed border-rule bg-paper-2 p-8 text-center flex flex-col items-center justify-center space-y-3">
    <div className="w-10 h-10 rounded-lg bg-paper-3 border border-rule flex items-center justify-center text-muted">
      <Icon className="w-5 h-5" />
    </div>
    <div className="max-w-md space-y-1">
      <h3 className="text-sm font-semibold text-ink font-display">{title}</h3>
      <p className="text-xs text-muted leading-relaxed">{description}</p>
    </div>
    {actionText && onAction && (
      <button
        onClick={onAction}
        className="mt-2 inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-md text-xs font-medium bg-burgundy text-white hover:bg-burgundy-hover transition-colors cursor-pointer"
      >
        <span>{actionText}</span>
      </button>
    )}
  </div>
);

export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({
  message,
  onRetry,
}) => (
  <div className="rounded-xl border border-bad/30 bg-bad-soft p-5 text-center flex flex-col items-center justify-center space-y-2">
    <AlertTriangle className="w-5 h-5 text-bad" />
    <div className="text-xs font-medium text-bad">{message}</div>
    {onRetry && (
      <button
        onClick={onRetry}
        className="mt-1 px-3 py-1 rounded-md bg-paper border border-rule text-xs font-medium text-ink hover:bg-paper-3 transition-colors cursor-pointer"
      >
        Retry operation
      </button>
    )}
  </div>
);

export const LoadingBlock: React.FC<{ text?: string; height?: string }> = ({
  text = 'Accessing telemetry...',
  height = 'h-48',
}) => (
  <div className={`rounded-xl border border-rule bg-paper-2 ${height} flex flex-col items-center justify-center space-y-3 p-6 text-muted`}>
    <Loader2 className="w-5 h-5 text-burgundy animate-spin" />
    <span className="text-xs font-mono">{text}</span>
  </div>
);
