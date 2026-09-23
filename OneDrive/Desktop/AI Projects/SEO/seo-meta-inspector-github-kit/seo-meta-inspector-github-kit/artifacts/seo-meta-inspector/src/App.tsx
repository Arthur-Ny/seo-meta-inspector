import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { trackEvent } from '@/lib/analytics';
import { useInspectSeo, useSubmitFeedback } from '@workspace/api-client-react';
import type { SeoCheckGroup, SeoInspection, SeoTag } from '@workspace/api-client-react';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  Clipboard,
  ClipboardCheck,
  ExternalLink,
  FileSearch,
  Gauge,
  Globe2,
  HelpCircle,
  History,
  Link2,
  LoaderCircle,
  MessageCircleQuestion,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Tags,
  X,
} from 'lucide-react';
import {
  Route,
  Switch,
  Link,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();
const RECENT_CHECKS_KEY = 'seo-meta-inspector:recent-checks';
const LATEST_INSPECTION_KEY = 'seo-meta-inspector:latest-inspection';
const SITE_URL = 'https://seo-meta-inspector.com';
const ADSENSE_CLIENT_ID = import.meta.env.VITE_ADSENSE_CLIENT_ID || '';
const ADSENSE_PRIMARY_SLOT = import.meta.env.VITE_ADSENSE_PRIMARY_SLOT || '';
const ADSENSE_SECONDARY_SLOT = import.meta.env.VITE_ADSENSE_SECONDARY_SLOT || '';

type RecentCheck = {
  id: string;
  url: string;
  hostname: string;
  title: string;
  score: number;
  scoreLabel: string;
  checkedAt: string;
  faviconUrl: string;
};

const readRecentChecks = (): RecentCheck[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(RECENT_CHECKS_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

const recordRecentCheck = (inspection: SeoInspection) => {
  if (typeof window === 'undefined') return;
  const inspectedUrl = inspection.fetchedUrl || inspection.url;
  let parsed: URL;
  try {
    parsed = new URL(inspectedUrl);
  } catch {
    return;
  }
  const entry: RecentCheck = {
    id: `${parsed.origin}${parsed.pathname}`,
    url: inspectedUrl,
    hostname: inspection.hostname || parsed.hostname,
    title: inspection.title || 'Untitled page',
    score: inspection.score,
    scoreLabel: inspection.scoreLabel,
    checkedAt: inspection.checkedAt,
    faviconUrl: `${parsed.origin}/favicon.ico`,
  };
  const next = [entry, ...readRecentChecks().filter((check) => check.id !== entry.id)].slice(0, 12);
  window.localStorage.setItem(RECENT_CHECKS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('seo-meta-inspector:recent-checks-updated'));
};

const readLatestInspection = (): SeoInspection | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(LATEST_INSPECTION_KEY) || 'null');
    if (!stored || typeof stored !== 'object' || typeof stored.url !== 'string' || !Array.isArray(stored.groups)) {
      return null;
    }
    return stored as SeoInspection;
  } catch {
    return null;
  }
};

const persistLatestInspection = (inspection: SeoInspection) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LATEST_INSPECTION_KEY, JSON.stringify(inspection));
  } catch {
    // Keep the in-memory report available if browser storage is unavailable.
  }
};

const clearPersistedInspection = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LATEST_INSPECTION_KEY);
  } catch {
    // The visible report is still cleared even if storage cannot be updated.
  }
};

function useMarsParallax() {
  useEffect(() => {
    const backdrop = document.querySelector<HTMLElement>('.mars-backdrop');
    if (!backdrop) return;

    let frame = 0;
    const updateParallax = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        backdrop.style.setProperty('--mars-scroll-offset', `${window.scrollY * 0.14}px`);
      });
    };

    updateParallax();
    window.addEventListener('scroll', updateParallax, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updateParallax);
    };
  }, []);
}

type NavKey = 'inspect' | 'history' | 'guides' | 'about' | 'privacy';

function SideRail({ active }: { active: NavKey }) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <aside className="side-rail">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true"><Gauge size={17} strokeWidth={2.7} /></div>
        <div>
          <div className="brand-name">SEO Meta Inspector</div>
          <p className="brand-note">Signal over noise</p>
        </div>
        <button
          type="button"
          className="mobile-help-link"
          onClick={() => {
            trackEvent('feedback_help_opened');
            setShowHelp(true);
          }}
          aria-label="Open help and feedback"
        >
          <MessageCircleQuestion size={17} />
        </button>
      </div>
      <nav className="rail-links" aria-label="Workspace">
        <div className="rail-label">Workspace</div>
        <Link className={`rail-link ${active === 'inspect' ? 'active' : ''}`} href="/" data-testid="link-inspect">
          <FileSearch size={16} /> <span>Inspect URL</span>
        </Link>
        <Link className={`rail-link ${active === 'history' ? 'active' : ''}`} href="/recent-checks" data-testid="link-history">
          <History size={16} /> <span>Recent checks</span>
        </Link>
        <Link className={`rail-link ${active === 'guides' ? 'active' : ''}`} href="/field-guide" data-testid="link-guides">
          <BarChart3 size={16} /> <span>SEO field guide</span>
        </Link>
      </nav>
      <div className="rail-foot">
        <div className="rail-utility-links">
          <Link href="/about">About</Link>
          <Link href="/privacy">Privacy</Link>
        </div>
        <button
          type="button"
          className="rail-help-link"
          onClick={() => {
            trackEvent('feedback_help_opened');
            setShowHelp(true);
          }}
          data-testid="button-help-feedback"
        >
          <MessageCircleQuestion size={15} />
          <span>Help &amp; feedback</span>
        </button>
        <div className="rail-status"><span className="pulse-dot" /> Inspection engine online</div>
        <div>Public pages only. No credentials, no crawl queue.</div>
        {showHelp && <HelpFeedbackDialog onClose={() => setShowHelp(false)} />}
      </div>
    </aside>
  );
}

function HelpFeedbackDialog({ onClose }: { onClose: () => void }) {
  const feedbackMutation = useSubmitFeedback();
  const [category, setCategory] = useState<'problem' | 'suggestion' | 'question' | 'other'>('problem');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const submitFeedback = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (message.trim().length < 10) return;

    feedbackMutation.mutate(
      {
        data: {
          category,
          message: message.trim(),
          ...(email.trim() ? { email: email.trim() } : {}),
          website,
        },
      },
      {
        onSuccess: () => {
          trackEvent('feedback_submitted', { category });
          setSubmitted(true);
        },
      },
    );
  };

  const dialog = (
    <div className="help-feedback-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="help-feedback-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-feedback-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="help-feedback-header">
          <div>
            <div className="section-kicker">Support channel</div>
            <h2 id="help-feedback-title">Help &amp; feedback</h2>
          </div>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Close help and feedback">
            <X size={16} />
          </button>
        </div>

        <div className="help-feedback-grid">
          {submitted ? (
            <div className="feedback-success" role="status">
              <div className="feedback-success-icon"><Check size={20} /></div>
              <div>
                <h3>Feedback sent</h3>
                <p>Thanks for helping improve SEO Meta Inspector.</p>
              </div>
            </div>
          ) : (
            <form className="feedback-form" onSubmit={submitFeedback}>
              <label>
                <span>What is this about?</span>
                <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
                  <option value="problem">Something is not working</option>
                  <option value="suggestion">Product suggestion</option>
                  <option value="question">Question</option>
                  <option value="other">Other feedback</option>
                </select>
              </label>
              <label>
                <span>Your message</span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  minLength={10}
                  maxLength={3000}
                  rows={6}
                  placeholder="Tell us what happened, what you expected, or what would make the inspector more useful."
                  required
                  autoFocus
                />
                <small>{message.length}/3000</small>
              </label>
              <label>
                <span>Email for a reply <em>Optional</em></span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={254}
                  placeholder="you@example.com"
                />
              </label>
              <label className="feedback-honeypot" aria-hidden="true">
                Website
                <input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
              </label>
              {feedbackMutation.isError && (
                <div className="feedback-error" role="alert">
                  <AlertCircle size={15} />
                  <span>We could not send your feedback. Please try again.</span>
                </div>
              )}
              <div className="feedback-form-actions">
                <span>Do not include passwords, credentials, or private page content.</span>
                <button
                  type="submit"
                  className="how-start-button"
                  disabled={feedbackMutation.isPending || message.trim().length < 10}
                >
                  {feedbackMutation.isPending ? <LoaderCircle className="spin" size={15} /> : <MessageCircleQuestion size={15} />}
                  {feedbackMutation.isPending ? 'Sending…' : 'Send feedback'}
                </button>
              </div>
            </form>
          )}
          <div className="help-policy-links">
            <Link href="/about" onClick={onClose}>How the inspector works</Link>
            <Link href="/privacy" onClick={onClose}>Privacy and data use</Link>
          </div>
        </div>

        <div className="help-feedback-footer">
          <span>Messages are delivered privately to the SEO Meta Inspector team.</span>
          <button type="button" className={submitted ? 'how-start-button' : 'feedback-cancel-button'} onClick={onClose}>
            {submitted ? 'Done' : 'Cancel'}
          </button>
        </div>
      </section>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(dialog, document.body);
}

function AppFrame({
  children,
  active,
  context,
  topbarAction,
}: {
  children: ReactNode;
  active: NavKey;
  context: string;
  topbarAction: ReactNode;
}) {
  useMarsParallax();
  return (
    <div className="app-shell">
      <div className="mars-backdrop" aria-hidden="true" />
      <SideRail active={active} />
      <main className="main-column">
        <header className="topbar">
          <div className="topbar-context"><span className="crumb-dot" /> {context}</div>
          {topbarAction}
        </header>
        {children}
      </main>
    </div>
  );
}

const routeSeo: Record<string, { title: string; description: string; robots?: string }> = {
  '/': {
    title: 'Free SEO Meta Tag Inspector & Website Checker',
    description: 'Inspect any public website’s SEO title, meta description, canonical URL, social tags, and technical signals with a free, actionable report.',
  },
  '/recent-checks': {
    title: 'Recent Website SEO Inspections | SEO Meta Inspector',
    description: 'Reopen recent website SEO metadata checks saved securely in your browser and compare page titles, descriptions, social tags, and technical signals.',
    robots: 'noindex, follow',
  },
  '/field-guide': {
    title: 'SEO Meta Tags Field Guide | SEO Meta Inspector',
    description: 'Learn how title tags, meta descriptions, canonical URLs, Open Graph tags, and technical SEO signals affect search and social visibility.',
  },
  '/about': {
    title: 'About the Free SEO Website Inspector',
    description: 'Learn how SEO Meta Inspector fetches public pages, evaluates metadata signals, calculates scores, and protects the URLs and results you inspect.',
  },
  '/privacy': {
    title: 'Privacy Policy | SEO Meta Inspector',
    description: 'Read how SEO Meta Inspector handles submitted public URLs, browser history, analytics, feedback, cookies, and future advertising services.',
  },
};

function RouteSeo() {
  const [location] = useLocation();

  useEffect(() => {
    const path = location.split('?')[0] || '/';
    const seo = routeSeo[path] || routeSeo['/'];
    const canonicalUrl = `${SITE_URL}${path === '/' ? '/' : path}`;
    document.title = seo.title;

    const setMeta = (selector: string, attribute: string, value: string) => {
      const element = document.head.querySelector<HTMLMetaElement>(selector);
      if (element) element.setAttribute(attribute, value);
    };
    setMeta('meta[name="description"]', 'content', seo.description);
    setMeta('meta[name="robots"]', 'content', seo.robots || 'index, follow');
    setMeta('meta[property="og:title"]', 'content', seo.title);
    setMeta('meta[property="og:description"]', 'content', seo.description);
    setMeta('meta[property="og:url"]', 'content', canonicalUrl);
    setMeta('meta[name="twitter:title"]', 'content', seo.title);
    setMeta('meta[name="twitter:description"]', 'content', seo.description);
    document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute('href', canonicalUrl);
  }, [location]);

  return null;
}

function AdSlot({ slot, placement }: { slot: string; placement: string }) {
  const enabled = Boolean(ADSENSE_CLIENT_ID && slot);

  useEffect(() => {
    if (!enabled) return;
    const scriptId = 'google-adsense-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT_ID)}`;
      document.head.appendChild(script);
    }
    try {
      const adsWindow = window as typeof window & { adsbygoogle?: Record<string, never>[] };
      (adsWindow.adsbygoogle ||= []).push({});
    } catch {
      // Ad blockers and unfilled inventory should not interrupt the inspector.
    }
  }, [enabled, slot]);

  if (!enabled) {
    return import.meta.env.DEV ? (
      <aside className="ad-space ad-space-placeholder" aria-label="Advertisement preview">
        <span>Advertisement</span>
        <strong>{placement}</strong>
        <small>Activates after AdSense approval</small>
      </aside>
    ) : null;
  }

  return (
    <aside className="ad-space" aria-label="Advertisement">
      <span>Advertisement</span>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}

function Home() {
  const inspect = useInspectSeo();
  const [url, setUrl] = useState(() => {
    if (typeof window === 'undefined') return '';
    const queryUrl = new URLSearchParams(window.location.search).get('url');
    if (queryUrl) return queryUrl;
    const latest = readLatestInspection();
    return latest?.fetchedUrl || latest?.url || '';
  });
  const [inspection, setInspection] = useState<SeoInspection | null>(() => readLatestInspection());
  const [formError, setFormError] = useState('');
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [preview, setPreview] = useState<'google' | 'social'>('google');
  const [copied, setCopied] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const normalizedUrl = useMemo(() => {
    const clean = url.trim();
    if (!clean) return '';
    return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
  }, [url]);

  const runInspection = (source: 'form' | 'retry') => {
    setInspection(null);
    clearPersistedInspection();
    setOpenGroups([]);
    const parsed = new URL(normalizedUrl);
    trackEvent('inspection_started', {
      source,
      has_path: parsed.pathname !== '/',
    });
    inspect.mutate({ data: { url: normalizedUrl } }, {
      onSuccess: (result) => {
        setInspection(result);
        persistLatestInspection(result);
        setOpenGroups(result.groups.length ? [result.groups[0].key] : []);
        recordRecentCheck(result);
        trackEvent('inspection_completed', {
          score: result.score,
          score_label: result.scoreLabel,
          passed: result.passed,
          warnings: result.warnings,
          failures: result.failures,
        });
      },
      onError: () => {
        trackEvent('inspection_failed', { source });
      },
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (!url.trim()) {
      setFormError('Enter a public URL to begin the inspection.');
      return;
    }
    try {
      const parsed = new URL(normalizedUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) {
        throw new Error('invalid');
      }
    } catch {
      setFormError('That does not look like a valid public URL. Try example.com/page.');
      return;
    }
    runInspection('form');
  };

  const clear = () => {
    trackEvent('new_check_started');
    setInspection(null);
    clearPersistedInspection();
    setUrl('');
    setFormError('');
    setOpenGroups([]);
  };

  const copyUrl = async () => {
    if (!inspection) return;
    await navigator.clipboard?.writeText(inspection.fetchedUrl || inspection.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const inspectAgain = () => {
    if (!url.trim()) return;
    runInspection('retry');
  };

  return (
    <AppFrame
      active="inspect"
      context="Single-page diagnostic workspace"
      topbarAction={(
        <button
          className="topbar-action"
          type="button"
          onClick={() => {
            trackEvent('help_opened');
            setShowHowItWorks(true);
          }}
          aria-haspopup="dialog"
          data-testid="button-help"
        >
          <HelpCircle size={15} /> How it works
        </button>
      )}
    >
      <div className="workspace" id="inspect">
          <div className="hero-copy animate-in">
            <div className="eyebrow">Metadata health check <span className="eyebrow-rule" /></div>
            <h1 className="page-heading">Inspect your page’s <em>SEO metadata.</em></h1>
            <p className="page-lede">Paste a public URL. We will read the metadata search engines and social platforms use — then turn the hidden bits into a clear, useful report.</p>
          </div>

          <div className="inspect-form-wrap animate-in delay-1">
            <form className="inspect-form" onSubmit={submit} data-testid="form-inspect">
              <Link2 size={16} className="form-link-icon" aria-hidden="true" />
              <span className="url-prefix">https://</span>
              <input
                className="url-input"
                value={url.replace(/^https?:\/\//i, '')}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="yourdomain.com/page"
                aria-label="Public URL to inspect"
                data-testid="input-url"
                spellCheck="false"
                autoComplete="url"
              />
              <button className="inspect-button" type="submit" disabled={inspect.isPending} data-testid="button-inspect">
                {inspect.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <Search size={15} />}
                {inspect.isPending ? 'Reading page…' : 'Inspect URL'}
              </button>
            </form>
            {formError && <div className="form-error" role="alert" data-testid="status-form-error">{formError}</div>}
            <div className="quick-note">Tip: include a specific page path for the most useful result. <kbd>Enter</kbd> to inspect.</div>
          </div>

          <AdSlot slot={ADSENSE_PRIMARY_SLOT} placement="Responsive page banner" />
          {inspect.isPending && <LoadingState />}
          {inspect.isError && !inspect.isPending && <ErrorState onRetry={inspectAgain} />}
          {!inspect.isPending && !inspect.isError && !inspection && <EmptyState />}
          {!inspect.isPending && !inspect.isError && inspection && (
            <AuditReport
              inspection={inspection}
              openGroups={openGroups}
              setOpenGroups={setOpenGroups}
              preview={preview}
              setPreview={setPreview}
              onClear={clear}
              onCopy={copyUrl}
              copied={copied}
            />
          )}
      </div>
      {showHowItWorks && (
        <HowItWorksDialog
          onClose={() => setShowHowItWorks(false)}
          onStart={() => {
            setShowHowItWorks(false);
            document.getElementById('inspect')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />
      )}
    </AppFrame>
  );
}

function HowItWorksDialog({ onClose, onStart }: { onClose: () => void; onStart: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [isAnimationPlaying, setIsAnimationPlaying] = useState(true);
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const steps = [
    { number: '01', title: 'Paste a URL', copy: 'Start with any public page.' },
    { number: '02', title: 'Read the signals', copy: 'Find what crawlers can see.' },
    { number: '03', title: 'Prioritize fixes', copy: 'Turn gaps into next steps.' },
    { number: '04', title: 'Preview the result', copy: 'See search and social cards.' },
  ];

  return (
    <div className="how-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="how-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="how-dialog-header">
          <div>
            <div className="section-kicker">A clearer read in seconds</div>
            <h2 id="how-dialog-title">See what your page actually says.</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="dialog-close"
            onClick={onClose}
            aria-label="Close how it works"
          >
            <X size={16} />
          </button>
        </div>

        <p className="how-dialog-pitch">
          SEO Meta Inspector is a quick diagnostic tool for understanding how a webpage appears to search engines and social platforms.
          Paste in any public URL, and it checks key metadata like titles, descriptions, canonical links, and social cards—then turns the results
          into clear scores, actionable recommendations, and realistic search and sharing previews.
        </p>

        <div
          key={animationKey}
          className={`how-animation ${isAnimationPlaying ? '' : 'is-paused'}`}
          aria-label="The four steps of an SEO Meta Inspector check"
        >
          <div className="how-scan-line" aria-hidden="true" />
          <div className="how-animation-topline">
            <span><span className="how-live-dot" /> INSPECTION FLOW</span>
          </div>
          <div className="how-browser">
            <div className="how-browser-bar">
              <span className="how-browser-dot" />
              <span className="how-browser-dot" />
              <span className="how-browser-dot" />
              <div className="how-browser-url"><Link2 size={11} /> yourdomain.com/page</div>
            </div>
            <div className="how-browser-body">
              <div className="how-browser-heading" />
              <div className="how-browser-copy" />
              <div className="how-browser-copy short" />
              <div className="how-signal-stack">
                <span className="how-signal-chip">title</span>
                <span className="how-signal-chip">description</span>
                <span className="how-signal-chip">og:image</span>
              </div>
            </div>
          </div>
          <div className="how-pipeline" aria-label="Pipeline animation from URL to SEO and social previews">
            <div className="how-pipeline-track" aria-hidden="true">
              <span className="how-pipeline-connector connector-one" />
              <span className="how-pipeline-connector connector-two" />
              <span className="how-pipeline-connector connector-three" />
              <span className="how-pipeline-packet packet-one" />
              <span className="how-pipeline-packet packet-two" />
            </div>
            <div className="how-pipeline-node stage-one">
              <div className="how-node-icon"><Link2 size={13} /></div>
              <strong>URL</strong>
              <span>Fetch page</span>
            </div>
            <div className="how-pipeline-node stage-two">
              <div className="how-node-icon"><FileSearch size={13} /></div>
              <strong>Extract</strong>
              <span>Read tags</span>
            </div>
            <div className="how-pipeline-node stage-three">
              <div className="how-node-icon"><Gauge size={13} /></div>
              <strong>Score</strong>
              <span>Find gaps</span>
            </div>
            <div className="how-pipeline-node stage-four">
              <div className="how-node-icon"><Tags size={13} /></div>
              <strong>Preview</strong>
              <span>See the result</span>
            </div>
          </div>
          <div className="how-flow">
            {steps.map((step) => (
              <div className="how-step" key={step.number}>
                <div className="how-step-number">{step.number}</div>
                <div className="how-step-copy">
                  <strong>{step.title}</strong>
                  <span>{step.copy}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="how-animation-controls" aria-label="Animation controls">
            <button
              type="button"
              className="how-control-button primary"
              onClick={() => setIsAnimationPlaying((playing) => !playing)}
              aria-pressed={isAnimationPlaying}
              aria-label={isAnimationPlaying ? 'Pause animation' : 'Play animation'}
              data-testid="button-animation-toggle"
            >
              {isAnimationPlaying ? <Pause size={12} /> : <Play size={12} />}
              {isAnimationPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              className="how-control-button"
              onClick={() => {
                setAnimationKey((key) => key + 1);
                setIsAnimationPlaying(true);
              }}
              aria-label="Replay animation"
              data-testid="button-animation-replay"
            >
              <RotateCcw size={12} /> Replay
            </button>
            <span className="how-animation-status" aria-live="polite">
              {isAnimationPlaying ? 'Playing' : 'Paused'}
            </span>
          </div>
        </div>

        <div className="how-dialog-footer">
          <span><ShieldCheck size={14} /> Public pages only. No credentials, no crawl queue.</span>
          <button type="button" className="how-start-button" onClick={onStart}>
            Inspect a page <ArrowUpRight size={14} />
          </button>
        </div>
      </section>
    </div>
  );
}

function EmptyState() {
  return (
    <section className="empty-panel animate-in delay-2" data-testid="state-empty">
      <div className="empty-orbit orbit-one" />
      <div className="empty-orbit orbit-two" />
      <div className="empty-inner">
        <div className="empty-icon"><ShieldCheck size={24} /></div>
        <div className="empty-overline">Ready for a clear read</div>
        <h2 className="empty-title">Your next signal is one URL away.</h2>
        <p className="empty-copy">Start with a homepage, landing page, or campaign URL. The report stays focused on the tags that shape discovery and sharing.</p>
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <section className="loading-card animate-in" data-testid="state-loading" aria-live="polite">
      <div className="loading-layout">
        <div className="skeleton loading-score" />
        <div className="loading-main">
          <div className="skeleton loading-line wide" />
          <div className="skeleton loading-line short" />
          <div className="skeleton loading-block" />
          <div className="skeleton loading-block" />
          <div className="skeleton loading-block" />
        </div>
      </div>
      <div className="loading-message"><Sparkles size={13} /> Reading page structure and social signals…</div>
    </section>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="error-card animate-in" data-testid="state-error" role="alert">
      <div className="error-icon"><AlertCircle size={18} /></div>
      <div>
        <div className="error-overline">Inspection interrupted</div>
        <h2 className="error-title">We could not read that page.</h2>
        <p className="error-copy">The URL may be private, unavailable, or blocking inspection requests. Check the address and try again.</p>
        <button className="retry-button" onClick={onRetry} data-testid="button-retry"><RotateCcw size={13} /> Try again</button>
      </div>
    </section>
  );
}

function AuditReport({
  inspection, openGroups, setOpenGroups, preview, setPreview, onClear, onCopy, copied,
}: {
  inspection: SeoInspection;
  openGroups: string[];
  setOpenGroups: (groups: string[]) => void;
  preview: 'google' | 'social';
  setPreview: (preview: 'google' | 'social') => void;
  onClear: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  const toggleGroup = (key: string) => setOpenGroups(
    openGroups.includes(key) ? openGroups.filter((group) => group !== key) : [...openGroups, key],
  );
  const checked = inspection.passed + inspection.warnings + inspection.failures;
  const checkedAt = new Date(inspection.checkedAt);
  const categorySummaries = useMemo(() => summarizeCategories(inspection.groups), [inspection.groups]);
  const inspectedUrl = inspection.fetchedUrl || inspection.url;

  return (
    <section className="animate-in delay-2 report" data-testid="state-populated">
      <div className="audit-header">
        <div>
          <div className="audit-kicker"><span className="signal-pip" /> Latest inspection</div>
          <div className="audit-site">
            <SiteLogo url={inspectedUrl} hostname={inspection.hostname} className="audit-site-logo" />
            <div className="audit-url" data-testid="text-inspection-url">{inspectedUrl}</div>
          </div>
        </div>
        <div className="audit-actions">
          <button className="subtle-button" onClick={onCopy} data-testid="button-copy-url">
            {copied ? <ClipboardCheck size={14} /> : <Clipboard size={14} />} {copied ? 'Copied' : 'Copy URL'}
          </button>
          <button className="subtle-button" onClick={onClear} data-testid="button-new-inspection"><X size={14} /> New check</button>
        </div>
      </div>

      <div className="audit-grid">
        <ScoreCard inspection={inspection} />
        <section className="check-card" aria-labelledby="checks-heading">
          <div className="section-heading-row">
            <div>
              <div className="section-kicker">At a glance</div>
              <h2 className="section-heading" id="checks-heading">Checks by signal</h2>
              <div className="section-caption">{checked} metadata signals evaluated</div>
            </div>
            <div className="response-badge"><Activity size={13} /> {inspection.responseTimeMs} ms</div>
          </div>
          <div className="metrics">
            <Metric value={inspection.passed} label="Passed" tone="pass" />
            <Metric value={inspection.warnings} label="Review" tone="warn" />
            <Metric value={inspection.failures} label="Missing" tone="fail" />
          </div>
          <div className="group-list">
            {inspection.groups.map((group) => (
              <CheckGroup
                key={group.key}
                group={group}
                open={openGroups.includes(group.key)}
                onToggle={() => toggleGroup(group.key)}
              />
            ))}
          </div>
        </section>
      </div>

      <CategoryOverview summaries={categorySummaries} />
      <PreviewSection inspection={inspection} preview={preview} setPreview={setPreview} />
      <div className="audit-footer"><Globe2 size={13} /> Checked {Number.isNaN(checkedAt.getTime()) ? inspection.checkedAt : checkedAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} <span>·</span> {inspection.hostname}</div>
    </section>
  );
}

type CategorySummary = {
  key: string;
  label: string;
  passed: number;
  total: number;
  warnings: number;
  failures: number;
  tags: SeoTag[];
};

const categoryMeta: Record<string, { title: string; description: string; className: string }> = {
  core: { title: 'Search basics', description: 'The essentials a search result needs.', className: 'core' },
  content: { title: 'Content signals', description: 'Clues that explain the page.', className: 'content' },
  technical: { title: 'Technical health', description: 'How reliably crawlers can read it.', className: 'technical' },
  social: { title: 'Sharing preview', description: 'What appears when it travels.', className: 'social' },
};

function summarizeCategories(groups: SeoCheckGroup[]) {
  const map = new Map<string, CategorySummary>();
  groups.forEach((group) => group.tags.forEach((tag) => {
    const current = map.get(tag.category) || {
      key: tag.category,
      label: categoryMeta[tag.category]?.title || tag.category,
      passed: 0,
      total: 0,
      warnings: 0,
      failures: 0,
      tags: [],
    };
    current.total += 1;
    current.tags.push(tag);
    if (tag.status === 'pass') current.passed += 1;
    if (tag.status === 'warn') current.warnings += 1;
    if (tag.status === 'fail') current.failures += 1;
    map.set(tag.category, current);
  }));
  return Array.from(map.values());
}

function CategoryOverview({ summaries }: { summaries: CategorySummary[] }) {
  const [selectedSummary, setSelectedSummary] = useState<CategorySummary | null>(null);

  return (
    <section className="category-overview" aria-labelledby="category-heading">
      <div className="overview-heading">
        <div>
          <div className="section-kicker">Read the terrain</div>
          <h2 className="section-heading" id="category-heading">Where your page stands</h2>
        </div>
        <p>Start with the broad signals, then open a category below to see the exact tags behind it.</p>
      </div>
      <div className="category-grid">
        {summaries.map((summary) => (
          <CategoryCard
            key={summary.key}
            summary={summary}
            onClick={() => {
              trackEvent('category_opened', { category: summary.key });
              setSelectedSummary(summary);
            }}
          />
        ))}
      </div>
      {selectedSummary && (
        <CategoryDetailDialog
          summary={selectedSummary}
          onClose={() => setSelectedSummary(null)}
        />
      )}
    </section>
  );
}

function CategoryCard({ summary, onClick }: { summary: CategorySummary; onClick: () => void }) {
  const percentage = summary.total ? Math.round((summary.passed / summary.total) * 100) : 0;
  const meta = categoryMeta[summary.key] || { title: summary.label, description: 'Metadata signals in this group.', className: 'core' };
  const status = percentage === 100 ? 'pass' : percentage > 50 ? 'warn' : 'fail';
  return (
    <button
      type="button"
      className={`category-card ${meta.className}`}
      onClick={onClick}
      data-testid={`card-category-${summary.key}`}
      aria-label={`View details for ${meta.title}`}
    >
      <div className="category-card-top">
        <div className="category-orbit" style={{ background: `conic-gradient(var(--${status}) ${percentage}%, var(--track) 0)` }}>
          <div className="category-orbit-center">{percentage}<small>%</small></div>
        </div>
        <div className={`category-status ${status}`}><span className="status-dot" /> {summary.passed}/{summary.total} clear</div>
      </div>
      <h3>{meta.title}</h3>
      <p>{meta.description}</p>
      <div className="category-breakdown">
        <span><b className="pass-text">{summary.passed}</b> good</span>
        <span><b className="warn-text">{summary.warnings}</b> review</span>
        <span><b className="fail-text">{summary.failures}</b> missing</span>
      </div>
      <div className="category-progress"><span style={{ width: `${percentage}%` }} /></div>
      <span className="category-open-hint"><span>View {summary.total} checks</span><ArrowUpRight size={13} /></span>
    </button>
  );
}

function CategoryDetailDialog({ summary, onClose }: { summary: CategorySummary; onClose: () => void }) {
  const percentage = summary.total ? Math.round((summary.passed / summary.total) * 100) : 0;
  const meta = categoryMeta[summary.key] || { title: summary.label, description: 'Metadata signals in this group.', className: 'core' };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const dialog = (
    <div className="category-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`category-dialog ${meta.className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="category-dialog-header">
          <div>
            <div className="section-kicker">Category detail</div>
            <h2 id="category-dialog-title">{meta.title}</h2>
            <p>{meta.description}</p>
          </div>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Close category details">
            <X size={16} />
          </button>
        </div>
        <div className="category-dialog-summary">
          <div className="dialog-score">{percentage}<small>% clear</small></div>
          <div className="dialog-counts">
            <span><b className="pass-text">{summary.passed}</b> good</span>
            <span><b className="warn-text">{summary.warnings}</b> review</span>
            <span><b className="fail-text">{summary.failures}</b> missing</span>
          </div>
        </div>
        <div className="dialog-detail-heading">
          <span>Signals in this category</span>
          <span>{summary.total} total</span>
        </div>
        <div className="dialog-tag-list">
          {summary.tags.map((tag) => (
            <div className="dialog-tag-row" key={tag.key}>
              <div className="dialog-tag-main">
                <div className="dialog-tag-label">{tag.label}</div>
                <div className={`dialog-tag-value ${tag.value ? '' : 'empty'}`}>
                  {tag.value || 'Not found on page'}
                </div>
                {tag.note && <div className="dialog-tag-note">{tag.note}</div>}
              </div>
              <div className={`tag-badge ${tag.status}`}><span className="status-dot" />{tag.status}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(dialog, document.body);
}

function ScoreCard({ inspection }: { inspection: SeoInspection }) {
  const circumference = 2 * Math.PI * 62;
  const offset = circumference - (Math.max(0, Math.min(100, inspection.score)) / 100) * circumference;
  const tone = inspection.score >= 80 ? 'pass' : inspection.score >= 55 ? 'warn' : 'fail';
  return (
    <section className={`score-card score-${tone}`} data-testid="card-score">
      <div className="card-overline">Overall health <span>01</span></div>
      <div className="score-ring">
        <svg viewBox="0 0 140 140" aria-hidden="true">
          <circle className="score-ring-track" cx="70" cy="70" r="62" />
          <circle className="score-ring-value" cx="70" cy="70" r="62" strokeDasharray={circumference} strokeDashoffset={offset} />
        </svg>
        <div className="score-center">
          <div className="score-number" data-testid="text-score">{inspection.score}</div>
          <div className="score-denom">/ 100</div>
        </div>
      </div>
      <div className="score-label" data-testid="text-score-label">{inspection.scoreLabel}</div>
      <div className="score-meta">{inspection.title ? 'Strongest signal: title tag' : 'Page title needs attention'}</div>
      <div className="score-caption"><Check size={12} /> A score is a starting point, not a ranking.</div>
    </section>
  );
}

function Metric({ value, label, tone }: { value: number; label: string; tone: 'pass' | 'warn' | 'fail' }) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metric-value"><span className="status-dot" />{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

function CheckGroup({ group, open, onToggle }: { group: SeoCheckGroup; open: boolean; onToggle: () => void }) {
  const percentage = group.total ? Math.round((group.passed / group.total) * 100) : 0;
  const status = percentage === 100 ? 'pass' : percentage > 50 ? 'warn' : 'fail';
  return (
    <div className={`group-row ${open ? 'open' : ''}`}>
      <button className="group-trigger" onClick={onToggle} aria-expanded={open} data-testid={`button-group-${group.key}`}>
        <span className={`status-dot ${status}`} />
        <span className="group-label">{group.label}</span>
        <span className="group-count">{group.passed}/{group.total}</span>
        <span className="mini-bar"><span className={status} style={{ width: `${percentage}%` }} /></span>
        <ChevronDown size={14} className={`chevron ${open ? 'rotated' : ''}`} />
      </button>
      {open && (
        <div className="tag-list">
          {group.tags.map((tag) => <TagRow key={tag.key} tag={tag} />)}
        </div>
      )}
    </div>
  );
}

function TagRow({ tag }: { tag: SeoTag }) {
  return (
    <div className="tag-row" data-testid={`row-tag-${tag.key}`}>
      <div className="tag-name">{tag.label}</div>
      <div className={`tag-value ${tag.value ? '' : 'empty'}`}>{tag.value || 'Not found on page'}</div>
      <div className={`tag-badge ${tag.status}`}><span className="status-dot" />{tag.status}</div>
      {tag.note && <div className="tag-note">{tag.note}</div>}
    </div>
  );
}

function PreviewSection({ inspection, preview, setPreview }: { inspection: SeoInspection; preview: 'google' | 'social'; setPreview: (preview: 'google' | 'social') => void }) {
  const { title, description, url, siteName, image, imageAlt, twitterCard, locale } = inspection.preview;
  const googleTitle = inspection.title || title;
  const googleDescription = inspection.description || description;
  const googleUrl = url || inspection.fetchedUrl || inspection.url;
  return (
    <section className="preview-section" aria-labelledby="preview-heading">
      <div className="section-heading-row">
        <div>
          <div className="section-kicker">Make it tangible</div>
          <h2 className="section-heading" id="preview-heading">Appearance previews</h2>
          <div className="section-caption">A quick read on how this page travels.</div>
        </div>
        <ExternalLink size={16} className="section-ornament" />
      </div>
      <div className="preview-tabs" role="tablist">
        <button className={`preview-tab ${preview === 'google' ? 'active' : ''}`} onClick={() => { if (preview !== 'google') trackEvent('preview_switched', { preview: 'google' }); setPreview('google'); }} role="tab" aria-selected={preview === 'google'} data-testid="tab-google"><Search size={13} /> Google result</button>
        <button className={`preview-tab ${preview === 'social' ? 'active' : ''}`} onClick={() => { if (preview !== 'social') trackEvent('preview_switched', { preview: 'social' }); setPreview('social'); }} role="tab" aria-selected={preview === 'social'} data-testid="tab-social"><Tags size={13} /> Social card</button>
      </div>
      <div className="preview-card" data-testid={`preview-${preview}`}>
        <div className="preview-topline">
          <div className="preview-source">
            <div className="source-favicon">{preview === 'google' ? <Search size={13} /> : <ArrowUpRight size={14} />}</div>
            {preview === 'google' ? 'Search appearance' : 'Open Graph / Twitter'}
          </div>
          <div className="preview-label">{preview === 'google' ? 'DESKTOP' : twitterCard || 'SOCIAL CARD'}</div>
        </div>
        {preview === 'google' ? (
          <div className="google-result">
            <div className="google-source-row">
              <SiteLogo url={googleUrl} hostname={inspection.hostname} className="google-site-logo" />
              <div>
                <div className="google-site-name">{siteName || inspection.hostname}</div>
                <div className="google-url">{googleUrl}</div>
              </div>
            </div>
            <div className="google-title">{googleTitle || 'No page title found'}</div>
            <div className="google-description">{googleDescription || 'No meta description found for this page.'}</div>
          </div>
        ) : (
          <div className="social-result">
            <div className="social-image">
              {image ? <img src={image} alt={imageAlt || 'Social preview image'} /> : <span>No social image supplied</span>}
            </div>
            <div>
              <div className="social-kind">{siteName || inspection.hostname}</div>
              <div className="social-title">{title || 'No social title found'}</div>
              <div className="social-description">{description || 'No social description found.'}</div>
            </div>
          </div>
        )}
        <div className="preview-foot"><span>site: {siteName || inspection.hostname}</span><span>locale: {locale || '—'}</span></div>
      </div>
    </section>
  );
}

function SiteLogo({ url, hostname, className = '' }: { url: string; hostname: string; className?: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  let faviconUrl = '';
  try {
    faviconUrl = `${new URL(url).origin}/favicon.ico`;
  } catch {
    faviconUrl = '';
  }
  const initials = hostname.replace(/^www\./, '').slice(0, 2).toUpperCase();

  return (
    <span className={`site-logo ${className}`} aria-hidden="true">
      {faviconUrl && !imageFailed
        ? <img src={faviconUrl} alt="" onError={() => setImageFailed(true)} />
        : <span>{initials || 'WS'}</span>}
    </span>
  );
}

function SiteIcon({ check }: { check: RecentCheck }) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = check.hostname.replace(/^www\./, '').slice(0, 2).toUpperCase();
  return (
    <div className="site-icon" aria-hidden="true">
      {!imageFailed ? (
        <img src={check.faviconUrl} alt="" onError={() => setImageFailed(true)} />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

function formatCheckedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function RecentChecksPage() {
  const [checks, setChecks] = useState<RecentCheck[]>(readRecentChecks);

  useEffect(() => {
    const refresh = () => setChecks(readRecentChecks());
    window.addEventListener('seo-meta-inspector:recent-checks-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('seo-meta-inspector:recent-checks-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return (
    <AppFrame
      active="history"
      context="Inspection history"
      topbarAction={(
        <Link className="topbar-action" href="/">
          Inspect a URL <ArrowUpRight size={15} />
        </Link>
      )}
    >
      <div className="workspace secondary-workspace">
        <div className="page-intro animate-in">
          <div className="eyebrow">A visual trail of your work <span className="eyebrow-rule" /></div>
          <h1 className="page-heading">Recent website <em>SEO checks.</em></h1>
          <p className="page-lede">Every successful inspection stays here in this browser, newest first, so you can pick up where you left off.</p>
        </div>

        <AdSlot slot={ADSENSE_SECONDARY_SLOT} placement="Inspection history banner" />
        {checks.length === 0 ? (
          <section className="history-empty-panel animate-in delay-1">
            <div className="history-empty-icon"><History size={23} /></div>
            <div className="empty-overline">No checks yet</div>
            <h2 className="empty-title">Your first inspected page will appear here.</h2>
            <p className="empty-copy">Run a public URL check and this space will become a visual record of the pages you care about.</p>
            <Link className="how-start-button history-empty-action" href="/">Inspect your first URL <ArrowUpRight size={14} /></Link>
          </section>
        ) : (
          <section className="history-panel animate-in delay-1" aria-labelledby="history-heading">
            <div className="history-panel-header">
              <div>
                <div className="section-kicker">Latest first</div>
                <h2 className="section-heading" id="history-heading">Pages you have inspected</h2>
              </div>
              <div className="history-count"><b>{checks.length}</b> {checks.length === 1 ? 'page' : 'pages'}</div>
            </div>
            <div className="history-list">
              {checks.map((check, index) => {
                const tone = check.score >= 80 ? 'pass' : check.score >= 55 ? 'warn' : 'fail';
                return (
                  <article className="history-card" key={`${check.id}-${check.checkedAt}`}>
                    <div className="history-rank">{String(index + 1).padStart(2, '0')}</div>
                    <SiteIcon check={check} />
                    <div className="history-card-main">
                      <div className="history-host">{check.hostname}</div>
                      <h3>{check.title}</h3>
                      <div className="history-url">{check.url}</div>
                      <div className="history-card-meta"><span><History size={11} /> {formatCheckedAt(check.checkedAt)}</span><span className={`history-status ${tone}`}><span className="status-dot" /> {check.scoreLabel}</span></div>
                    </div>
                    <div className={`history-score ${tone}`}><strong>{check.score}</strong><span>/100</span></div>
                    <Link className="history-open" href={`/?url=${encodeURIComponent(check.url)}`} onClick={() => trackEvent('history_check_reopened', { source: 'recent_checks' })}>
                      Inspect again <ArrowUpRight size={14} />
                    </Link>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </AppFrame>
  );
}

const guideSections = [
  {
    key: 'search',
    icon: Search,
    kicker: '01 / Search appearance',
    title: 'Help the right result win the click.',
    description: 'Search engines need a precise headline and a useful summary before they can represent a page well.',
    signals: [
      { label: 'Title tag', key: 'title', guidance: 'Aim for 30–60 characters. Make it unique, specific, and useful before the brand name.' },
      { label: 'Meta description', key: 'description', guidance: 'Aim for 120–160 characters that explain the page and give someone a reason to choose it.' },
    ],
  },
  {
    key: 'content',
    icon: FileSearch,
    kicker: '02 / Content signals',
    title: 'Give the page one clear idea.',
    description: 'A strong primary heading makes the page easier to understand for people, crawlers, and assistive technology.',
    signals: [
      { label: 'H1 heading', key: 'h1', guidance: 'Use one clear H1 that describes the page’s main promise. Supporting sections can use H2 and H3 headings.' },
    ],
  },
  {
    key: 'technical',
    icon: ShieldCheck,
    kicker: '03 / Technical health',
    title: 'Remove friction for crawlers.',
    description: 'Technical signals do not replace good content, but they make that content easier to discover, interpret, and render.',
    signals: [
      { label: 'Canonical URL', key: 'canonical', guidance: 'Declare the preferred URL when similar pages or parameters could create duplicates.' },
      { label: 'Mobile viewport', key: 'viewport', guidance: 'Include a responsive viewport so mobile browsers render the page at the intended scale.' },
      { label: 'Language and encoding', key: 'lang / charset', guidance: 'Declare the document language and UTF-8 encoding early so the page is interpreted consistently.' },
      { label: 'Robots directive', key: 'robots', guidance: 'Check this deliberately. A noindex directive is useful when intentional and a serious mistake when it is not.' },
    ],
  },
  {
    key: 'sharing',
    icon: Tags,
    kicker: '04 / Sharing preview',
    title: 'Control how the page travels.',
    description: 'Social platforms build a preview from a different set of tags. Treat the share card as a second first impression.',
    signals: [
      { label: 'Open Graph title and description', key: 'og:title / og:description', guidance: 'Write a social-specific headline and summary when the search snippet and share context need different wording.' },
      { label: 'Open Graph image', key: 'og:image', guidance: 'Use a purposeful image that still reads clearly when the link appears in a feed or message.' },
      { label: 'Share URL and card type', key: 'og:url / twitter:card', guidance: 'Declare the canonical share URL and choose a card layout so platforms know what to render.' },
      { label: 'Image alt text', key: 'og:image:alt', guidance: 'Describe the share image for people who use assistive technology or cannot see the image.' },
    ],
  },
];

function FieldGuidePage() {
  return (
    <AppFrame
      active="guides"
      context="SEO field guide"
      topbarAction={(
        <Link className="topbar-action" href="/">
          Inspect a URL <ArrowUpRight size={15} />
        </Link>
      )}
    >
      <div className="workspace secondary-workspace">
        <div className="page-intro animate-in">
          <div className="eyebrow">A practical map of the signals <span className="eyebrow-rule" /></div>
          <h1 className="page-heading">SEO meta tags <em>field guide.</em></h1>
          <p className="page-lede">A short field guide to the metadata that shapes discovery, crawlability, and sharing — and what “good” looks like when you inspect a page.</p>
        </div>

        <section className="guide-callout animate-in delay-1">
          <div className="guide-callout-icon"><Gauge size={18} /></div>
          <div>
            <div className="section-kicker">Recommended order</div>
            <h2>Start with the essentials, then sharpen the edges.</h2>
            <p>Fix missing title and description tags first. Next, make sure crawlers can interpret the page. Finally, tune the social card so the same URL looks intentional when it is shared.</p>
          </div>
        </section>

        <AdSlot slot={ADSENSE_SECONDARY_SLOT} placement="SEO field guide banner" />
        <div className="guide-grid">
          {guideSections.map((section, index) => {
            const Icon = section.icon;
            return (
              <section className={`guide-card guide-${section.key} animate-in`} style={{ animationDelay: `${0.12 + index * 0.06}s` }} key={section.key}>
                <div className="guide-card-top">
                  <div className="guide-icon"><Icon size={17} /></div>
                  <span className="guide-index">{section.kicker}</span>
                </div>
                <h2>{section.title}</h2>
                <p className="guide-description">{section.description}</p>
                <div className="guide-signal-list">
                  {section.signals.map((signal) => (
                    <div className="guide-signal" key={signal.key}>
                      <div className="guide-signal-heading">
                        <strong>{signal.label}</strong>
                        <code>{signal.key}</code>
                      </div>
                      <p>{signal.guidance}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </AppFrame>
  );
}

function AboutPage() {
  return (
    <AppFrame
      active="about"
      context="About the inspector"
      topbarAction={<Link className="topbar-action" href="/">Inspect a URL <ArrowUpRight size={15} /></Link>}
    >
      <div className="workspace secondary-workspace">
        <div className="page-intro animate-in">
          <div className="eyebrow">Transparent by design <span className="eyebrow-rule" /></div>
          <h1 className="page-heading">How the SEO <em>inspector works.</em></h1>
          <p className="page-lede">SEO Meta Inspector is a free, single-page diagnostic tool for understanding the metadata that search engines and social platforms can read.</p>
        </div>

        <div className="editorial-grid animate-in delay-1">
          <article className="editorial-card">
            <div className="section-kicker">01 / Fetch</div>
            <h2>Read one public page</h2>
            <p>The inspector requests the exact URL you provide. It does not crawl the rest of the website, sign into private areas, or ask for website credentials.</p>
          </article>
          <article className="editorial-card">
            <div className="section-kicker">02 / Evaluate</div>
            <h2>Check visible metadata signals</h2>
            <p>The report reviews title and description tags, headings, canonical and robots directives, language and mobile settings, plus Open Graph and social-card metadata.</p>
          </article>
          <article className="editorial-card">
            <div className="section-kicker">03 / Explain</div>
            <h2>Turn tags into next steps</h2>
            <p>Each signal is grouped into a practical category and marked as passed, worth reviewing, or missing. The score is diagnostic guidance, not a promise of search ranking.</p>
          </article>
        </div>

        <section className="methodology-panel">
          <div>
            <div className="section-kicker">Scope and limitations</div>
            <h2>A useful technical check, not a complete SEO campaign</h2>
          </div>
          <p>Strong metadata helps search engines interpret and present a page, but rankings also depend on original content, authority, links, performance, relevance, competition, and many other signals. Use this report as a focused starting point.</p>
        </section>

        <footer className="about-credit">
          <span>Built by</span>
          <a
            href="https://www.linkedin.com/in/arthur-nyikayaramba"
            target="_blank"
            rel="noreferrer"
          >
            Arthur Nyikayaramba
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </footer>
      </div>
    </AppFrame>
  );
}

function PrivacyPage() {
  return (
    <AppFrame
      active="privacy"
      context="Privacy and data use"
      topbarAction={<Link className="topbar-action" href="/">Inspect a URL <ArrowUpRight size={15} /></Link>}
    >
      <article className="workspace secondary-workspace policy-page">
        <div className="page-intro animate-in">
          <div className="eyebrow">Last updated 14 September 2026 <span className="eyebrow-rule" /></div>
          <h1 className="page-heading">Privacy and <em>data use.</em></h1>
          <p className="page-lede">This notice explains what the SEO Meta Inspector processes when you inspect a public webpage or send feedback.</p>
        </div>

        <div className="policy-content animate-in delay-1">
          <section>
            <h2>URLs and inspection results</h2>
            <p>When you submit a URL, the server requests that public page to analyse its metadata. Do not submit private, authenticated, or confidential URLs. Recent checks and the latest result are stored in your browser’s local storage so you can reopen them; they are not tied to an account.</p>
          </section>
          <section>
            <h2>Analytics</h2>
            <p>The site uses Replit-hosted, Umami-compatible analytics to understand page visits and broad product interactions. Custom events use aggregate values and do not intentionally include inspected URLs, page titles, page content, or free-form user text.</p>
          </section>
          <section>
            <h2>Feedback</h2>
            <p>If you use the Help &amp; feedback form, your message, selected category, and optional reply address are emailed privately to the SEO Meta Inspector team. Do not include passwords, credentials, or private website content.</p>
          </section>
          <section>
            <h2>Advertising and cookies</h2>
            <p>Advertising is not currently active. If Google AdSense is enabled later, this notice will be updated and visitors in the UK, EEA, and Switzerland will be shown consent choices through a Google-certified consent management platform before advertising cookies or personalised ads are used where required.</p>
          </section>
          <section>
            <h2>Your choices</h2>
            <p>You can remove locally stored inspection history by clearing this site’s browser data. You can also use the Help &amp; feedback entry to ask a privacy question or recommend a correction to this notice.</p>
          </section>
        </div>
      </article>
    </AppFrame>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <RouteSeo />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/recent-checks" component={RecentChecksPage} />
        <Route path="/field-guide" component={FieldGuidePage} />
        <Route path="/about" component={AboutPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;