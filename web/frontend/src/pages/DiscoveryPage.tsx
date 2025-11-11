import { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { LoadingCard } from '@/components/ui/LoadingSpinner';
import { OpportunityCard } from '@/components/opportunities/OpportunityCard';
import { api } from '@/services/api';
import type { Opportunity } from '@/types/trading';

const SECTOR_OPTIONS = [
  { value: '', label: 'Select Sector' },
  { value: 'TECHNOLOGY', label: 'Technology' },
  { value: 'HEALTHCARE', label: 'Healthcare' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'CONSUMER', label: 'Consumer' },
  { value: 'ENERGY', label: 'Energy' },
  { value: 'INDUSTRIAL', label: 'Industrial' },
  { value: 'GROWTH', label: 'Growth' },
];

export function DiscoveryPage() {
  const [results, setResults] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [sector, setSector] = useState('');
  const [confidence, setConfidence] = useState('70');
  const [maxResults, setMaxResults] = useState('15');
  const [discoveryType, setDiscoveryType] = useState<'high-revenue' | 'trending' | 'sector' | null>(null);

  const runDiscovery = async (type: 'high-revenue' | 'trending' | 'sector', targetSector?: string) => {
    if (type === 'sector' && !targetSector) {
      toast.error('Please select a sector first');
      return;
    }

    setLoading(true);
    setDiscoveryType(type);

    try {
      const config = {
        type: type === 'high-revenue' || type === 'trending' ? 'trending' as const : 'sector' as const,
        target: type === 'high-revenue' ? 'high-revenue' : type === 'trending' ? 'trending' : targetSector || '',
        config: {
          minConfidence: Number(confidence),
          maxResults: Number(maxResults),
        },
      };

      const opportunities = await api.discover(config);
      setResults(opportunities);

      if (opportunities.length === 0) {
        toast.error('No opportunities found. Try lowering the confidence threshold.');
      } else {
        toast.success(`Found ${opportunities.length} opportunities!`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Discovery failed: ${message}`);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    if (!discoveryType) return 'Click a discovery button to find opportunities!';
    if (discoveryType === 'high-revenue') return `High-Revenue Opportunities (${results.length} found)`;
    if (discoveryType === 'trending') return `Trending Stocks (${results.length} found)`;
    return `${sector} Sector (${results.length} found)`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <Card>
        <CardHeader icon="🔍">Stock Discovery</CardHeader>
        <CardContent>
          {/* Controls */}
          <div className="mb-6 space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                onClick={() => runDiscovery('high-revenue')}
                loading={loading && discoveryType === 'high-revenue'}
              >
                High Revenue
              </Button>
              <Button
                variant="primary"
                onClick={() => runDiscovery('trending')}
                loading={loading && discoveryType === 'trending'}
              >
                Trending
              </Button>
              <Select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-48"
              >
                {SECTOR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
              <Button
                variant="primary"
                onClick={() => runDiscovery('sector', sector)}
                loading={loading && discoveryType === 'sector'}
                disabled={!sector}
              >
                Discover Sector
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-300">Confidence:</label>
                <Input
                  type="number"
                  value={confidence}
                  onChange={(e) => setConfidence(e.target.value)}
                  min="60"
                  max="95"
                  className="w-20"
                />
                <span className="text-sm text-gray-400">%</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-300">Max Results:</label>
                <Input
                  type="number"
                  value={maxResults}
                  onChange={(e) => setMaxResults(e.target.value)}
                  min="5"
                  max="25"
                  className="w-20"
                />
              </div>
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <LoadingCard message="🔍 Discovering opportunities..." />
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-gray-400 italic">
              {getTitle()}
            </div>
          ) : (
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">🎯 {getTitle()}</h3>
              <div className="max-h-[600px] overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-primary-500/40 scrollbar-track-transparent">
                {results.map((result, index) => (
                  <OpportunityCard key={`${result.symbol}-${index}`} opportunity={result} index={index} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
