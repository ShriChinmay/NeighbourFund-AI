import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Shell } from '../app/Shell';
import { usePublicProject } from '../features/public-projects/usePublicProject';
import { latestBudget,latestBudgetTotal } from '../features/public-projects/contracts';
import { money } from '../features/projects/contracts';
import './public-project.css';

export default function PublicProject(){
 const {id=''}=useParams();const {project,slots,validId}=usePublicProject(id);const [copied,setCopied]=useState(false);
 const data=project.data?.project;const budget=data?latestBudget(data):null;
 const share=()=>{void navigator.clipboard?.writeText(window.location.href).then(()=>setCopied(true)).catch(()=>setCopied(false));};
 return <Shell><p className="nf-overline">COMMUNITY / PUBLIC PROJECT</p><h1 className="nf-heading">Project transparency</h1><p className="nf-muted">Public project information from the backend. Budget and funding slots are planned allocations, not collected or verified payments.</p>
 {!validId?<section className="nf-card" role="alert">Invalid project link. <Link to="/projects">Return to projects</Link>.</section>:<>
 {project.isPending&&<section className="nf-card">Loading project...</section>}
 {project.isError&&<section className="nf-card" role="alert">Unable to load this project: {project.error.message}</section>}
 {data&&<>
 <section className="nf-card nf-public-hero"><div><p className="nf-overline">{data.communityName}</p><h2>{data.title}</h2><p>{data.description||'No description provided.'}</p><p><strong>Status:</strong> {data.status.replaceAll('_',' ')}</p></div><div className="nf-public-goal"><span>Project goal</span><strong>{money(data.goalMinor)}</strong><small>Target amount · not money raised</small></div></section>
 <div className="nf-public-actions"><button type="button" onClick={share}>{copied?'Link copied':'Copy public link'}</button><Link to="/funding">Organiser funding workspace</Link></div>
 <section className="nf-card"><h2>Approved budget allocations</h2>{budget&&budget.version>0?<><p className="nf-muted">Latest budget version: {budget.version}. Earlier versions are not included in this total.</p><div className="nf-public-list">{budget.lines.map(line=><div key={line.id}><div><strong>{line.category}</strong>{line.description&&<p>{line.description}</p>}</div><strong>{money(line.approvedMinor)}</strong></div>)}</div><p><strong>Latest budget total:</strong> {money(latestBudgetTotal(data))}</p></>:<p>No budget version has been published yet.</p>}</section>
 <section className="nf-card"><h2>Project milestones</h2>{data.milestones.length?<div className="nf-public-list">{data.milestones.map(m=><div key={m.id}><div><strong>{m.title}</strong><p>Status: {m.status}</p></div><span>{m.dueDate?new Date(m.dueDate).toLocaleDateString():'No due date'}</span></div>)}</div>:<p>No milestones published yet.</p>}</section>
 <section className="nf-card"><h2>Sponsorship opportunities</h2><p className="nf-muted">These are budget funding slots, not verified outstanding balances or a record of sponsor commitments.</p>{slots.isPending?<p>Loading funding slots...</p>:slots.isError?<p role="alert">Could not load funding slots: {slots.error.message}</p>:slots.data?.slots.length?<div className="nf-public-slots">{slots.data.slots.map(slot=><article key={slot.id}><span className="nf-public-status">{slot.status}</span><h3>{slot.label}</h3><strong>{money(slot.amountMinor)}</strong><p>Budget allocation · not a payment request</p><Link to={`/sponsor/${id}`}>Review sponsorship</Link></article>)}</div>:<p>No funding slots are available yet. The organiser must accept a valid funding plan first.</p>}</section>
 <section className="nf-card"><h2>Resident contributions</h2><p>Residents can review a proposed contribution amount. Payment checkout is not connected to the backend yet. No payment can be initiated, and the project goal must not be interpreted as collected funds.</p><Link to={`/contribute/${id}`}>Review resident contribution</Link></section>
 </>}
 </>}
 </Shell>;
}
