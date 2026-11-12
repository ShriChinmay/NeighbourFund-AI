import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Shell } from '../app/Shell';
import { useProject } from '../features/projects/useProject';
import { money } from '../features/projects/contracts';
import { useSession } from '../features/session/useSession';
import { useFunding } from '../features/funding/useFunding';
import { mayAcceptPlan, parseFeasibilityForm, type FeasibilityResult } from '../features/funding/contracts';
import './projects.css';
import './funding.css';

const initialValues = { households:48,affordablePerHousehold:'100.00',sponsorCash:'0.00',inKind:'0.00',pool:'0.00' };
const readProjectId = () => {try { return localStorage.getItem('nf_project_id') ?? ''; } catch { return ''; }};
function explain(error:unknown){return error instanceof Error ? error.message : 'Request failed';}
const descriptions:Record<FeasibilityResult['verdict'],string> = {
  resident_fundable:'The proposed resident capacity covers the remaining goal.',
  needs_partners:'The current assumptions leave a funding gap. This is not a funded or verified commitment.',
  needs_rescope:'The plan needs revised assumptions and cannot be accepted.',
};

export default function Funding() {
  const [id,setId] = useState(readProjectId);
  const [candidate,setCandidate] = useState(id);
  const [values,setValues] = useState(initialValues);
  const [plan,setPlan] = useState<FeasibilityResult | null>(null);
  const [accepted,setAccepted] = useState(false);
  const [notice,setNotice] = useState('');
  const [inviteCount,setInviteCount] = useState(1);
  const [invites,setInvites] = useState<{id:string;token:string}[]>([]);
  const session=useSession();
  const user=session.current.data;
  const projectQuery=useProject(id,Boolean(user));
  const project=projectQuery.data?.project;
  const funding=useFunding(id,user?.role);
  const canManage=Boolean(project && (user?.role==='admin'||(user?.role==='organiser'&&project.organiserId===user.id)));
  const canAssess=canManage && project?.status !== 'delivering' && project?.status !== 'complete' && project?.status !== 'funding';
  const canAccept=Boolean(plan && canManage && project && !accepted && mayAcceptPlan(plan.verdict,project.status,project.budgets.length>0));
  const latestBudget = project?.budgets.reduce((max,b)=>Math.max(max,b.version),0) ?? 0;
  const latestTotal=project?.budgets.filter(b=>b.version===latestBudget).reduce((total,b)=>total+BigInt(b.approvedMinor),0n) ?? 0n;
  const budgetReady=Boolean(project && latestBudget>0 && latestTotal===BigInt(project.goalMinor));
  async function assess(event:FormEvent){event.preventDefault();setNotice('');setPlan(null);setAccepted(false);try {const response=await funding.assess.mutateAsync(parseFeasibilityForm(values));setPlan(response);setNotice('Assessment saved to the backend. This does not accept a funding plan.');}catch(error){setNotice(explain(error));}}
  async function accept(){if(!plan || !window.confirm('Accept this funding plan? This transitions the project to funding and creates budget slots.'))return;try{await funding.accept.mutateAsync(plan.planId);setAccepted(true);setNotice('Funding plan accepted. The project is now in funding status.');}catch(error){setNotice(explain(error));}}
  async function invite(event:FormEvent){event.preventDefault();setInvites([]);try{const response=await funding.invite.mutateAsync(inviteCount);setInvites(response.invites);setNotice('Invitations created. Copy the tokens now; they are shown only once and are not stored in the browser.');}catch(error){setNotice(explain(error));}}
  return <Shell>
    <p className="nf-overline">PROJECTS / FEASIBILITY</p>
    <h1 className="nf-heading">Funding reality check</h1>
    <p className="nf-muted">Review planned contributions and funding gaps. All amounts are proposed USD values, not collected or verified funds.</p>
    <section className="nf-card">
      <h2>Project</h2>
      <form className="nf-inline" onSubmit={e=>{e.preventDefault();const next=candidate.trim();if(!/^[0-9a-f-]{36}$/i.test(next)){setNotice('Enter a project UUID');return;}localStorage.setItem('nf_project_id',next);setId(next);setPlan(null);setAccepted(false);setInvites([]);setNotice('');}}>
        <label className="nf-grow">Project UUID<input value={candidate} aria-label="Project UUID" onChange={e=>setCandidate(e.target.value)} /></label><button type="submit">Load</button>
      </form>
      {session.current.isPending ? <p>Checking session...</p> : <p>{user ? `${user.displayName} · ${user.role}` : 'Not signed in. Switch to organiser on the Projects page to manage funding.'}</p>}
      {projectQuery.isPending && id && <p>Loading project...</p>}
      {projectQuery.isError && <p role="alert">{explain(projectQuery.error)}</p>}
      {project && <><h3>{project.title}</h3><p>Goal: <strong>{money(project.goalMinor)}</strong> · Status: <strong>{project.status}</strong></p><p>Latest budget: {latestBudget ? `v${latestBudget} · ${money(latestTotal.toString())}`:'Not created'} {budgetReady ? '· matches goal' : '· budget required before acceptance'}</p></>}
      <p><Link to="/projects">Manage budget and milestones</Link></p>
    </section>
    {canAssess && project && <section className="nf-card">
      <h2>Assessment assumptions</h2><p className="nf-muted">Assessment creates a proposed backend funding plan. It does not collect payments or reserve sponsor funds.</p>
      <form className="nf-form" onSubmit={assess}>
        <label>Households<input type="number" min={1} max={100000} required value={values.households} onChange={e=>setValues(v=>({...v,households:Number(e.target.value)}))}/></label>
        {([['affordablePerHousehold','Affordable per household (USD)'],['sponsorCash','Proposed sponsor cash (USD)'],['inKind','Proposed in-kind support (USD)'],['pool','Proposed community pool (USD)']] as const).map(([key,label])=><label key={key}>{label}<input inputMode="decimal" required value={values[key]} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/></label>)}
        <button type="submit" disabled={funding.assess.isPending}>{funding.assess.isPending?'Assessing...':'Run reality check'}</button>
      </form>
    </section>}
    {plan && project && <section className="nf-card" aria-labelledby="result-heading">
      <h2 id="result-heading">Assessment result</h2><p><strong>Verdict:</strong> {plan.verdict.replaceAll('_',' ')}</p><p>{descriptions[plan.verdict]}</p>
      <div className="nf-funding-metrics">
        <div><small>Required from residents</small><strong>{money(plan.residentRequiredMinor)}</strong></div>
        <div><small>Per household</small><strong>{money(plan.perHouseholdMinor)}</strong></div>
        <div><small>Resident capacity</small><strong>{money(plan.residentCapacityMinor)}</strong></div>
        <div><small>Funding gap</small><strong>{money(plan.gapMinor)}</strong></div>
      </div>
      <p className="nf-muted">Assessment ID: <code>{plan.planId}</code>. This is a proposal, not a verified or collected contribution.</p>
      {!budgetReady && <p role="alert">A complete budget matching the goal is required before accepting a plan.</p>}
      <button type="button" className="nf-funding-action" disabled={!canAccept || !budgetReady || funding.accept.isPending} onClick={accept}>{accepted?'Accepted':funding.accept.isPending?'Accepting...':'Accept funding plan'}</button>
      {accepted && <p role="status">Plan accepted. Funding slots were generated by the backend.</p>}
      {plan.verdict==='needs_rescope' && <p>Revise the assumptions and run another assessment to continue.</p>}
    </section>}
    {project && <section className="nf-card">
      <h2>Budget funding slots</h2>
      {funding.slots.isPending?<p>Loading slots...</p>:funding.slots.isError?<p role="alert">{explain(funding.slots.error)}</p>:funding.slots.data?.slots.length ? <ul>{funding.slots.data.slots.map(slot=><li key={slot.id}>{slot.label}: {money(slot.amountMinor)} · {slot.status}</li>)}</ul> : <p>No funding slots created yet. Accepting a valid plan creates slots for the latest budget version.</p>}
    </section>}
    {project && canManage && project.status==='funding' && <section className="nf-card">
      <h2>Household invitations</h2><p className="nf-muted">Invite tokens are sensitive. They appear only after creation and will disappear when leaving this page.</p>
      <form className="nf-inline" onSubmit={invite}><label>Number of households<input type="number" min={1} max={1000} required value={inviteCount} onChange={e=>setInviteCount(Number(e.target.value))}/></label><button disabled={funding.invite.isPending}>Generate invitations</button></form>
      {invites.length>0 && <div role="region" aria-label="New household invites"><h3>Copy these tokens now</h3>{invites.map(item=><p key={item.id}><strong>{item.id}</strong>: <code>{item.token}</code></p>)}</div>}
    </section>}
    {project && ['organiser','reviewer','admin'].includes(user?.role ?? '') && <section className="nf-card">
      <h2>Household pool allocation</h2>
      {funding.pool.isPending?<p>Loading households...</p>:funding.pool.isError?<p role="alert">{explain(funding.pool.error)}</p>:<><p>{funding.pool.data?.coveredCount ?? 0} households covered by the pool.</p>{!funding.pool.data?.households.length && <p>No households invited yet.</p>}{funding.pool.data?.households.map(h=><label className="nf-household" key={h.id}><input type="checkbox" disabled={!canManage || funding.allocate.isPending} checked={h.coveredByPool} onChange={async e=>{try{await funding.allocate.mutateAsync({householdId:h.id,coveredByPool:e.target.checked});setNotice('Pool allocation updated.');}catch(error){setNotice(explain(error));}}}/><span>{h.id} · {h.participating?'Participating':'Not participating'}</span></label>)}</>}
    </section>}
    {notice && <p className="nf-notice" role="status">{notice}</p>}
  </Shell>;
}
