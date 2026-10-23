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
   1. KPI CARD & CONSOLE METRIC STRIP COMPONENTS
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
    slate: 'text-[#2F4454] dark:text-[#A0B7BC]',
    teal: 'text-[#376E6F] dark:text-[#6EB5B6]',
    cyan: 'text-[#376E6F] dark:text-[#6EB5B6]',
    rose: 'text-[#DA7B93]',
    burgundy: 'text-[#2E151B] dark:text-[#F0B3C1]',
    deepteal: 'text-[#1C3334] dark:text-[#EDF4F5]',
    emerald: 'text-emerald-700 dark:text-emerald-300',
    amber: 'text-amber-700 dark:text-amber-300',
    neutral: 'text-[#1C3334] dark:text-[#EDF4F5]',
  };

  return (
    <div className="flex-1 px-4 py-2.5 min-w-[130px]">
      <div className="flex items-center space-x-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC] mb-1">
        {Icon && <Icon className="w-3 h-3 text-[#5D757E] dark:text-[#A0B7BC] shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline space-x-1.5">
        <span className={`text-xl font-bold tracking-tight font-mono tabular-nums ${toneAccent[tone] || toneAccent.neutral}`}>
          {value}
        </span>
        {unit && (
          <span className="text-[10px] font-mono text-[#5D757E] dark:text-[#A0B7BC]">
            {unit}
          </span>
        )}
      </div>
      {subtext && (
        <p className="text-[10px] text-[#5D757E] dark:text-[#A0B7BC] truncate mt-0.5">
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
  <div className={`flex flex-wrap items-center divide-y sm:divide-y-0 sm:divide-x divide-[#E2E8EA] dark:divide-[#203638] bg-white dark:bg-[#122123] border border-[#E2E8EA] dark:border-[#203638] rounded-xl overflow-hidden shadow-2xs ${className}`}>
    {children}
  </div>
);

interface KPICardProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'slate' | 'teal' | 'rose' | 'burgundy' | 'deepteal' | 'amber' | 'emerald' | 'cyan' | 'neutral';
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
  const toneClasses: Record<string, string> = {
    slate: 'bg-white dark:bg-[#152729] border-[#2F4454]/20 dark:border-[#2F4454]/40 text-[#2F4454] dark:text-[#A0B7BC]',
    teal: 'bg-white dark:bg-[#152729] border-[#376E6F]/25 dark:border-[#376E6F]/40 text-[#376E6F] dark:text-[#6EB5B6]',
    cyan: 'bg-white dark:bg-[#152729] border-[#376E6F]/25 dark:border-[#376E6F]/40 text-[#376E6F] dark:text-[#6EB5B6]',
    rose: 'bg-white dark:bg-[#152729] border-[#DA7B93]/30 dark:border-[#DA7B93]/40 text-[#B34D66] dark:text-[#F0A4B8]',
    burgundy: 'bg-white dark:bg-[#152729] border-[#2E151B]/20 dark:border-[#DA7B93]/30 text-[#2E151B] dark:text-[#F5B8C7]',
    deepteal: 'bg-white dark:bg-[#152729] border-[#1C3334]/25 dark:border-[#1C3334]/50 text-[#1C3334] dark:text-[#EDF4F5]',
    emerald: 'bg-white dark:bg-[#152729] border-emerald-500/25 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
    amber: 'bg-white dark:bg-[#152729] border-amber-500/25 dark:border-amber-500/40 text-amber-700 dark:text-amber-300',
    neutral: 'bg-white dark:bg-[#152729] border-[#E2E8EA] dark:border-[#233C3F] text-[#1C3334] dark:text-[#EDF4F5]',
  };

  const iconTones: Record<string, string> = {
    slate: 'text-[#2F4454] dark:text-[#A0B7BC] bg-[#2F4454]/10 dark:bg-[#2F4454]/25 border-[#2F4454]/20 dark:border-[#2F4454]/30',
    teal: 'text-[#376E6F] dark:text-[#6EB5B6] bg-[#376E6F]/10 dark:bg-[#376E6F]/25 border-[#376E6F]/20 dark:border-[#376E6F]/30',
    cyan: 'text-[#376E6F] dark:text-[#6EB5B6] bg-[#376E6F]/10 dark:bg-[#376E6F]/25 border-[#376E6F]/20 dark:border-[#376E6F]/30',
    rose: 'text-[#DA7B93] bg-[#DA7B93]/15 border-[#DA7B93]/30',
    burgundy: 'text-[#2E151B] dark:text-[#DA7B93] bg-[#2E151B]/10 dark:bg-[#2E151B]/30 border-[#2E151B]/20 dark:border-[#DA7B93]/30',
    deepteal: 'text-[#1C3334] dark:text-[#6EB5B6] bg-[#1C3334]/10 dark:bg-[#1C3334]/30 border-[#1C3334]/20 dark:border-[#1C3334]/40',
    emerald: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/20 dark:border-emerald-500/30',
    amber: 'text-amber-700 dark:text-amber-300 bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/20 dark:border-amber-500/30',
    neutral: 'text-[#5D757E] dark:text-[#A0B7BC] bg-[#F1F4F5] dark:bg-[#1E3235] border-[#E2E8EA] dark:border-[#2A464A]',
  };

  return (
    <div className={`rounded-xl border p-4.5 transition-all duration-150 ${toneClasses[tone] || toneClasses.neutral} flex flex-col justify-between shadow-xs dark:shadow-sm`}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#5D757E] dark:text-[#A0B7BC]">
          {label}
        </span>
        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${iconTones[tone] || iconTones.neutral}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline space-x-1.5">
          <span className="text-2xl font-bold tracking-tight text-[#1C3334] dark:text-[#EDF4F5] font-mono">
            {value}
          </span>
          {unit && (
            <span className="text-xs text-[#5D757E] dark:text-[#A0B7BC] font-mono">
              {unit}
            </span>
          )}
        </div>

        {(subtext || trend) && (
          <div className="flex items-center space-x-2 text-[11px] text-[#5D757E] dark:text-[#A0B7BC] pt-0.5">
            {trend && (
              <span className={`inline-flex items-center space-x-0.5 font-medium ${
                trend === 'up' ? 'text-amber-600 dark:text-amber-400' : trend === 'down' ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#5D757E] dark:text-[#A0B7BC]'
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
  let effectiveBand = band;
  if (!effectiveBand && typeof score === 'number') {
    if (score >= 75) effectiveBand = 'Critical';
    else if (score >= 50) effectiveBand = 'High';
    else if (score >= 25) effectiveBand = 'Moderate';
    else effectiveBand = 'Low';
  }

  const bandStyles: Record<string, string> = {
    Low: 'bg-[#EEF5F5] dark:bg-[#183133] text-[#376E6F] dark:text-[#6EC4C6] border-[#376E6F]/30 dark:border-[#376E6F]/40',
    Moderate: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/30',
    High: 'bg-[#FDF3F5] dark:bg-[#2A161D] text-[#B34D66] dark:text-[#F0A4B8] border-[#DA7B93]/35 dark:border-[#DA7B93]/40',
    Critical: 'bg-[#FAF0F2] dark:bg-[#38161E] text-[#2E151B] dark:text-rose-200 border-[#2E151B]/30 dark:border-rose-500/40 font-bold',
  };

  const dotStyles: Record<string, string> = {
    Low: 'bg-[#376E6F] dark:bg-[#6EC4C6]',
    Moderate: 'bg-amber-500',
    High: 'bg-[#DA7B93]',
    Critical: 'bg-[#2E151B] dark:bg-rose-400 animate-pulse',
  };

  const currentStyle = bandStyles[effectiveBand || 'Low'] || bandStyles.Low;
  const currentDot = dotStyles[effectiveBand || 'Low'] || dotStyles.Low;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center space-x-1.5 font-mono font-medium rounded-md border ${currentStyle} ${padding} shadow-2xs`}>
      <span className={`w-1.5 h-1.5 rounded-full ${currentDot}`} />
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
      bg: 'bg-[#EEF5F5] dark:bg-[#183133] border-[#376E6F]/30 dark:border-[#376E6F]/40 text-[#376E6F] dark:text-[#6EC4C6]',
      dot: 'bg-[#376E6F] dark:bg-[#6EC4C6]',
      text: 'text-[#376E6F] dark:text-[#6EC4C6]',
      label: 'Completed'
    },
    processing: {
      bg: 'bg-[#FDF3F5] dark:bg-[#2A161D] border-[#DA7B93]/35 dark:border-[#DA7B93]/40 text-[#B34D66] dark:text-[#F0A4B8]',
      dot: 'bg-[#DA7B93] animate-pulse',
      text: 'text-[#B34D66] dark:text-[#F0A4B8]',
      label: 'Processing'
    },
    pending: {
      bg: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300',
      dot: 'bg-slate-400',
      text: 'text-slate-700 dark:text-slate-300',
      label: 'Pending'
    },
    paused: {
      bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-500/30 text-amber-800 dark:text-amber-300',
      dot: 'bg-amber-500',
      text: 'text-amber-800 dark:text-amber-300',
      label: 'Paused'
    },
    failed: {
      bg: 'bg-[#FAF0F2] dark:bg-rose-950/30 border-[#2E151B]/20 dark:border-rose-500/30 text-[#2E151B] dark:text-rose-300',
      dot: 'bg-[#2E151B] dark:bg-rose-400',
      text: 'text-[#2E151B] dark:text-rose-300',
      label: 'Failed'
    },
    cancelled: {
      bg: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400',
      dot: 'bg-slate-400',
      text: 'text-slate-500 dark:text-slate-400',
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
  <div className="rounded-xl border border-dashed border-[#CBD5D8] dark:border-[#233C3F] bg-white dark:bg-[#112022] p-8 text-center flex flex-col items-center justify-center space-y-3 shadow-xs">
    <div className="w-12 h-12 rounded-xl bg-[#F1F4F5] dark:bg-[#16292B] border border-[#CBD5D8] dark:border-[#233C3F] flex items-center justify-center text-[#2F4454] dark:text-[#A0B7BC]">
      <Icon className="w-6 h-6" />
    </div>
    <div className="max-w-md space-y-1">
      <h3 className="text-sm font-semibold text-[#1C3334] dark:text-[#EEF4F5]">{title}</h3>
      <p className="text-xs text-[#5D757E] dark:text-[#A0B7BC] leading-relaxed">{description}</p>
    </div>
    {actionText && onAction && (
      <button
        onClick={onAction}
        className="mt-2 inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#2F4454] hover:bg-[#1C3334] text-white transition-colors cursor-pointer shadow-xs"
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
  <div className="rounded-xl border border-[#2E151B]/20 dark:border-rose-500/30 bg-[#FAF0F2] dark:bg-rose-950/20 p-5 text-center flex flex-col items-center justify-center space-y-2 shadow-xs">
    <AlertTriangle className="w-6 h-6 text-[#2E151B] dark:text-rose-400" />
    <div className="text-xs font-medium text-[#2E151B] dark:text-rose-200">{message}</div>
    {onRetry && (
      <button
        onClick={onRetry}
        className="mt-1 px-3 py-1 rounded bg-[#2E151B]/10 hover:bg-[#2E151B]/20 dark:bg-rose-900/40 dark:hover:bg-rose-900/60 border border-[#2E151B]/30 dark:border-rose-500/40 text-xs font-medium text-[#2E151B] dark:text-rose-200 transition-colors cursor-pointer"
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
  <div className={`rounded-xl border border-[#E2E8EA] dark:border-[#233C3F] bg-white dark:bg-[#152729] ${height} flex flex-col items-center justify-center space-y-3 p-6 text-[#5D757E] dark:text-[#A0B7BC] shadow-xs`}>
    <Loader2 className="w-6 h-6 text-[#376E6F] dark:text-[#6EB5B6] animate-spin" />
    <span className="text-xs font-mono">{text}</span>
  </div>
);
