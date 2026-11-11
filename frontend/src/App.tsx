import { useEffect, useState, type FormEvent } from "react";
import { api, demoProjectId, usd, type Feasibility, type Household, type Project, type Role, type Slot, type User } from "./api";
import "./styles.css";

const roles: Role[] = ["organiser", "reviewer", "sponsor", "resident", "admin"];
const initialBudget = [
  { category: "Equipment", description: "Six solar-powered lights", approvedMinor: 360000 },
  { category: "Installation", description: "Mounting and electrical work", approvedMinor: 90000 },
  { category: "Contingency", description: "Additional materials", approvedMinor: 30000 },
];
const initialMilestones = [
  { title: "Purchase six solar lights" }, { title: "Install lights in the community" },
  { title: "Complete inspection and handover" },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("organiser");
  const [projectId, setProjectId] = useState(localStorage.getItem("nf_project_id") || demoProjectId);
  const [project, setProject] = useState<Project | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [coveredCount, setCoveredCount] = useState(0);
  const [feasibility, setFeasibility] = useState<Feasibility | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [communityName, setCommunityName] = useState("Safe Lane Community");
  const [title, setTitle] = useState("Safe Lane Lighting");
  const [description, setDescription] = useState("Install six solar-powered lane lights");
  const [goalDollars, setGoalDollars] = useState("4800");
  const [householdCount, setHouseholdCount] = useState(48);
  const [affordableDollars, setAffordableDollars] = useState("75");
  const [sponsorDollars, setSponsorDollars] = useState("1200");
  const [budgetText, setBudgetText] = useState(JSON.stringify(initialBudget, null, 2));
  const [milestoneText, setMilestoneText] = useState(JSON.stringify(initialMilestones, null, 2));

  async function load(id: string, signedIn = Boolean(user)) {
    if (!id) return;
    const path = signedIn ? `/projects/${id}` : `/projects/${id}/public`;
    const result = await api<{ project: Project }>(path);
    setProject(result.project);
    const slotData = await api<{ slots: Slot[] }>(`/projects/${id}/slots`);
    setSlots(slotData.slots);
    if (signedIn && user && ["organiser", "reviewer", "admin"].includes(user.role)) {
      const pool = await api<{ households: Household[]; coveredCount: number }>(`/projects/${id}/pool`);
      setHouseholds(pool.households); setCoveredCount(pool.coveredCount);
    } else { setHouseholds([]); setCoveredCount(0); }
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await api<{ user: User }>("/me");
        if (active) { setUser(session.user); setRole(session.user.role); }
      } catch { /* No session is expected on first visit. */ }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!projectId) return;
    load(projectId).catch(e => { setProject(null); setSlots([]); setHouseholds([]); setMessage((e as Error).message); });
    // Reload when role or selected project changes.
  }, [projectId, user?.id, user?.role]);
  function chooseProject(id: string) { localStorage.setItem("nf_project_id", id); setProjectId(id); setFeasibility(null); }
  async function run(action: () => Promise<void>, success: string) {
    setBusy(true); setMessage("");
    try { await action(); setMessage(success); }
    catch (error) { setMessage(`Error: ${(error as Error).message}`); }
    finally { setBusy(false); }
  }
  async function switchRole() {
    await run(async () => {
      const result = await api<{ user: User }>("/auth/switch-role", "POST", { role });
      setUser(result.user);
    }, `Switched to ${role}`);
  }
  async function logout() {
    await run(async () => { await api("/auth/logout", "POST"); setUser(null); }, "Signed out");
  }
  async function createProject(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const goalMinor = Math.round(Number(goalDollars) * 100);
      if (!Number.isSafeInteger(goalMinor) || goalMinor <= 0) throw new Error("Enter a valid positive funding goal");
      const result = await api<{ project: Project }>("/projects", "POST", { communityName, title, description, goalMinor });
      chooseProject(result.project.id);
    }, "Project created");
  }
  async function saveBudget() {
    await run(async () => {
      const lines: unknown = JSON.parse(budgetText);
      await api(`/projects/${projectId}/budget`, "POST", { lines });
      await load(projectId);
    }, "Budget saved");
  }
  async function saveMilestones() {
    await run(async () => {
      const milestones: unknown = JSON.parse(milestoneText);
      await api(`/projects/${projectId}/milestones`, "POST", { milestones });
      await load(projectId);
    }, "Milestones saved");
  }
  async function assess() {
    await run(async () => {
      const affordablePerHouseholdMinor = Math.round(Number(affordableDollars) * 100);
      const sponsorCashMinor = Math.round(Number(sponsorDollars) * 100);
      if (![affordablePerHouseholdMinor, sponsorCashMinor].every(v => Number.isSafeInteger(v) && v >= 0)) throw new Error("Enter valid amounts");
      const result = await api<Feasibility>(`/projects/${projectId}/feasibility`, "POST", {
        households: householdCount, affordablePerHouseholdMinor, sponsorCashMinor, inKindMinor: 0, poolMinor: 0,
      });
      setFeasibility(result);
    }, "Feasibility calculated");
  }
  async function accept() {
    if (!feasibility) return;
    await run(async () => {
      await api(`/projects/${projectId}/funding-plan/accept`, "POST", { planId: feasibility.planId });
      setFeasibility({ ...feasibility, accepted: true }); await load(projectId);
    }, "Funding plan accepted");
  }
  async function invite() {
    await run(async () => {
      const result = await api<{ invites: { id: string; token: string }[] }>(`/projects/${projectId}/households/invite`, "POST", { count: householdCount - households.length });
      // Tokens are deliberately not displayed or persisted in this MVP interface.
      await load(projectId);
      setMessage(`${result.invites.length} household invitations generated. Tokens are not retained in the UI.`);
    }, "Invitations generated");
  }
  async function allocate(id: string, coveredByPool: boolean) {
    await run(async () => {
      await api(`/projects/${projectId}/pool/allocate`, "POST", { householdId: id, coveredByPool });
      await load(projectId);
    }, "Pool coverage updated (not a financial reservation)");
  }
  const canEdit = user?.role === "admin" || (user?.role === "organiser" && project !== null);
  const isCreator = user?.role === "organiser" || user?.role === "admin";
  return <div className="shell">
    <header className="topbar"><div className="brand"><span className="brand-icon">N</span><div><strong>NeighbourFund</strong><small>Community impact platform</small></div></div><span className="environment">SANDBOX DEMO</span></header>
    <div className="layout"><aside className="sidebar"><div className="sidebar-label">WORKSPACE</div><div className="nav-item active">◈ &nbsp; Project overview</div><div className="nav-item">▤ &nbsp; Funding & budgets</div><div className="nav-item">◎ &nbsp; Milestones</div><div className="sidebar-note">Payment confirmation and evidence gates will appear after P2/P4 integration.</div></aside>
      <main className="content">
        <div className="heading"><div><p className="eyebrow">COMMUNITY FUNDING / DASHBOARD</p><h1>Make local projects possible.</h1><p className="muted">Plan, fund and track meaningful improvements in your neighbourhood.</p></div></div>
        <section className="card auth"><div><h2>Demo access</h2><p className="muted">Switch roles to explore permission-based workflows.</p></div><div className="auth-controls"><select value={role} onChange={e => setRole(e.target.value as Role)}>{roles.map(r => <option key={r} value={r}>{r}</option>)}</select><button disabled={busy} onClick={switchRole}>Switch role</button>{user && <button className="ghost" disabled={busy} onClick={logout}>Sign out</button>}</div><div className="session">{user ? `Signed in as ${user.displayName} (${user.role})` : "Not signed in"}</div></section>
        <section className="card"><div className="section-head"><div><p className="eyebrow">SELECTED PROJECT</p><h2>Project workspace</h2></div><span className="pill">{project?.status ?? "Not loaded"}</span></div><div className="project-select"><input aria-label="Project UUID" value={projectId} onChange={e => setProjectId(e.target.value)} placeholder="Project UUID"/><button className="ghost" disabled={busy} onClick={() => run(() => load(projectId), "Project refreshed")}>Refresh</button></div>{project ? <><div className="project-summary"><div><h3>{project.title}</h3><p className="muted">{project.communityName} · {project.description}</p></div><div className="big-number">{usd(project.goalMinor)}<small>Funding goal</small></div></div><div className="stats"><div><span>Budget lines</span><strong>{project.budgets.length}</strong></div><div><span>Milestones</span><strong>{project.milestones.length}</strong></div><div><span>Funding slots</span><strong>{slots.length}</strong></div><div><span>Pool-covered households</span><strong>{coveredCount}</strong></div></div></> : <p className="muted">Select a valid project ID to see its details.</p>}</section>
        {isCreator && <section className="card"><div className="section-head"><div><p className="eyebrow">ORGANISER WORKFLOW</p><h2>Create a new project</h2></div></div><form className="form-grid" onSubmit={createProject}><label>Community name<input required value={communityName} onChange={e=>setCommunityName(e.target.value)}/></label><label>Project title<input required value={title} onChange={e=>setTitle(e.target.value)}/></label><label className="full">Description<input value={description} onChange={e=>setDescription(e.target.value)}/></label><label>Goal (USD)<input type="number" min="0.01" step="0.01" required value={goalDollars} onChange={e=>setGoalDollars(e.target.value)}/></label><div className="form-action"><button disabled={busy} type="submit">Create project</button></div></form></section>}
        {project && <section className="two-column"><div className="card"><p className="eyebrow">BUDGET</p><h2>Cost breakdown</h2>{project.budgets.length ? <div className="item-list">{project.budgets.map(b=><div className="item" key={b.id}><span>{b.category}<small>{b.description}</small></span><strong>{usd(b.approvedMinor)}</strong></div>)}</div> : <p className="muted">No budget added.</p>}{canEdit && project.status === "draft" && <><p className="helper">Edit the JSON array to create a new budget version. Amounts are USD cents and must total the project goal.</p><textarea rows={8} value={budgetText} onChange={e=>setBudgetText(e.target.value)}/><button disabled={busy} onClick={saveBudget}>Save budget</button></>}</div><div className="card"><p className="eyebrow">DELIVERY</p><h2>Milestones</h2>{project.milestones.length ? <div className="item-list">{project.milestones.map(m=><div className="item" key={m.id}><span>{m.title}</span><span className="pill">{m.status}</span></div>)}</div> : <p className="muted">No milestones added.</p>}{canEdit && project.status === "draft" && <><p className="helper">Add milestones using the JSON array below.</p><textarea rows={8} value={milestoneText} onChange={e=>setMilestoneText(e.target.value)}/><button disabled={busy} onClick={saveMilestones}>Save milestones</button></>}</div></section>}
        {project && canEdit && project.status === "draft" && <section className="card"><p className="eyebrow">FUNDING INTELLIGENCE</p><h2>Feasibility assessment</h2><p className="muted">Estimate how much each household needs to contribute after planned sponsor support.</p><div className="form-grid"><label>Households<input type="number" min="1" max="100000" value={householdCount} onChange={e=>setHouseholdCount(Number(e.target.value))}/></label><label>Affordable per household (USD)<input type="number" min="0" step="0.01" value={affordableDollars} onChange={e=>setAffordableDollars(e.target.value)}/></label><label>Sponsor contribution (USD)<input type="number" min="0" step="0.01" value={sponsorDollars} onChange={e=>setSponsorDollars(e.target.value)}/></label><div className="form-action"><button disabled={busy} onClick={assess}>Calculate feasibility</button></div></div>{feasibility && <div className="result"><strong>Verdict: {feasibility.verdict.replaceAll("_", " ")}</strong><p>Required per household: {usd(feasibility.perHouseholdMinor)} · Funding gap: {usd(feasibility.gapMinor)}</p><button disabled={busy || feasibility.accepted || feasibility.verdict === "needs_rescope"} onClick={accept}>{feasibility.accepted ? "Plan accepted" : "Accept funding plan"}</button></div>}</section>}
        {project && <section className="card"><p className="eyebrow">FUNDING SLOTS</p><h2>Open budget allocations</h2>{slots.length ? <div className="item-list">{slots.map(s=><div className="item" key={s.id}><span>{s.label}<small>{s.status}</small></span><strong>{usd(s.amountMinor)}</strong></div>)}</div> : <p className="muted">Funding slots appear when a plan is accepted.</p>}</section>}
        {project && user && ["organiser","reviewer","admin"].includes(user.role) && <section className="card"><div className="section-head"><div><p className="eyebrow">HOUSEHOLDS</p><h2>Community pool coverage</h2></div><span className="pill">{coveredCount} covered / {households.length} invited</span></div><p className="muted">Coverage flags are administrative only; they do not reserve actual money.</p>{canEdit && project.status === "funding" && households.length < householdCount && <button disabled={busy} onClick={invite}>Generate {householdCount-households.length} invitations</button>}{households.length > 0 && <div className="household-list">{households.slice(0,48).map((h,i)=><div className="household" key={h.id}><span>Household {i+1}</span><label className="toggle"><input type="checkbox" checked={h.coveredByPool} disabled={!canEdit || busy} onChange={e=>allocate(h.id,e.target.checked)}/> Covered by pool</label></div>)}</div>}</section>}
        {message && <div className={message.startsWith("Error") ? "notice error" : "notice"} role="status">{message}</div>}
        <footer>NeighbourFund AI · Demo environment · USD amounts represent planned allocations unless confirmed by the payment module.</footer>
      </main>
    </div>
  </div>;
}
