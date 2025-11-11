import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import type { ChartDataPoint } from '@/types/trading';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

export interface PerformanceChartProps {
  data: ChartDataPoint[];
}

export function PerformanceChart({ data }: PerformanceChartProps) {
  const chartData = useMemo(() => {
    // Provide default data if empty
    if (data.length === 0) {
      const now = new Date();
      const placeholderData: ChartDataPoint[] = [
        { timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000), opportunities: 0, avgConfidence: 0 },
        { timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000), opportunities: 0, avgConfidence: 0 },
        { timestamp: now, opportunities: 0, avgConfidence: 0 },
      ];
      return placeholderData;
    }
    return data;
  }, [data]);

  const config = useMemo(() => ({
    labels: chartData.map((d) => d.timestamp),
    datasets: [
      {
        label: 'Opportunities Found',
        data: chartData.map((d) => d.opportunities),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
        yAxisID: 'y',
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#1d4ed8',
        pointHoverBackgroundColor: '#60a5fa',
        pointRadius: 4,
        pointHoverRadius: 6,
      },
      {
        label: 'Average Confidence',
        data: chartData.map((d) => d.avgConfidence),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4,
        yAxisID: 'y1',
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#059669',
        pointHoverBackgroundColor: '#34d399',
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  }), [chartData]);

  const options: ChartOptions<'line'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        labels: {
          color: '#e2e8f0',
          font: {
            size: 12,
            weight: '500',
          },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(59, 130, 246, 0.3)',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
      },
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          unit: 'hour' as const,
        },
        ticks: {
          color: '#94a3b8',
          font: {
            size: 11,
          },
        },
        grid: {
          color: 'rgba(59, 130, 246, 0.1)',
        },
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'Opportunities',
          color: '#e2e8f0',
          font: {
            size: 12,
            weight: '600',
          },
        },
        ticks: {
          color: '#94a3b8',
          font: {
            size: 11,
          },
        },
        grid: {
          color: 'rgba(59, 130, 246, 0.1)',
        },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: 'Confidence %',
          color: '#e2e8f0',
          font: {
            size: 12,
            weight: '600',
          },
        },
        ticks: {
          color: '#94a3b8',
          font: {
            size: 11,
          },
        },
        grid: {
          drawOnChartArea: false,
          color: 'rgba(16, 185, 129, 0.1)',
        },
        max: 100,
      },
    },
  }), []);

  return (
    <div className="relative h-[300px]">
      <Line data={config} options={options} />
    </div>
  );
}
