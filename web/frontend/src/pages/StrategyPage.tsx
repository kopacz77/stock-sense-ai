import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Target,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  EyeOff,
  RefreshCw,
} from 'lucide-react';

import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { LoadingCard, EmptyState } from '@/components/ui/LoadingSpinner';
import { api } from '@/services/api';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import type { StrategyCandidate, StrategyCandidatesResponse } from '@/types/strategy';

/**
 * The one minimal /strategy web route CONTEXT.md allows (D-18). Deliberately
 * scoped: no chart embeds, no socket.io subscription, no filter controls, no
 * undo, no mobile-specific layout — all named deferred ideas. `?date=` is
 * read from the URL (not a UI filter widget) so a specific day can still be
 * inspected directly.
 */
export function StrategyPage() {
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date') ?? undefined;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StrategyCandidatesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, 'accept' | 'skip'>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getStrategyCandidates(dateParam);
      setData(result);
      // CR-02: hydrate `decisions` from the server's joined decision status
      // on every load (mount, refresh, date change) instead of relying on
      // local-only state that resets on reload and would otherwise let the
      // operator silently re-accept over their own prior decision.
      const hydrated: Record<string, 'accept' | 'skip'> = {};
      for (const c of [...result.ranked, ...result.subThreshold, ...result.shadow]) {
        if (c.decision === 'accept' || c.decision === 'skip') {
          hydrated[c.candidateId] = c.decision;
        }
      }
      setDecisions(hydrated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      toast.error(`Failed to load strategy candidates: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam]);

  const handleAccepted = (candidateId: string) => {
    setDecisions((prev) => ({ ...prev, [candidateId]: 'accept' }));
  };

  const handleSkipped = (candidateId: string) => {
    setDecisions((prev) => ({ ...prev, [candidateId]: 'skip' }));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
      role="tabpanel"
      id="panel-strategy"
      aria-labelledby="tab-strategy"
    >
      {/* Header */}
      <Card>
        <CardHeader icon={<Target className="w-5 h-5" />}>
          <div className="flex items-center justify-between w-full gap-3">
            <span>Today's Candidates</span>
            <Button variant="secondary" size="sm" onClick={load} loading={loading}>
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingCard message="Loading strategy candidates..." />
          ) : error ? (
            <EmptyState
              variant="error"
              title="Failed to load candidates"
              description={error}
            />
          ) : data ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
              <StatusIndicator label="As Of" value={data.asOfDate} variant="default" />
              <StatusIndicator
                label="VIX"
                value={data.vix ? data.vix.close.toFixed(2) : '—'}
                variant="default"
              />
              <StatusIndicator
                label="Regime"
                value={data.vix ? data.vix.regime : 'unknown'}
                variant={
                  data.vix?.regime === 'stressed'
                    ? 'danger'
                    : data.vix?.regime === 'elevated'
                      ? 'warning'
                      : 'success'
                }
              />
              <StatusIndicator
                label="VIX Source"
                value={data.vix ? data.vix.source : 'n/a'}
                variant={data.vix?.source === 'fallback' ? 'danger' : 'default'}
                glow={data.vix?.source === 'fallback'}
              />
            </div>
          ) : null}

          {data?.vix?.source === 'fallback' && (
            <div className="mt-3 flex items-center gap-2 text-sm text-warning-400">
              <AlertTriangle className="w-4 h-4" aria-hidden="true" />
              VIX quote is a fallback value, not a live or cached read — sizing today is
              conservative because of it.
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && !error && data && !data.generated && (
        <EmptyState
          variant="default"
          title="No run yet for this date"
          description="Nobody has run `strategy run` for this date, so there is nothing to show. This is different from a quiet day — that would show ranked as empty with a sub-threshold list."
        />
      )}

      {!loading && !error && data && data.generated && (
        <>
          {/* Ranked candidates */}
          <section aria-labelledby="ranked-heading">
            <h2 id="ranked-heading" className="text-lg font-bold text-dark-text-primary mb-3">
              Ranked ({data.ranked.length})
            </h2>
            {data.ranked.length === 0 ? (
              <EmptyState
                variant="opportunities"
                title="No candidate cleared the threshold today"
                description="A quiet day is a normal outcome, not a system failure. Check the sub-threshold list below for what came closest."
              />
            ) : (
              <div className="space-y-4">
                {data.ranked.map((candidate, index) => (
                  <CandidateCard
                    key={candidate.candidateId}
                    candidate={candidate}
                    index={index}
                    decision={decisions[candidate.candidateId]}
                    onAccepted={handleAccepted}
                    onSkipped={handleSkipped}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Sub-threshold */}
          <section aria-labelledby="subthreshold-heading">
            <h2
              id="subthreshold-heading"
              className="text-lg font-bold text-dark-text-primary mb-3"
            >
              Sub-threshold ({data.subThreshold.length}) — below-threshold diagnostics, not
              tradeable
            </h2>
            {data.subThreshold.length === 0 ? (
              <p className="text-sm text-dark-text-muted">(none)</p>
            ) : (
              <div className="space-y-2">
                {data.subThreshold.map((candidate) => (
                  <div
                    key={candidate.candidateId}
                    className="flex items-center justify-between bg-dark-bg/60 border border-dark-border rounded-lg px-4 py-2 text-sm"
                  >
                    <span className="text-dark-text-secondary">
                      <span className="font-semibold text-dark-text-primary">
                        {candidate.signalType}
                      </span>{' '}
                      {candidate.ticker} — {candidate.direction}
                    </span>
                    <span className="font-mono text-dark-text-tertiary">
                      score={candidate.score.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Shadow */}
          <section aria-labelledby="shadow-heading">
            <h2
              id="shadow-heading"
              className="text-lg font-bold text-dark-text-tertiary mb-3 flex items-center gap-2"
            >
              <EyeOff className="w-4 h-4" aria-hidden="true" />
              Shadow ({data.shadow.length}) — logged for evidence, never ranked, sized, or
              tradeable
            </h2>
            {data.shadow.length === 0 ? (
              <p className="text-sm text-dark-text-muted">(none)</p>
            ) : (
              <div className="space-y-2 opacity-60">
                {data.shadow.map((candidate) => (
                  <div
                    key={candidate.candidateId}
                    className="flex items-center justify-between bg-dark-bg/40 border border-dashed border-dark-border rounded-lg px-4 py-2 text-sm"
                  >
                    <span className="text-dark-text-tertiary">
                      <span className="font-semibold">{candidate.signalType}</span>{' '}
                      {candidate.ticker} — {candidate.direction}
                    </span>
                    <span className="font-mono text-dark-text-muted">
                      score={candidate.score.toFixed(2)} · size=—
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Skipped types */}
          {data.skippedTypes.length > 0 && (
            <section aria-labelledby="skipped-heading">
              <h2
                id="skipped-heading"
                className="text-lg font-bold text-dark-text-primary mb-3"
              >
                Skipped Signal Types
              </h2>
              <div className="space-y-2">
                {data.skippedTypes.map((s) => (
                  <div
                    key={s.signalType}
                    className="bg-dark-bg/60 border border-dark-border rounded-lg px-4 py-2 text-sm"
                  >
                    <span className="font-semibold text-warning-400">{s.signalType}</span>:{' '}
                    <span className="text-dark-text-tertiary">{s.reason}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </motion.div>
  );
}

// WR-03: `Number('')` is `0`, so a cleared numeric field previously sent
// `entry: 0`/`target: 0`/`stop: 0` straight to the API, which the server
// correctly rejected (positive() schema) but with only a generic toast —
// no indication of which field was the problem. A field is valid only
// when it parses to a finite, strictly positive number.
function isPositiveNumberString(value: string): boolean {
  if (value.trim() === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

interface CandidateCardProps {
  candidate: StrategyCandidate;
  index: number;
  decision: 'accept' | 'skip' | undefined;
  onAccepted: (candidateId: string) => void;
  onSkipped: (candidateId: string) => void;
}

function CandidateCard({ candidate, index, decision, onAccepted, onSkipped }: CandidateCardProps) {
  const [mode, setMode] = useState<'idle' | 'accepting' | 'skipping'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [entry, setEntry] = useState(String(candidate.suggestedEntry));
  const [target, setTarget] = useState(String(candidate.suggestedTarget));
  const [stop, setStop] = useState(String(candidate.suggestedStop));
  const [sizeUsd, setSizeUsd] = useState(
    candidate.suggestedSizeUsd !== null ? String(candidate.suggestedSizeUsd) : ''
  );
  const [note, setNote] = useState('');

  // WR-03: entry/target/stop are always required (the CLI's `--entry` etc.
  // are optional flags, but this form pre-fills them, so clearing one is a
  // deliberate "make this blank" edit, not "use the suggestion" — the
  // suggestion is right there via WR-02's diff-against-suggestion check).
  // Size is optional; only validated when non-empty.
  const entryValid = isPositiveNumberString(entry);
  const targetValid = isPositiveNumberString(target);
  const stopValid = isPositiveNumberString(stop);
  const sizeUsdValid = sizeUsd.trim() === '' || isPositiveNumberString(sizeUsd);
  const acceptFormValid = entryValid && targetValid && stopValid && sizeUsdValid;

  const directionColor = candidate.direction === 'long' ? 'text-success-400' : 'text-danger-400';
  const DirectionIcon = candidate.direction === 'long' ? TrendingUp : TrendingDown;
  const borderColor =
    candidate.direction === 'long' ? 'border-l-success-500' : 'border-l-danger-500';

  const submitAccept = async () => {
    // WR-03: defense in depth — the Confirm Accept button is already
    // disabled while invalid, but never trust client-side disabled state
    // alone as the only gate before a network call.
    if (!acceptFormValid) return;
    setSubmitting(true);
    try {
      // WR-02: only send a field when the operator actually edited it away
      // from the engine's suggestion — an unconditional send collapsed the
      // override-vs-suggestion distinction (operatorEntry === candidate's
      // own suggestedEntry no longer meant "operator confirmed this
      // number"). Unsent fields fall back to suggestedX server-side
      // already (decision-log.ts recordAccept).
      const entryNum = Number(entry);
      const targetNum = Number(target);
      const stopNum = Number(stop);
      const sizeUsdNum = sizeUsd !== '' ? Number(sizeUsd) : undefined;
      const overrides = {
        ...(entryNum !== candidate.suggestedEntry ? { entry: entryNum } : {}),
        ...(targetNum !== candidate.suggestedTarget ? { target: targetNum } : {}),
        ...(stopNum !== candidate.suggestedStop ? { stop: stopNum } : {}),
        ...(sizeUsdNum !== undefined && sizeUsdNum !== candidate.suggestedSizeUsd
          ? { sizeUsd: sizeUsdNum }
          : {}),
        ...(note !== '' ? { note } : {}),
      };
      await api.acceptCandidate(candidate.candidateId, overrides);
      toast.success(`Accepted ${candidate.ticker} (${candidate.signalType})`);
      onAccepted(candidate.candidateId);
      setMode('idle');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to accept: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const submitSkip = async () => {
    setSubmitting(true);
    try {
      await api.skipCandidate(candidate.candidateId, note !== '' ? note : undefined);
      toast.success(`Skipped ${candidate.ticker} (${candidate.signalType})`);
      onSkipped(candidate.candidateId);
      setMode('idle');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to skip: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.5) }}
      className={cn(
        'relative bg-dark-bg/80 backdrop-blur-md',
        'border border-dark-border border-l-4',
        borderColor,
        'rounded-xl p-4 sm:p-5'
      )}
      aria-label={`${candidate.ticker} - ${candidate.signalType} candidate, ${candidate.direction}, score ${candidate.score.toFixed(2)}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <DirectionIcon className={cn('w-5 h-5', directionColor)} aria-hidden="true" />
          <h3 className="text-lg sm:text-xl font-bold text-dark-text-primary">
            {candidate.ticker}
          </h3>
          <Badge variant="primary">{candidate.signalType}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {decision === 'accept' && (
            <Badge variant="success" glow>
              Accepted
            </Badge>
          )}
          {decision === 'skip' && <Badge variant="neutral">Skipped</Badge>}
          <span className="text-base sm:text-lg font-bold text-warning-400">
            {candidate.score.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mb-3">
        <div>
          <span className="text-dark-text-muted">Entry</span>
          <p className="text-dark-text-secondary font-medium">
            {formatCurrency(candidate.suggestedEntry)}
          </p>
        </div>
        <div>
          <span className="text-dark-text-muted">Target</span>
          <p className="text-success-400 font-medium">{formatCurrency(candidate.suggestedTarget)}</p>
        </div>
        <div>
          <span className="text-dark-text-muted">Stop</span>
          <p className="text-danger-400 font-medium">{formatCurrency(candidate.suggestedStop)}</p>
        </div>
        <div>
          <span className="text-dark-text-muted flex items-center gap-1">
            <DollarSign className="w-3 h-3" aria-hidden="true" />
            Size
          </span>
          <p className="text-dark-text-secondary font-medium">
            {candidate.suggestedSizeUsd !== null
              ? formatCurrency(candidate.suggestedSizeUsd)
              : '—'}
          </p>
        </div>
      </div>

      {/* Plan 11-09 (D-23/D-24): net R:R against the active hurdle — an em
          dash when costEvaluation is null (shadow / degenerate-levels
          candidates), "(pre-tax)" when the operator hasn't set a marginal
          rate so a fees-only number is never read as an after-tax one. */}
      <div className="text-xs text-dark-text-tertiary mb-1">
        {candidate.costEvaluation ? (
          <>
            Net R:R {candidate.costEvaluation.netRewardRisk.toFixed(2)} · min{' '}
            {candidate.costEvaluation.minRewardRisk.toFixed(2)} · break-even{' '}
            {(candidate.costEvaluation.breakEvenPct * 100).toFixed(2)}% ·{' '}
            {candidate.costEvaluation.jurisdiction}
            {!candidate.costEvaluation.taxRateKnown && ' (pre-tax)'}
          </>
        ) : (
          <>Net R:R —</>
        )}
      </div>
      {candidate.costEvaluation?.washSaleFlag && (
        <div className="flex items-center gap-1 text-xs text-warning-400 mb-3">
          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
          {candidate.costEvaluation.washSaleFlag.rule}: closed at a loss of{' '}
          {formatCurrency(Math.abs(candidate.costEvaluation.washSaleFlag.priorRealizedPnlUsd))} on{' '}
          {candidate.costEvaluation.washSaleFlag.priorClosedAt.split('T')[0]}
        </div>
      )}

      <div className="flex items-center gap-1 text-xs text-dark-text-tertiary mb-3">
        <Clock className="w-3 h-3" aria-hidden="true" />
        {candidate.timeHorizonDays} day horizon · VIX {candidate.vixRegime} (
        {candidate.vixCloseAtGeneration.toFixed(2)}, {candidate.vixSource})
      </div>

      {/* Full, untruncated rationale */}
      <div className="mb-4 pt-3 border-t border-dark-border">
        <p className="text-sm text-dark-text-secondary leading-relaxed whitespace-pre-wrap">
          {candidate.rationale}
        </p>
      </div>

      {decision === undefined && mode === 'idle' && (
        <div className="flex gap-2">
          <Button variant="success" size="sm" onClick={() => setMode('accepting')}>
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            Accept
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setMode('skipping')}>
            <XCircle className="w-4 h-4" aria-hidden="true" />
            Skip
          </Button>
        </div>
      )}

      {mode === 'accepting' && (
        <div className="space-y-3 pt-3 border-t border-dark-border">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="text-xs text-dark-text-tertiary">
              Entry
              <Input
                type="number"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                className="w-full mt-1"
                step="any"
                aria-invalid={!entryValid}
              />
              {!entryValid && (
                <span className="block mt-1 text-danger-400">Required, must be &gt; 0</span>
              )}
            </label>
            <label className="text-xs text-dark-text-tertiary">
              Target
              <Input
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full mt-1"
                step="any"
                aria-invalid={!targetValid}
              />
              {!targetValid && (
                <span className="block mt-1 text-danger-400">Required, must be &gt; 0</span>
              )}
            </label>
            <label className="text-xs text-dark-text-tertiary">
              Stop
              <Input
                type="number"
                value={stop}
                onChange={(e) => setStop(e.target.value)}
                className="w-full mt-1"
                step="any"
                aria-invalid={!stopValid}
              />
              {!stopValid && (
                <span className="block mt-1 text-danger-400">Required, must be &gt; 0</span>
              )}
            </label>
            <label className="text-xs text-dark-text-tertiary">
              Size (USD)
              <Input
                type="number"
                value={sizeUsd}
                onChange={(e) => setSizeUsd(e.target.value)}
                className="w-full mt-1"
                step="any"
                aria-invalid={!sizeUsdValid}
              />
              {!sizeUsdValid && (
                <span className="block mt-1 text-danger-400">Must be &gt; 0 or left blank</span>
              )}
            </label>
          </div>
          <label className="text-xs text-dark-text-tertiary block">
            Note (optional)
            <Input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full mt-1"
              maxLength={500}
            />
          </label>
          <div className="flex gap-2">
            <Button
              variant="success"
              size="sm"
              onClick={submitAccept}
              loading={submitting}
              disabled={!acceptFormValid}
            >
              Confirm Accept
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setMode('idle')} disabled={submitting}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'skipping' && (
        <div className="space-y-3 pt-3 border-t border-dark-border">
          <label className="text-xs text-dark-text-tertiary block">
            Reason (optional)
            <Input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full mt-1"
              maxLength={500}
            />
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={submitSkip} loading={submitting}>
              Confirm Skip
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setMode('idle')} disabled={submitting}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </motion.article>
  );
}
