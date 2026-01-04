import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Globe,
  Gauge,
  LineChart,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Settings,
  Square,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
  AlertCircle,
  XCircle,
  CheckCircle,
  Info,
  Wifi,
  WifiOff,
  LayoutDashboard,
  Compass,
  PieChart,
  Building2,
  Sparkles,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/cn';

export {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Globe,
  Gauge,
  LineChart,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Settings,
  Square,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
  AlertCircle,
  XCircle,
  CheckCircle,
  Info,
  Wifi,
  WifiOff,
  LayoutDashboard,
  Compass,
  PieChart,
  Building2,
  Sparkles,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
};

export type { LucideIcon };

// Tab icons mapping
export const TabIcons = {
  monitoring: Activity,
  discovery: Compass,
  analysis: LineChart,
  market: Globe,
} as const;

// Status icons
export const StatusIcons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

// Action icons
export const ActionIcons = {
  buy: TrendingUp,
  sell: TrendingDown,
  hold: Minus,
} as const;

interface IconWrapperProps {
  icon: LucideIcon;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
};

export function IconWrapper({ icon: Icon, className, size = 'md' }: IconWrapperProps) {
  return <Icon className={cn(sizeMap[size], className)} />;
}
