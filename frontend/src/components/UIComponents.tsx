import React from 'react';
import { 
  AlertTriangle, 
  Info, 
  Loader2, 
  TrendingUp, 
  TrendingDown, 
  Minus 
} from 'lucide-react';

/* =========================================================================
   1. KPI CARD COMPONENT
   ========================================================================= */
interface KPICardProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'neutral';
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
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
}) => {
  const toneClasses = {
    cyan: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/5',
    emerald: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
    amber: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
    rose: 'text-rose-400 border-rose-500/20 bg-rose-500/5',
    neutral: 'text-slate-300 border-[#1E2D40] bg-[#0E1622]',
  };

  const iconTones = {
    cyan: 'text-cyan-400 bg-cyan-950/40 border-cyan-500/30',
    emerald: 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30',
    amber: 'text-amber-400 bg-amber-950/40 border-amber-500/30',
    rose: 'text-rose-400 bg-rose-950/40 border-rose-500/30',
    neutral: 'text-slate-400 bg-[#141E2B] border-[#1E2D40]',
  };

  return (
    <div className={`rounded-xl border p-4 transition-all duration-150 ${toneClasses[tone]} flex flex-col justify-between shadow-xs`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </span>
        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${iconTones[tone]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline space-x-1.5">
          <span className="text-2xl font-bold tracking-tight text-white font-mono">
            {value}
          </span>
          {unit && (
            <span className="text-xs text-slate-400 font-mono">
              {unit}
            </span>
          )}
        </div>

        {(subtext || trend) && (
          <div className="flex items-center space-x-2 text-[11px] text-slate-400 pt-0.5">
            {trend && (
              <span className={`inline-flex items-center space-x-0.5 font-medium ${
                trend === 'up' ? 'text-amber-400' : trend === 'down' ? 'text-emerald-400' : 'text-slate-400'
              }`}>
                {trend === 'up' && <TrendingUp className="w-3 h-3" />}
                {trend === 'down' && <TrendingDown className="w-3 h-3" />}
                {trend === 'stable' && <Minus className="w-3 h-3" />}
                {trendValue && <span>{trendValue}</span>}
              </span>
            )}
            {subtext && <span>{subtext}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

/* =========================================================================
   2. RISK BADGE COMPONENT
   ========================================================================= */
interface RiskBadgeProps {
  score?: number;
  band?: 'Low' | 'Moderate' | 'High' | 'Critical' | string;
  size?: 'sm' | 'md';
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ score, band, size = 'md' }) => {
  // Infer band if only score is provided
  let effectiveBand = band;
  if (!effectiveBand && typeof score === 'number') {
    if (score >= 75) effectiveBand = 'Critical';
    else if (score >= 50) effectiveBand = 'High';
    else if (score >= 25) effectiveBand = 'Moderate';
    else effectiveBand = 'Low';
  }

  const bandStyles: Record<string, string> = {
    Low: 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30',
    Moderate: 'bg-amber-950/40 text-amber-300 border-amber-500/30',
    High: 'bg-orange-950/40 text-orange-300 border-orange-500/30',
    Critical: 'bg-rose-950/40 text-rose-300 border-rose-500/30',
  };

  const currentStyle = bandStyles[effectiveBand || 'Low'] || bandStyles.Low;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center space-x-1.5 font-mono font-medium rounded-md border ${currentStyle} ${padding}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        effectiveBand === 'Critical' ? 'bg-rose-400 animate-pulse' :
        effectiveBand === 'High' ? 'bg-orange-400' :
        effectiveBand === 'Moderate' ? 'bg-amber-400' : 'bg-emerald-400'
      }`} />
      <span>{effectiveBand}</span>
      {typeof score === 'number' && (
        <span className="opacity-80">({score.toFixed(1)})</span>
      )}
    </span>
  );
};

/* =========================================================================
   3. STATUS PILL COMPONENT
   ========================================================================= */
interface StatusPillProps {
  status: 'completed' | 'processing' | 'pending' | 'failed' | 'cancelled' | 'paused' | string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status }) => {
  const normalized = status.toLowerCase();
  const styles: Record<string, { bg: string; dot: string; text: string; label: string }> = {
    completed: {
      bg: 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300',
      dot: 'bg-emerald-400',
      text: 'text-emerald-300',
      label: 'Completed'
    },
    processing: {
      bg: 'bg-cyan-950/30 border-cyan-500/30 text-cyan-300',
      dot: 'bg-cyan-400 animate-pulse',
      text: 'text-cyan-300',
      label: 'Processing'
    },
    pending: {
      bg: 'bg-slate-900 border-slate-700 text-slate-300',
      dot: 'bg-slate-400',
      text: 'text-slate-300',
      label: 'Pending'
    },
    paused: {
      bg: 'bg-amber-950/30 border-amber-500/30 text-amber-300',
      dot: 'bg-amber-400',
      text: 'text-amber-300',
      label: 'Paused'
    },
    failed: {
      bg: 'bg-rose-950/30 border-rose-500/30 text-rose-300',
      dot: 'bg-rose-400',
      text: 'text-rose-300',
      label: 'Failed'
    },
    cancelled: {
      bg: 'bg-slate-900 border-slate-700 text-slate-400',
      dot: 'bg-slate-500',
      text: 'text-slate-400',
      label: 'Cancelled'
    },
  };

  const item = styles[normalized] || styles.pending;

  return (
    <span className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-medium ${item.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${item.dot}`} />
      <span>{item.label}</span>
    </span>
  );
};

/* =========================================================================
   4. EMPTY & ERROR STATE DISPLAY
   ========================================================================= */
interface EmptyStateProps {
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  icon?: React.ComponentType<{ className?: string }>;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionText,
  onAction,
  icon: Icon = Info,
}) => (
  <div className="rounded-xl border border-dashed border-[#1E2D40] bg-[#0A1018] p-8 text-center flex flex-col items-center justify-center space-y-3">
    <div className="w-12 h-12 rounded-xl bg-[#121C2B] border border-[#1E2D40] flex items-center justify-center text-slate-400">
      <Icon className="w-6 h-6" />
    </div>
    <div className="max-w-md space-y-1">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
    </div>
    {actionText && onAction && (
      <button
        onClick={onAction}
        className="mt-2 inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer"
      >
        <span>{actionText}</span>
      </button>
    )}
  </div>
);

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => (
  <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-5 text-center flex flex-col items-center justify-center space-y-2">
    <AlertTriangle className="w-6 h-6 text-rose-400" />
    <div className="text-xs font-medium text-rose-200">{message}</div>
    {onRetry && (
      <button
        onClick={onRetry}
        className="mt-1 px-3 py-1 rounded bg-rose-900/40 hover:bg-rose-900/60 border border-rose-500/40 text-xs text-rose-200 transition-colors cursor-pointer"
      >
        Retry Operation
      </button>
    )}
  </div>
);

/* =========================================================================
   5. LOADING SKELETON
   ========================================================================= */
export const LoadingBlock: React.FC<{ text?: string; height?: string }> = ({
  text = 'Accessing telemetry...',
  height = 'h-48',
}) => (
  <div className={`rounded-xl border border-[#1E2D40] bg-[#0E1622] ${height} flex flex-col items-center justify-center space-y-3 p-6 text-slate-400`}>
    <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
    <span className="text-xs font-mono">{text}</span>
  </div>
);
