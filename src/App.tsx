import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import {
  ARC_EXPLORER_URL,
  configuredEscrowAddress,
  completeOnchainJob,
  connectArcWallet,
  createOnchainJob,
  disputeOnchainJob,
  fundOnchainJob,
  readUsdcBalance,
  shortAddress,
  submitOnchainDeliverable,
} from "./lib/arc";
import { demoJobs } from "./lib/demo";
import type { JobStatus, ServiceJob, Toast } from "./types";

type View = "dashboard" | "jobs" | "evidence" | "settings";

const statusOrder: JobStatus[] = ["Open", "Funded", "Delivered", "Completed", "Disputed", "Refunded"];

function dateText(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function statusClass(status: JobStatus) {
  return `badge badge-${status.toLowerCase()}`;
}

function StatusDot({ status }: { status: JobStatus }) {
  return <span className={statusClass(status)}>{status}</span>;
}

function copy(value: string) {
  void navigator.clipboard.writeText(value);
}

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [wallet, setWallet] = useState<Address | undefined>();
  const [balance, setBalance] = useState<string>("—");
  const [jobs, setJobs] = useState<ServiceJob[]>(() => {
    const saved = localStorage.getItem("arcproof.jobs");
    return saved ? (JSON.parse(saved) as ServiceJob[]) : demoJobs;
  });
  const [activeJob, setActiveJob] = useState<ServiceJob | undefined>(demoJobs[0]);
  const [showCreate, setShowCreate] = useState(false);
  const [showDeliverable, setShowDeliverable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | undefined>();

  const isLive = Boolean(configuredEscrowAddress && configuredEscrowAddress.length === 42);

  useEffect(() => {
    localStorage.setItem("arcproof.jobs", JSON.stringify(jobs));
  }, [jobs]);

  useEffect(() => {
    if (wallet) {
      void readUsdcBalance(wallet).then(setBalance).catch(() => setBalance("Unavailable"));
    }
  }, [wallet]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const metrics = useMemo(() => {
    const locked = jobs.filter((job) => ["Funded", "Delivered", "Disputed"].includes(job.status)).reduce((sum, job) => sum + job.amount, 0);
    const paid = jobs.filter((job) => job.status === "Completed").reduce((sum, job) => sum + job.amount, 0);
    return {
      locked,
      paid,
      active: jobs.filter((job) => ["Funded", "Delivered"].includes(job.status)).length,
      disputes: jobs.filter((job) => job.status === "Disputed").length,
    };
  }, [jobs]);

  async function connect() {
    setBusy(true);
    try {
      const account = await connectArcWallet();
      setWallet(account);
      setToast({ type: "success", message: `Connected ${shortAddress(account)} on Arc Testnet.` });
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Wallet connection failed." });
    } finally {
      setBusy(false);
    }
  }

  function updateJob(updated: ServiceJob) {
    setJobs((all) => all.map((job) => (job.id === updated.id ? updated : job)));
    setActiveJob(updated);
  }

  async function onFund(job: ServiceJob) {
    setBusy(true);
    try {
      if (isLive) {
        const result = await fundOnchainJob(job.id, String(job.amount));
        updateJob({ ...job, status: "Funded", txHash: result.fundHash });
        setToast({ type: "success", message: "USDC approved and escrow funded on Arc Testnet." });
      } else {
        updateJob({ ...job, status: "Funded" });
        setToast({ type: "success", message: "Demo escrow funded. Deploy the contract to enable an onchain transaction." });
      }
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Could not fund the job." });
    } finally {
      setBusy(false);
    }
  }

  async function onComplete(job: ServiceJob) {
    setBusy(true);
    try {
      if (isLive) {
        const hash = await completeOnchainJob(job.id);
        updateJob({ ...job, status: "Completed", txHash: hash });
        setToast({ type: "success", message: "Escrow released to the service provider." });
      } else {
        updateJob({ ...job, status: "Completed" });
        setToast({ type: "success", message: "Demo release completed." });
      }
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Could not release escrow." });
    } finally {
      setBusy(false);
    }
  }

  async function onDispute(job: ServiceJob) {
    setBusy(true);
    try {
      if (isLive) {
        const hash = await disputeOnchainJob(job.id);
        updateJob({ ...job, status: "Disputed", txHash: hash });
      } else {
        updateJob({ ...job, status: "Disputed" });
      }
      setToast({ type: "info", message: "Dispute opened. Funds remain locked until an arbiter resolves it." });
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Could not open the dispute." });
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(input: {
    title: string;
    provider: string;
    evaluator: string;
    amount: string;
    deadline: string;
    description: string;
  }) {
    setBusy(true);
    try {
      const id = Math.max(0, ...jobs.map((job) => job.id)) + 1;
      const newJob: ServiceJob = {
        id,
        title: input.title,
        client: wallet ? shortAddress(wallet) : "You",
        provider: input.provider,
        evaluator: input.evaluator || "You",
        amount: Number(input.amount),
        deadline: new Date(input.deadline).toISOString(),
        createdAt: new Date().toISOString(),
        status: "Open",
        description: input.description,
      };

      if (isLive) {
        if (!wallet) throw new Error("Connect your client wallet before creating an onchain job.");
        const hash = await createOnchainJob({
          provider: input.provider as Address,
          evaluator: (input.evaluator || wallet) as Address,
          amount: input.amount,
          deadline: new Date(input.deadline),
          description: input.description,
        });
        newJob.txHash = hash;
      }
      setJobs((all) => [newJob, ...all]);
      setActiveJob(newJob);
      setShowCreate(false);
      setView("jobs");
      setToast({ type: "success", message: isLive ? "Job created on Arc Testnet." : "Demo job created locally." });
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Could not create job." });
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitDeliverable(value: string) {
    if (!activeJob) return;
    setBusy(true);
    try {
      let txHash: string | undefined;
      if (isLive) txHash = await submitOnchainDeliverable(activeJob.id, value);
      updateJob({
        ...activeJob,
        status: "Delivered",
        deliverable: value,
        deliverableHash: isLive ? "Recorded on-chain" : `Local proof: ${value.slice(0, 26)}…`,
        txHash: txHash || activeJob.txHash,
      });
      setShowDeliverable(false);
      setToast({ type: "success", message: isLive ? "Deliverable hash submitted on Arc Testnet." : "Demo deliverable recorded." });
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Could not submit deliverable." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand" onClick={() => setView("dashboard")} role="button" tabIndex={0}>
          <div className="brand-mark">A</div>
          <div>
            <div className="brand-name">ArcProof</div>
            <div className="brand-subtitle">Digital service escrow</div>
          </div>
        </div>

        <nav className="nav">
          <NavItem icon="⌂" label="Overview" active={view === "dashboard"} onClick={() => setView("dashboard")} />
          <NavItem icon="▣" label="Jobs" active={view === "jobs"} onClick={() => setView("jobs")} count={metrics.active} />
          <NavItem icon="⌁" label="Evidence vault" active={view === "evidence"} onClick={() => setView("evidence")} />
          <NavItem icon="⚙" label="Settings" active={view === "settings"} onClick={() => setView("settings")} />
        </nav>

        <div className="sidebar-footer">
          <div className={`network-card ${isLive ? "network-live" : ""}`}>
            <div className="network-top"><span className="live-dot" /> {isLive ? "Live contract" : "Demo mode"}</div>
            <p>{isLive ? shortAddress(configuredEscrowAddress) : "Local workflow; no wallet transaction is sent."}</p>
          </div>
          <a className="docs-link" href="https://docs.arc.network" target="_blank" rel="noreferrer">Arc developer docs ↗</a>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">ARC TESTNET · USDC ESCROW</div>
            <h1>{view === "dashboard" ? "Service settlement, with evidence." : view === "jobs" ? "Your service jobs" : view === "evidence" ? "Evidence vault" : "Workspace settings"}</h1>
          </div>
          <div className="top-actions">
            <div className="balance-pill"><span>USDC</span><strong>{balance}</strong></div>
            <button className="button button-secondary" onClick={connect} disabled={busy}>{wallet ? shortAddress(wallet) : "Connect wallet"}</button>
            <button className="button button-primary" onClick={() => setShowCreate(true)}>＋ New job</button>
          </div>
        </header>

        {view === "dashboard" && (
          <Dashboard jobs={jobs} metrics={metrics} onOpen={setActiveJob} onViewJobs={() => setView("jobs")} onFund={onFund} busy={busy} />
        )}
        {view === "jobs" && (
          <JobsView jobs={jobs} activeJob={activeJob} onSelect={setActiveJob} onFund={onFund} onComplete={onComplete} onDispute={onDispute} onDeliver={() => setShowDeliverable(true)} busy={busy} />
        )}
        {view === "evidence" && <EvidenceView jobs={jobs} onOpen={(job) => { setActiveJob(job); setView("jobs"); }} />}
        {view === "settings" && <SettingsView isLive={isLive} onReset={() => { localStorage.removeItem("arcproof.jobs"); setJobs(demoJobs); setToast({ type: "info", message: "Demo data restored." }); }} />}
      </main>

      {showCreate && <CreateJobModal busy={busy} wallet={wallet} live={isLive} onClose={() => setShowCreate(false)} onSubmit={onCreate} />}
      {showDeliverable && activeJob && <DeliverableModal job={activeJob} busy={busy} onClose={() => setShowDeliverable(false)} onSubmit={onSubmitDeliverable} />}
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}

function NavItem({ icon, label, active, onClick, count }: { icon: string; label: string; active: boolean; onClick: () => void; count?: number }) {
  return <button className={`nav-item ${active ? "nav-active" : ""}`} onClick={onClick}><span>{icon}</span>{label}{count ? <b>{count}</b> : null}</button>;
}

function Dashboard({ jobs, metrics, onOpen, onViewJobs, onFund, busy }: {
  jobs: ServiceJob[];
  metrics: { locked: number; paid: number; active: number; disputes: number };
  onOpen: (job: ServiceJob) => void;
  onViewJobs: () => void;
  onFund: (job: ServiceJob) => void | Promise<void>;
  busy: boolean;
}) {
  const upcoming = jobs.filter((job) => job.status !== "Completed" && job.status !== "Refunded").slice(0, 4);
  return <section className="page-content">
    <section className="hero-card">
      <div className="hero-copy">
        <span className="hero-chip">BUILT FOR DIGITAL SERVICES</span>
        <h2>Escrow that makes the work <em>provable.</em></h2>
        <p>Create a service agreement, lock USDC, preserve a delivery hash, and settle only when the client approves.</p>
        <div className="hero-actions"><button className="button button-primary" onClick={onViewJobs}>Review jobs</button><span>Arc USDC settlement</span></div>
      </div>
      <div className="proof-orbit" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="proof-core">✓<small>Proof</small></div><div className="orbit-label label-a">USDC held</div><div className="orbit-label label-b">Hash stored</div><div className="orbit-label label-c">Release</div></div>
    </section>

    <section className="metric-grid">
      <Metric label="USDC in escrow" value={`${metrics.locked.toLocaleString()} USDC`} hint="Funds locked in active agreements" mark="↗" />
      <Metric label="Settled volume" value={`${metrics.paid.toLocaleString()} USDC`} hint="Completed jobs in this workspace" mark="✓" />
      <Metric label="Active jobs" value={String(metrics.active).padStart(2, "0")} hint="Awaiting delivery or approval" mark="▣" />
      <Metric label="Open disputes" value={String(metrics.disputes).padStart(2, "0")} hint="Arbiter attention required" mark="!" />
    </section>

    <section className="section-header"><div><span className="eyebrow">LIVE WORKSPACE</span><h3>Priority queue</h3></div><button className="text-button" onClick={onViewJobs}>View all jobs →</button></section>
    <section className="table-card">
      <div className="job-table-head"><span>Agreement</span><span>Provider</span><span>Amount</span><span>Deadline</span><span>Status</span><span /></div>
      {upcoming.map((job) => <div className="job-row" key={job.id} onClick={() => onOpen(job)} role="button" tabIndex={0}>
        <div><strong>{job.title}</strong><small>#{job.id} · Created {dateText(job.createdAt)}</small></div><span>{job.provider}</span><strong>{job.amount.toLocaleString()} USDC</strong><span>{dateText(job.deadline)}</span><StatusDot status={job.status} /><div>{job.status === "Open" ? <button className="row-action" disabled={busy} onClick={(event) => { event.stopPropagation(); void onFund(job); }}>Fund</button> : "→"}</div>
      </div>)}
    </section>
  </section>;
}

function Metric({ label, value, hint, mark }: { label: string; value: string; hint: string; mark: string }) {
  return <article className="metric-card"><div className="metric-icon">{mark}</div><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>;
}

function JobsView({ jobs, activeJob, onSelect, onFund, onComplete, onDispute, onDeliver, busy }: {
  jobs: ServiceJob[]; activeJob?: ServiceJob; onSelect: (job: ServiceJob) => void; onFund: (job: ServiceJob) => void | Promise<void>; onComplete: (job: ServiceJob) => void | Promise<void>; onDispute: (job: ServiceJob) => void | Promise<void>; onDeliver: () => void; busy: boolean;
}) {
  const [filter, setFilter] = useState<"All" | JobStatus>("All");
  const visible = filter === "All" ? jobs : jobs.filter((job) => job.status === filter);
  return <section className="page-content jobs-layout">
    <section className="jobs-list-card">
      <div className="filters">{["All", ...statusOrder].map((name) => <button key={name} onClick={() => setFilter(name as "All" | JobStatus)} className={filter === name ? "filter-active" : ""}>{name}<span>{name === "All" ? jobs.length : jobs.filter((job) => job.status === name).length}</span></button>)}</div>
      {visible.map((job) => <button key={job.id} className={`job-list-item ${activeJob?.id === job.id ? "selected" : ""}`} onClick={() => onSelect(job)}><div className="job-list-item-top"><StatusDot status={job.status} /><span>#{job.id}</span></div><strong>{job.title}</strong><div><span>{job.amount.toLocaleString()} USDC</span><span>{dateText(job.deadline)}</span></div></button>)}
    </section>
    <section className="detail-card">
      {!activeJob ? <div className="empty">Select a job to inspect its agreement.</div> : <JobDetail job={activeJob} onFund={onFund} onComplete={onComplete} onDispute={onDispute} onDeliver={onDeliver} busy={busy} />}
    </section>
  </section>;
}

function JobDetail({ job, onFund, onComplete, onDispute, onDeliver, busy }: { job: ServiceJob; onFund: (job: ServiceJob) => void | Promise<void>; onComplete: (job: ServiceJob) => void | Promise<void>; onDispute: (job: ServiceJob) => void | Promise<void>; onDeliver: () => void; busy: boolean }) {
  const canFund = job.status === "Open";
  const canDeliver = job.status === "Funded";
  const canRelease = job.status === "Delivered";
  const canDispute = ["Funded", "Delivered"].includes(job.status);
  return <>
    <div className="detail-header"><div><div className="detail-kicker">SERVICE AGREEMENT · #{job.id}</div><h2>{job.title}</h2><p>{job.description}</p></div><StatusDot status={job.status} /></div>
    <div className="detail-metrics"><div><span>Escrow amount</span><strong>{job.amount.toLocaleString()} USDC</strong></div><div><span>Deadline</span><strong>{dateText(job.deadline)}</strong></div><div><span>Evaluator</span><strong>{job.evaluator}</strong></div></div>
    <div className="timeline"><Timeline active={true} label="Agreement created" note={dateText(job.createdAt)} /><Timeline active={job.status !== "Open"} label="USDC funded" note={job.status === "Open" ? "Awaiting client" : "Escrow locked"} /><Timeline active={["Delivered", "Completed", "Disputed"].includes(job.status)} label="Deliverable submitted" note={job.deliverableHash || "Awaiting proof"} /><Timeline active={job.status === "Completed"} label="Settlement released" note={job.status === "Completed" ? "Provider paid" : "Awaiting client approval"} /></div>
    {job.deliverable && <div className="evidence-box"><div><span>DELIVERABLE REFERENCE</span><strong>{job.deliverable}</strong><small>{job.deliverableHash}</small></div><button className="copy-button" onClick={() => copy(job.deliverable!)}>Copy</button></div>}
    {job.txHash && <a className="tx-link" href={`${ARC_EXPLORER_URL}/tx/${job.txHash}`} target="_blank" rel="noreferrer">View last transaction on Arcscan ↗</a>}
    <div className="detail-actions">{canFund && <button className="button button-primary" disabled={busy} onClick={() => void onFund(job)}>Fund escrow</button>}{canDeliver && <button className="button button-primary" disabled={busy} onClick={onDeliver}>Submit deliverable</button>}{canRelease && <button className="button button-primary" disabled={busy} onClick={() => void onComplete(job)}>Approve & release</button>}{canDispute && <button className="button button-danger" disabled={busy} onClick={() => void onDispute(job)}>Open dispute</button>}</div>
  </>;
}

function Timeline({ active, label, note }: { active: boolean; label: string; note: string }) {
  return <div className={`timeline-step ${active ? "timeline-active" : ""}`}><span className="timeline-dot">{active ? "✓" : ""}</span><div><strong>{label}</strong><small>{note}</small></div></div>;
}

function EvidenceView({ jobs, onOpen }: { jobs: ServiceJob[]; onOpen: (job: ServiceJob) => void }) {
  const evidence = jobs.filter((job) => job.deliverable);
  return <section className="page-content"><div className="evidence-intro"><span className="eyebrow">HASH-BASED DELIVERY RECORDS</span><h2>Every deliverable has a verifiable trail.</h2><p>ArcProof records the source reference off-chain and commits a cryptographic hash through the settlement lifecycle.</p></div><section className="evidence-grid">{evidence.map((job) => <article className="evidence-card" key={job.id}><div className="file-icon">⌘</div><StatusDot status={job.status} /><h3>{job.title}</h3><p>{job.deliverable}</p><code>{job.deliverableHash}</code><button className="text-button" onClick={() => onOpen(job)}>Open agreement →</button></article>)}</section></section>;
}

function SettingsView({ isLive, onReset }: { isLive: boolean; onReset: () => void }) {
  return <section className="page-content settings-grid"><article className="settings-card"><span className="eyebrow">NETWORK</span><h2>Arc Testnet</h2><dl><dt>Chain ID</dt><dd>5042002</dd><dt>RPC</dt><dd>rpc.testnet.arc.network</dd><dt>Settlement asset</dt><dd>USDC · 6-decimal ERC-20 interface</dd><dt>Mode</dt><dd>{isLive ? "Live contract configured" : "Demo mode"}</dd></dl></article><article className="settings-card"><span className="eyebrow">CONTRACT SETUP</span><h2>Enable live settlement</h2><p>Deploy the Solidity contract inside <code>contracts/</code>, then add its address to <code>.env</code> as <code>VITE_ARCPROOF_ESCROW_ADDRESS</code>.</p><p className="warning">Use Arc Testnet USDC only. This template is a prototype and has not been audited.</p></article><article className="settings-card"><span className="eyebrow">DEMO DATA</span><h2>Reset workspace</h2><p>Restore the seeded agreements and clear all changes stored in your browser.</p><button className="button button-secondary" onClick={onReset}>Restore demo data</button></article></section>;
}

function CreateJobModal({ busy, wallet, live, onClose, onSubmit }: { busy: boolean; wallet?: Address; live: boolean; onClose: () => void; onSubmit: (input: { title: string; provider: string; evaluator: string; amount: string; deadline: string; description: string }) => void | Promise<void> }) {
  const [form, setForm] = useState({ title: "", provider: "", evaluator: "", amount: "", deadline: "", description: "" });
  function set(key: keyof typeof form, value: string) { setForm((state) => ({ ...state, [key]: value })); }
  const canSubmit = form.title && form.provider && form.amount && form.deadline && form.description && (!live || Boolean(wallet));
  return <Modal title="Create protected service job" subtitle={live ? "This will create an onchain agreement on Arc Testnet." : "Demo mode creates a local workflow record only."} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (canSubmit) void onSubmit(form); }} className="modal-form"><label>Service title<input required value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="e.g. Smart contract security review" /></label><label>Provider wallet<input required value={form.provider} onChange={(event) => set("provider", event.target.value)} placeholder="0x…" /></label><label>Evaluator wallet <small>optional</small><input value={form.evaluator} onChange={(event) => set("evaluator", event.target.value)} placeholder={wallet || "Defaults to client in live mode"} /></label><div className="form-split"><label>Escrow amount (USDC)<input required min="0.01" step="0.01" type="number" value={form.amount} onChange={(event) => set("amount", event.target.value)} placeholder="250" /></label><label>Deadline<input required type="datetime-local" value={form.deadline} onChange={(event) => set("deadline", event.target.value)} /></label></div><label>Scope of work<textarea required value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Define what the provider must deliver and the success criteria." rows={4} /></label>{live && !wallet && <div className="form-note">Connect the client wallet before creating a live job.</div>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={!canSubmit || busy}>{busy ? "Creating…" : "Create job"}</button></div></form></Modal>;
}

function DeliverableModal({ job, busy, onClose, onSubmit }: { job: ServiceJob; busy: boolean; onClose: () => void; onSubmit: (value: string) => void | Promise<void> }) {
  const [value, setValue] = useState("");
  return <Modal title="Submit delivery evidence" subtitle={`Job #${job.id} · a hash of this reference is committed to the agreement.`} onClose={onClose}><form className="modal-form" onSubmit={(event) => { event.preventDefault(); if (value) void onSubmit(value); }}><label>Deliverable URL, IPFS CID, or repository commit<input autoFocus required value={value} onChange={(event) => setValue(event.target.value)} placeholder="ipfs://… or https://…" /></label><div className="form-note">Do not put sensitive files or private keys in this field. Store the evidence itself privately; only the reference/hash is needed here.</div><div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={!value || busy}>{busy ? "Submitting…" : "Submit proof"}</button></div></form></Modal>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><span className="eyebrow">ARCPROOF AGREEMENT</span><h2>{title}</h2><p>{subtitle}</p>{children}</section></div>;
}
